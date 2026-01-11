import { NextRequest, NextResponse } from 'next/server';
import { sendChatMessage, OracleCommands } from '@/services/coordinatorChat';

interface PXSession {
    qc_sid: number;
    qc_serial: number;
    sql_id: string;
    username: string;
    requested_dop: number;
    actual_dop: number;
    servers_allocated: number;
    servers_busy: number;
    elapsed_seconds: number;
    status: 'ACTIVE' | 'IDLE' | 'DONE';
    is_downgraded?: boolean;
}

interface DOPDowngrade {
    timestamp: string;
    sql_id: string;
    requested_dop: number;
    actual_dop: number;
    reason: string;
    qc_sid: number;
}

interface PXData {
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    max_parallel_servers: number;
    servers_in_use: number;
    servers_available: number;
    active_px_sessions: number;
    sessions: PXSession[];
    recent_downgrades: DOPDowngrade[];
    dop_efficiency_percent: number;
    database?: string;
}

/**
 * Parse coordinator response into PXSession format
 * Handles various response formats from the MCP tools
 */
function parsePxSessions(data: unknown): PXSession[] {
    try {
        const response = data as Record<string, unknown>;

        // Handle various response formats from coordinator
        const sessions = (response.sessions || response.px_sessions || response.parallel_sessions || []) as Array<Record<string, unknown>>;

        return sessions.map(session => {
            const requestedDop = Number(
                session.requested_dop || session.REQUESTED_DOP || session.req_dop || 1
            );
            const actualDop = Number(
                session.actual_dop || session.ACTUAL_DOP || session.degree || 1
            );

            return {
                qc_sid: Number(session.qc_sid || session.QC_SID || session.sid || 0),
                qc_serial: Number(session.qc_serial || session.QC_SERIAL || session.serial || 0),
                sql_id: String(session.sql_id || session.SQL_ID || ''),
                username: String(session.username || session.USERNAME || session.parsing_schema_name || 'UNKNOWN'),
                requested_dop: requestedDop,
                actual_dop: actualDop,
                servers_allocated: Number(session.servers_allocated || session.SERVERS_ALLOCATED || session.px_servers || 0),
                servers_busy: Number(session.servers_busy || session.SERVERS_BUSY || 0),
                elapsed_seconds: Number(session.elapsed_seconds || session.ELAPSED_SECONDS || session.elapsed_time_secs || 0),
                status: normalizeStatus(session.status || session.STATUS),
                is_downgraded: actualDop < requestedDop,
            };
        });
    } catch {
        return [];
    }
}

/**
 * Parse coordinator response for DOP downgrades
 */
function parseDopDowngrades(data: unknown): DOPDowngrade[] {
    try {
        const response = data as Record<string, unknown>;

        const downgrades = (response.downgrades || response.recent_downgrades || response.dop_downgrades || []) as Array<Record<string, unknown>>;

        return downgrades.map(d => ({
            timestamp: String(d.timestamp || d.TIMESTAMP || new Date().toISOString()),
            sql_id: String(d.sql_id || d.SQL_ID || ''),
            requested_dop: Number(d.requested_dop || d.REQUESTED_DOP || 0),
            actual_dop: Number(d.actual_dop || d.ACTUAL_DOP || 0),
            reason: String(d.reason || d.REASON || d.downgrade_reason || 'Unknown'),
            qc_sid: Number(d.qc_sid || d.QC_SID || 0),
        }));
    } catch {
        return [];
    }
}

/**
 * Parse system-level parallelism stats
 */
function parseSystemStats(data: unknown): Pick<PXData, 'max_parallel_servers' | 'servers_in_use' | 'servers_available'> | null {
    try {
        const response = data as Record<string, unknown>;
        const stats = (response.system_stats || response.parallel_stats || response) as Record<string, unknown>;

        if (stats.max_parallel_servers !== undefined || stats.servers_in_use !== undefined) {
            const maxServers = Number(stats.max_parallel_servers || stats.MAX_PARALLEL_SERVERS || stats.parallel_max_servers || 128);
            const inUse = Number(stats.servers_in_use || stats.SERVERS_IN_USE || stats.parallel_servers_busy || 0);
            return {
                max_parallel_servers: maxServers,
                servers_in_use: inUse,
                servers_available: maxServers - inUse,
            };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Normalize status values to expected enum
 */
function normalizeStatus(status: unknown): 'ACTIVE' | 'IDLE' | 'DONE' {
    const statusStr = String(status).toUpperCase();
    if (statusStr.includes('ACTIVE') || statusStr.includes('EXECUTING') || statusStr.includes('RUNNING')) return 'ACTIVE';
    if (statusStr.includes('IDLE') || statusStr.includes('WAITING')) return 'IDLE';
    return 'DONE';
}

/**
 * Calculate DOP efficiency percentage
 * Shows how well the system is achieving requested parallelism
 */
function calculateDopEfficiency(sessions: PXSession[]): number {
    if (sessions.length === 0) return 100;

    let totalRequested = 0;
    let totalActual = 0;

    for (const session of sessions) {
        totalRequested += session.requested_dop;
        totalActual += session.actual_dop;
    }

    if (totalRequested === 0) return 100;
    return Math.round((totalActual / totalRequested) * 100);
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const database = searchParams.get('database') || 'ATPAdi';

    try {
        // Send command to coordinator - queries parallel execution stats
        const command = OracleCommands.checkParallelism(database);
        const response = await sendChatMessage(command, { timeout: 15000 });

        if (response.success && response.data) {
            const sessions = parsePxSessions(response.data);
            const downgrades = parseDopDowngrades(response.data);
            const systemStats = parseSystemStats(response.data);

            // If we got any real data, return it
            if (sessions.length > 0 || systemStats) {
                const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
                const serversInUse = systemStats?.servers_in_use ?? activeSessions.reduce((sum, s) => sum + s.servers_allocated, 0);
                const maxServers = systemStats?.max_parallel_servers ?? 128;

                return NextResponse.json({
                    sessions,
                    recent_downgrades: downgrades.length > 0 ? downgrades : sessions.filter(s => s.is_downgraded).map(s => ({
                        timestamp: new Date().toISOString(),
                        sql_id: s.sql_id,
                        requested_dop: s.requested_dop,
                        actual_dop: s.actual_dop,
                        reason: 'DOP downgrade detected',
                        qc_sid: s.qc_sid,
                    })),
                    max_parallel_servers: maxServers,
                    servers_in_use: serversInUse,
                    servers_available: maxServers - serversInUse,
                    active_px_sessions: activeSessions.length,
                    dop_efficiency_percent: calculateDopEfficiency(activeSessions),
                    status: 'connected',
                    timestamp: new Date().toISOString(),
                    database,
                });
            }
        }

        // If coordinator returned a message (might indicate no PX sessions, not error)
        if (response.error && !response.error.includes('ECONNREFUSED')) {
            return NextResponse.json({
                sessions: [],
                recent_downgrades: [],
                max_parallel_servers: 128,
                servers_in_use: 0,
                servers_available: 128,
                active_px_sessions: 0,
                dop_efficiency_percent: 100,
                status: 'connected',
                timestamp: new Date().toISOString(),
                database,
                message: response.error,
            });
        }

        // Return error status when coordinator is unreachable
        return NextResponse.json({
            sessions: [],
            recent_downgrades: [],
            max_parallel_servers: 0,
            servers_in_use: 0,
            servers_available: 0,
            active_px_sessions: 0,
            dop_efficiency_percent: 0,
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: 'Coordinator unavailable',
        });
    } catch (error) {
        // Return error status on any error
        return NextResponse.json({
            sessions: [],
            recent_downgrades: [],
            max_parallel_servers: 0,
            servers_in_use: 0,
            servers_available: 0,
            active_px_sessions: 0,
            dop_efficiency_percent: 0,
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

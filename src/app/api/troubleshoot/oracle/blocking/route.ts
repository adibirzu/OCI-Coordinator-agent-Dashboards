import { NextRequest, NextResponse } from 'next/server';
import { sendChatMessage, OracleCommands } from '@/services/coordinatorChat';

interface BlockingSession {
    sid: number;
    serial: number;
    inst_id: number;
    username: string;
    sql_id: string | null;
    wait_event: string;
    wait_time_secs: number;
    blocking_session: number | null;
    blocking_instance: number | null;
    level: number;
    is_root: boolean;
}

interface BlockingData {
    sessions: BlockingSession[];
    summary: {
        total_blocked: number;
        root_blockers: number;
        max_wait_time: number;
        affected_users: string[];
    };
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    database?: string;
}

/**
 * Parse coordinator response into BlockingData format
 */
function parseBlockingResponse(data: unknown, database: string): BlockingData | null {
    try {
        // Handle various response formats from the coordinator
        const response = data as Record<string, unknown>;

        // If the response contains structured blocking data
        if (response.root_blockers || response.blocking_sessions || response.sessions) {
            const rootBlockers = (response.root_blockers || []) as Array<Record<string, unknown>>;
            const blockedSessions = (response.blocked_sessions || response.blocking_sessions || []) as Array<Record<string, unknown>>;

            // Convert to our session format
            const sessions: BlockingSession[] = [];

            // Add root blockers
            for (const blocker of rootBlockers) {
                sessions.push({
                    sid: Number(blocker.sid || blocker.SID || 0),
                    serial: Number(blocker.serial || blocker['SERIAL#'] || blocker.serial_number || 0),
                    inst_id: Number(blocker.inst_id || blocker.INST_ID || 1),
                    username: String(blocker.username || blocker.USERNAME || 'UNKNOWN'),
                    sql_id: blocker.sql_id as string || blocker.SQL_ID as string || null,
                    wait_event: String(blocker.wait_event || blocker.WAIT_EVENT || 'SQL*Net message from client'),
                    wait_time_secs: Number(blocker.seconds_in_wait || blocker.SECONDS_IN_WAIT || blocker.wait_time_secs || 0),
                    blocking_session: null,
                    blocking_instance: null,
                    level: 0,
                    is_root: true,
                });
            }

            // Add blocked sessions
            for (const blocked of blockedSessions) {
                sessions.push({
                    sid: Number(blocked.sid || blocked.SID || 0),
                    serial: Number(blocked.serial || blocked['SERIAL#'] || blocked.serial_number || 0),
                    inst_id: Number(blocked.inst_id || blocked.INST_ID || 1),
                    username: String(blocked.username || blocked.USERNAME || 'UNKNOWN'),
                    sql_id: blocked.sql_id as string || blocked.SQL_ID as string || null,
                    wait_event: String(blocked.wait_event || blocked.WAIT_EVENT || 'enq: TX - row lock contention'),
                    wait_time_secs: Number(blocked.seconds_in_wait || blocked.SECONDS_IN_WAIT || blocked.wait_time_secs || 0),
                    blocking_session: Number(blocked.blocking_session || blocked.BLOCKING_SESSION || null),
                    blocking_instance: Number(blocked.blocking_instance || blocked.BLOCKING_INSTANCE || 1),
                    level: 1,
                    is_root: false,
                });
            }

            // Calculate summary
            const users = new Set<string>();
            let maxWait = 0;
            for (const s of sessions) {
                if (!s.is_root) users.add(s.username);
                if (s.wait_time_secs > maxWait) maxWait = s.wait_time_secs;
            }

            return {
                sessions,
                summary: {
                    total_blocked: sessions.filter(s => !s.is_root).length,
                    root_blockers: sessions.filter(s => s.is_root).length,
                    max_wait_time: maxWait,
                    affected_users: Array.from(users),
                },
                status: 'connected',
                timestamp: new Date().toISOString(),
                database,
            };
        }

        // If the response is a message indicating no blocking
        if (response.message && typeof response.message === 'string') {
            const msg = response.message.toLowerCase();
            if (msg.includes('no blocking') || msg.includes('no sessions') || msg.includes('healthy')) {
                return {
                    sessions: [],
                    summary: {
                        total_blocked: 0,
                        root_blockers: 0,
                        max_wait_time: 0,
                        affected_users: [],
                    },
                    status: 'connected',
                    timestamp: new Date().toISOString(),
                    database,
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const database = searchParams.get('database') || 'ATPAdi';

    try {
        // Send command to coordinator
        const command = OracleCommands.checkBlocking(database);
        const response = await sendChatMessage(command, { timeout: 15000 });

        if (response.success && response.data) {
            const blockingData = parseBlockingResponse(response.data, database);
            if (blockingData) {
                return NextResponse.json(blockingData);
            }
        }

        // If coordinator returned an error but is reachable, return empty data
        if (response.error && !response.error.includes('ECONNREFUSED')) {
            return NextResponse.json({
                sessions: [],
                summary: {
                    total_blocked: 0,
                    root_blockers: 0,
                    max_wait_time: 0,
                    affected_users: [],
                },
                status: 'connected',
                timestamp: new Date().toISOString(),
                database,
                message: response.error,
            });
        }

        // Return error status when coordinator is unreachable
        return NextResponse.json({
            sessions: [],
            summary: {
                total_blocked: 0,
                root_blockers: 0,
                max_wait_time: 0,
                affected_users: [],
            },
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: 'Coordinator unavailable',
        });
    } catch (error) {
        // Return error status on any error
        return NextResponse.json({
            sessions: [],
            summary: {
                total_blocked: 0,
                root_blockers: 0,
                max_wait_time: 0,
                affected_users: [],
            },
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

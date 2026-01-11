import { NextRequest, NextResponse } from 'next/server';
import { sendChatMessage, OracleCommands } from '@/services/coordinatorChat';

interface SqlExecution {
    sql_id: string;
    sql_exec_id: number;
    status: 'EXECUTING' | 'DONE' | 'DONE (ERROR)' | 'QUEUED';
    username: string;
    sql_text: string;
    elapsed_time_secs: number;
    cpu_time_secs: number;
    buffer_gets: number;
    disk_reads: number;
    rows_processed: number;
    dop: number;
    px_servers_allocated: number;
    last_refresh_time: string;
    velocity?: number;
    is_hung?: boolean;
}

interface SqlMonitorData {
    executions: SqlExecution[];
    summary: {
        total_executing: number;
        total_hung: number;
        avg_elapsed_time: number;
    };
    status: 'connected' | 'mock' | 'error';
    timestamp: string;
    database?: string;
}

/**
 * Parse coordinator response into SqlExecution format
 * Handles various response formats from the MCP tools
 */
function parseSqlExecutions(data: unknown): SqlExecution[] {
    try {
        const response = data as Record<string, unknown>;

        // Handle various response formats from coordinator
        const executions = (response.executions || response.sql_monitor || response.active_sql || []) as Array<Record<string, unknown>>;

        return executions.map(exec => {
            const elapsedSecs = Number(
                exec.elapsed_time_secs || exec.elapsed_seconds || exec.ELAPSED_TIME || exec.elapsed_time || 0
            );
            const cpuSecs = Number(
                exec.cpu_time_secs || exec.cpu_seconds || exec.CPU_TIME || exec.cpu_time || 0
            );

            // Calculate velocity (rows/sec) if we have elapsed time
            let velocity: number | undefined;
            const rowsProcessed = Number(exec.rows_processed || exec.ROWS_PROCESSED || exec.output_rows || 0);
            if (elapsedSecs > 0 && rowsProcessed > 0) {
                velocity = Math.round(rowsProcessed / elapsedSecs);
            }

            // Detect hung queries - executing for > 10 min with no progress
            const isHung = (
                (exec.status === 'EXECUTING' || exec.STATUS === 'EXECUTING') &&
                elapsedSecs > 600 &&
                velocity !== undefined && velocity < 10
            );

            return {
                sql_id: String(exec.sql_id || exec.SQL_ID || ''),
                sql_exec_id: Number(exec.sql_exec_id || exec.SQL_EXEC_ID || 0),
                status: normalizeStatus(exec.status || exec.STATUS),
                username: String(exec.username || exec.USERNAME || exec.parsing_schema_name || 'UNKNOWN'),
                sql_text: String(exec.sql_text || exec.SQL_TEXT || exec.sql_fulltext || '').slice(0, 500),
                elapsed_time_secs: elapsedSecs,
                cpu_time_secs: cpuSecs,
                buffer_gets: Number(exec.buffer_gets || exec.BUFFER_GETS || 0),
                disk_reads: Number(exec.disk_reads || exec.DISK_READS || exec.physical_read_requests || 0),
                rows_processed: rowsProcessed,
                dop: Number(exec.dop || exec.DOP || exec.degree_of_parallelism || 1),
                px_servers_allocated: Number(exec.px_servers_allocated || exec.PX_SERVERS_ALLOCATED || 0),
                last_refresh_time: String(exec.last_refresh_time || exec.LAST_REFRESH_TIME || new Date().toISOString()),
                velocity,
                is_hung: isHung,
            };
        });
    } catch {
        return [];
    }
}

/**
 * Normalize status values to expected enum
 */
function normalizeStatus(status: unknown): 'EXECUTING' | 'DONE' | 'DONE (ERROR)' | 'QUEUED' {
    const statusStr = String(status).toUpperCase();
    if (statusStr.includes('EXECUTING') || statusStr.includes('RUNNING')) return 'EXECUTING';
    if (statusStr.includes('ERROR') || statusStr.includes('FAILED')) return 'DONE (ERROR)';
    if (statusStr.includes('QUEUED') || statusStr.includes('WAITING')) return 'QUEUED';
    return 'DONE';
}

/**
 * Calculate summary statistics from executions
 */
function calculateSummary(executions: SqlExecution[]): SqlMonitorData['summary'] {
    const executing = executions.filter(e => e.status === 'EXECUTING');
    const hung = executions.filter(e => e.is_hung === true);
    const totalElapsed = executing.reduce((sum, e) => sum + e.elapsed_time_secs, 0);

    return {
        total_executing: executing.length,
        total_hung: hung.length,
        avg_elapsed_time: executing.length > 0 ? Math.round(totalElapsed / executing.length) : 0,
    };
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const database = searchParams.get('database') || 'ATPAdi';

    try {
        // Send command to coordinator - queries v$sql_monitor for active SQL
        const command = OracleCommands.showRunningSQL(database);
        const response = await sendChatMessage(command, { timeout: 15000 });

        if (response.success && response.data) {
            const executions = parseSqlExecutions(response.data);

            if (executions.length > 0) {
                return NextResponse.json({
                    executions,
                    summary: calculateSummary(executions),
                    status: 'connected',
                    timestamp: new Date().toISOString(),
                    database,
                });
            }
        }

        // If coordinator returned a message (might indicate no active SQL, not error)
        if (response.error && !response.error.includes('ECONNREFUSED')) {
            return NextResponse.json({
                executions: [],
                summary: { total_executing: 0, total_hung: 0, avg_elapsed_time: 0 },
                status: 'connected',
                timestamp: new Date().toISOString(),
                database,
                message: response.error,
            });
        }

        // Return error status when coordinator is unreachable
        return NextResponse.json({
            executions: [],
            summary: { total_executing: 0, total_hung: 0, avg_elapsed_time: 0 },
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: 'Coordinator unavailable',
        });
    } catch (error) {
        // Return error status on any error
        return NextResponse.json({
            executions: [],
            summary: { total_executing: 0, total_hung: 0, avg_elapsed_time: 0 },
            status: 'error',
            timestamp: new Date().toISOString(),
            database,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

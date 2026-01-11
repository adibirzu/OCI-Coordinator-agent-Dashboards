import { NextResponse } from 'next/server';
import { getRecentToolCalls, getCoordinatorStatus, ToolCall } from '@/services/coordinatorChat';

interface TerminalData {
    calls: ToolCall[];
    status: 'connected' | 'disconnected' | 'mock';
    mcp_server: string;
    mcp_servers?: Record<string, boolean>;
    tools_count?: number;
}

function getMockData(): TerminalData {
    const now = new Date();
    const makeTimestamp = (offsetSecs: number) => {
        const d = new Date(now.getTime() - offsetSecs * 1000);
        return d.toISOString();
    };

    return {
        status: 'mock',
        mcp_server: 'database-observatory',
        mcp_servers: {
            'database-observatory': false,
            'finopsai': false,
            'oci-security': false,
            'mcp-oci': false,
        },
        tools_count: 0,
        calls: [
            {
                id: 'mock-1',
                timestamp: makeTimestamp(120),
                tool_name: 'oci_dbmgmt_list_databases',
                parameters: { compartment_id: 'ocid1.compartment.oc1...', limit: 50 },
                result: { databases: ['ATPADI', 'DEVDB', 'PRODDB'] },
                status: 'success',
                duration_ms: 234
            },
            {
                id: 'mock-2',
                timestamp: makeTimestamp(90),
                tool_name: 'oci_opsi_get_sql_statistics',
                parameters: { database_id: 'ocid1.autonomousdatabase...', sort_by: 'cpuTimeInSec' },
                result: { sql_count: 15, top_sql_id: 'g8h7f6d5c4b3' },
                status: 'success',
                duration_ms: 456
            },
            {
                id: 'mock-3',
                timestamp: makeTimestamp(60),
                tool_name: 'oci_logan_execute_query',
                parameters: {
                    query: "Severity = 'error' | stats count by 'Log Source'",
                    time_range_minutes: 60
                },
                result: { matches: 23, log_sources: 3 },
                status: 'success',
                duration_ms: 789
            },
            {
                id: 'mock-4',
                timestamp: makeTimestamp(45),
                tool_name: 'oci_dbmgmt_get_awr_report_auto',
                parameters: { managed_database_id: 'ocid1.database...', hours_back: 1 },
                status: 'pending'
            },
            {
                id: 'mock-5',
                timestamp: makeTimestamp(30),
                tool_name: 'oci_opsi_analyze_cpu',
                parameters: { database_id: 'ocid1.autonomousdatabase...', hours_back: 24 },
                result: null,
                status: 'error',
                duration_ms: 1234,
                error_message: 'Database OCID not found in OPSI enabled databases'
            },
            {
                id: 'mock-6',
                timestamp: makeTimestamp(15),
                tool_name: 'oci_cost_by_compartment',
                parameters: { tenancy_ocid: 'ocid1.tenancy...', time_start: '2024-01-01', time_end: '2024-01-31' },
                result: { total_cost: 1234.56, compartments: 5 },
                status: 'success',
                duration_ms: 567
            },
            {
                id: 'mock-7',
                timestamp: makeTimestamp(5),
                tool_name: 'oci_security_cloudguard_list_problems',
                parameters: { compartment_id: 'ocid1.compartment...', severity: 'HIGH' },
                result: { problems: 3, critical: 1, high: 2 },
                status: 'success',
                duration_ms: 312
            }
        ]
    };
}

/**
 * Identify primary MCP server from available servers
 */
function getPrimaryMcpServer(servers: Record<string, boolean>): string {
    // Priority order for display
    const priority = ['database-observatory', 'finopsai', 'oci-security', 'mcp-oci', 'oci-logan'];

    for (const server of priority) {
        if (servers[server]) return server;
    }

    // Return first available or default
    const available = Object.entries(servers).find(([, active]) => active);
    return available ? available[0] : 'database-observatory';
}

export async function GET() {
    try {
        // Fetch both tool calls and coordinator status in parallel
        const [toolCalls, coordinatorStatus] = await Promise.all([
            getRecentToolCalls(100),
            getCoordinatorStatus()
        ]);

        // If coordinator is running and we got data
        if (coordinatorStatus.status === 'running') {
            return NextResponse.json({
                calls: toolCalls,
                status: 'connected',
                mcp_server: getPrimaryMcpServer(coordinatorStatus.mcp_servers),
                mcp_servers: coordinatorStatus.mcp_servers,
                tools_count: coordinatorStatus.tools_count,
            });
        }

        // If we have tool calls but coordinator status failed
        if (toolCalls.length > 0) {
            return NextResponse.json({
                calls: toolCalls,
                status: 'connected',
                mcp_server: 'unknown',
                mcp_servers: {},
                tools_count: 0,
            });
        }

        // Return mock data when coordinator is offline
        return NextResponse.json(getMockData());
    } catch {
        // Return mock data on any error
        return NextResponse.json(getMockData());
    }
}

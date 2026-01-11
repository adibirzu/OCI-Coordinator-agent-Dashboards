import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

// Static tools configuration based on MCP server capabilities
const STATIC_TOOLS = [
    // Database Observatory MCP Tools
    { name: 'oci_opsi_get_fleet_summary', mcp_server: 'database-observatory', category: 'database', description: 'Get summary of all monitored databases in the fleet' },
    { name: 'oci_opsi_search_databases', mcp_server: 'database-observatory', category: 'database', description: 'Search for databases by name, compartment, or type' },
    { name: 'oci_opsi_analyze_cpu', mcp_server: 'database-observatory', category: 'performance', description: 'Analyze CPU usage trends for a database' },
    { name: 'oci_opsi_analyze_memory', mcp_server: 'database-observatory', category: 'performance', description: 'Analyze memory usage trends for a database' },
    { name: 'oci_opsi_analyze_io', mcp_server: 'database-observatory', category: 'performance', description: 'Analyze I/O throughput trends for a database' },
    { name: 'oci_opsi_get_sql_statistics', mcp_server: 'database-observatory', category: 'sql', description: 'Get top SQL statistics by CPU, elapsed time, or executions' },
    { name: 'oci_opsi_get_sql_insights', mcp_server: 'database-observatory', category: 'sql', description: 'Get SQL insights including degraded and variant SQL' },
    { name: 'oci_opsi_get_addm_recommendations', mcp_server: 'database-observatory', category: 'tuning', description: 'Get ADDM recommendations for performance tuning' },
    { name: 'oci_dbmgmt_get_awr_report', mcp_server: 'database-observatory', category: 'awr', description: 'Generate AWR report for a managed database' },
    { name: 'oci_dbmgmt_list_databases', mcp_server: 'database-observatory', category: 'database', description: 'List databases registered in OCI Database Management' },

    // OCI Logging Analytics MCP Tools
    { name: 'oci_logan_execute_query', mcp_server: 'oci-logan', category: 'logs', description: 'Execute a Logging Analytics query' },
    { name: 'oci_logan_search_security_events', mcp_server: 'oci-logan', category: 'security', description: 'Search for security events using natural language' },
    { name: 'oci_logan_get_mitre_techniques', mcp_server: 'oci-logan', category: 'security', description: 'Search for MITRE ATT&CK techniques in logs' },
    { name: 'oci_logan_analyze_ip_activity', mcp_server: 'oci-logan', category: 'network', description: 'Analyze activity for specific IP addresses' },
    { name: 'oci_logan_list_log_sources', mcp_server: 'oci-logan', category: 'logs', description: 'List available log sources in Logging Analytics' },
    { name: 'oci_logan_list_dashboards', mcp_server: 'oci-logan', category: 'dashboards', description: 'List OCI dashboards from the tenant' },
    { name: 'oci_logan_execute_advanced_analytics', mcp_server: 'oci-logan', category: 'analytics', description: 'Execute advanced analytics queries (cluster, link, nlp)' },
    { name: 'oci_logan_correlation_analysis', mcp_server: 'oci-logan', category: 'analytics', description: 'Perform correlation analysis across log fields' },

    // OCI Security MCP Tools
    { name: 'oci_security_cloudguard_list_problems', mcp_server: 'oci-security', category: 'security', description: 'List Cloud Guard security problems' },
    { name: 'oci_security_cloudguard_get_security_score', mcp_server: 'oci-security', category: 'security', description: 'Get Cloud Guard security score for a compartment' },
    { name: 'oci_security_vss_list_host_scans', mcp_server: 'oci-security', category: 'vulnerability', description: 'List host vulnerability scan results' },
    { name: 'oci_security_vss_list_vulnerabilities', mcp_server: 'oci-security', category: 'vulnerability', description: 'List vulnerabilities found in a scan' },
    { name: 'oci_security_bastion_list', mcp_server: 'oci-security', category: 'access', description: 'List bastions in a compartment' },
    { name: 'oci_security_datasafe_list_assessments', mcp_server: 'oci-security', category: 'database', description: 'List security assessments' },
    { name: 'oci_security_waf_list_firewalls', mcp_server: 'oci-security', category: 'network', description: 'List Web Application Firewalls' },
    { name: 'oci_security_audit_list_events', mcp_server: 'oci-security', category: 'audit', description: 'List audit events for a compartment' },

    // FinOps AI MCP Tools
    { name: 'oci_cost_by_compartment', mcp_server: 'finopsai', category: 'cost', description: 'Analyze daily costs grouped by compartment and service' },
    { name: 'oci_cost_service_drilldown', mcp_server: 'finopsai', category: 'cost', description: 'Get top services by cost with compartment breakdown' },
    { name: 'oci_cost_monthly_trend', mcp_server: 'finopsai', category: 'cost', description: 'Month-over-month trend with forecast and budget variance' },
    { name: 'oci_cost_spikes', mcp_server: 'finopsai', category: 'anomaly', description: 'Find top day-over-day cost spikes and explain' },
    { name: 'finops_detect_anomalies', mcp_server: 'finopsai', category: 'anomaly', description: 'Detect cost anomalies across cloud providers' },
    { name: 'finops_list_commitments', mcp_server: 'finopsai', category: 'commitments', description: 'List all commitments across cloud providers' },
    { name: 'finops_rightsizing', mcp_server: 'finopsai', category: 'optimization', description: 'Get rightsizing recommendations for compute or storage' },
    { name: 'oci_cost_database_drilldown', mcp_server: 'finopsai', category: 'cost', description: 'Get detailed cost breakdown for all database services' },

    // OCI Core MCP Tools
    { name: 'oci_compute_list_instances', mcp_server: 'mcp-oci', category: 'compute', description: 'List compute instances in a compartment' },
    { name: 'oci_compute_start_instance', mcp_server: 'mcp-oci', category: 'compute', description: 'Start a stopped compute instance' },
    { name: 'oci_compute_stop_instance', mcp_server: 'mcp-oci', category: 'compute', description: 'Stop a running compute instance' },
    { name: 'oci_database_list_autonomous', mcp_server: 'mcp-oci', category: 'database', description: 'List Autonomous Databases in a compartment' },
    { name: 'oci_database_start_autonomous', mcp_server: 'mcp-oci', category: 'database', description: 'Start a stopped Autonomous Database' },
    { name: 'oci_network_list_vcns', mcp_server: 'mcp-oci', category: 'network', description: 'List Virtual Cloud Networks (VCNs) in a compartment' },
    { name: 'oci_network_analyze_security', mcp_server: 'mcp-oci', category: 'security', description: 'Analyze security rules for potential risks' },
    { name: 'oci_observability_list_alarms', mcp_server: 'mcp-oci', category: 'monitoring', description: 'List monitoring alarms in a compartment' },
    { name: 'oci_observability_execute_log_query', mcp_server: 'mcp-oci', category: 'logs', description: 'Execute a Log Analytics query' },
    { name: 'oci_skill_troubleshoot_instance', mcp_server: 'mcp-oci', category: 'troubleshooting', description: 'Perform comprehensive health check on a compute instance' }
];

// Cache for coordinator tools
interface CacheEntry {
    data: any;
    timestamp: number;
}
let toolsCache: CacheEntry | null = null;
const CACHE_TTL_MS = 300000; // 5 minute cache for tools

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Check cache first
    if (toolsCache && Date.now() - toolsCache.timestamp < CACHE_TTL_MS) {
        const tools = toolsCache.data.tools.slice(0, limit);
        return NextResponse.json({
            tools,
            total: toolsCache.data.total,
            cached: true,
            source: toolsCache.data.source
        });
    }

    try {
        const res = await fetch(`${COORDINATOR_URL}/tools?limit=${limit}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) {
            return NextResponse.json({
                tools: STATIC_TOOLS.slice(0, limit),
                total: STATIC_TOOLS.length,
                source: 'static'
            });
        }

        const data = await res.json();

        // Cache coordinator response
        toolsCache = {
            data: { ...data, source: 'coordinator' },
            timestamp: Date.now()
        };

        return NextResponse.json({
            ...data,
            source: 'coordinator'
        });
    } catch {
        // Connection refused is expected when backend is down
        // Return rich static tools instead of empty array
        return NextResponse.json({
            tools: STATIC_TOOLS.slice(0, limit),
            total: STATIC_TOOLS.length,
            source: 'static',
            message: 'Coordinator unavailable, using static tool configuration'
        });
    }
}

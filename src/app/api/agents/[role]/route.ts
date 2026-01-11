import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

// Static agents configuration - same as parent route
const STATIC_AGENTS: Record<string, any> = {
    'db-troubleshoot': {
        id: 'db-troubleshoot',
        role: 'db-troubleshoot',
        name: 'Database Troubleshoot Agent',
        status: 'available',
        description: 'Diagnoses database performance issues using OPSI and Database Management. Provides AWR analysis, SQL tuning recommendations, and performance insights.',
        capabilities: [
            'AWR report analysis',
            'SQL tuning recommendations',
            'Wait event analysis',
            'Performance trend detection',
            'ADDM recommendations'
        ],
        skills: [
            'Generate AWR Report',
            'Analyze Top SQL',
            'Detect Performance Anomalies',
            'Review Wait Events',
            'Compare Performance Periods'
        ],
        mcp_servers: ['database-observatory', 'oci-logan'],
        mcp_tools: [
            'oci_dbmgmt_get_awr_report',
            'oci_dbmgmt_get_awr_report_auto',
            'oci_dbmgmt_summarize_awr_wait_events',
            'oci_dbmgmt_summarize_awr_cpu',
            'oci_opsi_get_sql_statistics',
            'oci_opsi_analyze_cpu',
            'oci_opsi_get_addm_recommendations'
        ],
        tools_count: 15
    },
    'log-analytics': {
        id: 'log-analytics',
        role: 'log-analytics',
        name: 'Log Analytics Agent',
        status: 'available',
        description: 'Analyzes logs using OCI Logging Analytics. Performs pattern detection, anomaly identification, and security event correlation.',
        capabilities: [
            'Log search and filtering',
            'Pattern detection',
            'Anomaly identification',
            'Log correlation',
            'Dashboard management'
        ],
        skills: [
            'Execute Logan Query',
            'Search Security Events',
            'Detect Log Anomalies',
            'Analyze IP Activity',
            'Get MITRE Techniques'
        ],
        mcp_servers: ['oci-logan'],
        mcp_tools: [
            'oci_logan_execute_query',
            'oci_logan_search_security_events',
            'oci_logan_get_mitre_techniques',
            'oci_logan_analyze_ip_activity',
            'oci_logan_detect_anomalies',
            'oci_logan_get_summary'
        ],
        tools_count: 35
    },
    'security-threat': {
        id: 'security-threat',
        role: 'security-threat',
        name: 'Security Threat Agent',
        status: 'available',
        description: 'Detects security threats using Cloud Guard and Security services. Maps findings to MITRE ATT&CK framework and provides remediation guidance.',
        capabilities: [
            'Threat detection',
            'MITRE ATT&CK mapping',
            'Vulnerability scanning',
            'Security posture assessment',
            'Compliance monitoring'
        ],
        skills: [
            'List Cloud Guard Problems',
            'Get Security Score',
            'Scan Vulnerabilities',
            'Review Security Zones',
            'Audit Access Policies'
        ],
        mcp_servers: ['oci-security', 'oci-logan'],
        mcp_tools: [
            'oci_security_cloudguard_list_problems',
            'oci_security_cloudguard_get_security_score',
            'oci_security_vss_list_host_scans',
            'oci_security_datasafe_list_assessments',
            'oci_security_audit_list_events'
        ],
        tools_count: 45
    },
    'finops': {
        id: 'finops',
        role: 'finops',
        name: 'FinOps Agent',
        status: 'available',
        description: 'Analyzes cloud costs and provides optimization recommendations. Tracks spending trends, detects anomalies, and suggests rightsizing opportunities.',
        capabilities: [
            'Cost analysis by compartment',
            'Cost trend forecasting',
            'Anomaly detection',
            'Rightsizing recommendations',
            'Budget monitoring'
        ],
        skills: [
            'Analyze Cost by Compartment',
            'Detect Cost Anomalies',
            'Get Monthly Trend',
            'Find Rightsizing Opportunities',
            'Compare Cost Periods'
        ],
        mcp_servers: ['finopsai', 'mcp-oci'],
        mcp_tools: [
            'oci_cost_by_compartment',
            'oci_cost_service_drilldown',
            'oci_cost_monthly_trend',
            'oci_cost_spikes',
            'finops_rightsizing',
            'finops_detect_anomalies'
        ],
        tools_count: 30
    },
    'infrastructure': {
        id: 'infrastructure',
        role: 'infrastructure',
        name: 'Infrastructure Agent',
        status: 'available',
        description: 'Manages and monitors OCI compute, network, and database resources. Provides health checks, instance management, and troubleshooting capabilities.',
        capabilities: [
            'Instance management',
            'Network configuration',
            'Database operations',
            'Resource monitoring',
            'Health checks'
        ],
        skills: [
            'List Compute Instances',
            'Troubleshoot Instance',
            'Check Network Security',
            'Monitor Database Health',
            'Get Resource Metrics'
        ],
        mcp_servers: ['mcp-oci'],
        mcp_tools: [
            'oci_compute_list_instances',
            'oci_compute_get_instance',
            'oci_skill_troubleshoot_instance',
            'oci_network_list_vcns',
            'oci_network_analyze_security',
            'oci_database_list_autonomous',
            'oci_observability_get_instance_metrics'
        ],
        tools_count: 50
    }
};

// Map common URL patterns to agent IDs
function resolveAgentId(role: string): string | null {
    // Direct match
    if (STATIC_AGENTS[role]) return role;

    // Try removing '-agent' suffix
    const withoutSuffix = role.replace(/-agent$/, '');
    if (STATIC_AGENTS[withoutSuffix]) return withoutSuffix;

    // Try common variations
    const variations: Record<string, string> = {
        'database': 'db-troubleshoot',
        'database-troubleshoot': 'db-troubleshoot',
        'db': 'db-troubleshoot',
        'logs': 'log-analytics',
        'logging': 'log-analytics',
        'logan': 'log-analytics',
        'security': 'security-threat',
        'threat': 'security-threat',
        'cost': 'finops',
        'finance': 'finops',
        'infra': 'infrastructure',
        'compute': 'infrastructure'
    };

    return variations[withoutSuffix] || variations[role] || null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ role: string }> }
) {
    const { role } = await params;

    // First try coordinator
    try {
        const res = await fetch(`${COORDINATOR_URL}/agents/${role}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000)
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({
                ...data,
                source: 'coordinator'
            });
        }
    } catch {
        // Coordinator unavailable, use static data
    }

    // Fallback to static agents
    const agentId = resolveAgentId(role);

    if (agentId && STATIC_AGENTS[agentId]) {
        return NextResponse.json({
            ...STATIC_AGENTS[agentId],
            source: 'static'
        });
    }

    // Agent not found
    return NextResponse.json({
        error: 'Agent not found',
        available_agents: Object.keys(STATIC_AGENTS)
    }, { status: 404 });
}

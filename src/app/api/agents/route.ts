import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

// Static agents configuration based on oci-coordinator architecture
const STATIC_AGENTS = [
    {
        id: 'db-troubleshoot',
        name: 'Database Troubleshoot Agent',
        status: 'available',
        description: 'Diagnoses database performance issues using OPSI and Database Management',
        capabilities: [
            'AWR report analysis',
            'SQL tuning recommendations',
            'Wait event analysis',
            'Performance trend detection',
            'ADDM recommendations'
        ],
        mcp_servers: ['database-observatory', 'oci-logan'],
        tools_count: 15
    },
    {
        id: 'log-analytics',
        name: 'Log Analytics Agent',
        status: 'available',
        description: 'Analyzes logs using OCI Logging Analytics',
        capabilities: [
            'Log search and filtering',
            'Pattern detection',
            'Anomaly identification',
            'Log correlation',
            'Dashboard management'
        ],
        mcp_servers: ['oci-logan'],
        tools_count: 35
    },
    {
        id: 'security-threat',
        name: 'Security Threat Agent',
        status: 'available',
        description: 'Detects security threats using Cloud Guard and Security services',
        capabilities: [
            'Threat detection',
            'MITRE ATT&CK mapping',
            'Vulnerability scanning',
            'Security posture assessment',
            'Compliance monitoring'
        ],
        mcp_servers: ['oci-security', 'oci-logan'],
        tools_count: 45
    },
    {
        id: 'finops',
        name: 'FinOps Agent',
        status: 'available',
        description: 'Analyzes cloud costs and provides optimization recommendations',
        capabilities: [
            'Cost analysis by compartment',
            'Cost trend forecasting',
            'Anomaly detection',
            'Rightsizing recommendations',
            'Budget monitoring'
        ],
        mcp_servers: ['finopsai', 'mcp-oci'],
        tools_count: 30
    },
    {
        id: 'infrastructure',
        name: 'Infrastructure Agent',
        status: 'available',
        description: 'Manages and monitors OCI compute, network, and database resources',
        capabilities: [
            'Instance management',
            'Network configuration',
            'Database operations',
            'Resource monitoring',
            'Health checks'
        ],
        mcp_servers: ['mcp-oci'],
        tools_count: 50
    }
];

// Cache for coordinator agents
interface CacheEntry {
    data: any;
    timestamp: number;
}
let agentsCache: CacheEntry | null = null;
const CACHE_TTL_MS = 300000; // 5 minute cache for agents

export async function GET() {
    // Check cache first
    if (agentsCache && Date.now() - agentsCache.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
            ...agentsCache.data,
            cached: true
        });
    }

    try {
        const res = await fetch(`${COORDINATOR_URL}/agents`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) {
            return NextResponse.json({
                agents: STATIC_AGENTS,
                total: STATIC_AGENTS.length,
                source: 'static'
            });
        }

        const data = await res.json();

        // Cache coordinator response
        agentsCache = {
            data: { ...data, source: 'coordinator' },
            timestamp: Date.now()
        };

        return NextResponse.json({
            ...data,
            source: 'coordinator'
        });
    } catch {
        // Connection refused is expected when backend is down
        // Return rich static agents instead of empty array
        return NextResponse.json({
            agents: STATIC_AGENTS,
            total: STATIC_AGENTS.length,
            source: 'static',
            message: 'Coordinator unavailable, using static agent configuration'
        });
    }
}

import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

// Static configuration based on oci-coordinator architecture
const STATIC_STATUS = {
    status: 'standalone',
    uptime_seconds: 0,
    mode: 'direct-oci',
    agents: {
        'db-troubleshoot': {
            name: 'Database Troubleshoot Agent',
            status: 'available',
            description: 'Diagnoses database performance issues using OPSI and Database Management'
        },
        'log-analytics': {
            name: 'Log Analytics Agent',
            status: 'available',
            description: 'Analyzes logs using OCI Logging Analytics'
        },
        'security-threat': {
            name: 'Security Threat Agent',
            status: 'available',
            description: 'Detects security threats using Cloud Guard and Security services'
        },
        'finops': {
            name: 'FinOps Agent',
            status: 'available',
            description: 'Analyzes cloud costs and provides optimization recommendations'
        },
        'infrastructure': {
            name: 'Infrastructure Agent',
            status: 'available',
            description: 'Manages and monitors OCI compute, network, and database resources'
        }
    },
    mcp_servers: {
        'database-observatory': {
            name: 'Database Observatory MCP',
            status: 'available',
            tools_count: 45,
            description: 'OCI Database Management, OPSI, and AWR integration'
        },
        'oci-logan': {
            name: 'OCI Logging Analytics MCP',
            status: 'available',
            tools_count: 35,
            description: 'Log Analytics queries, dashboards, and MITRE detection'
        },
        'oci-security': {
            name: 'OCI Security MCP',
            status: 'available',
            tools_count: 40,
            description: 'Cloud Guard, vulnerability scanning, security zones'
        },
        'finopsai': {
            name: 'FinOps AI MCP',
            status: 'available',
            tools_count: 30,
            description: 'Cost analysis, anomaly detection, commitment tracking'
        },
        'mcp-oci': {
            name: 'OCI Core MCP',
            status: 'available',
            tools_count: 50,
            description: 'Compute, networking, database, observability tools'
        }
    },
    source: 'static'
};

// Cache for coordinator status
interface CacheEntry {
    data: any;
    timestamp: number;
}
let statusCache: CacheEntry | null = null;
const CACHE_TTL_MS = 30000; // 30 second cache

export async function GET() {
    // Check cache first
    if (statusCache && Date.now() - statusCache.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
            ...statusCache.data,
            cached: true
        });
    }

    try {
        const res = await fetch(`${COORDINATOR_URL}/status`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) {
            return NextResponse.json(STATIC_STATUS);
        }

        const data = await res.json();

        // Cache coordinator response
        statusCache = {
            data: { ...data, source: 'coordinator' },
            timestamp: Date.now()
        };

        return NextResponse.json({
            ...data,
            source: 'coordinator'
        });
    } catch {
        // Connection refused is expected when backend is down
        // Return rich static status instead of empty object
        return NextResponse.json(STATIC_STATUS);
    }
}

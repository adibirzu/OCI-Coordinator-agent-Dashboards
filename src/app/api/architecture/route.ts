import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

// Static architecture configuration based on oci-coordinator structure
// This defines which MCP servers each agent uses
const STATIC_ARCHITECTURE = {
    agent_mcp_map: {
        'db-troubleshoot': {
            name: 'Database Troubleshoot Agent',
            description: 'Diagnoses database performance issues and provides recommendations',
            mcp_servers: ['database-observatory', 'oci-logan']
        },
        'log-analytics': {
            name: 'Log Analytics Agent',
            description: 'Analyzes logs using OCI Logging Analytics',
            mcp_servers: ['oci-logan']
        },
        'security-threat': {
            name: 'Security Threat Agent',
            description: 'Detects and analyzes security threats',
            mcp_servers: ['oci-security', 'oci-logan']
        },
        'finops': {
            name: 'FinOps Agent',
            description: 'Analyzes cloud costs and provides optimization recommendations',
            mcp_servers: ['finopsai', 'mcp-oci']
        },
        'infrastructure': {
            name: 'Infrastructure Agent',
            description: 'Manages and monitors OCI infrastructure',
            mcp_servers: ['mcp-oci']
        }
    },
    mcp_servers: {
        'database-observatory': {
            name: 'Database Observatory MCP',
            description: 'OCI Database Management and OPSI integration',
            tools_count: 45
        },
        'oci-logan': {
            name: 'OCI Logging Analytics MCP',
            description: 'Log Analytics queries and dashboards',
            tools_count: 35
        },
        'oci-security': {
            name: 'OCI Security MCP',
            description: 'Cloud Guard, vulnerability scanning, security zones',
            tools_count: 40
        },
        'finopsai': {
            name: 'FinOps AI MCP',
            description: 'Cost analysis, anomaly detection, recommendations',
            tools_count: 30
        },
        'mcp-oci': {
            name: 'OCI Core MCP',
            description: 'Compute, networking, database, observability',
            tools_count: 50
        }
    },
    status: 'static'
};

// Simple cache for dynamic architecture data
interface CacheEntry {
    data: any;
    timestamp: number;
}
let architectureCache: CacheEntry | null = null;
const CACHE_TTL_MS = 300000; // 5 minute cache for architecture

export async function GET() {
    // Check cache first
    if (architectureCache && Date.now() - architectureCache.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
            ...architectureCache.data,
            cached: true
        });
    }

    try {
        const res = await fetch(`${COORDINATOR_URL}/architecture`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3000) // 3 second timeout
        });

        if (!res.ok) {
            // Return static architecture with status indicator
            return NextResponse.json({
                ...STATIC_ARCHITECTURE,
                source: 'static',
                message: 'Using static architecture configuration'
            });
        }

        const data = await res.json();

        // Cache the dynamic data
        architectureCache = {
            data: { ...data, source: 'coordinator' },
            timestamp: Date.now()
        };

        return NextResponse.json({
            ...data,
            source: 'coordinator'
        });
    } catch {
        // Connection refused is expected when backend is down
        // Return rich static architecture instead of empty object
        return NextResponse.json({
            ...STATIC_ARCHITECTURE,
            source: 'static',
            message: 'Coordinator unavailable, using static configuration'
        });
    }
}

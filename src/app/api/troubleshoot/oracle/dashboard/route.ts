import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';
const MCP_ORACLE_URL = process.env.MCP_ORACLE_URL || 'http://127.0.0.1:8002';

interface DatabaseStatus {
    name: string;
    status: 'healthy' | 'warning' | 'critical' | 'offline';
    activeSessions: number;
    blockedSessions: number;
    cpuPercent: number;
    waitEvents: number;
    lastCheck: string;
}

interface DashboardData {
    status: 'connected' | 'mock' | 'error';
    databases: DatabaseStatus[];
    totalAlerts: number;
    recentActivity: Array<{
        id: string;
        type: string;
        message: string;
        timestamp: string;
        severity: 'info' | 'warning' | 'error';
    }>;
}

const MOCK_DATA: DashboardData = {
    status: 'mock',
    databases: [
        {
            name: 'PRODDB1',
            status: 'warning',
            activeSessions: 145,
            blockedSessions: 3,
            cpuPercent: 78,
            waitEvents: 12,
            lastCheck: new Date().toISOString()
        },
        {
            name: 'PRODDB2',
            status: 'healthy',
            activeSessions: 89,
            blockedSessions: 0,
            cpuPercent: 42,
            waitEvents: 4,
            lastCheck: new Date().toISOString()
        },
        {
            name: 'DEVDB1',
            status: 'healthy',
            activeSessions: 23,
            blockedSessions: 0,
            cpuPercent: 15,
            waitEvents: 2,
            lastCheck: new Date().toISOString()
        }
    ],
    totalAlerts: 5,
    recentActivity: [
        {
            id: '1',
            type: 'blocking',
            message: 'Blocking chain detected on PRODDB1 (3 sessions)',
            timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
            severity: 'warning'
        },
        {
            id: '2',
            type: 'cpu',
            message: 'CPU utilization above 75% on PRODDB1',
            timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
            severity: 'warning'
        },
        {
            id: '3',
            type: 'longop',
            message: 'Long running query detected (SQL_ID: g8h7f6d5c4)',
            timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
            severity: 'info'
        }
    ]
};

async function safeFetch<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        // Try to fetch from MCP Oracle server first, then coordinator
        const [mcpData, coordData] = await Promise.all([
            safeFetch<DashboardData>(`${MCP_ORACLE_URL}/dashboard`),
            safeFetch<{ oracle_status?: DashboardData }>(`${COORDINATOR_URL}/oracle/status`)
        ]);

        if (mcpData) {
            return NextResponse.json({ ...mcpData, status: 'connected' });
        }

        if (coordData?.oracle_status) {
            return NextResponse.json({ ...coordData.oracle_status, status: 'connected' });
        }

        // Return mock data when no backend available
        return NextResponse.json(MOCK_DATA);
    } catch {
        return NextResponse.json(MOCK_DATA);
    }
}

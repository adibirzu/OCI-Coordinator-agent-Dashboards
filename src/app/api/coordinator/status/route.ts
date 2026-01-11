import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

const OFFLINE_STATUS = {
    status: 'offline',
    uptime_seconds: 0,
    agents: {},
    mcp_servers: {},
    detailed_tools: []
};

export async function GET() {
    const safeFetch = async (url: string) => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return null;
            const text = await res.text();
            return text ? JSON.parse(text) : null;
        } catch {
            return null;
        }
    };

    try {
        const [statusData, toolsData] = await Promise.all([
            safeFetch(`${COORDINATOR_URL}/status`),
            safeFetch(`${COORDINATOR_URL}/tools?limit=100`)
        ]);

        const finalStatus = statusData || {
            status: 'offline',
            uptime_seconds: 0,
            agents: {},
            mcp_servers: {}
        };

        const finalTools = toolsData?.tools || [];

        return NextResponse.json({
            ...finalStatus,
            detailed_tools: finalTools
        });
    } catch {
        // Connection refused is expected when backend is down
        return NextResponse.json(OFFLINE_STATUS);
    }
}

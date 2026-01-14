import { NextResponse } from 'next/server';

// Slack status is served by the Coordinator API (port 3001), not the MCP server (port 8001)
const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

const OFFLINE_STATUS = {
    status: 'disconnected',
    connected: false
};

export async function GET() {
    try {
        const res = await fetch(`${COORDINATOR_API_URL}/slack/status`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json(OFFLINE_STATUS);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        // Connection refused is expected when backend is down
        return NextResponse.json(OFFLINE_STATUS);
    }
}

import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

const OFFLINE_STATUS = {
    status: 'disconnected',
    connected: false
};

export async function GET() {
    try {
        const res = await fetch(`${COORDINATOR_URL}/slack/status`, {
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

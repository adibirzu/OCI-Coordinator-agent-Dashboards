import { NextResponse } from 'next/server';

// Uses port 3001 for logs/chat functionality
const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

const OFFLINE_RESPONSE = {
    logs: [],
    status: 'unavailable'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';

    try {
        const res = await fetch(`${COORDINATOR_API_URL}/logs?limit=${limit}`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json(OFFLINE_RESPONSE);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        // Connection refused is expected when backend is down
        return NextResponse.json(OFFLINE_RESPONSE);
    }
}

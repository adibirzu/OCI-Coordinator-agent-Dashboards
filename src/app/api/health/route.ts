import { NextResponse } from 'next/server';

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';

const OFFLINE_HEALTH = {
    status: 'unhealthy',
    coordinator: 'offline'
};

export async function GET() {
    try {
        const res = await fetch(`${COORDINATOR_URL}/health`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json(OFFLINE_HEALTH);
        }

        const data = await res.json();
        return NextResponse.json({
            status: 'healthy',
            ...data
        });
    } catch {
        // Connection refused is expected when backend is down
        return NextResponse.json(OFFLINE_HEALTH);
    }
}

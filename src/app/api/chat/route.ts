import { NextResponse } from 'next/server';

const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Proxy to Coordinator API
        const res = await fetch(`${COORDINATOR_API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: body.message,
                thread_id: body.thread_id,
                user_id: 'viewapp-user',
                channel: 'viewapp'
            }),
        });

        const data = await res.json();

        // Handle OCA authentication required
        if (res.status === 401) {
            if (data.auth_required && data.auth_url) {
                return NextResponse.json({
                    error: 'authentication_required',
                    auth_url: data.auth_url,
                    message: 'Please login with Oracle SSO to continue'
                }, { status: 401 });
            }
            // Generic auth error
            return NextResponse.json({
                error: 'unauthorized',
                message: data.detail || 'Authentication failed'
            }, { status: 401 });
        }

        if (!res.ok) {
            // If Coordinator is down or errors
            throw new Error(`Coordinator returned ${res.status}: ${data.detail || 'Unknown error'}`);
        }

        return NextResponse.json(data);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Chat Proxy Error:', errorMessage);
        // Return 200 with error info for graceful degradation
        return NextResponse.json({
            success: false,
            error: 'coordinator_unavailable',
            message: 'The coordinator service is currently unavailable. Please ensure the backend is running on port 3001.',
            details: errorMessage
        });
    }
}

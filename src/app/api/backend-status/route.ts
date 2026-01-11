import { NextResponse } from 'next/server';

// Backend service URLs
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:8001';
const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

interface ServiceStatus {
    name: string;
    url: string;
    status: 'online' | 'offline' | 'error';
    latency_ms?: number;
    error?: string;
    details?: Record<string, unknown>;
}

interface BackendStatusResponse {
    overall_status: 'healthy' | 'degraded' | 'offline';
    timestamp: string;
    services: ServiceStatus[];
    summary: {
        total: number;
        online: number;
        offline: number;
    };
}

async function checkService(
    name: string,
    url: string,
    endpoint: string
): Promise<ServiceStatus> {
    const fullUrl = `${url}${endpoint}`;
    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(fullUrl, {
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;

        if (!res.ok) {
            return {
                name,
                url,
                status: 'error',
                latency_ms: latency,
                error: `HTTP ${res.status}: ${res.statusText}`
            };
        }

        // Try to get additional details from the response
        let details: Record<string, unknown> = {};
        try {
            const data = await res.json();
            if (data.status) details.status = data.status;
            if (data.uptime_seconds !== undefined) details.uptime_seconds = data.uptime_seconds;
            if (data.version) details.version = data.version;
        } catch {
            // Response may not be JSON
        }

        return {
            name,
            url,
            status: 'online',
            latency_ms: latency,
            details: Object.keys(details).length > 0 ? details : undefined
        };
    } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
            name,
            url,
            status: 'offline',
            latency_ms: latency,
            error: errorMessage.includes('abort') ? 'Connection timeout' : errorMessage
        };
    }
}

export async function GET() {
    // Check all backend services in parallel
    const serviceChecks = await Promise.all([
        checkService('Coordinator (Status/Health)', COORDINATOR_URL, '/health'),
        checkService('Coordinator API (Logs/Chat)', COORDINATOR_API_URL, '/health'),
    ]);

    // Calculate summary
    const online = serviceChecks.filter(s => s.status === 'online').length;
    const offline = serviceChecks.filter(s => s.status === 'offline').length;
    const total = serviceChecks.length;

    // Determine overall status
    let overall_status: 'healthy' | 'degraded' | 'offline';
    if (online === total) {
        overall_status = 'healthy';
    } else if (online === 0) {
        overall_status = 'offline';
    } else {
        overall_status = 'degraded';
    }

    const response: BackendStatusResponse = {
        overall_status,
        timestamp: new Date().toISOString(),
        services: serviceChecks,
        summary: {
            total,
            online,
            offline
        }
    };

    return NextResponse.json(response);
}

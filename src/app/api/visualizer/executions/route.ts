import { NextResponse } from 'next/server';

const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

/**
 * GET /api/visualizer/executions
 * Proxies to the OCI Coordinator's active executions endpoint
 * Returns currently running workflow executions for live visualization
 */
export async function GET() {
    try {
        const response = await fetch(`${COORDINATOR_API_URL}/visualizer/executions`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(3000),
        });

        if (!response.ok) {
            console.error(`Executions API error: ${response.status}`);
            return NextResponse.json({
                status: 'error',
                executions: [],
                count: 0,
            });
        }

        const data = await response.json();
        return NextResponse.json({
            status: 'ok',
            ...data,
        });
    } catch (error) {
        // Return empty list for graceful degradation
        return NextResponse.json({
            status: 'unavailable',
            executions: [],
            count: 0,
            message: 'Coordinator service unavailable',
        });
    }
}

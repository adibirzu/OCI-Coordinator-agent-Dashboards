import { NextResponse } from 'next/server';
import * as monitoring from 'oci-monitoring';
import { getProvider } from '@/lib/oci-auth';

const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;

export async function GET() {
    if (!COMPARTMENT_ID) {
        return NextResponse.json({
            items: [],
            status: 'pending_config',
            message: 'OCI_COMPARTMENT_ID not configured'
        });
    }

    try {
        const provider = getProvider();
        const client = new monitoring.MonitoringClient({ authenticationDetailsProvider: provider });

        const request: monitoring.requests.SummarizeMetricsDataRequest = {
            compartmentId: COMPARTMENT_ID,
            summarizeMetricsDataDetails: {
                namespace: "oci_computeagent",
                query: "CpuUtilization[1m].mean()",
                startTime: new Date(Date.now() - 3600 * 1000),
                endTime: new Date()
            }
        };

        const response = await client.summarizeMetricsData(request);
        return NextResponse.json({
            items: response.items || [],
            status: 'connected'
        });

    } catch {
        // OCI connection errors are expected when not configured
        return NextResponse.json({
            items: [],
            status: 'error',
            message: 'OCI connection unavailable'
        });
    }
}

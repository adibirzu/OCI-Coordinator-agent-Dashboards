import { NextResponse } from 'next/server';
import * as loggingsearch from 'oci-loggingsearch';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

const LOG_GROUP_ID = process.env.OCI_LOG_GROUP_ID;
// Region must match where the log group is located
const OCI_REGION = process.env.OCI_REGION || 'eu-frankfurt-1';
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;

export async function GET() {
    if (!COMPARTMENT_ID || !LOG_GROUP_ID) {
        return NextResponse.json({
            logs: [],
            status: 'pending_config',
            message: 'Set OCI_COMPARTMENT_ID and OCI_LOG_GROUP_ID to enable live search'
        });
    }

    try {
        const provider = getProvider();
        const searchClient = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: provider });
        // Set region explicitly - must match where log group is located
        searchClient.region = common.Region.fromRegionId(OCI_REGION);

        const oneHourAgo = new Date(Date.now() - 3600 * 1000);
        const now = new Date();

        const searchRequest: loggingsearch.requests.SearchLogsRequest = {
            searchLogsDetails: {
                timeStart: oneHourAgo,
                timeEnd: now,
                // OCI Logging Search uses SQL-like syntax, NOT pipe-delimited Log Analytics syntax
                searchQuery: `search "${LOG_GROUP_ID}"`,
                isReturnFieldInfo: false
            }
        };

        const response = await searchClient.searchLogs(searchRequest);
        return NextResponse.json({
            logs: response.searchResponse?.results || [],
            status: 'connected'
        });

    } catch {
        // OCI connection errors are expected when not configured
        return NextResponse.json({
            logs: [],
            status: 'error',
            message: 'OCI logging connection unavailable'
        });
    }
}

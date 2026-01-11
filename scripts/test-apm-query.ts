// Test script to discover OCI APM query syntax
import * as apmtraces from 'oci-apmtraces';
import * as common from 'oci-common';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const APM_DOMAIN_ID = process.env.OCI_APM_DOMAIN_ID;
const REGION = process.env.OCI_APM_REGION || 'eu-frankfurt-1';

async function testApmQuery() {
    if (!APM_DOMAIN_ID) {
        console.error('OCI_APM_DOMAIN_ID not set');
        process.exit(1);
    }

    // Use default config file provider
    const provider = new common.ConfigFileAuthenticationDetailsProvider();

    const client = new apmtraces.QueryClient({
        authenticationDetailsProvider: provider
    });
    client.region = common.Region.fromRegionId(REGION);

    console.log('=== Testing OCI APM Query API ===\n');
    console.log('APM Domain ID:', APM_DOMAIN_ID);
    console.log('Region:', REGION);

    // Test with * wildcard and longer time range
    console.log('\n--- Testing with 72h time range ---');

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 72 * 3600 * 1000); // 72 hours

    console.log('Time range:', startTime.toISOString(), 'to', endTime.toISOString());

    try {
        const response = await client.query({
            apmDomainId: APM_DOMAIN_ID,
            timeSpanStartedGreaterThanOrEqualTo: startTime,
            timeSpanStartedLessThan: endTime,
            limit: 50,
            queryDetails: {
                queryText: '*'
            }
        });

        console.log('\nResponse keys:', Object.keys(response));
        console.log('QueryResultResponse keys:', Object.keys(response.queryResultResponse || {}));

        const rows = response.queryResultResponse?.queryResultRows || [];
        console.log(`\nFound ${rows.length} traces`);

        // Show metadata columns
        const metadata = response.queryResultResponse?.queryResultMetadataSummary;
        if (metadata) {
            console.log('\nAvailable columns:');
            (metadata as any).queryResultRowTypeSummaries?.forEach((col: any) => {
                console.log(`  - ${col.displayName || col.columnName}: ${col.dataType}`);
            });
        }

        if (rows.length > 0) {
            console.log('\nFirst trace sample:');
            console.log(JSON.stringify(rows[0], null, 2));
        }

        // Test with a filter for errors
        console.log('\n--- Testing ERROR filter ---');
        const errorResponse = await client.query({
            apmDomainId: APM_DOMAIN_ID,
            timeSpanStartedGreaterThanOrEqualTo: startTime,
            timeSpanStartedLessThan: endTime,
            limit: 10,
            queryDetails: {
                queryText: "Status = 'ERROR'"
            }
        });

        const errorRows = errorResponse.queryResultResponse?.queryResultRows || [];
        console.log(`Found ${errorRows.length} error traces`);

    } catch (err: any) {
        console.error('Query error:', err.message);
    }
}

testApmQuery().catch(console.error);

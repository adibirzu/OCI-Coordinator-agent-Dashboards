import { NextResponse } from 'next/server';
import * as apmtraces from 'oci-apmtraces';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

const APM_DOMAIN_ID = process.env.OCI_APM_DOMAIN_ID;
const REGION = process.env.OCI_APM_REGION || 'eu-frankfurt-1';

// Trace cache - stores trace list with TTL
interface TraceCacheEntry {
    data: TraceListResponse;
    timestamp: number;
}

interface TraceListResponse {
    traces: TraceSummary[];
    totalCount: number;
    status: string;
    source: string;
    message?: string;
    cached?: boolean;
}

interface TraceSummary {
    traceKey: string;
    rootSpanServiceName: string;
    rootSpanOperationName: string;
    timeEarliestSpanStarted: string;
    timeLatestSpanEnded: string;
    rootSpanDurationInMs: number;
    traceStatus: string;
    traceErrorType: string;
    spanCount: number;
    errorSpanCount: number;
    serviceSummaries: any[];
}

// LRU Cache with 2-minute TTL for trace list
const traceCache: Map<string, TraceCacheEntry> = new Map();
const TRACE_CACHE_TTL_MS = 120000; // 2 minutes
const MAX_CACHE_ENTRIES = 20;

function getCacheKey(params: Record<string, string>): string {
    return Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&');
}

function getFromCache(key: string): TraceCacheEntry | null {
    const entry = traceCache.get(key);
    if (entry && Date.now() - entry.timestamp < TRACE_CACHE_TTL_MS) {
        return entry;
    }
    // Clean expired entry
    if (entry) {
        traceCache.delete(key);
    }
    return null;
}

function setCache(key: string, data: TraceListResponse): void {
    // LRU eviction
    if (traceCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = traceCache.keys().next().value;
        if (oldestKey) traceCache.delete(oldestKey);
    }
    traceCache.set(key, { data, timestamp: Date.now() });
}

// Fallback when APM is unavailable
const OFFLINE_RESPONSE: TraceListResponse = {
    traces: [],
    totalCount: 0,
    status: 'unavailable',
    source: 'offline',
    message: 'APM service unavailable'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Parse query parameters - use parseFloat to support fractional hours (15min = 0.25, 30min = 0.5)
    const hoursBack = Math.min(parseFloat(searchParams.get('hours') || '1'), 72);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const serviceName = searchParams.get('service') || '';
    const operationName = searchParams.get('operation') || '';
    const status = searchParams.get('status') || ''; // ERROR, OK, or empty for all
    const minDuration = parseInt(searchParams.get('minDuration') || '0', 10);
    const sortBy = searchParams.get('sortBy') || 'timeEarliestSpanStarted';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';
    const skipCache = searchParams.get('skipCache') === 'true';

    // Build cache key from params
    const cacheParams = {
        hoursBack: hoursBack.toString(),
        limit: limit.toString(),
        serviceName,
        operationName,
        status,
        minDuration: minDuration.toString(),
        sortBy,
        sortOrder
    };
    const cacheKey = getCacheKey(cacheParams);

    // Check cache unless explicitly skipped
    if (!skipCache) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
                cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
            });
        }
    }

    // Validate APM Domain ID
    if (!APM_DOMAIN_ID) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'pending_config',
            message: 'OCI_APM_DOMAIN_ID not configured'
        });
    }

    try {
        const provider = getProvider();
        const client = new apmtraces.QueryClient({
            authenticationDetailsProvider: provider
        });
        client.region = common.Region.fromRegionId(REGION);

        // Build time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

        // First, get example queries to understand the correct format
        // Then run the query for traces

        // Use listQuickPicks to get example queries - this tells us the correct APM query syntax
        const quickPicksRequest: apmtraces.requests.ListQuickPicksRequest = {
            apmDomainId: APM_DOMAIN_ID
        };

        let exampleQueries: string[] = [];
        try {
            const quickPicksResponse = await client.listQuickPicks(quickPicksRequest);
            exampleQueries = (quickPicksResponse.items || []).map((item: any) => item.quickPickQuery || '');
            console.log('APM Quick Picks (example queries):', exampleQueries.slice(0, 3));
        } catch (qpError: any) {
            console.log('Could not fetch quick picks:', qpError.message);
        }

        // OCI APM Query Language requires proper syntax:
        // show (traces) column1, column2, ... [WHERE conditions]
        // Reference: https://docs.oracle.com/en-us/iaas/application-performance-monitoring/doc/monitor-traces-trace-explorer.html
        // Column names use PascalCase and must match OCI APM schema exactly
        // Standard columns: TraceStatus, TraceFirstSpanStartTime, ServiceName, OperationName, TraceDuration, ErrorCount
        const queryText = 'show (traces) TraceStatus, TraceFirstSpanStartTime, ServiceName, OperationName, TraceDuration, ErrorCount';

        console.log('APM Query:', queryText);
        console.log('APM Time range:', startTime.toISOString(), 'to', endTime.toISOString());

        const queryRequest: apmtraces.requests.QueryRequest = {
            apmDomainId: APM_DOMAIN_ID,
            timeSpanStartedGreaterThanOrEqualTo: startTime,
            timeSpanStartedLessThan: endTime,
            limit: limit,
            queryDetails: {
                queryText: queryText
            }
        };

        const response = await client.query(queryRequest);
        console.log('APM Query Response keys:', Object.keys(response));

        // Debug: Log first row structure to understand response format
        const firstRow = response.queryResultResponse?.queryResultRows?.[0];
        if (firstRow) {
            console.log('APM First row data:', JSON.stringify(firstRow.queryResultRowData));
            console.log('APM First row metadata:', JSON.stringify(firstRow.queryResultRowMetadata));
        } else {
            console.log('APM Query returned no rows');
        }

        // Transform response to our format
        // OCI APM response structure: queryResultRowData contains fields, queryResultRowMetadata contains trace_id

        let traces: TraceSummary[] = (response.queryResultResponse?.queryResultRows || []).map((row: any) => {
            const data = row.queryResultRowData || {};
            const metadata = row.queryResultRowMetadata || {};

            // Column names match the query: TraceStatus, TraceFirstSpanStartTime, ServiceName,
            // OperationName, TraceDuration, ErrorCount
            // OCI APM TraceDuration is in microseconds, convert to milliseconds
            const startTimeValue = data.TraceFirstSpanStartTime || data['TraceFirstSpanStartTime'] || Date.now();
            const durationMicros = data.TraceDuration || data['TraceDuration'] || 0;
            const durationMs = durationMicros / 1000; // Convert microseconds to milliseconds
            const traceStartTime = new Date(startTimeValue);
            const traceEndTime = new Date(traceStartTime.getTime() + durationMs);
            const errorCount = data.ErrorCount || data['ErrorCount'] || 0;

            return {
                traceKey: metadata.trace_id || data.TraceId || 'unknown',
                rootSpanServiceName: data.ServiceName || data['ServiceName'] || 'unknown',
                rootSpanOperationName: data.OperationName || data['OperationName'] || 'unknown',
                timeEarliestSpanStarted: traceStartTime.toISOString(),
                timeLatestSpanEnded: traceEndTime.toISOString(),
                rootSpanDurationInMs: durationMs,
                traceStatus: data.TraceStatus || data['TraceStatus'] || 'OK',
                traceErrorType: errorCount > 0 ? 'ERROR' : '',
                spanCount: 1, // Not available in this query, will be fetched in drilldown
                errorSpanCount: errorCount,
                serviceSummaries: []
            };
        });

        // Apply in-memory filters since OCI APM query filters caused parse errors
        if (serviceName) {
            traces = traces.filter(t => t.rootSpanServiceName.toLowerCase().includes(serviceName.toLowerCase()));
        }
        if (operationName) {
            traces = traces.filter(t => t.rootSpanOperationName.toLowerCase().includes(operationName.toLowerCase()));
        }
        if (status === 'ERROR') {
            traces = traces.filter(t => t.errorSpanCount > 0 || t.traceStatus === 'ERROR');
        } else if (status === 'OK') {
            traces = traces.filter(t => t.errorSpanCount === 0 && t.traceStatus !== 'ERROR');
        }
        if (minDuration > 0) {
            traces = traces.filter(t => t.rootSpanDurationInMs >= minDuration);
        }

        const result: TraceListResponse = {
            traces,
            totalCount: traces.length,
            status: 'connected',
            source: 'oci-apm'
        };

        // Cache the result
        setCache(cacheKey, result);

        return NextResponse.json({
            ...result,
            params: cacheParams,
            timeRange: {
                start: startTime.toISOString(),
                end: endTime.toISOString()
            }
        });

    } catch (error: any) {
        console.error('APM Traces API error:', error);

        // Return structured error response (HTTP 200 for graceful degradation)
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'error',
            message: error.message || 'Failed to query APM traces',
            params: cacheParams
        });
    }
}

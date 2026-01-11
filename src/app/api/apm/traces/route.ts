import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/oci-auth';
import { DefaultRequestSigner, HttpRequest } from 'oci-common';
import { createHash } from 'crypto';

const APM_DOMAIN_ID = process.env.OCI_APM_DOMAIN_ID;
const REGION = process.env.OCI_APM_REGION || 'eu-frankfurt-1';

// Direct HTTP request to APM API to bypass SDK date serialization bug
// The SDK incorrectly serializes dates (local time with Z suffix, no hour padding)
async function queryApmDirect(params: {
    apmDomainId: string;
    startTime: Date;
    endTime: Date;
    limit: number;
    queryText: string;
}): Promise<any> {
    const provider = getProvider();
    const signer = new DefaultRequestSigner(provider);

    // Build URL with properly formatted ISO dates
    const host = `apm-trace.${REGION}.oci.oraclecloud.com`;
    const baseUrl = `https://${host}`;
    const path = '/20200630/queries/actions/runQuery';
    const queryParams = new URLSearchParams({
        apmDomainId: params.apmDomainId,
        limit: params.limit.toString(),
        timeSpanStartedGreaterThanOrEqualTo: params.startTime.toISOString(),
        timeSpanStartedLessThan: params.endTime.toISOString()
    });

    const fullUrl = `${baseUrl}${path}?${queryParams.toString()}`;
    const body = JSON.stringify({
        queryText: params.queryText
    });

    // Compute SHA256 hash of the body for OCI request signing
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('base64');

    // Create OCI HTTP request for signing
    // OCI signing requires: host, date, x-content-sha256, content-type, content-length
    // IMPORTANT: HttpRequest.headers must be native Headers class, not Map
    const requestHeaders = new Headers();
    requestHeaders.set('host', host);
    requestHeaders.set('content-type', 'application/json');
    requestHeaders.set('content-length', Buffer.byteLength(body, 'utf8').toString());
    requestHeaders.set('x-content-sha256', bodyHash);
    requestHeaders.set('accept', 'application/json');

    const httpRequest: HttpRequest = {
        uri: fullUrl,
        method: 'POST',
        headers: requestHeaders,
        body: body
    };

    // Sign the request with OCI credentials
    await signer.signHttpRequest(httpRequest);

    // Convert signed headers to plain object for fetch
    const headers: Record<string, string> = {};
    httpRequest.headers.forEach((value, key) => {
        headers[key] = value;
    });

    console.log('APM Direct Request URL:', fullUrl);

    // Make the actual HTTP request
    const response = await fetch(fullUrl, {
        method: 'POST',
        headers: headers,
        body: body
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('APM Direct Request failed:', response.status, errorText);
        throw new Error(`APM API error: ${response.status} - ${errorText}`);
    }

    return response.json();
}

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
        // Build time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

        // OCI APM Query Language:
        // Reference: https://docs.oracle.com/en-us/iaas/application-performance-monitoring/doc/monitor-traces-trace-explorer.html
        // Key syntax rules:
        // - SHOW clause WITH parentheses: show (traces) or show (spans)
        // - Must include column selections after show (traces)
        // - Time range is passed via API parameters, not in query
        // - Limit is passed via request parameter, not in query text
        // Column names must match OCI APM schema exactly (case-sensitive):
        //   TraceDuration (microseconds), not TraceDurationInMs
        //   ErrorCount, not ErrorSpanCount
        const queryText = 'show (traces) TraceStatus as Status, ServiceName as Service, OperationName as Operation, TraceDuration as Duration, SpanCount as Spans, ErrorCount as Errors';

        console.log('APM Query:', queryText);
        console.log('APM Time range:', startTime.toISOString(), 'to', endTime.toISOString());

        // Use direct HTTP request to bypass OCI SDK date serialization bug
        // The SDK incorrectly formats dates (local time with Z suffix, no hour zero-padding)
        const response = await queryApmDirect({
            apmDomainId: APM_DOMAIN_ID,
            startTime: startTime,
            endTime: endTime,
            limit: limit,
            queryText: queryText
        });
        console.log('APM Query Response keys:', Object.keys(response));

        // Log any warnings from the API
        if (response.queryResultWarnings?.length > 0) {
            console.log('APM Query Warnings:', response.queryResultWarnings);
        }

        // Direct HTTP response has queryResultRows at top level (not nested under queryResultResponse like SDK)
        const rows = response.queryResultRows || [];
        console.log('APM Query returned', rows.length, 'rows');
        if (rows.length > 0) {
            const firstRow = rows[0];
            console.log('APM First row keys:', Object.keys(firstRow.queryResultRowData || {}));
            console.log('APM First row data:', JSON.stringify(firstRow.queryResultRowData));
        }

        // Transform response to our format
        // Direct HTTP response structure: queryResultRowData contains fields, queryResultRowMetadata contains trace_id
        // Column names from "show (traces)" use various naming conventions - try multiple variants

        let traces: TraceSummary[] = (response.queryResultRows || []).map((row: any) => {
            const data = row.queryResultRowData || {};
            const metadata = row.queryResultRowMetadata || {};

            // Helper to get value trying multiple key variants
            const getValue = (keys: string[], defaultVal: any = null) => {
                for (const key of keys) {
                    if (data[key] !== undefined && data[key] !== null) return data[key];
                }
                return defaultVal;
            };

            // Try various column name formats (OCI APM uses different conventions)
            const startTimeValue = getValue([
                'traceFirstSpanStartTime', 'TraceFirstSpanStartTime',
                'timeEarliestSpanStarted', 'TimeEarliestSpanStarted',
                'startTime', 'StartTime'
            ], Date.now());

            const durationValue = getValue([
                'traceDurationInMs', 'TraceDurationInMs',
                'traceDuration', 'TraceDuration',
                'rootSpanDurationInMs', 'RootSpanDurationInMs',
                'duration', 'Duration'
            ], 0);

            // Duration could be in microseconds or milliseconds depending on the source
            const durationMs = durationValue > 1000000 ? durationValue / 1000 : durationValue;

            const traceStartTime = new Date(startTimeValue);
            const traceEndTime = new Date(traceStartTime.getTime() + durationMs);

            const errorCount = getValue([
                'errorSpanCount', 'ErrorSpanCount',
                'errorCount', 'ErrorCount',
                'errors', 'Errors'
            ], 0);

            const spanCount = getValue([
                'spanCount', 'SpanCount',
                'numberOfSpans', 'NumberOfSpans'
            ], 1);

            const serviceName = getValue([
                'rootSpanServiceName', 'RootSpanServiceName',
                'serviceName', 'ServiceName',
                'service', 'Service'
            ], 'unknown');

            const operationName = getValue([
                'rootSpanOperationName', 'RootSpanOperationName',
                'operationName', 'OperationName',
                'operation', 'Operation'
            ], 'unknown');

            const traceStatus = getValue([
                'traceStatus', 'TraceStatus',
                'status', 'Status'
            ], 'OK');

            const traceKey = metadata.trace_id || getValue([
                'traceKey', 'TraceKey',
                'traceId', 'TraceId',
                'id', 'Id'
            ], 'unknown');

            return {
                traceKey,
                rootSpanServiceName: serviceName,
                rootSpanOperationName: operationName,
                timeEarliestSpanStarted: traceStartTime.toISOString(),
                timeLatestSpanEnded: traceEndTime.toISOString(),
                rootSpanDurationInMs: durationMs,
                traceStatus,
                traceErrorType: errorCount > 0 ? 'ERROR' : '',
                spanCount,
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

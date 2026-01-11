import { NextResponse } from 'next/server';
import * as apmtraces from 'oci-apmtraces';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

const APM_DOMAIN_ID = process.env.OCI_APM_DOMAIN_ID;
const REGION = process.env.OCI_APM_REGION || 'eu-frankfurt-1';

// Span detail cache - short TTL since this is on-demand data
interface SpanCacheEntry {
    data: TraceDetailResponse;
    timestamp: number;
}

interface SpanDetail {
    spanKey: string;
    spanName: string;
    serviceName: string;
    operationName: string;
    timeStarted: string;
    timeEnded: string;
    durationInMs: number;
    status: string;
    spanKind: string;
    parentSpanKey: string | null;
    traceKey: string;
    isError: boolean;
    errorMessage?: string;
    tags: Record<string, string>;
    logs: SpanLog[];
}

interface SpanLog {
    timestamp: string;
    event: string;
    details: Record<string, any>;
}

interface TraceDetailResponse {
    traceKey: string;
    spans: SpanDetail[];
    rootSpan?: SpanDetail;
    totalDurationMs: number;
    totalSpans: number;
    errorSpans: number;
    services: string[];
    status: string;
    source: string;
    cached?: boolean;
}

// LRU Cache with 5-minute TTL for drilldown data (less frequent updates)
const spanCache: Map<string, SpanCacheEntry> = new Map();
const SPAN_CACHE_TTL_MS = 300000; // 5 minutes
const MAX_SPAN_CACHE_ENTRIES = 50;

function getFromCache(traceKey: string): SpanCacheEntry | null {
    const entry = spanCache.get(traceKey);
    if (entry && Date.now() - entry.timestamp < SPAN_CACHE_TTL_MS) {
        return entry;
    }
    if (entry) {
        spanCache.delete(traceKey);
    }
    return null;
}

function setCache(traceKey: string, data: TraceDetailResponse): void {
    if (spanCache.size >= MAX_SPAN_CACHE_ENTRIES) {
        const oldestKey = spanCache.keys().next().value;
        if (oldestKey) spanCache.delete(oldestKey);
    }
    spanCache.set(traceKey, { data, timestamp: Date.now() });
}

const OFFLINE_RESPONSE: TraceDetailResponse = {
    traceKey: '',
    spans: [],
    totalDurationMs: 0,
    totalSpans: 0,
    errorSpans: 0,
    services: [],
    status: 'unavailable',
    source: 'none'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const traceKey = searchParams.get('traceKey');
    const skipCache = searchParams.get('skipCache') === 'true';

    if (!traceKey) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'error',
            message: 'traceKey parameter is required'
        }, { status: 400 });
    }

    // Check cache
    if (!skipCache) {
        const cached = getFromCache(traceKey);
        if (cached) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
                cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
            });
        }
    }

    if (!APM_DOMAIN_ID) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            traceKey,
            status: 'pending_config',
            message: 'OCI_APM_DOMAIN_ID not configured'
        });
    }

    try {
        const provider = getProvider();
        const client = new apmtraces.TraceClient({
            authenticationDetailsProvider: provider
        });
        client.region = common.Region.fromRegionId(REGION);

        // Get trace details with all spans
        const getTraceRequest: apmtraces.requests.GetTraceRequest = {
            apmDomainId: APM_DOMAIN_ID,
            traceKey: traceKey
        };

        const traceResponse = await client.getTrace(getTraceRequest);
        const trace = traceResponse.trace;

        if (!trace) {
            return NextResponse.json({
                ...OFFLINE_RESPONSE,
                traceKey,
                status: 'not_found',
                message: `Trace ${traceKey} not found`
            });
        }

        // Helper to transform OCI APM tags array to Record<string, string>
        // OCI APM SDK returns tags as [{key: 'name', value: 'val'}, ...] but we need {name: 'val'}
        const transformTags = (tags: any): Record<string, string> => {
            if (!tags) return {};

            // If already an object (not array), use as-is
            if (!Array.isArray(tags)) {
                return typeof tags === 'object' ? tags : {};
            }

            // Transform array of {key, value} objects to Record
            return tags.reduce((acc: Record<string, string>, tag: any) => {
                const key = tag.key || tag.tagName || tag.name;
                const value = tag.value || tag.tagValue;
                if (key !== undefined && value !== undefined) {
                    acc[String(key)] = String(value);
                }
                return acc;
            }, {});
        };

        // Transform spans to our format
        const spans: SpanDetail[] = (trace.spans || []).map((span: any) => ({
            spanKey: span.key || span.spanKey,
            spanName: span.spanName || span.operationName || 'unknown',
            serviceName: span.serviceName || 'unknown',
            operationName: span.operationName || span.spanName || 'unknown',
            timeStarted: span.timeStarted,
            timeEnded: span.timeEnded,
            durationInMs: span.durationInMs || 0,
            status: span.status?.code || (span.isError ? 'ERROR' : 'OK'),
            spanKind: span.kind || 'INTERNAL',
            parentSpanKey: span.parentSpanKey || null,
            traceKey: traceKey,
            isError: span.isError || span.status?.code === 'ERROR',
            errorMessage: span.status?.message || '',
            tags: transformTags(span.tags),
            logs: (span.logs || []).map((log: any) => ({
                timestamp: log.timeCreated || log.timestamp,
                event: log.eventName || log.event || '',
                details: log.spanLogs || log.fields || {}
            }))
        }));

        // Find root span (no parent)
        const rootSpan = spans.find(s => !s.parentSpanKey);

        // Calculate aggregates
        const services = [...new Set(spans.map(s => s.serviceName))];
        const errorSpans = spans.filter(s => s.isError).length;
        const totalDurationMs = rootSpan?.durationInMs ||
            Math.max(...spans.map(s => new Date(s.timeEnded).getTime())) -
            Math.min(...spans.map(s => new Date(s.timeStarted).getTime()));

        const result: TraceDetailResponse = {
            traceKey,
            spans,
            rootSpan,
            totalDurationMs,
            totalSpans: spans.length,
            errorSpans,
            services,
            status: 'connected',
            source: 'oci-apm'
        };

        // Cache the result
        setCache(traceKey, result);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('APM Drilldown API error:', error);

        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            traceKey,
            status: 'error',
            message: error.message || 'Failed to get trace details'
        });
    }
}

// POST endpoint for batch span queries (useful for comparing traces)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { traceKeys, skipCache } = body;

        if (!Array.isArray(traceKeys) || traceKeys.length === 0) {
            return NextResponse.json({
                status: 'error',
                message: 'traceKeys array is required'
            }, { status: 400 });
        }

        // Limit batch size
        const limitedKeys = traceKeys.slice(0, 10);

        // Fetch traces in parallel
        const results = await Promise.all(
            limitedKeys.map(async (traceKey: string) => {
                // Check cache first
                if (!skipCache) {
                    const cached = getFromCache(traceKey);
                    if (cached) {
                        return { ...cached.data, cached: true };
                    }
                }

                // Fetch from API (reuse GET logic by constructing URL)
                const url = new URL(request.url);
                url.searchParams.set('traceKey', traceKey);
                if (skipCache) url.searchParams.set('skipCache', 'true');

                try {
                    const response = await fetch(url.toString());
                    return await response.json();
                } catch (error: any) {
                    return {
                        traceKey,
                        status: 'error',
                        message: error.message
                    };
                }
            })
        );

        return NextResponse.json({
            traces: results,
            totalRequested: traceKeys.length,
            totalReturned: results.length,
            status: 'connected'
        });

    } catch (error: any) {
        return NextResponse.json({
            status: 'error',
            message: error.message || 'Failed to process batch request'
        }, { status: 500 });
    }
}

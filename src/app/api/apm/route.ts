import { NextResponse } from 'next/server';
import * as monitoring from 'oci-monitoring';
import { getProvider } from '@/lib/oci-auth';

const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

// Simple in-memory cache for APM metrics
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60000; // 60 second cache for APM metrics

// Fallback response when backend is unavailable
const OFFLINE_RESPONSE = {
    status: 'unavailable',
    metrics: [],
    message: 'No metrics sources available. Configure OCI_COMPARTMENT_ID for OCI Monitoring.'
};

// Available metric namespaces and queries
const METRIC_QUERIES: Record<string, { namespace: string; query: string; displayName: string }> = {
    'cpu': {
        namespace: 'oci_computeagent',
        query: 'CpuUtilization[1m].mean()',
        displayName: 'CPU Utilization'
    },
    'memory': {
        namespace: 'oci_computeagent',
        query: 'MemoryUtilization[1m].mean()',
        displayName: 'Memory Utilization'
    },
    'network_in': {
        namespace: 'oci_computeagent',
        query: 'NetworksBytesIn[1m].sum()',
        displayName: 'Network In (bytes)'
    },
    'network_out': {
        namespace: 'oci_computeagent',
        query: 'NetworksBytesOut[1m].sum()',
        displayName: 'Network Out (bytes)'
    },
    'disk_read': {
        namespace: 'oci_computeagent',
        query: 'DiskBytesRead[1m].sum()',
        displayName: 'Disk Read (bytes)'
    },
    'disk_write': {
        namespace: 'oci_computeagent',
        query: 'DiskBytesWritten[1m].sum()',
        displayName: 'Disk Write (bytes)'
    },
    'autonomous_db_cpu': {
        namespace: 'oci_autonomous_database',
        query: 'CpuUtilization[1m].mean()',
        displayName: 'ADB CPU Utilization'
    },
    'autonomous_db_storage': {
        namespace: 'oci_autonomous_database',
        query: 'StorageUtilization[1m].max()',
        displayName: 'ADB Storage Utilization'
    },
    'functions_invocations': {
        namespace: 'oci_faas',
        query: 'FunctionInvocationCount[1m].sum()',
        displayName: 'Function Invocations'
    },
    'functions_duration': {
        namespace: 'oci_faas',
        query: 'FunctionExecutionDuration[1m].mean()',
        displayName: 'Function Duration (ms)'
    }
};

function getCacheKey(metric: string, hoursBack: number, dimensionFilter?: { key: string; value: string }): string {
    const filterPart = dimensionFilter ? `-${dimensionFilter.key}:${dimensionFilter.value}` : '';
    return `${metric}-${hoursBack}${filterPart}`;
}

function getFromCache(key: string): CacheEntry | null {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry;
    }
    return null;
}

function setCache(key: string, data: any): void {
    if (cache.size > 50) {
        const keysToDelete = Array.from(cache.keys()).slice(0, 25);
        keysToDelete.forEach(k => cache.delete(k));
    }
    cache.set(key, { data, timestamp: Date.now() });
}

async function fetchFromOCI(params: {
    metric: string;
    hoursBack: number;
    dimensionFilter?: { key: string; value: string };
}): Promise<{ items: any[]; status: string; source: string; metricInfo?: any; activeFilter?: { key: string; value: string } }> {
    if (!COMPARTMENT_ID) {
        return {
            items: [],
            status: 'pending_config',
            source: 'oci-monitoring'
        };
    }

    const metricConfig = METRIC_QUERIES[params.metric];
    if (!metricConfig) {
        return {
            items: [],
            status: 'error',
            source: 'oci-monitoring'
        };
    }

    try {
        const provider = getProvider();
        const client = new monitoring.MonitoringClient({
            authenticationDetailsProvider: provider
        });

        const startTime = new Date(Date.now() - params.hoursBack * 3600 * 1000);
        const endTime = new Date();

        // Build query with optional dimension filter
        // MQL syntax: MetricName[interval]{dimension = "value"}.aggregation()
        // Example: CpuUtilization[1m]{resourceDisplayName = "ARKTIME"}.mean()
        let query = metricConfig.query;
        if (params.dimensionFilter) {
            // Insert dimension filter before the interval bracket
            // e.g., "CpuUtilization[1m].mean()" -> "CpuUtilization{resourceDisplayName = "value"}[1m].mean()"
            query = query.replace(
                /^(\w+)\[/,
                `$1{${params.dimensionFilter.key} = "${params.dimensionFilter.value}"}[`
            );
        }

        const request: monitoring.requests.SummarizeMetricsDataRequest = {
            compartmentId: COMPARTMENT_ID,
            summarizeMetricsDataDetails: {
                namespace: metricConfig.namespace,
                query: query,
                startTime: startTime,
                endTime: endTime
            }
        };

        const response = await client.summarizeMetricsData(request);
        const items = response.items || [];

        // Transform to a more usable format
        const transformedItems = items.map((item: any) => ({
            name: item.name,
            namespace: item.namespace,
            dimensions: item.dimensions,
            datapoints: item.aggregatedDatapoints?.map((dp: any) => ({
                timestamp: dp.timestamp,
                value: dp.value
            })) || []
        }));

        return {
            items: transformedItems,
            status: 'connected',
            source: 'oci-monitoring',
            metricInfo: metricConfig,
            activeFilter: params.dimensionFilter
        };
    } catch (error) {
        console.error('OCI Monitoring error:', error);
        return {
            items: [],
            status: 'error',
            source: 'oci-monitoring'
        };
    }
}

async function fetchFromCoordinator(): Promise<{ metrics: any[]; status: string; source: string } | null> {
    try {
        const res = await fetch(`${COORDINATOR_API_URL}/apm/stats`, {
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) {
            return null;
        }

        const data = await res.json();
        return {
            metrics: data.metrics || [],
            status: 'connected',
            source: 'coordinator'
        };
    } catch {
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const metric = searchParams.get('metric') || 'cpu';
    const hoursBack = Math.min(parseInt(searchParams.get('hours') || '1', 10), 72);
    const source = searchParams.get('source') || 'auto';

    // Parse dimension filter for drilldown (e.g., ?dimensionKey=resourceDisplayName&dimensionValue=ARKTIME)
    const dimensionKey = searchParams.get('dimensionKey');
    const dimensionValue = searchParams.get('dimensionValue');
    const dimensionFilter = dimensionKey && dimensionValue
        ? { key: dimensionKey, value: dimensionValue }
        : undefined;

    // Check cache
    const cacheKey = getCacheKey(metric, hoursBack, dimensionFilter);
    const cached = getFromCache(cacheKey);
    if (cached) {
        return NextResponse.json({
            ...cached.data,
            cached: true
        });
    }

    let result: any;

    // Try OCI first when explicitly requested or for specific metrics
    if (source === 'oci' || METRIC_QUERIES[metric]) {
        const ociResult = await fetchFromOCI({ metric, hoursBack, dimensionFilter });
        if (ociResult.status === 'connected' || ociResult.status === 'pending_config') {
            result = ociResult;
        } else {
            const coordResult = await fetchFromCoordinator();
            result = coordResult || {
                ...OFFLINE_RESPONSE,
                source: 'none'
            };
        }
    }
    // Try coordinator for generic APM stats
    else if (source === 'coordinator') {
        const coordResult = await fetchFromCoordinator();
        result = coordResult || await fetchFromOCI({ metric, hoursBack, dimensionFilter });
    }
    // Auto mode - try both
    else {
        const ociResult = await fetchFromOCI({ metric, hoursBack, dimensionFilter });
        if (ociResult.items.length > 0) {
            result = ociResult;
        } else {
            const coordResult = await fetchFromCoordinator();
            result = coordResult || ociResult;
        }
    }

    // Add available metrics info
    const response = {
        ...result,
        availableMetrics: Object.entries(METRIC_QUERIES).map(([key, config]) => ({
            id: key,
            name: config.displayName,
            namespace: config.namespace
        })),
        params: { metric, hoursBack, source, dimensionFilter }
    };

    // Cache successful responses
    if (result.status === 'connected') {
        setCache(cacheKey, response);
    }

    return NextResponse.json(response);
}

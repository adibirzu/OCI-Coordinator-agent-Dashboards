import { NextResponse } from 'next/server';
import * as loggingsearch from 'oci-loggingsearch';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

const LOG_GROUP_ID = process.env.OCI_LOG_GROUP_ID;
// Region must match where the log group is located
const OCI_REGION = process.env.OCI_REGION || 'eu-frankfurt-1';
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const COORDINATOR_API_URL = process.env.COORDINATOR_API_URL || 'http://127.0.0.1:3001';

// Simple in-memory cache
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 10000; // 10 second cache for live mode, longer for regular

// Agent log source mapping (matches oci-coordinator structure)
const AGENT_LOG_SOURCES: Record<string, string> = {
    'coordinator': 'oci-ai-coordinator/coordinator',
    'db-troubleshoot': 'oci-ai-coordinator/db-troubleshoot-agent',
    'log-analytics': 'oci-ai-coordinator/log-analytics-agent',
    'security-threat': 'oci-ai-coordinator/security-threat-agent',
    'finops': 'oci-ai-coordinator/finops-agent',
    'infrastructure': 'oci-ai-coordinator/infrastructure-agent',
    'slack-handler': 'oci-ai-coordinator/slack-handler',
    'mcp-executor': 'oci-ai-coordinator/mcp-executor',
};

export interface LogEntry {
    id: string;
    timestamp: string;
    source: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    agent?: string;
    traceId?: string;
    spanId?: string;
    raw?: any;
}

// Fallback response when both OCI and backend are unavailable
const OFFLINE_RESPONSE = {
    logs: [],
    status: 'unavailable',
    message: 'No log sources available. Configure OCI_LOG_GROUP_ID and OCI_COMPARTMENT_ID.'
};

function getCacheKey(params: Record<string, string>): string {
    return JSON.stringify(params);
}

function getFromCache(key: string, ttl: number = CACHE_TTL_MS): CacheEntry | null {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < ttl) {
        return entry;
    }
    return null;
}

function setCache(key: string, data: any): void {
    // Clean up old entries if cache is too large
    if (cache.size > 100) {
        const keysToDelete = Array.from(cache.keys()).slice(0, 50);
        keysToDelete.forEach(k => cache.delete(k));
    }
    cache.set(key, { data, timestamp: Date.now() });
}

function transformOCILog(result: any): LogEntry {
    const data = result.data;

    // Parse JSON if data is a string
    let logData: any = {};
    if (typeof data === 'string') {
        try {
            logData = JSON.parse(data);
        } catch {
            logData = { message: data };
        }
    } else {
        logData = data || {};
    }

    // Extract fields from structured log
    const message = logData.message || logData.msg || data?.message || JSON.stringify(logData).slice(0, 500);
    const level = (logData.level || logData.severity || 'INFO').toUpperCase();
    const source = result.source || logData.agent || 'oci-logging';

    return {
        id: result.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: result.time || logData.timestamp || new Date().toISOString(),
        source: source.replace('oci-ai-coordinator/', ''),
        level: (['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(level) ? level : 'INFO') as LogEntry['level'],
        message: message,
        agent: logData.agent,
        traceId: logData.trace_id,
        spanId: logData.span_id,
        raw: logData
    };
}

async function fetchFromOCI(params: {
    limit: number;
    agent?: string;
    level?: string;
    search?: string;
    hoursBack?: number;
}): Promise<{ logs: LogEntry[]; status: string; source: string }> {
    if (!COMPARTMENT_ID || !LOG_GROUP_ID) {
        return {
            logs: [],
            status: 'pending_config',
            source: 'oci-logging'
        };
    }

    try {
        const provider = getProvider();
        const searchClient = new loggingsearch.LogSearchClient({
            authenticationDetailsProvider: provider
        });
        // Set region explicitly - must match where log group is located
        searchClient.region = common.Region.fromRegionId(OCI_REGION);

        const hoursBack = params.hoursBack || 1;
        const startTime = new Date(Date.now() - hoursBack * 3600 * 1000);
        const endTime = new Date();

        // OCI Logging Search uses SQL-like syntax, NOT pipe-delimited Log Analytics syntax
        // Base search query - search within the compartment (required), filtering by log group
        // Note: Filtering by agent/level/search is done client-side after fetching
        // because OCI Logging Search has limited query syntax compared to Log Analytics
        // The search query must reference the log group OCID to filter logs
        const searchQuery = LOG_GROUP_ID
            ? `search "${COMPARTMENT_ID}/${LOG_GROUP_ID}"`
            : `search "${COMPARTMENT_ID}"`;

        const searchRequest: loggingsearch.requests.SearchLogsRequest = {
            searchLogsDetails: {
                timeStart: startTime,
                timeEnd: endTime,
                searchQuery: searchQuery,
                isReturnFieldInfo: false
            },
            // Use limit parameter on the request instead of in the query
            limit: Math.min(params.limit * 2, 1000) // Fetch extra for client-side filtering
        };

        const response = await searchClient.searchLogs(searchRequest);
        let results = response.searchResponse?.results || [];

        // Transform results to our log format
        let logs = results.map(transformOCILog);

        // Client-side filtering since OCI Logging Search has limited query syntax
        if (params.agent && AGENT_LOG_SOURCES[params.agent]) {
            const agentSource = AGENT_LOG_SOURCES[params.agent].replace('oci-ai-coordinator/', '');
            logs = logs.filter(log => log.source === agentSource || log.agent === params.agent);
        }

        if (params.level && params.level !== 'all') {
            const levelFilter = params.level.toUpperCase();
            logs = logs.filter(log => log.level === levelFilter);
        }

        if (params.search) {
            const searchLower = params.search.toLowerCase();
            logs = logs.filter(log =>
                log.message.toLowerCase().includes(searchLower) ||
                log.source.toLowerCase().includes(searchLower)
            );
        }

        // Sort by timestamp descending and limit results
        logs = logs
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, params.limit);

        return {
            logs,
            status: 'connected',
            source: 'oci-logging'
        };
    } catch (error) {
        console.error('OCI Logging error:', error);
        return {
            logs: [],
            status: 'error',
            source: 'oci-logging'
        };
    }
}

async function fetchFromCoordinator(params: {
    limit: number;
    live?: boolean;
}): Promise<{ logs: LogEntry[]; status: string; source: string } | null> {
    try {
        const res = await fetch(
            `${COORDINATOR_API_URL}/logs?limit=${params.limit}&live=${params.live}`,
            {
                next: { revalidate: 0 },
                signal: AbortSignal.timeout(3000) // 3 second timeout
            }
        );

        if (!res.ok) {
            return null;
        }

        const data = await res.json();
        const logs = (data.logs || []).map((l: any) => ({
            id: l.id || Math.random().toString(36),
            timestamp: l.timestamp || new Date().toISOString(),
            source: l.source || 'coordinator',
            level: (l.level || 'INFO') as LogEntry['level'],
            message: l.message || l.raw || ''
        }));

        return {
            logs,
            status: 'connected',
            source: 'coordinator'
        };
    } catch {
        // Connection refused or timeout - coordinator not running
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const live = searchParams.get('live') === 'true';
    const agent = searchParams.get('agent') || undefined;
    const level = searchParams.get('level') || undefined;
    const search = searchParams.get('search') || undefined;
    const hoursBack = parseInt(searchParams.get('hours') || '1', 10);
    const source = searchParams.get('source') || 'auto'; // 'oci', 'coordinator', or 'auto'

    // Build cache key
    const cacheKey = getCacheKey({
        limit: String(limit),
        agent: agent || '',
        level: level || '',
        search: search || '',
        hoursBack: String(hoursBack),
        source
    });

    // Check cache for non-live requests
    if (!live) {
        const cached = getFromCache(cacheKey, 30000); // 30 second cache for non-live
        if (cached) {
            return NextResponse.json({
                ...cached.data,
                cached: true
            });
        }
    }

    let result: { logs: LogEntry[]; status: string; source: string; message?: string };

    // Try OCI first for filtered queries or when explicitly requested
    if (source === 'oci' || (agent || level || search)) {
        const ociResult = await fetchFromOCI({ limit, agent, level, search, hoursBack });
        if (ociResult.status === 'connected' || ociResult.status === 'pending_config') {
            result = ociResult;
        } else {
            // Fall back to coordinator if OCI fails
            const coordResult = await fetchFromCoordinator({ limit, live });
            result = coordResult || {
                ...OFFLINE_RESPONSE,
                source: 'none'
            };
        }
    }
    // For unfiltered live mode, try coordinator first for real-time
    else if (live && source !== 'oci') {
        const coordResult = await fetchFromCoordinator({ limit, live });
        if (coordResult) {
            result = coordResult;
        } else {
            // Fall back to OCI if coordinator not available
            result = await fetchFromOCI({ limit, hoursBack: 1 });
        }
    }
    // Default: try both sources, prefer OCI for richer data
    else {
        const ociResult = await fetchFromOCI({ limit, hoursBack });
        if (ociResult.logs.length > 0) {
            result = ociResult;
        } else {
            const coordResult = await fetchFromCoordinator({ limit, live });
            result = coordResult || ociResult;
        }
    }

    // Add available filters info
    const response = {
        ...result,
        availableFilters: {
            agents: Object.keys(AGENT_LOG_SOURCES),
            levels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
            hoursBack: [1, 6, 12, 24, 48, 72]
        },
        params: { limit, live, agent, level, search, hoursBack, source }
    };

    // Cache successful responses
    if (result.status === 'connected' && !live) {
        setCache(cacheKey, response);
    }

    return NextResponse.json(response);
}

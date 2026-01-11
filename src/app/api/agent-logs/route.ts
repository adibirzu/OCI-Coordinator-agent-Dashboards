import { NextResponse } from 'next/server';
import * as loggingsearch from 'oci-loggingsearch';
import * as common from 'oci-common';
import { getProvider } from '@/lib/oci-auth';

// Per-agent Log OCIDs from environment
const AGENT_LOG_OCIDS: Record<string, string | undefined> = {
    'coordinator': process.env.OCI_LOG_ID_COORDINATOR,
    'db-troubleshoot': process.env.OCI_LOG_ID_DB_TROUBLESHOOT,
    'log-analytics': process.env.OCI_LOG_ID_LOG_ANALYTICS,
    'security-threat': process.env.OCI_LOG_ID_SECURITY_THREAT,
    'finops': process.env.OCI_LOG_ID_FINOPS,
    'infrastructure': process.env.OCI_LOG_ID_INFRASTRUCTURE
};

const LOG_GROUP_ID = process.env.OCI_LOG_GROUP_ID;
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const REGION = process.env.OCI_LOGGING_REGION || 'eu-frankfurt-1';

// Log entry interface
interface LogEntry {
    id: string;
    timestamp: string;
    source: string;
    agent: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    traceId?: string;
    spanId?: string;
    raw?: any;
}

interface LogsResponse {
    logs: LogEntry[];
    totalCount: number;
    status: string;
    source: string;
    agent?: string;
    cached?: boolean;
}

// Simple cache for logs
interface LogCacheEntry {
    data: LogsResponse;
    timestamp: number;
}

const logCache: Map<string, LogCacheEntry> = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds for live logs
const MAX_CACHE_ENTRIES = 50;

function getCacheKey(params: Record<string, string>): string {
    return Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join('&');
}

function getFromCache(key: string, ttl: number = CACHE_TTL_MS): LogCacheEntry | null {
    const entry = logCache.get(key);
    if (entry && Date.now() - entry.timestamp < ttl) {
        return entry;
    }
    if (entry) {
        logCache.delete(key);
    }
    return null;
}

function setCache(key: string, data: LogsResponse): void {
    if (logCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = logCache.keys().next().value;
        if (oldestKey) logCache.delete(oldestKey);
    }
    logCache.set(key, { data, timestamp: Date.now() });
}

// Parse log level from various formats
function parseLogLevel(logData: any): 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' {
    const level = logData?.level?.toUpperCase() ||
        logData?.data?.level?.toUpperCase() ||
        logData?.logContent?.data?.level?.toUpperCase() ||
        'INFO';

    if (level.includes('ERROR') || level.includes('ERR')) return 'ERROR';
    if (level.includes('WARN')) return 'WARN';
    if (level.includes('DEBUG') || level.includes('TRACE')) return 'DEBUG';
    return 'INFO';
}

// Parse message from various log formats
function parseMessage(logData: any): string {
    return logData?.message ||
        logData?.data?.message ||
        logData?.logContent?.data?.message ||
        logData?.msg ||
        JSON.stringify(logData).slice(0, 500);
}

// Parse trace context from log
function parseTraceContext(logData: any): { traceId?: string; spanId?: string } {
    return {
        traceId: logData?.traceId || logData?.trace_id || logData?.data?.traceId,
        spanId: logData?.spanId || logData?.span_id || logData?.data?.spanId
    };
}

const OFFLINE_RESPONSE: LogsResponse = {
    logs: [],
    totalCount: 0,
    status: 'unavailable',
    source: 'none'
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const agent = searchParams.get('agent') || ''; // Empty = all agents
    const level = searchParams.get('level') || ''; // INFO, WARN, ERROR, DEBUG
    const search = searchParams.get('search') || '';
    const hoursBack = Math.min(parseInt(searchParams.get('hours') || '1', 10), 72);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const live = searchParams.get('live') === 'true';
    const skipCache = searchParams.get('skipCache') === 'true';

    // Build cache key
    const cacheParams = {
        agent,
        level,
        search,
        hoursBack: hoursBack.toString(),
        limit: limit.toString()
    };
    const cacheKey = getCacheKey(cacheParams);

    // Check cache (shorter TTL for live mode)
    if (!skipCache) {
        const cacheTTL = live ? 10000 : CACHE_TTL_MS;
        const cached = getFromCache(cacheKey, cacheTTL);
        if (cached) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
                cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
            });
        }
    }

    // Validate configuration
    if (!COMPARTMENT_ID) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'pending_config',
            message: 'OCI_COMPARTMENT_ID not configured'
        });
    }

    // Determine which log OCIDs to query
    let logOcidsToQuery: { agent: string; ocid: string }[] = [];

    if (agent && AGENT_LOG_OCIDS[agent]) {
        // Single agent
        logOcidsToQuery = [{ agent, ocid: AGENT_LOG_OCIDS[agent]! }];
    } else if (!agent) {
        // All agents with configured OCIDs
        logOcidsToQuery = Object.entries(AGENT_LOG_OCIDS)
            .filter(([, ocid]) => ocid)
            .map(([name, ocid]) => ({ agent: name, ocid: ocid! }));
    }

    if (logOcidsToQuery.length === 0) {
        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'pending_config',
            message: `No log OCID configured for agent: ${agent || 'any'}`
        });
    }

    try {
        const provider = getProvider();
        const client = new loggingsearch.LogSearchClient({
            authenticationDetailsProvider: provider
        });
        client.region = common.Region.fromRegionId(REGION);

        // Build time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

        // Query logs for each agent in parallel
        const logsPerAgent = await Promise.all(
            logOcidsToQuery.map(async ({ agent: agentName, ocid }) => {
                try {
                    // Build search query
                    let searchQuery = `search "${COMPARTMENT_ID}/${LOG_GROUP_ID}/${ocid}"`;

                    // Add level filter
                    if (level) {
                        searchQuery += ` | where data.level = '${level.toLowerCase()}' OR data.level = '${level.toUpperCase()}'`;
                    }

                    // Add text search
                    if (search) {
                        searchQuery += ` | where data.message =~ '${search}' OR logContent =~ '${search}'`;
                    }

                    // Sort and limit
                    searchQuery += ` | sort by datetime desc`;

                    const searchRequest: loggingsearch.requests.SearchLogsRequest = {
                        searchLogsDetails: {
                            timeStart: startTime,
                            timeEnd: endTime,
                            searchQuery: searchQuery,
                            isReturnFieldInfo: false
                        }
                    };

                    const response = await client.searchLogs(searchRequest);

                    // Transform logs
                    const logs: LogEntry[] = (response.searchResponse?.results || [])
                        .slice(0, Math.ceil(limit / logOcidsToQuery.length))
                        .map((result: any, index: number) => {
                            const logData = result.data || result;
                            const traceContext = parseTraceContext(logData);

                            return {
                                id: `${agentName}-${result.data?.datetime || index}-${index}`,
                                timestamp: result.data?.datetime || logData.timestamp || new Date().toISOString(),
                                source: ocid.split('.').pop() || 'unknown',
                                agent: agentName,
                                level: parseLogLevel(logData),
                                message: parseMessage(logData),
                                traceId: traceContext.traceId,
                                spanId: traceContext.spanId,
                                raw: logData
                            };
                        });

                    return { agent: agentName, logs, status: 'connected' };

                } catch (error: any) {
                    console.error(`Error fetching logs for agent ${agentName}:`, error.message);
                    return { agent: agentName, logs: [], status: 'error', error: error.message };
                }
            })
        );

        // Merge and sort all logs
        const allLogs = logsPerAgent
            .flatMap(result => result.logs)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);

        const result: LogsResponse = {
            logs: allLogs,
            totalCount: allLogs.length,
            status: logsPerAgent.some(r => r.status === 'connected') ? 'connected' : 'error',
            source: 'oci-logging',
            agent: agent || 'all'
        };

        // Cache the result
        setCache(cacheKey, result);

        return NextResponse.json({
            ...result,
            params: cacheParams,
            agentStatus: logsPerAgent.map(r => ({ agent: r.agent, status: r.status })),
            availableAgents: Object.keys(AGENT_LOG_OCIDS).filter(k => AGENT_LOG_OCIDS[k]),
            timeRange: {
                start: startTime.toISOString(),
                end: endTime.toISOString()
            }
        });

    } catch (error: any) {
        console.error('Agent Logs API error:', error);

        return NextResponse.json({
            ...OFFLINE_RESPONSE,
            status: 'error',
            message: error.message || 'Failed to fetch agent logs',
            params: cacheParams
        });
    }
}

// GET endpoint for available agents
export async function OPTIONS() {
    const availableAgents = Object.entries(AGENT_LOG_OCIDS)
        .filter(([, ocid]) => ocid)
        .map(([name, ocid]) => ({
            name,
            configured: true,
            logId: ocid?.slice(-20) + '...' // Truncated for display
        }));

    return NextResponse.json({
        availableAgents,
        totalConfigured: availableAgents.length,
        logGroupId: LOG_GROUP_ID ? LOG_GROUP_ID.slice(-20) + '...' : 'not configured'
    });
}

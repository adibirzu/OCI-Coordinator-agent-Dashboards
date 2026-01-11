'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styles from './TraceViewer.module.css';

// Types
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

interface TraceDetail {
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

interface TraceListResponse {
    traces: TraceSummary[];
    totalCount: number;
    status: string;
    source: string;
    message?: string;
    cached?: boolean;
    timeRange?: {
        start: string;
        end: string;
    };
}

// Helper functions
function formatDuration(ms: number): string {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
}

function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function formatTimeAgo(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

// Duration severity classification for visual indicators
function getDurationSeverity(ms: number): 'fast' | 'normal' | 'slow' | 'critical' {
    if (ms < 100) return 'fast';
    if (ms < 1000) return 'normal';
    if (ms < 5000) return 'slow';
    return 'critical';
}

// LLM Token extraction from span tags - checks various OpenTelemetry semantic conventions
interface LLMTokenInfo {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
    provider?: string;
}

function extractLLMTokens(tags: Record<string, string>): LLMTokenInfo | null {
    const tokenKeys = {
        input: ['gen_ai.usage.input_tokens', 'llm.usage.prompt_tokens', 'ai.tokens.prompt', 'llm.request.tokens'],
        output: ['gen_ai.usage.output_tokens', 'llm.usage.completion_tokens', 'ai.tokens.completion', 'llm.response.tokens'],
        total: ['gen_ai.usage.total_tokens', 'llm.usage.total_tokens', 'llm.token_count', 'ai.tokens.total'],
        model: ['gen_ai.request.model', 'llm.model', 'llm.request.model', 'ai.model'],
        provider: ['gen_ai.system', 'llm.provider', 'ai.provider']
    };

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let totalTokens: number | undefined;
    let model: string | undefined;
    let provider: string | undefined;

    for (const key of tokenKeys.input) {
        if (tags[key]) {
            inputTokens = parseInt(tags[key], 10);
            break;
        }
    }
    for (const key of tokenKeys.output) {
        if (tags[key]) {
            outputTokens = parseInt(tags[key], 10);
            break;
        }
    }
    for (const key of tokenKeys.total) {
        if (tags[key]) {
            totalTokens = parseInt(tags[key], 10);
            break;
        }
    }
    for (const key of tokenKeys.model) {
        if (tags[key]) {
            model = tags[key];
            break;
        }
    }
    for (const key of tokenKeys.provider) {
        if (tags[key]) {
            provider = tags[key];
            break;
        }
    }

    // If we found any token info, return it
    if (inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined || model || provider) {
        return {
            inputTokens,
            outputTokens,
            totalTokens: totalTokens ?? (inputTokens && outputTokens ? inputTokens + outputTokens : undefined),
            model,
            provider
        };
    }
    return null;
}

// Span kind badge colors and labels
const SPAN_KIND_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
    'SERVER': { label: 'SRV', color: '#4ecdc4', bgColor: '#4ecdc420' },
    'CLIENT': { label: 'CLI', color: '#ff9f43', bgColor: '#ff9f4320' },
    'PRODUCER': { label: 'PRD', color: '#6bcb77', bgColor: '#6bcb7720' },
    'CONSUMER': { label: 'CNS', color: '#c56cf0', bgColor: '#c56cf020' },
    'INTERNAL': { label: 'INT', color: '#888', bgColor: '#88888820' },
};

function getServiceColor(serviceName: string): string {
    const colors = [
        '#00d4ff', '#ff6b6b', '#4ecdc4', '#ffd93d',
        '#6bcb77', '#c56cf0', '#ff9f43', '#54a0ff'
    ];
    let hash = 0;
    for (let i = 0; i < serviceName.length; i++) {
        hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// Span Row Component for waterfall view
interface SpanRowProps {
    span: SpanDetail;
    depth: number;
    traceStartTime: number;
    traceDuration: number;
    isExpanded: boolean;
    onToggle: () => void;
    hasChildren: boolean;
}

function SpanRow({ span, depth, traceStartTime, traceDuration, isExpanded, onToggle, hasChildren }: SpanRowProps) {
    const spanStart = new Date(span.timeStarted).getTime();
    const offsetPercent = ((spanStart - traceStartTime) / traceDuration) * 100;
    const widthPercent = Math.max((span.durationInMs / traceDuration) * 100, 0.5);
    const serviceColor = getServiceColor(span.serviceName);
    const llmTokens = extractLLMTokens(span.tags);
    const kindConfig = SPAN_KIND_CONFIG[span.spanKind?.toUpperCase()] || SPAN_KIND_CONFIG['INTERNAL'];

    return (
        <div className={`${styles.spanRow} ${span.isError ? styles.spanError : ''}`}>
            <div className={styles.spanInfo} style={{ paddingLeft: `${depth * 16 + 8}px` }}>
                {hasChildren && (
                    <button
                        className={`${styles.expandBtn} ${isExpanded ? styles.expanded : ''}`}
                        onClick={onToggle}
                    >
                        ▶
                    </button>
                )}
                {!hasChildren && <span className={styles.expandPlaceholder} />}
                {/* Span Kind Badge */}
                <span
                    className={styles.kindBadge}
                    style={{ backgroundColor: kindConfig.bgColor, color: kindConfig.color }}
                    title={span.spanKind}
                >
                    {kindConfig.label}
                </span>
                <span
                    className={styles.serviceBadge}
                    style={{ backgroundColor: `${serviceColor}20`, borderColor: serviceColor, color: serviceColor }}
                >
                    {span.serviceName}
                </span>
                <span className={styles.spanName} title={span.operationName}>
                    {span.operationName}
                </span>
                {span.isError && <span className={styles.errorIcon}>⚠</span>}
                {/* LLM Token Badge */}
                {llmTokens && (
                    <span className={styles.tokenBadge} title={`Tokens: ${llmTokens.totalTokens || (llmTokens.inputTokens || 0) + (llmTokens.outputTokens || 0)}`}>
                        🤖 {llmTokens.totalTokens || ((llmTokens.inputTokens || 0) + (llmTokens.outputTokens || 0))}
                    </span>
                )}
            </div>
            <div className={styles.spanTimeline}>
                <div className={styles.timelineTrack}>
                    <div
                        className={`${styles.timelineBar} ${span.isError ? styles.timelineBarError : ''}`}
                        style={{
                            left: `${offsetPercent}%`,
                            width: `${widthPercent}%`,
                            backgroundColor: span.isError ? '#ff6b6b' : serviceColor
                        }}
                    >
                        <span className={styles.durationLabel}>{formatDuration(span.durationInMs)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Span Detail Panel
interface SpanDetailPanelProps {
    span: SpanDetail;
    onClose: () => void;
    onTagClick?: (key: string, value: string) => void;
}

function SpanDetailPanel({ span, onClose, onTagClick }: SpanDetailPanelProps) {
    const llmTokens = extractLLMTokens(span.tags);
    const kindConfig = SPAN_KIND_CONFIG[span.spanKind?.toUpperCase()] || SPAN_KIND_CONFIG['INTERNAL'];

    return (
        <div className={styles.spanDetailPanel}>
            <div className={styles.panelHeader}>
                <h4>{span.operationName}</h4>
                <button className={styles.closeBtn} onClick={onClose}>×</button>
            </div>
            <div className={styles.panelContent}>
                <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Service</span>
                        <span className={styles.detailValue}>{span.serviceName}</span>
                    </div>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Duration</span>
                        <span className={styles.detailValue}>{formatDuration(span.durationInMs)}</span>
                    </div>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Status</span>
                        <span className={`${styles.detailValue} ${span.isError ? styles.statusError : styles.statusOk}`}>
                            {span.status}
                        </span>
                    </div>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Kind</span>
                        <span
                            className={styles.detailValue}
                            style={{ color: kindConfig.color }}
                        >
                            {span.spanKind}
                        </span>
                    </div>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Started</span>
                        <span className={styles.detailValue}>{formatTime(span.timeStarted)}</span>
                    </div>
                    <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Ended</span>
                        <span className={styles.detailValue}>{formatTime(span.timeEnded)}</span>
                    </div>
                </div>

                {/* LLM Token Info Section */}
                {llmTokens && (
                    <div className={styles.llmSection}>
                        <h5>🤖 LLM Usage</h5>
                        <div className={styles.llmGrid}>
                            {llmTokens.model && (
                                <div className={styles.llmItem}>
                                    <span className={styles.llmLabel}>Model</span>
                                    <span className={styles.llmValue}>{llmTokens.model}</span>
                                </div>
                            )}
                            {llmTokens.provider && (
                                <div className={styles.llmItem}>
                                    <span className={styles.llmLabel}>Provider</span>
                                    <span className={styles.llmValue}>{llmTokens.provider}</span>
                                </div>
                            )}
                            {llmTokens.inputTokens !== undefined && (
                                <div className={styles.llmItem}>
                                    <span className={styles.llmLabel}>Input Tokens</span>
                                    <span className={styles.llmValue}>{llmTokens.inputTokens.toLocaleString()}</span>
                                </div>
                            )}
                            {llmTokens.outputTokens !== undefined && (
                                <div className={styles.llmItem}>
                                    <span className={styles.llmLabel}>Output Tokens</span>
                                    <span className={styles.llmValue}>{llmTokens.outputTokens.toLocaleString()}</span>
                                </div>
                            )}
                            {llmTokens.totalTokens !== undefined && (
                                <div className={styles.llmItem}>
                                    <span className={styles.llmLabel}>Total Tokens</span>
                                    <span className={`${styles.llmValue} ${styles.llmTotal}`}>{llmTokens.totalTokens.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {span.errorMessage && (
                    <div className={styles.errorSection}>
                        <h5>Error</h5>
                        <pre className={styles.errorMessage}>{span.errorMessage}</pre>
                    </div>
                )}

                {Object.keys(span.tags).length > 0 && (
                    <div className={styles.tagsSection}>
                        <h5>Tags ({Object.keys(span.tags).length})</h5>
                        <p className={styles.tagHint}>Click a tag value to filter traces</p>
                        <div className={styles.tagsList}>
                            {Object.entries(span.tags).map(([key, value]) => (
                                <div key={key} className={styles.tagItem}>
                                    <span className={styles.tagKey}>{key}</span>
                                    {onTagClick ? (
                                        <button
                                            className={styles.tagValueClickable}
                                            onClick={() => onTagClick(key, String(value))}
                                            title={`Filter by ${key}:${String(value)}`}
                                        >
                                            {String(value)}
                                        </button>
                                    ) : (
                                        <span className={styles.tagValue}>{String(value)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {span.logs.length > 0 && (
                    <div className={styles.logsSection}>
                        <h5>Logs ({span.logs.length})</h5>
                        <div className={styles.logsList}>
                            {span.logs.map((log, idx) => (
                                <div key={idx} className={styles.logItem}>
                                    <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
                                    <span className={styles.logEvent}>{log.event}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Waterfall View Component
interface WaterfallViewProps {
    traceDetail: TraceDetail;
    onSpanClick: (span: SpanDetail) => void;
}

function WaterfallView({ traceDetail, onSpanClick }: WaterfallViewProps) {
    const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

    // Build span tree and calculate positions
    const { orderedSpans, spanDepths, spanChildren } = useMemo(() => {
        const children: Map<string | null, SpanDetail[]> = new Map();
        const depths: Map<string, number> = new Map();

        // Group spans by parent
        traceDetail.spans.forEach(span => {
            const parentKey = span.parentSpanKey;
            if (!children.has(parentKey)) {
                children.set(parentKey, []);
            }
            children.get(parentKey)!.push(span);
        });

        // Sort children by start time
        children.forEach(list => {
            list.sort((a, b) => new Date(a.timeStarted).getTime() - new Date(b.timeStarted).getTime());
        });

        // DFS to get ordered spans with depths
        const ordered: SpanDetail[] = [];
        const traverse = (parentKey: string | null, depth: number) => {
            const childSpans = children.get(parentKey) || [];
            childSpans.forEach(span => {
                depths.set(span.spanKey, depth);
                ordered.push(span);
                if (expandedSpans.has(span.spanKey) || expandedSpans.size === 0) {
                    traverse(span.spanKey, depth + 1);
                }
            });
        };
        traverse(null, 0);

        // If no hierarchy found, show all spans flat
        if (ordered.length === 0) {
            traceDetail.spans.forEach((span, idx) => {
                depths.set(span.spanKey, 0);
                ordered.push(span);
            });
        }

        return { orderedSpans: ordered, spanDepths: depths, spanChildren: children };
    }, [traceDetail.spans, expandedSpans]);

    const traceStartTime = useMemo(() => {
        const times = traceDetail.spans.map(s => new Date(s.timeStarted).getTime());
        return Math.min(...times);
    }, [traceDetail.spans]);

    const toggleExpand = (spanKey: string) => {
        setExpandedSpans(prev => {
            const next = new Set(prev);
            if (next.has(spanKey)) {
                next.delete(spanKey);
            } else {
                next.add(spanKey);
            }
            return next;
        });
    };

    // Expand all by default on first render
    useEffect(() => {
        if (expandedSpans.size === 0) {
            const allKeys = new Set(traceDetail.spans.map(s => s.spanKey));
            setExpandedSpans(allKeys);
        }
    }, [traceDetail.spans]);

    return (
        <div className={styles.waterfall}>
            <div className={styles.waterfallHeader}>
                <div className={styles.waterfallHeaderInfo}>Service / Operation</div>
                <div className={styles.waterfallHeaderTimeline}>
                    <span>0ms</span>
                    <span>{formatDuration(traceDetail.totalDurationMs / 2)}</span>
                    <span>{formatDuration(traceDetail.totalDurationMs)}</span>
                </div>
            </div>
            <div className={styles.waterfallBody}>
                {orderedSpans.map(span => (
                    <div key={span.spanKey} onClick={() => onSpanClick(span)}>
                        <SpanRow
                            span={span}
                            depth={spanDepths.get(span.spanKey) || 0}
                            traceStartTime={traceStartTime}
                            traceDuration={traceDetail.totalDurationMs}
                            isExpanded={expandedSpans.has(span.spanKey)}
                            onToggle={() => toggleExpand(span.spanKey)}
                            hasChildren={(spanChildren.get(span.spanKey)?.length || 0) > 0}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

// Main TraceViewer Component
interface TraceViewerProps {
    instanceId?: string;
    instanceName?: string;
}

export function TraceViewer({ instanceId, instanceName }: TraceViewerProps) {
    const [traces, setTraces] = useState<TraceSummary[]>([]);
    const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
    const [selectedSpan, setSelectedSpan] = useState<SpanDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('loading');

    // Filters - default to 24h for better chance of having trace data
    const [hoursBack, setHoursBack] = useState(24);
    const [statusFilter, setStatusFilter] = useState('');
    const [serviceFilter, setServiceFilter] = useState('');

    // Tag-based filtering (Datadog-style drilldown)
    const [tagFilters, setTagFilters] = useState<Record<string, string>>({});

    // Add a tag filter when clicking on a tag value
    // Map known tags to existing filters for server-side filtering
    const addTagFilter = useCallback((key: string, value: string) => {
        // Map service-related tags to the service filter dropdown
        const serviceKeys = ['service.name', 'serviceName', 'service_name'];
        if (serviceKeys.includes(key)) {
            setServiceFilter(value);
            return;
        }

        // Map status-related tags to status filter
        if (key === 'otel.status_code' || key === 'status') {
            const statusMap: Record<string, string> = {
                'OK': 'success',
                'ERROR': 'error',
                'UNSET': '',
                'success': 'success',
                'error': 'error'
            };
            const mappedStatus = statusMap[value] || '';
            setStatusFilter(mappedStatus);
            return;
        }

        // For other tags, add to tag filters (for trace-level matching)
        setTagFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    // Remove a tag filter
    const removeTagFilter = useCallback((key: string) => {
        setTagFilters(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    // Clear all tag filters
    const clearTagFilters = useCallback(() => {
        setTagFilters({});
    }, []);

    // Trace ID search
    const [traceIdSearch, setTraceIdSearch] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Search for a specific trace by ID
    const searchTraceById = useCallback(async () => {
        const cleanTraceId = traceIdSearch.trim();
        if (!cleanTraceId) return;

        setIsSearching(true);
        setError(null);
        try {
            const res = await fetch(`/api/apm/drilldown?traceKey=${encodeURIComponent(cleanTraceId)}`);
            const data: TraceDetail = await res.json();

            if (data.status === 'connected' && data.spans && data.spans.length > 0) {
                setSelectedTrace(data);
                setSelectedSpan(null);
                setStatus('connected');
            } else if (data.status === 'not_found' || (data.spans && data.spans.length === 0)) {
                setError(`Trace not found: ${cleanTraceId.slice(0, 16)}...`);
            } else {
                setError('Failed to search for trace');
            }
        } catch (e) {
            setError('Failed to search for trace');
            console.error('Trace search error:', e);
        } finally {
            setIsSearching(false);
        }
    }, [traceIdSearch]);

    // Handle Enter key for search
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && traceIdSearch.trim()) {
            searchTraceById();
        }
    };

    // Fetch trace list
    const fetchTraces = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                hours: hoursBack.toString(),
                limit: '50'
            });
            if (statusFilter) params.set('status', statusFilter);
            if (serviceFilter) params.set('service', serviceFilter);

            const res = await fetch(`/api/apm/traces?${params}`);
            const data: TraceListResponse = await res.json();

            if (data.status === 'connected') {
                setTraces(data.traces);
                setStatus('connected');
            } else if (data.status === 'pending_config') {
                setStatus('pending_config');
                setError('APM not configured');
            } else {
                setStatus('error');
                setError(data.message || 'Failed to fetch traces');
            }
        } catch (e) {
            setStatus('error');
            setError('Failed to fetch traces');
            console.error('Trace fetch error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [hoursBack, statusFilter, serviceFilter]);

    // Fetch trace detail (on-demand drilldown)
    const fetchTraceDetail = useCallback(async (traceKey: string) => {
        setIsLoadingDetail(true);
        setSelectedSpan(null);
        try {
            const res = await fetch(`/api/apm/drilldown?traceKey=${encodeURIComponent(traceKey)}`);
            const data: TraceDetail = await res.json();

            if (data.status === 'connected' || data.status === 'not_found') {
                setSelectedTrace(data);
            } else {
                setError('Failed to load trace details');
            }
        } catch (e) {
            setError('Failed to load trace details');
            console.error('Drilldown error:', e);
        } finally {
            setIsLoadingDetail(false);
        }
    }, []);

    useEffect(() => {
        fetchTraces();
    }, [fetchTraces]);

    // Services for filter dropdown
    const uniqueServices = useMemo(() => {
        const services = new Set(traces.map(t => t.rootSpanServiceName));
        return Array.from(services).filter(Boolean);
    }, [traces]);

    // Filter traces by tag filters (Datadog-style drilldown)
    // Note: Since TraceSummary only has limited attributes, we filter by available fields
    // Service/status tags are mapped to dropdown filters in addTagFilter
    const filteredTraces = useMemo(() => {
        const filterEntries = Object.entries(tagFilters);
        if (filterEntries.length === 0) {
            return traces;
        }

        return traces.filter(trace => {
            // Match tag filters against trace-level attributes
            return filterEntries.every(([key, value]) => {
                // Map tag keys to TraceSummary fields
                const traceValueMap: Record<string, string | number> = {
                    'operation.name': trace.rootSpanOperationName,
                    'operationName': trace.rootSpanOperationName,
                    'span.name': trace.rootSpanOperationName,
                    'trace.status': trace.traceStatus,
                    'error.type': trace.traceErrorType,
                };

                const traceValue = traceValueMap[key];
                if (traceValue !== undefined) {
                    return String(traceValue) === value;
                }

                // For unmapped tags, we can't filter at trace level
                // These will be shown as "active but not filterable" in the UI
                return true;
            });
        });
    }, [traces, tagFilters]);

    // Aggregate LLM token stats for selected trace
    const traceLLMStats = useMemo(() => {
        if (!selectedTrace?.spans) return null;

        let totalInput = 0;
        let totalOutput = 0;
        let totalTokens = 0;
        let llmSpanCount = 0;
        const models = new Set<string>();
        const providers = new Set<string>();

        for (const span of selectedTrace.spans) {
            const llmInfo = extractLLMTokens(span.tags);
            if (llmInfo) {
                llmSpanCount++;
                if (llmInfo.inputTokens) totalInput += llmInfo.inputTokens;
                if (llmInfo.outputTokens) totalOutput += llmInfo.outputTokens;
                if (llmInfo.totalTokens) {
                    totalTokens += llmInfo.totalTokens;
                } else if (llmInfo.inputTokens || llmInfo.outputTokens) {
                    totalTokens += (llmInfo.inputTokens || 0) + (llmInfo.outputTokens || 0);
                }
                if (llmInfo.model) models.add(llmInfo.model);
                if (llmInfo.provider) providers.add(llmInfo.provider);
            }
        }

        if (llmSpanCount === 0) return null;

        return {
            totalInput,
            totalOutput,
            totalTokens,
            llmSpanCount,
            models: Array.from(models),
            providers: Array.from(providers)
        };
    }, [selectedTrace?.spans]);

    if (isLoading && traces.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner} />
                    <div className={styles.loadingText}>Loading traces...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.headerIcon}>🔍</div>
                    <h3 className={styles.headerTitle}>Distributed Traces</h3>
                </div>
                <div className={`${styles.statusBadge} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
                    <span className={styles.statusDot} />
                    <span>{status}</span>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label>Time Range</label>
                    <select
                        value={hoursBack}
                        onChange={(e) => setHoursBack(Number(e.target.value))}
                        className={styles.filterSelect}
                    >
                        <option value={0.25}>Last 15 min</option>
                        <option value={0.5}>Last 30 min</option>
                        <option value={1}>Last 1 hour</option>
                        <option value={6}>Last 6 hours</option>
                        <option value={24}>Last 24 hours</option>
                        <option value={72}>Last 3 days</option>
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label>Status</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={styles.filterSelect}
                    >
                        <option value="">All</option>
                        <option value="ERROR">Errors Only</option>
                        <option value="OK">Success Only</option>
                    </select>
                </div>
                <div className={styles.filterGroup}>
                    <label>Service</label>
                    <select
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        className={styles.filterSelect}
                    >
                        <option value="">All Services</option>
                        {uniqueServices.map(svc => (
                            <option key={svc} value={svc}>{svc}</option>
                        ))}
                    </select>
                </div>
                <button className={styles.refreshBtn} onClick={fetchTraces} disabled={isLoading}>
                    {isLoading ? '⟳' : '↻'} Refresh
                </button>
                <div className={styles.filterDivider} />
                <div className={styles.traceSearchGroup}>
                    <label>Search by Trace ID</label>
                    <div className={styles.traceSearchInput}>
                        <input
                            type="text"
                            value={traceIdSearch}
                            onChange={(e) => setTraceIdSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Enter trace ID (e.g., 479e4f67fa61992...)"
                            className={styles.searchInput}
                        />
                        <button
                            className={styles.searchBtn}
                            onClick={searchTraceById}
                            disabled={isSearching || !traceIdSearch.trim()}
                        >
                            {isSearching ? '⟳' : '🔍'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Active Tag Filters */}
            {Object.keys(tagFilters).length > 0 && (
                <div className={styles.activeTagFilters}>
                    <span className={styles.tagFiltersLabel}>Active Filters:</span>
                    {Object.entries(tagFilters).map(([key, value]) => (
                        <span key={key} className={styles.tagFilterChip}>
                            <span className={styles.tagFilterKey}>{key}:</span>
                            <span className={styles.tagFilterValue}>{value}</span>
                            <button
                                className={styles.tagFilterRemove}
                                onClick={() => removeTagFilter(key)}
                                title={`Remove filter ${key}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    <button
                        className={styles.clearAllFilters}
                        onClick={clearTagFilters}
                    >
                        Clear All
                    </button>
                </div>
            )}

            {error && status !== 'pending_config' && (
                <div className={styles.errorBanner}>{error}</div>
            )}

            <div className={styles.content}>
                {/* Trace List */}
                <div className={`${styles.traceList} ${selectedTrace ? styles.traceListNarrow : ''}`}>
                    <div className={styles.traceListHeader}>
                        <span className={styles.traceListTitle}>
                            Traces ({Object.keys(tagFilters).length > 0 ? `${filteredTraces.length}/${traces.length}` : traces.length})
                        </span>
                    </div>
                    {traces.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>📭</div>
                            <div className={styles.emptyText}>
                                {status === 'pending_config'
                                    ? 'APM Domain not configured'
                                    : status === 'error'
                                    ? 'Error fetching traces'
                                    : 'No traces found for the selected filters'}
                            </div>
                            {status === 'connected' && hoursBack < 24 && (
                                <button
                                    className={styles.suggestionButton}
                                    onClick={() => setHoursBack(72)}
                                >
                                    Try Last 3 days
                                </button>
                            )}
                        </div>
                    ) : filteredTraces.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>🔍</div>
                            <div className={styles.emptyText}>
                                No traces match the tag filters
                            </div>
                            <button
                                className={styles.suggestionButton}
                                onClick={clearTagFilters}
                            >
                                Clear Tag Filters
                            </button>
                        </div>
                    ) : (
                        <div className={styles.traceItems}>
                            {filteredTraces.map(trace => {
                                const durationSeverity = getDurationSeverity(trace.rootSpanDurationInMs);
                                return (
                                    <div
                                        key={trace.traceKey}
                                        className={`${styles.traceItem} ${selectedTrace?.traceKey === trace.traceKey ? styles.traceItemSelected : ''} ${trace.traceStatus === 'ERROR' ? styles.traceItemError : ''}`}
                                        onClick={() => fetchTraceDetail(trace.traceKey)}
                                    >
                                        <div className={styles.traceItemHeader}>
                                            <span className={styles.traceService}>{trace.rootSpanServiceName}</span>
                                            <div className={styles.traceHeaderBadges}>
                                                {trace.errorSpanCount > 0 && (
                                                    <span className={styles.errorBadge}>
                                                        ⚠ {trace.errorSpanCount}
                                                    </span>
                                                )}
                                                <span className={`${styles.traceStatus} ${trace.traceStatus === 'ERROR' ? styles.statusError : styles.statusOk}`}>
                                                    {trace.traceStatus}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={styles.traceOperation} title={trace.rootSpanOperationName}>
                                            {trace.rootSpanOperationName}
                                        </div>
                                        <div className={styles.traceItemFooter}>
                                            <span
                                                className={`${styles.traceDuration} ${styles[`duration${durationSeverity.charAt(0).toUpperCase() + durationSeverity.slice(1)}`]}`}
                                                title={`Duration: ${formatDuration(trace.rootSpanDurationInMs)}`}
                                            >
                                                ⏱ {formatDuration(trace.rootSpanDurationInMs)}
                                            </span>
                                            <span className={styles.traceSpans} title={`${trace.spanCount} spans in this trace`}>
                                                <span className={styles.spanIcon}>◆</span>{trace.spanCount}
                                            </span>
                                            <span
                                                className={styles.traceTime}
                                                title={formatTime(trace.timeEarliestSpanStarted)}
                                            >
                                                {formatTimeAgo(trace.timeEarliestSpanStarted)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Trace Detail View */}
                {selectedTrace && (
                    <div className={styles.traceDetail}>
                        <div className={styles.detailHeader}>
                            <div className={styles.detailHeaderLeft}>
                                <button
                                    className={styles.backBtn}
                                    onClick={() => { setSelectedTrace(null); setSelectedSpan(null); }}
                                >
                                    ← Back
                                </button>
                                <h4>Trace: {selectedTrace.traceKey.slice(0, 16)}...</h4>
                            </div>
                            <div className={styles.detailStats}>
                                <span className={styles.statItem}>
                                    <span className={styles.statLabel}>Duration</span>
                                    <span className={styles.statValue}>{formatDuration(selectedTrace.totalDurationMs)}</span>
                                </span>
                                <span className={styles.statItem}>
                                    <span className={styles.statLabel}>Spans</span>
                                    <span className={styles.statValue}>{selectedTrace.totalSpans}</span>
                                </span>
                                <span className={styles.statItem}>
                                    <span className={styles.statLabel}>Services</span>
                                    <span className={styles.statValue}>{selectedTrace.services.length}</span>
                                </span>
                                {selectedTrace.errorSpans > 0 && (
                                    <span className={`${styles.statItem} ${styles.statError}`}>
                                        <span className={styles.statLabel}>Errors</span>
                                        <span className={styles.statValue}>{selectedTrace.errorSpans}</span>
                                    </span>
                                )}
                                {traceLLMStats && (
                                    <span className={`${styles.statItem} ${styles.statLlm}`}>
                                        <span className={styles.statLabel}>LLM Calls</span>
                                        <span className={styles.statValue}>{traceLLMStats.llmSpanCount}</span>
                                    </span>
                                )}
                                {traceLLMStats && traceLLMStats.totalTokens > 0 && (
                                    <span className={`${styles.statItem} ${styles.statLlm}`}>
                                        <span className={styles.statLabel}>Tokens</span>
                                        <span className={styles.statValue} title={`In: ${traceLLMStats.totalInput.toLocaleString()} / Out: ${traceLLMStats.totalOutput.toLocaleString()}`}>
                                            {traceLLMStats.totalTokens.toLocaleString()}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {isLoadingDetail ? (
                            <div className={styles.detailLoading}>
                                <div className={styles.loadingSpinner} />
                                <span>Loading trace details...</span>
                            </div>
                        ) : selectedTrace.spans.length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon}>🔍</div>
                                <div className={styles.emptyText}>No spans found for this trace</div>
                            </div>
                        ) : (
                            <div className={styles.detailBody}>
                                <WaterfallView
                                    traceDetail={selectedTrace}
                                    onSpanClick={setSelectedSpan}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Span Detail Side Panel */}
                {selectedSpan && (
                    <SpanDetailPanel
                        span={selectedSpan}
                        onClose={() => setSelectedSpan(null)}
                        onTagClick={addTagFilter}
                    />
                )}
            </div>
        </div>
    );
}

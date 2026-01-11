'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import styles from './ApmMetrics.module.css';
import { MetricBrowser, QuickMetricSelector } from './MetricBrowser';

interface Datapoint {
    timestamp: string;
    value: number;
}

interface MetricItem {
    name: string;
    namespace: string;
    dimensions?: Record<string, string>;
    datapoints: Datapoint[];
}

interface AvailableMetric {
    id: string;
    name: string;
    namespace: string;
}

interface DimensionFilter {
    key: string;
    value: string;
}

interface ApmResponse {
    status: 'connected' | 'disconnected' | 'unavailable' | 'pending_config' | string;
    items?: MetricItem[];
    availableMetrics?: AvailableMetric[];
    metricInfo?: { displayName: string; namespace: string };
    params?: { metric: string; hoursBack: number };
    activeFilter?: DimensionFilter;
    // Legacy fields
    span_count_last_hour?: number;
    error_rate?: string | number;
    avg_latency_ms?: number;
    throughput?: number;
    apdex_score?: number;
    active_traces?: number;
    cpu_usage?: number;
    memory_usage?: number;
    request_rate?: number;
    p50_latency?: number;
    p95_latency?: number;
    p99_latency?: number;
}

interface CircularProgressProps {
    value: number;
    max?: number;
    size?: number;
    strokeWidth?: number;
    variant?: 'success' | 'warning' | 'error' | 'mcp';
    label?: string;
}

function CircularProgress({ value, max = 100, size = 60, strokeWidth = 4, variant = 'mcp', label }: CircularProgressProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const percentage = Math.min(Math.max(value / max, 0), 1);
    const offset = circumference - percentage * circumference;

    const variantClass = {
        success: styles.circularFillSuccess,
        warning: styles.circularFillWarning,
        error: styles.circularFillError,
        mcp: styles.circularFillMcp,
    }[variant];

    return (
        <div className={styles.circularProgress} style={{ width: size, height: size }}>
            <svg width={size} height={size}>
                <circle
                    className={styles.circularBg}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
                <circle
                    className={`${styles.circularFill} ${variantClass}`}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                />
            </svg>
            <div className={styles.circularValue}>
                {label || `${Math.round(value)}%`}
            </div>
        </div>
    );
}

interface SparklineProps {
    data: number[];
}

function Sparkline({ data }: SparklineProps) {
    const maxVal = Math.max(...data, 1);
    return (
        <div className={styles.sparklineContainer}>
            <div className={styles.sparkline}>
                {data.map((val, i) => (
                    <div
                        key={i}
                        className={styles.sparklineBar}
                        style={{ height: `${(val / maxVal) * 100}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

interface ProgressBarProps {
    value: number;
    max?: number;
    variant?: 'success' | 'warning' | 'error' | 'mcp';
}

function ProgressBar({ value, max = 100, variant = 'mcp' }: ProgressBarProps) {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const variantClass = {
        success: styles.progressSuccess,
        warning: styles.progressWarning,
        error: styles.progressError,
        mcp: styles.progressMcp,
    }[variant];

    return (
        <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
                <div
                    className={`${styles.progressFill} ${variantClass}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

interface MetricLineChartProps {
    datapoints: Datapoint[];
    height?: number;
    color?: string;
    showArea?: boolean;
    showPoints?: boolean;
}

function MetricLineChart({ datapoints, height = 80, color = '#00d4aa', showArea = true, showPoints = false }: MetricLineChartProps) {
    if (!datapoints || datapoints.length < 2) {
        return (
            <div className={styles.chartEmpty}>
                <span>No data available</span>
            </div>
        );
    }

    const width = 280;
    const padding = { top: 10, right: 10, bottom: 20, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Extract values and calculate bounds
    const values = datapoints.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    // Scale functions
    const scaleX = (i: number) => padding.left + (i / (datapoints.length - 1)) * chartWidth;
    const scaleY = (v: number) => padding.top + chartHeight - ((v - minVal) / range) * chartHeight;

    // Build path
    const pathPoints = datapoints.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`);
    const linePath = `M ${pathPoints.join(' L ')}`;
    const areaPath = `${linePath} L ${scaleX(datapoints.length - 1)},${padding.top + chartHeight} L ${padding.left},${padding.top + chartHeight} Z`;

    // Y-axis labels (3 ticks)
    const yTicks = [minVal, (minVal + maxVal) / 2, maxVal];

    // X-axis labels (first and last timestamp)
    const formatTime = (ts: string) => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    return (
        <div className={styles.lineChartContainer}>
            <svg width={width} height={height} className={styles.lineChartSvg}>
                {/* Grid lines */}
                {yTicks.map((tick, i) => (
                    <line
                        key={i}
                        x1={padding.left}
                        y1={scaleY(tick)}
                        x2={width - padding.right}
                        y2={scaleY(tick)}
                        className={styles.gridLine}
                    />
                ))}

                {/* Area fill */}
                {showArea && (
                    <path d={areaPath} className={styles.chartArea} style={{ fill: `${color}20` }} />
                )}

                {/* Line */}
                <path d={linePath} className={styles.chartLine} style={{ stroke: color }} />

                {/* Data points */}
                {showPoints && datapoints.map((d, i) => (
                    <circle
                        key={i}
                        cx={scaleX(i)}
                        cy={scaleY(d.value)}
                        r={3}
                        className={styles.chartPoint}
                        style={{ fill: color }}
                    />
                ))}

                {/* Y-axis labels */}
                {yTicks.map((tick, i) => (
                    <text
                        key={i}
                        x={padding.left - 5}
                        y={scaleY(tick) + 4}
                        className={styles.axisLabel}
                        textAnchor="end"
                    >
                        {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toFixed(tick < 10 ? 1 : 0)}
                    </text>
                ))}

                {/* X-axis labels */}
                <text x={padding.left} y={height - 4} className={styles.axisLabel}>
                    {formatTime(datapoints[0].timestamp)}
                </text>
                <text x={width - padding.right} y={height - 4} className={styles.axisLabel} textAnchor="end">
                    {formatTime(datapoints[datapoints.length - 1].timestamp)}
                </text>
            </svg>
        </div>
    );
}

interface MetricSelectorProps {
    metrics: AvailableMetric[];
    selected: string;
    onChange: (metricId: string) => void;
}

function MetricSelector({ metrics, selected, onChange }: MetricSelectorProps) {
    // Group metrics by namespace for better organization
    const groupedMetrics = metrics.reduce((acc, m) => {
        const ns = m.namespace || 'other';
        if (!acc[ns]) acc[ns] = [];
        acc[ns].push(m);
        return acc;
    }, {} as Record<string, AvailableMetric[]>);

    return (
        <div className={styles.metricSelector}>
            <select
                value={selected}
                onChange={(e) => onChange(e.target.value)}
                className={styles.metricSelect}
            >
                {Object.entries(groupedMetrics).map(([ns, ms]) => (
                    <optgroup key={ns} label={formatNamespace(ns)}>
                        {ms.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <span className={styles.selectArrow}>▼</span>
        </div>
    );
}

// Format namespace for display (e.g., "oci_computeagent" -> "Compute Agent")
function formatNamespace(ns: string): string {
    return ns
        .replace('oci_', '')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Format dimension key for display (e.g., "resourceId" -> "Resource ID")
function formatDimensionKey(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

// Truncate long values (like OCIDs) for display
function truncateOcid(value: string): string {
    if (value.startsWith('ocid1.') && value.length > 40) {
        // Show first part and last 8 chars
        const parts = value.split('.');
        if (parts.length >= 3) {
            return `${parts[0]}.${parts[1]}...${value.slice(-8)}`;
        }
    }
    return value.length > 35 ? value.slice(0, 32) + '...' : value;
}

function getStatusVariant(status: string): 'connected' | 'disconnected' | 'unavailable' {
    if (status === 'connected' || status === 'healthy' || status === 'ok') return 'connected';
    if (status === 'unavailable' || status === 'unknown') return 'unavailable';
    return 'disconnected';
}

function getErrorRateVariant(rate: number): 'success' | 'warning' | 'error' {
    if (rate <= 1) return 'success';
    if (rate <= 5) return 'warning';
    return 'error';
}

interface ApmMetricsProps {
    instanceId?: string;
    instanceName?: string;
}

export function ApmMetrics({ instanceId, instanceName }: ApmMetricsProps = {}) {
    const [metrics, setMetrics] = useState<ApmResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sparklineData, setSparklineData] = useState<number[]>([]);
    const [selectedMetric, setSelectedMetric] = useState<string>('cpu');
    const [metricData, setMetricData] = useState<MetricItem | null>(null);
    const [availableMetrics, setAvailableMetrics] = useState<AvailableMetric[]>([]);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [dimensionFilter, setDimensionFilter] = useState<DimensionFilter | null>(null);

    // Fetch available metrics list on mount
    useEffect(() => {
        const fetchAvailable = async () => {
            try {
                const res = await fetch('/api/apm?metric=cpu&hoursBack=1');
                if (res.ok) {
                    const data: ApmResponse = await res.json();
                    if (data.availableMetrics) {
                        setAvailableMetrics(data.availableMetrics);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch available metrics", e);
            }
        };
        fetchAvailable();
    }, []);

    // Fetch selected metric data
    const fetchMetricData = useCallback(async (metric: string, showRefreshState = false) => {
        if (showRefreshState) setIsRefreshing(true);
        try {
            // Build URL with dimension filter if active
            let url = `/api/apm?metric=${metric}&hoursBack=1`;

            // Instance filter takes precedence over manual dimension filter
            if (instanceId) {
                url += `&dimensionKey=resourceId&dimensionValue=${encodeURIComponent(instanceId)}`;
            } else if (dimensionFilter) {
                url += `&dimensionKey=${encodeURIComponent(dimensionFilter.key)}&dimensionValue=${encodeURIComponent(dimensionFilter.value)}`;
            }

            const res = await fetch(url);
            if (res.ok) {
                const data: ApmResponse = await res.json();
                setMetrics(data);
                setLastFetched(new Date());
                if (data.items && data.items.length > 0) {
                    setMetricData(data.items[0]);
                    // Update sparkline from datapoints
                    const values = data.items[0].datapoints.map(dp => dp.value);
                    setSparklineData(values.slice(-12));
                } else {
                    setMetricData(null);
                }
            } else {
                setMetrics({ status: 'unavailable' });
            }
        } catch (e) {
            console.error("APM fetch failed", e);
            setMetrics({ status: 'unavailable' });
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [dimensionFilter, instanceId]);

    useEffect(() => {
        fetchMetricData(selectedMetric);
        const interval = setInterval(() => fetchMetricData(selectedMetric), 60000);
        return () => clearInterval(interval);
    }, [selectedMetric, fetchMetricData, dimensionFilter, instanceId]);

    const handleMetricChange = useCallback((metricId: string) => {
        setSelectedMetric(metricId);
        setIsLoading(true);
    }, []);

    const handleRefresh = useCallback(() => {
        fetchMetricData(selectedMetric, true);
    }, [selectedMetric, fetchMetricData]);

    // Handle clicking on a dimension value to filter metrics
    const handleDimensionClick = useCallback((key: string, value: string) => {
        // Toggle: if same filter is active, clear it; otherwise set it
        if (dimensionFilter?.key === key && dimensionFilter?.value === value) {
            setDimensionFilter(null);
        } else {
            setDimensionFilter({ key, value });
            setIsLoading(true);
        }
    }, [dimensionFilter]);

    // Clear the active dimension filter
    const clearDimensionFilter = useCallback(() => {
        setDimensionFilter(null);
        setIsLoading(true);
    }, []);

    // Format timestamp for display
    const formatTimestamp = (date: Date): string => {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    const statusVariant = useMemo(() =>
        metrics ? getStatusVariant(metrics.status) : 'unavailable',
        [metrics]
    );

    const errorRate = useMemo(() => {
        if (!metrics?.error_rate) return 0;
        return typeof metrics.error_rate === 'string'
            ? parseFloat(metrics.error_rate.replace('%', ''))
            : metrics.error_rate;
    }, [metrics]);

    // Calculate stats from datapoints - must be before early returns to satisfy Rules of Hooks
    const metricStats = useMemo(() => {
        if (!metricData?.datapoints?.length) return null;
        const values = metricData.datapoints.map(d => d.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        const latest = values[values.length - 1];
        return { avg, max, min, latest, count: values.length };
    }, [metricData]);

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner} />
                    <div className={styles.loadingText}>Loading APM metrics...</div>
                </div>
            </div>
        );
    }

    if (!metrics || metrics.status === 'unavailable') {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>📊</div>
                        <h3 className={styles.headerTitle}>APM Overview</h3>
                    </div>
                    <div className={`${styles.statusBadge} ${styles.statusUnavailable}`}>
                        <span className={styles.statusDot} />
                        <span>Unavailable</span>
                    </div>
                </div>
                <div className={styles.unavailableState}>
                    <div className={styles.unavailableIcon}>📉</div>
                    <div className={styles.unavailableText}>
                        APM metrics are currently unavailable. Check your APM configuration.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.headerIcon}>📊</div>
                    <h3 className={styles.headerTitle}>OCI Metrics</h3>
                </div>
                <div className={styles.headerRight}>
                    {availableMetrics.length > 0 && (
                        <QuickMetricSelector
                            metrics={availableMetrics}
                            selectedMetric={selectedMetric}
                            onSelect={handleMetricChange}
                            onBrowseClick={() => setIsBrowserOpen(true)}
                        />
                    )}
                    <div className={`${styles.statusBadge} ${styles[`status${statusVariant.charAt(0).toUpperCase() + statusVariant.slice(1)}`]}`}>
                        <span className={styles.statusDot} />
                        <span>{statusVariant}</span>
                    </div>
                </div>
            </div>

            {/* Time-Series Chart Section */}
            {metricData && (
                <div className={styles.chartSection}>
                    <div className={styles.chartHeader}>
                        <span className={styles.chartTitle}>
                            {metrics?.metricInfo?.displayName || selectedMetric.toUpperCase()}
                        </span>
                        <span className={styles.chartNamespace}>
                            {metrics?.metricInfo?.namespace || metricData.namespace}
                        </span>
                    </div>
                    <MetricLineChart
                        datapoints={metricData.datapoints}
                        height={100}
                        color="#00d4aa"
                        showArea={true}
                        showPoints={metricData.datapoints.length <= 20}
                    />
                    {metricStats && (
                        <div className={styles.chartStats}>
                            <div className={styles.chartStat}>
                                <span className={styles.chartStatLabel}>Current</span>
                                <span className={styles.chartStatValue}>{metricStats.latest.toFixed(1)}</span>
                            </div>
                            <div className={styles.chartStat}>
                                <span className={styles.chartStatLabel}>Avg</span>
                                <span className={styles.chartStatValue}>{metricStats.avg.toFixed(1)}</span>
                            </div>
                            <div className={styles.chartStat}>
                                <span className={styles.chartStatLabel}>Max</span>
                                <span className={styles.chartStatValue}>{metricStats.max.toFixed(1)}</span>
                            </div>
                            <div className={styles.chartStat}>
                                <span className={styles.chartStatLabel}>Min</span>
                                <span className={styles.chartStatValue}>{metricStats.min.toFixed(1)}</span>
                            </div>
                            <div className={styles.chartStat}>
                                <span className={styles.chartStatLabel}>Points</span>
                                <span className={styles.chartStatValue}>{metricStats.count}</span>
                            </div>
                        </div>
                    )}
                    {/* Resource Dimensions Section */}
                    {metricData.dimensions && Object.keys(metricData.dimensions).length > 0 && (
                        <div className={styles.dimensionsSection}>
                            <div className={styles.dimensionsHeader}>
                                <span className={styles.dimensionsIcon}>📍</span>
                                <span className={styles.dimensionsTitle}>Resource Dimensions</span>
                                <span className={styles.dimensionsHint}>(click to filter)</span>
                            </div>
                            {dimensionFilter && (
                                <div className={styles.activeFilterBadge}>
                                    <span className={styles.filterIcon}>🎯</span>
                                    <span>Filtering: {formatDimensionKey(dimensionFilter.key)} = {truncateOcid(dimensionFilter.value)}</span>
                                    <button
                                        className={styles.clearFilterBtn}
                                        onClick={clearDimensionFilter}
                                        title="Clear filter"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                            <div className={styles.dimensionsGrid}>
                                {Object.entries(metricData.dimensions).map(([key, value]) => {
                                    const isActive = dimensionFilter?.key === key && dimensionFilter?.value === value;
                                    return (
                                        <div
                                            key={key}
                                            className={`${styles.dimensionItem} ${isActive ? styles.dimensionItemActive : ''}`}
                                            onClick={() => handleDimensionClick(key, value)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => e.key === 'Enter' && handleDimensionClick(key, value)}
                                        >
                                            <span className={styles.dimensionKey}>{formatDimensionKey(key)}</span>
                                            <span
                                                className={`${styles.dimensionValue} ${styles.dimensionValueClickable}`}
                                                title={`Click to filter by ${formatDimensionKey(key)}: ${value}`}
                                            >
                                                {truncateOcid(value)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className={styles.metricsGrid}>
                {/* Legacy Traces Card */}
                {metrics.span_count_last_hour !== undefined && (
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Traces (1h)</div>
                        <div className={styles.metricValue}>
                            {metrics.span_count_last_hour?.toLocaleString() || '—'}
                        </div>
                        {sparklineData.length > 1 && <Sparkline data={sparklineData} />}
                        <div className={`${styles.metricTrend} ${styles.trendNeutral}`}>
                            Last hour
                        </div>
                    </div>
                )}

                {/* Error Rate Card */}
                {errorRate > 0 && (
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Error Rate</div>
                        <CircularProgress
                            value={errorRate}
                            max={10}
                            variant={getErrorRateVariant(errorRate)}
                            label={`${errorRate.toFixed(1)}%`}
                        />
                        <ProgressBar
                            value={errorRate}
                            max={10}
                            variant={getErrorRateVariant(errorRate)}
                        />
                    </div>
                )}

                {/* Latency Card */}
                {(metrics.avg_latency_ms || metrics.p50_latency) && (
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Avg Latency</div>
                        <div className={styles.metricValue}>
                            {metrics.avg_latency_ms || metrics.p50_latency || '—'}
                            <span className={styles.metricUnit}>ms</span>
                        </div>
                        {metrics.p95_latency && (
                            <div className={`${styles.metricTrend} ${styles.trendNeutral}`}>
                                P95: {metrics.p95_latency}ms
                            </div>
                        )}
                    </div>
                )}

                {/* Throughput/Request Rate Card */}
                {(metrics.throughput || metrics.request_rate) && (
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Throughput</div>
                        <div className={styles.metricValue}>
                            {metrics.throughput || metrics.request_rate || '—'}
                            <span className={styles.metricUnit}>/min</span>
                        </div>
                        {metrics.active_traces && (
                            <div className={`${styles.metricTrend} ${styles.trendUp}`}>
                                {metrics.active_traces} active
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Mini Stats Row */}
            {(metrics.cpu_usage !== undefined || metrics.memory_usage !== undefined || metrics.apdex_score !== undefined) && (
                <div className={styles.miniStats}>
                    {metrics.apdex_score !== undefined && (
                        <div className={styles.miniStat}>
                            <span className={styles.miniStatIcon}>⭐</span>
                            <span>Apdex:</span>
                            <span className={styles.miniStatValue}>{metrics.apdex_score.toFixed(2)}</span>
                        </div>
                    )}
                    {metrics.cpu_usage !== undefined && (
                        <div className={styles.miniStat}>
                            <span className={styles.miniStatIcon}>⚡</span>
                            <span>CPU:</span>
                            <span className={styles.miniStatValue}>{metrics.cpu_usage}%</span>
                        </div>
                    )}
                    {metrics.memory_usage !== undefined && (
                        <div className={styles.miniStat}>
                            <span className={styles.miniStatIcon}>💾</span>
                            <span>Memory:</span>
                            <span className={styles.miniStatValue}>{metrics.memory_usage}%</span>
                        </div>
                    )}
                </div>
            )}

            {/* Source Info Footer */}
            <div className={styles.sourceInfo}>
                <div className={styles.sourceLeft}>
                    <span className={styles.sourceBadge}>
                        <span className={styles.sourceIcon}>☁️</span>
                        OCI Monitoring
                    </span>
                    {lastFetched && (
                        <span className={styles.sourceTimestamp}>
                            Updated {formatTimestamp(lastFetched)}
                        </span>
                    )}
                </div>
                <button
                    className={styles.refreshButton}
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Refresh metrics"
                >
                    <span className={`${styles.refreshIcon} ${isRefreshing ? styles.refreshing : ''}`}>
                        ↻
                    </span>
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Metrics Browser Modal */}
            <MetricBrowser
                metrics={availableMetrics}
                selectedMetric={selectedMetric}
                onSelect={handleMetricChange}
                isOpen={isBrowserOpen}
                onClose={() => setIsBrowserOpen(false)}
            />
        </div>
    );
}

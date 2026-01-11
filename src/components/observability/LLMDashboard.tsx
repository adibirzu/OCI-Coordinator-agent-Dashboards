'use client';

/**
 * LLM Dashboard Component
 *
 * Comprehensive dashboard for LLM observability showing:
 * - Token usage analytics (input vs output over time)
 * - Cost tracking by model and provider
 * - Model usage breakdown
 * - Latency metrics
 * - Quality and security check summaries
 */

import React, { useMemo, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import styles from './LLMDashboard.module.css';
import {
    TraceLLMSummary,
    LLMSpanInfo,
    QualityCheck,
    SecurityCheck,
    DEFAULT_MODEL_PRICING,
} from '@/lib/llm-observability/types';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

// ============================================
// Types
// ============================================

export interface LLMMetricsData {
    // Time series data (hourly buckets)
    timeSeries: {
        timestamp: string;
        inputTokens: number;
        outputTokens: number;
        totalCalls: number;
        averageLatencyMs: number;
        estimatedCost: number;
    }[];

    // Aggregated metrics
    totals: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCalls: number;
        totalCost: number;
        averageLatencyMs: number;
        p99LatencyMs: number;
    };

    // Breakdown by model
    modelBreakdown: {
        model: string;
        provider: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCost: number;
        averageLatencyMs: number;
    }[];

    // Breakdown by provider
    providerBreakdown: {
        provider: string;
        calls: number;
        totalTokens: number;
        estimatedCost: number;
    }[];

    // Quality issues summary
    qualityIssues: {
        type: string;
        count: number;
        severity: 'pass' | 'warning' | 'fail';
    }[];

    // Security issues summary
    securityIssues: {
        type: string;
        count: number;
        severity: 'low' | 'medium' | 'high' | 'critical';
    }[];

    // Top conversations by cost
    topConversations: {
        conversationId: string;
        totalCost: number;
        totalTokens: number;
        callCount: number;
    }[];
}

interface LLMDashboardProps {
    data: LLMMetricsData;
    timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
    onTimeRangeChange?: (range: '1h' | '6h' | '24h' | '7d' | '30d') => void;
    onConversationClick?: (conversationId: string) => void;
    className?: string;
}

// ============================================
// Helper Functions
// ============================================

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
}

function formatCost(cost: number): string {
    if (cost >= 1) return `$${cost.toFixed(2)}`;
    if (cost >= 0.01) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(4)}`;
}

function formatLatency(ms: number): string {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
}

function getProviderColor(provider: string): string {
    const colors: Record<string, string> = {
        openai: '#10a37f',
        anthropic: '#d97706',
        'aws.bedrock': '#ff9900',
        cohere: '#8b5cf6',
        'oci.genai': '#f80000',
        google: '#4285f4',
        azure: '#0089d6',
    };
    return colors[provider.toLowerCase()] || '#6b7280';
}

function getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
        pass: '#22c55e',
        warning: '#eab308',
        fail: '#ef4444',
        low: '#22c55e',
        medium: '#eab308',
        high: '#f97316',
        critical: '#ef4444',
    };
    return colors[severity] || '#6b7280';
}

// ============================================
// Metric Card Component
// ============================================

interface MetricCardProps {
    title: string;
    value: string;
    subtitle?: string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    icon?: string;
    color?: string;
}

function MetricCard({ title, value, subtitle, trend, icon, color }: MetricCardProps) {
    return (
        <div className={styles.metricCard} style={{ borderTopColor: color }}>
            <div className={styles.metricHeader}>
                {icon && <span className={styles.metricIcon}>{icon}</span>}
                <span className={styles.metricTitle}>{title}</span>
            </div>
            <div className={styles.metricValue}>{value}</div>
            {subtitle && <div className={styles.metricSubtitle}>{subtitle}</div>}
            {trend && (
                <div className={`${styles.metricTrend} ${trend.isPositive ? styles.positive : styles.negative}`}>
                    {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value).toFixed(1)}%
                </div>
            )}
        </div>
    );
}

// ============================================
// Main Dashboard Component
// ============================================

export function LLMDashboard({
    data,
    timeRange = '24h',
    onTimeRangeChange,
    onConversationClick,
    className,
}: LLMDashboardProps) {
    const [selectedView, setSelectedView] = useState<'overview' | 'models' | 'quality' | 'security'>('overview');

    // Token usage chart data
    const tokenChartData = useMemo(() => ({
        labels: data.timeSeries.map(t => {
            const date = new Date(t.timestamp);
            return timeRange === '1h' || timeRange === '6h'
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }),
        datasets: [
            {
                label: 'Input Tokens',
                data: data.timeSeries.map(t => t.inputTokens),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: '#3b82f6',
                borderWidth: 1,
            },
            {
                label: 'Output Tokens',
                data: data.timeSeries.map(t => t.outputTokens),
                backgroundColor: 'rgba(34, 197, 94, 0.5)',
                borderColor: '#22c55e',
                borderWidth: 1,
            },
        ],
    }), [data.timeSeries, timeRange]);

    // Cost chart data
    const costChartData = useMemo(() => ({
        labels: data.timeSeries.map(t => {
            const date = new Date(t.timestamp);
            return timeRange === '1h' || timeRange === '6h'
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }),
        datasets: [
            {
                label: 'Estimated Cost',
                data: data.timeSeries.map(t => t.estimatedCost),
                fill: true,
                backgroundColor: 'rgba(251, 191, 36, 0.2)',
                borderColor: '#fbbf24',
                borderWidth: 2,
                tension: 0.3,
            },
        ],
    }), [data.timeSeries, timeRange]);

    // Latency chart data
    const latencyChartData = useMemo(() => ({
        labels: data.timeSeries.map(t => {
            const date = new Date(t.timestamp);
            return timeRange === '1h' || timeRange === '6h'
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }),
        datasets: [
            {
                label: 'Avg Latency (ms)',
                data: data.timeSeries.map(t => t.averageLatencyMs),
                fill: true,
                backgroundColor: 'rgba(168, 85, 247, 0.2)',
                borderColor: '#a855f7',
                borderWidth: 2,
                tension: 0.3,
            },
        ],
    }), [data.timeSeries, timeRange]);

    // Model breakdown doughnut chart
    const modelChartData = useMemo(() => ({
        labels: data.modelBreakdown.map(m => m.model),
        datasets: [
            {
                data: data.modelBreakdown.map(m => m.totalTokens),
                backgroundColor: data.modelBreakdown.map((m, i) => {
                    const colors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#06b6d4', '#eab308'];
                    return colors[i % colors.length];
                }),
                borderWidth: 0,
            },
        ],
    }), [data.modelBreakdown]);

    // Provider breakdown doughnut chart
    const providerChartData = useMemo(() => ({
        labels: data.providerBreakdown.map(p => p.provider),
        datasets: [
            {
                data: data.providerBreakdown.map(p => p.estimatedCost),
                backgroundColor: data.providerBreakdown.map(p => getProviderColor(p.provider)),
                borderWidth: 0,
            },
        ],
    }), [data.providerBreakdown]);

    // Chart options
    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                labels: { color: '#94a3b8' },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
        },
    };

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                labels: { color: '#94a3b8' },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
        },
    };

    const doughnutChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right' as const,
                labels: { color: '#94a3b8', padding: 12 },
            },
        },
    };

    return (
        <div className={`${styles.dashboard} ${className || ''}`}>
            {/* Header */}
            <div className={styles.header}>
                <h2 className={styles.title}>🤖 LLM Observability</h2>
                <div className={styles.controls}>
                    {/* View Tabs */}
                    <div className={styles.tabs}>
                        {(['overview', 'models', 'quality', 'security'] as const).map(view => (
                            <button
                                key={view}
                                className={`${styles.tab} ${selectedView === view ? styles.active : ''}`}
                                onClick={() => setSelectedView(view)}
                            >
                                {view.charAt(0).toUpperCase() + view.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Time Range Selector */}
                    <div className={styles.timeRange}>
                        {(['1h', '6h', '24h', '7d', '30d'] as const).map(range => (
                            <button
                                key={range}
                                className={`${styles.rangeButton} ${timeRange === range ? styles.active : ''}`}
                                onClick={() => onTimeRangeChange?.(range)}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Metric Cards */}
            <div className={styles.metricsGrid}>
                <MetricCard
                    title="Total Tokens"
                    value={formatTokens(data.totals.totalTokens)}
                    subtitle={`${formatTokens(data.totals.inputTokens)} in / ${formatTokens(data.totals.outputTokens)} out`}
                    icon="🎯"
                    color="#3b82f6"
                />
                <MetricCard
                    title="Estimated Cost"
                    value={formatCost(data.totals.totalCost)}
                    subtitle={`${data.totals.totalCalls} LLM calls`}
                    icon="💰"
                    color="#22c55e"
                />
                <MetricCard
                    title="Avg Latency"
                    value={formatLatency(data.totals.averageLatencyMs)}
                    subtitle={`P99: ${formatLatency(data.totals.p99LatencyMs)}`}
                    icon="⚡"
                    color="#a855f7"
                />
                <MetricCard
                    title="Issues"
                    value={`${data.qualityIssues.filter(q => q.severity !== 'pass').length + data.securityIssues.length}`}
                    subtitle={`${data.qualityIssues.filter(q => q.severity === 'fail').length} quality, ${data.securityIssues.filter(s => s.severity === 'high' || s.severity === 'critical').length} security`}
                    icon="⚠️"
                    color="#ef4444"
                />
            </div>

            {/* Content based on selected view */}
            {selectedView === 'overview' && (
                <div className={styles.chartsGrid}>
                    {/* Token Usage Chart */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Token Usage Over Time</h3>
                        <div className={styles.chartContainer}>
                            <Bar data={tokenChartData} options={barChartOptions} />
                        </div>
                    </div>

                    {/* Cost Chart */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Cost Trend</h3>
                        <div className={styles.chartContainer}>
                            <Line data={costChartData} options={lineChartOptions} />
                        </div>
                    </div>

                    {/* Latency Chart */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Latency Trend</h3>
                        <div className={styles.chartContainer}>
                            <Line data={latencyChartData} options={lineChartOptions} />
                        </div>
                    </div>

                    {/* Top Conversations */}
                    <div className={styles.chartCard}>
                        <h3 className={styles.chartTitle}>Top Conversations by Cost</h3>
                        <div className={styles.conversationList}>
                            {data.topConversations.slice(0, 5).map((conv, index) => (
                                <div
                                    key={conv.conversationId}
                                    className={styles.conversationItem}
                                    onClick={() => onConversationClick?.(conv.conversationId)}
                                >
                                    <span className={styles.convRank}>#{index + 1}</span>
                                    <span className={styles.convId}>{conv.conversationId.slice(0, 12)}...</span>
                                    <span className={styles.convCost}>{formatCost(conv.totalCost)}</span>
                                    <span className={styles.convTokens}>{formatTokens(conv.totalTokens)} tokens</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {selectedView === 'models' && (
                <div className={styles.modelsView}>
                    <div className={styles.chartsRow}>
                        {/* Model Distribution */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>Token Distribution by Model</h3>
                            <div className={styles.doughnutContainer}>
                                <Doughnut data={modelChartData} options={doughnutChartOptions} />
                            </div>
                        </div>

                        {/* Provider Distribution */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>Cost by Provider</h3>
                            <div className={styles.doughnutContainer}>
                                <Doughnut data={providerChartData} options={doughnutChartOptions} />
                            </div>
                        </div>
                    </div>

                    {/* Model Details Table */}
                    <div className={styles.tableCard}>
                        <h3 className={styles.chartTitle}>Model Performance Details</h3>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Model</th>
                                    <th>Provider</th>
                                    <th>Calls</th>
                                    <th>Input Tokens</th>
                                    <th>Output Tokens</th>
                                    <th>Avg Latency</th>
                                    <th>Est. Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.modelBreakdown.map(model => (
                                    <tr key={`${model.provider}-${model.model}`}>
                                        <td className={styles.modelName}>{model.model}</td>
                                        <td>
                                            <span
                                                className={styles.providerBadge}
                                                style={{ backgroundColor: getProviderColor(model.provider) }}
                                            >
                                                {model.provider}
                                            </span>
                                        </td>
                                        <td>{model.calls.toLocaleString()}</td>
                                        <td>{formatTokens(model.inputTokens)}</td>
                                        <td>{formatTokens(model.outputTokens)}</td>
                                        <td>{formatLatency(model.averageLatencyMs)}</td>
                                        <td className={styles.costCell}>{formatCost(model.estimatedCost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedView === 'quality' && (
                <div className={styles.qualityView}>
                    <div className={styles.issuesSummary}>
                        <h3 className={styles.chartTitle}>Quality Check Summary</h3>
                        <div className={styles.issuesGrid}>
                            {data.qualityIssues.map(issue => (
                                <div
                                    key={issue.type}
                                    className={styles.issueCard}
                                    style={{ borderLeftColor: getSeverityColor(issue.severity) }}
                                >
                                    <div className={styles.issueType}>{issue.type.replace(/_/g, ' ')}</div>
                                    <div className={styles.issueCount}>{issue.count}</div>
                                    <div
                                        className={styles.issueSeverity}
                                        style={{ color: getSeverityColor(issue.severity) }}
                                    >
                                        {issue.severity}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.qualityExplanation}>
                        <h4>Quality Checks Explained</h4>
                        <ul>
                            <li><strong>Hallucination:</strong> Detects when the model generates information not grounded in the input</li>
                            <li><strong>Relevance:</strong> Measures how well the output matches the user&apos;s intent</li>
                            <li><strong>Coherence:</strong> Evaluates logical flow and consistency of responses</li>
                            <li><strong>Toxicity:</strong> Identifies harmful or inappropriate content</li>
                            <li><strong>Sentiment:</strong> Tracks emotional tone alignment with expected behavior</li>
                        </ul>
                    </div>
                </div>
            )}

            {selectedView === 'security' && (
                <div className={styles.securityView}>
                    <div className={styles.issuesSummary}>
                        <h3 className={styles.chartTitle}>Security Check Summary</h3>
                        <div className={styles.issuesGrid}>
                            {data.securityIssues.map(issue => (
                                <div
                                    key={issue.type}
                                    className={styles.issueCard}
                                    style={{ borderLeftColor: getSeverityColor(issue.severity) }}
                                >
                                    <div className={styles.issueType}>{issue.type.replace(/_/g, ' ')}</div>
                                    <div className={styles.issueCount}>{issue.count}</div>
                                    <div
                                        className={styles.issueSeverity}
                                        style={{ color: getSeverityColor(issue.severity) }}
                                    >
                                        {issue.severity}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.securityExplanation}>
                        <h4>Security Checks Explained</h4>
                        <ul>
                            <li><strong>Prompt Injection:</strong> Detects attempts to manipulate the model through malicious prompts</li>
                            <li><strong>Jailbreak Attempts:</strong> Identifies attempts to bypass safety guardrails</li>
                            <li><strong>PII Detection:</strong> Flags personal identifiable information in inputs/outputs</li>
                            <li><strong>Sensitive Data:</strong> Detects credentials, API keys, or other secrets</li>
                            <li><strong>Malicious Content:</strong> Identifies harmful instructions or code</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// Mock Data Generator (for testing)
// ============================================

export function createMockLLMMetricsData(): LLMMetricsData {
    const now = Date.now();
    const hourMs = 3600000;

    // Generate 24 hours of time series data
    const timeSeries = Array.from({ length: 24 }, (_, i) => {
        const inputTokens = Math.floor(Math.random() * 50000) + 10000;
        const outputTokens = Math.floor(Math.random() * 30000) + 5000;
        return {
            timestamp: new Date(now - (23 - i) * hourMs).toISOString(),
            inputTokens,
            outputTokens,
            totalCalls: Math.floor(Math.random() * 100) + 20,
            averageLatencyMs: Math.floor(Math.random() * 2000) + 500,
            estimatedCost: (inputTokens * 0.00001 + outputTokens * 0.00003),
        };
    });

    const totalInputTokens = timeSeries.reduce((sum, t) => sum + t.inputTokens, 0);
    const totalOutputTokens = timeSeries.reduce((sum, t) => sum + t.outputTokens, 0);
    const totalCalls = timeSeries.reduce((sum, t) => sum + t.totalCalls, 0);
    const totalCost = timeSeries.reduce((sum, t) => sum + t.estimatedCost, 0);

    return {
        timeSeries,
        totals: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            totalCalls,
            totalCost,
            averageLatencyMs: 1250,
            p99LatencyMs: 3800,
        },
        modelBreakdown: [
            {
                model: 'gpt-4-turbo',
                provider: 'openai',
                calls: 450,
                inputTokens: 500000,
                outputTokens: 300000,
                totalTokens: 800000,
                estimatedCost: 14.00,
                averageLatencyMs: 1500,
            },
            {
                model: 'claude-3.5-sonnet',
                provider: 'anthropic',
                calls: 320,
                inputTokens: 400000,
                outputTokens: 250000,
                totalTokens: 650000,
                estimatedCost: 4.95,
                averageLatencyMs: 1200,
            },
            {
                model: 'gpt-3.5-turbo',
                provider: 'openai',
                calls: 800,
                inputTokens: 200000,
                outputTokens: 150000,
                totalTokens: 350000,
                estimatedCost: 0.33,
                averageLatencyMs: 800,
            },
            {
                model: 'command-r-plus',
                provider: 'cohere',
                calls: 150,
                inputTokens: 180000,
                outputTokens: 120000,
                totalTokens: 300000,
                estimatedCost: 2.34,
                averageLatencyMs: 1100,
            },
        ],
        providerBreakdown: [
            { provider: 'openai', calls: 1250, totalTokens: 1150000, estimatedCost: 14.33 },
            { provider: 'anthropic', calls: 320, totalTokens: 650000, estimatedCost: 4.95 },
            { provider: 'cohere', calls: 150, totalTokens: 300000, estimatedCost: 2.34 },
        ],
        qualityIssues: [
            { type: 'hallucination', count: 12, severity: 'warning' },
            { type: 'relevance', count: 5, severity: 'pass' },
            { type: 'coherence', count: 3, severity: 'pass' },
            { type: 'toxicity', count: 1, severity: 'fail' },
            { type: 'sentiment', count: 8, severity: 'warning' },
        ],
        securityIssues: [
            { type: 'prompt_injection', count: 4, severity: 'high' },
            { type: 'pii_detected', count: 15, severity: 'medium' },
            { type: 'jailbreak_attempt', count: 2, severity: 'critical' },
            { type: 'sensitive_data', count: 8, severity: 'medium' },
        ],
        topConversations: [
            { conversationId: 'conv-abc123def456', totalCost: 2.45, totalTokens: 85000, callCount: 12 },
            { conversationId: 'conv-xyz789ghi012', totalCost: 1.89, totalTokens: 62000, callCount: 8 },
            { conversationId: 'conv-jkl345mno678', totalCost: 1.56, totalTokens: 54000, callCount: 6 },
            { conversationId: 'conv-pqr901stu234', totalCost: 1.23, totalTokens: 41000, callCount: 5 },
            { conversationId: 'conv-vwx567yza890', totalCost: 0.98, totalTokens: 33000, callCount: 4 },
        ],
    };
}

export default LLMDashboard;

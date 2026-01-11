/**
 * LLM Observability Analytics API
 *
 * Provides aggregated analytics for LLM usage including:
 * - Token consumption over time
 * - Cost breakdown by model/provider
 * - Request volume and latency metrics
 * - Model usage distribution
 */

import { NextResponse } from 'next/server';

// In-memory cache for analytics data
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
type Granularity = '1m' | '5m' | '15m' | '1h' | '1d';

interface TimeSeriesPoint {
    timestamp: string;
    value: number;
}

interface ModelUsage {
    model: string;
    provider: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    avgLatencyMs: number;
    errorRate: number;
}

interface AnalyticsResponse {
    timeRange: TimeRange;
    granularity: Granularity;
    summary: {
        totalRequests: number;
        totalTokens: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCost: number;
        avgLatencyMs: number;
        errorRate: number;
        uniqueModels: number;
        uniqueConversations: number;
    };
    timeSeries: {
        requests: TimeSeriesPoint[];
        tokens: TimeSeriesPoint[];
        cost: TimeSeriesPoint[];
        latency: TimeSeriesPoint[];
        errors: TimeSeriesPoint[];
    };
    modelUsage: ModelUsage[];
    topConversations: {
        conversationId: string;
        requestCount: number;
        totalTokens: number;
        totalCost: number;
    }[];
}

function getGranularityForRange(range: TimeRange): Granularity {
    switch (range) {
        case '1h': return '1m';
        case '6h': return '5m';
        case '24h': return '15m';
        case '7d': return '1h';
        case '30d': return '1d';
        default: return '15m';
    }
}

function getPointCountForRange(range: TimeRange): number {
    switch (range) {
        case '1h': return 60;
        case '6h': return 72;
        case '24h': return 96;
        case '7d': return 168;
        case '30d': return 30;
        default: return 96;
    }
}

function generateTimeSeries(
    range: TimeRange,
    baseValue: number,
    variance: number = 0.3
): TimeSeriesPoint[] {
    const pointCount = getPointCountForRange(range);
    const now = Date.now();
    const rangeMs = {
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
    }[range];
    const intervalMs = rangeMs / pointCount;

    return Array.from({ length: pointCount }, (_, i) => {
        const timestamp = new Date(now - rangeMs + (i * intervalMs)).toISOString();
        // Add some variance and daily pattern
        const hourOfDay = new Date(timestamp).getHours();
        const dailyFactor = 0.5 + 0.5 * Math.sin((hourOfDay - 6) * Math.PI / 12);
        const randomFactor = 1 + (Math.random() - 0.5) * variance;
        const value = Math.max(0, baseValue * dailyFactor * randomFactor);

        return { timestamp, value: Math.round(value * 100) / 100 };
    });
}

function generateDemoAnalytics(timeRange: TimeRange): AnalyticsResponse {
    const granularity = getGranularityForRange(timeRange);

    // Base metrics scaled by time range
    const rangeMultiplier = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
        '30d': 720,
    }[timeRange];

    const baseRequests = 150 * rangeMultiplier;
    const baseTokens = 50000 * rangeMultiplier;
    const baseCost = 2.5 * rangeMultiplier;

    const modelUsage: ModelUsage[] = [
        {
            model: 'gpt-4-turbo',
            provider: 'openai',
            requestCount: Math.floor(baseRequests * 0.35),
            inputTokens: Math.floor(baseTokens * 0.4),
            outputTokens: Math.floor(baseTokens * 0.25),
            totalTokens: Math.floor(baseTokens * 0.65),
            estimatedCost: baseCost * 0.55,
            avgLatencyMs: 2100,
            errorRate: 0.02,
        },
        {
            model: 'gpt-4o',
            provider: 'openai',
            requestCount: Math.floor(baseRequests * 0.25),
            inputTokens: Math.floor(baseTokens * 0.2),
            outputTokens: Math.floor(baseTokens * 0.15),
            totalTokens: Math.floor(baseTokens * 0.35),
            estimatedCost: baseCost * 0.25,
            avgLatencyMs: 1200,
            errorRate: 0.01,
        },
        {
            model: 'claude-3-sonnet',
            provider: 'anthropic',
            requestCount: Math.floor(baseRequests * 0.2),
            inputTokens: Math.floor(baseTokens * 0.15),
            outputTokens: Math.floor(baseTokens * 0.1),
            totalTokens: Math.floor(baseTokens * 0.25),
            estimatedCost: baseCost * 0.12,
            avgLatencyMs: 1800,
            errorRate: 0.015,
        },
        {
            model: 'claude-3-haiku',
            provider: 'anthropic',
            requestCount: Math.floor(baseRequests * 0.15),
            inputTokens: Math.floor(baseTokens * 0.08),
            outputTokens: Math.floor(baseTokens * 0.05),
            totalTokens: Math.floor(baseTokens * 0.13),
            estimatedCost: baseCost * 0.05,
            avgLatencyMs: 600,
            errorRate: 0.008,
        },
        {
            model: 'command-r-plus',
            provider: 'cohere',
            requestCount: Math.floor(baseRequests * 0.05),
            inputTokens: Math.floor(baseTokens * 0.03),
            outputTokens: Math.floor(baseTokens * 0.02),
            totalTokens: Math.floor(baseTokens * 0.05),
            estimatedCost: baseCost * 0.03,
            avgLatencyMs: 1500,
            errorRate: 0.02,
        },
    ];

    const totalRequests = modelUsage.reduce((sum, m) => sum + m.requestCount, 0);
    const totalInputTokens = modelUsage.reduce((sum, m) => sum + m.inputTokens, 0);
    const totalOutputTokens = modelUsage.reduce((sum, m) => sum + m.outputTokens, 0);
    const totalCost = modelUsage.reduce((sum, m) => sum + m.estimatedCost, 0);
    const avgLatency = modelUsage.reduce((sum, m) => sum + m.avgLatencyMs * m.requestCount, 0) / totalRequests;
    const errorRate = modelUsage.reduce((sum, m) => sum + m.errorRate * m.requestCount, 0) / totalRequests;

    return {
        timeRange,
        granularity,
        summary: {
            totalRequests,
            totalTokens: totalInputTokens + totalOutputTokens,
            totalInputTokens,
            totalOutputTokens,
            totalCost: Math.round(totalCost * 100) / 100,
            avgLatencyMs: Math.round(avgLatency),
            errorRate: Math.round(errorRate * 1000) / 1000,
            uniqueModels: modelUsage.length,
            uniqueConversations: Math.floor(totalRequests * 0.3),
        },
        timeSeries: {
            requests: generateTimeSeries(timeRange, totalRequests / getPointCountForRange(timeRange)),
            tokens: generateTimeSeries(timeRange, (totalInputTokens + totalOutputTokens) / getPointCountForRange(timeRange)),
            cost: generateTimeSeries(timeRange, totalCost / getPointCountForRange(timeRange)),
            latency: generateTimeSeries(timeRange, avgLatency, 0.2),
            errors: generateTimeSeries(timeRange, errorRate * totalRequests / getPointCountForRange(timeRange), 0.5),
        },
        modelUsage,
        topConversations: Array.from({ length: 10 }, (_, i) => ({
            conversationId: `conv_${1000 + i}`,
            requestCount: Math.floor(Math.random() * 50) + 5,
            totalTokens: Math.floor(Math.random() * 50000) + 5000,
            totalCost: Math.random() * 5 + 0.5,
        })).sort((a, b) => b.totalCost - a.totalCost),
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse query parameters
        const timeRange = (searchParams.get('timeRange') || '24h') as TimeRange;
        const model = searchParams.get('model');
        const provider = searchParams.get('provider');
        const conversationId = searchParams.get('conversationId');

        // Validate time range
        const validRanges: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];
        if (!validRanges.includes(timeRange)) {
            return NextResponse.json({
                error: `Invalid timeRange. Must be one of: ${validRanges.join(', ')}`,
            }, { status: 400 });
        }

        // Build cache key
        const cacheKey = `analytics_${JSON.stringify({ timeRange, model, provider, conversationId })}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
            });
        }

        // Generate demo data (in production, this would aggregate from OCI APM)
        let analytics = generateDemoAnalytics(timeRange);

        // Apply filters
        if (model) {
            analytics.modelUsage = analytics.modelUsage.filter(m => m.model === model);
        }
        if (provider) {
            analytics.modelUsage = analytics.modelUsage.filter(m => m.provider === provider);
        }

        // Recalculate summary if filtered
        if (model || provider) {
            const filteredUsage = analytics.modelUsage;
            const totalRequests = filteredUsage.reduce((sum, m) => sum + m.requestCount, 0);
            const totalInputTokens = filteredUsage.reduce((sum, m) => sum + m.inputTokens, 0);
            const totalOutputTokens = filteredUsage.reduce((sum, m) => sum + m.outputTokens, 0);
            const totalCost = filteredUsage.reduce((sum, m) => sum + m.estimatedCost, 0);

            analytics.summary = {
                ...analytics.summary,
                totalRequests,
                totalInputTokens,
                totalOutputTokens,
                totalTokens: totalInputTokens + totalOutputTokens,
                totalCost: Math.round(totalCost * 100) / 100,
                uniqueModels: filteredUsage.length,
            };
        }

        const response = {
            ...analytics,
            filters: { timeRange, model, provider, conversationId },
        };

        // Update cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error) {
        console.error('[LLM Analytics API] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            summary: {
                totalRequests: 0,
                totalTokens: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCost: 0,
                avgLatencyMs: 0,
                errorRate: 0,
                uniqueModels: 0,
                uniqueConversations: 0,
            },
            timeSeries: { requests: [], tokens: [], cost: [], latency: [], errors: [] },
            modelUsage: [],
            topConversations: [],
        });
    }
}

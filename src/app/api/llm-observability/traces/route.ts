/**
 * LLM Observability Traces API
 *
 * Provides access to LLM trace data with filtering and pagination.
 * Returns trace summaries with token usage, costs, and quality metrics.
 */

import { NextResponse } from 'next/server';
import type { TraceLLMSummary, LLMSpanInfo } from '@/lib/llm-observability/types';

// In-memory cache for trace data
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds

// Demo trace data for development
function generateDemoTraces(count: number = 10): TraceResponse[] {
    const models = ['gpt-4-turbo', 'gpt-4o', 'claude-3-sonnet', 'claude-3-haiku', 'command-r-plus'];
    const providers = ['openai', 'anthropic', 'cohere'];
    const operations = ['chat', 'embeddings', 'invoke_agent', 'tool_call'];

    return Array.from({ length: count }, (_, i) => {
        const inputTokens = Math.floor(Math.random() * 2000) + 100;
        const outputTokens = Math.floor(Math.random() * 1000) + 50;
        const model = models[Math.floor(Math.random() * models.length)];
        const provider = providers[Math.floor(Math.random() * providers.length)];
        const hasError = Math.random() < 0.1;

        // Calculate approximate cost
        const inputCost = (inputTokens / 1000000) * (model.includes('gpt-4') ? 10 : 3);
        const outputCost = (outputTokens / 1000000) * (model.includes('gpt-4') ? 30 : 15);

        return {
            traceId: `trace_${Date.now()}_${i.toString().padStart(4, '0')}`,
            startTime: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            endTime: new Date(Date.now() - Math.random() * 1800000).toISOString(),
            durationMs: Math.floor(Math.random() * 5000) + 200,
            status: hasError ? 'error' : 'ok',
            summary: {
                hasLLMSpans: true,
                llmSpanCount: Math.floor(Math.random() * 5) + 1,
                totalInputTokens: inputTokens,
                totalOutputTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
                uniqueModels: [model],
                uniqueProviders: [provider],
                toolCallCount: Math.floor(Math.random() * 3),
                agentHandoffCount: Math.floor(Math.random() * 2),
                totalEstimatedCost: inputCost + outputCost,
                costCurrency: 'USD',
                qualityIssues: Math.floor(Math.random() * 2),
                securityIssues: hasError ? 1 : 0,
            } as TraceLLMSummary,
            rootSpan: {
                name: operations[Math.floor(Math.random() * operations.length)],
                model,
                provider,
            },
            conversationId: Math.random() > 0.5 ? `conv_${Math.floor(Math.random() * 1000)}` : undefined,
        };
    });
}

interface TraceResponse {
    traceId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    status: 'ok' | 'error';
    summary: TraceLLMSummary;
    rootSpan: {
        name: string;
        model?: string;
        provider?: string;
    };
    conversationId?: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse query parameters
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const model = searchParams.get('model');
        const provider = searchParams.get('provider');
        const status = searchParams.get('status');
        const conversationId = searchParams.get('conversationId');
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');
        const minTokens = parseInt(searchParams.get('minTokens') || '0', 10);
        const hasQualityIssues = searchParams.get('hasQualityIssues') === 'true';
        const hasSecurityIssues = searchParams.get('hasSecurityIssues') === 'true';

        // Build cache key
        const cacheKey = `traces_${JSON.stringify({
            limit, offset, model, provider, status, conversationId,
            startTime, endTime, minTokens, hasQualityIssues, hasSecurityIssues
        })}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
            });
        }

        // Generate demo data (in production, this would query OCI APM)
        let traces = generateDemoTraces(50);

        // Apply filters
        if (model) {
            traces = traces.filter(t => t.summary.uniqueModels.includes(model));
        }
        if (provider) {
            traces = traces.filter(t => t.summary.uniqueProviders.includes(provider));
        }
        if (status) {
            traces = traces.filter(t => t.status === status);
        }
        if (conversationId) {
            traces = traces.filter(t => t.conversationId === conversationId);
        }
        if (minTokens > 0) {
            traces = traces.filter(t => t.summary.totalTokens >= minTokens);
        }
        if (hasQualityIssues) {
            traces = traces.filter(t => t.summary.qualityIssues > 0);
        }
        if (hasSecurityIssues) {
            traces = traces.filter(t => t.summary.securityIssues > 0);
        }

        // Sort by start time (newest first)
        traces.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        // Paginate
        const total = traces.length;
        const paginatedTraces = traces.slice(offset, offset + limit);

        const response = {
            traces: paginatedTraces,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
            },
            filters: {
                model,
                provider,
                status,
                conversationId,
                minTokens,
                hasQualityIssues,
                hasSecurityIssues,
            },
        };

        // Update cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error) {
        console.error('[LLM Traces API] Error:', error);
        return NextResponse.json({
            traces: [],
            pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

// Get single trace by ID
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { traceId } = body;

        if (!traceId) {
            return NextResponse.json({ error: 'traceId is required' }, { status: 400 });
        }

        // In production, this would fetch from OCI APM
        // For now, return demo data
        const demoTrace = generateDemoTraces(1)[0];
        demoTrace.traceId = traceId;

        // Add detailed span information
        const detailedTrace = {
            ...demoTrace,
            spans: generateDemoSpans(demoTrace.summary.llmSpanCount),
        };

        return NextResponse.json({ trace: detailedTrace });
    } catch (error) {
        console.error('[LLM Traces API] POST Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

function generateDemoSpans(count: number): Partial<LLMSpanInfo>[] {
    const operations = ['chat', 'embeddings', 'tool_call', 'agent_invoke'];

    return Array.from({ length: count }, (_, i) => ({
        isLLMSpan: true,
        operationType: operations[Math.floor(Math.random() * operations.length)],
        provider: 'openai',
        requestModel: 'gpt-4-turbo',
        responseModel: 'gpt-4-turbo',
        inputTokens: Math.floor(Math.random() * 500) + 50,
        outputTokens: Math.floor(Math.random() * 300) + 20,
        temperature: 0.7,
        maxTokens: 2048,
        estimatedCost: Math.random() * 0.01,
        costCurrency: 'USD',
    }));
}

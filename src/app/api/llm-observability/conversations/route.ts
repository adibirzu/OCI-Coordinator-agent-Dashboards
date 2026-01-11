/**
 * LLM Observability Conversations API
 *
 * Provides access to conversation-level data including:
 * - Multi-turn conversation tracking
 * - Token usage per conversation
 * - Cost aggregation by conversation
 * - User session analytics
 */

import { NextResponse } from 'next/server';

// In-memory cache for conversation data
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute

type ConversationStatus = 'active' | 'completed' | 'abandoned' | 'error';

interface ConversationMessage {
    messageId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    timestamp: string;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    latencyMs?: number;
    toolCalls?: {
        name: string;
        arguments: string;
        result?: string;
    }[];
}

interface Conversation {
    conversationId: string;
    sessionId?: string;
    userId?: string;
    startTime: string;
    endTime?: string;
    status: ConversationStatus;
    messageCount: number;
    turnCount: number; // user-assistant pairs
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    avgLatencyMs: number;
    models: string[];
    providers: string[];
    hasToolCalls: boolean;
    hasAgentHandoffs: boolean;
    qualityScore?: number;
    securityIssues: number;
    metadata?: {
        userAgent?: string;
        source?: string;
        tags?: string[];
    };
}

interface ConversationDetail extends Conversation {
    messages: ConversationMessage[];
    traceIds: string[];
}

interface ConversationSummary {
    totalConversations: number;
    activeConversations: number;
    completedConversations: number;
    abandonedConversations: number;
    errorConversations: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    avgTurnsPerConversation: number;
    avgTokensPerConversation: number;
    avgCostPerConversation: number;
    avgLatencyMs: number;
    uniqueUsers: number;
    topModels: { model: string; count: number; }[];
    byStatus: {
        [key in ConversationStatus]: number;
    };
}

function generateDemoConversations(count: number = 30): Conversation[] {
    const models = ['gpt-4-turbo', 'gpt-4o', 'claude-3-sonnet', 'claude-3-haiku'];
    const providers = ['openai', 'anthropic'];
    const statuses: ConversationStatus[] = ['active', 'completed', 'abandoned', 'error'];
    const sources = ['web', 'api', 'slack', 'mobile'];

    return Array.from({ length: count }, (_, i) => {
        const startTime = new Date(Date.now() - Math.random() * 86400000 * 7); // Last 7 days
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const isActive = status === 'active';
        const endTime = isActive ? undefined : new Date(startTime.getTime() + Math.random() * 3600000);

        const turnCount = Math.floor(Math.random() * 15) + 1;
        const messageCount = turnCount * 2 + (Math.random() > 0.7 ? 1 : 0); // Might have system message

        const inputTokens = Math.floor(Math.random() * 5000) + 500;
        const outputTokens = Math.floor(Math.random() * 3000) + 300;
        const model = models[Math.floor(Math.random() * models.length)];
        const provider = model.includes('gpt') ? 'openai' : 'anthropic';

        // Calculate approximate cost
        const inputCost = (inputTokens / 1000000) * (model.includes('gpt-4') ? 10 : 3);
        const outputCost = (outputTokens / 1000000) * (model.includes('gpt-4') ? 30 : 15);

        return {
            conversationId: `conv_${Date.now() - i * 1000}_${i.toString().padStart(4, '0')}`,
            sessionId: `sess_${Math.floor(Math.random() * 500)}`,
            userId: Math.random() > 0.3 ? `user_${Math.floor(Math.random() * 100)}` : undefined,
            startTime: startTime.toISOString(),
            endTime: endTime?.toISOString(),
            status,
            messageCount,
            turnCount,
            totalInputTokens: inputTokens,
            totalOutputTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
            totalCost: inputCost + outputCost,
            avgLatencyMs: Math.floor(Math.random() * 3000) + 500,
            models: [model],
            providers: [provider],
            hasToolCalls: Math.random() > 0.6,
            hasAgentHandoffs: Math.random() > 0.85,
            qualityScore: status === 'completed' ? 0.7 + Math.random() * 0.3 : undefined,
            securityIssues: Math.random() > 0.9 ? Math.floor(Math.random() * 2) + 1 : 0,
            metadata: {
                source: sources[Math.floor(Math.random() * sources.length)],
                tags: Math.random() > 0.5 ? ['production'] : ['testing'],
            },
        };
    });
}

function generateDemoMessages(turnCount: number, model: string): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    let currentTime = Date.now() - turnCount * 60000;

    // System message
    if (Math.random() > 0.5) {
        messages.push({
            messageId: `msg_sys_${Date.now()}`,
            role: 'system',
            timestamp: new Date(currentTime).toISOString(),
        });
        currentTime += 1000;
    }

    for (let i = 0; i < turnCount; i++) {
        // User message
        const userTokens = Math.floor(Math.random() * 300) + 20;
        messages.push({
            messageId: `msg_user_${Date.now()}_${i}`,
            role: 'user',
            timestamp: new Date(currentTime).toISOString(),
            inputTokens: userTokens,
        });
        currentTime += Math.floor(Math.random() * 30000) + 5000;

        // Assistant message
        const assistantTokens = Math.floor(Math.random() * 500) + 50;
        const hasToolCall = Math.random() > 0.7;
        messages.push({
            messageId: `msg_assistant_${Date.now()}_${i}`,
            role: 'assistant',
            timestamp: new Date(currentTime).toISOString(),
            outputTokens: assistantTokens,
            model,
            latencyMs: Math.floor(Math.random() * 3000) + 500,
            toolCalls: hasToolCall ? [{
                name: ['search', 'calculator', 'code_interpreter'][Math.floor(Math.random() * 3)],
                arguments: '{}',
                result: 'Tool execution successful',
            }] : undefined,
        });

        // Tool response if there was a tool call
        if (hasToolCall) {
            currentTime += Math.floor(Math.random() * 5000) + 1000;
            messages.push({
                messageId: `msg_tool_${Date.now()}_${i}`,
                role: 'tool',
                timestamp: new Date(currentTime).toISOString(),
            });
        }

        currentTime += Math.floor(Math.random() * 60000) + 10000;
    }

    return messages;
}

function calculateSummary(conversations: Conversation[]): ConversationSummary {
    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const totalTokens = conversations.reduce((sum, c) => sum + c.totalTokens, 0);
    const totalCost = conversations.reduce((sum, c) => sum + c.totalCost, 0);
    const totalLatency = conversations.reduce((sum, c) => sum + c.avgLatencyMs * c.turnCount, 0);
    const totalTurns = conversations.reduce((sum, c) => sum + c.turnCount, 0);

    const uniqueUsers = new Set(conversations.filter(c => c.userId).map(c => c.userId)).size;

    // Count models
    const modelCounts = new Map<string, number>();
    conversations.forEach(c => {
        c.models.forEach(m => {
            modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
        });
    });
    const topModels = Array.from(modelCounts.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        totalConversations: conversations.length,
        activeConversations: conversations.filter(c => c.status === 'active').length,
        completedConversations: conversations.filter(c => c.status === 'completed').length,
        abandonedConversations: conversations.filter(c => c.status === 'abandoned').length,
        errorConversations: conversations.filter(c => c.status === 'error').length,
        totalMessages,
        totalTokens,
        totalCost: Math.round(totalCost * 1000) / 1000,
        avgTurnsPerConversation: conversations.length > 0
            ? Math.round((totalTurns / conversations.length) * 10) / 10
            : 0,
        avgTokensPerConversation: conversations.length > 0
            ? Math.round(totalTokens / conversations.length)
            : 0,
        avgCostPerConversation: conversations.length > 0
            ? Math.round((totalCost / conversations.length) * 1000) / 1000
            : 0,
        avgLatencyMs: totalTurns > 0
            ? Math.round(totalLatency / totalTurns)
            : 0,
        uniqueUsers,
        topModels,
        byStatus: {
            active: conversations.filter(c => c.status === 'active').length,
            completed: conversations.filter(c => c.status === 'completed').length,
            abandoned: conversations.filter(c => c.status === 'abandoned').length,
            error: conversations.filter(c => c.status === 'error').length,
        },
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse query parameters
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const status = searchParams.get('status') as ConversationStatus | null;
        const userId = searchParams.get('userId');
        const sessionId = searchParams.get('sessionId');
        const model = searchParams.get('model');
        const hasToolCalls = searchParams.get('hasToolCalls');
        const hasSecurityIssues = searchParams.get('hasSecurityIssues');
        const minTokens = parseInt(searchParams.get('minTokens') || '0', 10);
        const minCost = parseFloat(searchParams.get('minCost') || '0');
        const timeRange = searchParams.get('timeRange') || '7d';
        const sortBy = searchParams.get('sortBy') || 'startTime';
        const sortOrder = searchParams.get('sortOrder') || 'desc';

        // Build cache key
        const cacheKey = `conversations_${JSON.stringify({
            limit, offset, status, userId, sessionId, model,
            hasToolCalls, hasSecurityIssues, minTokens, minCost, timeRange, sortBy, sortOrder
        })}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                ...cached.data,
                cached: true,
            });
        }

        // Generate demo data
        let conversations = generateDemoConversations(100);

        // Apply filters
        if (status) {
            conversations = conversations.filter(c => c.status === status);
        }
        if (userId) {
            conversations = conversations.filter(c => c.userId === userId);
        }
        if (sessionId) {
            conversations = conversations.filter(c => c.sessionId === sessionId);
        }
        if (model) {
            conversations = conversations.filter(c => c.models.includes(model));
        }
        if (hasToolCalls === 'true') {
            conversations = conversations.filter(c => c.hasToolCalls);
        }
        if (hasSecurityIssues === 'true') {
            conversations = conversations.filter(c => c.securityIssues > 0);
        }
        if (minTokens > 0) {
            conversations = conversations.filter(c => c.totalTokens >= minTokens);
        }
        if (minCost > 0) {
            conversations = conversations.filter(c => c.totalCost >= minCost);
        }

        // Sort
        conversations.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'startTime':
                    comparison = new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
                    break;
                case 'totalTokens':
                    comparison = b.totalTokens - a.totalTokens;
                    break;
                case 'totalCost':
                    comparison = b.totalCost - a.totalCost;
                    break;
                case 'turnCount':
                    comparison = b.turnCount - a.turnCount;
                    break;
                case 'avgLatencyMs':
                    comparison = b.avgLatencyMs - a.avgLatencyMs;
                    break;
                default:
                    comparison = new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
            }
            return sortOrder === 'asc' ? -comparison : comparison;
        });

        // Calculate summary before pagination
        const summary = calculateSummary(conversations);

        // Paginate
        const total = conversations.length;
        const paginatedConversations = conversations.slice(offset, offset + limit);

        const response = {
            conversations: paginatedConversations,
            summary,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
            },
            filters: {
                status,
                userId,
                sessionId,
                model,
                hasToolCalls: hasToolCalls === 'true' ? true : null,
                hasSecurityIssues: hasSecurityIssues === 'true' ? true : null,
                minTokens,
                minCost,
                timeRange,
                sortBy,
                sortOrder,
            },
        };

        // Update cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error) {
        console.error('[LLM Conversations API] Error:', error);
        return NextResponse.json({
            conversations: [],
            summary: {
                totalConversations: 0,
                activeConversations: 0,
                completedConversations: 0,
                abandonedConversations: 0,
                errorConversations: 0,
                totalMessages: 0,
                totalTokens: 0,
                totalCost: 0,
                avgTurnsPerConversation: 0,
                avgTokensPerConversation: 0,
                avgCostPerConversation: 0,
                avgLatencyMs: 0,
                uniqueUsers: 0,
                topModels: [],
                byStatus: { active: 0, completed: 0, abandoned: 0, error: 0 },
            },
            pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

// Get single conversation by ID with full message history
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { conversationId } = body;

        if (!conversationId) {
            return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
        }

        // In production, this would fetch from OCI APM
        // For now, return demo data
        const conversations = generateDemoConversations(1);
        const conversation = conversations[0];
        conversation.conversationId = conversationId;

        // Add detailed message history
        const detailedConversation: ConversationDetail = {
            ...conversation,
            messages: generateDemoMessages(conversation.turnCount, conversation.models[0]),
            traceIds: Array.from({ length: conversation.turnCount }, (_, i) =>
                `trace_${Date.now() - i * 60000}_${i}`
            ),
        };

        return NextResponse.json({ conversation: detailedConversation });
    } catch (error) {
        console.error('[LLM Conversations API] POST Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

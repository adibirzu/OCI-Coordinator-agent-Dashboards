/**
 * LLM Instrumentation Library
 *
 * Provides automatic tracing for LLM calls with OpenTelemetry.
 * Supports multiple LLM providers and captures detailed metrics.
 */

import {
    trace,
    context,
    SpanKind,
    SpanStatusCode,
    Span,
    Tracer,
    Context,
} from '@opentelemetry/api';
import { OTEL_GENAI_KEYS, LLMSpanInfo, AgentNodeType } from './types';

// Re-export for convenience
export { OTEL_GENAI_KEYS } from './types';

/**
 * LLM Call Options
 */
export interface LLMCallOptions {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    conversationId?: string;
    agentName?: string;
    agentId?: string;
}

/**
 * LLM Response Metrics
 */
export interface LLMResponseMetrics {
    inputTokens: number;
    outputTokens: number;
    model?: string;
    finishReason?: string;
    responseId?: string;
}

/**
 * Tool Call Info
 */
export interface ToolCallInfo {
    name: string;
    arguments: Record<string, any>;
    result?: any;
    type?: string;
}

/**
 * Agent Workflow Step
 */
export interface AgentWorkflowStep {
    type: AgentNodeType;
    name: string;
    input?: any;
    output?: any;
    metadata?: Record<string, any>;
}

/**
 * Quality Check Result
 */
export interface QualityCheckResult {
    type: 'hallucination' | 'toxicity' | 'sentiment' | 'relevance' | 'coherence' | 'custom';
    name: string;
    score: number;
    passed: boolean;
    details?: string;
}

/**
 * Security Check Result
 */
export interface SecurityCheckResult {
    type: 'prompt_injection' | 'jailbreak_attempt' | 'pii_detected' | 'sensitive_data' | 'malicious_content' | 'custom';
    name: string;
    detected: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details?: string;
}

/**
 * Get the LLM Observability tracer
 */
export function getLLMTracer(): Tracer {
    return trace.getTracer('llm-observability', '1.0.0');
}

/**
 * Create a traced LLM call wrapper
 *
 * @example
 * ```ts
 * const result = await traceLLMCall(
 *   'chat-completion',
 *   { provider: 'openai', model: 'gpt-4' },
 *   async (span) => {
 *     const response = await openai.chat.completions.create({...});
 *     recordLLMResponse(span, {
 *       inputTokens: response.usage.prompt_tokens,
 *       outputTokens: response.usage.completion_tokens,
 *     });
 *     return response;
 *   }
 * );
 * ```
 */
export async function traceLLMCall<T>(
    operationName: string,
    options: LLMCallOptions,
    fn: (span: Span) => Promise<T>,
    parentContext?: Context
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = parentContext || context.active();

    return tracer.startActiveSpan(
        operationName,
        {
            kind: SpanKind.CLIENT,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: operationName,
                [OTEL_GENAI_KEYS.PROVIDER_NAME]: options.provider,
                [OTEL_GENAI_KEYS.REQUEST_MODEL]: options.model,
                ...(options.temperature !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_TEMPERATURE]: options.temperature,
                }),
                ...(options.maxTokens !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_MAX_TOKENS]: options.maxTokens,
                }),
                ...(options.topP !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_TOP_P]: options.topP,
                }),
                ...(options.topK !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_TOP_K]: options.topK,
                }),
                ...(options.frequencyPenalty !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_FREQUENCY_PENALTY]: options.frequencyPenalty,
                }),
                ...(options.presencePenalty !== undefined && {
                    [OTEL_GENAI_KEYS.REQUEST_PRESENCE_PENALTY]: options.presencePenalty,
                }),
                ...(options.stopSequences && {
                    [OTEL_GENAI_KEYS.REQUEST_STOP_SEQUENCES]: options.stopSequences.join(','),
                }),
                ...(options.conversationId && {
                    [OTEL_GENAI_KEYS.CONVERSATION_ID]: options.conversationId,
                }),
                ...(options.agentName && {
                    [OTEL_GENAI_KEYS.AGENT_NAME]: options.agentName,
                }),
                ...(options.agentId && {
                    [OTEL_GENAI_KEYS.AGENT_ID]: options.agentId,
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Record LLM response metrics on a span
 */
export function recordLLMResponse(span: Span, metrics: LLMResponseMetrics): void {
    span.setAttributes({
        [OTEL_GENAI_KEYS.USAGE_INPUT_TOKENS]: metrics.inputTokens,
        [OTEL_GENAI_KEYS.USAGE_OUTPUT_TOKENS]: metrics.outputTokens,
        ...(metrics.model && {
            [OTEL_GENAI_KEYS.RESPONSE_MODEL]: metrics.model,
        }),
        ...(metrics.finishReason && {
            [OTEL_GENAI_KEYS.RESPONSE_FINISH_REASONS]: metrics.finishReason,
        }),
        ...(metrics.responseId && {
            [OTEL_GENAI_KEYS.RESPONSE_ID]: metrics.responseId,
        }),
    });
}

/**
 * Record input/output messages (opt-in for content capture)
 */
export function recordLLMMessages(
    span: Span,
    input: Array<{ role: string; content: string }>,
    output?: Array<{ role: string; content: string }>
): void {
    span.setAttributes({
        [OTEL_GENAI_KEYS.INPUT_MESSAGES]: JSON.stringify(input),
        ...(output && {
            [OTEL_GENAI_KEYS.OUTPUT_MESSAGES]: JSON.stringify(output),
        }),
    });
}

/**
 * Create a traced tool call wrapper
 *
 * @example
 * ```ts
 * const result = await traceToolCall(
 *   { name: 'web_search', arguments: { query: 'weather' } },
 *   async (span) => {
 *     const searchResult = await webSearch(query);
 *     return searchResult;
 *   }
 * );
 * ```
 */
export async function traceToolCall<T>(
    tool: ToolCallInfo,
    fn: (span: Span) => Promise<T>,
    parentContext?: Context
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = parentContext || context.active();

    return tracer.startActiveSpan(
        `tool.${tool.name}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: 'tool_call',
                [OTEL_GENAI_KEYS.TOOL_NAME]: tool.name,
                [OTEL_GENAI_KEYS.TOOL_CALL_ARGUMENTS]: JSON.stringify(tool.arguments),
                ...(tool.type && {
                    [OTEL_GENAI_KEYS.TOOL_TYPE]: tool.type,
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);

                // Record result
                span.setAttribute(
                    OTEL_GENAI_KEYS.TOOL_CALL_RESULT,
                    typeof result === 'string' ? result : JSON.stringify(result)
                );

                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Tool call failed',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Create a traced agent workflow span
 *
 * @example
 * ```ts
 * const result = await traceAgentWorkflow(
 *   'research-agent',
 *   async (span) => {
 *     // Agent workflow logic
 *     return agentResult;
 *   }
 * );
 * ```
 */
export async function traceAgentWorkflow<T>(
    agentName: string,
    fn: (span: Span) => Promise<T>,
    options?: {
        agentId?: string;
        description?: string;
        parentContext?: Context;
    }
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = options?.parentContext || context.active();

    return tracer.startActiveSpan(
        `agent.${agentName}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: 'agent_workflow',
                [OTEL_GENAI_KEYS.AGENT_NAME]: agentName,
                ...(options?.agentId && {
                    [OTEL_GENAI_KEYS.AGENT_ID]: options.agentId,
                }),
                ...(options?.description && {
                    [OTEL_GENAI_KEYS.AGENT_DESCRIPTION]: options.description,
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Agent workflow failed',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Create a traced agent handoff span
 */
export async function traceAgentHandoff<T>(
    fromAgent: string,
    toAgent: string,
    fn: (span: Span) => Promise<T>,
    options?: {
        reason?: string;
        data?: any;
        parentContext?: Context;
    }
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = options?.parentContext || context.active();

    return tracer.startActiveSpan(
        `agent.handoff.${fromAgent}->${toAgent}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: 'agent_handoff',
                'agent.handoff.from': fromAgent,
                'agent.handoff.to': toAgent,
                ...(options?.reason && {
                    'agent.handoff.reason': options.reason,
                }),
                ...(options?.data && {
                    'agent.handoff.data': JSON.stringify(options.data),
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Agent handoff failed',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Record quality check results on a span
 */
export function recordQualityChecks(span: Span, checks: QualityCheckResult[]): void {
    for (const check of checks) {
        span.setAttributes({
            [`llm.quality.${check.type}.score`]: check.score,
            [`llm.quality.${check.type}.passed`]: check.passed,
            ...(check.details && {
                [`llm.quality.${check.type}.details`]: check.details,
            }),
        });
    }

    // Summary attributes
    const failedChecks = checks.filter(c => !c.passed);
    span.setAttributes({
        'llm.quality.total_checks': checks.length,
        'llm.quality.passed_checks': checks.length - failedChecks.length,
        'llm.quality.failed_checks': failedChecks.length,
        'llm.quality.has_issues': failedChecks.length > 0,
    });
}

/**
 * Record security check results on a span
 */
export function recordSecurityChecks(span: Span, checks: SecurityCheckResult[]): void {
    for (const check of checks) {
        span.setAttributes({
            [`llm.security.${check.type}.detected`]: check.detected,
            [`llm.security.${check.type}.severity`]: check.severity,
            ...(check.details && {
                [`llm.security.${check.type}.details`]: check.details,
            }),
        });
    }

    // Summary attributes
    const detectedIssues = checks.filter(c => c.detected);
    const criticalIssues = detectedIssues.filter(c => c.severity === 'critical' || c.severity === 'high');
    span.setAttributes({
        'llm.security.total_checks': checks.length,
        'llm.security.detected_issues': detectedIssues.length,
        'llm.security.critical_issues': criticalIssues.length,
        'llm.security.has_issues': detectedIssues.length > 0,
    });
}

/**
 * Record estimated cost on a span
 */
export function recordCost(
    span: Span,
    cost: number,
    currency: string = 'USD',
    breakdown?: { input?: number; output?: number }
): void {
    span.setAttributes({
        'llm.cost.total': cost,
        'llm.cost.currency': currency,
        ...(breakdown?.input !== undefined && {
            'llm.cost.input': breakdown.input,
        }),
        ...(breakdown?.output !== undefined && {
            'llm.cost.output': breakdown.output,
        }),
    });
}

/**
 * Create a memory operation span (for agent memory tracking)
 */
export async function traceMemoryOperation<T>(
    operation: 'read' | 'write',
    memoryType: 'short_term' | 'long_term' | 'episodic' | 'semantic',
    fn: (span: Span) => Promise<T>,
    options?: {
        key?: string;
        size?: number;
        parentContext?: Context;
    }
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = options?.parentContext || context.active();

    return tracer.startActiveSpan(
        `memory.${operation}.${memoryType}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: `memory_${operation}`,
                'memory.operation': operation,
                'memory.type': memoryType,
                ...(options?.key && {
                    'memory.key': options.key,
                }),
                ...(options?.size !== undefined && {
                    'memory.size': options.size,
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Memory operation failed',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Create a decision point span (for agent routing decisions)
 */
export async function traceDecision<T>(
    decisionName: string,
    fn: (span: Span) => Promise<T>,
    options?: {
        candidates?: string[];
        criteria?: string;
        parentContext?: Context;
    }
): Promise<T> {
    const tracer = getLLMTracer();
    const ctx = options?.parentContext || context.active();

    return tracer.startActiveSpan(
        `decision.${decisionName}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                [OTEL_GENAI_KEYS.OPERATION_NAME]: 'decision',
                'decision.name': decisionName,
                ...(options?.candidates && {
                    'decision.candidates': options.candidates.join(','),
                }),
                ...(options?.criteria && {
                    'decision.criteria': options.criteria,
                }),
            },
        },
        ctx,
        async (span) => {
            try {
                const result = await fn(span);
                // Record the chosen option
                span.setAttribute('decision.result', JSON.stringify(result));
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : 'Decision failed',
                });
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        }
    );
}

/**
 * Get current span from context (for adding attributes to existing spans)
 */
export function getCurrentSpan(): Span | undefined {
    return trace.getActiveSpan();
}

/**
 * Add custom attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
    const span = getCurrentSpan();
    if (span) {
        span.setAttributes(attributes);
    }
}

/**
 * Add an event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const span = getCurrentSpan();
    if (span) {
        span.addEvent(name, attributes);
    }
}

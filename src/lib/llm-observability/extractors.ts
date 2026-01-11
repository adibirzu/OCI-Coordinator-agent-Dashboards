/**
 * LLM Span Info Extractors
 *
 * Functions to extract LLM-specific information from span tags
 * following OpenTelemetry GenAI Semantic Conventions.
 */

import {
    OTEL_GENAI_KEYS,
    LLMSpanInfo,
    LLMMessage,
    ToolCall,
    QualityCheck,
    SecurityCheck,
    TraceLLMSummary,
    AgentWorkflow,
    AgentWorkflowNode,
    AgentWorkflowEdge,
    AgentNodeType,
} from './types';

// Alternative key mappings (for compatibility with different instrumentation libraries)
const ALT_KEYS = {
    inputTokens: ['llm.usage.prompt_tokens', 'ai.tokens.prompt', 'tokens.input'],
    outputTokens: ['llm.usage.completion_tokens', 'ai.tokens.completion', 'tokens.output'],
    model: ['llm.model', 'ai.model', 'model'],
    provider: ['gen_ai.system', 'llm.provider', 'ai.provider'],
    temperature: ['llm.temperature', 'ai.temperature'],
    topP: ['llm.top_p', 'ai.top_p'],
    maxTokens: ['llm.max_tokens', 'ai.max_tokens'],
};

/**
 * Try to get a value from tags using primary key and alternatives
 */
function getTagValue(tags: Record<string, string>, primaryKey: string, altKeys?: string[]): string | undefined {
    if (tags[primaryKey]) return tags[primaryKey];
    if (altKeys) {
        for (const key of altKeys) {
            if (tags[key]) return tags[key];
        }
    }
    return undefined;
}

/**
 * Parse a numeric value from tags
 */
function parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
}

/**
 * Check if a span is an LLM-related span
 */
export function isLLMSpan(tags: Record<string, string>): boolean {
    // Check for any GenAI/LLM specific tags
    const llmIndicators = [
        OTEL_GENAI_KEYS.OPERATION_NAME,
        OTEL_GENAI_KEYS.REQUEST_MODEL,
        OTEL_GENAI_KEYS.PROVIDER_NAME,
        OTEL_GENAI_KEYS.USAGE_INPUT_TOKENS,
        'llm.model',
        'ai.model',
        'gen_ai.system',
    ];

    return llmIndicators.some(key => tags[key] !== undefined);
}

/**
 * Extract LLM messages from JSON string tag
 */
function parseMessages(jsonStr: string | undefined): LLMMessage[] | undefined {
    if (!jsonStr) return undefined;
    try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
            return parsed.map(msg => ({
                role: msg.role || 'user',
                content: msg.content || '',
                name: msg.name,
                toolCalls: msg.tool_calls?.map((tc: any) => ({
                    id: tc.id || '',
                    name: tc.function?.name || tc.name || '',
                    arguments: typeof tc.function?.arguments === 'string'
                        ? tc.function.arguments
                        : JSON.stringify(tc.function?.arguments || tc.arguments || {}),
                })),
                toolCallId: msg.tool_call_id,
            }));
        }
    } catch {
        // If not valid JSON, return single message
        return [{ role: 'user', content: jsonStr }];
    }
    return undefined;
}

/**
 * Extract quality checks from span tags
 */
function extractQualityChecks(tags: Record<string, string>): QualityCheck[] {
    const checks: QualityCheck[] = [];

    // Look for quality-related tags
    const qualityPatterns = [
        { pattern: /^llm\.quality\.(\w+)\.score$/, type: 'score' },
        { pattern: /^llm\.quality\.(\w+)\.severity$/, type: 'severity' },
        { pattern: /^llm\.quality\.(\w+)$/, type: 'value' },
        { pattern: /^quality_check\.(\w+)$/, type: 'value' },
    ];

    const foundChecks: Record<string, Partial<QualityCheck>> = {};

    for (const [key, value] of Object.entries(tags)) {
        for (const { pattern, type } of qualityPatterns) {
            const match = key.match(pattern);
            if (match) {
                const checkName = match[1];
                if (!foundChecks[checkName]) {
                    foundChecks[checkName] = { name: checkName, type: 'custom' };
                }

                if (type === 'score') {
                    foundChecks[checkName].score = parseFloat(value);
                } else if (type === 'severity') {
                    foundChecks[checkName].severity = value as any;
                } else {
                    // Interpret value as score if numeric
                    const numVal = parseFloat(value);
                    if (!isNaN(numVal)) {
                        foundChecks[checkName].score = numVal;
                    }
                }
            }
        }
    }

    // Known quality check type mappings
    const typeMap: Record<string, QualityCheck['type']> = {
        hallucination: 'hallucination',
        toxicity: 'toxicity',
        sentiment: 'sentiment',
        relevance: 'relevance',
        coherence: 'coherence',
    };

    for (const [name, check] of Object.entries(foundChecks)) {
        const normalizedName = name.toLowerCase();
        checks.push({
            type: typeMap[normalizedName] || 'custom',
            name: check.name || name,
            score: check.score,
            severity: check.severity || (check.score !== undefined
                ? (check.score > 0.7 ? 'pass' : check.score > 0.3 ? 'warning' : 'fail')
                : 'pass'),
        });
    }

    return checks;
}

/**
 * Extract security checks from span tags
 */
function extractSecurityChecks(tags: Record<string, string>): SecurityCheck[] {
    const checks: SecurityCheck[] = [];

    // Look for security-related tags
    const securityPatterns = [
        { pattern: /^llm\.security\.(\w+)\.detected$/, type: 'detected' },
        { pattern: /^llm\.security\.(\w+)\.severity$/, type: 'severity' },
        { pattern: /^llm\.security\.(\w+)$/, type: 'value' },
        { pattern: /^security_check\.(\w+)$/, type: 'value' },
        { pattern: /^prompt_injection\.detected$/, name: 'prompt_injection', type: 'detected' },
        { pattern: /^pii\.detected$/, name: 'pii_detected', type: 'detected' },
    ];

    const foundChecks: Record<string, Partial<SecurityCheck>> = {};

    for (const [key, value] of Object.entries(tags)) {
        for (const { pattern, type, name: staticName } of securityPatterns) {
            const match = key.match(pattern);
            if (match) {
                const checkName = staticName || match[1];
                if (!foundChecks[checkName]) {
                    foundChecks[checkName] = { name: checkName, type: 'custom' };
                }

                if (type === 'detected') {
                    foundChecks[checkName].detected = value === 'true' || value === '1';
                } else if (type === 'severity') {
                    foundChecks[checkName].severity = value as any;
                } else {
                    // Interpret as boolean
                    foundChecks[checkName].detected = value === 'true' || value === '1';
                }
            }
        }
    }

    // Known security check type mappings
    const typeMap: Record<string, SecurityCheck['type']> = {
        prompt_injection: 'prompt_injection',
        jailbreak: 'jailbreak_attempt',
        jailbreak_attempt: 'jailbreak_attempt',
        pii: 'pii_detected',
        pii_detected: 'pii_detected',
        sensitive_data: 'sensitive_data',
        malicious: 'malicious_content',
        malicious_content: 'malicious_content',
    };

    for (const [name, check] of Object.entries(foundChecks)) {
        const normalizedName = name.toLowerCase();
        checks.push({
            type: typeMap[normalizedName] || 'custom',
            name: check.name || name,
            detected: check.detected ?? false,
            severity: check.severity || (check.detected ? 'high' : 'low'),
        });
    }

    return checks;
}

/**
 * Extract comprehensive LLM span info from tags
 */
export function extractLLMSpanInfo(tags: Record<string, string>): LLMSpanInfo {
    const isLLM = isLLMSpan(tags);

    if (!isLLM) {
        return { isLLMSpan: false };
    }

    const inputTokens = parseNumber(getTagValue(tags, OTEL_GENAI_KEYS.USAGE_INPUT_TOKENS, ALT_KEYS.inputTokens));
    const outputTokens = parseNumber(getTagValue(tags, OTEL_GENAI_KEYS.USAGE_OUTPUT_TOKENS, ALT_KEYS.outputTokens));

    const info: LLMSpanInfo = {
        isLLMSpan: true,
        operationType: tags[OTEL_GENAI_KEYS.OPERATION_NAME],

        // Model info
        provider: getTagValue(tags, OTEL_GENAI_KEYS.PROVIDER_NAME, ALT_KEYS.provider),
        requestModel: getTagValue(tags, OTEL_GENAI_KEYS.REQUEST_MODEL, ALT_KEYS.model),
        responseModel: tags[OTEL_GENAI_KEYS.RESPONSE_MODEL],

        // Token usage
        inputTokens,
        outputTokens,
        totalTokens: (inputTokens || 0) + (outputTokens || 0),

        // Request parameters
        temperature: parseNumber(getTagValue(tags, OTEL_GENAI_KEYS.REQUEST_TEMPERATURE, ALT_KEYS.temperature)),
        topP: parseNumber(getTagValue(tags, OTEL_GENAI_KEYS.REQUEST_TOP_P, ALT_KEYS.topP)),
        topK: parseNumber(tags[OTEL_GENAI_KEYS.REQUEST_TOP_K]),
        maxTokens: parseNumber(getTagValue(tags, OTEL_GENAI_KEYS.REQUEST_MAX_TOKENS, ALT_KEYS.maxTokens)),
        frequencyPenalty: parseNumber(tags[OTEL_GENAI_KEYS.REQUEST_FREQUENCY_PENALTY]),
        presencePenalty: parseNumber(tags[OTEL_GENAI_KEYS.REQUEST_PRESENCE_PENALTY]),

        // Response info
        responseId: tags[OTEL_GENAI_KEYS.RESPONSE_ID],
        finishReasons: tags[OTEL_GENAI_KEYS.RESPONSE_FINISH_REASONS]?.split(','),

        // Content (opt-in)
        inputMessages: parseMessages(tags[OTEL_GENAI_KEYS.INPUT_MESSAGES]),
        outputMessages: parseMessages(tags[OTEL_GENAI_KEYS.OUTPUT_MESSAGES]),
        systemInstructions: tags[OTEL_GENAI_KEYS.SYSTEM_INSTRUCTIONS],

        // Conversation tracking
        conversationId: tags[OTEL_GENAI_KEYS.CONVERSATION_ID],
        outputType: tags[OTEL_GENAI_KEYS.OUTPUT_TYPE],

        // Tool info
        toolName: tags[OTEL_GENAI_KEYS.TOOL_NAME],
        toolType: tags[OTEL_GENAI_KEYS.TOOL_TYPE],
        toolCallId: tags[OTEL_GENAI_KEYS.TOOL_CALL_ID],
        toolArguments: tags[OTEL_GENAI_KEYS.TOOL_CALL_ARGUMENTS],
        toolResult: tags[OTEL_GENAI_KEYS.TOOL_CALL_RESULT],

        // Agent info
        agentName: tags[OTEL_GENAI_KEYS.AGENT_NAME],
        agentId: tags[OTEL_GENAI_KEYS.AGENT_ID],

        // Quality & Security checks
        qualityChecks: extractQualityChecks(tags),
        securityChecks: extractSecurityChecks(tags),
    };

    return info;
}

/**
 * Interface for span with basic structure
 */
interface SpanLike {
    spanKey: string;
    operationName: string;
    startTime: number;
    duration: number;
    tags: Record<string, string>;
    parentSpanKey?: string;
    children?: SpanLike[];
    isError?: boolean;
}

/**
 * Calculate trace-level LLM summary
 */
export function calculateTraceLLMSummary(spans: SpanLike[]): TraceLLMSummary {
    const summary: TraceLLMSummary = {
        hasLLMSpans: false,
        llmSpanCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        uniqueModels: [],
        uniqueProviders: [],
        toolCallCount: 0,
        agentHandoffCount: 0,
        qualityIssues: 0,
        securityIssues: 0,
    };

    const models = new Set<string>();
    const providers = new Set<string>();

    for (const span of spans) {
        const llmInfo = extractLLMSpanInfo(span.tags);

        if (llmInfo.isLLMSpan) {
            summary.hasLLMSpans = true;
            summary.llmSpanCount++;

            summary.totalInputTokens += llmInfo.inputTokens || 0;
            summary.totalOutputTokens += llmInfo.outputTokens || 0;

            if (llmInfo.requestModel) models.add(llmInfo.requestModel);
            if (llmInfo.responseModel) models.add(llmInfo.responseModel);
            if (llmInfo.provider) providers.add(llmInfo.provider);

            // Count tool calls
            if (llmInfo.toolName || llmInfo.operationType === 'tool') {
                summary.toolCallCount++;
            }

            // Count agent handoffs
            if (llmInfo.operationType === 'agent_handoff' || llmInfo.agentName) {
                summary.agentHandoffCount++;
            }

            // Count quality issues
            if (llmInfo.qualityChecks) {
                summary.qualityIssues += llmInfo.qualityChecks.filter(c => c.severity === 'fail' || c.severity === 'warning').length;
            }

            // Count security issues
            if (llmInfo.securityChecks) {
                summary.securityIssues += llmInfo.securityChecks.filter(c => c.detected).length;
            }
        }
    }

    summary.totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    summary.uniqueModels = Array.from(models);
    summary.uniqueProviders = Array.from(providers);

    return summary;
}

/**
 * Determine agent node type from span
 */
function getAgentNodeType(span: SpanLike, llmInfo: LLMSpanInfo): AgentNodeType {
    const opName = span.operationName.toLowerCase();

    if (llmInfo.toolName || opName.includes('tool')) return 'tool_invocation';
    if (llmInfo.agentName || opName.includes('agent')) return 'agent_handoff';
    if (llmInfo.isLLMSpan) return 'llm_call';
    if (opName.includes('memory') && opName.includes('read')) return 'memory_read';
    if (opName.includes('memory') && opName.includes('write')) return 'memory_write';
    if (opName.includes('decision') || opName.includes('route')) return 'decision';
    if (opName.includes('input') || opName.includes('user')) return 'input';
    if (opName.includes('output') || opName.includes('response')) return 'output';

    return 'llm_call'; // Default for unknown LLM spans
}

/**
 * Build agent workflow graph from spans
 */
export function buildAgentWorkflow(spans: SpanLike[]): AgentWorkflow {
    const nodes: AgentWorkflowNode[] = [];
    const edges: AgentWorkflowEdge[] = [];
    const spanMap = new Map<string, SpanLike>();

    // Build span map and filter to relevant spans
    for (const span of spans) {
        spanMap.set(span.spanKey, span);
    }

    // Create nodes for LLM-related spans
    for (const span of spans) {
        const llmInfo = extractLLMSpanInfo(span.tags);

        // Include LLM spans and their direct children (tool calls, etc.)
        if (llmInfo.isLLMSpan || span.tags[OTEL_GENAI_KEYS.TOOL_NAME]) {
            const nodeType = getAgentNodeType(span, llmInfo);

            nodes.push({
                id: span.spanKey,
                type: nodeType,
                label: llmInfo.toolName || llmInfo.agentName || span.operationName,
                spanKey: span.spanKey,
                durationMs: span.duration,
                isError: span.isError,
                data: {
                    model: llmInfo.requestModel,
                    toolName: llmInfo.toolName,
                    agentName: llmInfo.agentName,
                    tokens: llmInfo.totalTokens,
                },
            });
        }
    }

    // Create edges based on parent-child relationships
    const nodeSet = new Set(nodes.map(n => n.id));

    for (const span of spans) {
        if (nodeSet.has(span.spanKey) && span.parentSpanKey && nodeSet.has(span.parentSpanKey)) {
            edges.push({
                id: `${span.parentSpanKey}->${span.spanKey}`,
                source: span.parentSpanKey,
                target: span.spanKey,
            });
        }
    }

    // Also create edges based on temporal ordering for sequential operations
    const sortedNodes = [...nodes].sort((a, b) => {
        const spanA = spanMap.get(a.id);
        const spanB = spanMap.get(b.id);
        return (spanA?.startTime || 0) - (spanB?.startTime || 0);
    });

    // Add sequential edges where there's no parent-child relationship
    for (let i = 0; i < sortedNodes.length - 1; i++) {
        const current = sortedNodes[i];
        const next = sortedNodes[i + 1];

        const hasExistingEdge = edges.some(
            e => (e.source === current.id && e.target === next.id) ||
                (e.target === current.id && e.source === next.id)
        );

        if (!hasExistingEdge) {
            // Check if they share a parent or are temporally adjacent
            const currentSpan = spanMap.get(current.id);
            const nextSpan = spanMap.get(next.id);

            if (currentSpan && nextSpan) {
                // Only connect if close in time (within 100ms gap)
                const gap = (nextSpan.startTime - (currentSpan.startTime + currentSpan.duration));
                if (gap < 100) {
                    edges.push({
                        id: `seq-${current.id}->${next.id}`,
                        source: current.id,
                        target: next.id,
                        label: 'sequence',
                    });
                }
            }
        }
    }

    return { nodes, edges };
}

/**
 * LLM Observability Types
 *
 * Based on OpenTelemetry GenAI Semantic Conventions v1.37+
 * and Datadog LLM Observability features.
 *
 * Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */

// ============================================
// OpenTelemetry GenAI Semantic Convention Keys
// ============================================

export const OTEL_GENAI_KEYS = {
    // Operation & Provider
    OPERATION_NAME: 'gen_ai.operation.name',
    PROVIDER_NAME: 'gen_ai.provider.name',

    // Request attributes
    REQUEST_MODEL: 'gen_ai.request.model',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    REQUEST_TOP_P: 'gen_ai.request.top_p',
    REQUEST_TOP_K: 'gen_ai.request.top_k',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
    REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',
    REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
    REQUEST_SEED: 'gen_ai.request.seed',

    // Response attributes
    RESPONSE_MODEL: 'gen_ai.response.model',
    RESPONSE_ID: 'gen_ai.response.id',
    RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

    // Token usage
    USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

    // Content (Opt-In)
    INPUT_MESSAGES: 'gen_ai.input.messages',
    OUTPUT_MESSAGES: 'gen_ai.output.messages',
    SYSTEM_INSTRUCTIONS: 'gen_ai.system_instructions',

    // Conversation
    CONVERSATION_ID: 'gen_ai.conversation.id',
    OUTPUT_TYPE: 'gen_ai.output.type',

    // Tool attributes (for agents)
    TOOL_NAME: 'gen_ai.tool.name',
    TOOL_TYPE: 'gen_ai.tool.type',
    TOOL_DESCRIPTION: 'gen_ai.tool.description',
    TOOL_CALL_ID: 'gen_ai.tool.call.id',
    TOOL_CALL_ARGUMENTS: 'gen_ai.tool.call.arguments',
    TOOL_CALL_RESULT: 'gen_ai.tool.call.result',

    // Agent attributes
    AGENT_NAME: 'gen_ai.agent.name',
    AGENT_ID: 'gen_ai.agent.id',
    AGENT_DESCRIPTION: 'gen_ai.agent.description',
} as const;

// ============================================
// Quality Check Types (Datadog-style)
// ============================================

export type QualityCheckType =
    | 'hallucination'
    | 'toxicity'
    | 'sentiment'
    | 'relevance'
    | 'coherence'
    | 'custom';

export type QualityCheckSeverity = 'pass' | 'warning' | 'fail';

export interface QualityCheck {
    type: QualityCheckType;
    name: string;
    score?: number;           // 0-1 score where applicable
    severity: QualityCheckSeverity;
    details?: string;
    timestamp?: string;
}

// ============================================
// Security Check Types
// ============================================

export type SecurityCheckType =
    | 'prompt_injection'
    | 'jailbreak_attempt'
    | 'pii_detected'
    | 'sensitive_data'
    | 'malicious_content'
    | 'custom';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityCheck {
    type: SecurityCheckType;
    name: string;
    detected: boolean;
    severity: SecuritySeverity;
    details?: string;
    location?: 'input' | 'output' | 'both';
    timestamp?: string;
}

// ============================================
// LLM Message Types
// ============================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';

export interface LLMMessage {
    role: MessageRole;
    content: string;
    name?: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
    result?: string;
}

// ============================================
// Agent Workflow Types
// ============================================

export type AgentNodeType =
    | 'llm_call'
    | 'tool_invocation'
    | 'agent_handoff'
    | 'memory_read'
    | 'memory_write'
    | 'decision'
    | 'input'
    | 'output';

export interface AgentWorkflowNode {
    id: string;
    type: AgentNodeType;
    label: string;
    spanKey?: string;
    durationMs?: number;
    isError?: boolean;
    data?: {
        model?: string;
        toolName?: string;
        agentName?: string;
        tokens?: number;
        [key: string]: any;
    };
}

export interface AgentWorkflowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

export interface AgentWorkflow {
    nodes: AgentWorkflowNode[];
    edges: AgentWorkflowEdge[];
}

// ============================================
// LLM Span Extended Info
// ============================================

export interface LLMSpanInfo {
    // Basic info
    isLLMSpan: boolean;
    operationType?: string;   // chat, embeddings, create_agent, invoke_agent, etc.

    // Model info
    provider?: string;
    requestModel?: string;
    responseModel?: string;

    // Token usage
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;

    // Request parameters
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;

    // Response info
    responseId?: string;
    finishReasons?: string[];

    // Content (if opt-in enabled)
    inputMessages?: LLMMessage[];
    outputMessages?: LLMMessage[];
    systemInstructions?: string;

    // Conversation tracking
    conversationId?: string;
    outputType?: string;

    // Tool/Agent info
    toolName?: string;
    toolType?: string;
    toolCallId?: string;
    toolArguments?: string;
    toolResult?: string;
    agentName?: string;
    agentId?: string;

    // Quality checks
    qualityChecks?: QualityCheck[];

    // Security checks
    securityChecks?: SecurityCheck[];

    // Cost estimation
    estimatedCost?: number;
    costCurrency?: string;
}

// ============================================
// Trace-level LLM Summary
// ============================================

export interface TraceLLMSummary {
    hasLLMSpans: boolean;
    llmSpanCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    uniqueModels: string[];
    uniqueProviders: string[];
    toolCallCount: number;
    agentHandoffCount: number;
    totalEstimatedCost?: number;
    costCurrency?: string;

    // Aggregated checks
    qualityIssues: number;
    securityIssues: number;

    // Workflow
    workflow?: AgentWorkflow;
}

// ============================================
// Cost Estimation Configuration
// ============================================

export interface ModelPricing {
    provider: string;
    model: string;
    inputTokenPrice: number;   // Per 1M tokens
    outputTokenPrice: number;  // Per 1M tokens
    currency: string;
}

// Common model pricing (approximate as of 2024)
export const DEFAULT_MODEL_PRICING: ModelPricing[] = [
    // OpenAI
    { provider: 'openai', model: 'gpt-4-turbo', inputTokenPrice: 10, outputTokenPrice: 30, currency: 'USD' },
    { provider: 'openai', model: 'gpt-4', inputTokenPrice: 30, outputTokenPrice: 60, currency: 'USD' },
    { provider: 'openai', model: 'gpt-4o', inputTokenPrice: 5, outputTokenPrice: 15, currency: 'USD' },
    { provider: 'openai', model: 'gpt-3.5-turbo', inputTokenPrice: 0.5, outputTokenPrice: 1.5, currency: 'USD' },

    // Anthropic
    { provider: 'anthropic', model: 'claude-3-opus', inputTokenPrice: 15, outputTokenPrice: 75, currency: 'USD' },
    { provider: 'anthropic', model: 'claude-3-sonnet', inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' },
    { provider: 'anthropic', model: 'claude-3-haiku', inputTokenPrice: 0.25, outputTokenPrice: 1.25, currency: 'USD' },
    { provider: 'anthropic', model: 'claude-3.5-sonnet', inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' },

    // AWS Bedrock / Cohere
    { provider: 'aws.bedrock', model: 'anthropic.claude-3-sonnet', inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' },
    { provider: 'cohere', model: 'command-r-plus', inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' },

    // OCI GenAI
    { provider: 'oci.genai', model: 'cohere.command-r-plus', inputTokenPrice: 3, outputTokenPrice: 15, currency: 'USD' },
];

// ============================================
// Custom Quality/Security Check Definition
// ============================================

export interface CustomCheckDefinition {
    id: string;
    name: string;
    type: 'quality' | 'security';
    description?: string;
    // Tag key to look for in span tags
    tagKey: string;
    // How to interpret the tag value
    evaluation: {
        type: 'boolean' | 'threshold' | 'regex';
        // For threshold: value above this = warning, above critical = fail
        warningThreshold?: number;
        criticalThreshold?: number;
        // For regex: pattern to match for detection
        pattern?: string;
    };
}

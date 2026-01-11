/**
 * OCI APM Span Exporter for OpenTelemetry
 *
 * Custom exporter that sends OpenTelemetry spans to OCI APM Tracing service.
 * Supports LLM-specific attributes following GenAI semantic conventions.
 */

import { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { OTEL_GENAI_KEYS } from './types';

export interface OCIAPMExporterConfig {
    /** OCI APM endpoint URL */
    endpoint: string;
    /** OCI APM Data Key (public or private) */
    dataKey: string;
    /** Compartment OCID */
    compartmentId?: string;
    /** Service name for APM */
    serviceName?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Batch size for span uploads (default: 100) */
    batchSize?: number;
    /** Flush interval in ms (default: 5000) */
    flushInterval?: number;
}

interface OCIAPMSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
    serviceName: string;
    startTimeInMillis: number;
    endTimeInMillis: number;
    durationInMillis: number;
    status: 'OK' | 'ERROR' | 'UNSET';
    kind: string;
    tags: Record<string, string>;
    logs?: Array<{
        timestamp: number;
        fields: Record<string, string>;
    }>;
}

/**
 * Custom OpenTelemetry SpanExporter for OCI APM
 */
export class OCIAPMExporter implements SpanExporter {
    private config: Required<OCIAPMExporterConfig>;
    private pendingSpans: OCIAPMSpan[] = [];
    private flushTimer?: ReturnType<typeof setInterval>;
    private isShutdown = false;

    constructor(config: OCIAPMExporterConfig) {
        this.config = {
            endpoint: config.endpoint,
            dataKey: config.dataKey,
            compartmentId: config.compartmentId || '',
            serviceName: config.serviceName || 'llm-observability',
            debug: config.debug || false,
            batchSize: config.batchSize || 100,
            flushInterval: config.flushInterval || 5000,
        };

        // Start periodic flush
        this.startFlushTimer();
    }

    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            if (this.pendingSpans.length > 0) {
                this.flushSpans();
            }
        }, this.config.flushInterval);
    }

    /**
     * Export spans to OCI APM
     */
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        if (this.isShutdown) {
            resultCallback({ code: ExportResultCode.FAILED });
            return;
        }

        try {
            const apmSpans = spans.map(span => this.convertToAPMSpan(span));
            this.pendingSpans.push(...apmSpans);

            if (this.config.debug) {
                console.log(`[OCI APM Exporter] Queued ${spans.length} spans (total pending: ${this.pendingSpans.length})`);
            }

            // Flush if batch size reached
            if (this.pendingSpans.length >= this.config.batchSize) {
                this.flushSpans();
            }

            resultCallback({ code: ExportResultCode.SUCCESS });
        } catch (error) {
            console.error('[OCI APM Exporter] Export error:', error);
            resultCallback({ code: ExportResultCode.FAILED });
        }
    }

    /**
     * Convert OpenTelemetry span to OCI APM format
     */
    private convertToAPMSpan(span: ReadableSpan): OCIAPMSpan {
        const startTimeMs = Math.floor(span.startTime[0] * 1000 + span.startTime[1] / 1000000);
        const endTimeMs = Math.floor(span.endTime[0] * 1000 + span.endTime[1] / 1000000);
        const durationMs = endTimeMs - startTimeMs;

        // Convert attributes to tags
        const tags: Record<string, string> = {};

        // Add all span attributes
        for (const [key, value] of Object.entries(span.attributes)) {
            tags[key] = String(value);
        }

        // Add resource attributes
        for (const [key, value] of Object.entries(span.resource.attributes)) {
            tags[`resource.${key}`] = String(value);
        }

        // Add LLM-specific computed tags
        this.addLLMTags(tags, span);

        // Convert events to logs
        const logs = span.events.map(event => ({
            timestamp: Math.floor(event.time[0] * 1000 + event.time[1] / 1000000),
            fields: {
                event: event.name,
                ...Object.fromEntries(
                    Object.entries(event.attributes || {}).map(([k, v]) => [k, String(v)])
                ),
            },
        }));

        // Determine status
        let status: 'OK' | 'ERROR' | 'UNSET' = 'UNSET';
        if (span.status.code === 1) status = 'OK';
        else if (span.status.code === 2) status = 'ERROR';

        // Get span kind name
        const kindNames = ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'];
        const kind = kindNames[span.kind] || 'INTERNAL';

        return {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
            parentSpanId: span.parentSpanId || undefined,
            operationName: span.name,
            serviceName: this.config.serviceName,
            startTimeInMillis: startTimeMs,
            endTimeInMillis: endTimeMs,
            durationInMillis: durationMs,
            status,
            kind,
            tags,
            logs: logs.length > 0 ? logs : undefined,
        };
    }

    /**
     * Add LLM-specific computed tags for better visualization
     */
    private addLLMTags(tags: Record<string, string>, span: ReadableSpan): void {
        const attrs = span.attributes;

        // Check if this is an LLM span
        const isLLM = !!(
            attrs[OTEL_GENAI_KEYS.REQUEST_MODEL] ||
            attrs[OTEL_GENAI_KEYS.PROVIDER_NAME] ||
            attrs['llm.model'] ||
            attrs['ai.model']
        );

        if (isLLM) {
            tags['llm.is_llm_span'] = 'true';

            // Calculate total tokens if not present
            const inputTokens = Number(attrs[OTEL_GENAI_KEYS.USAGE_INPUT_TOKENS]) || 0;
            const outputTokens = Number(attrs[OTEL_GENAI_KEYS.USAGE_OUTPUT_TOKENS]) || 0;
            if (inputTokens || outputTokens) {
                tags['llm.usage.total_tokens'] = String(inputTokens + outputTokens);
            }

            // Add model family for grouping
            const model = String(attrs[OTEL_GENAI_KEYS.REQUEST_MODEL] || attrs['llm.model'] || '');
            if (model) {
                if (model.includes('gpt')) tags['llm.model_family'] = 'gpt';
                else if (model.includes('claude')) tags['llm.model_family'] = 'claude';
                else if (model.includes('llama')) tags['llm.model_family'] = 'llama';
                else if (model.includes('cohere')) tags['llm.model_family'] = 'cohere';
                else tags['llm.model_family'] = 'other';
            }
        }

        // Check for tool calls
        if (attrs[OTEL_GENAI_KEYS.TOOL_NAME]) {
            tags['llm.is_tool_call'] = 'true';
        }

        // Check for agent activity
        if (attrs[OTEL_GENAI_KEYS.AGENT_NAME] || attrs[OTEL_GENAI_KEYS.AGENT_ID]) {
            tags['llm.is_agent_span'] = 'true';
        }
    }

    /**
     * Flush pending spans to OCI APM
     */
    private async flushSpans(): Promise<void> {
        if (this.pendingSpans.length === 0) return;

        const spansToSend = [...this.pendingSpans];
        this.pendingSpans = [];

        try {
            const response = await fetch(`${this.config.endpoint}/20200630/spans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.dataKey}`,
                    'opc-compartment-id': this.config.compartmentId,
                },
                body: JSON.stringify({
                    spans: spansToSend,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[OCI APM Exporter] Failed to send spans: ${response.status} - ${errorText}`);
                // Re-queue spans on failure (with limit)
                if (this.pendingSpans.length < this.config.batchSize * 3) {
                    this.pendingSpans.push(...spansToSend);
                }
            } else if (this.config.debug) {
                console.log(`[OCI APM Exporter] Successfully sent ${spansToSend.length} spans`);
            }
        } catch (error) {
            console.error('[OCI APM Exporter] Network error:', error);
            // Re-queue spans on failure (with limit)
            if (this.pendingSpans.length < this.config.batchSize * 3) {
                this.pendingSpans.push(...spansToSend);
            }
        }
    }

    /**
     * Force flush all pending spans
     */
    async forceFlush(): Promise<void> {
        await this.flushSpans();
    }

    /**
     * Shutdown the exporter
     */
    async shutdown(): Promise<void> {
        this.isShutdown = true;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flushSpans();
    }
}

/**
 * Create a mock exporter for development/testing
 */
export class MockOCIAPMExporter implements SpanExporter {
    private spans: OCIAPMSpan[] = [];
    private debug: boolean;

    constructor(debug = true) {
        this.debug = debug;
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        for (const span of spans) {
            const mockSpan: OCIAPMSpan = {
                traceId: span.spanContext().traceId,
                spanId: span.spanContext().spanId,
                parentSpanId: span.parentSpanId || undefined,
                operationName: span.name,
                serviceName: 'mock-service',
                startTimeInMillis: Math.floor(span.startTime[0] * 1000),
                endTimeInMillis: Math.floor(span.endTime[0] * 1000),
                durationInMillis: Math.floor((span.endTime[0] - span.startTime[0]) * 1000),
                status: 'OK',
                kind: 'INTERNAL',
                tags: Object.fromEntries(
                    Object.entries(span.attributes).map(([k, v]) => [k, String(v)])
                ),
            };
            this.spans.push(mockSpan);

            if (this.debug) {
                console.log('[Mock Exporter] Span:', {
                    name: span.name,
                    traceId: mockSpan.traceId.slice(0, 8),
                    duration: mockSpan.durationInMillis,
                    attributes: Object.keys(span.attributes).slice(0, 5),
                });
            }
        }
        resultCallback({ code: ExportResultCode.SUCCESS });
    }

    getSpans(): OCIAPMSpan[] {
        return [...this.spans];
    }

    clear(): void {
        this.spans = [];
    }

    async forceFlush(): Promise<void> {}
    async shutdown(): Promise<void> {}
}

/**
 * OpenTelemetry Tracer Setup for LLM Observability
 *
 * Initializes the OpenTelemetry SDK with OCI APM exporter
 * and configures resource attributes for LLM workloads.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import {
    SEMRESATTRS_SERVICE_NAME,
    SEMRESATTRS_SERVICE_VERSION,
    SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { trace, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OCIAPMExporter, OCIAPMExporterConfig, MockOCIAPMExporter } from './oci-apm-exporter';

export interface TracerConfig {
    /** Service name for tracing */
    serviceName: string;
    /** Service version */
    serviceVersion?: string;
    /** Deployment environment (production, staging, development) */
    environment?: string;
    /** OCI APM configuration (if not provided, uses mock exporter) */
    ociApm?: OCIAPMExporterConfig;
    /** Enable debug logging */
    debug?: boolean;
    /** Use simple processor instead of batch (for testing) */
    useSimpleProcessor?: boolean;
    /** Additional resource attributes */
    resourceAttributes?: Record<string, string>;
}

let isInitialized = false;
let provider: NodeTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing for LLM Observability
 *
 * @example
 * ```ts
 * // Production setup with OCI APM
 * initTracer({
 *   serviceName: 'my-llm-app',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 *   ociApm: {
 *     endpoint: process.env.OCI_APM_ENDPOINT!,
 *     dataKey: process.env.OCI_APM_DATA_KEY!,
 *     compartmentId: process.env.OCI_COMPARTMENT_ID,
 *   },
 * });
 *
 * // Development setup with mock exporter
 * initTracer({
 *   serviceName: 'my-llm-app',
 *   debug: true,
 * });
 * ```
 */
export function initTracer(config: TracerConfig): void {
    if (isInitialized) {
        console.warn('[LLM Tracer] Already initialized. Call shutdownTracer() first to reinitialize.');
        return;
    }

    // Enable debug logging if requested
    if (config.debug) {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    }

    // Create resource with service info
    const resource = new Resource({
        [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
        [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion || '0.0.0',
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment || 'development',
        // LLM-specific resource attributes
        'llm.observability.version': '1.0.0',
        'llm.observability.sdk': 'viewapp-llm-observability',
        ...config.resourceAttributes,
    });

    // Create provider
    provider = new NodeTracerProvider({
        resource,
    });

    // Create exporter
    let exporter;
    if (config.ociApm) {
        exporter = new OCIAPMExporter({
            ...config.ociApm,
            serviceName: config.serviceName,
            debug: config.debug,
        });
        console.log('[LLM Tracer] Using OCI APM exporter');
    } else {
        exporter = new MockOCIAPMExporter(config.debug);
        console.log('[LLM Tracer] Using mock exporter (no OCI APM config provided)');
    }

    // Create processor
    const processor = config.useSimpleProcessor
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30000,
        });

    provider.addSpanProcessor(processor);

    // Register the provider globally
    provider.register();

    isInitialized = true;
    console.log(`[LLM Tracer] Initialized for service: ${config.serviceName}`);
}

/**
 * Shutdown the tracer (flush pending spans and cleanup)
 */
export async function shutdownTracer(): Promise<void> {
    if (!isInitialized || !provider) {
        return;
    }

    try {
        await provider.shutdown();
        console.log('[LLM Tracer] Shutdown complete');
    } catch (error) {
        console.error('[LLM Tracer] Shutdown error:', error);
    } finally {
        isInitialized = false;
        provider = null;
    }
}

/**
 * Force flush all pending spans
 */
export async function flushTracer(): Promise<void> {
    if (!isInitialized || !provider) {
        return;
    }

    try {
        await provider.forceFlush();
        console.log('[LLM Tracer] Force flush complete');
    } catch (error) {
        console.error('[LLM Tracer] Force flush error:', error);
    }
}

/**
 * Get tracer initialization status
 */
export function isTracerInitialized(): boolean {
    return isInitialized;
}

/**
 * Get named tracer for specific component
 */
export function getNamedTracer(name: string, version?: string) {
    return trace.getTracer(name, version);
}

/**
 * Auto-initialize tracer from environment variables
 *
 * Environment variables:
 * - LLM_SERVICE_NAME: Service name (required)
 * - LLM_SERVICE_VERSION: Service version
 * - LLM_ENVIRONMENT: Deployment environment
 * - OCI_APM_ENDPOINT: OCI APM endpoint URL
 * - OCI_APM_DATA_KEY: OCI APM data key
 * - OCI_COMPARTMENT_ID: OCI compartment OCID
 * - LLM_TRACER_DEBUG: Enable debug mode
 */
export function initTracerFromEnv(): void {
    const serviceName = process.env.LLM_SERVICE_NAME;
    if (!serviceName) {
        console.warn('[LLM Tracer] LLM_SERVICE_NAME not set, skipping auto-initialization');
        return;
    }

    const config: TracerConfig = {
        serviceName,
        serviceVersion: process.env.LLM_SERVICE_VERSION,
        environment: process.env.LLM_ENVIRONMENT || process.env.NODE_ENV,
        debug: process.env.LLM_TRACER_DEBUG === 'true',
    };

    // Add OCI APM config if available
    const apmEndpoint = process.env.OCI_APM_ENDPOINT;
    const apmDataKey = process.env.OCI_APM_DATA_KEY;
    if (apmEndpoint && apmDataKey) {
        config.ociApm = {
            endpoint: apmEndpoint,
            dataKey: apmDataKey,
            compartmentId: process.env.OCI_COMPARTMENT_ID,
        };
    }

    initTracer(config);
}

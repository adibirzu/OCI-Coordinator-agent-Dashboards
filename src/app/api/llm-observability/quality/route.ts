/**
 * LLM Observability Quality Checks API
 *
 * Provides access to quality check results including:
 * - Hallucination detection
 * - Relevance scoring
 * - Coherence analysis
 * - Factual accuracy checks
 */

import { NextResponse } from 'next/server';

// In-memory cache for quality data
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute

type QualityCheckType = 'hallucination' | 'relevance' | 'coherence' | 'factual_accuracy' | 'toxicity' | 'bias';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface QualityCheckResult {
    checkId: string;
    traceId: string;
    spanId: string;
    checkType: QualityCheckType;
    score: number; // 0-1, higher is better (except for toxicity/bias where lower is better)
    passed: boolean;
    severity: Severity;
    details: string;
    timestamp: string;
    metadata?: {
        model?: string;
        provider?: string;
        promptTokens?: number;
        responseTokens?: number;
    };
}

interface QualitySummary {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    passRate: number;
    byType: {
        [key in QualityCheckType]?: {
            total: number;
            passed: number;
            failed: number;
            avgScore: number;
        };
    };
    bySeverity: {
        [key in Severity]: number;
    };
    trend: {
        direction: 'improving' | 'declining' | 'stable';
        percentChange: number;
    };
}

function generateDemoQualityChecks(count: number = 50): QualityCheckResult[] {
    const checkTypes: QualityCheckType[] = ['hallucination', 'relevance', 'coherence', 'factual_accuracy', 'toxicity', 'bias'];
    const models = ['gpt-4-turbo', 'gpt-4o', 'claude-3-sonnet', 'claude-3-haiku'];
    const providers = ['openai', 'anthropic'];

    return Array.from({ length: count }, (_, i) => {
        const checkType = checkTypes[Math.floor(Math.random() * checkTypes.length)];
        const isNegativeMetric = checkType === 'toxicity' || checkType === 'bias' || checkType === 'hallucination';

        // For negative metrics, lower is better; for positive metrics, higher is better
        const score = Math.random();
        const threshold = isNegativeMetric ? 0.3 : 0.7;
        const passed = isNegativeMetric ? score < threshold : score >= threshold;

        // Determine severity based on how far from threshold
        let severity: Severity;
        const distance = isNegativeMetric ? score - threshold : threshold - score;
        if (distance > 0.4) severity = 'critical';
        else if (distance > 0.2) severity = 'high';
        else if (distance > 0) severity = 'medium';
        else severity = 'low';

        const detailsMap: Record<QualityCheckType, string[]> = {
            hallucination: [
                'Response contains factual claims not supported by context',
                'Model generated plausible but unverifiable information',
                'Response aligns well with provided context',
                'Minor embellishment detected in response',
            ],
            relevance: [
                'Response directly addresses the user query',
                'Response partially addresses the query with tangential information',
                'Response drifts from the original topic',
                'High semantic similarity between query and response',
            ],
            coherence: [
                'Response maintains logical flow throughout',
                'Some logical inconsistencies detected',
                'Response structure could be improved',
                'Clear and well-organized response',
            ],
            factual_accuracy: [
                'Claims verified against knowledge base',
                'Unable to verify some factual claims',
                'Potential factual errors detected',
                'All verifiable claims are accurate',
            ],
            toxicity: [
                'No toxic content detected',
                'Mild negative sentiment detected',
                'Potentially inappropriate content flagged',
                'Response maintains professional tone',
            ],
            bias: [
                'No significant bias detected',
                'Potential gender/demographic bias flagged',
                'Response shows balanced perspective',
                'Minor phrasing bias detected',
            ],
        };

        return {
            checkId: `qc_${Date.now()}_${i.toString().padStart(4, '0')}`,
            traceId: `trace_${Date.now() - Math.floor(Math.random() * 3600000)}_${Math.floor(Math.random() * 1000)}`,
            spanId: `span_${Math.floor(Math.random() * 10000)}`,
            checkType,
            score: Math.round(score * 1000) / 1000,
            passed,
            severity: passed ? 'low' : severity,
            details: detailsMap[checkType][Math.floor(Math.random() * detailsMap[checkType].length)],
            timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
            metadata: {
                model: models[Math.floor(Math.random() * models.length)],
                provider: providers[Math.floor(Math.random() * providers.length)],
                promptTokens: Math.floor(Math.random() * 1000) + 100,
                responseTokens: Math.floor(Math.random() * 500) + 50,
            },
        };
    });
}

function calculateSummary(checks: QualityCheckResult[]): QualitySummary {
    const passedChecks = checks.filter(c => c.passed).length;

    const byType: QualitySummary['byType'] = {};
    const checkTypes: QualityCheckType[] = ['hallucination', 'relevance', 'coherence', 'factual_accuracy', 'toxicity', 'bias'];

    for (const type of checkTypes) {
        const typeChecks = checks.filter(c => c.checkType === type);
        if (typeChecks.length > 0) {
            byType[type] = {
                total: typeChecks.length,
                passed: typeChecks.filter(c => c.passed).length,
                failed: typeChecks.filter(c => !c.passed).length,
                avgScore: typeChecks.reduce((sum, c) => sum + c.score, 0) / typeChecks.length,
            };
        }
    }

    const bySeverity: QualitySummary['bySeverity'] = {
        low: checks.filter(c => c.severity === 'low').length,
        medium: checks.filter(c => c.severity === 'medium').length,
        high: checks.filter(c => c.severity === 'high').length,
        critical: checks.filter(c => c.severity === 'critical').length,
    };

    // Simulate trend
    const trendOptions: Array<'improving' | 'declining' | 'stable'> = ['improving', 'declining', 'stable'];
    const direction = trendOptions[Math.floor(Math.random() * trendOptions.length)];

    return {
        totalChecks: checks.length,
        passedChecks,
        failedChecks: checks.length - passedChecks,
        passRate: checks.length > 0 ? passedChecks / checks.length : 0,
        byType,
        bySeverity,
        trend: {
            direction,
            percentChange: Math.round(Math.random() * 20 * (direction === 'declining' ? -1 : 1)),
        },
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse query parameters
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const checkType = searchParams.get('checkType') as QualityCheckType | null;
        const severity = searchParams.get('severity') as Severity | null;
        const passed = searchParams.get('passed');
        const traceId = searchParams.get('traceId');
        const model = searchParams.get('model');
        const timeRange = searchParams.get('timeRange') || '24h';

        // Build cache key
        const cacheKey = `quality_${JSON.stringify({
            limit, offset, checkType, severity, passed, traceId, model, timeRange
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
        let checks = generateDemoQualityChecks(200);

        // Apply filters
        if (checkType) {
            checks = checks.filter(c => c.checkType === checkType);
        }
        if (severity) {
            checks = checks.filter(c => c.severity === severity);
        }
        if (passed !== null) {
            const passedBool = passed === 'true';
            checks = checks.filter(c => c.passed === passedBool);
        }
        if (traceId) {
            checks = checks.filter(c => c.traceId === traceId);
        }
        if (model) {
            checks = checks.filter(c => c.metadata?.model === model);
        }

        // Sort by timestamp (newest first)
        checks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Calculate summary before pagination
        const summary = calculateSummary(checks);

        // Paginate
        const total = checks.length;
        const paginatedChecks = checks.slice(offset, offset + limit);

        const response = {
            checks: paginatedChecks,
            summary,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
            },
            filters: {
                checkType,
                severity,
                passed: passed !== null ? passed === 'true' : null,
                traceId,
                model,
                timeRange,
            },
        };

        // Update cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error) {
        console.error('[LLM Quality API] Error:', error);
        return NextResponse.json({
            checks: [],
            summary: {
                totalChecks: 0,
                passedChecks: 0,
                failedChecks: 0,
                passRate: 0,
                byType: {},
                bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
                trend: { direction: 'stable', percentChange: 0 },
            },
            pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

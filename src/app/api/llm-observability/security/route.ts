/**
 * LLM Observability Security Checks API
 *
 * Provides access to security check results including:
 * - Prompt injection detection
 * - PII/sensitive data detection
 * - Jailbreak attempt detection
 * - Data leakage prevention
 */

import { NextResponse } from 'next/server';

// In-memory cache for security data
interface CacheEntry {
    data: any;
    timestamp: number;
}
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds (shorter for security data)

type SecurityCheckType = 'prompt_injection' | 'pii_detection' | 'jailbreak' | 'data_leakage' | 'harmful_content' | 'credential_exposure';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type Location = 'input' | 'output' | 'both';

interface SecurityCheckResult {
    checkId: string;
    traceId: string;
    spanId: string;
    checkType: SecurityCheckType;
    detected: boolean;
    severity: Severity;
    confidence: number; // 0-1
    location: Location;
    details: string;
    timestamp: string;
    remediation?: string;
    metadata?: {
        model?: string;
        provider?: string;
        inputLength?: number;
        outputLength?: number;
        blockedContent?: boolean;
    };
}

interface SecuritySummary {
    totalChecks: number;
    detectedIssues: number;
    blockedRequests: number;
    byType: {
        [key in SecurityCheckType]?: {
            total: number;
            detected: number;
            blocked: number;
        };
    };
    bySeverity: {
        [key in Severity]: number;
    };
    byLocation: {
        input: number;
        output: number;
        both: number;
    };
    riskScore: number; // 0-100
    trend: {
        direction: 'improving' | 'worsening' | 'stable';
        percentChange: number;
    };
}

function generateDemoSecurityChecks(count: number = 50): SecurityCheckResult[] {
    const checkTypes: SecurityCheckType[] = ['prompt_injection', 'pii_detection', 'jailbreak', 'data_leakage', 'harmful_content', 'credential_exposure'];
    const locations: Location[] = ['input', 'output', 'both'];
    const models = ['gpt-4-turbo', 'gpt-4o', 'claude-3-sonnet', 'claude-3-haiku'];
    const providers = ['openai', 'anthropic'];

    const detailsMap: Record<SecurityCheckType, { detected: string[]; clean: string[] }> = {
        prompt_injection: {
            detected: [
                'Potential prompt injection pattern detected: "ignore previous instructions"',
                'Suspicious instruction override attempt identified',
                'Multi-language injection attempt detected',
                'Encoded instruction injection detected (base64)',
            ],
            clean: [
                'No prompt injection patterns detected',
                'Input validated against injection patterns',
            ],
        },
        pii_detection: {
            detected: [
                'Email address detected in response',
                'Phone number pattern found in output',
                'Social Security Number pattern detected',
                'Credit card number pattern identified',
                'Physical address detected',
            ],
            clean: [
                'No PII detected in content',
                'Content sanitized for PII',
            ],
        },
        jailbreak: {
            detected: [
                'DAN (Do Anything Now) jailbreak pattern detected',
                'Role-play bypass attempt identified',
                'System prompt extraction attempt',
                'Capability unlocking pattern detected',
            ],
            clean: [
                'No jailbreak attempts detected',
                'Request within safety guidelines',
            ],
        },
        data_leakage: {
            detected: [
                'Potential training data leakage in response',
                'System prompt content detected in output',
                'Internal configuration exposed',
                'API key pattern detected in response',
            ],
            clean: [
                'No data leakage detected',
                'Response sanitized for sensitive data',
            ],
        },
        harmful_content: {
            detected: [
                'Request for harmful instructions detected',
                'Violent content generation attempt',
                'Illegal activity instructions requested',
                'Self-harm content flagged',
            ],
            clean: [
                'Content within safety guidelines',
                'No harmful content detected',
            ],
        },
        credential_exposure: {
            detected: [
                'API key pattern detected',
                'Password exposed in conversation',
                'OAuth token in response',
                'AWS credentials pattern found',
            ],
            clean: [
                'No credentials detected',
                'Credential patterns sanitized',
            ],
        },
    };

    const remediationMap: Record<SecurityCheckType, string[]> = {
        prompt_injection: [
            'Input sanitization applied',
            'Request blocked and logged',
            'User warned about injection attempt',
        ],
        pii_detection: [
            'PII automatically redacted',
            'Response filtered for sensitive data',
            'User notified of PII detection',
        ],
        jailbreak: [
            'Request blocked and flagged for review',
            'Safety guardrails enforced',
            'Conversation terminated',
        ],
        data_leakage: [
            'Response filtered before delivery',
            'Sensitive data redacted',
            'Incident logged for review',
        ],
        harmful_content: [
            'Request blocked with safety message',
            'Content moderation applied',
            'Flagged for human review',
        ],
        credential_exposure: [
            'Credentials automatically masked',
            'Response filtered',
            'Security alert generated',
        ],
    };

    return Array.from({ length: count }, (_, i) => {
        const checkType = checkTypes[Math.floor(Math.random() * checkTypes.length)];
        const detected = Math.random() < 0.15; // 15% detection rate

        let severity: Severity;
        if (!detected) {
            severity = 'low';
        } else {
            const sevRand = Math.random();
            if (sevRand < 0.1) severity = 'critical';
            else if (sevRand < 0.3) severity = 'high';
            else if (sevRand < 0.6) severity = 'medium';
            else severity = 'low';
        }

        const details = detected
            ? detailsMap[checkType].detected[Math.floor(Math.random() * detailsMap[checkType].detected.length)]
            : detailsMap[checkType].clean[Math.floor(Math.random() * detailsMap[checkType].clean.length)];

        const blocked = detected && (severity === 'critical' || severity === 'high' || Math.random() < 0.5);

        return {
            checkId: `sc_${Date.now()}_${i.toString().padStart(4, '0')}`,
            traceId: `trace_${Date.now() - Math.floor(Math.random() * 3600000)}_${Math.floor(Math.random() * 1000)}`,
            spanId: `span_${Math.floor(Math.random() * 10000)}`,
            checkType,
            detected,
            severity,
            confidence: detected ? 0.7 + Math.random() * 0.3 : 0.9 + Math.random() * 0.1,
            location: locations[Math.floor(Math.random() * locations.length)],
            details,
            timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
            remediation: detected
                ? remediationMap[checkType][Math.floor(Math.random() * remediationMap[checkType].length)]
                : undefined,
            metadata: {
                model: models[Math.floor(Math.random() * models.length)],
                provider: providers[Math.floor(Math.random() * providers.length)],
                inputLength: Math.floor(Math.random() * 2000) + 100,
                outputLength: Math.floor(Math.random() * 1000) + 50,
                blockedContent: blocked,
            },
        };
    });
}

function calculateSummary(checks: SecurityCheckResult[]): SecuritySummary {
    const detectedIssues = checks.filter(c => c.detected).length;
    const blockedRequests = checks.filter(c => c.metadata?.blockedContent).length;

    const byType: SecuritySummary['byType'] = {};
    const checkTypes: SecurityCheckType[] = ['prompt_injection', 'pii_detection', 'jailbreak', 'data_leakage', 'harmful_content', 'credential_exposure'];

    for (const type of checkTypes) {
        const typeChecks = checks.filter(c => c.checkType === type);
        if (typeChecks.length > 0) {
            byType[type] = {
                total: typeChecks.length,
                detected: typeChecks.filter(c => c.detected).length,
                blocked: typeChecks.filter(c => c.metadata?.blockedContent).length,
            };
        }
    }

    const bySeverity: SecuritySummary['bySeverity'] = {
        low: checks.filter(c => c.detected && c.severity === 'low').length,
        medium: checks.filter(c => c.detected && c.severity === 'medium').length,
        high: checks.filter(c => c.detected && c.severity === 'high').length,
        critical: checks.filter(c => c.detected && c.severity === 'critical').length,
    };

    const byLocation: SecuritySummary['byLocation'] = {
        input: checks.filter(c => c.detected && c.location === 'input').length,
        output: checks.filter(c => c.detected && c.location === 'output').length,
        both: checks.filter(c => c.detected && c.location === 'both').length,
    };

    // Calculate risk score (0-100)
    const riskFactors = {
        critical: 40,
        high: 20,
        medium: 5,
        low: 1,
    };
    const rawRisk = Object.entries(bySeverity).reduce(
        (sum, [sev, count]) => sum + count * riskFactors[sev as Severity],
        0
    );
    const riskScore = Math.min(100, Math.round(rawRisk / Math.max(1, checks.length) * 100));

    // Simulate trend
    const trendOptions: Array<'improving' | 'worsening' | 'stable'> = ['improving', 'worsening', 'stable'];
    const direction = trendOptions[Math.floor(Math.random() * trendOptions.length)];

    return {
        totalChecks: checks.length,
        detectedIssues,
        blockedRequests,
        byType,
        bySeverity,
        byLocation,
        riskScore,
        trend: {
            direction,
            percentChange: Math.round(Math.random() * 15 * (direction === 'worsening' ? 1 : -1)),
        },
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Parse query parameters
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const checkType = searchParams.get('checkType') as SecurityCheckType | null;
        const severity = searchParams.get('severity') as Severity | null;
        const detected = searchParams.get('detected');
        const location = searchParams.get('location') as Location | null;
        const traceId = searchParams.get('traceId');
        const model = searchParams.get('model');
        const timeRange = searchParams.get('timeRange') || '24h';

        // Build cache key
        const cacheKey = `security_${JSON.stringify({
            limit, offset, checkType, severity, detected, location, traceId, model, timeRange
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
        let checks = generateDemoSecurityChecks(200);

        // Apply filters
        if (checkType) {
            checks = checks.filter(c => c.checkType === checkType);
        }
        if (severity) {
            checks = checks.filter(c => c.severity === severity);
        }
        if (detected !== null) {
            const detectedBool = detected === 'true';
            checks = checks.filter(c => c.detected === detectedBool);
        }
        if (location) {
            checks = checks.filter(c => c.location === location);
        }
        if (traceId) {
            checks = checks.filter(c => c.traceId === traceId);
        }
        if (model) {
            checks = checks.filter(c => c.metadata?.model === model);
        }

        // Sort by timestamp (newest first), then by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        checks.sort((a, b) => {
            const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            if (Math.abs(timeDiff) < 60000) { // Within 1 minute, sort by severity
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return timeDiff;
        });

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
                detected: detected !== null ? detected === 'true' : null,
                location,
                traceId,
                model,
                timeRange,
            },
        };

        // Update cache
        cache.set(cacheKey, { data: response, timestamp: Date.now() });

        return NextResponse.json(response);
    } catch (error) {
        console.error('[LLM Security API] Error:', error);
        return NextResponse.json({
            checks: [],
            summary: {
                totalChecks: 0,
                detectedIssues: 0,
                blockedRequests: 0,
                byType: {},
                bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
                byLocation: { input: 0, output: 0, both: 0 },
                riskScore: 0,
                trend: { direction: 'stable', percentChange: 0 },
            },
            pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

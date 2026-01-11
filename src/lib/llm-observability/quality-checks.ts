/**
 * LLM Quality Checks
 *
 * Implements quality evaluation for LLM outputs:
 * - Hallucination detection
 * - Relevance scoring
 * - Toxicity detection
 * - Sentiment analysis
 * - Coherence evaluation
 *
 * These checks can run client-side with heuristics or
 * be enhanced with server-side ML models.
 */

import {
    QualityCheck,
    QualityCheckType,
    QualityCheckSeverity,
    LLMMessage,
} from './types';

// ============================================
// Configuration
// ============================================

export interface QualityCheckConfig {
    /** Enable hallucination detection */
    checkHallucination?: boolean;
    /** Enable relevance scoring */
    checkRelevance?: boolean;
    /** Enable toxicity detection */
    checkToxicity?: boolean;
    /** Enable sentiment analysis */
    checkSentiment?: boolean;
    /** Enable coherence evaluation */
    checkCoherence?: boolean;
    /** Custom thresholds */
    thresholds?: {
        hallucinationWarning?: number;
        hallucinationFail?: number;
        relevanceWarning?: number;
        relevanceFail?: number;
        toxicityWarning?: number;
        toxicityFail?: number;
        coherenceWarning?: number;
        coherenceFail?: number;
    };
}

const DEFAULT_CONFIG: Required<QualityCheckConfig> = {
    checkHallucination: true,
    checkRelevance: true,
    checkToxicity: true,
    checkSentiment: true,
    checkCoherence: true,
    thresholds: {
        hallucinationWarning: 0.3,
        hallucinationFail: 0.6,
        relevanceWarning: 0.6,
        relevanceFail: 0.3,
        toxicityWarning: 0.3,
        toxicityFail: 0.6,
        coherenceWarning: 0.6,
        coherenceFail: 0.3,
    },
};

// ============================================
// Quality Check Context
// ============================================

export interface QualityCheckContext {
    /** The user's input/query */
    userInput?: string;
    /** The LLM's response */
    llmOutput: string;
    /** Context/documents provided to the LLM */
    providedContext?: string[];
    /** System instructions given to the LLM */
    systemInstructions?: string;
    /** Full message history */
    messages?: LLMMessage[];
    /** Expected topics/keywords for relevance */
    expectedTopics?: string[];
}

// ============================================
// Hallucination Detection
// ============================================

/**
 * Common factual patterns that indicate potential hallucinations
 * when not supported by context
 */
const FACTUAL_CLAIM_PATTERNS = [
    /(?:was|is|are|were)\s+(?:founded|established|created|started)\s+(?:in|on)\s+(\d{4})/gi,
    /(?:born|died)\s+(?:in|on)\s+(?:\w+\s+\d{1,2},?\s+)?(\d{4})/gi,
    /(?:is|are|was|were)\s+(?:approximately|about|roughly|around)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:million|billion|trillion)?/gi,
    /(?:according to|based on)\s+(?:studies|research|data|statistics|reports)/gi,
    /(?:studies\s+(?:show|indicate|suggest|prove)|research\s+(?:shows|indicates|suggests|proves))/gi,
    /(?:in fact|actually|contrary to|unlike)/gi,
    /(?:the\s+(?:first|largest|smallest|oldest|newest|most|least))/gi,
    /(?:\d+(?:\.\d+)?%\s+(?:of|increase|decrease|growth|reduction))/gi,
];

/**
 * Hedging language that reduces hallucination risk
 */
const HEDGING_PATTERNS = [
    /(?:I\s+(?:think|believe|assume)|it\s+(?:seems|appears|looks\s+like))/gi,
    /(?:may|might|could|possibly|potentially|perhaps|probably)/gi,
    /(?:I'm\s+not\s+(?:sure|certain)|I\s+don't\s+(?:know|have))/gi,
    /(?:based\s+on\s+(?:my|the\s+provided)\s+(?:knowledge|information|context))/gi,
    /(?:if\s+I\s+understand\s+correctly|correct\s+me\s+if\s+I'm\s+wrong)/gi,
];

/**
 * Detect potential hallucinations in LLM output
 */
export function detectHallucination(context: QualityCheckContext): QualityCheck {
    const { llmOutput, providedContext = [], userInput } = context;

    let score = 0;
    const issues: string[] = [];

    // Check for factual claims
    let factualClaimCount = 0;
    let unsupportedClaimCount = 0;

    for (const pattern of FACTUAL_CLAIM_PATTERNS) {
        const matches = llmOutput.match(pattern);
        if (matches) {
            factualClaimCount += matches.length;

            // Check if claims are supported by context
            for (const match of matches) {
                const supported = providedContext.some((ctx) =>
                    ctx.toLowerCase().includes(match.toLowerCase())
                );
                if (!supported) {
                    unsupportedClaimCount++;
                }
            }
        }
    }

    // Calculate factual claim ratio
    if (factualClaimCount > 0) {
        const unsupportedRatio = unsupportedClaimCount / factualClaimCount;
        if (unsupportedRatio > 0.5) {
            score += 0.3;
            issues.push(`${unsupportedClaimCount}/${factualClaimCount} factual claims not found in context`);
        }
    }

    // Check for hedging language (reduces hallucination score)
    let hedgingCount = 0;
    for (const pattern of HEDGING_PATTERNS) {
        const matches = llmOutput.match(pattern);
        if (matches) {
            hedgingCount += matches.length;
        }
    }

    // Hedging reduces the score
    if (hedgingCount > 2) {
        score -= 0.1;
    }

    // Check for contradictions with user input
    if (userInput) {
        const userKeywords = extractKeywords(userInput);
        const outputKeywords = extractKeywords(llmOutput);

        // Check for negation contradictions
        const negationPatterns = [
            { positive: /\bis\b/gi, negative: /\bis\s+not\b|\bisn't\b/gi },
            { positive: /\bcan\b/gi, negative: /\bcan\s*not\b|\bcan't\b/gi },
            { positive: /\bwill\b/gi, negative: /\bwill\s+not\b|\bwon't\b/gi },
            { positive: /\bdoes\b/gi, negative: /\bdoes\s+not\b|\bdoesn't\b/gi },
        ];

        for (const { positive, negative } of negationPatterns) {
            const userHasPositive = positive.test(userInput);
            const outputHasNegative = negative.test(llmOutput);
            if (userHasPositive && outputHasNegative) {
                score += 0.15;
                issues.push('Potential contradiction with user statement');
                break;
            }
        }
    }

    // Check for confident statements without context support
    const confidentPatterns = [
        /(?:definitely|certainly|absolutely|undoubtedly|clearly|obviously)/gi,
        /(?:always|never|every|none|all)\s+\w+/gi,
    ];

    for (const pattern of confidentPatterns) {
        const matches = llmOutput.match(pattern);
        if (matches && matches.length > 2 && providedContext.length === 0) {
            score += 0.2;
            issues.push('High-confidence language without supporting context');
            break;
        }
    }

    // Check response length vs context length
    if (providedContext.length > 0) {
        const contextLength = providedContext.join(' ').length;
        const outputLength = llmOutput.length;

        // Very long outputs relative to context may indicate fabrication
        if (outputLength > contextLength * 3 && contextLength < 500) {
            score += 0.15;
            issues.push('Response significantly longer than provided context');
        }
    }

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    // Determine severity
    let severity: QualityCheckSeverity = 'pass';
    if (score >= DEFAULT_CONFIG.thresholds.hallucinationFail!) {
        severity = 'fail';
    } else if (score >= DEFAULT_CONFIG.thresholds.hallucinationWarning!) {
        severity = 'warning';
    }

    return {
        type: 'hallucination',
        name: 'Hallucination Detection',
        score,
        severity,
        details: issues.length > 0 ? issues.join('; ') : 'No significant hallucination indicators detected',
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// Relevance Scoring
// ============================================

/**
 * Score how relevant the LLM output is to the user's input
 */
export function scoreRelevance(context: QualityCheckContext): QualityCheck {
    const { llmOutput, userInput, expectedTopics = [] } = context;

    if (!userInput) {
        return {
            type: 'relevance',
            name: 'Relevance Score',
            score: 1,
            severity: 'pass',
            details: 'No user input provided for relevance comparison',
            timestamp: new Date().toISOString(),
        };
    }

    let score = 0;
    const issues: string[] = [];

    // Extract keywords from user input
    const userKeywords = extractKeywords(userInput);
    const outputKeywords = extractKeywords(llmOutput);

    // Calculate keyword overlap
    const overlap = userKeywords.filter((kw) =>
        outputKeywords.some((okw) => okw.toLowerCase().includes(kw.toLowerCase()) ||
            kw.toLowerCase().includes(okw.toLowerCase()))
    );

    const keywordScore = userKeywords.length > 0
        ? overlap.length / userKeywords.length
        : 0;

    score += keywordScore * 0.4;

    // Check for expected topics
    if (expectedTopics.length > 0) {
        const topicsFound = expectedTopics.filter((topic) =>
            llmOutput.toLowerCase().includes(topic.toLowerCase())
        );
        const topicScore = topicsFound.length / expectedTopics.length;
        score += topicScore * 0.3;

        if (topicScore < 0.5) {
            issues.push(`Only ${topicsFound.length}/${expectedTopics.length} expected topics addressed`);
        }
    } else {
        // No expected topics, give partial credit
        score += 0.15;
    }

    // Check if response addresses the question type
    const questionTypes = {
        what: /\bwhat\b/i,
        who: /\bwho\b/i,
        when: /\bwhen\b/i,
        where: /\bwhere\b/i,
        why: /\bwhy\b/i,
        how: /\bhow\b/i,
        isAre: /\b(?:is|are)\s+\w+\?/i,
        canCould: /\b(?:can|could)\s+\w+/i,
    };

    let questionAddressed = false;
    for (const [type, pattern] of Object.entries(questionTypes)) {
        if (pattern.test(userInput)) {
            // Check if response contains typical answer patterns
            const answerPatterns: Record<string, RegExp> = {
                what: /(?:is|are|was|were|means|refers to|defined as)/i,
                who: /(?:\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b|person|individual|team|group)/i,
                when: /(?:\d{4}|\d{1,2}\/\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december)/i,
                where: /(?:in|at|on|near|located|place|location|country|city|region)/i,
                why: /(?:because|reason|due to|since|therefore|result|cause)/i,
                how: /(?:by|through|using|step|method|process|way|approach)/i,
                isAre: /(?:yes|no|true|false|correct|incorrect|is|are|isn't|aren't)/i,
                canCould: /(?:yes|no|can|cannot|could|possible|impossible|able)/i,
            };

            if (answerPatterns[type] && answerPatterns[type].test(llmOutput)) {
                questionAddressed = true;
                score += 0.2;
            }
            break;
        }
    }

    if (!questionAddressed && Object.values(questionTypes).some(p => p.test(userInput))) {
        issues.push('Response may not directly address the question type');
    }

    // Check for off-topic detection
    const offTopicIndicators = [
        /(?:I\s+can't\s+help\s+with\s+that)/i,
        /(?:I'm\s+not\s+able\s+to)/i,
        /(?:that's\s+outside\s+my)/i,
        /(?:let\s+me\s+tell\s+you\s+about\s+something\s+else)/i,
    ];

    for (const pattern of offTopicIndicators) {
        if (pattern.test(llmOutput)) {
            score -= 0.3;
            issues.push('Response indicates off-topic or refusal');
            break;
        }
    }

    // Semantic similarity approximation using shared n-grams
    const userNgrams = getNgrams(userInput.toLowerCase(), 2);
    const outputNgrams = getNgrams(llmOutput.toLowerCase(), 2);

    const sharedNgrams = userNgrams.filter((ng) => outputNgrams.includes(ng));
    const ngramScore = userNgrams.length > 0
        ? sharedNgrams.length / userNgrams.length
        : 0;

    score += ngramScore * 0.1;

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    // Determine severity (higher score = better relevance)
    let severity: QualityCheckSeverity = 'pass';
    if (score <= DEFAULT_CONFIG.thresholds.relevanceFail!) {
        severity = 'fail';
    } else if (score <= DEFAULT_CONFIG.thresholds.relevanceWarning!) {
        severity = 'warning';
    }

    return {
        type: 'relevance',
        name: 'Relevance Score',
        score,
        severity,
        details: issues.length > 0 ? issues.join('; ') : `Good relevance (${Math.round(score * 100)}% match)`,
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// Toxicity Detection
// ============================================

/**
 * Toxic and harmful content patterns
 * Note: This is a simplified heuristic. Production systems should use ML models.
 */
const TOXICITY_PATTERNS = [
    // Profanity (simplified - use a proper profanity list in production)
    { pattern: /\b(?:damn|hell|crap)\b/gi, weight: 0.1, category: 'mild_profanity' },

    // Hate speech indicators
    { pattern: /\b(?:hate|despise|loathe)\s+(?:all|every|those)\s+\w+/gi, weight: 0.4, category: 'hate_speech' },

    // Threats
    { pattern: /\b(?:kill|murder|destroy|eliminate)\s+(?:you|them|all)/gi, weight: 0.8, category: 'threat' },
    { pattern: /\b(?:I\s+will|going\s+to|want\s+to)\s+(?:hurt|harm|attack)/gi, weight: 0.7, category: 'threat' },

    // Discrimination
    { pattern: /\b(?:should\s+not|shouldn't|don't\s+deserve)\s+(?:exist|live|be\s+allowed)/gi, weight: 0.6, category: 'discrimination' },

    // Harassment
    { pattern: /\b(?:you\s+are|you're)\s+(?:stupid|dumb|idiot|worthless|useless)/gi, weight: 0.5, category: 'harassment' },

    // Self-harm
    { pattern: /\b(?:how\s+to|ways\s+to)\s+(?:hurt|harm)\s+(?:yourself|myself)/gi, weight: 0.9, category: 'self_harm' },

    // Violence encouragement
    { pattern: /\b(?:you\s+should|they\s+deserve)\s+(?:to\s+be|to\s+get)\s+(?:hurt|beaten|attacked)/gi, weight: 0.8, category: 'violence' },
];

/**
 * Detect toxic content in LLM output
 */
export function detectToxicity(context: QualityCheckContext): QualityCheck {
    const { llmOutput, userInput } = context;

    let score = 0;
    const issues: string[] = [];
    const categories = new Set<string>();

    // Check output for toxic patterns
    for (const { pattern, weight, category } of TOXICITY_PATTERNS) {
        const matches = llmOutput.match(pattern);
        if (matches) {
            score += weight * Math.min(matches.length, 3) / 3;
            categories.add(category);
        }
    }

    // Also check user input for context
    if (userInput) {
        for (const { pattern, category } of TOXICITY_PATTERNS) {
            if (pattern.test(userInput)) {
                // If user input is toxic and LLM doesn't refuse, that's a concern
                const refusalPatterns = [
                    /(?:I\s+can't|I\s+won't|I'm\s+not\s+able|I\s+cannot)/i,
                    /(?:inappropriate|harmful|offensive|against\s+my)/i,
                ];

                const hasRefusal = refusalPatterns.some((p) => p.test(llmOutput));
                if (!hasRefusal) {
                    score += 0.2;
                    issues.push(`Potentially harmful user request not declined`);
                }
                break;
            }
        }
    }

    // Check for all-caps (shouting)
    const capsRatio = (llmOutput.match(/[A-Z]/g) || []).length / llmOutput.length;
    if (capsRatio > 0.5 && llmOutput.length > 20) {
        score += 0.1;
        issues.push('Excessive capitalization detected');
    }

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    if (categories.size > 0) {
        issues.push(`Categories: ${Array.from(categories).join(', ')}`);
    }

    // Determine severity
    let severity: QualityCheckSeverity = 'pass';
    if (score >= DEFAULT_CONFIG.thresholds.toxicityFail!) {
        severity = 'fail';
    } else if (score >= DEFAULT_CONFIG.thresholds.toxicityWarning!) {
        severity = 'warning';
    }

    return {
        type: 'toxicity',
        name: 'Toxicity Detection',
        score,
        severity,
        details: issues.length > 0 ? issues.join('; ') : 'No toxic content detected',
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// Sentiment Analysis
// ============================================

const SENTIMENT_WORDS = {
    positive: [
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
        'love', 'happy', 'glad', 'pleased', 'delighted', 'thank', 'helpful', 'useful',
        'perfect', 'best', 'enjoy', 'beautiful', 'success', 'brilliant', 'outstanding',
    ],
    negative: [
        'bad', 'terrible', 'awful', 'horrible', 'poor', 'worst', 'hate', 'angry',
        'sad', 'disappointed', 'frustrated', 'annoyed', 'upset', 'fail', 'wrong',
        'problem', 'issue', 'error', 'broken', 'useless', 'stupid', 'boring',
    ],
};

/**
 * Analyze sentiment of LLM output
 */
export function analyzeSentiment(context: QualityCheckContext): QualityCheck {
    const { llmOutput } = context;

    const words = llmOutput.toLowerCase().split(/\W+/);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
        if (SENTIMENT_WORDS.positive.includes(word)) positiveCount++;
        if (SENTIMENT_WORDS.negative.includes(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    let score = 0.5; // Neutral
    let sentiment = 'neutral';

    if (total > 0) {
        score = positiveCount / total;
        if (score > 0.6) sentiment = 'positive';
        else if (score < 0.4) sentiment = 'negative';
    }

    // Check for negation modifiers
    const negationPatterns = /\b(?:not|never|no|don't|doesn't|didn't|won't|wouldn't|can't|couldn't)\s+\w+/gi;
    const negations = llmOutput.match(negationPatterns) || [];

    // Sentiment analysis is informational, always passes
    return {
        type: 'sentiment',
        name: 'Sentiment Analysis',
        score,
        severity: 'pass',
        details: `${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} sentiment (${positiveCount} positive, ${negativeCount} negative words${negations.length > 0 ? `, ${negations.length} negations` : ''})`,
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// Coherence Evaluation
// ============================================

/**
 * Evaluate coherence and logical flow of LLM output
 */
export function evaluateCoherence(context: QualityCheckContext): QualityCheck {
    const { llmOutput } = context;

    let score = 1.0;
    const issues: string[] = [];

    // Check sentence structure
    const sentences = llmOutput.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    if (sentences.length === 0) {
        return {
            type: 'coherence',
            name: 'Coherence Evaluation',
            score: 0,
            severity: 'fail',
            details: 'No coherent sentences detected',
            timestamp: new Date().toISOString(),
        };
    }

    // Check for very short sentences (may indicate incomplete thoughts)
    const shortSentences = sentences.filter((s) => s.trim().split(/\s+/).length < 3);
    if (shortSentences.length > sentences.length * 0.5 && sentences.length > 2) {
        score -= 0.2;
        issues.push('Many very short sentences');
    }

    // Check for repetition
    const normalizedSentences = sentences.map((s) => s.trim().toLowerCase());
    const uniqueSentences = new Set(normalizedSentences);
    if (uniqueSentences.size < sentences.length * 0.8 && sentences.length > 3) {
        score -= 0.2;
        issues.push('Repetitive sentences detected');
    }

    // Check for transition words (indicates logical flow)
    const transitionWords = [
        'however', 'therefore', 'furthermore', 'additionally', 'moreover',
        'consequently', 'meanwhile', 'nevertheless', 'otherwise', 'thus',
        'first', 'second', 'third', 'finally', 'next', 'then', 'lastly',
        'for example', 'for instance', 'in conclusion', 'in summary',
    ];

    const hasTransitions = transitionWords.some((tw) =>
        llmOutput.toLowerCase().includes(tw)
    );

    if (sentences.length > 3 && !hasTransitions) {
        score -= 0.1;
        issues.push('Limited use of transition words');
    }

    // Check for incomplete sentences (starting with lowercase after period)
    const incompletePattern = /\.\s+[a-z]/g;
    const incompleteMatches = llmOutput.match(incompletePattern);
    if (incompleteMatches && incompleteMatches.length > 2) {
        score -= 0.15;
        issues.push('Possible sentence fragments');
    }

    // Check for consistent tense (simplified)
    const pastTense = (llmOutput.match(/\b\w+ed\b/g) || []).length;
    const presentTense = (llmOutput.match(/\b(?:is|are|am|have|has|do|does)\b/gi) || []).length;

    if (pastTense > 5 && presentTense > 5) {
        const tenseRatio = Math.min(pastTense, presentTense) / Math.max(pastTense, presentTense);
        if (tenseRatio > 0.7) {
            score -= 0.1;
            issues.push('Inconsistent verb tense');
        }
    }

    // Check for average sentence length (readability)
    const avgWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgWords > 35) {
        score -= 0.1;
        issues.push('Very long sentences may reduce readability');
    }

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    // Determine severity (higher score = better coherence)
    let severity: QualityCheckSeverity = 'pass';
    if (score <= DEFAULT_CONFIG.thresholds.coherenceFail!) {
        severity = 'fail';
    } else if (score <= DEFAULT_CONFIG.thresholds.coherenceWarning!) {
        severity = 'warning';
    }

    return {
        type: 'coherence',
        name: 'Coherence Evaluation',
        score,
        severity,
        details: issues.length > 0 ? issues.join('; ') : `Good coherence (${sentences.length} sentences, avg ${Math.round(avgWords)} words)`,
        timestamp: new Date().toISOString(),
    };
}

// ============================================
// Main Quality Check Runner
// ============================================

/**
 * Run all configured quality checks
 */
export function runQualityChecks(
    context: QualityCheckContext,
    config: QualityCheckConfig = {}
): QualityCheck[] {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const checks: QualityCheck[] = [];

    if (mergedConfig.checkHallucination) {
        checks.push(detectHallucination(context));
    }

    if (mergedConfig.checkRelevance) {
        checks.push(scoreRelevance(context));
    }

    if (mergedConfig.checkToxicity) {
        checks.push(detectToxicity(context));
    }

    if (mergedConfig.checkSentiment) {
        checks.push(analyzeSentiment(context));
    }

    if (mergedConfig.checkCoherence) {
        checks.push(evaluateCoherence(context));
    }

    return checks;
}

/**
 * Get a summary of quality check results
 */
export function getQualityCheckSummary(checks: QualityCheck[]): {
    passed: number;
    warnings: number;
    failures: number;
    averageScore: number;
    overallStatus: QualityCheckSeverity;
} {
    const passed = checks.filter((c) => c.severity === 'pass').length;
    const warnings = checks.filter((c) => c.severity === 'warning').length;
    const failures = checks.filter((c) => c.severity === 'fail').length;

    const scores = checks.filter((c) => c.score !== undefined).map((c) => c.score!);
    const averageScore = scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;

    let overallStatus: QualityCheckSeverity = 'pass';
    if (failures > 0) {
        overallStatus = 'fail';
    } else if (warnings > 0) {
        overallStatus = 'warning';
    }

    return {
        passed,
        warnings,
        failures,
        averageScore,
        overallStatus,
    };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
        'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
        'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
        'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
        'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
        'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
        'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
        'because', 'until', 'while', 'although', 'though', 'this', 'that',
        'these', 'those', 'what', 'which', 'who', 'whom', 'whose', 'it', 'its',
        'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she',
        'her', 'they', 'them', 'their',
    ]);

    return text
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Generate n-grams from text
 */
function getNgrams(text: string, n: number): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const ngrams: string[] = [];

    for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(' '));
    }

    return ngrams;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate string similarity (0-1)
 */
export function stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
}

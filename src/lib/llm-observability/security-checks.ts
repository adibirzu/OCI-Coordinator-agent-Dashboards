/**
 * LLM Security Checks
 *
 * Implements security scanning for LLM inputs and outputs:
 * - Prompt injection detection
 * - Jailbreak attempt detection
 * - PII (Personally Identifiable Information) detection
 * - Sensitive data detection
 *
 * These checks help identify potential security risks in LLM interactions.
 */

import {
    SecurityCheck,
    SecurityCheckType,
    SecuritySeverity,
    LLMMessage,
} from './types';

// ============================================
// Security Check Configuration
// ============================================

export interface SecurityCheckConfig {
    /** Enable prompt injection detection */
    checkPromptInjection?: boolean;
    /** Enable jailbreak attempt detection */
    checkJailbreak?: boolean;
    /** Enable PII detection */
    checkPII?: boolean;
    /** Enable sensitive data detection */
    checkSensitiveData?: boolean;
    /** Custom PII patterns to add */
    customPIIPatterns?: PIIPattern[];
    /** Sensitivity level for detection */
    sensitivity?: 'low' | 'medium' | 'high';
}

export interface SecurityCheckContext {
    /** User input to check */
    userInput?: string;
    /** LLM output to check */
    llmOutput?: string;
    /** Full conversation messages */
    messages?: LLMMessage[];
    /** System prompt (for injection detection context) */
    systemPrompt?: string;
}

export interface PIIPattern {
    name: string;
    pattern: RegExp;
    severity: SecuritySeverity;
    description: string;
}

// ============================================
// Detection Patterns
// ============================================

/**
 * Prompt injection patterns - attempts to override system instructions
 */
const PROMPT_INJECTION_PATTERNS = [
    // Direct instruction override attempts
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i, severity: 'high' as const, name: 'ignore_instructions' },
    { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, severity: 'high' as const, name: 'disregard_previous' },
    { pattern: /forget\s+(everything|all|your)\s+(previous|you\s+know)/i, severity: 'high' as const, name: 'forget_everything' },
    { pattern: /new\s+instructions?:\s*/i, severity: 'high' as const, name: 'new_instructions' },
    { pattern: /override\s+(system|previous|your)\s+(prompt|instructions?|rules?)/i, severity: 'critical' as const, name: 'override_system' },

    // System prompt extraction attempts
    { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i, severity: 'medium' as const, name: 'extract_prompt' },
    { pattern: /show\s+(me\s+)?your\s+(system\s+)?(prompt|instructions?)/i, severity: 'medium' as const, name: 'show_prompt' },
    { pattern: /repeat\s+(your\s+)?(system\s+)?(prompt|instructions?)/i, severity: 'medium' as const, name: 'repeat_prompt' },
    { pattern: /print\s+(your\s+)?(initial|system)\s+(prompt|instructions?)/i, severity: 'medium' as const, name: 'print_prompt' },

    // Role confusion attempts
    { pattern: /you\s+are\s+now\s+(a|an|the)/i, severity: 'medium' as const, name: 'role_override' },
    { pattern: /pretend\s+(you\s+are|to\s+be)\s+(a|an|the)/i, severity: 'medium' as const, name: 'pretend_role' },
    { pattern: /act\s+as\s+(if\s+you\s+are\s+)?(a|an|the)/i, severity: 'low' as const, name: 'act_as' },
    { pattern: /from\s+now\s+on,?\s+you\s+(are|will)/i, severity: 'medium' as const, name: 'from_now_on' },

    // Delimiter/boundary injection
    { pattern: /```[\s\S]*?(system|user|assistant)[\s\S]*?```/i, severity: 'high' as const, name: 'delimiter_injection' },
    { pattern: /<\|?(system|user|assistant|im_start|im_end)\|?>/i, severity: 'high' as const, name: 'special_token_injection' },
    { pattern: /\[INST\]|\[\/INST\]|\[SYS\]|\[\/SYS\]/i, severity: 'high' as const, name: 'llama_token_injection' },

    // Context manipulation
    { pattern: /end\s+of\s+(system\s+)?(prompt|message|instructions?)/i, severity: 'high' as const, name: 'end_marker_injection' },
    { pattern: /---+\s*(new|user|actual)\s*(prompt|instructions?|query)/i, severity: 'high' as const, name: 'separator_injection' },
    { pattern: /IMPORTANT:\s*ignore/i, severity: 'high' as const, name: 'important_ignore' },
];

/**
 * Jailbreak patterns - attempts to bypass safety guidelines
 */
const JAILBREAK_PATTERNS = [
    // DAN-style jailbreaks
    { pattern: /\bDAN\b.*?(do\s+anything\s+now|mode)/i, severity: 'critical' as const, name: 'dan_jailbreak' },
    { pattern: /developer\s+mode\s+(enabled|activated|on)/i, severity: 'critical' as const, name: 'developer_mode' },
    { pattern: /jailbreak(ed)?\s+(mode|prompt)/i, severity: 'critical' as const, name: 'jailbreak_explicit' },

    // Character/role-play exploitation
    { pattern: /pretend\s+(there\s+are\s+)?no\s+(ethical|moral|safety)\s+(guidelines|rules|restrictions)/i, severity: 'critical' as const, name: 'remove_ethics' },
    { pattern: /respond\s+without\s+(any\s+)?(moral|ethical|safety)/i, severity: 'critical' as const, name: 'respond_without_safety' },
    { pattern: /hypothetical(ly)?\s+speaking,?\s+if\s+you\s+(had|could|were)/i, severity: 'medium' as const, name: 'hypothetical_bypass' },

    // Encoding/obfuscation attempts
    { pattern: /base64\s+(decode|encoded?):\s*/i, severity: 'medium' as const, name: 'base64_obfuscation' },
    { pattern: /rot13\s+this/i, severity: 'medium' as const, name: 'rot13_obfuscation' },
    { pattern: /respond\s+in\s+(hex|binary|base64|morse)/i, severity: 'medium' as const, name: 'encoding_request' },
    { pattern: /translate\s+to\s+(leet|l33t|1337)/i, severity: 'low' as const, name: 'leet_speak' },

    // Instruction reversal
    { pattern: /opposite\s+day/i, severity: 'medium' as const, name: 'opposite_day' },
    { pattern: /do\s+the\s+(exact\s+)?opposite/i, severity: 'medium' as const, name: 'do_opposite' },
    { pattern: /invert\s+(your\s+)?(responses?|behavior|output)/i, severity: 'medium' as const, name: 'invert_behavior' },

    // Token manipulation
    { pattern: /split\s+(this|your)\s+(response|answer)\s+into\s+(tokens|characters|parts)/i, severity: 'low' as const, name: 'token_splitting' },
    { pattern: /one\s+(letter|character|word)\s+(per|at\s+a)\s+(line|time)/i, severity: 'low' as const, name: 'char_by_char' },

    // Fictional/story framing
    { pattern: /write\s+a\s+(story|fiction|scenario)\s+where\s+(you|an?\s+AI)/i, severity: 'low' as const, name: 'fiction_framing' },
    { pattern: /in\s+this\s+(fictional|hypothetical|imaginary)\s+(world|scenario|universe)/i, severity: 'low' as const, name: 'fictional_world' },

    // Sudo/admin commands
    { pattern: /sudo\s+(mode|enable|activate)/i, severity: 'high' as const, name: 'sudo_mode' },
    { pattern: /admin(istrator)?\s+(mode|access|override)/i, severity: 'high' as const, name: 'admin_mode' },
    { pattern: /root\s+(access|mode|privileges)/i, severity: 'high' as const, name: 'root_access' },
];

/**
 * PII patterns for detection
 */
const PII_PATTERNS: PIIPattern[] = [
    // Email addresses
    {
        name: 'email',
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        severity: 'medium',
        description: 'Email address detected',
    },

    // Phone numbers (various formats)
    {
        name: 'phone_us',
        pattern: /(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        severity: 'medium',
        description: 'US phone number detected',
    },
    {
        name: 'phone_intl',
        pattern: /\+[1-9]\d{1,14}/g,
        severity: 'medium',
        description: 'International phone number detected',
    },

    // Social Security Numbers (US)
    {
        name: 'ssn',
        pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
        severity: 'critical',
        description: 'Social Security Number detected',
    },

    // Credit card numbers (basic pattern)
    {
        name: 'credit_card',
        pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
        severity: 'critical',
        description: 'Credit card number detected',
    },

    // Credit card with spaces/dashes
    {
        name: 'credit_card_formatted',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        severity: 'high',
        description: 'Formatted credit card number detected',
    },

    // IP addresses
    {
        name: 'ip_address',
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        severity: 'low',
        description: 'IP address detected',
    },

    // Dates of birth patterns
    {
        name: 'dob',
        pattern: /\b(?:0[1-9]|1[0-2])[\/\-.](?:0[1-9]|[12]\d|3[01])[\/\-.](?:19|20)\d{2}\b/g,
        severity: 'medium',
        description: 'Date of birth pattern detected',
    },

    // Passport numbers (generic patterns)
    {
        name: 'passport',
        pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
        severity: 'high',
        description: 'Possible passport number detected',
    },

    // Driver's license patterns (US - varies by state, generic)
    {
        name: 'drivers_license',
        pattern: /\b[A-Z]{1,2}\d{5,8}\b/g,
        severity: 'medium',
        description: 'Possible driver\'s license number detected',
    },

    // Bank account numbers (generic)
    {
        name: 'bank_account',
        pattern: /\b\d{8,17}\b/g,
        severity: 'medium',
        description: 'Possible bank account number detected',
    },

    // IBAN (International Bank Account Number)
    {
        name: 'iban',
        pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,
        severity: 'high',
        description: 'IBAN detected',
    },

    // Medical Record Numbers (generic pattern)
    {
        name: 'mrn',
        pattern: /\b(?:MRN|mrn|Medical\s*Record)[:\s#]*\d{6,10}\b/gi,
        severity: 'high',
        description: 'Medical Record Number detected',
    },
];

/**
 * Sensitive data patterns (non-PII but still sensitive)
 */
const SENSITIVE_DATA_PATTERNS = [
    // API keys and tokens
    { pattern: /\b(sk|pk|api)[-_]?[a-zA-Z0-9]{20,}/g, severity: 'critical' as const, name: 'api_key', description: 'API key detected' },
    { pattern: /\b(Bearer|token)\s+[a-zA-Z0-9._-]{20,}/gi, severity: 'critical' as const, name: 'bearer_token', description: 'Bearer token detected' },

    // AWS credentials
    { pattern: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' as const, name: 'aws_access_key', description: 'AWS Access Key detected' },
    { pattern: /\b[A-Za-z0-9/+=]{40}\b/g, severity: 'high' as const, name: 'aws_secret_key_candidate', description: 'Possible AWS Secret Key' },

    // Private keys
    { pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/gi, severity: 'critical' as const, name: 'private_key', description: 'Private key detected' },

    // Database connection strings
    { pattern: /(?:mongodb|mysql|postgres|postgresql|redis|mssql):\/\/[^\s]+/gi, severity: 'critical' as const, name: 'db_connection', description: 'Database connection string detected' },

    // Passwords in text
    { pattern: /\b(password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{4,}/gi, severity: 'critical' as const, name: 'password_pattern', description: 'Password pattern detected' },

    // OAuth/JWT tokens
    { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, severity: 'high' as const, name: 'jwt_token', description: 'JWT token detected' },

    // GitHub tokens
    { pattern: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g, severity: 'critical' as const, name: 'github_token', description: 'GitHub token detected' },

    // Slack tokens
    { pattern: /xox[baprs]-[0-9a-zA-Z-]+/g, severity: 'critical' as const, name: 'slack_token', description: 'Slack token detected' },

    // Generic secrets
    { pattern: /\b(secret|key|apikey|api_key|auth)\s*[:=]\s*["']?[^\s"']{8,}/gi, severity: 'high' as const, name: 'generic_secret', description: 'Generic secret pattern detected' },
];

// ============================================
// Detection Functions
// ============================================

/**
 * Detect prompt injection attempts in text
 */
export function detectPromptInjection(context: SecurityCheckContext): SecurityCheck {
    const textToCheck = combineTextForCheck(context, 'input');
    const detections: { name: string; severity: SecuritySeverity }[] = [];

    for (const { pattern, severity, name } of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(textToCheck)) {
            detections.push({ name, severity });
        }
    }

    // Determine overall severity
    let overallSeverity: SecuritySeverity = 'low';
    if (detections.some(d => d.severity === 'critical')) overallSeverity = 'critical';
    else if (detections.some(d => d.severity === 'high')) overallSeverity = 'high';
    else if (detections.some(d => d.severity === 'medium')) overallSeverity = 'medium';

    const detected = detections.length > 0;
    const details = detected
        ? `Detected patterns: ${detections.map(d => d.name).join(', ')}`
        : undefined;

    return {
        type: 'prompt_injection',
        name: 'Prompt Injection Detection',
        detected,
        severity: overallSeverity,
        details,
        location: 'input',
        timestamp: new Date().toISOString(),
    };
}

/**
 * Detect jailbreak attempts in text
 */
export function detectJailbreak(context: SecurityCheckContext): SecurityCheck {
    const textToCheck = combineTextForCheck(context, 'input');
    const detections: { name: string; severity: SecuritySeverity }[] = [];

    for (const { pattern, severity, name } of JAILBREAK_PATTERNS) {
        if (pattern.test(textToCheck)) {
            detections.push({ name, severity });
        }
    }

    // Determine overall severity
    let overallSeverity: SecuritySeverity = 'low';
    if (detections.some(d => d.severity === 'critical')) overallSeverity = 'critical';
    else if (detections.some(d => d.severity === 'high')) overallSeverity = 'high';
    else if (detections.some(d => d.severity === 'medium')) overallSeverity = 'medium';

    const detected = detections.length > 0;
    const details = detected
        ? `Detected patterns: ${detections.map(d => d.name).join(', ')}`
        : undefined;

    return {
        type: 'jailbreak_attempt',
        name: 'Jailbreak Attempt Detection',
        detected,
        severity: overallSeverity,
        details,
        location: 'input',
        timestamp: new Date().toISOString(),
    };
}

/**
 * Detect PII in text
 */
export function detectPII(
    context: SecurityCheckContext,
    customPatterns?: PIIPattern[]
): SecurityCheck {
    const textToCheck = combineTextForCheck(context, 'both');
    const allPatterns = [...PII_PATTERNS, ...(customPatterns || [])];
    const detections: { name: string; severity: SecuritySeverity; count: number }[] = [];

    // Determine location of detections
    let inputDetected = false;
    let outputDetected = false;
    const inputText = context.userInput || '';
    const outputText = context.llmOutput || '';

    for (const { name, pattern, severity } of allPatterns) {
        // Reset pattern lastIndex for global patterns
        pattern.lastIndex = 0;

        const matches = textToCheck.match(pattern);
        if (matches && matches.length > 0) {
            // Filter out common false positives
            const validMatches = filterPIIFalsePositives(name, matches);
            if (validMatches.length > 0) {
                detections.push({ name, severity, count: validMatches.length });

                // Check location
                pattern.lastIndex = 0;
                if (inputText.match(pattern)) inputDetected = true;
                pattern.lastIndex = 0;
                if (outputText.match(pattern)) outputDetected = true;
            }
        }
    }

    // Determine overall severity
    let overallSeverity: SecuritySeverity = 'low';
    if (detections.some(d => d.severity === 'critical')) overallSeverity = 'critical';
    else if (detections.some(d => d.severity === 'high')) overallSeverity = 'high';
    else if (detections.some(d => d.severity === 'medium')) overallSeverity = 'medium';

    const detected = detections.length > 0;
    const details = detected
        ? `Found: ${detections.map(d => `${d.name} (${d.count})`).join(', ')}`
        : undefined;

    let location: 'input' | 'output' | 'both' | undefined;
    if (inputDetected && outputDetected) location = 'both';
    else if (inputDetected) location = 'input';
    else if (outputDetected) location = 'output';

    return {
        type: 'pii_detected',
        name: 'PII Detection',
        detected,
        severity: overallSeverity,
        details,
        location,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Filter out common PII false positives
 */
function filterPIIFalsePositives(piiType: string, matches: string[]): string[] {
    return matches.filter(match => {
        // Filter bank account false positives (too many digits without context)
        if (piiType === 'bank_account') {
            // Require minimum 10 digits for bank accounts
            if (match.replace(/\D/g, '').length < 10) return false;
            // Exclude common false positive ranges
            if (/^0+$/.test(match)) return false;
            if (/^1234567890?$/.test(match)) return false;
        }

        // Filter driver's license false positives
        if (piiType === 'drivers_license') {
            // Common abbreviations that aren't licenses
            const commonAbbrevs = ['HTTP', 'HTTPS', 'HTML', 'JSON', 'XML', 'API', 'URL'];
            if (commonAbbrevs.some(abbr => match.toUpperCase().startsWith(abbr))) return false;
        }

        // Filter passport false positives
        if (piiType === 'passport') {
            // Common abbreviations
            if (/^[A-Z]{2}\d{6}$/.test(match) && /^(US|UK|CA|AU|EU)/.test(match)) return true;
            // Exclude very common patterns that aren't passports
            const commonPrefixes = ['AB', 'CD', 'ID', 'NO', 'OK', 'US'];
            if (commonPrefixes.includes(match.slice(0, 2))) return false;
        }

        return true;
    });
}

/**
 * Detect sensitive data (API keys, tokens, secrets)
 */
export function detectSensitiveData(context: SecurityCheckContext): SecurityCheck {
    const textToCheck = combineTextForCheck(context, 'both');
    const detections: { name: string; severity: SecuritySeverity; description: string }[] = [];

    // Determine location of detections
    let inputDetected = false;
    let outputDetected = false;
    const inputText = context.userInput || '';
    const outputText = context.llmOutput || '';

    for (const { pattern, severity, name, description } of SENSITIVE_DATA_PATTERNS) {
        pattern.lastIndex = 0;

        const matches = textToCheck.match(pattern);
        if (matches && matches.length > 0) {
            // Filter out common false positives for generic patterns
            const validMatches = filterSensitiveDataFalsePositives(name, matches);
            if (validMatches.length > 0) {
                detections.push({ name, severity, description });

                // Check location
                pattern.lastIndex = 0;
                if (inputText.match(pattern)) inputDetected = true;
                pattern.lastIndex = 0;
                if (outputText.match(pattern)) outputDetected = true;
            }
        }
    }

    // Determine overall severity
    let overallSeverity: SecuritySeverity = 'low';
    if (detections.some(d => d.severity === 'critical')) overallSeverity = 'critical';
    else if (detections.some(d => d.severity === 'high')) overallSeverity = 'high';
    else if (detections.some(d => d.severity === 'medium')) overallSeverity = 'medium';

    const detected = detections.length > 0;
    const details = detected
        ? detections.map(d => d.description).join('; ')
        : undefined;

    let location: 'input' | 'output' | 'both' | undefined;
    if (inputDetected && outputDetected) location = 'both';
    else if (inputDetected) location = 'input';
    else if (outputDetected) location = 'output';

    return {
        type: 'sensitive_data',
        name: 'Sensitive Data Detection',
        detected,
        severity: overallSeverity,
        details,
        location,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Filter out sensitive data false positives
 */
function filterSensitiveDataFalsePositives(dataType: string, matches: string[]): string[] {
    return matches.filter(match => {
        // AWS secret key candidate - require exact length
        if (dataType === 'aws_secret_key_candidate') {
            if (match.length !== 40) return false;
            // Must have mixed case and numbers
            if (!/[a-z]/.test(match) || !/[A-Z]/.test(match) || !/[0-9]/.test(match)) return false;
        }

        // Generic secrets - filter common false positives
        if (dataType === 'generic_secret') {
            // Exclude very common patterns
            if (/^["']?(true|false|null|undefined|none|empty)["']?$/i.test(match.split(/[:=]/)[1]?.trim() || '')) {
                return false;
            }
        }

        return true;
    });
}

// ============================================
// Main Runner Functions
// ============================================

/**
 * Run all security checks on the given context
 */
export function runSecurityChecks(
    context: SecurityCheckContext,
    config: SecurityCheckConfig = {}
): SecurityCheck[] {
    const {
        checkPromptInjection: doPromptInjection = true,
        checkJailbreak: doJailbreak = true,
        checkPII: doPII = true,
        checkSensitiveData: doSensitiveData = true,
        customPIIPatterns,
    } = config;

    const checks: SecurityCheck[] = [];

    if (doPromptInjection) {
        checks.push(detectPromptInjection(context));
    }

    if (doJailbreak) {
        checks.push(detectJailbreak(context));
    }

    if (doPII) {
        checks.push(detectPII(context, customPIIPatterns));
    }

    if (doSensitiveData) {
        checks.push(detectSensitiveData(context));
    }

    return checks;
}

/**
 * Get a summary of security check results
 */
export function getSecurityCheckSummary(checks: SecurityCheck[]): {
    totalChecks: number;
    detected: number;
    notDetected: number;
    bySeverity: Record<SecuritySeverity, number>;
    byType: Record<SecurityCheckType, { detected: boolean; severity: SecuritySeverity }>;
    criticalIssues: SecurityCheck[];
    highIssues: SecurityCheck[];
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
} {
    const bySeverity: Record<SecuritySeverity, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
    };

    const byType: Record<SecurityCheckType, { detected: boolean; severity: SecuritySeverity }> = {
        prompt_injection: { detected: false, severity: 'low' },
        jailbreak_attempt: { detected: false, severity: 'low' },
        pii_detected: { detected: false, severity: 'low' },
        sensitive_data: { detected: false, severity: 'low' },
        malicious_content: { detected: false, severity: 'low' },
        custom: { detected: false, severity: 'low' },
    };

    const criticalIssues: SecurityCheck[] = [];
    const highIssues: SecurityCheck[] = [];
    let detected = 0;
    let notDetected = 0;

    for (const check of checks) {
        if (check.detected) {
            detected++;
            bySeverity[check.severity]++;
            byType[check.type] = { detected: true, severity: check.severity };

            if (check.severity === 'critical') {
                criticalIssues.push(check);
            } else if (check.severity === 'high') {
                highIssues.push(check);
            }
        } else {
            notDetected++;
        }
    }

    // Determine overall risk
    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (bySeverity.critical > 0) overallRisk = 'critical';
    else if (bySeverity.high > 0) overallRisk = 'high';
    else if (bySeverity.medium > 0) overallRisk = 'medium';

    return {
        totalChecks: checks.length,
        detected,
        notDetected,
        bySeverity,
        byType,
        criticalIssues,
        highIssues,
        overallRisk,
    };
}

/**
 * Create a redacted version of text with PII masked
 */
export function redactPII(text: string, customPatterns?: PIIPattern[]): string {
    let redacted = text;
    const allPatterns = [...PII_PATTERNS, ...(customPatterns || [])];

    for (const { name, pattern } of allPatterns) {
        pattern.lastIndex = 0;
        redacted = redacted.replace(pattern, `[${name.toUpperCase()}_REDACTED]`);
    }

    return redacted;
}

/**
 * Create a redacted version of text with sensitive data masked
 */
export function redactSensitiveData(text: string): string {
    let redacted = text;

    for (const { name, pattern } of SENSITIVE_DATA_PATTERNS) {
        pattern.lastIndex = 0;
        redacted = redacted.replace(pattern, `[${name.toUpperCase()}_REDACTED]`);
    }

    return redacted;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Combine text from context for checking
 */
function combineTextForCheck(
    context: SecurityCheckContext,
    target: 'input' | 'output' | 'both'
): string {
    const parts: string[] = [];

    if ((target === 'input' || target === 'both') && context.userInput) {
        parts.push(context.userInput);
    }

    if ((target === 'output' || target === 'both') && context.llmOutput) {
        parts.push(context.llmOutput);
    }

    // Include messages if provided
    if (context.messages) {
        for (const msg of context.messages) {
            if (target === 'input' || target === 'both') {
                if (msg.role === 'user') {
                    parts.push(msg.content);
                }
            }
            if (target === 'output' || target === 'both') {
                if (msg.role === 'assistant') {
                    parts.push(msg.content);
                }
            }
        }
    }

    return parts.join('\n');
}

/**
 * Check if a specific PII type was detected
 */
export function hasPIIType(checks: SecurityCheck[], piiType: string): boolean {
    for (const check of checks) {
        if (check.type === 'pii_detected' && check.detected && check.details) {
            if (check.details.toLowerCase().includes(piiType.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Quick check if any critical security issues were found
 */
export function hasCriticalSecurityIssue(checks: SecurityCheck[]): boolean {
    return checks.some(check => check.detected && check.severity === 'critical');
}

/**
 * Quick check if any security issues were found
 */
export function hasSecurityIssue(checks: SecurityCheck[]): boolean {
    return checks.some(check => check.detected);
}

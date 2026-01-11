/**
 * LLM Cost Calculator
 *
 * Estimates costs based on token usage and model pricing.
 */

import { ModelPricing, DEFAULT_MODEL_PRICING, LLMSpanInfo, TraceLLMSummary } from './types';

/**
 * Custom pricing configuration
 */
let customPricing: ModelPricing[] = [];

/**
 * Set custom model pricing (overrides defaults)
 */
export function setCustomPricing(pricing: ModelPricing[]): void {
    customPricing = pricing;
}

/**
 * Get all available pricing (custom + defaults)
 */
export function getAllPricing(): ModelPricing[] {
    return [...customPricing, ...DEFAULT_MODEL_PRICING];
}

/**
 * Normalize model name for matching
 */
function normalizeModelName(model: string): string {
    return model
        .toLowerCase()
        .replace(/[-_]/g, '')
        .replace(/\s+/g, '');
}

/**
 * Find pricing for a specific model/provider combination
 */
export function findModelPricing(
    model: string,
    provider?: string
): ModelPricing | undefined {
    const allPricing = getAllPricing();
    const normalizedModel = normalizeModelName(model);

    // First try exact match with provider
    if (provider) {
        const exact = allPricing.find(
            p => normalizeModelName(p.model) === normalizedModel &&
                p.provider.toLowerCase() === provider.toLowerCase()
        );
        if (exact) return exact;
    }

    // Then try partial match (model contains the pricing model name)
    for (const pricing of allPricing) {
        const pricingModel = normalizeModelName(pricing.model);
        if (normalizedModel.includes(pricingModel) || pricingModel.includes(normalizedModel)) {
            // If provider specified, prefer matching provider
            if (provider && pricing.provider.toLowerCase() !== provider.toLowerCase()) {
                continue;
            }
            return pricing;
        }
    }

    // Fallback: try any model that partially matches regardless of provider
    for (const pricing of allPricing) {
        const pricingModel = normalizeModelName(pricing.model);
        if (normalizedModel.includes(pricingModel) || pricingModel.includes(normalizedModel)) {
            return pricing;
        }
    }

    return undefined;
}

/**
 * Calculate cost for a single LLM call
 */
export function calculateLLMCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
    provider?: string
): { cost: number; currency: string; pricing: ModelPricing | null } {
    const pricing = findModelPricing(model, provider);

    if (!pricing) {
        return { cost: 0, currency: 'USD', pricing: null };
    }

    // Prices are per 1M tokens
    const inputCost = (inputTokens / 1_000_000) * pricing.inputTokenPrice;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputTokenPrice;

    return {
        cost: inputCost + outputCost,
        currency: pricing.currency,
        pricing,
    };
}

/**
 * Calculate cost from LLM span info
 */
export function calculateSpanCost(llmInfo: LLMSpanInfo): {
    cost: number;
    currency: string;
    breakdown?: {
        inputCost: number;
        outputCost: number;
        model: string;
    };
} {
    if (!llmInfo.isLLMSpan || !llmInfo.requestModel) {
        return { cost: 0, currency: 'USD' };
    }

    const inputTokens = llmInfo.inputTokens || 0;
    const outputTokens = llmInfo.outputTokens || 0;

    const { cost, currency, pricing } = calculateLLMCost(
        inputTokens,
        outputTokens,
        llmInfo.requestModel,
        llmInfo.provider
    );

    if (!pricing) {
        return { cost: 0, currency: 'USD' };
    }

    return {
        cost,
        currency,
        breakdown: {
            inputCost: (inputTokens / 1_000_000) * pricing.inputTokenPrice,
            outputCost: (outputTokens / 1_000_000) * pricing.outputTokenPrice,
            model: llmInfo.requestModel,
        },
    };
}

/**
 * Calculate total cost for a trace
 */
export function calculateTraceCost(
    summary: TraceLLMSummary,
    primaryModel?: string,
    provider?: string
): { totalCost: number; currency: string; breakdown: Record<string, number> } {
    // If we have model info, calculate precise cost
    if (primaryModel) {
        const { cost, currency } = calculateLLMCost(
            summary.totalInputTokens,
            summary.totalOutputTokens,
            primaryModel,
            provider
        );

        return {
            totalCost: cost,
            currency,
            breakdown: { [primaryModel]: cost },
        };
    }

    // Fallback: estimate with average pricing across models
    const averageInputPrice = 5; // $5 per 1M tokens (rough average)
    const averageOutputPrice = 15; // $15 per 1M tokens (rough average)

    const inputCost = (summary.totalInputTokens / 1_000_000) * averageInputPrice;
    const outputCost = (summary.totalOutputTokens / 1_000_000) * averageOutputPrice;

    return {
        totalCost: inputCost + outputCost,
        currency: 'USD',
        breakdown: { estimated: inputCost + outputCost },
    };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number, currency: string = 'USD'): string {
    if (cost === 0) return 'N/A';

    // For very small costs, show more decimals
    if (cost < 0.01) {
        return `$${cost.toFixed(6)}`;
    }
    if (cost < 0.10) {
        return `$${cost.toFixed(4)}`;
    }
    if (cost < 1) {
        return `$${cost.toFixed(3)}`;
    }
    return `$${cost.toFixed(2)}`;
}

/**
 * Format token count for display (with K/M suffixes)
 */
export function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
        return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
        return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toString();
}

/**
 * Get efficiency metrics
 */
export function calculateEfficiency(
    inputTokens: number,
    outputTokens: number,
    durationMs: number
): {
    tokensPerSecond: number;
    inputOutputRatio: number;
    costEfficiency: string;
} {
    const durationSeconds = durationMs / 1000;
    const totalTokens = inputTokens + outputTokens;

    return {
        tokensPerSecond: durationSeconds > 0 ? totalTokens / durationSeconds : 0,
        inputOutputRatio: inputTokens > 0 ? outputTokens / inputTokens : 0,
        costEfficiency: outputTokens > inputTokens ? 'Output Heavy' :
            outputTokens < inputTokens * 0.5 ? 'Input Heavy' : 'Balanced',
    };
}

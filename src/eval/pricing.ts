// $ per million tokens. Sourced 2026-07-18 from provider pricing pages —
// re-check before trusting for anything beyond rough eval-run comparisons,
// prices change and some providers (e.g. DeepSeek) also discount cache-hit
// input tokens, which this table ignores in favor of the flat cache-miss rate.
//
// NOTE: deepseek-chat is deprecated 2026-07-24; migrate to deepseek-v4-flash
// (via MODEL_NAME) before then or this entry goes stale.
export const PRICING: Record<string, { input: number; output: number }> = {
    'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
    'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 }, // no longer available

    'gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'gpt-5-nano': { input: 0.05, output: 0.40 },
    'gpt-5-mini': { input: 0.25, output: 2.00 },
    'gpt-5.6-luna': { input: 1.00, output: 6.00 },
    
    'deepseek-chat': { input: 0.28, output: 0.42 },
    'deepseek-v4-flash': { input: 0.14, output: 0.28 },

    // Bare aliases, not dated IDs — DEFAULT_MODEL_NAMES.anthropic and MODEL_NAME
    // overrides both use the alias form (Anthropic's own guidance: never append
    // a date suffix to an alias), so the pricing key has to match that exactly.
    'claude-opus-4-8': { input: 5.00, output: 25.00 },
    'claude-sonnet-5': { input: 3.00, output: 15.00 }, // intro $2.00/$10.00 through 2026-08-31
    'claude-haiku-4-5': { input: 1.00, output: 5.00 },
}

/** Returns NaN for an unknown model — surface that, don't silently report $0. */
export function computeCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
): number {
    const rate = PRICING[modelId]
    if (!rate) return NaN
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output
}

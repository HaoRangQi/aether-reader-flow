/**
 * @fileoverview Built-in pricing table (USD per 1M tokens, as of 2026-05).
 *
 * Used by `CostMeter` to estimate a USD amount for each AI call. Numbers
 * are public list prices from each vendor; they DO drift, so:
 *
 *   - **Update cadence**: bump these any time you notice the badge is
 *     ±10% off the real bill, or whenever a vendor announces a change.
 *   - **Custom models**: users add unknown models via Settings → Model
 *     Services. For those, `getPricing()` returns a fallback estimate
 *     that's clearly marked as such (see `UNKNOWN_MODEL_PRICING`).
 *
 * Source notes:
 *   - claude-sonnet-4-6 — Anthropic published pricing
 *   - claude-haiku-4-5 — Anthropic published pricing
 *   - gpt-4o / gpt-4o-mini — OpenAI published pricing
 *   - deepseek-chat / deepseek-reasoner — DeepSeek published pricing
 */
export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** True if this is a fallback rather than a real entry. */
  estimated?: boolean;
}

const TABLE: Record<string, ModelPricing> = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },

  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },

  // Local / open-source — free at point of use (run on user's GPU)
  'llama-3.1-70b': { input: 0, output: 0 },
  'qwen2.5-72b': { input: 0, output: 0 },
};

/**
 * Conservative fallback for models we don't recognize. Roughly mid-range
 * (cheaper than Sonnet, more than Haiku) so we err on the safe side.
 */
const UNKNOWN_MODEL_PRICING: ModelPricing = {
  input: 1.0,
  output: 5.0,
  estimated: true,
};

const KNOWN_MODEL_IDS = Object.keys(TABLE).sort();

function copyPricing(pricing: ModelPricing): ModelPricing {
  return { ...pricing };
}

/**
 * Look up pricing for a model id. Always returns something — falls back
 * to `UNKNOWN_MODEL_PRICING` for unrecognized or malformed models.
 *
 * Lookup is case-insensitive on the model id (some providers send
 * mixed-case ids).
 */
export function getPricing(modelId: unknown): ModelPricing {
  const k = normalizeModelId(modelId);
  if (!k) return copyPricing(UNKNOWN_MODEL_PRICING);

  for (const [tableKey, value] of Object.entries(TABLE)) {
    if (tableKey.toLowerCase() === k) return copyPricing(value);
  }
  return copyPricing(UNKNOWN_MODEL_PRICING);
}

function normalizeModelId(modelId: unknown): string {
  return typeof modelId === 'string' ? modelId.trim().toLowerCase() : '';
}

/**
 * List of all explicitly priced model ids. Useful for surfacing in the
 * Settings UI to help users pick from the "known" set first.
 */
export function listKnownModels(): string[] {
  return [...KNOWN_MODEL_IDS];
}

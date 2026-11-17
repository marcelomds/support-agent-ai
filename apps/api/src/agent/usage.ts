import type { Message } from './model-client.js';

/** Token counts for a whole agent run (one or more model calls). */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export function addUsage(total: Usage, message: Message): Usage {
  const u = message.usage;
  return {
    inputTokens: total.inputTokens + u.input_tokens,
    outputTokens: total.outputTokens + u.output_tokens,
    cacheReadTokens: total.cacheReadTokens + (u.cache_read_input_tokens ?? 0),
    cacheWriteTokens:
      total.cacheWriteTokens + (u.cache_creation_input_tokens ?? 0),
  };
}

/** USD per million tokens. Cache reads and writes are multiples of the input price. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Estimated cost in USD, or null when the model's price is not in the table. */
export function estimateCostUsd(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const inputEquivalent =
    usage.inputTokens +
    usage.cacheReadTokens * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * CACHE_WRITE_MULTIPLIER;
  return (
    (inputEquivalent * price.input + usage.outputTokens * price.output) / 1e6
  );
}

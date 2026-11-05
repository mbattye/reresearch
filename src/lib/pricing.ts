// USD per million tokens, Anthropic first-party list prices. Batch requests are half price.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

// Claude Haiku 5.5 charges more for prompts over 100k tokens.
const HAIKU_LONG = { input: 0.5, output: 2.5 };

export function priceKnown(model: string): boolean {
  return !!lookup(model);
}

export function costUsd(opts: { model: string; inputTokens: number; outputTokens: number; batch?: boolean }): number | null {
  let p = lookup(opts.model);
  if (!p) return null;
  if (opts.model.startsWith("claude-haiku-5-5") && opts.inputTokens > 100_000) p = HAIKU_LONG;
  const usd = (opts.inputTokens * p.input + opts.outputTokens * p.output) / 1_000_000;
  return opts.batch ? usd / 2 : usd;
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

function lookup(model: string) {
  // Responses can report a longer id than requested; match on prefix.
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? PRICES[key] : undefined;
}

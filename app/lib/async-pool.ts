import "server-only";

/**
 * Tiny async helpers for AI image-generation bursts.
 *
 * Production runs with its own database (separate from dev), so its BrandIcon
 * cache starts cold and a single "generate visuals" pass can need many Gemini
 * image calls at once. Firing them in an unbounded Promise.all trips provider
 * rate limits, and those failures fall back silently to vector icons. Every
 * generation burst should go through mapWithConcurrency instead, and each
 * individual generator should retry once (see callers in compose-copy.ts,
 * ai-edit.ts, scope-icon-resolver.ts).
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map over items with at most `limit` calls in flight; preserves order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

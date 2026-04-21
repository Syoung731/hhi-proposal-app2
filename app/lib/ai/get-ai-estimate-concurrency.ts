import { prisma } from "@/app/lib/prisma";

/**
 * Default parallelism for bulk estimate jobs when no admin override is set.
 * 8 is comfortable on Anthropic tier 3+; lower this via `CompanySettings.aiEstimateConcurrency`
 * if you see sustained 429s in the QStash worker logs.
 */
const DEFAULT_CONCURRENCY = 8;

/** Cache TTL — short enough that a settings change propagates within a minute, long enough that the bulk route isn't reading the row on every single fan-out. */
const CACHE_TTL_MS = 60_000;

let cached: { value: number; expiresAt: number } | null = null;

/**
 * Read the per-job QStash parallelism cap from `CompanySettings.aiEstimateConcurrency`.
 *
 * Memoised for `CACHE_TTL_MS`. A null / missing setting resolves to the default.
 * Any read error also resolves to the default — we never want this lookup to
 * block a user-initiated bulk job.
 */
export async function getAiEstimateConcurrency(): Promise<number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  let value = DEFAULT_CONCURRENCY;
  try {
    const settings = await prisma.companySettings.findFirst({
      select: { aiEstimateConcurrency: true },
    });
    if (
      settings?.aiEstimateConcurrency != null &&
      Number.isFinite(settings.aiEstimateConcurrency) &&
      settings.aiEstimateConcurrency > 0
    ) {
      value = settings.aiEstimateConcurrency;
    }
  } catch {
    // Fall through to default; no logging — this path is hit on every bulk start.
  }

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Testing / settings-change hook: wipe the memoised value so the next read is fresh. */
export function invalidateAiEstimateConcurrencyCache(): void {
  cached = null;
}

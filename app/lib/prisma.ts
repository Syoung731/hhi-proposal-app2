import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prevent creating many Prisma instances in development (Next hot reload).
 * In production, always create a new client.
 * Uses driver adapter for direct Neon Postgres connection (no Accelerate).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Make the Postgres SSL mode explicit. `pg` (via pg-connection-string) currently
 * treats `sslmode=require|prefer|verify-ca` as `verify-full`, but logs a
 * deprecation SECURITY WARNING that a future major will weaken `require` to libpq
 * semantics. Neon's default URL uses `sslmode=require`; rewriting it to
 * `verify-full` keeps the behavior IDENTICAL to today (full cert verification) —
 * just stated explicitly — which silences the warning without changing how we
 * connect. No-op when there's no sslmode param.
 */
function withExplicitSslMode(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/i, "$1verify-full");
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: withExplicitSslMode(process.env.DATABASE_URL),
    // Serverless safety: each Vercel instance holds its own pg pool. With the
    // default max (10), a deploy's instance churn exhausted Neon's connection
    // cap and took prod down (2026-06-20). Keep the per-instance pool small and
    // release idle connections quickly so many concurrent instances can't blow
    // past max_connections. (Move DATABASE_URL to Neon's pooled "-pooler"
    // endpoint for headroom beyond this.)
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    // Prisma's default interactive/batch transaction timeout is 5000ms. Large
    // projects (many rooms + investment line items) writing over Neon's network
    // latency can exceed that, which caused recomputeInvestmentRollups to roll
    // back with "expired transaction" and silently fail to persist recomputed
    // prices. 20s gives ample headroom without masking a real hang. Applies to
    // both array-form ($transaction([...])) and interactive transactions.
    transactionOptions: { timeout: 20_000, maxWait: 15_000 },
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/**
 * Inspects the cached client's `_runtimeDataModel` to confirm fields exist.
 * The delegate check below only catches missing *models* — recent migrations
 * (Phase 8A.1, Phase 9) only added fields to existing models, and a stale
 * WASM query engine silently returns undefined for unknown fields.
 */
function hasAllExpectedFields(
  client: PrismaClient,
  expected: Record<string, string[]>,
): boolean {
  const rdm = (client as unknown as {
    _runtimeDataModel?: { models?: Record<string, { fields?: Array<{ name: string }> }> };
  })._runtimeDataModel;
  if (!rdm?.models) return false;
  for (const [modelName, fieldNames] of Object.entries(expected)) {
    const model = rdm.models[modelName];
    if (!model?.fields) return false;
    const fieldSet = new Set(model.fields.map((f) => f.name));
    for (const fieldName of fieldNames) {
      if (!fieldSet.has(fieldName)) return false;
    }
  }
  return true;
}

/**
 * Fields added by recent migrations. Keep in sync with the latest schema.
 *
 * STANDING RULE (established Phase 8C.1): every Prisma schema change that
 * adds a field MUST include extending this map in the same commit.
 * Otherwise a stale dev-server Prisma client predating the new field
 * silently passes the guard, the module-cached client is never refreshed,
 * and queries touching the new field return `undefined` without raising.
 * This has bitten us five separate times (Phases 8A.1, 8A.2, 8C, 8C.1) —
 * treat it as a protocol, not a suggestion.
 */
const REQUIRED_RECENT_FIELDS: Record<string, string[]> = {
  Room: ["displayGroupId", "displayGroupOrder", "scopeOverviewShort"], // Phase 8A.1; scopeOverviewShort added for paginated Scope Breakdown
  Project: ["displayGroupOrder", "displayGroupNames"], // Phase 8A.1; displayGroupNames added for user-driven group labels
  Media: ["thumbnailUrl"], // Phase 9
  CompanySettings: ["designHourlyRate", "brandTagline", "closingHeadline"], // Phase 8C T1, Phase 11 Pass 2A T9
  RoomRenderCheck: ["id", "roomId", "itemText"], // Phase 10
  PricingCatalogItem: ["hidden"], // Catalog Hide
};

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // Reuse global cached instance only when it has all required model delegates
  // AND all recently-added fields. Dev server caches the PrismaClient across
  // HMR; after schema changes the old instance can be missing new delegates,
  // new fields on existing models, or have a stale WASM query engine.
  // Add each new model to the delegate check, each new field to
  // REQUIRED_RECENT_FIELDS so stale cached instances are auto-replaced.
  if (
    cached != null &&
    "company" in cached &&
    cached.company !== undefined &&
    "valuePillar" in cached &&
    cached.valuePillar !== undefined &&
    "proposalDeck" in cached &&
    cached.proposalDeck !== undefined &&
    "deckSlide" in cached &&
    cached.deckSlide !== undefined &&
    "brandBackground" in cached &&
    cached.brandBackground !== undefined &&
    "brandIcon" in cached &&
    cached.brandIcon !== undefined &&
    "pricingCatalogItem" in cached &&
    cached.pricingCatalogItem !== undefined &&
    "roomTemplate" in cached &&
    cached.roomTemplate !== undefined &&
    "companyContext" in cached &&
    cached.companyContext !== undefined &&
    "aIEstimate" in cached &&
    cached.aIEstimate !== undefined &&
    "priceCorrection" in cached &&
    cached.priceCorrection !== undefined &&
    "catalogSuggestion" in cached &&
    cached.catalogSuggestion !== undefined &&
    "estimateJob" in cached &&
    cached.estimateJob !== undefined &&
    "jobItem" in cached &&
    cached.jobItem !== undefined &&
    "photoUploadToken" in cached &&
    cached.photoUploadToken !== undefined &&
    "engineeringAssembly" in cached &&
    cached.engineeringAssembly !== undefined &&
    "engineeringAssemblyComponent" in cached &&
    cached.engineeringAssemblyComponent !== undefined &&
    "engineeringAssemblySource" in cached &&
    cached.engineeringAssemblySource !== undefined &&
    hasAllExpectedFields(cached, REQUIRED_RECENT_FIELDS)
  ) {
    return cached;
  }
  if (cached != null) {
    delete globalForPrisma.prisma;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrisma();
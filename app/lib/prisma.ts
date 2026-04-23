import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prevent creating many Prisma instances in development (Next hot reload).
 * In production, always create a new client.
 * Uses driver adapter for direct Neon Postgres connection (no Accelerate).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({
    adapter,
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

/** Fields added by recent migrations. Keep in sync with the latest schema. */
const REQUIRED_RECENT_FIELDS: Record<string, string[]> = {
  Room: ["displayGroupId", "displayGroupOrder"], // Phase 8A.1
  Project: ["displayGroupOrder"], // Phase 8A.1
  Media: ["thumbnailUrl"], // Phase 9
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
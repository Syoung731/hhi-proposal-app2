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

function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // Reuse global cached instance only when it has all required model delegates.
  // Dev server caches the PrismaClient across HMR; after schema changes the old instance
  // can be missing new delegates or have a stale WASM query engine, causing field errors.
  // Add each new model here so stale cached instances are automatically replaced.
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
    cached.jobItem !== undefined
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
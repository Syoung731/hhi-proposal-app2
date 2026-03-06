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
  // Reuse global cached instance only when it has required delegates (company, valuePillar).
  // Dev server caches the PrismaClient across HMR; after schema changes the old instance
  // can be missing new delegates or have stale column set, causing findMany/column errors.
  if (
    cached != null &&
    "company" in cached &&
    cached.company !== undefined &&
    "valuePillar" in cached &&
    cached.valuePillar !== undefined
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
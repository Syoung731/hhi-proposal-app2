import { PrismaClient } from "@/app/generated/prisma";

/**
 * Prevent creating many Prisma instances in development (Next hot reload).
 * In production, always create a new client.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
// Prisma 7 configuration for Neon Postgres (no Accelerate)

import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env from project root
dotenv.config({ path: ".env" });

// We use:
// - DIRECT_URL (non-pooler) for Prisma Migrate / schema operations
// - DATABASE_URL (pooler) for app runtime (PrismaClient) if you want pooling
if (!process.env.DIRECT_URL) {
  throw new Error(
    "DIRECT_URL is missing. In Neon, turn OFF Connection pooling and copy the non-pooler connection string into .env as DIRECT_URL."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // IMPORTANT: Use the DIRECT (non-pooler) Neon URL here to avoid advisory-lock timeouts
    url: process.env.DIRECT_URL,
  },
});
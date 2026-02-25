// Prisma 7 configuration for Neon Postgres (no Accelerate)

import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Explicitly load .env first
dotenv.config({ path: ".env" });

// Fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Ensure you have a .env file in the project root with DATABASE_URL defined."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

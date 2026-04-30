import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";

export async function GET() {
  await requireAdmin();

  const keys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ] as const;

  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = Boolean(process.env[k]);

  return NextResponse.json({
    ok: Object.values(present).every(Boolean),
    present,
  });
}
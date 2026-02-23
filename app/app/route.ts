import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    // Minimal query that requires a DB round-trip.
    const result = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;

    return NextResponse.json({
      ok: true,
      db: "connected",
      now: result?.[0]?.now ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, db: "error", error: message },
      { status: 500 }
    );
  }
}
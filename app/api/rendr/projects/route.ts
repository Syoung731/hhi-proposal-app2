import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { listRendrProjects } from "@/app/lib/rendr/rendrClient";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  try {
    const data = await listRendrProjects(page);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Rendr projects";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

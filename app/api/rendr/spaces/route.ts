import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { listRendrSpaces } from "@/app/lib/rendr/rendrClient";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(req.nextUrl.searchParams.get("page_size") ?? "10");
  try {
    const data = await listRendrSpaces(page, pageSize);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Rendr spaces";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

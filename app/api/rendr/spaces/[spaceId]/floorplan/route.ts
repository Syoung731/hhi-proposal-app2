import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { streamRendrFloorPlan } from "@/app/lib/rendr/rendrClient";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  await requireAdmin();
  const { spaceId } = await params;
  const id = Number(spaceId);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid space ID" }, { status: 400 });
  }
  try {
    const upstream = await streamRendrFloorPlan(id);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Rendr PDF request failed (${upstream.status})` },
        { status: upstream.status },
      );
    }
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/pdf");
    const disposition = upstream.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch floor plan";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

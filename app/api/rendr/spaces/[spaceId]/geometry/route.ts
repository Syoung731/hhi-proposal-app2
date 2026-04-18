import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getRendrSpaceGeometry } from "@/app/lib/rendr/rendrClient";

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
    const data = await getRendrSpaceGeometry(id);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch space geometry";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getRendrTakeoffData } from "@/app/lib/rendr/rendrClient";
import { convertTakeoffData } from "@/app/lib/rendr/convertTakeoff";

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
    const raw = await getRendrTakeoffData(id);
    const imperial = convertTakeoffData(raw);
    return NextResponse.json(imperial);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch takeoff data";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

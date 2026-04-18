import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { addSpacesToProject } from "@/app/lib/rendr/rendrClient";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  await requireAdmin();
  const { projectId } = await params;
  const id = Number(projectId);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }
  try {
    const spaceIds = await req.json();
    if (!Array.isArray(spaceIds)) {
      return NextResponse.json({ error: "Expected array of space IDs" }, { status: 400 });
    }
    const result = await addSpacesToProject(id, spaceIds);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add spaces to project";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

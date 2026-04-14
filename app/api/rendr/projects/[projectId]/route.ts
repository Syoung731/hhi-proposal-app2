import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getRendrProject } from "@/app/lib/rendr/rendrClient";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  await requireAdmin();
  const { projectId } = await params;
  const id = Number(projectId);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }
  try {
    const data = await getRendrProject(id);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Rendr project";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { listRendrProjects, createRendrProject } from "@/app/lib/rendr/rendrClient";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(req.nextUrl.searchParams.get("page_size") ?? "10");
  try {
    const data = await listRendrProjects(page, pageSize);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Rendr projects";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  try {
    const body = await req.json();
    const { name, description, spaceIds } = body as {
      name?: string;
      description?: string;
      spaceIds?: string[];
    };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }
    const project = await createRendrProject(
      name.trim(),
      description?.trim() ?? "",
      spaceIds ?? [],
    );
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create Rendr project";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { listRendrProjects, listRendrSpaces } from "@/app/lib/rendr/rendrClient";

export async function GET() {
  await requireAdmin();
  try {
    // Fetch projects with large page size to count active ones (current year)
    const [projects, spaces] = await Promise.all([
      listRendrProjects(1, 100),
      listRendrSpaces(1),
    ]);
    const allProjects = projects.items ?? [];
    const currentYear = new Date().getFullYear();
    const activeCount = allProjects.filter((p) => {
      try {
        return new Date(p.created).getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;

    return NextResponse.json({
      projectCount: activeCount,
      spaceCount: spaces.pagination?.total_records ?? spaces.items?.length ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch Rendr stats";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ensureCopeRoom } from "@/app/lib/ensure-cope-room";

/**
 * POST /api/admin/backfill-cope
 *
 * One-time utility: creates a COPE room on every project that doesn't have one.
 * Safe to run multiple times — ensureCopeRoom is idempotent.
 */
export async function POST() {
  try {
    // Find all projects that already have a COPE room
    const projectsWithCope = await prisma.room.findMany({
      where: { isProjectOverhead: true },
      select: { projectId: true },
    });
    const projectIdsWithCope = new Set(projectsWithCope.map((r) => r.projectId));

    // Find all projects
    const allProjects = await prisma.project.findMany({
      select: { id: true, title: true },
    });

    const projectsNeedingCope = allProjects.filter(
      (p) => !projectIdsWithCope.has(p.id),
    );

    if (projectsNeedingCope.length === 0) {
      return NextResponse.json({
        message: "All projects already have COPE rooms.",
        backfilled: 0,
        projects: [],
      });
    }

    // Create COPE room for each project missing one
    const results: { id: string; title: string; status: "ok" | "skipped" }[] = [];
    for (const project of projectsNeedingCope) {
      const room = await ensureCopeRoom(project.id);
      results.push({
        id: project.id,
        title: project.title,
        status: room ? "ok" : "skipped",
      });
    }

    const backfilled = results.filter((r) => r.status === "ok").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      message: `Backfilled ${backfilled} projects${skipped > 0 ? `, ${skipped} skipped (no COPE template)` : ""}.`,
      backfilled,
      skipped,
      projects: results.map((r) => ({
        title: r.title,
        status: r.status,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[backfill-cope] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

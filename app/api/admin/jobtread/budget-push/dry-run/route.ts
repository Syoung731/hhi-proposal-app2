import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { logDevError, logDevRouteHealth } from "@/src/lib/dev-context";
import { runBudgetPushDryRun } from "@/app/lib/jobtread/budget-push/dry-run";

/**
 * DRY-RUN preview for the template-overlay JobTread budget push.
 *
 * GET  /api/admin/jobtread/budget-push/dry-run?projectId=<id>
 * POST /api/admin/jobtread/budget-push/dry-run   body: { projectId: string }
 *
 * Builds the full Room > Trade > Item budget tree for a project, resolves a
 * JobTread costCode/costType for every line, and assembles the exact `createJob`
 * Pave payload the real push WOULD send — then returns the tree, payload, stats,
 * and warnings WITHOUT issuing any JobTread write. The pipeline lives in
 * `@/app/lib/jobtread/budget-push/dry-run` (shared with the preview page at
 * `/admin/jobtread-budget-preview`). Admin-gated.
 */

/** Pull a non-empty trimmed projectId from a parsed JSON body, or null. */
function projectIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { projectId?: unknown }).projectId;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

async function handle(request: Request): Promise<NextResponse> {
  const route = "/api/admin/jobtread/budget-push/dry-run";
  const env = process.env.NODE_ENV === "production" ? "production" : "local";
  const t0 = Date.now();

  // --- Auth (mirror sync-budget: 403 on failure) ---------------------------
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  // --- Resolve projectId from query param OR JSON body ---------------------
  let projectId: string | null = null;
  const url = new URL(request.url);
  const queryProjectId = url.searchParams.get("projectId");
  if (queryProjectId && queryProjectId.trim()) {
    projectId = queryProjectId.trim();
  } else if (request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    projectId = projectIdFromBody(body);
  }

  if (!projectId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "projectId is required (query param ?projectId=… or JSON body { projectId }) and must be a non-empty string",
      },
      { status: 400 },
    );
  }

  // --- Dry-run pipeline (NO JobTread write) --------------------------------
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true },
    });
    if (!project) {
      return NextResponse.json({ ok: false, error: `Project not found: ${projectId}` }, { status: 404 });
    }

    const result = await runBudgetPushDryRun(project.id, project.title);

    const dt = Date.now() - t0;
    await logDevRouteHealth(route, result.warnings.length > 0 ? "warn" : "ok", {
      responseTimeMs: dt,
      notes: `dry-run project ${projectId}: ${result.stats.roomCount} rooms, ${result.stats.lineItemCount} lines, ${result.stats.unmatchedCostCodeCount} unmatched`,
    });

    return NextResponse.json({ ok: true, dryRun: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred.";
    const dt = Date.now() - t0;
    await logDevError({
      source: "server",
      severity: "error",
      message,
      route,
      component: "GET|POST /api/admin/jobtread/budget-push/dry-run",
      env,
      stack: e instanceof Error ? e.stack ?? null : null,
    });
    await logDevRouteHealth(route, "error", { responseTimeMs: dt, notes: "budget-push dry-run route threw" });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

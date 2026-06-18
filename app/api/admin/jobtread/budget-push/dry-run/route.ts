import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { logDevError, logDevRouteHealth } from "@/src/lib/dev-context";
import { buildJobTreadBudgetTree } from "@/app/lib/jobtread/budget-push/merge";
import { createCostCodeResolver } from "@/app/lib/jobtread/budget-push/cost-code-resolver";
import { buildCreateJobPayload } from "@/app/lib/jobtread/budget-push/pave-payload";
import type {
  CostCodeResolver,
  CostTypeHint,
  JobTreadBudgetTree,
  JTCostItem,
} from "@/app/lib/jobtread/budget-push/types";

/**
 * DRY-RUN preview for the template-overlay JobTread budget push.
 *
 * GET  /api/admin/jobtread/budget-push/dry-run?projectId=<id>
 * POST /api/admin/jobtread/budget-push/dry-run   body: { projectId: string }
 *
 * Builds the full Room > Trade > Item budget tree for a project, resolves a
 * JobTread costCode/costType for every line, and assembles the exact
 * `createJob` Pave payload that the real push WOULD send — then returns the
 * tree, the payload, summary stats, and warnings WITHOUT issuing any JobTread
 * write. This is the "eyeball the payload" milestone before the live push is
 * enabled.
 *
 * Admin-gated; mirrors the auth/observability conventions of
 * `app/api/admin/jobtread/sync-budget/route.ts`.
 */

// JobTread caps a single Pave write at ~1500 line items; warn before then.
const LINE_ITEM_WARN_THRESHOLD = 1500;

// Placeholder location id — a dry run never touches a real JobTread location.
const DRY_RUN_LOCATION_ID = "DRY_RUN_LOCATION_ID";

// Job-stage value for the Design-Contract phase (matches the live push default).
const DRY_RUN_JOB_STAGE = "Design Contract";

interface DryRunStats {
  roomCount: number;
  lineItemCount: number;
  templateScaffoldCount: number;
  estimateCount: number;
  extraCount: number;
  unmatchedCostCodeCount: number;
}

/**
 * Derive the Material / Install (labor) / Sub hint from a line's name suffix,
 * matching the convention documented on `CostCodeResolver.resolve`:
 * names follow "[PREFIX] Item - Material" / " - Install" (Sub for subcontract).
 */
function costTypeHintFromName(name: string): CostTypeHint {
  const lower = name.toLowerCase();
  if (lower.endsWith("- material") || lower.endsWith("- materials")) return "Material";
  if (lower.endsWith("- install") || lower.endsWith("- labor")) return "Install";
  if (lower.endsWith("- sub") || lower.endsWith("- subcontract")) return "Sub";
  // Fall back to the structured cost-type name when the suffix is absent.
  if (lower.includes("material")) return "Material";
  if (lower.includes("labor") || lower.includes("install")) return "Install";
  if (lower.includes("sub")) return "Sub";
  return null;
}

/**
 * Walk the tree and resolve a costCode/costType for every line in place.
 * Returns the count of lines left unmatched after resolution.
 *
 * Template-carried codes (the line already has a `costCodeName`) are passed to
 * the resolver as the authoritative `templateCostCodeName`/`templateCostTypeName`
 * so it can prefer an exact match; otherwise the resolver fuzzy-matches on the
 * trade name + the Material/Install/Sub hint.
 */
function resolveTreeCostCodes(
  tree: JobTreadBudgetTree,
  resolver: CostCodeResolver,
): number {
  let unmatched = 0;
  for (const room of tree.rooms) {
    for (const trade of room.trades) {
      for (const item of trade.items) {
        const hint = costTypeHintFromName(item.name);
        const resolution = resolver.resolve(
          trade.tradeName,
          hint,
          item.costCodeName,
          item.costTypeName,
        );
        item.costCodeId = resolution.costCodeId;
        item.costCodeName = resolution.costCodeName;
        item.costTypeId = resolution.costTypeId;
        item.costTypeName = resolution.costTypeName;
        if (resolution.matchKind === "unmatched" || resolution.costCodeId == null) {
          unmatched += 1;
        }
      }
    }
  }
  return unmatched;
}

/** Tally per-line-source counts and total line items across the tree. */
function computeStats(tree: JobTreadBudgetTree, unmatchedCostCodeCount: number): DryRunStats {
  let lineItemCount = 0;
  let templateScaffoldCount = 0;
  let estimateCount = 0;
  let extraCount = 0;

  for (const room of tree.rooms) {
    for (const trade of room.trades) {
      for (const item of trade.items) {
        lineItemCount += 1;
        switch (item.lineSource) {
          case "TEMPLATE_SCAFFOLD":
            templateScaffoldCount += 1;
            break;
          case "ESTIMATE":
            estimateCount += 1;
            break;
          case "EXTRA":
            extraCount += 1;
            break;
        }
      }
    }
  }

  return {
    roomCount: tree.rooms.length,
    lineItemCount,
    templateScaffoldCount,
    estimateCount,
    extraCount,
    unmatchedCostCodeCount,
  };
}

/** Collect a flat list of every line in the tree (for warning detail). */
function flattenItems(tree: JobTreadBudgetTree): Array<{ room: string; trade: string; item: JTCostItem }> {
  const out: Array<{ room: string; trade: string; item: JTCostItem }> = [];
  for (const room of tree.rooms) {
    for (const trade of room.trades) {
      for (const item of trade.items) {
        out.push({ room: room.roomName, trade: trade.tradeName, item });
      }
    }
  }
  return out;
}

/** Assemble human-readable warnings from the resolved tree + stats. */
function buildWarnings(tree: JobTreadBudgetTree, stats: DryRunStats): string[] {
  const warnings: string[] = [];

  if (tree.roomsWithoutTemplate.length > 0) {
    warnings.push(
      `${tree.roomsWithoutTemplate.length} room(s) have an estimate but no template scaffold (estimate-only fallback): ${tree.roomsWithoutTemplate.join(", ")}`,
    );
  }

  if (tree.roomsWithoutEstimate.length > 0) {
    warnings.push(
      `${tree.roomsWithoutEstimate.length} room(s) skipped — no AI estimate: ${tree.roomsWithoutEstimate.join(", ")}`,
    );
  }

  if (stats.unmatchedCostCodeCount > 0) {
    const unmatched = flattenItems(tree).filter((e) => e.item.costCodeId == null);
    const sample = unmatched
      .slice(0, 10)
      .map((e) => `${e.room} > ${e.trade} > ${e.item.name}`);
    const suffix = unmatched.length > sample.length ? `, …(+${unmatched.length - sample.length} more)` : "";
    warnings.push(
      `${stats.unmatchedCostCodeCount} line(s) could not resolve a JobTread cost code — manual selection required before push: ${sample.join("; ")}${suffix}`,
    );
  }

  if (stats.lineItemCount > LINE_ITEM_WARN_THRESHOLD) {
    warnings.push(
      `Budget has ${stats.lineItemCount} line items (> ${LINE_ITEM_WARN_THRESHOLD}) — exceeds the safe single-call write size; the live push will need to batch.`,
    );
  }

  if (stats.roomCount === 0) {
    warnings.push("No rooms with pushable content — nothing would be written.");
  }

  return warnings;
}

/** Pull a non-empty trimmed projectId from a parsed JSON body, or null. */
function projectIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { projectId?: unknown }).projectId;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/**
 * Shared handler for GET (query param) and POST (JSON body). Resolves the
 * projectId from whichever source applies, then runs the dry-run pipeline.
 */
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
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { ok: false, error: `Project not found: ${projectId}` },
        { status: 404 },
      );
    }

    const tree = await buildJobTreadBudgetTree(projectId);
    const resolver = await createCostCodeResolver();
    const unmatchedCostCodeCount = resolveTreeCostCodes(tree, resolver);

    const payload = buildCreateJobPayload(tree, {
      locationId: DRY_RUN_LOCATION_ID,
      name: project.title,
      jobStageValue: DRY_RUN_JOB_STAGE,
      resolver,
    });

    const stats = computeStats(tree, unmatchedCostCodeCount);
    const warnings = buildWarnings(tree, stats);

    const dt = Date.now() - t0;
    await logDevRouteHealth(route, warnings.length > 0 ? "warn" : "ok", {
      responseTimeMs: dt,
      notes: `dry-run project ${projectId}: ${stats.roomCount} rooms, ${stats.lineItemCount} lines, ${stats.unmatchedCostCodeCount} unmatched`,
    });

    return NextResponse.json({
      ok: true,
      dryRun: true,
      projectId: project.id,
      projectTitle: project.title,
      tree,
      payload,
      stats,
      warnings,
    });
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
    await logDevRouteHealth(route, "error", {
      responseTimeMs: dt,
      notes: "budget-push dry-run route threw",
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

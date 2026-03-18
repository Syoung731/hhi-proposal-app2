import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { syncJobBudget } from "@/app/lib/jobtread/sync-budget";

/** POST body: { jobId: string } */
type SyncBody = { jobId?: unknown };

function parseBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as SyncBody;
  const jobId = o.jobId;
  if (typeof jobId !== "string" || !jobId.trim()) return null;
  return jobId.trim();
}

/**
 * POST /api/admin/jobtread/sync-budget
 * Sync one JobTread job budget into canonical SyncedBudgetJob + SyncedBudgetRow. Admin-only.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const jobId = parseBody(body);
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "jobId is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    const result = await syncJobBudget(jobId);
    if (result.status === "error") {
      return NextResponse.json(
        {
          ok: false,
          error: result.message ?? "Sync failed",
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      jobId,
      rowCount: result.rowCount,
      officialSell: result.sellTotal.toFixed(2),
      officialCost: result.costTotal.toFixed(2),
      status: result.status,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

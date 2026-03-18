import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { jobTreadRequest, JobTreadConfigError, JobTreadApiError } from "@/app/lib/jobtread/client";
import { buildTestQuery } from "@/app/lib/jobtread/queries";
import {
  updateIntegrationTestStatus,
  PROVIDER_JOBTREAD,
} from "@/app/lib/integrations/service";

/** Safe error message for API response (no secrets, no stack). */
function toSafeError(e: unknown): string {
  if (e instanceof JobTreadConfigError || e instanceof JobTreadApiError) {
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "An unexpected error occurred.";
}

/** Extract currentGrantId and version from test query response. */
function parseTestResponse(json: unknown): { currentGrantId: string; version: string } | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const currentGrant = (o.currentGrant ?? (o.data as Record<string, unknown>)?.currentGrant) as
    | { id?: string }
    | undefined;
  const currentGrantId =
    typeof currentGrant?.id === "string" ? currentGrant.id : "";
  const version = typeof o.version === "string" ? o.version : "";
  if (!currentGrantId && !version) return null;
  return { currentGrantId, version };
}

/**
 * GET /api/admin/integrations/jobtread/test
 * Runs a minimal JobTread query to verify connectivity. Updates integration lastTestedAt/lastStatus/lastMessage.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }

  try {
    const query = buildTestQuery();
    const json = await jobTreadRequest(query);
    const data = parseTestResponse(json);

    await updateIntegrationTestStatus(
      PROVIDER_JOBTREAD,
      "success",
      "Connection test succeeded."
    );

    if (!data) {
      return NextResponse.json({
        ok: true,
        data: { currentGrantId: "", version: "" },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        currentGrantId: data.currentGrantId,
        version: data.version,
      },
    });
  } catch (e) {
    const safeMessage = toSafeError(e);
    await updateIntegrationTestStatus(
      PROVIDER_JOBTREAD,
      "error",
      safeMessage
    ).catch(() => {});

    return NextResponse.json(
      { ok: false, error: safeMessage },
      { status: e instanceof JobTreadConfigError ? 400 : 502 }
    );
  }
}

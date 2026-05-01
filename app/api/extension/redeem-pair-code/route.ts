import { NextResponse } from "next/server";
import { redeemExtensionPairCode } from "@/app/lib/extension-pair-code";

/**
 * CORS rationale: called from the Zillow Importer Chrome extension
 * (`chrome-extension://<id>` origin). Auth is the pair code itself — the
 * server checks that it exists, hasn't passed its pre-redemption TTL on
 * first use, and (on re-verification from /import-zillow-photos) is
 * within its 24h post-redemption session window. The wildcard origin is
 * intentional — the code, not the request origin, is the auth.
 *
 * TODO(saas-phase): tighten origin to known extension IDs from
 * ZILLOW_EXTENSION_ALLOWLIST.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = typeof body?.code === "string" ? body.code : "";
    const result = await redeemExtensionPairCode(code);
    const response = "error" in result
      ? NextResponse.json({ error: result.error }, { status: 400 })
      : NextResponse.json({ projectId: result.projectId }, { status: 200 });
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const response = NextResponse.json({ error: message }, { status: 500 });
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}

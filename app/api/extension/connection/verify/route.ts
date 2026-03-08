import { NextResponse } from "next/server";
import { verifyDirectHandshake } from "@/app/lib/zillow-browser-connection";

/** CORS so the Chrome extension can call this route. */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(res: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/**
 * Verify the extension's direct handshake (unauthenticated).
 * Body: { nonce: string, extensionId?: string, extensionVersion?: string }
 * Returns: { projectId: string } or { error: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nonce = typeof body?.nonce === "string" ? body.nonce.trim() : "";
    const extensionId = typeof body?.extensionId === "string" ? body.extensionId.trim() : undefined;
    const extensionVersion =
      typeof body?.extensionVersion === "string" ? body.extensionVersion.trim() : undefined;

    const result = await verifyDirectHandshake(
      nonce,
      extensionId || extensionVersion ? { extensionId, extensionVersion } : undefined
    );

    if ("error" in result) {
      return withCors(
        NextResponse.json({ error: result.error }, { status: 400 })
      );
    }
    return withCors(
      NextResponse.json({ projectId: result.projectId }, { status: 200 })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return withCors(
      NextResponse.json({ error: message }, { status: 500 })
    );
  }
}

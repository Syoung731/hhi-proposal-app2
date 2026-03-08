import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { createConnectionSession } from "@/app/lib/zillow-browser-connection";

/**
 * Start a direct browser connection session (authenticated).
 * Returns a one-time nonce for the extension to use in the verify step.
 */
export async function POST(request: Request) {
  try {
    const identity = await requireAdmin();
    const userId = identity.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const projectId =
      typeof body?.projectId === "string" && body.projectId.trim()
        ? body.projectId.trim()
        : null;

    const result = await createConnectionSession(userId, projectId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      sessionId: result.sessionId,
      nonce: result.nonce,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    if (message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("forbidden")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

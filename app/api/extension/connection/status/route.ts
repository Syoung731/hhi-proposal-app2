import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { getCurrentConnectionStatus } from "@/app/lib/zillow-browser-connection";

/**
 * Get connection status for a session (authenticated).
 * Query: sessionId=...
 */
export async function GET(request: Request) {
  try {
    const identity = await requireAdmin();
    const userId = identity.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId")?.trim() ?? "";

    const result = await getCurrentConnectionStatus(sessionId, userId);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "Session not found" ? 404 : 400 }
      );
    }
    return NextResponse.json({
      status: result.status,
      projectId: result.projectId,
      verifiedAt: result.verifiedAt?.toISOString() ?? null,
      handshakeMethod: result.handshakeMethod,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    if (message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("forbidden")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

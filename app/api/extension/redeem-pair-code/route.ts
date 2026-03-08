import { NextResponse } from "next/server";
import { redeemExtensionPairCode } from "@/app/lib/extension-pair-code";

/** CORS headers so the Chrome extension can call this route. */
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

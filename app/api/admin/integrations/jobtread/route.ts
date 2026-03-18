import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import {
  getIntegrationByProvider,
  upsertIntegration,
  PROVIDER_JOBTREAD,
} from "@/app/lib/integrations/service";

/** Safe integration payload (no decrypted secret). */
export type JobTreadIntegrationResponse = {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  baseUrl: string | null;
  metaJson: Record<string, unknown> | null;
  lastTestedAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  hasSecret: boolean;
};

/** POST body for creating/updating JobTread integration. */
export type JobTreadIntegrationPayload = {
  name: string;
  baseUrl?: string | null;
  grantKey?: string | null;
  metaJson?: Record<string, unknown> | null;
  isActive?: boolean;
};

function toSafeResponse(integration: {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  baseUrl: string | null;
  metaJson: unknown;
  lastTestedAt: Date | null;
  lastStatus: string | null;
  lastMessage: string | null;
  encryptedSecret: string | null;
}): JobTreadIntegrationResponse {
  return {
    id: integration.id,
    provider: integration.provider,
    name: integration.name,
    isActive: integration.isActive,
    baseUrl: integration.baseUrl,
    metaJson: integration.metaJson as Record<string, unknown> | null,
    lastTestedAt: integration.lastTestedAt?.toISOString() ?? null,
    lastStatus: integration.lastStatus,
    lastMessage: integration.lastMessage,
    hasSecret: Boolean(integration.encryptedSecret),
  };
}

function parseBody(body: unknown): JobTreadIntegrationPayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const name = o.name;
  if (typeof name !== "string" || !name.trim()) return null;
  return {
    name: name.trim(),
    baseUrl: typeof o.baseUrl === "string" ? o.baseUrl : undefined,
    grantKey: o.grantKey !== undefined ? (typeof o.grantKey === "string" ? o.grantKey : null) : undefined,
    metaJson: o.metaJson !== undefined && o.metaJson !== null && typeof o.metaJson === "object" ? (o.metaJson as Record<string, unknown>) : undefined,
    isActive: typeof o.isActive === "boolean" ? o.isActive : undefined,
  };
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  try {
    const integration = await getIntegrationByProvider(PROVIDER_JOBTREAD);
    if (!integration) {
      return NextResponse.json(null);
    }
    return NextResponse.json(toSafeResponse(integration));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = parseBody(body);
  if (!payload) {
    return NextResponse.json(
      { error: "name is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    const integration = await upsertIntegration({
      provider: PROVIDER_JOBTREAD,
      name: payload.name,
      baseUrl: payload.baseUrl,
      grantKey: payload.grantKey,
      metaJson: payload.metaJson,
      isActive: payload.isActive,
    });
    return NextResponse.json(toSafeResponse(integration));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

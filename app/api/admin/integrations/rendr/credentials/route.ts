import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { encryptSecret } from "@/app/lib/integration-secrets";

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json();
  const { clientId, clientSecret } = body as { clientId?: string; clientSecret?: string };

  if (!clientId?.trim() || !clientSecret?.trim()) {
    return NextResponse.json(
      { error: "Client ID and Client Secret are required." },
      { status: 400 },
    );
  }

  try {
    const encrypted = encryptSecret(clientSecret.trim());
    await prisma.integrationSetting.upsert({
      where: { service: "rendr" },
      create: {
        service: "rendr",
        clientId: clientId.trim(),
        clientSecret: encrypted,
        isActive: false, // not active until tested
      },
      update: {
        clientId: clientId.trim(),
        clientSecret: encrypted,
        // Reset test status when credentials change
        lastTestedAt: null,
        lastTestResult: null,
        isActive: false,
      },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save credentials";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  await requireAdmin();
  const record = await prisma.integrationSetting.findUnique({
    where: { service: "rendr" },
  });
  if (!record) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    clientId: record.clientId,
    isActive: record.isActive,
    lastTestedAt: record.lastTestedAt,
    lastTestResult: record.lastTestResult,
  });
}

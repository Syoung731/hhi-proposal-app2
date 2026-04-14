import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { isRendrConfigured } from "@/app/lib/rendr/rendrClient";

export async function GET() {
  await requireAdmin();
  try {
    const configured = await isRendrConfigured();
    return NextResponse.json({ configured });
  } catch {
    return NextResponse.json({ configured: false });
  }
}

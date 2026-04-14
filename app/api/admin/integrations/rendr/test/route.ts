import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { testRendrConnection } from "@/app/lib/rendr/rendrClient";

export async function POST() {
  await requireAdmin();
  try {
    const result = await testRendrConnection();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection test failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

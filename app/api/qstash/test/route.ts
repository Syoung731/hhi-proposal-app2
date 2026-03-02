import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";

export const POST = verifySignatureAppRouter(async (req: Request) => {
  const bodyText = await req.text();
  // eslint-disable-next-line no-console
  console.log("✅ Verified QStash received:", bodyText);
  return NextResponse.json({ ok: true });
});

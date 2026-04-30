import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";

/**
 * Dev-only QStash signature probe. Returns 404 in production so the
 * endpoint cannot be discovered or used as a logging side channel on a
 * live deployment. Auth in dev is the QStash signature.
 */
export const POST = verifySignatureAppRouter(async (req: Request) => {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }
  const bodyText = await req.text();
  // eslint-disable-next-line no-console
  console.log("✅ Verified QStash received:", bodyText);
  return NextResponse.json({ ok: true });
});

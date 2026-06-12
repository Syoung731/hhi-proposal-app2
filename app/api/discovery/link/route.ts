import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";
import { isValidQuestionKey } from "@/app/lib/discovery/questions";

const MAX_URL_LENGTH = 2_000;
const MAX_LABEL_LENGTH = 300;
const MAX_NAME_LENGTH = 120;

function unauthorized() {
  return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
}

/**
 * POST /api/discovery/link — attach a URL to a question.
 * Body: { questionKey, url, label?, addedBy? }
 */
export async function POST(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questionKey = typeof body.questionKey === "string" ? body.questionKey : "";
  if (!isValidQuestionKey(questionKey)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  let url = (typeof body.url === "string" ? body.url : "").trim().slice(0, MAX_URL_LENGTH);
  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  // Tolerate pasted links without a scheme ("example.com/page").
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  const label = (typeof body.label === "string" ? body.label : "").trim().slice(0, MAX_LABEL_LENGTH);
  const addedBy = (typeof body.addedBy === "string" ? body.addedBy : "").trim().slice(0, MAX_NAME_LENGTH);

  const link = await prisma.discoveryLink.create({
    data: { questionKey, url, label, addedBy },
  });

  return NextResponse.json({ link });
}

/**
 * DELETE /api/discovery/link?id=...
 */
export async function DELETE(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.discoveryLink.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

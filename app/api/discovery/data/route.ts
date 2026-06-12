import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/discovery/data — full current state of the questionnaire.
 * The form refetches this on window focus so teammates' answers show up
 * without a manual reload.
 */
export async function GET(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  }

  const [answers, links, attachments] = await Promise.all([
    prisma.discoveryAnswer.findMany(),
    prisma.discoveryLink.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.discoveryAttachment.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({
    answers: answers.map((a) => ({
      questionKey: a.questionKey,
      answerText: a.answerText,
      updatedBy: a.updatedBy,
      updatedAt: a.updatedAt.toISOString(),
    })),
    links,
    attachments,
  });
}

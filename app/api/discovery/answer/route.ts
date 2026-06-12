import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  discoveryKeyFromRequest,
  isValidDiscoveryKey,
} from "@/app/lib/discovery/auth";
import { isValidQuestionKey } from "@/app/lib/discovery/questions";

const MAX_ANSWER_LENGTH = 20_000;
const MAX_NAME_LENGTH = 120;

/**
 * PUT /api/discovery/answer
 *
 * Public route (allowlisted in proxy.ts), authenticated by the shared
 * discovery access key. Upserts one answer keyed by questionKey —
 * last-writer-wins, which is the intended collaboration model for the
 * questionnaire.
 *
 * Body: { questionKey, answerText, updatedBy }
 */
export async function PUT(request: Request) {
  if (!isValidDiscoveryKey(discoveryKeyFromRequest(request))) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questionKey = typeof body.questionKey === "string" ? body.questionKey : "";
  if (!isValidQuestionKey(questionKey)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  const answerText = (typeof body.answerText === "string" ? body.answerText : "")
    .slice(0, MAX_ANSWER_LENGTH);
  const updatedBy = (typeof body.updatedBy === "string" ? body.updatedBy : "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  const answer = await prisma.discoveryAnswer.upsert({
    where: { questionKey },
    create: { questionKey, answerText, updatedBy },
    update: { answerText, updatedBy },
  });

  return NextResponse.json({
    answer: {
      questionKey: answer.questionKey,
      answerText: answer.answerText,
      updatedBy: answer.updatedBy,
      updatedAt: answer.updatedAt.toISOString(),
    },
  });
}

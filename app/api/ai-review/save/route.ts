import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";

interface QAItem {
  id: string;
  question: string;
  reason: string;
  type: "number" | "boolean" | "choice" | "text";
  unit: string | null;
  defaultAnswer: unknown;
  answer: unknown;
  options: string[] | null;
}

// ---------- POST — Save review answers ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { roomId, projectId, level, questions } = body as {
      roomId?: string;
      projectId: string;
      level: "room" | "project";
      questions: QAItem[];
    };

    if (!projectId || !questions) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const qaData = JSON.parse(JSON.stringify({
      generatedAt: new Date().toISOString(),
      questions,
    })) as Prisma.InputJsonValue;

    if (level === "room") {
      if (!roomId) {
        return NextResponse.json({ error: "Missing roomId for room-level save" }, { status: 400 });
      }

      // Build clarifications text from answers
      const clarifications = buildClarificationsText(questions);

      // Load current scope narrative
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { scopeNarrative: true },
      });

      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      // Update or append clarifications section
      const updatedNarrative = updateScopeWithClarifications(
        room.scopeNarrative,
        clarifications,
      );

      await prisma.room.update({
        where: { id: roomId },
        data: {
          scopeQA: qaData,
          scopeNarrative: updatedNarrative,
        },
      });

      return NextResponse.json({ success: true });
    } else {
      // Project-level
      await prisma.project.update({
        where: { id: projectId },
        data: { projectQA: qaData },
      });

      return NextResponse.json({ success: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-review/save] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- Helpers ----------

function buildClarificationsText(questions: QAItem[]): string {
  const answered = questions.filter((q) => q.answer != null && q.answer !== "");
  if (answered.length === 0) return "";

  const lines = answered.map((q) => {
    const unit = q.unit ? ` ${q.unit}` : "";
    const answer = typeof q.answer === "boolean" ? (q.answer ? "Yes" : "No") : q.answer;
    return `- ${q.question}: ${answer}${unit}`;
  });

  return `--- Scope Clarifications (AI Review) ---\n${lines.join("\n")}`;
}

function updateScopeWithClarifications(
  narrative: string,
  clarifications: string,
): string {
  if (!clarifications) return narrative;

  // Check if a clarifications section already exists
  const marker = "--- Scope Clarifications (AI Review) ---";
  const idx = narrative.indexOf(marker);

  if (idx !== -1) {
    // Replace existing section (everything from marker to end or next major section)
    const before = narrative.slice(0, idx).trimEnd();
    return `${before}\n\n${clarifications}`;
  }

  // Append to end
  const trimmed = narrative.trimEnd();
  return trimmed ? `${trimmed}\n\n${clarifications}` : clarifications;
}

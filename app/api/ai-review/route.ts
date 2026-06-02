import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { getEffectiveRoomMetrics } from "@/app/lib/effective-room-sf";
import { buildRendrContextString } from "@/app/lib/rendr/buildRendrContext";
import {
  getRoomReviewSystemPrompt,
  PROJECT_REVIEW_SYSTEM_PROMPT,
} from "@/app/lib/ai/review-prompts";

// ---------- POST — Generate review questions ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { roomId, projectId, level } = body as {
      roomId?: string;
      projectId: string;
      level: "room" | "project";
    };

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    if (level === "room") {
      if (!roomId) {
        return NextResponse.json({ error: "Missing roomId for room-level review" }, { status: 400 });
      }
      return await generateRoomQuestions(roomId, projectId);
    } else {
      return await generateProjectQuestions(projectId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-review] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- Room-level question generation ----------

async function generateRoomQuestions(
  roomId: string,
  projectId: string,
) {
  const [room, project, companyContext] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      include: {
        sectionType: { select: { name: true, category: true } },
        roomTemplate: {
          select: {
            displayName: true,
            name: true,
            tradeGroups: { select: { name: true }, orderBy: { sortOrder: "asc" } },
          },
        },
        subAreas: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, defaultCeilingHeightFt: true, addressLine1: true, city: true },
    }),
    prisma.companyContext.findFirst({ select: { market: true, defaultFinishTier: true } }),
  ]);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Get effective room metrics
  const metrics = await getEffectiveRoomMetrics(roomId, project?.defaultCeilingHeightFt);

  // Build sub-area section
  const subAreaSection =
    room.subAreas.length > 0
      ? `\n## Sub-Areas\n${room.subAreas.map((sa) => `- ${sa.name}: ${sa.areaSqFt ?? 0} SF, ${((sa.lengthIn ?? 0) / 12).toFixed(1)}' x ${((sa.widthIn ?? 0) / 12).toFixed(1)}'`).join("\n")}`
      : "";

  // Build existing answers section
  const existingQA = room.scopeQA as { questions?: Array<{ question: string; answer: unknown }> } | null;
  const existingSection =
    existingQA?.questions?.length
      ? `\n## Existing Answers\nThese questions were previously answered. Only generate NEW questions or questions where the previous answer seems inconsistent with the scope:\n${existingQA.questions.map((q) => `- Q: ${q.question} → A: ${q.answer}`).join("\n")}`
      : "";

  const roomCeilingProvided = metrics.ceilingHeightFt !== 9 || (room.ceilingHeightFt != null && room.ceilingHeightFt > 0);

  const userPrompt = `Review this room's scope of work and generate questions about anything ambiguous, missing, or that requires a decision before estimating.

## Room Details
Room Name: ${room.name}
Section Type: ${room.sectionType?.name ?? "Not assigned"} (${room.sectionType?.category ?? "N/A"})
Square Footage: ${metrics.effectiveSqFt} SF (base ${metrics.baseSqFt} SF + sub-areas ${metrics.subAreaSqFt} SF)
Dimensions: ${metrics.baseSqFt > 0 ? `${Math.sqrt(metrics.baseSqFt).toFixed(1)}' approx` : "Not provided"}
Ceiling Height: ${roomCeilingProvided ? `${metrics.ceilingHeightFt} ft` : "NOT ENTERED — this should be your FIRST question"}
Perimeter: ${metrics.effectivePerimeterLF > 0 ? `${metrics.effectivePerimeterLF} LF` : "Not available"}
Wall SF: ${metrics.wallSF != null ? `${metrics.wallSF} SF` : "Cannot calculate — ceiling height missing"}
${subAreaSection}
${(() => {
  const rendrCtx = buildRendrContextString(room);
  return rendrCtx ? `\n## ${rendrCtx}\n` : "";
})()}
${buildFixtureContext(room.roomDetail as Record<string, unknown> | null)}
## Scope of Work
${room.scopeNarrative || "(No scope narrative entered)"}

## Room Template
Template: ${room.roomTemplate?.displayName ?? room.roomTemplate?.name ?? "Not assigned"}
${room.roomTemplate?.tradeGroups?.length ? `Trade groups available: ${room.roomTemplate.tradeGroups.map((g) => g.name).join(", ")}` : ""}

## Project Context
Project: ${project?.title ?? "Unknown"}
Location: ${project?.addressLine1 ?? ""} ${project?.city ?? "Hilton Head Island, SC"}
Market: ${companyContext?.market ?? "Hilton Head Island luxury second-home"}
Finish Tier: ${companyContext?.defaultFinishTier ?? "high-end"}
${existingSection}

Generate questions as JSON.`;

  const response = await callClaude({
    max_tokens: 4000,
    temperature: 0.3,
    system: getRoomReviewSystemPrompt(),
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonResponse(rawText);
  if (!parsed) {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
  }

  return NextResponse.json({
    questions: parsed.questions ?? [],
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    },
  });
}

// ---------- Project-level question generation ----------

async function generateProjectQuestions(
  projectId: string,
) {
  const [project, companyContext] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        rooms: {
          where: { isProjectOverhead: false },
          select: { name: true, scopeNarrative: true, areaSqFt: true, totalTarget: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.companyContext.findFirst({ select: { market: true, defaultFinishTier: true } }),
  ]);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const roomSummary = project.rooms
    .map((r) => `- ${r.name}: ${r.areaSqFt ?? "?"} SF | ${r.totalTarget != null ? `$${r.totalTarget.toLocaleString()}` : "no estimate"}\n  Scope: ${(r.scopeNarrative || "").slice(0, 200)}`)
    .join("\n");

  const totalValue = project.rooms.reduce((s, r) => s + (r.totalTarget ?? 0), 0);

  // Check for existing project QA
  const existingQA = project.projectQA as { questions?: Array<{ question: string; answer: unknown }> } | null;
  const existingSection =
    existingQA?.questions?.length
      ? `\n## Existing Answers\n${existingQA.questions.map((q) => `- Q: ${q.question} → A: ${q.answer}`).join("\n")}`
      : "";

  const userPrompt = `Review this project and generate questions about project-level overhead (COPE).

## Project Details
Title: ${project.title}
Address: ${[project.addressLine1, project.city, project.state].filter(Boolean).join(", ") || "Hilton Head Island, SC"}
Total Rooms: ${project.rooms.length}
Estimated Total Value: $${totalValue.toLocaleString()}
Market: ${companyContext?.market ?? "Hilton Head Island luxury second-home"}

## Room Summary
${roomSummary}
${existingSection}

Generate questions as JSON.`;

  const response = await callClaude({
    max_tokens: 4000,
    temperature: 0.3,
    system: PROJECT_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonResponse(rawText);
  if (!parsed) {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
  }

  return NextResponse.json({
    questions: parsed.questions ?? [],
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    },
  });
}

// ---------- JSON parser helper ----------

// ---------- Fixture context for Kitchen/Bath rooms ----------

function buildFixtureContext(roomDetail: Record<string, unknown> | null): string {
  if (!roomDetail) return "";

  const d = roomDetail;
  const lines: string[] = [];

  // Kitchen fixtures
  if (d.baseCabinetCountExisting != null) {
    lines.push(`Base Cabinets: ${d.baseCabinetCountExisting} existing${d.baseCabinetLfExisting ? ` (${d.baseCabinetLfExisting} LF)` : ""}, ${d.baseCabinetCountRecommended ?? "?"} recommended${d.baseCabinetLfRecommended ? ` (${d.baseCabinetLfRecommended} LF)` : ""}`);
  }
  if (d.wallCabinetCountExisting != null) {
    lines.push(`Wall Cabinets: ${d.wallCabinetCountExisting} existing${d.wallCabinetLfExisting ? ` (${d.wallCabinetLfExisting} LF)` : ""}, ${d.wallCabinetCountRecommended ?? "?"} recommended${d.wallCabinetLfRecommended ? ` (${d.wallCabinetLfRecommended} LF)` : ""}`);
  }
  if (d.countertopSfExisting != null) {
    lines.push(`Countertop: ${d.countertopSfExisting} SF existing, ${d.countertopSfRecommended ?? "?"} SF recommended`);
  }
  if (d.backsplashSfExisting != null) {
    lines.push(`Backsplash: ${d.backsplashSfExisting} SF existing, ${d.backsplashSfRecommended ?? "?"} SF recommended`);
  }
  if (d.sinkCountExisting != null) {
    lines.push(`Sinks: ${d.sinkCountExisting} existing, ${d.sinkCountRecommended ?? "?"} recommended`);
  }

  // Bathroom fixtures
  if (d.vanityCabinetCountExisting != null) {
    lines.push(`Vanity: ${d.vanityCabinetCountExisting} existing${d.vanityCabinetLfExisting ? ` (${d.vanityCabinetLfExisting} LF)` : ""}, ${d.vanityCabinetCountRecommended ?? "?"} recommended${d.vanityCabinetLfRecommended ? ` (${d.vanityCabinetLfRecommended} LF)` : ""}`);
  }
  if (d.toiletCountExisting != null) {
    lines.push(`Toilets: ${d.toiletCountExisting} existing, ${d.toiletCountRecommended ?? "?"} recommended`);
  }

  // Appliances (with replace/keep status)
  const appliances: string[] = [];
  if (d.hasStoveExisting === true) appliances.push(`Stove/Range (${d.hasStoveRecommended ? "REPLACING" : "keeping existing"})`);
  if (d.hasOvenExisting === true) appliances.push(`Oven (${d.hasOvenRecommended ? "REPLACING" : "keeping existing"})`);
  if (d.hasFridgeExisting === true) appliances.push(`Refrigerator (${d.hasFridgeRecommended ? "REPLACING" : "keeping existing"})`);
  if (d.hasDishwasherExisting === true) appliances.push(`Dishwasher (${d.hasDishwasherRecommended ? "REPLACING" : "keeping existing"})`);
  if (appliances.length > 0) lines.push(`Appliances: ${appliances.join(", ")}`);

  // Bathroom fixtures (tub/shower)
  if (d.hasTubExisting != null) lines.push(`Tub: ${d.hasTubExisting ? "exists" : "none"} (${d.hasTubRecommended ? "REPLACING/ADDING" : "keeping/none"})`);
  if (d.hasShowerExisting != null) lines.push(`Shower: ${d.hasShowerExisting ? "exists" : "none"} (${d.hasShowerRecommended ? "REPLACING/ADDING" : "keeping/none"})`);
  if (d.hasTubShowerComboExisting != null) lines.push(`Tub/Shower Combo: ${d.hasTubShowerComboExisting ? "exists" : "none"} (${d.hasTubShowerComboRecommended ? "REPLACING/ADDING" : "keeping/none"})`);

  if (lines.length === 0) return "";

  return `\n## Fixture & Cabinet Data (from LiDAR scan — ALREADY KNOWN, do NOT ask about these quantities)\n${lines.join("\n")}\n`;
}

function parseJsonResponse(text: string): { questions: unknown[] } | null {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from within the text
    const match = text.match(/\{[\s\S]*"questions"[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

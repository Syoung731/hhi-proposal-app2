import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { getEffectiveRoomMetrics } from "@/app/lib/effective-room-sf";

/**
 * POST /api/ai-review/batch
 * Generate review questions for multiple rooms + project in parallel.
 * Returns: { rooms: { [roomId]: { questions, error? } }, project?: { questions, error? } }
 */

// Reuse the same system prompts from the single-room endpoint
const ROOM_REVIEW_SYSTEM_PROMPT = `You are a construction estimating reviewer for HHI Builders, a luxury residential renovation company on Hilton Head Island, SC. Your job is to review a room's scope of work and identify questions that need to be answered BEFORE generating an accurate line-item estimate.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no preamble.
2. Generate 3-20 questions depending on scope complexity. Simple scopes need fewer questions.
3. Every question must be SPECIFIC to this room's scope — do not ask generic questions that don't apply.
4. Each question must have a smart default answer based on what's most common for this type of work on Hilton Head Island.
5. Focus on information that would CHANGE the estimate quantities or line items. Don't ask about things that don't affect the numbers.

CATEGORIES OF QUESTIONS (prioritize in this order):
1. MISSING DIMENSIONS: Ceiling height, shower dimensions, closet sizes — anything needed for SF calculations
2. SCOPE AMBIGUITY: "Selective demo" — how much? "Update fixtures" — which ones? "New tile" — floor only or walls too?
3. MATERIAL DECISIONS: Tile type, countertop material, fixture quality level — things that affect allowance pricing
4. SCOPE BOUNDARIES: What's included vs excluded? "All other fixtures to remain" — which specifically?
5. STRUCTURAL UNKNOWNS: Extent of damage, how many joists, load-bearing walls involved?
6. TRADE DECISIONS: Electrical — how many new circuits? Plumbing — relocating or just replacing?

QUESTION TYPES:
- "number": Numeric answer with optional unit (ft, SF, LF, count)
- "boolean": Yes/No question
- "choice": Multiple choice from provided options
- "text": Short free-text answer

For each question, provide:
- id: unique identifier (q1, q2, q3...)
- question: clear, specific question text
- reason: brief explanation of WHY this affects the estimate
- type: one of "number", "boolean", "choice", "text"
- unit: for number types, the unit. null for other types.
- defaultAnswer: your best guess for the most common answer
- options: for "choice" type, array of option strings. null for other types.

DO NOT ask about:
- Project-level items (permits, HOA, dumpsters, supervision, protection)
- Items clearly stated in the scope
- Aesthetic preferences that don't affect line items or quantities

Return this JSON structure:
{
  "questions": [
    { "id": "q1", "question": "...", "reason": "...", "type": "number", "unit": "ft", "defaultAnswer": 9, "options": null }
  ]
}`;

const PROJECT_REVIEW_SYSTEM_PROMPT = `You are a construction project reviewer for HHI Builders. Review the overall project and generate questions that affect project-level overhead (COPE — Cost of Project Execution).

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no preamble.
2. Generate 3-12 questions about project-level concerns.
3. Each question must have a smart default answer.
4. Focus on information that affects: permits, HOA, waste removal, content manipulation, supervision, and access.

QUESTION CATEGORIES:
1. HOA: Does this community have an HOA? Is architectural review required?
2. OCCUPANCY: Is the home occupied during construction? Do contents need storage?
3. ACCESS: Any access restrictions? Gated community? Elevator building? Stairs only?
4. PERMITS: Are there any special permit requirements beyond standard building permit?
5. WASTE: Will dumpster need privacy screening? Any disposal restrictions?
6. DURATION: Any timeline constraints or phasing requirements?
7. SITE CONDITIONS: Parking restrictions? Material staging area? Neighbor sensitivity?

QUESTION TYPES:
- "number": Numeric answer with optional unit
- "boolean": Yes/No question
- "choice": Multiple choice from provided options
- "text": Short free-text answer

For each question, provide ALL of these fields:
- id: unique identifier (e.g. "hoa_001")
- question: clear, specific question text
- reason: brief explanation of WHY this affects the COPE estimate (shown to user as helper text)
- type: one of "number", "boolean", "choice", "text"
- unit: for number types, the unit (e.g. "weeks", "count"). null for other types.
- defaultAnswer: your best guess for the most common answer on Hilton Head Island
- options: for "choice" type, array of option strings. null for other types.

Return this JSON structure:
{
  "questions": [
    { "id": "hoa_001", "question": "...", "reason": "...", "type": "boolean", "unit": null, "defaultAnswer": true, "options": null },
    { "id": "access_001", "question": "...", "reason": "...", "type": "choice", "unit": null, "defaultAnswer": "Standard residential", "options": ["Standard residential", "Gated community", "High-rise/elevator", "Island/limited access"] }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { projectId, roomIds, includeProject } = body as {
      projectId: string;
      roomIds: string[];
      includeProject: boolean;
    };

    if (!projectId || !roomIds) {
      return NextResponse.json({ error: "Missing projectId or roomIds" }, { status: 400 });
    }

    // Run all room reviews + project review in parallel
    const roomPromises = roomIds.map(async (roomId) => {
      try {
        const questions = await generateRoomQuestions(roomId, projectId);
        return { roomId, questions, error: null };
      } catch (err) {
        return { roomId, questions: [], error: err instanceof Error ? err.message : "Failed" };
      }
    });

    const projectPromise = includeProject
      ? generateProjectQuestions(projectId)
          .then((questions) => ({ questions, error: null }))
          .catch((err) => ({ questions: [], error: err instanceof Error ? err.message : "Failed" }))
      : null;

    const [roomResults, projectResult] = await Promise.all([
      Promise.all(roomPromises),
      projectPromise,
    ]);

    // Build response
    const rooms: Record<string, { questions: unknown[]; error?: string }> = {};
    for (const r of roomResults) {
      rooms[r.roomId] = r.error
        ? { questions: r.questions, error: r.error }
        : { questions: r.questions };
    }

    return NextResponse.json({
      rooms,
      project: projectResult ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-review/batch] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- Room-level question generation ----------

async function generateRoomQuestions(
  roomId: string,
  projectId: string,
): Promise<unknown[]> {
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

  if (!room) throw new Error(`Room ${roomId} not found`);
  if (!room.scopeNarrative?.trim()) return []; // No scope = no questions

  const metrics = await getEffectiveRoomMetrics(roomId, project?.defaultCeilingHeightFt);

  const subAreaSection =
    room.subAreas.length > 0
      ? `\n## Sub-Areas\n${room.subAreas.map((sa) => `- ${sa.name}: ${sa.areaSqFt ?? 0} SF, ${((sa.lengthIn ?? 0) / 12).toFixed(1)}' x ${((sa.widthIn ?? 0) / 12).toFixed(1)}'`).join("\n")}`
      : "";

  const existingQA = room.scopeQA as { questions?: Array<{ question: string; answer: unknown }> } | null;
  const existingSection =
    existingQA?.questions?.length
      ? `\n## Existing Answers\nThese questions were previously answered. Only generate NEW questions or questions where the previous answer seems inconsistent with the scope:\n${existingQA.questions.map((q) => `- Q: ${q.question} \u2192 A: ${q.answer}`).join("\n")}`
      : "";

  const roomCeilingProvided = metrics.ceilingHeightFt !== 9 || (room.ceilingHeightFt != null && room.ceilingHeightFt > 0);

  const userPrompt = `Review this room's scope of work and generate questions.

## Room Details
Room Name: ${room.name}
Section Type: ${room.sectionType?.name ?? "Not assigned"} (${room.sectionType?.category ?? "N/A"})
Square Footage: ${metrics.effectiveSqFt} SF (base ${metrics.baseSqFt} SF + sub-areas ${metrics.subAreaSqFt} SF)
Ceiling Height: ${roomCeilingProvided ? `${metrics.ceilingHeightFt} ft` : "NOT ENTERED \u2014 this should be your FIRST question"}
Perimeter: ${metrics.effectivePerimeterLF > 0 ? `${metrics.effectivePerimeterLF} LF` : "Not available"}
Wall SF: ${metrics.wallSF != null ? `${metrics.wallSF} SF` : "Cannot calculate"}
${subAreaSection}

## Scope of Work
${room.scopeNarrative}

## Room Template
Template: ${room.roomTemplate?.displayName ?? room.roomTemplate?.name ?? "Not assigned"}
${room.roomTemplate?.tradeGroups?.length ? `Trade groups: ${room.roomTemplate.tradeGroups.map((g) => g.name).join(", ")}` : ""}

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
    system: ROOM_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonResponse(rawText);
  return parsed?.questions ?? [];
}

// ---------- Project-level question generation ----------

async function generateProjectQuestions(
  projectId: string,
): Promise<unknown[]> {
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

  if (!project) throw new Error("Project not found");

  const roomSummary = project.rooms
    .map((r) => `- ${r.name}: ${r.areaSqFt ?? "?"} SF | ${r.totalTarget != null ? `$${r.totalTarget.toLocaleString()}` : "no estimate"}\n  Scope: ${(r.scopeNarrative || "").slice(0, 200)}`)
    .join("\n");

  const totalValue = project.rooms.reduce((s, r) => s + (r.totalTarget ?? 0), 0);

  const existingQA = project.projectQA as { questions?: Array<{ question: string; answer: unknown }> } | null;
  const existingSection =
    existingQA?.questions?.length
      ? `\n## Existing Answers\n${existingQA.questions.map((q) => `- Q: ${q.question} \u2192 A: ${q.answer}`).join("\n")}`
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
  return parsed?.questions ?? [];
}

// ---------- JSON parser helper ----------

function parseJsonResponse(text: string): { questions: unknown[] } | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(cleaned);
  } catch {
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

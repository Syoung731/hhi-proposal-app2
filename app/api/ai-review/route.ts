import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { getEffectiveRoomMetrics } from "@/app/lib/effective-room-sf";
import { buildRendrContextString } from "@/app/lib/rendr/buildRendrContext";

// ---------- System prompts ----------

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
- reason: brief explanation of WHY this affects the estimate (shown to user as helper text)
- type: one of "number", "boolean", "choice", "text"
- unit: for number types, the unit (ft, SF, LF, inches, count, etc.)
- defaultAnswer: your best guess for the most common answer
- options: for "choice" type, array of option strings. null for other types.

DO NOT ask about:
- Project-level items (permits, HOA, dumpsters, supervision, protection) — those are handled separately
- Items clearly stated in the scope (don't ask "is there a shower?" when the scope says "rebuild shower")
- Aesthetic preferences that don't affect line items or quantities
- Quantities that are ALREADY PROVIDED in the "Fixture & Cabinet Data" section (cabinet LF, countertop SF, backsplash SF, sink count, toilet count, appliance decisions, tub/shower decisions). These are LiDAR-measured and confirmed — do NOT generate questions asking for these numbers.

IMPORTANT: When fixture/cabinet data IS provided with recommended values, and you DO still ask a question about a related quantity (e.g., confirming cabinet layout changes mentioned in scope), you MUST use the RECOMMENDED value from the fixture data as the defaultAnswer — NOT a guess. For example, if recommended base cabinet LF is 24.9, the defaultAnswer must be 24.9, not 18.

When fixture/cabinet data IS provided, focus your questions on QUALITATIVE decisions instead:
- Material selections (countertop material, tile type, cabinet wood species)
- Finish levels (cabinet door style, hardware tier, fixture quality)
- Layout changes (moving plumbing, electrical relocation, structural work)
- Specific product preferences (brand, model, color)
- Scope boundaries (which walls get tile, floor only vs walls, extent of demo)

Return this JSON structure:
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "reason": "...",
      "type": "number",
      "unit": "ft",
      "defaultAnswer": 9,
      "options": null
    }
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
    system: ROOM_REVIEW_SYSTEM_PROMPT,
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

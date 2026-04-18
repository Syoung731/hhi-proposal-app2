import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { buildRendrContextString } from "@/app/lib/rendr/buildRendrContext";
import {
  TRADE_UPDATE_SYSTEM_PROMPT,
  buildTradeUpdateUserPrompt,
  type TradeUpdateProposal,
} from "@/app/lib/ai-trade-update-prompt";

type Params = { params: Promise<{ estimateId: string }> };

/**
 * POST /api/ai-estimate/[estimateId]/update-trade
 *
 * Generates a diff proposal (add/update/delete) for a single trade group based
 * on a user's free-text instruction. Does NOT modify the database — the client
 * previews the proposal and then calls apply-trade-update to commit.
 *
 * Body: { tradeGroup: string, instruction: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { estimateId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const { tradeGroup, instruction } = body as { tradeGroup: string; instruction: string };
    if (!tradeGroup || !instruction?.trim()) {
      return NextResponse.json({ error: "tradeGroup and instruction are required" }, { status: 400 });
    }

    // Load estimate + room context
    const estimate = await prisma.aIEstimate.findUnique({
      where: { id: estimateId },
      include: {
        lineItems: { where: { tradeGroup }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

    const room = await prisma.room.findUnique({
      where: { id: estimate.sectionId },
      include: { sectionType: { select: { name: true } } },
    });
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    // Build fixture context inline (same helper exists in ai-review but keeping this route self-contained)
    const fixtureContext = buildFixtureContext(room.roomDetail as Record<string, unknown> | null);
    const rendrContext = buildRendrContextString(room);

    // Pull catalog items relevant to this trade
    const catalogItems = await prisma.pricingCatalogItem.findMany({
      where: { active: true, OR: [{ trade: tradeGroup }, { trade: null }] },
      select: { id: true, name: true, unit: true, unitCost: true, unitPrice: true, trade: true },
      orderBy: [{ trade: "asc" }, { name: "asc" }],
      take: 200,
    });

    const userPrompt = buildTradeUpdateUserPrompt({
      roomName: room.name,
      sectionTypeName: room.sectionType?.name ?? null,
      scopeNarrative: room.scopeNarrative ?? "",
      tradeGroup,
      instruction: instruction.trim(),
      currentItems: estimate.lineItems.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitCost: it.unitCost,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        source: it.source,
        catalogItemId: it.catalogItemId,
      })),
      rendrContext,
      fixtureContext,
      catalogItems,
    });

    const response = await callClaude({
      max_tokens: 4000,
      temperature: 0.2,
      system: TRADE_UPDATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (process.env.NODE_ENV === "development") {
      console.log("[update-trade] AI raw response:", rawText.substring(0, 2000));
    }

    const proposal = parseProposal(rawText);
    if (!proposal) {
      console.error("[update-trade] Failed to parse AI response. Raw:", rawText);
      return NextResponse.json({ error: "Failed to parse AI response — try rewording the instruction", raw: rawText.substring(0, 1000) }, { status: 502 });
    }

    return NextResponse.json({ proposal, tradeGroup });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[update-trade] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- Helpers ----------

function parseProposal(text: string): TradeUpdateProposal | null {
  const candidates = extractJsonCandidates(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== "object" || parsed === null) continue;
      if (!("summary" in parsed) && !("add" in parsed) && !("update" in parsed) && !("delete" in parsed)) continue;
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        add: Array.isArray(parsed.add) ? parsed.add : [],
        update: Array.isArray(parsed.update) ? parsed.update : [],
        delete: Array.isArray(parsed.delete) ? parsed.delete : [],
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Extract one or more plausible JSON candidates from a mixed text blob. */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  // 1. Strip code fences anywhere in the text
  const fenceStripped = text
    .replace(/```(?:json)?\s*\n?/g, "")
    .replace(/\n?```/g, "")
    .trim();
  if (fenceStripped) candidates.push(fenceStripped);

  // 2. Find first balanced {...} block (scans for matching braces, ignoring string contents)
  const balanced = extractBalancedObject(text);
  if (balanced) candidates.push(balanced);

  // 3. Raw text as-is
  candidates.push(text.trim());

  return candidates.filter((c, i) => c.length > 0 && candidates.indexOf(c) === i);
}

function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function buildFixtureContext(roomDetail: Record<string, unknown> | null): string | null {
  if (!roomDetail) return null;
  const d = roomDetail;
  const lines: string[] = [];

  if (d.baseCabinetCountExisting != null) {
    lines.push(`Base Cabinets: ${d.baseCabinetCountExisting} existing${d.baseCabinetLfExisting ? ` (${d.baseCabinetLfExisting} LF)` : ""}, ${d.baseCabinetCountRecommended ?? "?"} recommended${d.baseCabinetLfRecommended ? ` (${d.baseCabinetLfRecommended} LF)` : ""}`);
  }
  if (d.wallCabinetCountExisting != null) {
    lines.push(`Wall Cabinets: ${d.wallCabinetCountExisting} existing${d.wallCabinetLfExisting ? ` (${d.wallCabinetLfExisting} LF)` : ""}, ${d.wallCabinetCountRecommended ?? "?"} recommended${d.wallCabinetLfRecommended ? ` (${d.wallCabinetLfRecommended} LF)` : ""}`);
  }
  if (d.countertopSfExisting != null) lines.push(`Countertop: ${d.countertopSfExisting} SF existing, ${d.countertopSfRecommended ?? "?"} SF recommended`);
  if (d.backsplashSfExisting != null) lines.push(`Backsplash: ${d.backsplashSfExisting} SF existing, ${d.backsplashSfRecommended ?? "?"} SF recommended`);
  if (d.sinkCountExisting != null) lines.push(`Sinks: ${d.sinkCountExisting} existing, ${d.sinkCountRecommended ?? "?"} recommended`);
  if (d.vanityCabinetCountExisting != null) lines.push(`Vanity: ${d.vanityCabinetCountExisting} existing, ${d.vanityCabinetCountRecommended ?? "?"} recommended`);
  if (d.toiletCountExisting != null) lines.push(`Toilets: ${d.toiletCountExisting} existing, ${d.toiletCountRecommended ?? "?"} recommended`);

  const appliances: string[] = [];
  if (d.hasStoveExisting === true) appliances.push(`Stove (${d.hasStoveRecommended ? "REPLACING" : "keeping"})`);
  if (d.hasOvenExisting === true) appliances.push(`Oven (${d.hasOvenRecommended ? "REPLACING" : "keeping"})`);
  if (d.hasFridgeExisting === true) appliances.push(`Fridge (${d.hasFridgeRecommended ? "REPLACING" : "keeping"})`);
  if (d.hasDishwasherExisting === true) appliances.push(`DW (${d.hasDishwasherRecommended ? "REPLACING" : "keeping"})`);
  if (appliances.length > 0) lines.push(`Appliances: ${appliances.join(", ")}`);

  if (d.hasTubExisting != null) lines.push(`Tub: ${d.hasTubExisting ? "exists" : "none"} (${d.hasTubRecommended ? "REPLACING/ADDING" : "keeping/none"})`);
  if (d.hasShowerExisting != null) lines.push(`Shower: ${d.hasShowerExisting ? "exists" : "none"} (${d.hasShowerRecommended ? "REPLACING/ADDING" : "keeping/none"})`);

  if (lines.length === 0) return null;
  return `\n## Fixture & Cabinet Data (from LiDAR)\n${lines.join("\n")}\n`;
}

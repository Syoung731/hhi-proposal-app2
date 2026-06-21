import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { SYSTEM_PROMPT, buildUserPrompt, type ProjectContext, type RoomDimensions } from "@/app/lib/ai-estimate-prompt";
import { parseEstimateResponse, stripProjectOverheadFromRoom } from "@/app/lib/ai-estimate-parser";
import { streamClaude } from "@/app/lib/ai/model";
import { calcItemPriceRange } from "@/app/lib/price-range";
import { applyMarginPolicy } from "@/app/lib/ai/estimate-margin-policy";

// ---------- POST — Regenerate estimate (creates a new one) ----------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> },
) {
  try {
    const { estimateId } = await params;

    // Load the original estimate
    const original = await prisma.aIEstimate.findUnique({
      where: { id: estimateId },
    });
    if (!original) {
      return NextResponse.json({ error: "Original estimate not found" }, { status: 404 });
    }

    // Optional updated scope from request body
    const body = await request.json().catch(() => ({}));
    const { scopeNarrative: updatedScope, squareFootage, projectContext } = body as {
      scopeNarrative?: string;
      squareFootage?: number;
      projectContext?: ProjectContext;
    };

    // Load room template
    const roomTemplate = await prisma.roomTemplate.findUnique({
      where: { id: original.roomTemplateId ?? undefined },
      include: {
        tradeGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              include: { catalogItem: true },
            },
          },
        },
      },
    });
    if (!roomTemplate) {
      return NextResponse.json({ error: "Room template not found" }, { status: 404 });
    }

    const companyContext = await prisma.companyContext.findFirst();
    if (!companyContext) {
      return NextResponse.json({ error: "Company context not configured" }, { status: 500 });
    }

    // We need a scope — either updated or extracted from the original rawResponse
    const scope = updatedScope ?? "Full renovation per template defaults";

    const catalogItems = roomTemplate.tradeGroups
      .flatMap((g) => g.items)
      .map((i) => i.catalogItem)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Load room dimensions from database
    const room = await prisma.room.findUnique({
      where: { id: original.sectionId },
      select: { lengthFt: true, widthFt: true, ceilingHeightFt: true, lengthIn: true, widthIn: true, ceilingHeightIn: true },
    });

    let roomDimensions: RoomDimensions | undefined;
    if (room) {
      const lFt = (room.lengthFt ?? 0) + (room.lengthIn ?? 0) / 12;
      const wFt = (room.widthFt ?? 0) + (room.widthIn ?? 0) / 12;
      const cFt = (room.ceilingHeightFt && room.ceilingHeightFt > 0)
        ? room.ceilingHeightFt
        : (room.ceilingHeightIn && room.ceilingHeightIn > 0)
          ? room.ceilingHeightIn / 12
          : 0;
      roomDimensions = {
        lengthFt: lFt > 0 ? lFt : undefined,
        widthFt: wFt > 0 ? wFt : undefined,
        ceilingHeightFt: cFt > 0 ? cFt : undefined,
      };
    }

    const userPrompt = buildUserPrompt(
      roomTemplate,
      companyContext,
      scope,
      squareFootage,
      projectContext,
      roomDimensions,
    );

    const response = await streamClaude({
      max_tokens: 64000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!rawText) {
      return NextResponse.json({ error: "Empty response from Claude API" }, { status: 502 });
    }

    if (response.stop_reason === "max_tokens") {
      // eslint-disable-next-line no-console
      console.warn("[ai-estimate/regenerate] Response truncated (max_tokens) — attempting repair parse");
    }

    const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

    // Strip any project-overhead ([ADM]) lines the AI mis-placed in this room —
    // permits, ARB/HOA review, supervision, etc. belong in the project COPE.
    stripProjectOverheadFromRoom(parsedEstimate);

    // Apply HHI's margin policy (materials at cost, labor at 60%) to AI-derived
    // lines before persisting — keeps regenerated estimates consistent with the
    // initial-generation path.
    applyMarginPolicy(parsedEstimate);

    // Calculate price ranges
    const lowPct = companyContext.priceRangeLowPct ?? -10;
    const highPct = companyContext.priceRangeHighPct ?? 10;

    // Create NEW estimate (never overwrite)
    const estimate = await prisma.aIEstimate.create({
      data: {
        projectId: original.projectId,
        sectionId: original.sectionId,
        ...(original.roomTemplateId
          ? { roomTemplateId: original.roomTemplateId }
          : {}),
        status: "draft",
        totalCost: parsedEstimate.totalCost,
        totalPrice: parsedEstimate.totalPrice,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        rawResponse: rawText,
        lineItems: {
          create: parsedEstimate.items.map((item, index) => {
            const range = calcItemPriceRange(item.totalPrice, item.source, lowPct, highPct);
            return {
              ...(item.catalogItemId
                ? { catalogItem: { connect: { id: item.catalogItemId } } }
                : {}),
              tradeGroup: item.tradeGroup,
              name: item.name,
              description: item.notes,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
              unitPrice: item.unitPrice,
              totalCost: item.totalCost,
              totalPrice: item.totalPrice,
              totalPriceLow: range.totalPriceLow,
              totalPriceHigh: range.totalPriceHigh,
              source: item.source,
              confidence: item.confidence,
              notes: item.notes,
              sortOrder: index,
            };
          }),
        },
      },
      include: { lineItems: true },
    });

    return NextResponse.json({
      estimate,
      warnings: parsedEstimate.warnings,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] regenerate error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

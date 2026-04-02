import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { SYSTEM_PROMPT, buildUserPrompt, type ProjectContext, type RoomDimensions } from "@/app/lib/ai-estimate-prompt";
import { parseEstimateResponse } from "@/app/lib/ai-estimate-parser";
import { getAnthropicApiKey } from "@/app/integrations/anthropic";
import { calcItemPriceRange } from "@/app/lib/price-range";

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
      const cFt = (room.ceilingHeightFt ?? 0) + (room.ceilingHeightIn ?? 0) / 12;
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

    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings > Integrations" }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
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
      return NextResponse.json(
        { error: "AI response was truncated (max_tokens reached). Try a narrower scope." },
        { status: 502 },
      );
    }

    const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

    // Calculate price ranges
    const lowPct = companyContext.priceRangeLowPct ?? -10;
    const highPct = companyContext.priceRangeHighPct ?? 10;

    // Create NEW estimate (never overwrite)
    const estimate = await prisma.aIEstimate.create({
      data: {
        projectId: original.projectId,
        sectionId: original.sectionId,
        ...(original.roomTemplateId
          ? { roomTemplate: { connect: { id: original.roomTemplateId } } }
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

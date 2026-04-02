import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { SYSTEM_PROMPT, buildUserPrompt, getCorrectionHistory, type ProjectContext, type RoomDimensions } from "@/app/lib/ai-estimate-prompt";
import { parseEstimateResponse } from "@/app/lib/ai-estimate-parser";
import { getAnthropicApiKey } from "@/app/integrations/anthropic";
import { calcItemPriceRange } from "@/app/lib/price-range";

// ---------- POST — Generate a new AI estimate ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { projectId, sectionId, roomTemplateId, scopeNarrative, squareFootage, projectContext } =
      body as {
        projectId: string;
        sectionId: string;
        roomTemplateId: string;
        scopeNarrative: string;
        squareFootage?: number;
        projectContext?: ProjectContext;
      };

    if (!projectId || !sectionId || !roomTemplateId || !scopeNarrative) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, sectionId, roomTemplateId, scopeNarrative" },
        { status: 400 },
      );
    }

    // Load room template with trade groups, items, and catalog prices
    const roomTemplate = await prisma.roomTemplate.findUnique({
      where: { id: roomTemplateId },
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

    // Load company context singleton
    const companyContext = await prisma.companyContext.findFirst();
    if (!companyContext) {
      return NextResponse.json({ error: "Company context not configured" }, { status: 500 });
    }

    // Collect all catalog items from the template for parser validation
    const catalogItems = roomTemplate.tradeGroups
      .flatMap((g) => g.items)
      .map((i) => i.catalogItem)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Load room dimensions from database
    const room = await prisma.room.findUnique({
      where: { id: sectionId },
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

    // Fetch correction history for this room template (feedback loop)
    const correctionHistory = roomTemplateId
      ? await getCorrectionHistory(roomTemplateId)
      : null;

    // Build prompt
    const userPrompt = buildUserPrompt(
      roomTemplate,
      companyContext,
      scopeNarrative,
      squareFootage,
      projectContext,
      roomDimensions,
      correctionHistory,
    );

    // Call Claude API
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

    // Extract text from response
    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!rawText) {
      return NextResponse.json({ error: "Empty response from Claude API" }, { status: 502 });
    }

    // Check for truncation
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "AI response was truncated (max_tokens reached). Try a narrower scope." },
        { status: 502 },
      );
    }

    // Parse and validate
    const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

    // Calculate price ranges
    const lowPct = companyContext.priceRangeLowPct ?? -10;
    const highPct = companyContext.priceRangeHighPct ?? 10;

    // Store estimate with line items
    const estimate = await prisma.aIEstimate.create({
      data: {
        projectId,
        sectionId,
        roomTemplate: { connect: { id: roomTemplateId } },
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

    // Track AI-priced items as catalog suggestions
    const aiPricedItems = estimate.lineItems.filter((li) => li.source === "AI_PRICED");
    for (const item of aiPricedItems) {
      try {
        await prisma.catalogSuggestion.upsert({
          where: { itemName: item.name },
          create: {
            itemName: item.name,
            tradeGroup: item.tradeGroup,
            suggestedUnit: item.unit,
            avgUnitPrice: item.unitPrice,
            avgUnitCost: item.unitCost,
            occurrenceCount: 1,
          },
          update: {
            occurrenceCount: { increment: 1 },
            tradeGroup: item.tradeGroup,
            suggestedUnit: item.unit,
            // Running average: newAvg = ((oldAvg * (count-1)) + newValue) / count
            // We handle this with a raw update below since Prisma doesn't support computed fields
          },
        });
        // Recalculate running averages using raw query for accuracy
        await prisma.$executeRaw`
          UPDATE "CatalogSuggestion"
          SET "avgUnitPrice" = (("avgUnitPrice" * ("occurrenceCount" - 1)) + ${item.unitPrice}) / "occurrenceCount",
              "avgUnitCost" = (("avgUnitCost" * ("occurrenceCount" - 1)) + ${item.unitCost}) / "occurrenceCount"
          WHERE "itemName" = ${item.name} AND "occurrenceCount" > 1
        `;
      } catch {
        // Non-critical — don't fail the estimate if suggestion tracking fails
      }
    }

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
    console.error("[ai-estimate] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- GET — Retrieve latest estimate for project/section ----------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const sectionId = searchParams.get("sectionId");

    if (!projectId || !sectionId) {
      return NextResponse.json(
        { error: "Missing required query params: projectId, sectionId" },
        { status: 400 },
      );
    }

    const estimate = await prisma.aIEstimate.findFirst({
      where: { projectId, sectionId },
      orderBy: { createdAt: "desc" },
      include: {
        lineItems: {
          orderBy: { sortOrder: "asc" },
          include: { catalogItem: true },
        },
      },
    });

    return NextResponse.json({ estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-estimate] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

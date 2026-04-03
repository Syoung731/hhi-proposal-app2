import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { getProjectAggregateData } from "@/app/lib/cope-aggregate-data";
import { COPE_SYSTEM_PROMPT, buildCopeUserPrompt } from "@/app/lib/cope-estimate-prompt";
import { parseEstimateResponse } from "@/app/lib/ai-estimate-parser";
import { getAnthropicApiKey } from "@/app/integrations/anthropic";
import { calcItemPriceRange } from "@/app/lib/price-range";
import { recomputeInvestmentRollups } from "@/app/lib/investment-rollup";

// ---------- POST — Generate a COPE estimate ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { projectId } = body as { projectId: string };
    if (!projectId) {
      return NextResponse.json({ error: "Missing required field: projectId" }, { status: 400 });
    }

    // Find the COPE room for this project
    const copeRoom = await prisma.room.findFirst({
      where: { projectId, isProjectOverhead: true },
    });
    if (!copeRoom) {
      return NextResponse.json(
        { error: "No COPE room found for this project." },
        { status: 400 },
      );
    }

    // Load the COPE template with trade groups, items, and catalog items
    const copeTemplate = await prisma.roomTemplate.findFirst({
      where: { isProjectOverhead: true, active: true },
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
    if (!copeTemplate) {
      return NextResponse.json(
        { error: "No active COPE template found." },
        { status: 500 },
      );
    }

    // Load company context
    const companyContext = await prisma.companyContext.findFirst();
    if (!companyContext) {
      return NextResponse.json(
        { error: "Company context not configured" },
        { status: 500 },
      );
    }

    // Load project ceiling height + projectQA for effective SF and clarifications
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { defaultCeilingHeightFt: true, projectQA: true },
    });

    // Gather aggregate project data
    const aggregateData = await getProjectAggregateData(
      projectId,
      project?.defaultCeilingHeightFt,
    );
    if (aggregateData.roomsWithEstimates === 0) {
      return NextResponse.json(
        { error: "Generate room estimates first before generating COPE." },
        { status: 400 },
      );
    }

    // Collect all catalog items from the COPE template for parser validation
    const catalogItems = copeTemplate.tradeGroups
      .flatMap((g) => g.items)
      .map((i) => i.catalogItem)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Build prompts
    const systemPrompt = COPE_SYSTEM_PROMPT;
    const projectQA = project?.projectQA as import("@/app/lib/cope-estimate-prompt").ProjectQAData | null;
    const userPrompt = buildCopeUserPrompt(aggregateData, copeTemplate, companyContext, projectQA);

    // Call Claude API
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured — add it in Settings > Integrations" },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      temperature: 0.2,
      system: systemPrompt,
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

    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "AI response was truncated (max_tokens reached)." },
        { status: 502 },
      );
    }

    // Parse and validate using the existing parser
    const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

    // Calculate price ranges
    const lowPct = companyContext.priceRangeLowPct ?? -10;
    const highPct = companyContext.priceRangeHighPct ?? 10;

    // Store estimate with line items
    const estimate = await prisma.aIEstimate.create({
      data: {
        projectId,
        sectionId: copeRoom.id,
        roomTemplate: { connect: { id: copeTemplate.id } },
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

    // Trigger investment rollup
    await recomputeInvestmentRollups(projectId);

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
          },
        });
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
      aggregateData: {
        totalEstimatedPrice: aggregateData.totalEstimatedPrice,
        roomCount: aggregateData.roomCount,
        roomsWithEstimates: aggregateData.roomsWithEstimates,
      },
      warnings: parsedEstimate.warnings,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cope-estimate] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------- GET — Retrieve latest COPE estimate ----------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required query param: projectId" },
        { status: 400 },
      );
    }

    // Find the COPE room
    const copeRoom = await prisma.room.findFirst({
      where: { projectId, isProjectOverhead: true },
      select: { id: true },
    });

    if (!copeRoom) {
      return NextResponse.json({ estimate: null });
    }

    // Find the latest estimate for the COPE room
    const estimate = await prisma.aIEstimate.findFirst({
      where: { projectId, sectionId: copeRoom.id },
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
    console.error("[cope-estimate] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

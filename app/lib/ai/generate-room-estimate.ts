import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { AIEstimate, EstimateLineItem } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import {
  SYSTEM_PROMPT,
  buildUserPromptParts,
  getCorrectionHistory,
  type ProjectContext,
  type RoomDimensions,
  type ScopeQAData,
} from "@/app/lib/ai-estimate-prompt";
import { parseEstimateResponse } from "@/app/lib/ai-estimate-parser";
import { streamClaude } from "@/app/lib/ai/model";
import { calcItemPriceRange } from "@/app/lib/price-range";
import { getEffectiveRoomMetrics } from "@/app/lib/effective-room-sf";
import { classifyRoomForDetail } from "@/app/lib/room-classification";

/**
 * Single-room AI estimate generation — the core pipeline shared between
 * the synchronous `/api/ai-estimate` route and the Phase 8B QStash worker.
 *
 * The service is I/O-heavy but has no request/response coupling: callers
 * pass the inputs in, get the persisted estimate back. All side effects
 * (AIEstimate row, EstimateLineItem rows, Room.estimateStaleReason clear,
 * CatalogSuggestion upsert) happen atomically per-room.
 */

export type EstimateWithLineItems = AIEstimate & { lineItems: EstimateLineItem[] };

export interface GenerateRoomEstimateInput {
  projectId: string;
  sectionId: string; // aka roomId
  roomTemplateId: string;
  scopeNarrative: string;
  squareFootage?: number;
  projectContext?: ProjectContext;
}

export interface GenerateRoomEstimateResult {
  estimate: EstimateWithLineItems;
  warnings: string[];
  usage: { promptTokens: number; completionTokens: number };
}

/**
 * Typed error so the HTTP wrapper can map to an appropriate status code
 * without resorting to string-matching on error messages.
 *
 * - `NOT_FOUND`     — roomTemplate / room / project id didn't resolve
 * - `MISCONFIGURED` — companyContext / template data is missing/invalid
 * - `UPSTREAM`      — Claude returned an empty response
 */
export class GenerateRoomEstimateError extends Error {
  readonly code: "NOT_FOUND" | "MISCONFIGURED" | "UPSTREAM";
  constructor(code: "NOT_FOUND" | "MISCONFIGURED" | "UPSTREAM", message: string) {
    super(message);
    this.code = code;
    this.name = "GenerateRoomEstimateError";
  }
}

export async function generateRoomEstimate(
  input: GenerateRoomEstimateInput,
): Promise<GenerateRoomEstimateResult> {
  const {
    projectId,
    sectionId,
    roomTemplateId,
    scopeNarrative,
    squareFootage,
    projectContext,
  } = input;

  // ---------- Load room template + catalog ----------

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
    throw new GenerateRoomEstimateError("NOT_FOUND", "Room template not found");
  }

  // ---------- Load company context ----------

  const companyContext = await prisma.companyContext.findFirst();
  if (!companyContext) {
    throw new GenerateRoomEstimateError(
      "MISCONFIGURED",
      "Company context not configured",
    );
  }

  const catalogItems = roomTemplate.tradeGroups
    .flatMap((g) => g.items)
    .map((i) => i.catalogItem)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // ---------- Load room + project for dimensions / metrics / QA ----------

  const room = await prisma.room.findUnique({
    where: { id: sectionId },
    select: {
      name: true,
      lengthFt: true,
      widthFt: true,
      ceilingHeightFt: true,
      lengthIn: true,
      widthIn: true,
      ceilingHeightIn: true,
      scopeQA: true,
      roomDetail: true,
      sectionType: { select: { name: true } },
    },
  });

  let roomDimensions: RoomDimensions | undefined;
  if (room) {
    const lFt = (room.lengthFt ?? 0) + (room.lengthIn ?? 0) / 12;
    const wFt = (room.widthFt ?? 0) + (room.widthIn ?? 0) / 12;
    const cFt =
      room.ceilingHeightFt && room.ceilingHeightFt > 0
        ? room.ceilingHeightFt
        : room.ceilingHeightIn && room.ceilingHeightIn > 0
          ? room.ceilingHeightIn / 12
          : 0;
    roomDimensions = {
      lengthFt: lFt > 0 ? lFt : undefined,
      widthFt: wFt > 0 ? wFt : undefined,
      ceilingHeightFt: cFt > 0 ? cFt : undefined,
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { defaultCeilingHeightFt: true },
  });

  const roomMetrics = await getEffectiveRoomMetrics(
    sectionId,
    project?.defaultCeilingHeightFt,
  );

  const correctionHistory = roomTemplateId
    ? await getCorrectionHistory(roomTemplateId)
    : null;

  const scopeQA = room?.scopeQA as ScopeQAData | null;
  const roomDetail = room?.roomDetail as Record<string, unknown> | null;
  const roomDetailType = room
    ? classifyRoomForDetail(room.name, room.sectionType?.name)
    : null;

  // ---------- Build prompt parts (split for prompt caching) ----------

  const { dynamicBlock, staticBlock } = buildUserPromptParts(
    roomTemplate,
    companyContext,
    scopeNarrative,
    squareFootage,
    projectContext,
    roomDimensions,
    correctionHistory,
    roomMetrics,
    scopeQA,
    roomDetail,
    roomDetailType,
  );

  // ---------- Call Claude with prompt caching ----------
  //
  // Two cache breakpoints:
  //   (1) system prompt — identical for every call, cache is project-wide
  //   (2) static user block (template structure + catalog + JSON format) —
  //       identical across calls that share the same roomTemplate; hits when
  //       multiple rooms of a batch use the same template (e.g. several bath
  //       rooms running the "Bathroom" template).
  //
  // Dynamic content (company/project/room context, scope, QA, corrections)
  // stays OUTSIDE the cache breakpoint and is sent fresh each call.

  const response = await streamClaude({
    max_tokens: 64000,
    temperature: 0.2,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: staticBlock,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: dynamicBlock,
          },
        ],
      },
    ],
  });

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!rawText) {
    throw new GenerateRoomEstimateError(
      "UPSTREAM",
      "Empty response from Claude API",
    );
  }

  if (response.stop_reason === "max_tokens") {
    // eslint-disable-next-line no-console
    console.warn(
      "[generate-room-estimate] Response truncated (max_tokens) — attempting repair parse",
    );
  }

  const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

  // ---------- Persist estimate + line items ----------

  const lowPct = companyContext.priceRangeLowPct ?? -10;
  const highPct = companyContext.priceRangeHighPct ?? 10;

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
          const range = calcItemPriceRange(
            item.totalPrice,
            item.source,
            lowPct,
            highPct,
          );
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

  // Clear stale reason now that a fresh estimate has been generated
  await prisma.room.update({
    where: { id: sectionId },
    data: { estimateStaleReason: null },
  });

  // ---------- Track AI-priced items as catalog suggestions (atomic) ----------

  const aiPricedItems = estimate.lineItems.filter(
    (li) => li.source === "AI_PRICED",
  );
  for (const item of aiPricedItems) {
    try {
      await upsertCatalogSuggestion({
        itemName: item.name,
        tradeGroup: item.tradeGroup,
        suggestedUnit: item.unit,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
      });
    } catch {
      // Non-critical — don't fail the estimate if suggestion tracking fails.
    }
  }

  return {
    estimate,
    warnings: parsedEstimate.warnings,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    },
  };
}

/**
 * Atomic CatalogSuggestion upsert — combines insert / increment / running-avg
 * recompute into one SQL statement so concurrent workers (Phase 8B parallel
 * room processing) can't race on the average computation.
 *
 * Why a single statement instead of `prisma.catalogSuggestion.upsert` + a
 * second UPDATE: under parallel writers, the two-statement version can let
 * writer A's UPDATE read the row state AFTER writer B's increment has landed,
 * yielding incorrect averages. PostgreSQL holds a row lock across the
 * INSERT...ON CONFLICT DO UPDATE clause, so writers serialize deterministically.
 *
 * The `"CatalogSuggestion"."occurrenceCount"` ref reads the EXISTING row's
 * pre-update value; `EXCLUDED.*` refs read the attempted-INSERT values. The
 * new average = (oldAvg * oldCount + newValue) / (oldCount + 1).
 */
async function upsertCatalogSuggestion(params: {
  itemName: string;
  tradeGroup: string;
  suggestedUnit: string;
  unitPrice: number;
  unitCost: number;
}): Promise<void> {
  const { itemName, tradeGroup, suggestedUnit, unitPrice, unitCost } = params;
  const newId = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "CatalogSuggestion" (
      "id", "itemName", "tradeGroup", "suggestedUnit",
      "avgUnitPrice", "avgUnitCost", "occurrenceCount",
      "status", "createdAt", "updatedAt"
    ) VALUES (
      ${newId}, ${itemName}, ${tradeGroup}, ${suggestedUnit},
      ${unitPrice}, ${unitCost}, 1,
      'pending', NOW(), NOW()
    )
    ON CONFLICT ("itemName") DO UPDATE SET
      "avgUnitPrice"    = (COALESCE("CatalogSuggestion"."avgUnitPrice", 0) * "CatalogSuggestion"."occurrenceCount" + EXCLUDED."avgUnitPrice") / ("CatalogSuggestion"."occurrenceCount" + 1),
      "avgUnitCost"     = (COALESCE("CatalogSuggestion"."avgUnitCost",  0) * "CatalogSuggestion"."occurrenceCount" + EXCLUDED."avgUnitCost")  / ("CatalogSuggestion"."occurrenceCount" + 1),
      "occurrenceCount" = "CatalogSuggestion"."occurrenceCount" + 1,
      "tradeGroup"      = EXCLUDED."tradeGroup",
      "suggestedUnit"   = EXCLUDED."suggestedUnit",
      "updatedAt"       = NOW()
  `;
}

import Anthropic from "@anthropic-ai/sdk";
import type { AIEstimate, EstimateLineItem } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { streamClaude } from "@/app/lib/ai/model";
import { parseEstimateResponse } from "@/app/lib/ai-estimate-parser";
import { calcItemPriceRange } from "@/app/lib/price-range";
import { upsertCatalogSuggestion } from "@/app/lib/ai/catalog-suggestion-upsert";
import { getProjectAggregateData } from "@/app/lib/cope-aggregate-data";
import {
  COPE_SYSTEM_PROMPT,
  buildCopeUserPromptParts,
  type ProjectQAData,
} from "@/app/lib/cope-estimate-prompt";
import { recomputeInvestmentRollups } from "@/app/lib/investment-rollup";

/**
 * Project-level COPE generation — the single-threaded companion to Phase
 * 8B's per-room estimate service. One call per project; idempotency is
 * enforced via a row-level lock on `Project.copeStatus`.
 *
 * Callers:
 *   1. The synchronous `POST /api/cope-estimate` route (manual button).
 *   2. The QStash worker `/api/jobs/cope-generate` (auto-trigger on
 *      EstimateJob completion).
 *
 * Both paths share the same lock, so double-clicks, auto-trigger races,
 * and QStash retries all converge on a single in-flight generation.
 */

export type CopeEstimateWithLineItems = AIEstimate & { lineItems: EstimateLineItem[] };

export interface GenerateProjectOverheadInput {
  projectId: string;
}

export interface GenerateProjectOverheadResult {
  copeEstimateId: string;
  estimate: CopeEstimateWithLineItems;
  warnings: string[];
  usage: { promptTokens: number; completionTokens: number };
}

export type ProjectOverheadErrorCode =
  | "NOT_FOUND" // project / COPE room / COPE template missing
  | "MISCONFIGURED" // company context missing, no room estimates yet
  | "UPSTREAM" // Claude returned empty or truncated
  | "BUSY"; // another generation is already in-flight for this project

export class ProjectOverheadError extends Error {
  readonly code: ProjectOverheadErrorCode;
  constructor(code: ProjectOverheadErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProjectOverheadError";
  }
}

/**
 * Generate (or regenerate) the project-overhead estimate for a single project.
 *
 * Flow:
 *   1. Acquire the idempotency lock (conditional `updateMany`). Race-safe:
 *      two simultaneous callers cannot both transition IDLE/READY/FAILED → GENERATING.
 *   2. Build aggregate data from the latest `AIEstimate` per non-COPE room.
 *      Refuse with MISCONFIGURED if no room estimates exist.
 *   3. Stream Claude with prompt caching on the system prompt + static
 *      catalog block (same pattern as Phase 8B per-room).
 *   4. Persist a new `AIEstimate` on the project's COPE room, clear any
 *      prior `copeError`, set `copeStatus = READY`, `copeGeneratedAt = now`.
 *   5. `recomputeInvestmentRollups()` — COPE is the only place (besides
 *      direct room pricing edits + estimate acceptance) that drives this.
 *   6. On failure: mark `copeStatus = FAILED`, record `copeError`, rethrow
 *      as a `ProjectOverheadError` so the HTTP wrapper can map the code.
 */
export async function generateProjectOverhead(
  input: GenerateProjectOverheadInput,
): Promise<GenerateProjectOverheadResult> {
  const { projectId } = input;

  // ---------- (1) Acquire lock via conditional updateMany ----------
  //
  // `updateMany` returns `{ count }` and is atomic; if another writer has
  // already flipped the row to GENERATING we'll see count === 0 and bail
  // without racing. This is cheaper and safer than read-then-write.
  const locked = await prisma.project.updateMany({
    where: {
      id: projectId,
      copeStatus: { in: ["IDLE", "READY", "FAILED"] },
    },
    data: {
      copeStatus: "GENERATING",
      copeError: null,
    },
  });
  if (locked.count === 0) {
    // Either the project doesn't exist, or someone else holds the lock.
    // Disambiguate so the caller can map to 404 vs 409.
    const exists = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) {
      throw new ProjectOverheadError("NOT_FOUND", `Project ${projectId} not found`);
    }
    throw new ProjectOverheadError(
      "BUSY",
      "Project overhead is already generating for this project",
    );
  }

  try {
    // ---------- (2) Find the COPE room + template ----------

    const copeRoom = await prisma.room.findFirst({
      where: { projectId, isProjectOverhead: true },
    });
    if (!copeRoom) {
      throw new ProjectOverheadError(
        "NOT_FOUND",
        "No COPE room found for this project",
      );
    }

    const copeTemplate = await prisma.roomTemplate.findFirst({
      where: { isProjectOverhead: true, active: true },
      include: {
        tradeGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              // Drop items whose joined catalogItem is user-hidden. Unmatched items
              // (catalogItemId === null) pass through — same as before.
              where: {
                OR: [
                  { catalogItemId: null },
                  { catalogItem: { hidden: false } },
                ],
              },
              include: { catalogItem: true },
            },
          },
        },
      },
    });
    if (!copeTemplate) {
      throw new ProjectOverheadError(
        "MISCONFIGURED",
        "No active COPE template found",
      );
    }

    const companyContext = await prisma.companyContext.findFirst();
    if (!companyContext) {
      throw new ProjectOverheadError(
        "MISCONFIGURED",
        "Company context not configured",
      );
    }

    // ---------- (3) Aggregate project data ----------

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { defaultCeilingHeightFt: true, projectQA: true },
    });

    const aggregateData = await getProjectAggregateData(
      projectId,
      project?.defaultCeilingHeightFt,
    );
    if (aggregateData.roomsWithEstimates === 0) {
      throw new ProjectOverheadError(
        "MISCONFIGURED",
        "Generate room estimates first before generating COPE",
      );
    }

    const catalogItems = copeTemplate.tradeGroups
      .flatMap((g) => g.items)
      .map((i) => i.catalogItem)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // ---------- (4) Call Claude with prompt caching ----------
    //
    // Two cache breakpoints, same shape as per-room estimates:
    //   (a) system prompt — identical for every call
    //   (b) static user block (catalog + JSON format) — template-keyed, hits
    //       on project regeneration even if the dynamic aggregates changed.

    const projectQA = project?.projectQA as ProjectQAData | null;
    const { dynamicBlock, staticBlock } = buildCopeUserPromptParts(
      aggregateData,
      copeTemplate,
      companyContext,
      projectQA,
    );

    const response = await streamClaude({
      max_tokens: 64000,
      temperature: 0.2,
      system: [
        {
          type: "text",
          text: COPE_SYSTEM_PROMPT,
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
      throw new ProjectOverheadError(
        "UPSTREAM",
        "Empty response from Claude API",
      );
    }
    if (response.stop_reason === "max_tokens") {
      // COPE historically doesn't attempt a repair parse for truncation —
      // keep that contract. The user must regenerate.
      throw new ProjectOverheadError(
        "UPSTREAM",
        "AI response was truncated (max_tokens reached). Please retry.",
      );
    }

    const parsedEstimate = parseEstimateResponse(rawText, catalogItems);

    // ---------- (5) Persist + clear lock ----------

    const lowPct = companyContext.priceRangeLowPct ?? -10;
    const highPct = companyContext.priceRangeHighPct ?? 10;

    const estimate = await prisma.aIEstimate.create({
      data: {
        projectId,
        sectionId: copeRoom.id,
        roomTemplateId: copeTemplate.id,
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

    // Release the lock to READY.
    await prisma.project.update({
      where: { id: projectId },
      data: {
        copeStatus: "READY",
        copeGeneratedAt: new Date(),
        copeError: null,
      },
    });

    // Rollup investment totals (COPE is one of the three drivers — the
    // per-room estimate service intentionally does NOT call this).
    await recomputeInvestmentRollups(projectId);

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
      copeEstimateId: estimate.id,
      estimate,
      warnings: parsedEstimate.warnings,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  } catch (err) {
    // Release the lock to FAILED with a readable reason. Swallow any error
    // here (the release is best-effort — the original error is the thing
    // the caller cares about).
    const message = err instanceof Error ? err.message : String(err);
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          copeStatus: "FAILED",
          copeError: message.slice(0, 500),
        },
      });
    } catch {
      // No-op — lock release failure shouldn't mask the real error.
    }
    if (err instanceof ProjectOverheadError) throw err;
    // Wrap unknown errors so the HTTP wrapper has a stable code to map.
    throw new ProjectOverheadError("UPSTREAM", message);
  }
}

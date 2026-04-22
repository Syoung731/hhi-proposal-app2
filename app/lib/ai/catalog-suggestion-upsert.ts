import { randomUUID } from "node:crypto";
import { prisma } from "@/app/lib/prisma";

/**
 * Atomic `CatalogSuggestion` upsert — combines insert / occurrenceCount
 * increment / running-average recompute into one SQL statement so concurrent
 * writers (Phase 8B parallel room estimates, now also the Phase 8C COPE
 * service) cannot race on the average computation.
 *
 * Why a single statement instead of `prisma.catalogSuggestion.upsert` + a
 * second UPDATE: under parallel writers the two-statement version can let
 * writer A's UPDATE read the row state AFTER writer B's increment has
 * landed, yielding incorrect averages. PostgreSQL holds a row lock across
 * the INSERT...ON CONFLICT DO UPDATE clause, so writers serialize
 * deterministically on the unique `itemName` column.
 *
 * The `"CatalogSuggestion"."occurrenceCount"` ref reads the EXISTING row's
 * pre-update value; `EXCLUDED.*` refs read the attempted-INSERT values.
 * The new average = `(oldAvg * oldCount + newValue) / (oldCount + 1)`.
 *
 * `tradeGroup` and `suggestedUnit` are overwritten on conflict
 * (last-writer-wins). See `CLAUDE.md` > "CatalogSuggestion behavior".
 */
export async function upsertCatalogSuggestion(params: {
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

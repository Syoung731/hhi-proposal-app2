import type { CompanyContext, PricingCatalogItem, RoomTemplate, RoomTemplateTradeGroup, RoomTemplateItem } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import type { EffectiveRoomMetrics } from "@/app/lib/effective-room-sf";

// ---------- Types ----------

export interface ProjectContext {
  propertyType?: string;
  constructionEra?: string;
  existingCondition?: string;
  occupiedDuringWork?: boolean;
  specialConditions?: string;
}

export interface RoomDimensions {
  lengthFt?: number;
  widthFt?: number;
  ceilingHeightFt?: number;
}

type TradeGroupWithItems = RoomTemplateTradeGroup & {
  items: (RoomTemplateItem & { catalogItem: PricingCatalogItem | null })[];
};

type RoomTemplateWithDetails = RoomTemplate & {
  tradeGroups: TradeGroupWithItems[];
};

// ---------- System prompt ----------

const SYSTEM_PROMPT = `You are a construction estimating assistant for HHI Builders, a luxury residential renovation company on Hilton Head Island, SC. You generate detailed line-item budgets for individual rooms based on the scope of work.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no preamble.
2. For items that match the provided catalog, use the EXACT catalog item name and unitPrice. Do not modify catalog prices.
3. For items not in the catalog, estimate a price appropriate for the Hilton Head luxury second-home market.
4. Tag every item with a source:
   - "CATALOG" = matched to provided catalog, has real price
   - "AI_PRICED" = not in catalog, you estimated the price
   - "ALLOWANCE" = catalog item exists but has $0 unitPrice (this is a client selection/allowance item — estimate a market-appropriate price for the specified finish tier)

5. For ALLOWANCE items ($0 in catalog): estimate based on finish tier.
   Examples for high-end tier:
   - Kitchen faucet: $400-600 (Brizo/Kohler tier)
   - Bathroom faucet: $250-450
   - Toilet: $400-700 (Kohler/TOTO comfort height)
   - Appliance range: $2,500-5,000
   - Appliance refrigerator: $2,500-4,500
   - Floor tile material: $8-15/SF
   - Shower wall tile: $12-20/SF
   - Backsplash tile: $15-25/SF
   - Cabinet hardware: $8-15/EA
   - Pendant light: $250-500/EA
   - Vanity light: $150-350/EA
   - Window: $400-800/EA
   Include a note stating the assumed product quality level.

6. Include quantities based on square footage and scope description.
7. Organize items by trade group following the template structure.
8. Include all items realistically needed for the scope. Do NOT include items clearly outside the scope.
9. Include a confidence score (0.0-1.0):
   - CATALOG items with real prices: 0.95
   - ALLOWANCE items (estimated from $0): 0.3-0.5
   - AI_PRICED items: 0.5-0.8 depending on how standard the item is

10. For unit costs: catalog items have unitCost (our cost) and unitPrice (client price). The markup is already built into catalog prices — do NOT add additional markup. For AI_PRICED and ALLOWANCE items, estimate both unitCost and unitPrice with a similar markup ratio as catalog items in the same trade.

JUSTIFICATION REQUIRED: For EVERY line item, the "notes" field must explain:
- WHY this item is included (reference the specific scope text that requires it)
- HOW the quantity was calculated (show the math)
- If the item is NOT explicitly mentioned in the scope, explain why it is structurally or code-required for the work described
Good notes example: "Scope says gut to studs. 48 SF room, 9 ft ceilings, walls = 2*(8+6)*9 = 252 SF minus 21 SF door = 231 SF walls + 48 SF ceiling = 279 SF total drywall"
Bad notes example: "Based on room size" or "Standard for renovation" — these are NOT acceptable.

SCOPE DISCIPLINE: Read the scope of work carefully.
- If the scope says "all other fixtures to remain" then do NOT include replacement items for those fixtures.
- If the scope says "rebuild shower" then only include shower-related items, not full bathroom renovation items.
- If you include an item not explicitly in the scope, you MUST justify it as structurally required, code-required, or necessary for proper tie-in.
- When in doubt, DO NOT include the item. It is better to undercount than to add items outside the stated scope.

PROJECT OVERHEAD EXCLUSION: Do NOT include any of the following project-level overhead items in room estimates. These are handled separately in a project-wide COPE (Cost of Project Execution) budget:
- Building permits or permit fees of any kind
- HOA fees or HOA review costs
- Project supervision or site supervision hours
- Dumpster loads or waste removal
- Port-o-let rental
- Content protection (Ram Board, plastic sheeting, masking, cardboard)
- Final construction cleaning
- Construction drawings or final drawings
- Content manipulation (move out/reset, off-site storage)
- Privacy screening around dumpsters
- Any item with trade prefix [ADM] that is project-wide rather than room-specific
If a catalog item from the COPE template appears in the room template's trade groups, skip it entirely — it will be estimated at the project level.

QUANTITY CALCULATION RULES — MANDATORY:
  The Room Details section above contains PRE-CALCULATED values for floor area, wall area, ceiling area, total drywall, and perimeter. You MUST use these exact numbers:

  - FLOOR TILE / FLOORING: Use the pre-calculated floor area exactly. This already includes sub-areas (e.g., water closet). Do NOT reduce this number.
  - WALLS / DRYWALL: Use the pre-calculated wall area. For full gut ("to studs" or "gut"), total drywall = pre-calculated wall area + ceiling area. Deduct door openings (21 SF each) and window openings (12 SF each) from the wall area for paint calculations.
  - CEILING: Use the pre-calculated ceiling area (same as floor area).
  - PAINT: Use the pre-calculated wall area minus tiled surfaces. Add ceiling area if ceiling is being painted.
  - BASEBOARD / TRIM: Use the pre-calculated perimeter in LF.
  - DEMO: Match demo quantities to the surfaces being removed. If "full gut" or "to studs", demo quantities should match the corresponding new-work quantities.

  DO NOT calculate your own wall area, floor area, or perimeter. The pre-calculated values account for room dimensions, sub-areas, and ceiling height. Use them directly.

  If a pre-calculated value is missing (null), then estimate based on the scope description, but explain your reasoning in the notes.

FLOOR TILE SPECIAL RULE:
  Floor tile quantity MUST equal the pre-calculated floor area UNLESS:
  - The scope explicitly says partial flooring (e.g., "tile only in the wet area")
  - The shower footprint is being subtracted (shower has its own floor tile)
  If subtracting shower footprint: floor tile = room SF - shower pan SF. Show this math in notes.
  If no exclusions apply: floor tile = room SF exactly. Do not reduce it.

SHOWER TILE CALCULATIONS:
  When the scope includes shower tile work:
  1. Identify the shower pan dimensions from the scope or estimate the shower footprint
  2. Shower wall tile SF = (wall1_width + wall2_width + wall3_width) x wall_height
     - Typically 3 walls (the 4th wall has the door/glass)
     - Wall height is usually 8 feet for shower walls (floor to ceiling) unless specified otherwise
     - Example: 4ft x 6ft shower pan = (4 + 6 + 4) x 8 = 112 SF of wall tile
  3. Shower floor tile SF = shower pan area (e.g., 4 x 6 = 24 SF)
  4. ALWAYS include BOTH shower wall tile AND shower floor tile as separate line items
  5. Show the shower dimensions and math in the notes for EVERY shower tile line item

MATERIAL AND INSTALLATION PAIRING — MANDATORY:
  For EVERY material item, there MUST be a corresponding installation item, and vice versa. Common pairs:
  - Countertop stone material ↔ Countertop stone installation
  - Floor tile material ↔ Floor tile installation
  - Shower wall tile material ↔ Shower wall tile installation
  - Shower floor tile material ↔ Shower floor tile installation (MUST be included)
  - Cabinet material ↔ Cabinet installation
  - Vanity light material ↔ Vanity light installation
  - Faucet material ↔ Faucet installation

  If you include a material item without an installation pair (or vice versa), the estimate is INCOMPLETE.

  OUTPUT ORDER: Within each trade group, output material items IMMEDIATELY followed by their installation pair:
    [TIL] Shower Wall Tile - Material
    [TIL] Shower Wall Tile - Install
    [TIL] Shower Floor Tile - Material
    [TIL] Shower Floor Tile - Install

  Do NOT group all materials together then all installations. Alternate: material, install, material, install.

COUNTERTOP SPECIAL RULE:
  If the estimate includes countertop installation (e.g., "Countertop - Stone - Install"), it MUST also include a countertop material allowance (e.g., "Countertop - Quartz - Material" or "Countertop - Stone - Material").
  - If the catalog has a countertop material item with $0 price: tag as ALLOWANCE and estimate based on finish tier (high-end: $75-$125 per SF for quartz/granite)
  - The material quantity should match the installation quantity (both in SF or LF)

FRAMING AND STRUCTURAL ITEMS:
  For any framing or structural line item, the notes MUST explain:
  - What specific framing work is needed and why (reference the scope)
  - What is being removed vs what is being added
  - Quantities must be justified (e.g., "remove 10 LF of wall framing to reconfigure shower entry")

  For joist work specifically:
  - HHI Builders typically replaces compromised joists or sisters the entire subfloor run, not individual joists
  - If scope mentions joist repair: include "Joist sistering/replacement" as a lump-sum or per-joist item
  - Note in the description: "Sister or replace as needed per field conditions — quantity is an estimate"`;

// ---------- Correction history for feedback loop ----------

export async function getCorrectionHistory(roomTemplateId: string): Promise<string | null> {
  const corrections = await prisma.priceCorrection.findMany({
    where: { roomTemplateId },
    select: {
      catalogItemName: true,
      field: true,
      originalValue: true,
      correctedValue: true,
    },
  });

  if (corrections.length === 0) return null;

  // Group by catalogItemName + field
  const groups = new Map<string, { count: number; avgOriginal: number; avgCorrected: number; name: string; field: string }>();

  for (const c of corrections) {
    const key = `${c.catalogItemName ?? "unknown"}|${c.field}`;
    const existing = groups.get(key);
    if (existing) {
      const newCount = existing.count + 1;
      existing.avgOriginal = ((existing.avgOriginal * existing.count) + c.originalValue) / newCount;
      existing.avgCorrected = ((existing.avgCorrected * existing.count) + c.correctedValue) / newCount;
      existing.count = newCount;
    } else {
      groups.set(key, {
        count: 1,
        avgOriginal: c.originalValue,
        avgCorrected: c.correctedValue,
        name: c.catalogItemName ?? "unknown",
        field: c.field,
      });
    }
  }

  // Sort by count descending, take top 20
  const sorted = Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const lines = sorted.map((g) => {
    if (g.field === "removed") {
      return `- ${g.name}: item was removed from estimate (${g.count} time${g.count > 1 ? "s" : ""}) — likely not needed for this scope type`;
    }
    if (g.field === "added") {
      return `- ${g.name}: item was manually added to estimate (${g.count} time${g.count > 1 ? "s" : ""}) — consider including it`;
    }
    const unit = g.field === "quantity" ? "" : "$";
    const suffix = g.field === "quantity" ? "" : "";
    return `- ${g.name}: ${g.field} was corrected from ${unit}${Math.round(g.avgOriginal)}${suffix} to ${unit}${Math.round(g.avgCorrected)}${suffix} (${g.count} time${g.count > 1 ? "s" : ""})`;
  });

  return `## Historical Corrections (from past estimates)
The following adjustments were made by estimators on previous estimates using
this room template. Use these as guidance for your quantities and pricing:

${lines.join("\n")}`;
}

// ---------- Token budget helpers ----------

const MAX_CATALOG_TOKENS = 4000;
const TOKENS_PER_LINE = 30;

function filterTradeGroupsByScope(
  tradeGroups: TradeGroupWithItems[],
  scopeNarrative: string,
): TradeGroupWithItems[] {
  const totalItemLines = tradeGroups.reduce((n, g) => n + g.items.length, 0);
  if (totalItemLines * TOKENS_PER_LINE <= MAX_CATALOG_TOKENS) return tradeGroups;

  const scopeLower = scopeNarrative.toLowerCase();
  const filtered = tradeGroups.filter((g) => {
    const gName = g.name.toLowerCase();
    return scopeLower.includes(gName) || gName === "general conditions";
  });
  // If filtering removed everything, return all (safety net)
  return filtered.length > 0 ? filtered : tradeGroups;
}

// ---------- Dimension helpers ----------

function calcDimensions(
  squareFootage?: number,
  roomDimensions?: RoomDimensions,
): {
  lengthFt: number | null;
  widthFt: number | null;
  ceilingHeightFt: number;
  wallLinearFt: number | null;
  wallAreaSf: number | null;
} {
  const lengthFt = roomDimensions?.lengthFt ?? null;
  const widthFt = roomDimensions?.widthFt ?? null;
  const ceilingHeightFt = roomDimensions?.ceilingHeightFt ?? 9; // default 9 ft

  let wallLinearFt: number | null = null;
  let wallAreaSf: number | null = null;

  if (lengthFt != null && widthFt != null && lengthFt > 0 && widthFt > 0) {
    wallLinearFt = 2 * (lengthFt + widthFt);
    wallAreaSf = wallLinearFt * ceilingHeightFt;
  }

  return { lengthFt, widthFt, ceilingHeightFt, wallLinearFt, wallAreaSf };
}

// ---------- User prompt builder ----------

export function buildUserPrompt(
  roomTemplate: RoomTemplateWithDetails,
  companyContext: CompanyContext,
  scopeNarrative: string,
  squareFootage?: number,
  projectContext?: ProjectContext,
  roomDimensions?: RoomDimensions,
  correctionHistory?: string | null,
  roomMetrics?: EffectiveRoomMetrics | null,
): string {
  const activeTradeGroups = roomTemplate.tradeGroups.map((g) => ({
    ...g,
    items: g.items.filter((item) => item.isActive !== false),
  })).filter((g) => g.items.length > 0);
  const groups = filterTradeGroupsByScope(activeTradeGroups, scopeNarrative);

  const catalogSection = groups
    .map((g) => {
      const items = g.items
        .map((item) => {
          const cat = item.catalogItem;
          const name = cat?.name ?? item.name;
          const unit = cat?.unit ?? "EA";
          const unitCost = cat?.unitCost ?? 0;
          const unitPrice = cat?.unitPrice ?? 0;
          const tag = unitPrice === 0 ? " [ALLOWANCE - ESTIMATE PRICE]" : "";
          return `  - ${name} | Unit: ${unit} | UnitCost: $${unitCost} | UnitPrice: $${unitPrice}${tag}`;
        })
        .join("\n");
      return `### ${g.name}\n${items}`;
    })
    .join("\n\n");

  // Compute dimensions (fallback if no roomMetrics)
  const dims = calcDimensions(squareFootage, roomDimensions);
  const dimLine = dims.lengthFt != null && dims.widthFt != null
    ? `${dims.lengthFt} ft x ${dims.widthFt} ft`
    : "Not provided";
  const roomCeilingProvided = roomDimensions?.ceilingHeightFt != null && roomDimensions.ceilingHeightFt > 0;

  // Estimation assumptions section
  const assumptionsSection = companyContext.estimationAssumptions
    ? `\n## Estimation Assumptions\n${companyContext.estimationAssumptions}\n`
    : "";

  return `Generate a detailed line-item budget for this room.

## Company Context
- Market: ${companyContext.market}
${companyContext.marketNotes ? `- ${companyContext.marketNotes}` : ""}
- Client Profile: ${companyContext.clientProfile ?? "Luxury second-home owners"}
- Finish Tier: ${companyContext.defaultFinishTier}
${companyContext.standardInclusions ? `- Standard Inclusions: ${companyContext.standardInclusions}` : ""}
${companyContext.markupStructure ? `- Markup Notes: ${companyContext.markupStructure}` : ""}
${assumptionsSection}
## Project Context
- Property Type: ${projectContext?.propertyType ?? "Single Family"}
- Construction Era: ${projectContext?.constructionEra ?? "Unknown"}
- Existing Condition: ${projectContext?.existingCondition ?? "Unknown"}
- Occupied During Work: ${projectContext?.occupiedDuringWork ? "Yes" : "No"}
- Special Conditions: ${projectContext?.specialConditions ?? "None"}

## Room Details
Room Type: ${roomTemplate.displayName ?? roomTemplate.name}
Square Footage: ${roomMetrics ? `${roomMetrics.effectiveSqFt} SF (base room ${roomMetrics.baseSqFt} SF + sub-areas ${roomMetrics.subAreaSqFt} SF)` : squareFootage ?? "Not specified — estimate based on scope"}
Dimensions: ${dimLine}
Ceiling Height: ${roomMetrics ? `${roomMetrics.ceilingHeightFt} ft${roomCeilingProvided ? "" : " (defaulted — not specified on room)"}` : roomDimensions?.ceilingHeightFt ? `${roomDimensions.ceilingHeightFt} ft` : "Not provided — assume 9 ft per standard assumptions"}
Perimeter: ${roomMetrics ? `${roomMetrics.effectivePerimeterLF} LF (base room ${roomMetrics.basePerimeterLF} LF + sub-area perimeters)` : "Not available"}
Wall Area: ${roomMetrics?.wallSF != null ? `${roomMetrics.wallSF} SF (perimeter ${roomMetrics.effectivePerimeterLF} LF x ceiling ${roomMetrics.ceilingHeightFt} ft)` : "Not available"}
Ceiling Area: ${roomMetrics ? `${roomMetrics.effectiveSqFt} SF (same as floor area)` : "Not available"}
${roomMetrics ? `
PRE-CALCULATED VALUES — USE THESE EXACT NUMBERS:
  - Floor area: ${roomMetrics.effectiveSqFt} SF
  - Wall area (before door/window deductions): ${roomMetrics.wallSF ?? "N/A"} SF
  - Ceiling area: ${roomMetrics.effectiveSqFt} SF
  - Total drywall (walls + ceiling, full gut): ${(roomMetrics.wallSF ?? 0) + roomMetrics.effectiveSqFt} SF
  - Baseboard/trim perimeter: ${roomMetrics.effectivePerimeterLF} LF` : ""}

## Scope of Work
${scopeNarrative}
${correctionHistory ? `\n${correctionHistory}\n` : ""}
## Room Template Structure
This room uses the "${roomTemplate.displayName ?? roomTemplate.name}" template with these trade groups and available catalog items. Items with unitPrice of $0 are ALLOWANCE items — estimate appropriate prices for the finish tier.

${catalogSection}

## Required JSON Output Format
Return ONLY this JSON structure:
{
  "roomType": "${roomTemplate.displayName ?? roomTemplate.name}",
  "estimatedTotalPrice": 45000,
  "tradeGroups": [
    {
      "name": "Demo",
      "items": [
        {
          "name": "[DMO] Remove Flooring Hardwood",
          "catalogMatch": true,
          "source": "CATALOG",
          "quantity": 150,
          "unit": "SF",
          "unitCost": 3.00,
          "unitPrice": 7.50,
          "totalPrice": 1125.00,
          "confidence": 0.95,
          "notes": "Scope says full gut. Floor area = 150 SF provided square footage. Removing existing hardwood per scope."
        },
        {
          "name": "[PLM] Kitchen Faucet - Material",
          "catalogMatch": true,
          "source": "ALLOWANCE",
          "quantity": 1,
          "unit": "EA",
          "unitCost": 280,
          "unitPrice": 450,
          "totalPrice": 450,
          "confidence": 0.4,
          "notes": "Allowance — assumed high-end pull-down faucet (Brizo/Kohler tier). Scope calls for new faucet."
        }
      ]
    }
  ]
}`;
}

export { SYSTEM_PROMPT };

import type {
  CompanyContext,
  PricingCatalogItem,
  RoomTemplate,
  RoomTemplateTradeGroup,
  RoomTemplateItem,
} from "@/app/generated/prisma";
import type { ProjectAggregateData } from "@/app/lib/cope-aggregate-data";

type TradeGroupWithItems = RoomTemplateTradeGroup & {
  items: (RoomTemplateItem & { catalogItem: PricingCatalogItem | null })[];
};

type RoomTemplateWithDetails = RoomTemplate & {
  tradeGroups: TradeGroupWithItems[];
};

// ---------- System prompt ----------

export const COPE_SYSTEM_PROMPT = `You are a construction project overhead estimator for HHI Builders, a luxury residential renovation company on Hilton Head Island, SC. You calculate project-level overhead costs (COPE — Cost of Project Execution) based on aggregate data from all room estimates in a project.

RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no preamble.
2. Use catalog prices where they exist (unitPrice > 0). For $0 catalog items, estimate based on the calculation rules below.
3. Show ALL math in the notes field for every line item.
4. For unit costs: catalog items have unitCost (our cost) and unitPrice (client price). The markup is already built into catalog prices — do NOT add additional markup. For estimated items, use a similar markup ratio.

SKIP ITEMS: Do NOT include "Final Construction Drawings" in the COPE estimate. This item is managed outside the estimating system. If it appears in the COPE template catalog, ignore it.

PERMIT FEES — PRE-CALCULATED (do NOT recalculate):
  The permit fees have been pre-calculated by the system using the Town of Hilton Head Island fee schedule.
  The exact numbers are provided in the user prompt below. Use EXACTLY those numbers — do NOT recalculate, round, or adjust them.

  OUTPUT PERMIT LINE ITEMS AS THREE SEPARATE ITEMS:

  1. "[ADM] Building Permit - Material": The actual government permit fee.
     - unitCost and unitPrice = the pre-calculated baseFee from the user prompt (government fees, no markup)
     - source: "CALC"  ← pre-calculated in code; do NOT change to ALLOWANCE/AI_PRICED/CATALOG
     - quantity: 1

  2. "[ADM] Plan Review Fee": 50% of the permit fee if required.
     - unitCost and unitPrice = the pre-calculated planReviewFee from the user prompt (government fees, no markup)
     - source: "CALC"  ← pre-calculated in code; do NOT change to ALLOWANCE/AI_PRICED/CATALOG
     - quantity: 1 if required, 0 if not required (see user prompt for determination)

  3. "[ADM] Building Permit - Labor": Labor for someone to pick up, post, and manage the permit.
     - quantity: 2 (hours — standard for any project)
     - unitCost: $32.50 (use supervision rate)
     - unitPrice: $57.50 (use supervision rate)
     - source: "ALLOWANCE"

  CRITICAL: For government fees (Building Permit Material and Plan Review Fee), unitCost MUST equal unitPrice. There is NO markup on government fees. The cost IS the price.
  CRITICAL: Use the EXACT dollar amounts from the user prompt. Do NOT recalculate from the fee schedule.

HOA FEES:
  Many Hilton Head communities require HOA architectural review. For renovation projects, estimate:
    - HOA architectural review/application fee: $200 to $500 depending on scope complexity
    - HOA coordination staff time: 2 hours per project (standard)
      - This covers time to submit application, coordinate with HOA, post approvals
      - Use the catalog rate for HOA Fees - Staff Time
      - If catalog rate is $0, estimate $75 to $100 per hour

WASTE REMOVAL:
  - Calculate dumpster loads based on SQUARE FOOTAGE of demo work, not dollar value:
    - 1 dumpster load (12 yard) per 250 SF of demolition
    - Always round UP to the nearest whole dumpster
    - Minimum: 1 dumpster for any renovation project
  - To determine demo SF: look at the demo line items across all room estimates. Sum the quantities of SF-based demo items (remove flooring, remove tile, remove drywall, etc.).
  - If demo quantities are not in SF (e.g., LF or EA items), estimate the equivalent SF they represent.
  - Always err on the side of MORE dumpsters, not fewer.
  - Use catalog price: $712.09 per dumpster load ($498.46 cost)
  - Privacy screening around dumpster:
    - ONLY include if the walkthrough transcript or project scope mentions needing screening, or if the dumpster will be placed in a visible location that requires it.
    - If NOT mentioned in scope: set quantity to 0 for BOTH material and install. Set notes to "Not included — not specified in scope. Add if dumpster placement requires screening."
    - If included: 1 set of material + 1 set of install per dumpster location (typically 1).
    - Use catalog prices: $250 material, $625 install.

FINAL CONSTRUCTION CLEANING:
  - Use total project effective area (sum of all room square footages including sub-areas)
  - This number is provided in the Project Aggregate Data as "Total Project Area"
  - Use this exact number — do NOT add 20% or any buffer
  - Rate: catalog rate per SF ($1.70 price, $0.68 cost)

ON SITE SUPERVISION:
  - Estimate total project duration in weeks:
    - Under $50K, 1-3 rooms: 4 to 8 weeks
    - $50K to $150K, 3-6 rooms: 8 to 16 weeks
    - $150K to $300K, 6+ rooms: 16 to 24 weeks
    - Over $300K: 24 to 36 weeks
  - Supervision hours per working day: 2 hours (this is the average daily site visit, NOT a full day)
  - Working days per week: 5
  - Total hours = estimated weeks x 5 days x 2 hours per day
  - Rate: use catalog rate ($57.50 per hour client price, $32.50 per hour cost)
  - Example: 12-week project = 12 x 5 x 2 = 120 supervision hours at $57.50 = $6,900

CONTENT MANIPULATION:
  - ALWAYS include "Contents - Move out and then reset" and "Off Site Storage" line items in output.
  - DEFAULT: Set quantity to 0 and totalPrice to $0 for BOTH items.
  - ONLY populate with non-zero values if one of these conditions is met:
    a) The project scope explicitly mentions moving contents, clearing rooms, or storage
    b) The project involves gut renovation of LIVING SPACES (bedrooms, living rooms, dining rooms) where furniture must be moved
  - Bathrooms, closets, kitchens, and laundry rooms do NOT trigger content manipulation — contents in those rooms can be managed in place.
  - When triggered (non-zero):
    - Move hours: 2 to 4 hours per living-space room being gutted
    - Storage months: match estimated project duration in months
  - When NOT triggered (zero quantity):
    - Set quantity to 0 for both items
    - Set unitCost and unitPrice to the catalog rates (so they're ready if the user manually adjusts quantity)
    - Set notes to: "Not triggered — no living space gut renovation or explicit content move in scope. Adjust quantity if needed."

FLOOR AND CONTENT PROTECTION:
  - Use total project effective area (same number as cleaning)
  - Ram Board, plastic sheeting, and install labor all use this same SF
  - Do NOT use a different number than cleaning
  - Both sections MUST use the exact same square footage number. Show this number in the notes for both.
  - Use catalog rates: Ram Board $0.45/SF, Plastic $0.10/SF, Install $1.125/SF
  - Total protection cost is approximately $1.675 per SF

TAG EVERY ITEM:
  - "CATALOG" = using a real catalog price where unitPrice > 0
  - "ALLOWANCE" = catalog item exists but unitPrice is $0, you estimated the price
  - "AI_PRICED" = no matching catalog item exists at all
  - "CALC" = the dollar amount was pre-calculated in code and supplied verbatim in the user prompt (e.g., permit fees). Use this tag whenever you are passing a number through unchanged from the prompt — do NOT mis-tag pre-calc values as AI_PRICED.

CONFIDENCE SCORES:
  - CATALOG items: 0.95
  - Permit fees (pre-calculated by system): 0.95
  - ALLOWANCE items (HOA fees, drawings): 0.4 to 0.6
  - Supervision and waste estimates: 0.6 to 0.75

Return the same JSON format as room estimates (the parser expects this exact structure):
{
  "roomType": "COPE",
  "estimatedTotalPrice": 12000,
  "tradeGroups": [
    {
      "name": "Permits & Fees",
      "items": [
        {
          "name": "[ADM] Building Permit - Labor",
          "catalogMatch": true,
          "source": "ALLOWANCE",
          "quantity": 1,
          "unit": "EA",
          "unitCost": 367,
          "unitPrice": 734,
          "totalPrice": 734,
          "confidence": 0.85,
          "notes": "Project total $75,784. Permit fee = $77 + $9 x ceil((75784 - 3000) / 1000) = $77 + $9 x 73 = $734."
        }
      ]
    }
  ]
}`;

// ---------- User prompt builder ----------

export interface ProjectQAData {
  questions?: Array<{ question: string; answer: unknown; unit?: string | null }>;
}

export function buildCopeUserPrompt(
  aggregateData: ProjectAggregateData,
  copeTemplate: RoomTemplateWithDetails,
  companyContext: CompanyContext,
  projectQA?: ProjectQAData | null,
): string {
  // Room summary
  const roomSummary = aggregateData.rooms
    .map((r) => {
      const baseSf = r.areaSqFt ? `${r.areaSqFt} SF` : "no SF";
      const effectiveSf = r.effectiveSqFt ? `${r.effectiveSqFt} effective SF` : baseSf;
      const wallSf = r.wallSF != null ? `, ${r.wallSF} SF walls` : "";
      const price = r.totalTarget != null ? `$${r.totalTarget.toLocaleString()}` : "no estimate";
      const type = r.sectionType || "no type";
      return `- ${r.name}: ${effectiveSf}${wallSf} | ${price} | ${type}`;
    })
    .join("\n");

  // Trade summary sorted by totalPrice desc
  const tradeSummary = Object.entries(aggregateData.tradeBreakdown)
    .sort(([, a], [, b]) => b.totalPrice - a.totalPrice)
    .map(
      ([trade, bd]) =>
        `- ${trade}: ${bd.count} items, $${bd.totalPrice.toLocaleString()} total price`,
    )
    .join("\n");

  // Plumbing note
  const plumbingNote = aggregateData.hasPlumbing
    ? `Yes ($${aggregateData.tradeBreakdown["Plumbing"]?.totalPrice?.toLocaleString() ?? "0"})`
    : "No";

  // Catalog section from template (filter inactive items)
  const catalogSection = copeTemplate.tradeGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => item.isActive !== false),
    }))
    .filter((g) => g.items.length > 0)
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

  return `Generate a detailed COPE (Cost of Project Execution) estimate for this project based on the aggregate data below.

## Company Context
- Market: ${companyContext.market}
${companyContext.marketNotes ? `- ${companyContext.marketNotes}` : ""}
- Client Profile: ${companyContext.clientProfile ?? "Luxury second-home owners"}
- Finish Tier: ${companyContext.defaultFinishTier}

## Project Aggregate Data
- Total Estimated Project Value: $${aggregateData.totalEstimatedPrice.toLocaleString()}
- Total Estimated Project Cost: $${aggregateData.totalEstimatedCost.toLocaleString()}
- Total Project Area: ${aggregateData.totalAreaSqFt} SF across ${aggregateData.roomCount} rooms (includes sub-areas)
- Rooms with completed estimates: ${aggregateData.roomsWithEstimates}

## Room Summary
${roomSummary}

## Trade Summary (across all room estimates)
${tradeSummary}

${buildProjectClarificationsSection(projectQA)}## Pre-Calculated Permit Fees (use these EXACT numbers — do NOT recalculate)
Building Permit Fee: $${aggregateData.permitFees.baseFee.toFixed(2)}
Plan Review Fee: ${aggregateData.permitFees.planReviewRequired ? `$${aggregateData.permitFees.planReviewFee.toFixed(2)} (required: ${aggregateData.permitFees.planReviewReasons.join(", ")})` : "Not required \u2014 set quantity to 0"}
Permit Labor: 2 hours at supervision rate ($57.50/hr price, $32.50/hr cost)
Total Permit Cost: $${aggregateData.permitFees.totalPermitCost.toFixed(2)}
Calculation: ${aggregateData.permitFees.calculation}

For "[ADM] Building Permit - Material": unitCost = $${aggregateData.permitFees.baseFee.toFixed(2)}, unitPrice = $${aggregateData.permitFees.baseFee.toFixed(2)}
For "[ADM] Plan Review Fee": unitCost = $${aggregateData.permitFees.planReviewFee.toFixed(2)}, unitPrice = $${aggregateData.permitFees.planReviewFee.toFixed(2)}${aggregateData.permitFees.planReviewRequired ? "" : ", quantity = 0"}

## Scope Characteristics
- Structural work (framing): ${aggregateData.hasFraming ? "Yes" : "No"}
- Plumbing work: ${plumbingNote}
- Electrical work: ${aggregateData.hasElectrical ? "Yes" : "No"}
- Window/exterior door replacement: ${aggregateData.hasWindows ? "Yes" : "No"}
- Total demo value: $${aggregateData.demoTotal.toLocaleString()}
- Number of distinct trades: ${aggregateData.distinctTrades}

## COPE Template Catalog Items
Use these catalog items and prices. Items with $0 price are ALLOWANCE items — estimate based on the rules in the system prompt.

${catalogSection}

## Required JSON Output Format
Return ONLY the JSON structure shown in the system prompt. Include ALL trade groups from the COPE template. Calculate quantities and prices for each item based on the aggregate project data and the calculation rules.`;
}

function buildProjectClarificationsSection(projectQA?: ProjectQAData | null): string {
  if (!projectQA?.questions?.length) return "";
  const answered = projectQA.questions.filter((q) => q.answer != null && q.answer !== "");
  if (answered.length === 0) return "";
  const lines = answered.map((q) => {
    const unit = q.unit ? ` ${q.unit}` : "";
    const answer = typeof q.answer === "boolean" ? (q.answer ? "Yes" : "No") : q.answer;
    return `- ${q.question}: ${answer}${unit}`;
  });
  return `## Project Clarifications (confirmed by estimator)
${lines.join("\n")}

`;
}

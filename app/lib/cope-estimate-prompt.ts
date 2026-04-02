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

PERMIT FEE SCHEDULE (Town of Hilton Head Island — Miscellaneous Single Family Permits):
  Project value $0 to $1,000: permit fee = $35
  Project value $1,001 to $2,000: permit fee = $70
  Project value $2,001 to $3,000: permit fee = $77
  Project value $3,001 to $50,000: permit fee = $77 + $9 per $1,000 (or fraction thereof) over $3,000
  Project value $50,001 and above: permit fee = $500 + $3.50 per $1,000 (or fraction thereof) over $50,000
  Plan Review Fee: 50% of the permit fee (non-refundable). Required if ANY of these conditions apply:
    - Structural work is present (framing trade group exists in any room estimate)
    - Plumbing is being relocated (not just fixture swaps — look for rough-in, relocation, or new supply line items)
    - Windows are being replaced or exterior doors are being replaced
  If Plan Review Fee applies, add it as a separate line item.

HOA FEES:
  Many Hilton Head communities require HOA architectural review. For renovation projects, estimate:
    - HOA architectural review/application fee: $200 to $500 depending on scope complexity
    - HOA coordination staff time: 2 to 4 hours at the catalog rate ($0 catalog — estimate $75 to $100 per hour)
  If the project is small (under $30K, 1-2 rooms), HOA fees may be minimal ($200 + 2 hours). For larger projects, use higher estimates.

WASTE REMOVAL:
  - Estimate total waste volume from the aggregate demo data across all rooms
  - Rule of thumb: 1 dumpster load (12 yard) per $8,000 to $12,000 of demo work
  - Additional rule: 1 dumpster load per $50,000 of new construction work (for cut-offs, packaging, debris)
  - Always round UP to the nearest whole dumpster
  - Minimum: 1 dumpster for any renovation project
  - Privacy screening: include 1 set (material + install) if dumpster will be visible from street or neighbors. Most Hilton Head projects need this.
  - Use catalog prices for dumpster ($712.09 price per load) and privacy screening ($250 material + $625 install)

FINAL CONSTRUCTION CLEANING:
  - Use total project area (sum of all room square footages)
  - Add 20% for common areas, hallways, and transition zones that also need cleaning
  - Minimum: 200 SF even for small projects
  - Rate: use catalog rate ($1.70 per SF client price, $0.68 per SF cost)

ON SITE SUPERVISION:
  - Estimate total project duration in weeks:
    - Under $50K, 1-3 rooms: 4 to 8 weeks
    - $50K to $150K, 3-6 rooms: 8 to 16 weeks
    - $150K to $300K, 6+ rooms: 16 to 24 weeks
    - Over $300K: 24 to 36 weeks
  - Supervision hours: 3.5 hours per working day average, 5 days per week
  - Total hours = estimated weeks x 5 x 3.5
  - Rate: use catalog rate ($57.50 per hour client price, $32.50 per hour cost)

CONTENT MANIPULATION:
  - Include contents move out and reset if project involves gut renovations or 3+ rooms being worked simultaneously
  - Estimate hours: 2 to 4 hours per room being gutted
  - Off-site storage: include 1 to 3 months if contents need to be moved out. Duration roughly matches project duration.
  - Rates: use catalog rates ($85.25/HR for move, $357.14/month for storage)

FLOOR AND CONTENT PROTECTION:
  - Ram Board floor covering: total project SF (all rooms being worked in)
  - Plastic sheeting and tape: total project SF
  - Install labor: total project SF
  - Use catalog rates: Ram Board $0.45/SF, Plastic $0.10/SF, Install $1.125/SF
  - Total protection cost is approximately $1.675 per SF

CONSTRUCTION DRAWINGS:
  - Include if any room involves structural changes, additions, or complex layout changes
  - This is a $0 catalog item (ALLOWANCE) — estimate $2,000 to $5,000 based on project complexity
  - Small cosmetic project (under $50K): may not need drawings, set to $0 or minimal
  - Medium renovation ($50K-$150K): $2,000 to $3,000
  - Large renovation ($150K+): $3,500 to $5,000

TAG EVERY ITEM:
  - "CATALOG" = using a real catalog price where unitPrice > 0
  - "ALLOWANCE" = catalog item exists but unitPrice is $0, you estimated the price
  - "AI_PRICED" = no matching catalog item exists at all

CONFIDENCE SCORES:
  - CATALOG items: 0.95
  - Permit fees (calculated from fee schedule): 0.85
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

export function buildCopeUserPrompt(
  aggregateData: ProjectAggregateData,
  copeTemplate: RoomTemplateWithDetails,
  companyContext: CompanyContext,
): string {
  // Room summary
  const roomSummary = aggregateData.rooms
    .map((r) => {
      const sf = r.areaSqFt ? `${r.areaSqFt} SF` : "no SF";
      const price = r.totalTarget != null ? `$${r.totalTarget.toLocaleString()}` : "no estimate";
      const type = r.sectionType || "no type";
      return `- ${r.name}: ${sf} | ${price} | ${type}`;
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

  // Catalog section from template
  const catalogSection = copeTemplate.tradeGroups
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
- Total Project Area: ${aggregateData.totalAreaSqFt} SF across ${aggregateData.roomCount} rooms
- Rooms with completed estimates: ${aggregateData.roomsWithEstimates}

## Room Summary
${roomSummary}

## Trade Summary (across all room estimates)
${tradeSummary}

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

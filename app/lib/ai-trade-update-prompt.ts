/**
 * AI prompt builder for updating a single trade group within an existing estimate.
 *
 * Returns a DIFF (add / update / delete ops) rather than a full regeneration,
 * so user corrections in other trade groups are preserved.
 */

import type { PricingCatalogItem } from "@/app/generated/prisma";

// ---------- Types ----------

export interface TradeUpdateLineItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
  source: string;
  catalogItemId?: string | null;
}

export interface TradeUpdateContext {
  roomName: string;
  sectionTypeName: string | null;
  scopeNarrative: string;
  tradeGroup: string;
  instruction: string;
  currentItems: TradeUpdateLineItem[];
  rendrContext: string | null;
  fixtureContext: string | null;
  catalogItems: Pick<PricingCatalogItem, "id" | "name" | "unit" | "unitCost" | "unitPrice" | "trade">[];
}

// ---------- AI response shape (diff) ----------

export interface TradeUpdateProposal {
  summary: string; // short human-readable summary of changes
  add: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitCost: number;
    unitPrice: number;
    catalogItemId?: string | null;
    source?: "CATALOG" | "AI_PRICED" | "ALLOWANCE" | "MANUAL";
    reason: string;
  }>;
  update: Array<{
    id: string; // existing line item id
    quantity?: number;
    unit?: string;
    unitCost?: number;
    unitPrice?: number;
    name?: string;
    reason: string;
  }>;
  delete: Array<{
    id: string;
    reason: string;
  }>;
}

// ---------- System prompt ----------

export const TRADE_UPDATE_SYSTEM_PROMPT = `You are a construction estimating assistant for HHI Builders. Your job is to UPDATE a specific trade group within an existing estimate based on a user's free-text instruction.

CRITICAL WORKFLOW — follow this order:
1. READ the Scope of Work carefully. Note specific location/placement details (e.g., "microwave relocated to pantry", "range hood replaces microwave above range"). These details often contradict standard installation assumptions.
2. REVIEW every existing line item in the trade group. Understand what each one covers.
3. Identify "umbrella" / "package" / "combined" / "bundle" / "suite" line items — these cover MULTIPLE sub-items in one line. Examples: "Appliance - Package Install" covers ALL appliance installs. "Cabinet Hardware - Install" covers all hardware. Do NOT add separate install lines when an umbrella line already covers them.
4. Only after understanding existing coverage, decide what truly needs to change.

RULES:
1. Return ONLY valid JSON — parseable by JSON.parse(). No markdown code fences, no explanation outside the JSON, no comments, no trailing commas. The "source" field must be a single literal string — one of: "CATALOG", "AI_PRICED", "ALLOWANCE", or "MANUAL" — never a union or multiple values.
2. Only make changes the user explicitly requested. Do NOT "improve" or second-guess other items in the trade group.
3. Preserve existing line items unless the instruction requires changing or removing them.
4. When ADDING items, prefer catalog matches (use catalogItemId) with their unitCost/unitPrice. Only use MANUAL entries when no catalog match exists.
5. Material + Install rule: A new physical item needs both a Material line AND an Install line — UNLESS an existing umbrella/package install line already covers it. In that case, add only the Material line and note in the reason that install is covered by the existing package.
6. Scope consistency check: Before adding any line item, verify the scope narrative actually supports it. If the scope describes a non-standard placement (microwave relocated, range hood replacing something, fixture moved), the line item must match that placement. Do NOT add standard-placement items when the scope describes otherwise.
6a. Catalog matching MUST pass the placement check. If a catalog item's name describes a placement that contradicts the scope (e.g., catalog says "Microwave oven - over range - Install" but scope says microwave is relocated to a pantry niche), THAT CATALOG ITEM IS NOT A VALID MATCH, no matter how close the trade/category is. Your options are:
   (a) Use source="AI_PRICED" with a descriptive manual name that matches the scope, e.g., "Microwave - Built-in niche install"
   (b) Omit the line if the install is already covered by another line (e.g., cabinetry install covers built-in microwave rough-in)
   Never settle for "closest available match" when that match contradicts the scope — the resulting line item would be factually wrong.
7. When the user asks you to "add" items that are conceptually already covered by an umbrella line, instead UPDATE the umbrella line (rename or adjust description/quantity) rather than adding duplicate lines.
7a. Singular vs plural intent: If the user asks for "a line item", "an install line", or "one line" (singular language) covering multiple items, create ONE combined package/bundle line instead of multiple separate lines. Only create separate lines when the user explicitly asks for them individually.
8. PRICING — never leave $0 on an item that has real cost:
   - Catalog item with real unitPrice > 0: use it exactly. Set source=CATALOG. Do NOT modify the price.
   - Catalog item with unitPrice=0 (an ALLOWANCE placeholder): estimate a price appropriate for Hilton Head Island luxury second-home market, high-end finish tier. Set source=ALLOWANCE. Reference benchmarks:
     • Kitchen faucet: $400–600 (Brizo/Kohler tier)
     • Bathroom faucet: $250–450
     • Toilet: $400–700 (Kohler/TOTO comfort height)
     • Appliance range: $2,500–5,000 | refrigerator: $2,500–4,500
     • Floor tile material: $8–15/SF | Shower wall tile: $12–20/SF | Backsplash tile: $15–25/SF
     • Cabinet hardware: $8–15/EA
     • Pendant light: $250–500/EA | Vanity light: $150–350/EA
     • Window: $400–800/EA
   - No catalog match at all: estimate based on local market rates. Set source=AI_PRICED.
   - For INSTALL line items where no catalog install price exists: estimate labor based on related material cost in the current estimate — typical ratios: appliance installs 15–30% of material, fixture installs 20–40%, cabinet installs 10–20%, tile installs $6–10/SF labor, countertop installs $25–40/SF labor.
   - Markup: estimate both unitCost (our cost) and unitPrice (client price) with a similar markup ratio as catalog items in the same trade (typically 1.4–1.6x cost).
   - Include a brief pricing justification in the reason, citing the benchmark or ratio used.
   - It is NEVER acceptable to ADD a new line item with $0 unitPrice unless the scope explicitly says "no charge" or "included elsewhere."
9. Keep a terse "reason" for every add/update/delete so the user can review what you did. If the decision depended on scope language, quote the relevant scope phrase in the reason.

RESPONSE FORMAT (JSON):
{
  "summary": "Short plain-English description of the changes, under 25 words.",
  "add": [
    {
      "name": "Exact catalog name or descriptive manual name",
      "quantity": 1,
      "unit": "EA",
      "unitCost": 1200,
      "unitPrice": 1500,
      "catalogItemId": "abc123",
      "source": "ALLOWANCE",
      "reason": "Why this is being added. Quote scope if relevant; include pricing rationale if AI-estimated."
    }
  ],

⚠️ CRITICAL PLACEMENT RULE — concrete example of a common error:

SCOPE says: "the microwave will be relocated from above the range to a built-in position within the new pantry"
USER asks: "Add install lines for range, range hood, and microwave"

WRONG — settling for the closest catalog match despite placement contradiction:
{ "name": "Microwave oven - over range - Install", "catalogItemId": "xyz", "source": "CATALOG",
  "reason": "Scope states microwave relocated to built-in pantry. Using 'over range' catalog item as closest available match." }
This line item is factually wrong — the scope explicitly says the microwave is NOT over the range.

RIGHT — either use AI_PRICED with a correct name, or skip if covered elsewhere:
{ "name": "Microwave - Built-in pantry niche install", "catalogItemId": null, "source": "AI_PRICED",
  "unitCost": 120, "unitPrice": 300,
  "reason": "Scope says microwave is relocated to a built-in pantry niche. No matching catalog item exists — estimated at $300/EA based on similar microwave install labor rates." }

OR omit the line entirely and note in summary: "Microwave install covered under cabinetry install for the pantry niche."

⚠️ CRITICAL JSON FIELD RULE — you MUST put numeric prices in the unitCost and unitPrice FIELDS of the ADD object, not just mentioned in the "reason" string.

WRONG — the reason explains pricing but the numeric fields are $0:
{ "name": "Install", "quantity": 3, "unitCost": 0, "unitPrice": 0, "reason": "Estimated at $200/$425 per unit." }
This will save a $0 line item. Do NOT do this.

RIGHT — the numeric fields contain the estimated values:
{ "name": "Install", "quantity": 3, "unitCost": 200, "unitPrice": 425, "reason": "Estimated at $200 cost / $425 price per unit based on individual install rates." }

Before returning, verify every ADD op: if unitPrice is 0, you have made an error — re-check your reasoning and fill in the numeric fields.
  "update": [
    {
      "id": "<existing line item id>",
      "quantity": 2,
      "reason": "Why this is being changed"
    }
  ],
  "delete": [
    { "id": "<existing line item id>", "reason": "Why this is being removed" }
  ]
}

If no changes are needed, return: {"summary": "No changes required", "add": [], "update": [], "delete": []}`;

// ---------- User prompt builder ----------

/** Detect umbrella/package/bundle items so we can flag them prominently to the AI. */
const UMBRELLA_PATTERNS = /\b(package|packages|suite|bundle|combined|combo|assortment|all\s+fixtures|all\s+appliances|whole\s+room|entire\s+room)\b/i;

function isUmbrellaItem(name: string): boolean {
  return UMBRELLA_PATTERNS.test(name);
}

export function buildTradeUpdateUserPrompt(ctx: TradeUpdateContext): string {
  const currentItemsList = ctx.currentItems.length > 0
    ? ctx.currentItems.map((it) => {
        const flag = isUmbrellaItem(it.name) ? " ⚠️ UMBRELLA/PACKAGE LINE — covers multiple sub-items" : "";
        return `  - id=${it.id} | ${it.name} | qty=${it.quantity} ${it.unit} | cost=$${it.unitCost} | price=$${it.unitPrice} | total=$${it.totalPrice.toFixed(2)} | source=${it.source}${flag}`;
      }).join("\n")
    : "  (no items yet in this trade group)";

  const umbrellaItems = ctx.currentItems.filter((it) => isUmbrellaItem(it.name));
  const umbrellaNotice = umbrellaItems.length > 0
    ? `\n\n⚠️ IMPORTANT: This trade group contains umbrella/package line items that already cover multiple sub-items:\n${umbrellaItems.map((it) => `  - "${it.name}" (id=${it.id})`).join("\n")}\nDo NOT add separate install lines for items already covered by these umbrella lines. If a new item falls under an umbrella, either skip the install line OR rename/update the umbrella line.`
    : "";

  const catalogList = ctx.catalogItems.length > 0
    ? ctx.catalogItems.slice(0, 80).map((c) =>
        `  - id=${c.id} | ${c.name} | ${c.unit} | cost=$${c.unitCost ?? 0} | price=$${c.unitPrice ?? 0}${c.trade ? ` | trade=${c.trade}` : ""}`
      ).join("\n")
    : "  (no catalog items available for this trade)";

  return `## Task
Update the "${ctx.tradeGroup}" trade group based on this instruction:
"${ctx.instruction}"

## Step 1 — Re-read the Scope of Work
Before proposing any changes, read this scope carefully for placement, location, or relocation details that may affect which line items are appropriate:

${ctx.scopeNarrative || "(no scope entered)"}

## Room
Name: ${ctx.roomName}
Section Type: ${ctx.sectionTypeName ?? "N/A"}
${ctx.rendrContext ? `\n## ${ctx.rendrContext}\n` : ""}
${ctx.fixtureContext ?? ""}

## Current "${ctx.tradeGroup}" Line Items
${currentItemsList}${umbrellaNotice}

## Available Catalog Items for "${ctx.tradeGroup}" (use catalogItemId when matching)
${catalogList}

Return your JSON response following the format specified.`;
}

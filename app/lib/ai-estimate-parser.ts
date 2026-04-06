import type { PricingCatalogItem } from "@/app/generated/prisma";
import { fuzzyMatch } from "@/app/lib/fuzzy-catalog-match";

// ---------- Types ----------

interface RawEstimateItem {
  name: string;
  catalogMatch?: boolean;
  source: "CATALOG" | "AI_PRICED" | "ALLOWANCE";
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
  confidence: number;
  notes?: string;
}

interface RawTradeGroup {
  name: string;
  items: RawEstimateItem[];
}

interface RawEstimateResponse {
  roomType: string;
  estimatedTotalPrice: number;
  tradeGroups: RawTradeGroup[];
}

export interface ParsedLineItem {
  catalogItemId: string | null;
  tradeGroup: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  source: "CATALOG" | "AI_PRICED" | "ALLOWANCE";
  confidence: number;
  notes: string | null;
  matchScore: number | null;
}

export interface ParsedEstimate {
  roomType: string;
  totalCost: number;
  totalPrice: number;
  items: ParsedLineItem[];
  warnings: string[];
}

// ---------- Helpers ----------

function extractJSON(raw: string): string {
  // If wrapped in ```json ... ``` code block, extract
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find a JSON object directly
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

/**
 * Attempt to repair truncated or malformed JSON.
 *
 * Walks backward from the truncation point to find the last complete
 * JSON value boundary, then closes all unclosed brackets/braces.
 * Works for deeply nested structures like AI estimate responses.
 */
function repairJSON(broken: string): string {
  let s = broken.trim();

  // Step 1: Find and trim to the last complete JSON value.
  // Walk backward to find the last char that ends a complete value:
  //   " (end of string), digit (end of number), } ] true false null
  // Then trim everything after it that's an incomplete value.

  // First, handle if we're inside an unclosed string — find the opening quote
  // and truncate to just before the incomplete key-value pair
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (s[i] === "\\") { escaped = true; continue; }
    if (s[i] === '"') inStr = !inStr;
  }

  if (inStr) {
    // We're inside an unclosed string. Find the last opening " and check context.
    // Walk backward to find the unmatched opening quote
    let quotePos = s.length - 1;
    while (quotePos >= 0 && s[quotePos] !== '"') quotePos--;
    if (quotePos >= 0) {
      // Check if this is a value string or a key string
      // If preceded by : it's a value — truncate the incomplete value
      const before = s.slice(0, quotePos).trimEnd();
      if (before.endsWith(":")) {
        // Incomplete value string — remove the whole key: "value pair
        // Find the comma or bracket before the key
        const keyStart = before.lastIndexOf('"');
        if (keyStart >= 0) {
          s = s.slice(0, keyStart).trimEnd();
          // Remove trailing comma
          if (s.endsWith(",")) s = s.slice(0, -1);
        } else {
          s = s.slice(0, quotePos) + '""';
        }
      } else {
        // Incomplete key or standalone string — close it
        s = s.slice(0, quotePos + 1);
      }
    }
  }

  // Step 2: Remove trailing incomplete tokens (partial numbers, partial keywords)
  // Trim trailing chars that aren't valid JSON value endings
  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, ""); // trailing `,"key":`
  s = s.replace(/,\s*"[^"]*"?\s*$/, "");     // trailing `,"partial...`
  s = s.replace(/,\s*$/, "");                 // trailing comma
  s = s.replace(/:\s*$/, ": null");           // trailing colon with no value

  // Step 3: Count unclosed brackets/braces
  let braces = 0;
  let brackets = 0;
  inStr = false;
  escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  // Handle still being in a string after our repairs
  if (inStr) s += '"';

  // Clean trailing commas one more time
  s = s.replace(/,\s*$/, "");

  // Step 4: Close unclosed brackets (arrays first, then objects)
  while (brackets > 0) { s += "]"; brackets--; }
  while (braces > 0) { s += "}"; braces--; }

  return s;
}

// ---------- Parser ----------

export function parseEstimateResponse(
  rawResponse: string,
  catalogItems: PricingCatalogItem[],
): ParsedEstimate {
  const jsonStr = extractJSON(rawResponse);

  let parsed: RawEstimateResponse;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt JSON repair for truncated responses
    try {
      const repaired = repairJSON(jsonStr);
      parsed = JSON.parse(repaired);
      // eslint-disable-next-line no-console
      console.warn("[ai-estimate-parser] Repaired truncated JSON successfully");
    } catch {
      throw new Error(`Failed to parse AI estimate JSON: ${jsonStr.slice(0, 200)}...`);
    }
  }

  if (!parsed.tradeGroups || !Array.isArray(parsed.tradeGroups)) {
    throw new Error("AI estimate response missing tradeGroups array");
  }

  // Build fuzzy-match candidates from catalog
  const fuzzyCandidates = catalogItems.map((c) => ({
    id: c.id,
    name: c.name,
    unitPrice: c.unitPrice,
    unitCost: c.unitCost,
  }));

  // Index catalog items by ID for quick lookup after fuzzy match
  const catalogById = new Map<string, PricingCatalogItem>();
  for (const item of catalogItems) {
    catalogById.set(item.id, item);
  }

  const warnings: string[] = [];
  const items: ParsedLineItem[] = [];

  for (const group of parsed.tradeGroups) {
    if (!group.items || !Array.isArray(group.items)) continue;

    for (const rawItem of group.items) {
      // Use fuzzy matching instead of exact name lookup
      const match = fuzzyMatch(rawItem.name, fuzzyCandidates);
      const catalogItem = match ? catalogById.get(match.item.id) ?? null : null;
      let matchScore: number | null = match ? match.score : null;

      let source = rawItem.source;
      let catalogItemId: string | null = null;
      let unitCost = rawItem.unitCost ?? 0;
      let unitPrice = rawItem.unitPrice ?? 0;
      let confidence = rawItem.confidence ?? 0.5;

      if (rawItem.catalogMatch || source === "CATALOG" || source === "ALLOWANCE") {
        if (catalogItem) {
          // Log fuzzy matches where names differ
          if (match && match.score < 1.0) {
            console.warn(
              `[fuzzy-match] "${rawItem.name}" matched to catalog "${catalogItem.name}" (score: ${match.score.toFixed(2)})`,
            );
          }

          catalogItemId = catalogItem.id;
          const catPrice = catalogItem.unitPrice ?? 0;
          const catCost = catalogItem.unitCost ?? 0;

          if (catPrice > 0) {
            // Real catalog price — enforce it
            if (Math.abs(unitPrice - catPrice) / catPrice > 0.01) {
              warnings.push(
                `Price override: "${rawItem.name}" Claude=$${unitPrice}, Catalog=$${catPrice}. Using catalog price.`,
              );
            }
            unitPrice = catPrice;
            unitCost = catCost;
            source = "CATALOG";
            confidence = 0.95;
          } else {
            // $0 catalog price = ALLOWANCE
            source = "ALLOWANCE";
            confidence = Math.min(Math.max(confidence, 0.3), 0.5);
          }
        } else {
          // Claimed catalog match but not found even with fuzzy — downgrade
          source = "AI_PRICED";
          matchScore = null;
          warnings.push(`Catalog miss: "${rawItem.name}" claimed catalogMatch but not found in catalog`);
        }
      } else {
        // AI didn't claim a match — still try fuzzy matching
        if (catalogItem && match) {
          if (match.score < 1.0) {
            console.warn(
              `[fuzzy-match] "${rawItem.name}" auto-matched to catalog "${catalogItem.name}" (score: ${match.score.toFixed(2)})`,
            );
          }
          catalogItemId = catalogItem.id;
          const catPrice = catalogItem.unitPrice ?? 0;
          const catCost = catalogItem.unitCost ?? 0;

          if (catPrice > 0) {
            unitPrice = catPrice;
            unitCost = catCost;
            source = "CATALOG";
            confidence = 0.95;
          } else {
            source = "ALLOWANCE";
            confidence = Math.min(Math.max(confidence, 0.3), 0.5);
          }
        } else {
          source = "AI_PRICED";
          matchScore = null;
        }
      }

      const quantity = rawItem.quantity ?? 1;
      items.push({
        catalogItemId,
        tradeGroup: group.name,
        name: rawItem.name,
        quantity,
        unit: rawItem.unit ?? "EA",
        unitCost,
        unitPrice,
        totalCost: quantity * unitCost,
        totalPrice: quantity * unitPrice,
        source,
        confidence,
        notes: rawItem.notes ?? null,
        matchScore,
      });
    }
  }

  const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.totalPrice, 0);

  return {
    roomType: parsed.roomType ?? "Unknown",
    totalCost,
    totalPrice,
    items,
    warnings,
  };
}

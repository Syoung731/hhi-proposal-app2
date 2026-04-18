/**
 * AI-powered recommended value generation for Kitchen/Bath sections.
 *
 * Analyzes scope narrative against existing fixture/cabinet data and
 * recommends changes (e.g., "add island" → increase counter SF).
 *
 * Best-effort: if it fails, Recommended stays = Existing (safe default).
 */

import { callClaude } from "@/app/lib/ai/model";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma";
import type { RoomDetailType } from "@/app/lib/room-classification";

/**
 * Generate AI-recommended values for a Kitchen/Bath section's roomDetail.
 * Returns only the fields that should differ from existing.
 * Non-blocking — call with .catch(() => {}) to avoid blocking the workflow.
 */
export async function generateRecommendedDetail(
  roomId: string,
  sectionName: string,
  scopeNarrative: string,
  existingDetail: Record<string, unknown>,
  roomType: RoomDetailType,
): Promise<void> {
  if (!roomType || !scopeNarrative.trim()) return;

  const prompt = `You are analyzing a ${roomType} renovation scope to determine recommended specifications.

Section: "${sectionName}"
Scope of work: "${scopeNarrative}"

Current physical conditions (from LiDAR scan):
${JSON.stringify(existingDetail, null, 2)}

Your task: Return a JSON object with ALL recommended values for this renovation.

QUANTITY FIELDS (cabinets, countertop, backsplash, sinks, toilets):
- These represent how many will be in the FINAL space after renovation.
- If the scope says to add cabinets → increase the count from existing.
- If removing → set to 0.
- If replacing in-kind or reconfiguring with same count → keep same as existing.
- Only include quantity fields that have a non-null existing value or are mentioned in scope.

APPLIANCE & FIXTURE BOOLEAN FIELDS (CRITICAL — you MUST always include these):
- These booleans mean: will a NEW unit be PURCHASED AND INSTALLED in this renovation?
- true = homeowner is BUYING a new one (include Material + Install in estimate)
- false = homeowner is KEEPING the existing one OR the item doesn't exist (no purchase needed)

Decision rules:
- Scope says "keep existing appliances", "reuse", "reinstall existing", "will be reused",
  "approximately X years old and will be reused" → set to FALSE (not buying new ones)
- Scope says "new appliances", "upgrade", "replace stove", "new appliance package" → TRUE
- Scope does NOT mention the appliance/fixture at all → FALSE (default: not replacing)
- "Reinstalled" means putting the EXISTING unit back — this is FALSE, not a new purchase.

${roomType === "kitchen" ? `
You MUST include ALL of these boolean fields in your response:
  hasStoveRecommended: true/false
  hasOvenRecommended: true/false
  hasFridgeRecommended: true/false
  hasDishwasherRecommended: true/false

Optional quantity fields (include only if existing value is non-null or scope mentions them):
  baseCabinetCountRecommended, baseCabinetLfRecommended,
  wallCabinetCountRecommended, wallCabinetLfRecommended,
  countertopSfRecommended, backsplashSfRecommended,
  sinkCountRecommended
` : `
You MUST include ALL of these boolean fields in your response:
  hasTubRecommended: true/false
  hasShowerRecommended: true/false
  hasTubShowerComboRecommended: true/false

Optional quantity fields (include only if existing value is non-null or scope mentions them):
  vanityCabinetCountRecommended, vanityCabinetLfRecommended,
  countertopSfRecommended, backsplashSfRecommended,
  sinkCountRecommended, toiletCountRecommended
`}

Return JSON only, no explanation.`;

  try {
    const response = await callClaude({
      max_tokens: 1024,
      temperature: 0.1,
      system: "You are a construction specification assistant. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    if (process.env.NODE_ENV === "development") {
      console.log(`[generateRecommendedDetail] ${sectionName} AI raw:`, cleaned.substring(0, 500));
    }

    // Merge AI recommendations into existing detail
    const updated = { ...existingDetail };

    if (cleaned && cleaned !== "{}") {
      const recommended = JSON.parse(cleaned);
      if (typeof recommended === "object" && recommended !== null) {
        for (const [key, value] of Object.entries(recommended)) {
          if (key.endsWith("Recommended")) {
            updated[key] = value;
          }
        }
      }
    }

    // Deterministic post-processing: scan scope for appliance reuse language
    // This catches cases where the AI doesn't follow instructions
    applyApplianceDefaults(updated, scopeNarrative, roomType);

    // Only set recommendedSource to 'ai' if it wasn't already 'manual'
    if (updated.recommendedSource !== "manual") {
      updated.recommendedSource = "ai";
    }

    if (process.env.NODE_ENV === "development") {
      const bools = Object.entries(updated).filter(([k]) => k.startsWith("has") && k.endsWith("Recommended"));
      console.log(`[generateRecommendedDetail] ${sectionName} final booleans:`, Object.fromEntries(bools));
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { roomDetail: updated as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[generateRecommendedDetail] ${sectionName} error:`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic appliance/fixture logic — overrides AI when scope is clear
// ---------------------------------------------------------------------------

const KEEP_PATTERNS = [
  /existing\s+appliances?\b.*\b(?:reuse|reused|keep|kept|stay|remain|reinstall|reinstalled)/i,
  /\b(?:reuse|keep|reinstall)\b.*\bexisting\s+appliances?\b/i,
  /appliances?\b.*\bwill\s+be\s+(?:reused|kept|reinstalled)\b/i,
  /appliances?\b.*\bapproximately\b.*\b(?:years?|months?)\s+old\b.*\b(?:reuse|reused|reinstall|reinstalled)\b/i,
  /\b(?:disconnect|disconnected).*\b(?:stored|reinstall|reinstalled)\b/i,
];

const REPLACE_ALL_PATTERNS = [
  /\bnew\s+appliance\s*(?:package|suite)\b/i,
  /\breplace\s+all\s+appliances?\b/i,
  /\bnew\s+appliances?\b/i,
  /\bupgrade\s+(?:all\s+)?appliances?\b/i,
];

function applyScopeMatch(scope: string, field: string): boolean | null {
  const fieldToKeyword: Record<string, RegExp> = {
    hasStoveRecommended: /\b(?:stove|range|cooktop)\b/i,
    hasOvenRecommended: /\b(?:oven|wall\s+oven)\b/i,
    hasFridgeRecommended: /\b(?:fridge|refrigerator)\b/i,
    hasDishwasherRecommended: /\b(?:dishwasher)\b/i,
    hasTubRecommended: /\b(?:tub|bathtub|soaking\s+tub|freestanding\s+tub)\b/i,
    hasShowerRecommended: /\b(?:shower)\b/i,
    hasTubShowerComboRecommended: /\b(?:tub.shower\s+combo)\b/i,
  };
  const kw = fieldToKeyword[field];
  if (!kw) return null;

  // Check for explicit "new [appliance]" or "replace [appliance]"
  const replacePattern = new RegExp(`\\b(?:new|replace|upgrade)\\b[^.]*${kw.source}`, "i");
  if (replacePattern.test(scope)) return true;

  // Check for explicit "keep existing [appliance]"
  const keepPattern = new RegExp(`\\b(?:keep|reuse|reinstall)\\b[^.]*${kw.source}`, "i");
  if (keepPattern.test(scope)) return false;

  return null; // no specific mention
}

function applyApplianceDefaults(
  detail: Record<string, unknown>,
  scopeNarrative: string,
  roomType: "kitchen" | "bathroom" | null,
): void {
  if (!roomType) return;

  const scope = scopeNarrative.toLowerCase();

  // Check for blanket "keep all appliances" language
  const keepAll = KEEP_PATTERNS.some((p) => p.test(scopeNarrative));
  const replaceAll = REPLACE_ALL_PATTERNS.some((p) => p.test(scopeNarrative));

  const booleanFields = roomType === "kitchen"
    ? ["hasStoveRecommended", "hasOvenRecommended", "hasFridgeRecommended", "hasDishwasherRecommended"]
    : ["hasTubRecommended", "hasShowerRecommended", "hasTubShowerComboRecommended"];

  for (const field of booleanFields) {
    // Skip if user manually set this value
    if (detail.recommendedSource === "manual") continue;

    // Check for per-appliance language first (overrides blanket rules)
    const perItem = applyScopeMatch(scopeNarrative, field);
    if (perItem !== null) {
      detail[field] = perItem;
      continue;
    }

    // Apply blanket rules
    if (keepAll) {
      detail[field] = false;
    } else if (replaceAll) {
      detail[field] = true;
    }
    // If neither blanket rule matches and AI didn't set it, leave as-is
  }
}

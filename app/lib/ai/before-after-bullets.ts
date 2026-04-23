/**
 * AI rewrite of Render Controls (builder-voice) into client-facing bullet
 * copy for the Before/After deck slide (Phase 8C T7).
 *
 * The input is the room's renderChecklist — short verb-led strings describing
 * the visible changes ("Install freestanding soaking tub", "Replace vanity
 * with stone countertop"). The output is 3–8 parallel client-facing bullets
 * suitable for a proposal slide's scannable strip.
 *
 * One Claude call per room — NOT one per bullet. Keep the prompt stable and
 * hashable so re-sync can skip the call when inputs haven't changed.
 */

import { callClaude } from "@/app/lib/ai/model";

const SYSTEM_PROMPT = `You rewrite builder-voice renovation changes into concise, confident client-facing bullet copy for a luxury proposal's Before/After slide.

RULES:
1. Output ONLY a JSON array of short strings. No wrapping object, no markdown, no prose explanation.
2. Each bullet: 4-8 words. Present tense noun phrases or short imperative actions. Never more than 10 words.
3. Client voice: describe the finished result, not the construction step.
   - Builder: "Remove tub and install new walk-in shower"
   - Client:  "New walk-in shower"
   - Builder: "Replace vanity with stone countertop"
   - Client:  "New vanity with stone countertop"
4. Parallel structure: prefer the same leading word across the set when natural.
   - "New ___" / "Updated ___" / "Expanded ___" / "Opened ___"
5. No construction jargon: no "rough-in", "substrate", "flush-mount", "code-compliant".
6. No generic fluff: avoid "high-end", "luxurious", "premium", "stunning", "gorgeous".
7. De-duplicate: if two inputs describe the same visible outcome, merge into one bullet.
8. Omit any input whose outcome isn't visible in a finished photo of the room.
9. Return 3-8 bullets. If fewer than 3 inputs map to visible outcomes, return as many as survive (may be empty).

EXAMPLES:

Input:
["Remove heart-shaped jetted tub", "Remove octagonal shower enclosure", "Install freestanding soaking tub", "Install walk-in tiled shower", "Replace vanity with stone countertop", "Install floor and wall tile", "Replace toilet", "Install recessed lighting"]

Output:
["New freestanding soaking tub","New walk-in tiled shower","New vanity with stone countertop","Refreshed floor and wall tile","Updated lighting and toilet"]

Input:
["Demo existing drywall", "Install new kitchen cabinets", "Install new countertop", "Install new backsplash", "Install new sink and faucet", "Install new pendant lighting"]

Output:
["New custom cabinetry","New stone countertops","New tile backsplash","New sink with upgraded faucet","New pendant lighting"]`;

/**
 * Rewrite a render checklist into client-facing bullets.
 *
 * @param renderChecklist Builder-voice action strings from the room's Render Controls.
 * @returns 3-8 client-facing bullet strings, or an empty array when the input
 *   is empty / the AI call fails. Callers should fall back to the existing
 *   caption when the bullets array is shorter than expected.
 */
export async function generateBeforeAfterBullets(
  renderChecklist: string[],
): Promise<string[]> {
  const cleaned = (renderChecklist ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (cleaned.length === 0) return [];

  const userContent = `Rewrite these renovation changes into client-facing bullets:\n\n${JSON.stringify(cleaned)}`;

  try {
    const message = await callClaude({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 600,
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    // Strip accidental markdown fences the model sometimes emits despite
    // the rule ("```json\n[...]\n```" → "[...]").
    const cleanText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleanText);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch (err) {
    console.error(
      "[generateBeforeAfterBullets] Claude call failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Stable hash of the render checklist — used to skip the Claude call on
 * re-sync when the inputs haven't changed. Deterministic, order-sensitive
 * (order change implies emphasis change → regenerate).
 */
export function hashRenderChecklist(renderChecklist: string[]): string {
  const joined = (renderChecklist ?? []).join("\n");
  let h = 0;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) - h + joined.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

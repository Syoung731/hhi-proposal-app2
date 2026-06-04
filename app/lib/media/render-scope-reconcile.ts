import type { DetectedFixture } from "@/app/lib/gemini";

/**
 * Reconcile a room's render scope (the checklist of things to render) against
 * what a vision pass actually SAW in the before photo. The point is to stop the
 * AI hallucinating fixtures that aren't in the photo: if the scope says "new
 * shower" but no shower is visible, we flag it and ask rather than render it.
 *
 * Pure + deterministic so it's trivially testable and runs anywhere.
 */

export type RenderRecommendation = "render" | "confirm" | "skip";

export type AnnotatedRenderItem = {
  /** The original scope checklist text. */
  itemText: string;
  /** The taxonomy fixture this item maps to, if any. */
  matchedFixture: string | null;
  /** true/false from the vision pass; null = couldn't determine. */
  visibleInPhoto: boolean | null;
  /** Suggested default + how the UI should treat it. */
  recommendation: RenderRecommendation;
  /** Whether the checkbox should start checked in the UI. */
  defaultChecked: boolean;
  /** Short human reason shown next to the item. */
  reason: string;
};

/**
 * Keyword → taxonomy-fixture mapping. A scope item matches a fixture if any of
 * its keywords appears in the (lowercased) item text. Order matters: more
 * specific combos (tub/shower) should be checked before generic ones.
 */
const FIXTURE_KEYWORDS: { fixture: string; keywords: string[] }[] = [
  { fixture: "tub/shower combo", keywords: ["tub/shower", "tub shower", "shower/tub"] },
  { fixture: "shower", keywords: ["shower"] },
  { fixture: "bathtub", keywords: ["bathtub", "soaking tub", "freestanding tub", "tub"] },
  { fixture: "vanity", keywords: ["vanity"] },
  { fixture: "bathroom sink", keywords: ["bathroom sink", "lavatory"] },
  { fixture: "toilet", keywords: ["toilet", "water closet"] },
  { fixture: "mirror", keywords: ["mirror"] },
  { fixture: "kitchen island", keywords: ["island"] },
  { fixture: "kitchen cabinets", keywords: ["cabinet", "cabinetry"] },
  { fixture: "countertops", keywords: ["countertop", "counter top", "quartz", "granite counter"] },
  { fixture: "backsplash", keywords: ["backsplash"] },
  { fixture: "kitchen sink", keywords: ["kitchen sink", "farmhouse sink", "apron sink"] },
  { fixture: "range or stove", keywords: ["range", "stove", "cooktop"] },
  { fixture: "wall oven", keywords: ["wall oven", "double oven"] },
  { fixture: "refrigerator", keywords: ["refrigerator", "fridge"] },
  { fixture: "dishwasher", keywords: ["dishwasher"] },
  { fixture: "range hood", keywords: ["range hood", "vent hood", "hood"] },
  { fixture: "fireplace", keywords: ["fireplace", "mantel"] },
  { fixture: "windows", keywords: ["window"] },
  { fixture: "interior door", keywords: ["door"] },
  { fixture: "staircase", keywords: ["stair", "staircase", "railing", "banister"] },
  { fixture: "built-in shelving", keywords: ["built-in", "built in", "shelving", "bookcase"] },
];

/** Map one scope item to a taxonomy fixture (or null if it's general work). */
function matchFixture(itemText: string): string | null {
  const lower = itemText.toLowerCase();
  for (const { fixture, keywords } of FIXTURE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return fixture;
  }
  return null;
}

/**
 * Produce one annotated item per scope checklist entry.
 *
 * Logic:
 * - Item maps to a fixture that the photo SHOWS  → "render", checked. (Safe.)
 * - Item maps to a fixture NOT seen in the photo → "confirm", unchecked, warned.
 *   (This is the anti-hallucination guard: "scope has a tub but I don't see one
 *    here — render anyway?")
 * - Item maps to a fixture but detection was empty/unknown → "confirm", checked.
 * - Item doesn't map to any tracked fixture (paint, flooring, trim, lighting…)
 *   → "render", checked. These are broad finishes that apply to visible surfaces.
 */
export function reconcileScopeWithPhoto(
  scopeItems: string[],
  detected: DetectedFixture[],
): AnnotatedRenderItem[] {
  const visibleByName = new Map(
    detected.map((d) => [d.name.toLowerCase(), d.visible] as const),
  );
  const haveDetection = detected.length > 0;

  return scopeItems.map((itemText) => {
    const matchedFixture = matchFixture(itemText);

    if (!matchedFixture) {
      return {
        itemText,
        matchedFixture: null,
        visibleInPhoto: null,
        recommendation: "render",
        defaultChecked: true,
        reason: "Applies to visible surfaces.",
      };
    }

    if (!haveDetection) {
      return {
        itemText,
        matchedFixture,
        visibleInPhoto: null,
        recommendation: "confirm",
        defaultChecked: true,
        reason: "Couldn't auto-check the photo — confirm this is visible.",
      };
    }

    const visible = visibleByName.get(matchedFixture.toLowerCase()) ?? false;
    if (visible) {
      return {
        itemText,
        matchedFixture,
        visibleInPhoto: true,
        recommendation: "render",
        defaultChecked: true,
        reason: "Visible in this photo.",
      };
    }

    return {
      itemText,
      matchedFixture,
      visibleInPhoto: false,
      recommendation: "confirm",
      defaultChecked: false,
      reason: "Not clearly visible here — rendering it may look inaccurate.",
    };
  });
}

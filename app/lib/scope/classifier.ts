/**
 * Keyword-based classifier for scope-breakdown rows (Phase 8C).
 *
 * Inspects a room's scope narrative + room name and returns the primary
 * trade category, used to drive the per-row icon + grouping on the
 * scope-breakdown slide.
 *
 * Strategy:
 *   1. Score each candidate category by counting regex hits across the
 *      narrative + room name.
 *   2. Return the highest-scoring category; "other" when no category wins.
 *   3. Priority ordering resolves ties deterministically.
 *
 * This is intentionally dumb / deterministic / zero-cost. Rooms where the
 * classifier misfires can be fixed via the InspectorPanel dropdown, which
 * flips `manuallyClassified = true` on the row so subsequent syncs leave
 * it alone.
 */

import type { ScopeCategory } from "@/app/lib/deck/types";

type Rule = { category: ScopeCategory; patterns: RegExp[] };

/**
 * Category rules. Order matters ONLY as tiebreaker — highest-scoring
 * category wins; on a tie, the first-declared category wins. The order
 * below reflects which category most deserves the slot when a scope
 * mentions multiple trades.
 *
 * Keep the regex set small and intentional. It's OK to miss edge cases;
 * the manual override is the correctness net.
 */
const RULES: Rule[] = [
  {
    category: "demolition",
    patterns: [
      /\b(demo(?:lition|lish)?|remove|removal|tear[- ]?out|haul[- ]?away|dispose|disposal|gut)\b/i,
    ],
  },
  {
    category: "systems",
    patterns: [
      /\b(electric(?:al)?|plumb(?:ing)?|hvac|duct(?:work)?|mechanical|rough[- ]?in|wiring|panel|breaker|service|water[- ]?heater|waterline)\b/i,
    ],
  },
  {
    category: "cabinetry",
    patterns: [
      /\b(cabinet(?:ry|s)?|vanity|vanities|built[- ]?in(?:s)?|millwork|shelving|closet system|kitchen island|pantry cabinet)\b/i,
    ],
  },
  {
    category: "surfaces",
    patterns: [
      /\b(floor(?:ing)?|countertop(?:s)?|back[- ]?splash|tile(?:work)?|paint(?:ing)?|drywall|skim[- ]?coat|trim|baseboard|moulding|molding|wall covering|wallpaper|hardwood|LVP|engineered wood)\b/i,
    ],
  },
  {
    category: "lighting",
    patterns: [
      /\b(light(?:ing)?|fixture|sconce|pendant|recessed|can light|chandelier|LED|wall wash|cove light)\b/i,
    ],
  },
];

/** Count total regex hits for a single rule against a piece of text. */
function scoreRule(rule: Rule, text: string): number {
  let count = 0;
  for (const re of rule.patterns) {
    // Use global copy so we can count, not just test.
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const matches = text.match(global);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Classify a scope row into one of the six ScopeCategory buckets.
 *
 * Combines the scope narrative text + room name (names like "Powder Bath"
 * nudge toward surfaces/cabinetry via the room-name hit).
 *
 * @returns the winning category; "other" when nothing matches.
 */
export function classifyScopeItem(
  narrative: string | null | undefined,
  roomName: string | null | undefined,
): ScopeCategory {
  const text = `${narrative ?? ""} ${roomName ?? ""}`.trim();
  if (!text) return "other";

  let best: { category: ScopeCategory; score: number } | null = null;
  for (const rule of RULES) {
    const score = scoreRule(rule, text);
    if (score > 0 && (best === null || score > best.score)) {
      best = { category: rule.category, score };
    }
  }
  return best?.category ?? "other";
}

/**
 * Display-group classifier for the Investment tab / deck Investment slide.
 *
 * Each Room is assigned a `displayGroupId` (slug) at creation time. After
 * that, user drag operations are the only thing that changes it. The
 * classifier never runs a second time on a given Room — renames don't
 * re-trigger classification.
 *
 * See INVESTMENT_REFACTOR_INVESTIGATION.md for the ruleset validation
 * against real production data (74 rooms across 10 projects).
 */

// ─── Slug taxonomy ───────────────────────────────────────────────────────────

/** Fixed (shared) group slugs — one instance per project. */
export type FixedGroupSlug =
  | "primary-suite"
  | "kitchen-dining"
  | "living-spaces"
  | "utility"
  | "outdoor"
  | "storage"
  | "ungrouped"
  | "cope";

/** Individualized group slugs — one per room, suffix = Room.id. */
export type IndividualizedGroupSlug =
  | `bedroom-${string}`
  | `bathroom-${string}`
  | `carolina-room-${string}`;

/**
 * User-promoted standalone slug — Phase 8A.1c. Created when a user drags a
 * child out of a multi-room group and drops it at the root level. The
 * classifier never emits this slug; it appears only via user drag actions.
 * Suffix = Room.id of the single member.
 */
export type StandaloneGroupSlug = `standalone-${string}`;

export type DisplayGroupSlug =
  | FixedGroupSlug
  | IndividualizedGroupSlug
  | StandaloneGroupSlug;

/** Default render order when Project.displayGroupOrder is empty/missing. */
export const DEFAULT_GROUP_ORDER: FixedGroupSlug[] = [
  "primary-suite",
  "kitchen-dining",
  "living-spaces",
  // Individualized groups (bedroom-*, bathroom-*, carolina-room-*) slot in
  // here at render time — sorted alphabetically by room name.
  "utility",
  "outdoor",
  "storage",
  "ungrouped",
  "cope", // always last, server-forced
];

export type DisplayGroupDefinition = {
  label: string;
  individualized: boolean;
  /** Default sort position among other individualized groups of the same kind. */
  renderCategory:
    | "primary-suite"
    | "kitchen-dining"
    | "living-spaces"
    | "bedroom"
    | "bathroom"
    | "carolina-room"
    | "standalone"
    | "utility"
    | "outdoor"
    | "storage"
    | "ungrouped"
    | "cope";
};

export const FIXED_GROUPS: Record<FixedGroupSlug, DisplayGroupDefinition> = {
  "primary-suite": { label: "Primary Suite", individualized: false, renderCategory: "primary-suite" },
  "kitchen-dining": { label: "Kitchen & Dining", individualized: false, renderCategory: "kitchen-dining" },
  "living-spaces": { label: "Living Spaces", individualized: false, renderCategory: "living-spaces" },
  utility: { label: "Utility Rooms", individualized: false, renderCategory: "utility" },
  outdoor: { label: "Outdoor", individualized: false, renderCategory: "outdoor" },
  storage: { label: "Storage", individualized: false, renderCategory: "storage" },
  ungrouped: { label: "(Ungrouped)", individualized: false, renderCategory: "ungrouped" },
  cope: { label: "Cost of Project Execution", individualized: false, renderCategory: "cope" },
};

// ─── Regex rules ────────────────────────────────────────────────────────────
// Kept as top-level constants so tests can verify them directly.

const RE_PRIMARY = /\b(primary|master)\b/i;
const RE_KITCHEN_DINING = /\b(kitchen|pantry|breakfast\s+nook|dining|wet\s+bar)\b/i;
const RE_LIVING_SPACES = /\b(living\s+room|family\s+room|great\s+room|entry\s+way|foyer)\b/i;
const RE_BEDROOM = /\bbedroom\b/i;
const RE_BATHROOM = /\b(bath|powder|jack\s*(?:and|&|-)?\s*jill)\b/i;
const RE_CAROLINA_ROOM = /\bcarolina\s+room\b/i;
const RE_UTILITY = /\b(laundry|mud\s?room)\b/i;
const RE_OUTDOOR = /\b(exterior|outdoor|patio|deck|porch|lanai|yard|pool)\b/i;
const RE_STORAGE = /\b(attic|basement|garage|storage)\b/i;
const RE_CLOSET = /\bcloset\b/i;
const RE_COPE = /\b(cope|cost\s+of\s+project\s+execution)\b/i;

// ─── Classifier input type ──────────────────────────────────────────────────

export type RoomForClassification = {
  id: string;
  name: string;
  isProjectOverhead: boolean;
};

// ─── Public classifier ──────────────────────────────────────────────────────

/**
 * Assigns a displayGroupId slug to a Room at creation time.
 *
 * Priority order (first match wins):
 *   1. isProjectOverhead → "cope" (hard gate)
 *   2. name matches /cope|cost of project execution/ → "cope" (belt-and-suspenders)
 *   3. name matches /primary|master/ → "primary-suite"
 *   4. name matches kitchen/dining tokens → "kitchen-dining"
 *   5. name matches living tokens → "living-spaces"
 *   6. name matches /carolina room/ → "carolina-room-<id>"
 *   7. name matches /laundry|mudroom/ → "utility"
 *   8. name matches outdoor tokens → "outdoor"
 *   9. name matches /attic|basement|garage|storage/ → "storage"
 *  10. name matches /bedroom/ → "bedroom-<id>"
 *  11. name matches bath tokens → "bathroom-<id>"
 *  12. Closet with bedroom-name substring match → "bedroom-<matched-id>"
 *  13. Fallback → "ungrouped"
 *
 * Closets nest into their parent bedroom by substring match on the parent's
 * name (e.g., "Bedroom 2 Closet" contains "Bedroom 2" → bedroom-<b2.id>).
 * If no bedroom sibling matches, the closet falls to "ungrouped".
 */
export function classifyRoomToDisplayGroup(
  room: RoomForClassification,
  siblingRooms: readonly RoomForClassification[]
): DisplayGroupSlug {
  // 1. COPE always wins when flagged.
  if (room.isProjectOverhead) return "cope";

  const name = room.name.trim();
  if (!name) return "ungrouped";

  // 2. Belt-and-suspenders for COPE-named rooms that somehow slipped past the flag.
  if (RE_COPE.test(name)) return "cope";

  // 3. Primary Suite — beats everything else (including bathroom/bedroom rules).
  if (RE_PRIMARY.test(name)) return "primary-suite";

  // 4–9. Fixed-group rules in priority order.
  if (RE_KITCHEN_DINING.test(name)) return "kitchen-dining";
  if (RE_LIVING_SPACES.test(name)) return "living-spaces";
  if (RE_CAROLINA_ROOM.test(name)) return `carolina-room-${room.id}`;
  if (RE_UTILITY.test(name)) return "utility";
  if (RE_OUTDOOR.test(name)) return "outdoor";
  if (RE_STORAGE.test(name)) return "storage";

  // 10. Closet → check FIRST, because closets like "Bedroom 2 Closet" would
  //     otherwise get caught by the generic bedroom regex and assigned their
  //     OWN id instead of nesting into the parent bedroom's slug.
  //     If no parent match, fall through to the bedroom/bathroom rules.
  if (RE_CLOSET.test(name)) {
    const parent = findParentBedroomForCloset(name, siblingRooms);
    if (parent) return `bedroom-${parent.id}`;
    // Closet with no matched parent bedroom — fall through to ungrouped.
    return "ungrouped";
  }

  // 11. Bedrooms — individualized per room.
  if (RE_BEDROOM.test(name)) return `bedroom-${room.id}`;

  // 12. Bathrooms — individualized per room.
  if (RE_BATHROOM.test(name)) return `bathroom-${room.id}`;

  // 13. Fallback.
  return "ungrouped";
}

/**
 * Given a closet's name and the sibling rooms on the same project, return
 * the bedroom whose name appears as a substring of the closet's name.
 *
 * "Bedroom 2 Closet" + siblings ["Bedroom 2", "Bedroom 3"] → "Bedroom 2".
 * "Walk-in Closet" + siblings ["Bedroom 2"] → null (no match).
 *
 * Primary-named rooms are excluded (they use the "primary-suite" slug, not
 * the individualized bedroom- slug).
 */
function findParentBedroomForCloset(
  closetName: string,
  siblings: readonly RoomForClassification[]
): RoomForClassification | null {
  const closetLower = closetName.toLowerCase();
  for (const s of siblings) {
    const sibLower = s.name.trim().toLowerCase();
    if (!sibLower) continue;
    if (!RE_BEDROOM.test(sibLower)) continue;
    if (RE_PRIMARY.test(sibLower)) continue; // primary rooms don't own sub-closets
    if (closetLower.includes(sibLower)) return s;
  }
  return null;
}

// ─── Convenience: resolve label + category for a given slug ─────────────────

export type ResolvedGroup = {
  slug: DisplayGroupSlug;
  label: string;
  individualized: boolean;
  renderCategory: DisplayGroupDefinition["renderCategory"];
};

/**
 * Resolve a slug to a label + render category. Individualized slugs
 * (bedroom-xxx, bathroom-xxx, carolina-room-xxx) return a placeholder
 * label — the caller is expected to look up the actual room name by id.
 */
export function resolveGroup(slug: DisplayGroupSlug): ResolvedGroup {
  if (slug in FIXED_GROUPS) {
    const def = FIXED_GROUPS[slug as FixedGroupSlug];
    return { slug, ...def };
  }
  if (slug.startsWith("bedroom-")) {
    return { slug, label: "Bedroom", individualized: true, renderCategory: "bedroom" };
  }
  if (slug.startsWith("bathroom-")) {
    return { slug, label: "Bathroom", individualized: true, renderCategory: "bathroom" };
  }
  if (slug.startsWith("carolina-room-")) {
    return { slug, label: "Carolina Room", individualized: true, renderCategory: "carolina-room" };
  }
  if (slug.startsWith("standalone-")) {
    // Standalone groups always have exactly one member; the caller looks up
    // the actual room name by id and uses that as the label.
    return { slug, label: "Standalone", individualized: true, renderCategory: "standalone" };
  }
  // Unknown slug — treat as ungrouped.
  return { slug, label: "(Unknown)", individualized: false, renderCategory: "ungrouped" };
}

/** Shape guard for TypeScript narrowing when we have unknown string input. */
export function isKnownDisplayGroupSlug(slug: string): slug is DisplayGroupSlug {
  if (slug in FIXED_GROUPS) return true;
  return (
    slug.startsWith("bedroom-") ||
    slug.startsWith("bathroom-") ||
    slug.startsWith("carolina-room-") ||
    slug.startsWith("standalone-")
  );
}

/**
 * Phase 8A.1c — helper for the "+ Add Group" dropdown to detect rooms that
 * can have their original individualized group identity restored.
 *
 * Returns the original individualized slug if the room's name matches a
 * bedroom / bathroom / carolina-room rule (and the room is not primary).
 * Used when the user clicks "Restore 'Bedroom 2' group" — the room's
 * displayGroupId moves from `standalone-<id>` back to its individualized
 * slug.
 */
export function originalIndividualizedSlugFor(
  room: RoomForClassification
): IndividualizedGroupSlug | null {
  const name = room.name.trim();
  if (!name) return null;
  if (RE_PRIMARY.test(name)) return null;
  if (RE_CAROLINA_ROOM.test(name)) return `carolina-room-${room.id}`;
  if (RE_BEDROOM.test(name)) return `bedroom-${room.id}`;
  if (RE_BATHROOM.test(name)) return `bathroom-${room.id}`;
  return null;
}

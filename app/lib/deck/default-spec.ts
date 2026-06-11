import type { SlideType, SlideLayoutKey } from "./types";

/**
 * A single slot in the default deck. Describes which slide type lands at
 * which order, along with the default layout and any locking metadata.
 *
 * Content defaults are NOT part of the spec — seed/backfill layers those in
 * from global settings (core-values, cope, next-steps, etc.).
 */
export type DefaultSlideSpec = {
  type: SlideType;
  order: number;
  layoutKey: SlideLayoutKey;
  isLocked?: boolean;
  lockPosition?: "first" | "last";
};

/** Minimal project shape the spec needs to make conditional decisions. */
export type ProjectForDeckSpec = {
  rooms: { id: string }[];
  hasAddition?: boolean;
};

/**
 * Slide types whose rows are created by the auto-sync pipeline, not by the
 * seed/backfill. These appear in the spec (so the spec is a complete picture
 * of the default deck), but seed/backfill must skip them — the sync fns own
 * their lifecycle.
 */
export const AUTO_SYNCED_SLIDE_TYPES: ReadonlySet<SlideType> = new Set([
  "before-after",
  "scope-breakdown",
]);

/**
 * Single source of truth for the default deck composition.
 *
 * Returns the ordered list of slide slots that comprise a project's default
 * deck. The seed function and backfill loop both call this — never hardcode
 * a slide list elsewhere.
 *
 * Conditional gates:
 *   - scope-breakdown: project has 2+ rooms
 *   - addition-overview: project.hasAddition === true
 *
 * Slides moved to the optional library (available via + Add Slide dropdown,
 * not included here): design-build, our-process, core-values, testimonials.
 *
 * Order values are spaced 100 apart for insertion headroom.
 */
export function buildDefaultDeckSpec(project: ProjectForDeckSpec): DefaultSlideSpec[] {
  const specs: DefaultSlideSpec[] = [
    {
      type: "cover",
      order: 100,
      layoutKey: "right-panel-overlay",
      isLocked: true,
      lockPosition: "first",
    },
    {
      type: "objective",
      order: 200,
      layoutKey: "light-statement",
    },
    {
      type: "scope-overview",
      order: 300,
      layoutKey: "editorial-split",
    },
  ];

  // Before/After slides come first (auto-sync expands one per rendered room),
  // followed by Scope Breakdown for any rooms that don't have a render yet.
  // Sync layer mirrors this with anchor+0.2 (before-after) → anchor+0.3
  // (scope-breakdown), so spec order and runtime order agree.
  specs.push({
    type: "before-after",
    order: 400,
    layoutKey: "after-emphasis",
  });

  if (project.rooms.length >= 2) {
    specs.push({
      type: "scope-breakdown",
      order: 500,
      layoutKey: "text-grid",
    });
  }

  specs.push(
    {
      type: "cope",
      order: 600,
      layoutKey: "icon-columns",
    },
    {
      type: "why-us",
      order: 800,
      layoutKey: "guarantee-grid",
    },
    {
      type: "design-experience",
      order: 850,
      layoutKey: "stepped-circles",
    },
    {
      type: "timeline",
      order: 900,
      layoutKey: "week-axis",
    },
    {
      type: "investment-by-space",
      order: 1000,
      layoutKey: "table-callout",
    },
    {
      type: "overall-investment",
      order: 1100,
      layoutKey: "three-band-summary",
    },
    {
      type: "next-steps",
      order: 1200,
      layoutKey: "numbered-photo",
    },
  );

  if (project.hasAddition === true) {
    specs.push({
      type: "addition-overview",
      order: 1300,
      layoutKey: "photo-cad-overlay",
    });
  }

  specs.push({
    type: "closing",
    order: 1400,
    layoutKey: "blueprint-split",
    isLocked: true,
    lockPosition: "last",
  });

  return specs;
}

/**
 * Convenience: the set of slide types in the default deck for a given project.
 * Used by backfill to decide which missing types to create.
 */
export function getDefaultDeckSlideTypes(project: ProjectForDeckSpec): Set<SlideType> {
  return new Set(buildDefaultDeckSpec(project).map((s) => s.type));
}

/**
 * Every slide type that the default-spec might emit, ignoring per-project
 * conditional gates. Used by the editor to decide whether removing a slide
 * should hard-delete or soft-hide: spec types must soft-hide so the load-time
 * backfill in `getDeckForProject` doesn't resurrect them. Optional types
 * (our-process, core-values, design-build, testimonials) are
 * NOT in this set, so removing them hard-deletes.
 */
export const DEFAULT_SPEC_SLIDE_TYPES: ReadonlySet<SlideType> = new Set([
  "cover",
  "objective",
  "scope-overview",
  "before-after",
  "scope-breakdown",
  "cope",
  "why-us",
  "design-experience",
  "timeline",
  "investment-by-space",
  "overall-investment",
  "next-steps",
  "addition-overview",
  "closing",
]);

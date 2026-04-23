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
 * not included here): risk-brief, design-build-advantage, process,
 * core-values, client-testimonials.
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
      layoutKey: "split-panel",
    },
  ];

  if (project.rooms.length >= 2) {
    specs.push({
      type: "scope-breakdown",
      order: 400,
      layoutKey: "text-grid",
    });
  }

  specs.push(
    {
      type: "before-after",
      order: 500,
      layoutKey: "side-by-side",
    },
    {
      type: "cope-page",
      order: 600,
      layoutKey: "icon-columns",
    },
    {
      type: "visual-inspiration",
      order: 700,
      layoutKey: "hero-plus-stacked",
    },
    {
      type: "why-us",
      order: 800,
      layoutKey: "pillars-grid",
    },
    {
      type: "project-timeline",
      order: 900,
      layoutKey: "vertical-dot",
    },
    {
      type: "investment",
      order: 1000,
      layoutKey: "table-callout",
    },
    {
      type: "design-retainer",
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
    type: "closing-slide",
    order: 1400,
    layoutKey: "dark-centered",
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

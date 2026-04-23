/**
 * Deck persistence & auto-sync engine.
 *
 * This module is the single source of truth for reading and writing
 * ProposalDeck + DeckSlide records.  It is NOT a "use server" module —
 * it is a plain server-side library imported by server components and
 * server actions alike.
 *
 * Gap-based ordering (Phase 8A — spaced 100 apart for insertion headroom):
 *   cover             100   (locked first)
 *   objective         200
 *   scope-overview    300
 *   scope-breakdown   400                       (auto, if rooms.length >= 2)
 *   before-after      500 + roomIndex * 10      (auto, per room)
 *   cope-page         600
 *   visual-inspir     700
 *   why-us            800
 *   project-timeline  900
 *   investment       1000
 *   design-retainer  1100
 *   next-steps       1200
 *   addition-overview 1300  (only if project.hasAddition === true)
 *   closing-slide    1400   (locked last)
 *
 * Composition is defined in `default-spec.ts` — seed + backfill both call
 * `buildDefaultDeckSpec(project)`. Never hardcode a slide list here.
 *
 * Optional slides (not in default spec; added manually via + Add Slide):
 *   risk-brief, process, core-values, design-build-advantage,
 *   client-testimonials.
 */

import { prisma } from "@/app/lib/prisma";
import { stripScopeClarifications } from "@/app/lib/scope-narrative";
import { getCoreValuesDefaults } from "@/app/lib/core-values-defaults.server";
import { getCopeDefaults } from "@/app/lib/cope-defaults.server";
import { getNextStepsDefaults } from "@/app/lib/next-steps-defaults.server";
import { getDesignBuildDefaults } from "@/app/lib/design-build-defaults.server";
import type {
  ProposalSlide,
  SlideContent,
  RoomWithMedia,
  BeforeAfterContent,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  InvestmentContent,
  ProjectTimelineContent,
  ProjectPhase,
  DesignRetainerContent,
} from "./types";
import { buildProjectPhases } from "@/app/lib/timeline-phases";
import { computeRetainer, formatRetainerAmount } from "@/app/lib/retainer";
import {
  buildDefaultDeckSpec,
  AUTO_SYNCED_SLIDE_TYPES,
  type DefaultSlideSpec,
  type ProjectForDeckSpec,
} from "./default-spec";

// ─── Internal type alias ─────────────────────────────────────────────────────

type DbRow = Awaited<ReturnType<typeof prisma.deckSlide.findFirstOrThrow>>;

// ─── Row ↔ Slide converters ──────────────────────────────────────────────────

function dbToSlide(row: DbRow): ProposalSlide {
  return {
    id: row.id,
    type: row.type as ProposalSlide["type"],
    layoutKey: row.layoutKey as ProposalSlide["layoutKey"],
    order: row.order,
    isEnabled: row.isEnabled,
    isUserHidden: row.isUserHidden,
    isUserModified: row.isUserModified,
    source: row.source as "auto" | "manual",
    sectionId: row.sectionId,
    headline: row.headline,
    subheadline: row.subheadline,
    body: row.body,
    content:
      row.content !== null
        ? (row.content as unknown as SlideContent)
        : undefined,
    isLocked: row.isLocked,
    lockPosition:
      row.lockPosition === "first" || row.lockPosition === "last"
        ? row.lockPosition
        : undefined,
    backgroundId: (row as { backgroundId?: string | null }).backgroundId ?? null,
    textZone: (row as { textZone?: unknown }).textZone
      ? ((row as { textZone?: unknown }).textZone as import("@/app/lib/deck/types").TextZoneSetting)
      : null,
    aiBackground: (row as { aiBackground?: string | null }).aiBackground ?? null,
  };
}

// ─── Default slide content builder ───────────────────────────────────────────

type SeedContext = {
  projectTitle: string;
  clientName: string | null;
  address: string | null;
  cvDefaults?: import("@/app/lib/core-values-defaults").GlobalCoreValuesSettings;
  copeDefaults?: import("@/app/lib/cope-defaults").GlobalCopeSettings;
  nextStepsDefaults?: import("@/app/lib/next-steps-defaults").GlobalNextStepsSettings;
  designBuildDefaults?: import("@/app/lib/design-build-defaults").GlobalDesignBuildSettings;
};

type SlideRowData = {
  type: string;
  layoutKey: string;
  order: number;
  isEnabled: boolean;
  isLocked: boolean;
  lockPosition: "first" | "last" | null;
  source: "auto" | "manual";
  headline: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
};

/**
 * Produces the full DB row payload for a given default slot. Returns null for
 * slide types that are owned by the auto-sync pipeline (before-after,
 * scope-breakdown) — those rows are created by the sync functions, not seed.
 *
 * Global default settings (core values, cope, next steps, design-build) are
 * layered onto the hardcoded defaults where present.
 */
function buildSlideDataFromSpec(
  spec: DefaultSlideSpec,
  ctx: SeedContext,
): SlideRowData | null {
  if (AUTO_SYNCED_SLIDE_TYPES.has(spec.type)) return null;

  const base = {
    order: spec.order,
    isEnabled: true,
    isLocked: spec.isLocked ?? false,
    lockPosition: spec.lockPosition ?? null,
    source: "manual" as const,
  };

  switch (spec.type) {
    case "cover":
      return {
        ...base,
        type: "cover",
        layoutKey: spec.layoutKey,
        headline: ctx.projectTitle,
        content: {
          heroImageUrl: null,
          preparedFor: ctx.clientName,
          tagline: null,
          date: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        },
      };

    case "objective":
      return {
        ...base,
        type: "objective",
        layoutKey: spec.layoutKey,
        headline: "Project Objective",
        content: { statementText: null, supportingText: null, bullets: [] },
      };

    case "scope-overview":
      return {
        ...base,
        type: "scope-overview",
        layoutKey: spec.layoutKey,
        headline: "Project Scope",
        content: { description: null, selectedPhotos: [] },
      };

    case "cope-page":
      return {
        ...base,
        type: "cope-page",
        layoutKey: ctx.copeDefaults?.defaultLayout ?? spec.layoutKey,
        headline: ctx.copeDefaults?.defaultHeadline ?? "The Cost of Project Execution",
        content: {
          sectionLabel: ctx.copeDefaults?.defaultSectionLabel ?? "WHAT\u2019S INCLUDED",
          subheadline: ctx.copeDefaults?.defaultSubheadline ?? null,
          items: ctx.copeDefaults?.defaultItems ?? [],
        },
      };

    case "visual-inspiration":
      return {
        ...base,
        type: "visual-inspiration",
        layoutKey: spec.layoutKey,
        headline: "Design Inspiration",
        content: {
          subtitle: "A curated vision for your space.",
          photos: [],
        },
      };

    case "why-us":
      return {
        ...base,
        type: "why-us",
        layoutKey: spec.layoutKey,
        headline: "The HHI Difference",
        content: { sectionTitle: null, pillars: [], selectedPillarIds: [] },
      };

    case "project-timeline":
      return {
        ...base,
        type: "project-timeline",
        layoutKey: spec.layoutKey,
        headline: "Projected Timeline",
        content: {
          sectionLabel: "YOUR PROJECT",
          phases: buildProjectPhases([]),
        },
      };

    case "investment":
      return {
        ...base,
        type: "investment",
        layoutKey: spec.layoutKey,
        headline: "Projected Investment",
        content: {
          lineItems: [],
          retainerLabel: null,
          retainerAmount: null,
          disclaimer: null,
          address: ctx.address,
        },
      };

    case "design-retainer":
      // Phase 8C: seed as "Your Investment" + three-band-summary layout. The
      // retainerAmount is a placeholder until syncRetainerFromProject computes
      // the real value on first deck load. Benefits match the locked Phase 8C
      // copy verbatim (DEFAULT_DESIGN_RETAINER_BENEFITS).
      return {
        ...base,
        type: "design-retainer",
        layoutKey: spec.layoutKey,
        headline: "Your Investment",
        content: {
          sectionLabel: "YOUR INVESTMENT",
          tagline: "Your investment in certainty before construction begins.",
          retainerAmount: "$22,000",
          benefits: [
            "Full architectural design and space planning",
            "HOA / ARB submission and approval management",
            "Complete material and finish specifications",
            "Fixed-price build contract before construction begins",
          ],
        },
      };

    case "next-steps":
      return {
        ...base,
        type: "next-steps",
        layoutKey: ctx.nextStepsDefaults?.defaultLayout ?? spec.layoutKey,
        headline: ctx.nextStepsDefaults?.defaultHeadline ?? "Your Path Forward",
        content: {
          sectionLabel: ctx.nextStepsDefaults?.defaultSectionLabel ?? "WHAT HAPPENS NEXT",
          contactEmail: ctx.nextStepsDefaults?.defaultContactEmail ?? null,
          contactPhone: ctx.nextStepsDefaults?.defaultContactPhone ?? null,
          steps: ctx.nextStepsDefaults?.defaultSteps ?? [],
        },
      };

    case "addition-overview":
      return {
        ...base,
        type: "addition-overview",
        layoutKey: spec.layoutKey,
        headline: "Proposed Addition Area",
        content: {
          cadGenerationStatus: null,
          boundingBox: null,
          calloutLabel: null,
          bullets: [],
        },
      };

    case "closing-slide":
      return {
        ...base,
        type: "closing-slide",
        layoutKey: spec.layoutKey,
        headline: "Let\u2019s Build Something Extraordinary",
        content: {
          tagline: "Design. Build. Remodel.",
          validityNote: "This proposal is valid for 30 days.",
        },
      };

    // Types that are reclassified as optional (NOT in default spec) but still
    // fully supported when added manually. If they ever appear in the spec in
    // the future, these builders remain valid.
    case "risk-brief":
      return {
        ...base,
        type: "risk-brief",
        layoutKey: spec.layoutKey,
        headline: "The Stress-Free Remodel: How We Eliminate Common Risks",
        content: {
          leftHeader: "Why Remodels Go Wrong",
          leftBullets: [
            "Too many separate contractors means no single person is accountable.",
            "Designs get approved before anyone confirms they fit the budget.",
            "Hidden problems get discovered mid-construction, stalling everything.",
          ],
          rightHeader: "How We Prevent That",
          rightBullets: [
            "One team handles design and construction from start to finish.",
            "Your budget is set before a single detail is finalized.",
            "We identify and resolve potential issues before work ever begins.",
          ],
          rowLabels: ["Accountability", "Budgeting", "Design"],
          bottomStatement:
            "You'll know exactly what's being built, what it costs, and what to expect — before construction starts.",
        },
      };

    case "process":
      return {
        ...base,
        type: "process",
        layoutKey: spec.layoutKey,
        headline: "Our Process: From Vision to Finished Home",
        content: {
          stages: [
            {
              name: "Discovery & Design",
              bullets: [
                "We learn your goals, priorities, and how you use your space.",
                "Scope and early budget direction are established upfront.",
                "Potential issues are identified before they become surprises.",
              ],
            },
            {
              name: "Plan & Select",
              bullets: [
                "Layouts, materials, and finishes are finalized to match your vision.",
                "Every selection is reviewed against your target investment.",
                "A complete, build-ready plan is approved before construction begins.",
              ],
            },
            {
              name: "Build & Deliver",
              bullets: [
                "A dedicated project team executes the work from start to finish.",
                "You receive regular updates so you always know what's happening.",
                "Your home is returned clean, complete, and ready to enjoy.",
              ],
            },
          ],
          bottomStatement:
            "Every detail is planned before we break ground—so the build stays on schedule, on budget, and free of surprises.",
        },
      };

    case "core-values":
      return {
        ...base,
        type: "core-values",
        layoutKey: ctx.cvDefaults?.defaultLayout ?? spec.layoutKey,
        headline: ctx.cvDefaults?.defaultHeadline ?? "Built on a Foundation of Values",
        content: {
          sectionLabel: ctx.cvDefaults?.defaultSectionLabel ?? "WHO WE ARE",
          values: ctx.cvDefaults?.defaultValues ?? [],
        },
      };

    case "design-build-advantage":
      return {
        ...base,
        type: "design-build-advantage",
        layoutKey: ctx.designBuildDefaults?.defaultLayout ?? spec.layoutKey,
        headline:
          ctx.designBuildDefaults?.defaultHeadline ?? "The Design-Build Advantage",
        content: {
          pillars: ctx.designBuildDefaults?.defaultPillars ?? [],
          guarantees: ctx.designBuildDefaults?.defaultGuarantees ?? [],
          diagramNodes: ctx.designBuildDefaults?.defaultDiagramNodes ?? [],
          supportColumns: ctx.designBuildDefaults?.defaultSupportColumns ?? [],
        },
      };

    case "client-testimonials":
      return {
        ...base,
        type: "client-testimonials",
        layoutKey: spec.layoutKey,
        headline: "What Our Clients Say",
        content: {
          showStars: true,
          testimonials: [],
        },
      };

    // before-after and scope-breakdown fall through — returned as null above.
    default:
      return null;
  }
}

// ─── Default slide seeds ──────────────────────────────────────────────────────

async function seedDefaultSlides(
  deckId: string,
  project: ProjectForDeckSpec,
  ctx: SeedContext,
): Promise<void> {
  const spec = buildDefaultDeckSpec(project);
  const rows = spec
    .map((slot) => buildSlideDataFromSpec(slot, ctx))
    .filter((r): r is SlideRowData => r !== null)
    .map((r) => ({ ...r, deckId }));

  if (rows.length === 0) return;

  await prisma.deckSlide.createMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: rows as any,
  });
}

// ─── Auto-sync: Before/After slides ──────────────────────────────────────────

async function syncBeforeAfterSlides(
  deckId: string,
  existing: DbRow[],
  rooms: RoomWithMedia[]
): Promise<void> {
  // Rooms eligible for a before/after slide: must have a selected render + at
  // least one before photo.
  const eligible = rooms.filter(
    (r) => r.selectedRenderMediaId && r.beforeMedia.length > 0
  );
  if (eligible.length === 0) return;

  // Index existing before-after slides by roomId for O(1) lookup.
  const existingByRoom = new Map<string, DbRow>();
  const hiddenRoomIds = new Set<string>();
  for (const row of existing) {
    if (row.type !== "before-after") continue;
    const c = row.content as BeforeAfterContent | null;
    if (!c?.roomId) continue;
    if (row.isUserHidden) {
      hiddenRoomIds.add(c.roomId);
    } else {
      existingByRoom.set(c.roomId, row);
    }
  }

  for (let i = 0; i < eligible.length; i++) {
    const room = eligible[i];

    // Resolve the selected render.
    const selectedRender =
      room.renderMedia.find((m) => m.id === room.selectedRenderMediaId) ??
      room.renderMedia[0];
    if (!selectedRender) continue;

    const beforeMedia = room.beforeMedia[0];
    const caption = stripScopeClarifications(room.scopeNarrative ?? "") || null;
    const order = 500 + i * 10;

    const existingRow = existingByRoom.get(room.id);

    if (existingRow) {
      // Slide already exists — refresh render + caption unless user modified it.
      if (existingRow.isUserModified) continue;

      const currentContent = (existingRow.content ?? {}) as BeforeAfterContent;
      const updatedContent: BeforeAfterContent = {
        ...currentContent,
        roomName: room.name,
        afterMediaId: selectedRender.id,
        afterImageUrl: selectedRender.url,
        caption,
      };

      await prisma.deckSlide.update({
        where: { id: existingRow.id },
        data: {
          headline: room.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: updatedContent as any,
        },
      });
    } else {
      // Don't recreate a slide the user explicitly dismissed.
      if (hiddenRoomIds.has(room.id)) continue;

      const content: BeforeAfterContent = {
        roomId: room.id,
        roomName: room.name,
        beforeMediaId: beforeMedia.id,
        afterMediaId: selectedRender.id,
        beforeImageUrl: beforeMedia.url,
        afterImageUrl: selectedRender.url,
        caption,
      };

      await prisma.deckSlide.create({
        data: {
          deckId,
          type: "before-after",
          layoutKey: "side-by-side",
          order,
          isEnabled: true,
          isUserHidden: false,
          isUserModified: false,
          source: "auto",
          headline: room.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: content as any,
          isLocked: false,
        },
      });
    }
  }
}

// ─── Auto-sync: Scope Breakdown slide ────────────────────────────────────────

async function syncScopeBreakdownSlide(
  deckId: string,
  existing: DbRow[],
  rooms: RoomWithMedia[]
): Promise<void> {
  // Rooms without a selected render need written scope coverage.
  // Exclude project-overhead (COPE) rooms — they have their own dedicated slide.
  const unrendered = rooms.filter((r) => !r.selectedRenderMediaId && !r.isProjectOverhead);
  if (unrendered.length === 0) return;

  // Find the auto scope-breakdown slide (at most one per deck).
  const existingRow = existing.find(
    (r) => r.type === "scope-breakdown" && r.source === "auto"
  );

  if (existingRow) {
    if (existingRow.isUserModified || existingRow.isUserHidden) return;

    // Merge rooms: preserve existing description + isIncluded; add new rooms.
    const existingContent = (existingRow.content ?? {}) as ScopeBreakdownContent;
    const existingRoomMap = new Map<string, ScopeBreakdownRoom>(
      (existingContent.rooms ?? []).map((r) => [r.id, r])
    );

    const mergedRooms: ScopeBreakdownRoom[] = unrendered.map((room) => {
      const prev = existingRoomMap.get(room.id);
      if (prev) {
        return {
          id: room.id,
          name: room.name, // name may have changed
          description: prev.description,
          isIncluded: prev.isIncluded,
        };
      }
      return {
        id: room.id,
        name: room.name,
        description: stripScopeClarifications(room.scopeNarrative ?? ""),
        isIncluded: true,
      };
    });

    const updatedContent: ScopeBreakdownContent = {
      ...existingContent,
      rooms: mergedRooms,
    };

    await prisma.deckSlide.update({
      where: { id: existingRow.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { content: updatedContent as any },
    });
  } else {
    const scopeRooms: ScopeBreakdownRoom[] = unrendered.map((room) => ({
      id: room.id,
      name: room.name,
      description: stripScopeClarifications(room.scopeNarrative ?? ""),
      isIncluded: true,
    }));

    const content: ScopeBreakdownContent = {
      title: null,
      introText:
        "These spaces are included in the project and will be completed to the same level of quality and detail.",
      rooms: scopeRooms,
      photos: [],
    };

    await prisma.deckSlide.create({
      data: {
        deckId,
        type: "scope-breakdown",
        layoutKey: "text-grid",
        order: 400,
        isEnabled: true,
        isUserHidden: false,
        isUserModified: false,
        source: "auto",
        headline: "Additional Areas Included",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: content as any,
        isLocked: false,
      },
    });
  }
}

// ─── Auto-sync: Investment slide (Phase 8A.1) ────────────────────────────────

/**
 * Keeps the investment slide content in sync with the project's Rooms,
 * grouped by Room.displayGroupId. Replaces the prior path that read from
 * `InvestmentLineItem` aggregate rollups.
 *
 * Pipeline:
 *   1. Fetch rooms with pricing + display-group metadata.
 *   2. Fetch Project.displayGroupOrder (user's saved group sequence).
 *   3. Filter out rooms with no pricing (both totalLow + totalHigh null).
 *   4. Group by displayGroupId. Sort within each group by displayGroupOrder.
 *   5. Sort groups: user-saved order → default priority → alphabetical.
 *      COPE always last.
 *   6. Emit one line item per group (summed range + "Includes:" descriptor).
 *
 * User-edited slides (isUserModified=true) remain immune — short-circuit.
 * InvestmentLineItem rows stay live (still consumed by the publish snapshot).
 */
async function syncInvestmentSlide(
  _deckId: string,
  projectId: string,
  existing: DbRow[]
): Promise<void> {
  // Find the investment slide — skip if the user has manually edited it.
  const investmentRow = existing.find((r) => r.type === "investment");
  if (!investmentRow || investmentRow.isUserModified) return;

  // 1. Rooms with pricing + grouping metadata.
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      bucket: true,
      totalLow: true,
      totalTarget: true,
      totalHigh: true,
      displayGroupId: true,
      displayGroupOrder: true,
      isProjectOverhead: true,
    },
  });

  // 2. Project's saved group order.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { displayGroupOrder: true },
  });
  const savedOrder: string[] = Array.isArray(project?.displayGroupOrder)
    ? (project!.displayGroupOrder as string[])
    : [];

  // 3. Filter rooms: drop any where both totalLow and totalHigh are null.
  const priced = rooms.filter((r) => r.totalLow != null || r.totalHigh != null);

  // 4. Group by displayGroupId.
  type GroupBucket = typeof priced[number][];
  const groups = new Map<string, GroupBucket>();
  for (const r of priced) {
    const slug = r.displayGroupId ?? "ungrouped";
    const arr = groups.get(slug) ?? [];
    arr.push(r);
    groups.set(slug, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      if (a.displayGroupOrder !== b.displayGroupOrder) {
        return a.displayGroupOrder - b.displayGroupOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }

  // 5. Sort group slugs: user-saved first, then default priority, COPE last.
  const userIndex = new Map(savedOrder.map((s, i) => [s, i]));
  const allSlugs = Array.from(groups.keys());
  allSlugs.sort((a, b) => {
    if (a === "cope" && b !== "cope") return 1;
    if (b === "cope" && a !== "cope") return -1;
    const aUser = userIndex.get(a);
    const bUser = userIndex.get(b);
    if (aUser !== undefined && bUser !== undefined) return aUser - bUser;
    if (aUser !== undefined) return -1;
    if (bUser !== undefined) return 1;
    const aPri = defaultSlugPriority(a);
    const bPri = defaultSlugPriority(b);
    if (aPri !== bPri) return aPri - bPri;
    return a.localeCompare(b);
  });

  // 6. Build grouped line items.
  const lineItems = allSlugs.flatMap((slug) => {
    const members = groups.get(slug);
    if (!members || members.length === 0) return [];

    let sumLow = 0;
    let sumHigh = 0;
    let sumTarget = 0;
    for (const m of members) {
      sumLow += m.totalLow ?? 0;
      sumHigh += m.totalHigh ?? 0;
      sumTarget += m.totalTarget ?? 0;
    }
    // Skip groups whose summed range is zero (they'd render "—").
    if (sumLow === 0 && sumHigh === 0) return [];

    const label = groupLabelFor(slug, members);
    const includesText = buildGroupIncludesText(members);
    const bucket = String(members[0].bucket ?? "BASE");

    return [{
      id: slug,
      label,
      bucket,
      rangeLow: sumLow,
      rangeTarget: sumTarget,
      rangeHigh: sumHigh,
      overrideLow: null,
      overrideTarget: null,
      overrideHigh: null,
      isOverride: false,
      includeInTotals: true,
      sortOrder: allSlugs.indexOf(slug),
      includesText: includesText ?? undefined,
    }];
  });

  const currentContent = (investmentRow.content ?? {}) as InvestmentContent;
  const updatedContent: InvestmentContent = {
    ...currentContent,
    lineItems,
  };

  await prisma.deckSlide.update({
    where: { id: investmentRow.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { content: updatedContent as any },
  });
}

/**
 * Default priority index for a display-group slug (used when neither the
 * saved order nor a specific rule applies).
 */
function defaultSlugPriority(slug: string): number {
  if (slug === "primary-suite") return 0;
  if (slug === "kitchen-dining") return 1;
  if (slug === "living-spaces") return 2;
  if (slug.startsWith("bedroom-")) return 3;
  if (slug.startsWith("bathroom-")) return 4;
  if (slug.startsWith("carolina-room-")) return 5;
  // Phase 8A.1c — user-promoted standalone groups slot between
  // individualized categories and housekeeping.
  if (slug.startsWith("standalone-")) return 6;
  if (slug === "utility") return 7;
  if (slug === "outdoor") return 8;
  if (slug === "storage") return 9;
  if (slug === "ungrouped") return 10;
  if (slug === "cope") return 99;
  return 10; // unknown — treat as ungrouped
}

/**
 * Group label: for individualized slugs (bedroom-xxx, bathroom-xxx,
 * carolina-room-xxx, standalone-xxx) use the first member's name. Otherwise
 * use a fixed human label.
 */
function groupLabelFor(slug: string, members: { name: string }[]): string {
  if (
    slug.startsWith("bedroom-") ||
    slug.startsWith("bathroom-") ||
    slug.startsWith("carolina-room-") ||
    slug.startsWith("standalone-")
  ) {
    return members[0]?.name ?? "(Unnamed)";
  }
  switch (slug) {
    case "primary-suite": return "Primary Suite";
    case "kitchen-dining": return "Kitchen & Dining";
    case "living-spaces": return "Living Spaces";
    case "utility": return "Utility Rooms";
    case "outdoor": return "Outdoor";
    case "storage": return "Storage";
    case "ungrouped": return members[0]?.name ?? "Additional";
    case "cope": return "Cost of Project Execution";
    default: return members[0]?.name ?? slug;
  }
}

/**
 * "Includes: X, Y, Z" descriptor. Null for single-member groups. Truncated
 * to 3 names + "… and N more" when there are 4+ members.
 */
function buildGroupIncludesText(members: { name: string }[]): string | null {
  if (members.length <= 1) return null;
  const names = members.map((m) => m.name);
  if (names.length <= 3) return `Includes: ${names.join(", ")}`;
  return `Includes: ${names.slice(0, 3).join(", ")}, … and ${names.length - 3} more`;
}

/**
 * Keeps the project-timeline slide's `content.phases` in sync with the project's
 * `TimelinePhase` records. Phase names/descriptions are hardcoded in
 * `TIMELINE_PHASE_DEFINITIONS`; only durations flow from the Timeline tab.
 *
 * Per-item style fields (nameFont, nameColor, etc.) on existing phases are
 * preserved — they are merged by id onto the canonical phase entries.
 */
async function syncProjectTimelineSlide(
  _deckId: string,
  projectId: string,
  existing: DbRow[]
): Promise<void> {
  const row = existing.find((r) => r.type === "project-timeline");
  if (!row) return;

  const timelinePhases = await prisma.timelinePhase.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: {
      phase: true,
      durationText: true,
      nameOverride: true,
      descriptionOverride: true,
    },
  });

  const canonical = buildProjectPhases(timelinePhases);
  const currentContent = (row.content ?? {}) as ProjectTimelineContent;
  const existingById = new Map(
    (currentContent.phases ?? []).map((p) => [p.id, p])
  );

  const mergedPhases: ProjectPhase[] = canonical.map((next) => {
    const prev = existingById.get(next.id);
    if (!prev) return next;
    return {
      ...prev,
      id: next.id,
      name: next.name,
      duration: next.duration,
      description: next.description,
    };
  });

  const updatedContent: ProjectTimelineContent = {
    ...currentContent,
    phases: mergedPhases,
  };

  await prisma.deckSlide.update({
    where: { id: row.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { content: updatedContent as any },
  });
}

/**
 * Syncs the project-level retainer settings onto:
 *  - the `design-retainer` slide's `retainerAmount` (formatted string), and
 *  - the `investment` slide's `retainerAmount` (number) + `retainerLabel`.
 *
 * User-modified slides are skipped (same convention as other sync fns), so
 * once an admin hand-edits the slide, auto-sync backs off.
 */
async function syncRetainerFromProject(
  _deckId: string,
  projectId: string,
  existing: DbRow[]
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      retainerEnabled: true,
      retainerPercent: true,
      retainerRoundTo: true,
      retainerOverride: true,
    },
  });
  if (!project) return;

  // Phase 8C: pull totalLow too so the retainer slide can render the
  // construction range in Band 2 and compute the Band 3 total.
  const rooms = await prisma.room.findMany({
    where: { projectId },
    select: { totalLow: true, totalHigh: true },
  });
  const subtotalLow = rooms.reduce((sum, r) => sum + (r.totalLow ?? 0), 0);
  const subtotalHigh = rooms.reduce((sum, r) => sum + (r.totalHigh ?? 0), 0);

  const amount = computeRetainer(subtotalHigh, {
    enabled: project.retainerEnabled,
    percent: project.retainerPercent,
    roundTo: project.retainerRoundTo,
    override: project.retainerOverride,
  });

  // Phase 8C: snapshot the tenant's published hourly rate into slide content
  // so published proposals stay stable even if the Settings value changes.
  const companySettings = await prisma.companySettings.findFirst({
    select: { designHourlyRate: true },
  });
  const designHourlyRate = companySettings?.designHourlyRate ?? null;

  // design-retainer slide — string amount + three-band-summary inputs
  const retainerRow = existing.find((r) => r.type === "design-retainer");
  if (retainerRow && !retainerRow.isUserModified) {
    const c = (retainerRow.content ?? {}) as DesignRetainerContent;
    const next: DesignRetainerContent = {
      ...c,
      retainerAmount: project.retainerEnabled ? formatRetainerAmount(amount) : null,
      retainerAmountNumber: project.retainerEnabled ? amount : null,
      retainerEnabled: project.retainerEnabled,
      constructionLow: subtotalLow > 0 ? subtotalLow : null,
      constructionHigh: subtotalHigh > 0 ? subtotalHigh : null,
      designHourlyRate,
    };
    await prisma.deckSlide.update({
      where: { id: retainerRow.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { content: next as any },
    });
  }

  // investment slide — numeric amount for table footer
  const investmentRow = existing.find((r) => r.type === "investment");
  if (investmentRow && !investmentRow.isUserModified) {
    const c = (investmentRow.content ?? {}) as InvestmentContent;
    const next: InvestmentContent = {
      ...c,
      retainerAmount: project.retainerEnabled ? amount : null,
      retainerLabel: project.retainerEnabled
        ? (c.retainerLabel ?? "Design / Feasibility Retainer")
        : null,
    };
    await prisma.deckSlide.update({
      where: { id: investmentRow.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { content: next as any },
    });
  }
}

// ─── Backfill: default slides added after initial seed ────────────────────────

/**
 * Ensures every slot in `buildDefaultDeckSpec(project)` exists in an
 * already-seeded deck. Called on every page load so decks created before a
 * new default was added automatically receive that slide.
 *
 * Only creates slides that are completely absent — never overwrites existing
 * rows. Auto-synced types (before-after, scope-breakdown) are skipped; their
 * sync functions own them. Reclassified slides (risk-brief, process,
 * core-values, design-build-advantage, client-testimonials) are NOT in the
 * spec, so backfill will not resurrect them if a user removes them.
 */
async function backfillMissingDefaults(
  deckId: string,
  existing: DbRow[],
  project: ProjectForDeckSpec,
  ctx: SeedContext,
): Promise<void> {
  const existingTypes = new Set(existing.map((r) => r.type));
  const spec = buildDefaultDeckSpec(project);

  for (const slot of spec) {
    if (existingTypes.has(slot.type)) continue;
    const row = buildSlideDataFromSpec(slot, ctx);
    if (!row) continue; // auto-synced type — skip
    await prisma.deckSlide.create({
      data: { deckId, ...row },
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Reads the deck for a project — does NOT generate a
 * default deck automatically.
 *
 * 1. Upserts the ProposalDeck record for this project.
 * 2. If the deck is empty, returns an empty slide list. The user must click
 *    "Generate Default Deck" on the editor to populate it.
 * 3. If the deck has slides, runs backfill (add missing default types) and
 *    auto-sync (before-after, scope-breakdown, investment, timeline,
 *    retainer) so the deck stays current with project state.
 * 4. Returns all visible slides sorted by order.
 *
 * The caller (page.tsx) is responsible for injecting live data that changes
 * independently of the deck (e.g. coverHeroUrl, valuePillars) into the
 * returned slides before passing them to the client.
 */
export async function getDeckForProject({
  projectId,
  projectTitle,
  clientName,
  address,
  roomsWithMedia,
  hasAddition,
}: {
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  address: string | null;
  roomsWithMedia: RoomWithMedia[];
  hasAddition?: boolean;
}): Promise<ProposalSlide[]> {
  // Upsert deck record.
  const deck = await prisma.proposalDeck.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });

  // Fetch all slides for this deck.
  const existing = await prisma.deckSlide.findMany({
    where: { deckId: deck.id },
    orderBy: { order: "asc" },
  });

  // Empty deck: return an empty list. The user will populate it by clicking
  // "Generate Default Deck" on the editor.
  if (existing.length === 0) {
    return [];
  }

  // Load global defaults once for backfill.
  const cvDefaults = await getCoreValuesDefaults();
  const copeDefaults = await getCopeDefaults();
  const nextStepsDefaults = await getNextStepsDefaults();
  const designBuildDefaults = await getDesignBuildDefaults();

  const seedCtx: SeedContext = {
    projectTitle,
    clientName,
    address,
    cvDefaults,
    copeDefaults,
    nextStepsDefaults,
    designBuildDefaults,
  };

  const projectSpec: ProjectForDeckSpec = {
    rooms: roomsWithMedia.map((r) => ({ id: r.id })),
    hasAddition: hasAddition ?? false,
  };

  // Backfill any default slides added after this deck was initially seeded.
  await backfillMissingDefaults(deck.id, existing, projectSpec, seedCtx);

  // Auto-sync auto-generated slide types.
  await syncBeforeAfterSlides(deck.id, existing, roomsWithMedia);
  await syncScopeBreakdownSlide(deck.id, existing, roomsWithMedia);
  await syncInvestmentSlide(deck.id, projectId, existing);
  await syncProjectTimelineSlide(deck.id, projectId, existing);
  await syncRetainerFromProject(deck.id, projectId, existing);

  // Return final visible slides.
  const final = await prisma.deckSlide.findMany({
    where: { deckId: deck.id, isUserHidden: false },
    orderBy: { order: "asc" },
  });

  return final.map(dbToSlide);
}

/**
 * Manually generate (or regenerate) the default deck for a project.
 *
 * Two modes:
 *  - 'replace-all': delete every slide and re-seed from buildDefaultDeckSpec.
 *    User edits and manually-added slides are lost.
 *  - 'keep-manual': preserve all slides with isUserModified=true or
 *    source='manual'. Delete only auto-synced slides (they'll be re-created
 *    by sync). Add any default-spec slides that are missing.
 *
 * Auto-sync runs at the end in both modes.
 */
export async function regenerateDefaultDeck({
  projectId,
  projectTitle,
  clientName,
  address,
  roomsWithMedia,
  hasAddition,
  mode,
}: {
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  address: string | null;
  roomsWithMedia: RoomWithMedia[];
  hasAddition?: boolean;
  mode: "keep-manual" | "replace-all";
}): Promise<ProposalSlide[]> {
  const deck = await prisma.proposalDeck.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });

  const cvDefaults = await getCoreValuesDefaults();
  const copeDefaults = await getCopeDefaults();
  const nextStepsDefaults = await getNextStepsDefaults();
  const designBuildDefaults = await getDesignBuildDefaults();

  const seedCtx: SeedContext = {
    projectTitle,
    clientName,
    address,
    cvDefaults,
    copeDefaults,
    nextStepsDefaults,
    designBuildDefaults,
  };

  const projectSpec: ProjectForDeckSpec = {
    rooms: roomsWithMedia.map((r) => ({ id: r.id })),
    hasAddition: hasAddition ?? false,
  };

  if (mode === "replace-all") {
    // Capture per-slide user overrides that should survive the nuke.
    // Visual Inspiration has a `showByDefault` flag (Phase 8A T7): when the
    // user set it to false on a prior slide, we honor it by removing the
    // seeded slide post-seed.
    const priorViz = await prisma.deckSlide.findFirst({
      where: { deckId: deck.id, type: "visual-inspiration" },
      select: { content: true },
    });
    const vizShowByDefault =
      (priorViz?.content as { showByDefault?: boolean } | null)?.showByDefault;

    // Nuke everything and re-seed from scratch.
    await prisma.deckSlide.deleteMany({ where: { deckId: deck.id } });
    await seedDefaultSlides(deck.id, projectSpec, seedCtx);

    if (vizShowByDefault === false) {
      await prisma.deckSlide.deleteMany({
        where: { deckId: deck.id, type: "visual-inspiration" },
      });
    }
  } else {
    // keep-manual: drop auto-sync slides (they'll be re-created) but
    // preserve every manual/edited slide.
    await prisma.deckSlide.deleteMany({
      where: { deckId: deck.id, source: "auto" },
    });
    const remaining = await prisma.deckSlide.findMany({
      where: { deckId: deck.id },
      orderBy: { order: "asc" },
    });
    await backfillMissingDefaults(deck.id, remaining, projectSpec, seedCtx);
  }

  // Re-read after seeding/backfill so sync sees the current state.
  const afterSeed = await prisma.deckSlide.findMany({
    where: { deckId: deck.id },
    orderBy: { order: "asc" },
  });
  await syncBeforeAfterSlides(deck.id, afterSeed, roomsWithMedia);
  await syncScopeBreakdownSlide(deck.id, afterSeed, roomsWithMedia);
  await syncInvestmentSlide(deck.id, projectId, afterSeed);
  await syncProjectTimelineSlide(deck.id, projectId, afterSeed);
  await syncRetainerFromProject(deck.id, projectId, afterSeed);

  const final = await prisma.deckSlide.findMany({
    where: { deckId: deck.id, isUserHidden: false },
    orderBy: { order: "asc" },
  });
  return final.map(dbToSlide);
}

/**
 * Persists the client's current slide state to the database.
 *
 * Upserts every slide in the array and deletes any DB slides that are no
 * longer present (i.e. the user removed them).
 */
export async function saveAllSlides(
  projectId: string,
  slides: ProposalSlide[]
): Promise<void> {
  const deck = await prisma.proposalDeck.findUnique({ where: { projectId } });
  if (!deck) throw new Error(`No deck found for project ${projectId}`);

  const currentIds = slides.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    // Remove DB slides that are no longer in the client state.
    // We skip slides that are hidden (they're managed by auto-sync, not the client).
    if (currentIds.length > 0) {
      await tx.deckSlide.deleteMany({
        where: {
          deckId: deck.id,
          id: { notIn: currentIds },
          isUserHidden: false,
        },
      });
    }

    // Upsert each slide.
    for (const slide of slides) {
      const data = {
        deckId: deck.id,
        type: slide.type,
        layoutKey: slide.layoutKey,
        order: slide.order,
        isEnabled: slide.isEnabled,
        isUserHidden: slide.isUserHidden ?? false,
        isUserModified: slide.isUserModified ?? false,
        source: slide.source ?? "manual",
        sectionId: slide.sectionId ?? null,
        headline: slide.headline ?? null,
        subheadline: slide.subheadline ?? null,
        body: slide.body ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: slide.content !== undefined ? (slide.content as any) : null,
        isLocked: slide.isLocked ?? false,
        lockPosition: slide.lockPosition ?? null,
        backgroundId: slide.backgroundId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textZone: slide.textZone !== undefined ? (slide.textZone as any) : null,
        // NOTE: aiBackground is stored in slide.content JSON, not as a top-level DB column.
        // Do NOT pass slide.aiBackground here — it's not in the Prisma schema.
      };

      await tx.deckSlide.upsert({
        where: { id: slide.id },
        create: { id: slide.id, ...data },
        update: data,
      });
    }
  });
}

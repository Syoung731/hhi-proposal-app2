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
  SlideType,
  RoomWithMedia,
  BeforeAfterContent,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  InvestmentContent,
  ProjectTimelineContent,
  ProjectPhase,
  DesignRetainerContent,
  BeforeAfterBullet,
} from "./types";
import { buildProjectPhases } from "@/app/lib/timeline-phases";
import { computeRetainer, formatRetainerAmount } from "@/app/lib/retainer";
// Phase 8C.1: T6 scope categorization reverted — classifyScopeItem import
// dropped. The classifier utility (app/lib/scope/classifier.ts) remains on
// disk as a preserved utility (decision #3). Re-import here if the feature
// ever comes back.
import { generateBeforeAfterBullets, hashRenderChecklist } from "@/app/lib/ai/before-after-bullets";
import { generateRoomScopeOverviewShort } from "@/app/lib/ai/objective-content";

/**
 * Phase 8C: merge freshly-generated auto-bullets with the existing slide's
 * bullets, preserving user-edited entries across a re-sync. Match strategy:
 *   - If an existing bullet has manuallyEdited === true, keep it by finding
 *     its sourceKey (or position when sourceKey is missing).
 *   - All fresh (non-matched) bullets slot in order.
 *   - Stale manually-edited bullets whose sourceKey is no longer in the
 *     renderChecklist drop off (the underlying scope item was removed).
 */
function mergeBulletsPreservingManual(
  existing: BeforeAfterBullet[],
  fresh: string[],
  currentChecklist: string[],
): BeforeAfterBullet[] {
  const manualBySource = new Map<string, BeforeAfterBullet>();
  for (const b of existing) {
    if (b.manuallyEdited && b.sourceKey) manualBySource.set(b.sourceKey, b);
  }
  const checklistSet = new Set(currentChecklist);
  return fresh.map((text, idx) => {
    const sourceKey = currentChecklist[idx] ?? null;
    if (sourceKey && manualBySource.has(sourceKey) && checklistSet.has(sourceKey)) {
      // Keep user's text; refresh sourceKey alignment.
      const prev = manualBySource.get(sourceKey)!;
      return { ...prev, sourceKey };
    }
    return { text, sourceKey, manuallyEdited: false };
  });
}
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
      // Phase 8C T2 renamed the slide to "Investment by Space". Phase 8C.1
      // caught that T2 missed the seed path — only the component fallback
      // was updated in T2. Setting headline explicitly here so "Generate
      // Default Deck → Replace Everything" produces the new title.
      return {
        ...base,
        type: "investment",
        layoutKey: spec.layoutKey,
        headline: "Investment by Space",
        content: {
          lineItems: [],
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

// ─── Auto-sync ordering helper ───────────────────────────────────────────────
//
// SlideRail's manual reorder rewrites every slide's `order` field as a
// sequential integer (0, 1, 2, …). When sync recreates Scope Breakdown or
// Before/After at a fixed numeric rank (the spec values 400 / 500), they land
// far below those small integers and appear at the bottom of the deck.
//
// Instead, anchor newly-created auto-sync slides to the actual current order
// of Scope Overview (or Objective if Scope Overview is absent — one of the
// two always exists in the default spec). Using a small fractional offset
// (~0.05–0.1) places them immediately after the anchor, regardless of whether
// the deck uses integer ordering or 100-spaced spec ordering.

function findAnchorOrder(existing: DbRow[], types: readonly SlideType[]): number | null {
  for (const type of types) {
    const row = existing.find((r) => r.type === type && !r.isUserHidden);
    if (row) return row.order;
  }
  return null;
}

const SCOPE_ANCHOR_TYPES: readonly SlideType[] = ["scope-overview", "objective"];

// ─── Auto-sync: Before/After slides ──────────────────────────────────────────
//
// Write scope: DeckSlide type "before-after" only. Registered in
// SYNC_WRITE_SCOPES below.

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

  // Phase 10: source of truth for Render Controls checked state is the
  // RoomRenderCheck table (presence of a row = checked). Before/After bullets
  // are generated from the checked subset only, so unchecking an item in
  // Media tab actually removes the corresponding bullet on next sync.
  const eligibleRoomIds = eligible.map((r) => r.id);
  const checks = await prisma.roomRenderCheck.findMany({
    where: { roomId: { in: eligibleRoomIds } },
    select: { roomId: true, itemText: true },
  });
  const renderChecklistByRoom = new Map<string, string[]>();
  for (const roomId of eligibleRoomIds) {
    renderChecklistByRoom.set(roomId, []);
  }
  for (const c of checks) {
    const list = renderChecklistByRoom.get(c.roomId);
    if (list) list.push(c.itemText);
  }

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

  // Anchor for newly-created Before/After slides — directly after Scope
  // Overview (or Objective fallback). 0.5 falls between integer-reordered
  // sibling orders (e.g. 3 → 3.5 → 4) and inside the default spec gap (300
  // → 300.5 → 400). Falls back to the original spec value if neither anchor
  // exists (defensive — one always does in practice).
  const beforeAfterAnchor = findAnchorOrder(existing, SCOPE_ANCHOR_TYPES);
  const beforeAfterBaseOrder = beforeAfterAnchor != null ? beforeAfterAnchor + 0.2 : 500;

  for (let i = 0; i < eligible.length; i++) {
    const room = eligible[i];

    // Resolve the selected render.
    const selectedRender =
      room.renderMedia.find((m) => m.id === room.selectedRenderMediaId) ??
      room.renderMedia[0];
    if (!selectedRender) continue;

    const beforeMedia = room.beforeMedia[0];
    const caption = stripScopeClarifications(room.scopeNarrative ?? "") || null;
    // Spread sibling Before/After slides between the anchor and the next
    // slide. 0.001 step keeps them tightly grouped while avoiding collisions
    // for up to ~800 rooms before crossing the next anchor's order slot.
    const order = beforeAfterAnchor != null
      ? beforeAfterBaseOrder + i * 0.001
      : 500 + i * 10;

    const existingRow = existingByRoom.get(room.id);
    const renderChecklist = renderChecklistByRoom.get(room.id) ?? [];
    const checklistHash = hashRenderChecklist(renderChecklist);

    if (existingRow) {
      // Slide already exists — refresh render + caption unless user modified it.
      if (existingRow.isUserModified) continue;

      // Re-anchor stale orders. If the row's order is far above the anchor
      // (e.g. still carrying the legacy 500+i*10 hardcoded fallback), assume
      // the user has not deliberately positioned it and pull it back to the
      // freshly-computed anchor offset. Manual reorders land near the anchor
      // (small integer or 0.x deltas), so the +50 threshold leaves them alone.
      const shouldReAnchor =
        beforeAfterAnchor != null && existingRow.order > beforeAfterAnchor + 50;

      const currentContent = (existingRow.content ?? {}) as BeforeAfterContent;

      // Phase 8C bullet merge:
      //   - If the checklist hash hasn't changed AND we have bullets already,
      //     keep the existing bullets exactly (including manual edits + order).
      //   - Otherwise, regenerate from the checklist, then overlay any
      //     manuallyEdited bullets from the previous state (matched by sourceKey).
      let nextBullets: BeforeAfterBullet[] | null | undefined = currentContent.bullets;
      let nextHash: string | null = currentContent.bulletsSourceHash ?? null;
      if (renderChecklist.length > 0) {
        const hashUnchanged =
          currentContent.bulletsSourceHash === checklistHash &&
          Array.isArray(currentContent.bullets) &&
          currentContent.bullets.length > 0;
        if (!hashUnchanged) {
          const fresh = await generateBeforeAfterBullets(renderChecklist);
          if (fresh.length > 0) {
            nextBullets = mergeBulletsPreservingManual(currentContent.bullets ?? [], fresh, renderChecklist);
            nextHash = checklistHash;
          }
        }
      }

      const updatedContent: BeforeAfterContent = {
        ...currentContent,
        roomName: room.name,
        afterMediaId: selectedRender.id,
        afterImageUrl: selectedRender.url,
        caption,
        bullets: nextBullets,
        bulletsSourceHash: nextHash,
      };

      await prisma.deckSlide.update({
        where: { id: existingRow.id },
        data: {
          headline: room.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: updatedContent as any,
          ...(shouldReAnchor ? { order } : {}),
        },
      });
    } else {
      // Don't recreate a slide the user explicitly dismissed.
      if (hiddenRoomIds.has(room.id)) continue;

      // First-time sync: generate bullets from the current checklist.
      let bullets: BeforeAfterBullet[] | null = null;
      let bulletsSourceHash: string | null = null;
      if (renderChecklist.length > 0) {
        const fresh = await generateBeforeAfterBullets(renderChecklist);
        if (fresh.length > 0) {
          bullets = fresh.map((text, idx) => ({
            text,
            sourceKey: renderChecklist[idx] ?? null,
            manuallyEdited: false,
          }));
          bulletsSourceHash = checklistHash;
        }
      }

      const content: BeforeAfterContent = {
        roomId: room.id,
        roomName: room.name,
        beforeMediaId: beforeMedia.id,
        afterMediaId: selectedRender.id,
        beforeImageUrl: beforeMedia.url,
        afterImageUrl: selectedRender.url,
        caption,
        bullets,
        bulletsSourceHash,
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

// ─── Auto-sync: Scope Breakdown slides ───────────────────────────────────────
//
// Write scope: DeckSlide type "scope-breakdown" only. Registered in
// SYNC_WRITE_SCOPES below.
//
// Pagination: rooms beyond ROOMS_PER_SCOPE_BREAKDOWN_SLIDE spill onto
// continuation slides ("Additional Areas Included (continued)"). Ordering
// places these slides AFTER Before/After (which uses anchor + 0.2 + i*0.001)
// by anchoring at + 0.3 + i*0.001. Description per room is sourced from
// `Room.scopeOverviewShort` (a 40-60 word summary populated by
// `ensureRoomScopeOverviewShorts` upstream); falls back to the full
// scopeNarrative for any room missing a summary.

const ROOMS_PER_SCOPE_BREAKDOWN_SLIDE = 8;

const SCOPE_BREAKDOWN_INTRO =
  "These spaces are included in the project and will be completed to the same level of quality and detail.";

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function scopeRoomDescription(room: RoomWithMedia): string {
  const short = (room.scopeOverviewShort ?? "").trim();
  if (short) return short;
  return stripScopeClarifications(room.scopeNarrative ?? "");
}

async function syncScopeBreakdownSlide(
  deckId: string,
  existing: DbRow[],
  rooms: RoomWithMedia[]
): Promise<void> {
  // Rooms without a selected render need written scope coverage.
  // Exclude project-overhead (COPE) rooms — they have their own dedicated slide.
  const unrendered = rooms.filter((r) => !r.selectedRenderMediaId && !r.isProjectOverhead);

  // All existing auto scope-breakdown rows, sorted by current order so we
  // align them with target pages by index.
  const existingAutoRows = existing
    .filter((r) => r.type === "scope-breakdown" && r.source === "auto")
    .sort((a, b) => a.order - b.order);

  if (unrendered.length === 0) {
    // No rooms to render — delete any existing auto rows that aren't owned
    // by the user (user-modified or hidden are left alone).
    for (const row of existingAutoRows) {
      if (row.isUserModified || row.isUserHidden) continue;
      await prisma.deckSlide.delete({ where: { id: row.id } });
    }
    return;
  }

  const pages = chunk(unrendered, ROOMS_PER_SCOPE_BREAKDOWN_SLIDE);

  // Anchor pages AFTER Before/After slides. Before/After uses
  // anchor + 0.2 + i*0.001 (caps around +0.215 for ~15 rendered rooms),
  // so 0.3 leaves a clean gap.
  const anchor = findAnchorOrder(existing, SCOPE_ANCHOR_TYPES);
  const baseOrder = anchor != null ? anchor + 0.3 : 410;

  for (let i = 0; i < pages.length; i++) {
    const pageRooms = pages[i];
    const existingRow = existingAutoRows[i];
    const desiredOrder = baseOrder + i * 0.001;
    const isContinuation = i > 0;
    const headline = isContinuation
      ? "Additional Areas Included (continued)"
      : "Additional Areas Included";

    // Build the per-room content array. Preserve user-edited description +
    // isIncluded from the existing row when the room id matches; otherwise
    // pull from Room.scopeOverviewShort (preferred) or scopeNarrative.
    const existingContent = (existingRow?.content ?? {}) as ScopeBreakdownContent;
    const existingRoomMap = new Map<string, ScopeBreakdownRoom>(
      (existingContent.rooms ?? []).map((r) => [r.id, r])
    );

    const scopeRooms: ScopeBreakdownRoom[] = pageRooms.map((room) => {
      const prev = existingRoomMap.get(room.id);
      const description = prev?.description ?? scopeRoomDescription(room);
      return {
        id: room.id,
        name: room.name,
        description,
        isIncluded: prev?.isIncluded ?? true,
      };
    });

    const content: ScopeBreakdownContent = {
      ...existingContent,
      title: existingContent.title ?? null,
      introText: existingContent.introText ?? SCOPE_BREAKDOWN_INTRO,
      rooms: scopeRooms,
      photos: existingContent.photos ?? [],
    };

    if (existingRow) {
      // User-owned slide — leave it alone. This breaks the index alignment
      // for following pages (their existingRow may now belong to a different
      // page index), but that's fine: the algorithm just falls through to
      // create-new for those pages.
      if (existingRow.isUserModified || existingRow.isUserHidden) continue;

      await prisma.deckSlide.update({
        where: { id: existingRow.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: content as any,
          order: desiredOrder,
          headline,
        },
      });
    } else {
      await prisma.deckSlide.create({
        data: {
          deckId,
          type: "scope-breakdown",
          layoutKey: "text-grid",
          order: desiredOrder,
          isEnabled: true,
          isUserHidden: false,
          isUserModified: false,
          source: "auto",
          headline,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: content as any,
          isLocked: false,
        },
      });
    }
  }

  // Delete excess existing auto rows beyond the page count (e.g. project
  // shrunk and a continuation slide is no longer needed). Skip user-owned.
  for (let i = pages.length; i < existingAutoRows.length; i++) {
    const row = existingAutoRows[i];
    if (row.isUserModified || row.isUserHidden) continue;
    await prisma.deckSlide.delete({ where: { id: row.id } });
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
 *
 * Write scope: DeckSlide type "investment" only. Registered in
 * SYNC_WRITE_SCOPES below.
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

  // 5. Sort group slugs: user-saved first, then default priority.
  // Phase 8C.2: COPE is no longer pinned to the end. The default priority
  // for "cope" is still 99 (defaultSlugPriority below) so it lands last
  // when the user hasn't explicitly ordered it; once the user drags it
  // anywhere in the Investment tab tree, the saved order wins.
  const userIndex = new Map(savedOrder.map((s, i) => [s, i]));
  const allSlugs = Array.from(groups.keys());
  allSlugs.sort((a, b) => {
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

  // Phase 11 Pass 2A T10: auto-correct the legacy "Projected Investment" title
  // on existing rows. Phase 8C.1 renamed the seed default to "Investment by
  // Space" but only fresh seeds got the new title. Match exactly so any
  // user-customized title is preserved. Once corrected, the conditional is a
  // no-op on every subsequent sync.
  const shouldRetitleHeadline = investmentRow.headline === "Projected Investment";

  await prisma.deckSlide.update({
    where: { id: investmentRow.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      content: updatedContent as any,
      ...(shouldRetitleHeadline && { headline: "Investment by Space" }),
    },
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
 *
 * Write scope: DeckSlide type "project-timeline" only. Registered in
 * SYNC_WRITE_SCOPES below.
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
 * Syncs the project-level retainer settings onto the `design-retainer` slide
 * content (amount, constructionLow/High, designHourlyRate, retainerEnabled).
 *
 * User-modified slides are skipped (same convention as other sync fns), so
 * once an admin hand-edits the slide, auto-sync backs off.
 *
 * Phase 8C.2 T1: this function no longer writes to the Investment slide.
 * Before this change, it spread the STALE `existing[].content` of the
 * investment row (captured before any sync ran) and wrote back — wiping
 * the lineItems that syncInvestmentSlide had just written a few ms earlier.
 * That classic read-modify-write race is gone now: only syncInvestmentSlide
 * writes to the investment slide's content.
 *
 * The previously-written retainerAmount / retainerLabel fields on the
 * Investment slide are dead data — Phase 8C T2 removed the mid-slide
 * retainer callout that rendered them. Phase 8C.2 T2 removed them from
 * InvestmentContent entirely.
 *
 * Write scope: DeckSlide type "design-retainer" only. Registered in
 * SYNC_WRITE_SCOPES below. The Phase 8C.2 T1 fix is what made this
 * single-writer guarantee true — before then, this sync also wrote to
 * the "investment" slide, which caused the race.
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

  // Phase 8C.2 T1: no write to the Investment slide here. See the docblock
  // above for the full rationale. `syncInvestmentSlide` is the sole writer
  // to investment content.
}

// ─── Sync write-scope registry (Phase 8C.2 T3) ──────────────────────────────
//
// Declarative record of which sync function owns which DeckSlide type.
// Module-load assertion below fails loudly if two sync functions ever claim
// the same slide type — preventing future recurrences of the cross-function
// write race fixed in Phase 8C.2 T1 (see PHASE_8C2_PREFLIGHT.md).
//
// RULE OF THUMB for adding a new sync function:
//   1. Declare it like the others in this file.
//   2. Add an entry to SYNC_WRITE_SCOPES below.
//   3. If another sync already claims the same slide type, pick one — two
//      syncs writing to the same slide's `content` via read-modify-write on
//      a shared `existing` snapshot is how the 8C.2 race happened.
//
// If you legitimately need two syncs to update the same slide type (rare),
// split the target slide's content model so each owns a disjoint field set,
// OR refresh `existing` between sync calls. Do NOT spread-and-write from a
// stale snapshot.

type SlideSyncRegistration = {
  name: string;
  writesToSlideTypes: readonly SlideType[];
};

const SYNC_WRITE_SCOPES: readonly SlideSyncRegistration[] = [
  { name: "syncBeforeAfterSlides", writesToSlideTypes: ["before-after"] },
  { name: "syncScopeBreakdownSlide", writesToSlideTypes: ["scope-breakdown"] },
  { name: "syncInvestmentSlide", writesToSlideTypes: ["investment"] },
  { name: "syncProjectTimelineSlide", writesToSlideTypes: ["project-timeline"] },
  { name: "syncRetainerFromProject", writesToSlideTypes: ["design-retainer"] },
];

// Module-load assertion. Throws on duplicate ownership so the dev server
// fails fast instead of silently racing at runtime.
(function assertSyncWriteScopesDisjoint(): void {
  const claimed = new Map<SlideType, string>();
  for (const { name, writesToSlideTypes } of SYNC_WRITE_SCOPES) {
    for (const slideType of writesToSlideTypes) {
      const prev = claimed.get(slideType);
      if (prev !== undefined) {
        throw new Error(
          `[deck/db] Sync write-scope collision: both "${prev}" and "${name}" ` +
            `claim DeckSlide type "${slideType}". Each slide type must be ` +
            `written by at most one sync function — see Phase 8C.2 PHASE_8C2_PREFLIGHT.md ` +
            `for why (shared-snapshot read-modify-write race). Resolve by ` +
            `consolidating writes into one sync or splitting the slide's ` +
            `content model into disjoint field sets.`,
        );
      }
      claimed.set(slideType, name);
    }
  }
})();

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
 * For every room that needs a Scope Breakdown entry but doesn't have a short
 * summary yet, generate one in parallel via Claude and persist it on the
 * Room row. Returns the input roomsWithMedia with `scopeOverviewShort`
 * populated for the rooms we just generated, so the caller can pass enriched
 * data straight into `syncScopeBreakdownSlide` without re-fetching.
 *
 * Skipped rooms: those with a Before/After render selected (covered by their
 * own slide), COPE rooms, rooms with empty/very-short scopeNarrative, and
 * rooms that already have a non-empty scopeOverviewShort cached.
 */
async function ensureRoomScopeOverviewShorts(
  rooms: RoomWithMedia[],
): Promise<RoomWithMedia[]> {
  const settings = await prisma.companySettings.findFirst({ select: { companyName: true } });
  const companyName = (settings?.companyName ?? "").trim() || "HHI Builders";

  const needsGeneration = rooms.filter((r) =>
    !r.selectedRenderMediaId &&
    !r.isProjectOverhead &&
    !((r.scopeOverviewShort ?? "").trim()) &&
    (r.scopeNarrative ?? "").trim().length >= 20
  );

  if (needsGeneration.length === 0) return rooms;

  const generated = await Promise.all(
    needsGeneration.map(async (room) => {
      const summary = await generateRoomScopeOverviewShort({
        roomName: room.name,
        scopeNarrative: room.scopeNarrative ?? "",
        companyName,
      });
      return { id: room.id, summary };
    }),
  );

  // Persist in one transaction-like batch so a failure mid-loop doesn't leave
  // half the rooms with summaries and half without.
  await Promise.all(
    generated.map(({ id, summary }) =>
      prisma.room.update({
        where: { id },
        data: { scopeOverviewShort: summary },
      }),
    ),
  );

  const summaryById = new Map(generated.map((g) => [g.id, g.summary]));
  return rooms.map((r) =>
    summaryById.has(r.id)
      ? { ...r, scopeOverviewShort: summaryById.get(r.id) ?? null }
      : r,
  );
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

  // Ensure scope-breakdown rooms have a short summary before the slides sync.
  // Generates only the rooms that are missing — first-run regenerates fill in
  // ~50-word summaries; subsequent regenerates are no-ops once cached on Room.
  const enrichedRooms = await ensureRoomScopeOverviewShorts(roomsWithMedia);

  await syncBeforeAfterSlides(deck.id, afterSeed, enrichedRooms);
  await syncScopeBreakdownSlide(deck.id, afterSeed, enrichedRooms);
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

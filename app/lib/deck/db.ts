/**
 * Deck persistence & auto-sync engine.
 *
 * This module is the single source of truth for reading and writing
 * ProposalDeck + DeckSlide records.  It is NOT a "use server" module —
 * it is a plain server-side library imported by server components and
 * server actions alike.
 *
 * Gap-based ordering:
 *   cover         0
 *   objective   100
 *   scope-ov    200
 *   before-after 300 + roomIndex * 10   (auto)
 *   scope-brkdn 400                     (auto)
 *   why-us      500
 *   risk-brief  550
 *   process     560
 *   investment  600
 */

import { prisma } from "@/app/lib/prisma";
import type {
  ProposalSlide,
  SlideContent,
  RoomWithMedia,
  BeforeAfterContent,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  InvestmentContent,
} from "./types";

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

// ─── Default slide seeds ──────────────────────────────────────────────────────

async function seedDefaultSlides(
  deckId: string,
  projectTitle: string,
  clientName: string | null,
  address: string | null
): Promise<void> {
  await prisma.deckSlide.createMany({
    data: [
      {
        deckId,
        type: "cover",
        layoutKey: "hero-image",
        order: 0,
        isEnabled: true,
        isLocked: true,
        lockPosition: "first",
        source: "manual",
        headline: projectTitle,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: {
          heroImageUrl: null,
          preparedFor: clientName,
          tagline: null,
          date: null,
        } as any,
      },
      {
        deckId,
        type: "objective",
        layoutKey: "statement-left",
        order: 100,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "Project Objective",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: { statementText: null, supportingText: null, bullets: [] } as any,
      },
      {
        deckId,
        type: "scope-overview",
        layoutKey: "split-panel",
        order: 200,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "Project Scope",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: { description: null, selectedPhotos: [] } as any,
      },
      {
        deckId,
        type: "why-us",
        layoutKey: "pillars-grid",
        order: 500,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "The HHI Difference",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: { sectionTitle: null, pillars: [], selectedPillarIds: [] } as any,
      },
      {
        deckId,
        type: "risk-brief",
        layoutKey: "two-column",
        order: 550,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "The Stress-Free Remodel: How We Eliminate Common Risks",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        } as any,
      },
      {
        deckId,
        type: "process",
        layoutKey: "three-stages",
        order: 560,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "Our Process: From Vision to Finished Home",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        } as any,
      },
      {
        deckId,
        type: "investment",
        layoutKey: "table-callout",
        order: 600,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "Projected Investment",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: {
          lineItems: [],
          retainerLabel: null,
          retainerAmount: null,
          disclaimer: null,
          address,
        } as any,
      },
    ],
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
    const caption = (room.scopeNarrative ?? "").trim() || null;
    const order = 300 + i * 10;

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
  const unrendered = rooms.filter((r) => !r.selectedRenderMediaId);
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
        description: (room.scopeNarrative ?? "").trim(),
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
      description: (room.scopeNarrative ?? "").trim(),
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

// ─── Auto-sync: Investment slide ─────────────────────────────────────────────

/**
 * Keeps the investment slide content in sync with the project's
 * InvestmentLineItem records.
 *
 * Mirrors the before/after sync pattern:
 * - Runs on every page load.
 * - Skipped when isUserModified = true (user has taken ownership of the content).
 * - Always overwrites lineItems so additions, deletions, and edits in the
 *   Investment tab are immediately reflected.
 */
async function syncInvestmentSlide(
  _deckId: string,
  projectId: string,
  existing: DbRow[]
): Promise<void> {
  // Find the investment slide — skip if the user has manually edited it.
  const investmentRow = existing.find((r) => r.type === "investment");
  if (!investmentRow || investmentRow.isUserModified) return;

  // Fetch all line items included in totals, in presentation order.
  const items = await prisma.investmentLineItem.findMany({
    where: { projectId, includeInTotals: true },
    orderBy: { sortOrder: "asc" },
  });

  // Check if the project has a COPE room with pricing data
  const copeRoom = await prisma.room.findFirst({
    where: { projectId, isProjectOverhead: true },
    select: { totalLow: true, totalTarget: true, totalHigh: true },
  });
  const hasCopePricing = copeRoom && (copeRoom.totalLow != null || copeRoom.totalTarget != null || copeRoom.totalHigh != null);

  // Preserve retainerLabel / retainerAmount / address the user may have set
  // in the inspector — only replace lineItems.
  const currentContent = (investmentRow.content ?? {}) as InvestmentContent;
  const lineItems = items.map((item) => ({
    id: item.id,
    label: item.label,
    bucket: String(item.bucket ?? ""),
    rangeLow: item.rangeLow ?? null,
    rangeTarget: item.rangeTarget ?? null,
    rangeHigh: item.rangeHigh ?? null,
    overrideLow: item.overrideLow ?? null,
    overrideTarget: item.overrideTarget ?? null,
    overrideHigh: item.overrideHigh ?? null,
    isOverride: item.isOverride,
    includeInTotals: item.includeInTotals,
    sortOrder: item.sortOrder,
    // Mark the BASE line item as containing COPE data when a COPE room has pricing
    isCope: item.bucket === "BASE" && hasCopePricing ? true : undefined,
  }));
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

// ─── Backfill: default slides added after initial seed ────────────────────────

/**
 * Ensures every "always-present" default slide exists in an already-seeded deck.
 * Called on every page load so decks created before a new default was added
 * automatically receive that slide without requiring manual recreation.
 *
 * Only creates slides that are completely absent — never overwrites existing ones.
 */
async function backfillMissingDefaults(deckId: string, existing: DbRow[]): Promise<void> {
  const types = new Set(existing.map((r) => r.type));

  if (!types.has("risk-brief")) {
    await prisma.deckSlide.create({
      data: {
        deckId,
        type: "risk-brief",
        layoutKey: "two-column",
        order: 550,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "The Stress-Free Remodel: How We Eliminate Common Risks",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        } as any,
      },
    });
  }

  if (!types.has("process")) {
    await prisma.deckSlide.create({
      data: {
        deckId,
        type: "process",
        layoutKey: "three-stages",
        order: 560,
        isEnabled: true,
        isLocked: false,
        source: "manual",
        headline: "Our Process: From Vision to Finished Home",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        } as any,
      },
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point.
 *
 * 1. Upserts the ProposalDeck record for this project.
 * 2. Seeds 5 default slides if the deck is brand-new.
 * 3. Auto-syncs Before/After and Scope Breakdown slides from room data.
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
}: {
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  address: string | null;
  roomsWithMedia: RoomWithMedia[];
}): Promise<ProposalSlide[]> {
  // Upsert deck record.
  const deck = await prisma.proposalDeck.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });

  // Fetch all slides for this deck.
  let existing = await prisma.deckSlide.findMany({
    where: { deckId: deck.id },
    orderBy: { order: "asc" },
  });

  // Seed defaults for a brand-new deck.
  if (existing.length === 0) {
    await seedDefaultSlides(deck.id, projectTitle, clientName, address);
    existing = await prisma.deckSlide.findMany({
      where: { deckId: deck.id },
      orderBy: { order: "asc" },
    });
  }

  // Backfill any default slides added after this deck was initially seeded.
  await backfillMissingDefaults(deck.id, existing);

  // Auto-sync auto-generated slide types.
  await syncBeforeAfterSlides(deck.id, existing, roomsWithMedia);
  await syncScopeBreakdownSlide(deck.id, existing, roomsWithMedia);
  await syncInvestmentSlide(deck.id, projectId, existing);

  // Return final visible slides.
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
        aiBackground: slide.aiBackground ?? null,
      };

      await tx.deckSlide.upsert({
        where: { id: slide.id },
        create: { id: slide.id, ...data },
        update: data,
      });
    }
  });
}

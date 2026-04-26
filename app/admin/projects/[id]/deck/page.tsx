import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getDeckForProject } from "@/app/lib/deck/db";
import { getDesignBuildDefaults } from "@/app/lib/design-build-defaults.server";
import { isRendrConfigured } from "@/app/lib/rendr/rendrClient";
// Note: we fetch backgrounds directly with Prisma here (not via the server action)
// so we stay within the server component request context for auth.
import { DeckEditorClient } from "./DeckEditorClient";
import type {
  WhyUsPillarItem,
  RoomWithMedia,
  RoomMediaItem,
  WhyUsContent,
  ObjectiveContent,
  TextZoneSuggestion,
} from "@/app/lib/deck/types";
import type { ObjectivePageConfig, PresentationConfigSaved } from "@/app/lib/layout-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deck Editor — HHI Builders",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeckEditorPage({ params }: PageProps) {
  await requireAdmin();

  const { id } = await params;

  // Load project — including cover hero image and all media for selection
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      subtitle: true,
      objective: true,
      // LEGACY: only consumed by statement-mode hydration. Remove with statement layouts.
      supportingText: true,
      bullets: true,
      client1First: true,
      client1Last: true,
      client2First: true,
      client2Last: true,
      addressLine1: true,
      city: true,
      state: true,
      zip: true,
      coverHeroImageId: true,
      hasAddition: true,
      objectivePillars: true,
      media: {
        select: { id: true, url: true, kind: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!project) notFound();

  // Load company settings (branding source — single source of truth)
  const companySettings = await getOrCreateCompanySettings();
  const branding = adaptBrandingForDeck(companySettings);

  // Load brand backgrounds for the per-slide background picker.
  // Fetched directly with Prisma (not via the server action) to stay within
  // the server component request context — avoids auth boundary issues.
  const rawBgs = await prisma.brandBackground.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const brandBackgrounds: import("@/app/admin/settings/settings-tabs").BrandBackgroundForUI[] =
    rawBgs.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      baseColorHex: b.baseColorHex,
      overlayImageUrl: b.overlayImageUrl,
      overlayImageKey: b.overlayImageKey,
      overlayIconId: b.overlayIconId,
      overlayOpacity: b.overlayOpacity,
      overlayScale: b.overlayScale,
      overlaySpacing: b.overlaySpacing,
      overlayRotation: b.overlayRotation,
      previewImageUrl: b.previewImageUrl ?? null,
      previewImageKey: b.previewImageKey ?? null,
      isAvailable: b.isAvailable,
      isActive: b.isActive,
      sortOrder: b.sortOrder,
      tags: b.tags,
      generationMode: b.generationMode ?? null,
      stylePreset: b.stylePreset ?? null,
      compositionSeed: b.compositionSeed ?? null,
      textZoneSuggestion: (b.textZoneSuggestion as TextZoneSuggestion | null) ?? null,
    }));

  // Derive client display name
  const clientName = [project.client1First, project.client1Last]
    .filter(Boolean)
    .join(" ") || null;

  // Derive address string
  const addressParts = [
    project.addressLine1,
    project.city,
    [project.state, project.zip].filter(Boolean).join(" "),
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : null;

  // Resolve cover hero image URL from the project's media
  const coverHeroUrl =
    project.media.find((m) => m.id === project.coverHeroImageId)?.url ??
    project.media.find((m) => m.kind === "COVER")?.url ??
    project.media[0]?.url ??
    null;

  // ── Clean up orphaned renderings ──────────────────────────────────────────
  // Remove stale orphaned rendering children (parentMediaId nulled by cascade)
  // before querying room media so the deck never sees phantom renders.
  try {
    const orphanRoots = await prisma.media.findMany({
      where: { projectId: id, type: "RENDERING", parentMediaId: null, sourceMediaId: null, roomId: { not: null } },
      select: { id: true },
    });
    if (orphanRoots.length > 0) {
      const orphanIds = orphanRoots.map((r) => r.id);
      // Don't delete if it's the selected render for any room
      const rooms = await prisma.room.findMany({
        where: { projectId: id, selectedRenderMediaId: { in: orphanIds } },
        select: { id: true },
      });
      if (rooms.length === 0) {
        await prisma.media.deleteMany({ where: { parentMediaId: { in: orphanIds } } });
        await prisma.media.deleteMany({ where: { id: { in: orphanIds } } });
      }
    }
  } catch { /* non-fatal */ }

  // ── Rooms with before/render media ─────────────────────────────────────────
  // Must be fetched BEFORE getDeckForProject so the sync engine can create
  // Before/After and Scope Breakdown slides on first load.
  let projectRoomsWithMedia: RoomWithMedia[] = [];
  try {
    const rawRooms = await prisma.room.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        selectedRenderMediaId: true,
        scopeNarrative: true,
        scopeOverviewShort: true,
        isProjectOverhead: true,
        media: {
          where: {
            OR: [
              { type: "EXISTING" },
              { type: "RENDERING", renderStatus: "DONE" },
            ],
          },
          select: {
            id: true,
            url: true,
            kind: true,
            type: true,
            renderStatus: true,
            caption: true,
            parentMediaId: true,
            sourceMediaId: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    projectRoomsWithMedia = rawRooms.map((room) => ({
      id: room.id,
      name: room.name,
      sortOrder: room.sortOrder,
      selectedRenderMediaId: room.selectedRenderMediaId,
      scopeNarrative: room.scopeNarrative ?? undefined,
      scopeOverviewShort: room.scopeOverviewShort,
      isProjectOverhead: room.isProjectOverhead,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({
          id: m.id,
          url: m.url,
          kind: m.kind,
          renderStatus: m.renderStatus,
          caption: m.caption,
        })),
      renderMedia: (() => {
        const doneRenders = room.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
        // Exclude orphaned children whose parentMediaId was nulled when their parent was deleted.
        const seenSources = new Set<string>();
        return doneRenders
          .filter((m) => {
            if (m.parentMediaId != null) return true;
            const key = m.sourceMediaId ?? m.id;
            if (seenSources.has(key)) return false;
            seenSources.add(key);
            return true;
          })
          .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption }));
      })(),
    }));
  } catch {
    // Non-fatal: room fetch failure shows empty room list in inspector
  }

  // ── Project-level media (Front Page photos — roomId is null) ────────────────
  let projectLevelMedia: RoomMediaItem[] = [];
  try {
    const rawProjectMedia = await prisma.media.findMany({
      where: {
        projectId: id,
        roomId: null,
        OR: [
          { type: "EXISTING" },
          { type: "RENDERING", renderStatus: "DONE" },
        ],
      },
      select: {
        id: true,
        url: true,
        kind: true,
        type: true,
        renderStatus: true,
        caption: true,
      },
      orderBy: { sortOrder: "asc" },
    });
    projectLevelMedia = rawProjectMedia
      .filter((m) => m.url != null && m.url !== "")
      .map((m) => ({
        id: m.id,
        url: m.url!,
        kind: m.kind,
        renderStatus: m.renderStatus,
        caption: m.caption,
      }));
  } catch {
    // Non-fatal
  }

  // ── Value Pillars ────────────────────────────────────────────────────────────
  // Single-tenant: use the first Company record. Gracefully handles no company.
  let valuePillars: WhyUsPillarItem[] = [];
  try {
    const company = await prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (company) {
      const rawPillars = await prisma.valuePillar.findMany({
        where: { companyId: company.id },
        orderBy: { sortOrder: "asc" },
        include: {
          brandIcon: { select: { id: true, imageUrl: true } },
        },
      });
      valuePillars = rawPillars.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        iconUrl: p.brandIcon?.imageUrl ?? null,
      }));
    }
  } catch {
    // Non-fatal: pillar fetch failure just means an empty grid
  }

  // ── Design-Build defaults for addSlide ─────────────────────────────────────
  const designBuildDefaults = await getDesignBuildDefaults();

  // ── Rendr integration status (for tab nav visibility) ──────────────────────
  const rendrConfigured = await isRendrConfigured().catch(() => false);

  // ── Proposal config (objective text, commitments) ────────────────────────────
  // Fetched before getDeckForProject so the objective slide injection below
  // can backfill blank seeded slides on first load.
  // Investment line items are fetched inside db.ts syncInvestmentSlide.
  const proposalRow = await prisma.proposal.findUnique({
    where: { projectId: id },
    select: { publicLayoutConfig: true },
  }).catch(() => null);

  // Extract the objective page config from the presentation JSON blob.
  // Path: Proposal.publicLayoutConfig → pages.objective (ObjectivePageConfig).
  const objectiveConfig: ObjectivePageConfig | null = (() => {
    try {
      const raw = proposalRow?.publicLayoutConfig as PresentationConfigSaved | null | undefined;
      return raw?.pages?.objective ?? null;
    } catch {
      return null;
    }
  })();

  // ── Load / sync the deck ─────────────────────────────────────────────────────
  // getDeckForProject upserts the ProposalDeck record, seeds default slides
  // on first visit, and auto-syncs Before/After + Scope Breakdown slides
  // from the current room data before returning.
  const slides = await getDeckForProject({
    projectId: id,
    projectTitle: project.title,
    clientName,
    address,
    roomsWithMedia: projectRoomsWithMedia,
    hasAddition: project.hasAddition,
  });

  // Inject the live cover hero URL into every cover slide.
  // We do this here (not in db.ts) because the hero image is managed
  // independently of the deck and should always reflect the latest value.
  if (coverHeroUrl) {
    for (const slide of slides) {
      if (slide.type === "cover") {
        slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
      }
    }
  }

  // Inject the project address into every cover slide's content.address so
  // "Prepared for …" shows the client/project site address, not the company
  // office. Skipped once the user edits the slide so their override is kept.
  for (const slide of slides) {
    if (slide.type === "cover" && !slide.isUserModified) {
      slide.content = { ...(slide.content ?? {}), address };
    }
  }

  // Inject fresh value pillars into every why-us slide.
  // Pillars are always re-injected from DB at page load so slides always
  // reflect the latest icons and body text without a deck re-save.
  // The user's selectedPillarIds are preserved when already set.
  if (valuePillars.length > 0) {
    for (const slide of slides) {
      if (slide.type === "why-us") {
        const content = (slide.content ?? {}) as WhyUsContent;
        slide.content = {
          ...content,
          pillars: valuePillars,
          selectedPillarIds:
            content.selectedPillarIds && content.selectedPillarIds.length > 0
              ? content.selectedPillarIds
              : valuePillars.map((p) => p.id),
        };
      }
    }
  }

  // ── Objective slide hydration ────────────────────────────────────────────────
  // Sources (in priority order):
  //   1. Proposal.publicLayoutConfig.pages.objective  (Presentation tab title/subtitle)
  //   2. Project.objective / .supportingText / .bullets (Overview tab, AI-generated)
  //   3. Project.objectivePillars (new 3-pillar layout — Phase 8A)
  // Applied every load when isUserModified !== true.
  // Once the user edits the slide in the deck inspector, isUserModified = true
  // and this injection is skipped — their deck-specific copy is preserved.
  const objectivePillars = (() => {
    const raw = project.objectivePillars as unknown;
    if (!Array.isArray(raw) || raw.length !== 3) return null;
    const pillars = raw
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const title = String((p as { title?: unknown }).title ?? "").trim();
        const body = String((p as { body?: unknown }).body ?? "").trim();
        if (!title || !body) return null;
        return { title, body };
      })
      .filter((p): p is { title: string; body: string } => p !== null);
    return pillars.length === 3 ? pillars : null;
  })();

  for (const slide of slides) {
    if (slide.type !== "objective" || slide.isUserModified) continue;

    const statementText =
      objectiveConfig?.objectiveText?.trim() ||
      project.objective?.trim() ||
      null;
    // LEGACY: project.supportingText is unused by PillarLayout. Drop this read + the slide.content.supportingText assignment below when statement layouts go.
    const supportingText = project.supportingText?.trim() || null;
    const bullets = (project.bullets ?? []).filter(Boolean);
    const title = objectiveConfig?.title?.trim() || null;

    // Only hydrate when there is at least some real content to inject.
    if (
      !statementText &&
      !supportingText &&
      bullets.length === 0 &&
      !title &&
      !objectivePillars
    ) {
      continue;
    }

    const existingContent = (slide.content ?? {}) as ObjectiveContent;
    slide.headline = title ?? slide.headline ?? "Project Objective";
    slide.content = {
      ...existingContent,
      statementText,
      supportingText,
      bullets,
      // New structured layout fields. Only overwritten when the project
      // actually has structured data — legacy projects keep their prose.
      ...(project.objective ? { objective: project.objective.trim() } : {}),
      ...(objectivePillars ? { pillars: objectivePillars } : {}),
    };
  }

  // ── Compute Generate Default Deck preconditions ──────────────────────────
  const missingPreconditions: string[] = [];
  if (!project.title?.trim()) missingPreconditions.push("project title");
  if (!project.client1First?.trim() || !project.client1Last?.trim()) {
    missingPreconditions.push("primary client name");
  }
  if (projectRoomsWithMedia.length < 1) missingPreconditions.push("at least one room");
  const canGenerateDefaultDeck = {
    ok: missingPreconditions.length === 0,
    missing: missingPreconditions,
  };

  return (
    <DeckEditorClient
      initialSlides={slides}
      branding={branding}
      projectId={project.id}
      projectTitle={project.title}
      valuePillars={valuePillars}
      designBuildDefaults={designBuildDefaults}
      projectRoomsWithMedia={projectRoomsWithMedia}
      projectLevelMedia={projectLevelMedia}
      brandBackgrounds={brandBackgrounds}
      rendrConfigured={rendrConfigured}
      canGenerateDefaultDeck={canGenerateDefaultDeck}
    />
  );
}

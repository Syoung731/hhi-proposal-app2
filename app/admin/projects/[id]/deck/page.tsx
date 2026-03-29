import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getDeckForProject } from "@/app/lib/deck/db";
// Note: we fetch backgrounds directly with Prisma here (not via the server action)
// so we stay within the server component request context for auth.
import { DeckEditorClient } from "./DeckEditorClient";
import type {
  WhyUsPillarItem,
  RoomWithMedia,
  WhyUsContent,
  InvestmentContent,
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
      client1First: true,
      client1Last: true,
      client2First: true,
      client2Last: true,
      addressLine1: true,
      city: true,
      state: true,
      zip: true,
      coverHeroImageId: true,
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
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({
          id: m.id,
          url: m.url,
          kind: m.kind,
          renderStatus: m.renderStatus,
          caption: m.caption,
        })),
      renderMedia: room.media
        .filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE")
        .map((m) => ({
          id: m.id,
          url: m.url,
          kind: m.kind,
          renderStatus: m.renderStatus,
          caption: m.caption,
        })),
    }));
  } catch {
    // Non-fatal: room fetch failure shows empty room list in inspector
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

  // ── Proposal config (objective text, commitments) + Investment line items ────
  // Both are fetched in parallel before getDeckForProject so the injections
  // below can backfill blank seeded slides on first load.
  const [proposalRow, rawLineItems] = await Promise.all([
    prisma.proposal.findUnique({
      where: { projectId: id },
      select: { publicLayoutConfig: true },
    }).catch(() => null),
    prisma.investmentLineItem.findMany({
      where: { projectId: id, includeInTotals: true },
      orderBy: { sortOrder: "asc" },
    }).catch(() => []),
  ]);

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
  //   1. Proposal.publicLayoutConfig.pages.objective  (Presentation tab editor)
  //   2. project.objective                            (Overview tab plain text)
  // Applied every load when isUserModified !== true, so edits made in the
  // Presentation tab are automatically reflected on the next deck open.
  // Once the user edits the slide in the deck inspector, isUserModified = true
  // and this injection is skipped — their deck-specific copy is preserved.
  for (const slide of slides) {
    if (slide.type !== "objective" || slide.isUserModified) continue;

    const statementText =
      objectiveConfig?.objectiveText?.trim() ||
      project.objective?.trim() ||
      null;
    const bullets = (objectiveConfig?.commitments ?? []).filter(Boolean);
    const title = objectiveConfig?.title?.trim() || null;
    const subtitle = objectiveConfig?.subtitle?.trim() || null;

    // Only hydrate when there is at least some real content to inject.
    if (!statementText && bullets.length === 0 && !title) continue;

    const existingContent = (slide.content ?? {}) as ObjectiveContent;
    slide.headline = title ?? slide.headline ?? "Project Objective";
    if (subtitle) slide.subheadline = subtitle;
    slide.content = {
      ...existingContent,
      statementText,
      bullets,
    };
  }

  // ── Investment slide hydration ────────────────────────────────────────────────
  // Source: project InvestmentLineItem rows (the Project Investment tab).
  // Prefers overrideLow/High when set; falls back to rangeLow/High.
  // Applied every load when isUserModified !== true.  Once the user edits the
  // slide in the deck inspector, isUserModified = true and this is skipped.
  if (rawLineItems.length > 0) {
    for (const slide of slides) {
      if (slide.type !== "investment" || slide.isUserModified) continue;
      const content = (slide.content ?? {}) as InvestmentContent;
      slide.content = {
        ...content,
        lineItems: rawLineItems.map((item) => ({
          id: item.id,
          label: item.label,
          rangeLow: (item.overrideLow ?? item.rangeLow) ?? null,
          rangeHigh: (item.overrideHigh ?? item.rangeHigh) ?? null,
          isCope: false,
        })),
      };
    }
  }

  return (
    <DeckEditorClient
      initialSlides={slides}
      branding={branding}
      projectId={project.id}
      projectTitle={project.title}
      valuePillars={valuePillars}
      projectRoomsWithMedia={projectRoomsWithMedia}
      brandBackgrounds={brandBackgrounds}
    />
  );
}

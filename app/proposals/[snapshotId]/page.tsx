import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCompanyBrandingForRender } from "@/app/lib/company-branding-for-render";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getDeckForProject } from "@/app/lib/deck/db";
import { isDeckThemeKey } from "@/app/lib/deck/themes";
import { deserializeSnapshotSlides } from "@/app/lib/deck/deserialize-snapshot";
import { PresentationFrame } from "./presentation-frame";
import { PrintStack } from "./print-stack";
import type {
  SnapshotData,
  SerializedDeckSlide,
  SnapshotBranding,
} from "@/app/lib/snapshot";
import type {
  BrandBackgroundForUI,
} from "@/app/admin/settings/settings-tabs";
import type {
  ProposalSlide,
  RoomWithMedia,
  TextZoneSuggestion,
  WhyUsPillarItem,
  WhyUsContent,
  ObjectiveContent,
} from "@/app/lib/deck/types";
import type { ObjectivePageConfig, PresentationConfigSaved } from "@/app/lib/layout-config";

// The public renderer must read snapshot data as-is — no caching, no revalidation.
// Fresh draft previews also need current data on every load.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ snapshotId: string }>;
  searchParams: Promise<{ draft?: string; projectId?: string; print?: string }>;
}

export default async function ProposalPublicRenderer({
  params,
  searchParams,
}: PageProps) {
  const { snapshotId } = await params;
  const sp = await searchParams;

  const isDraft = sp.draft === "1" && snapshotId === "draft";
  const isPrint = sp.print === "1";

  // Load brand backgrounds once — used by both paths so slide.backgroundId can
  // resolve to a full BrandBackgroundForUI for the composite layer.
  const brandBackgrounds = await loadBrandBackgrounds();

  if (isDraft) {
    const projectId = sp.projectId;
    if (!projectId) notFound();

    const draft = await loadDraftDeck(projectId);
    if (!draft) notFound();

    // Draft has no snapshot to read from — pull live branding via the
    // non-admin-gated helper so the headless-Chromium PDF flow can render
    // a draft preview without an admin session.
    const branding = {
      ...adaptBrandingForDeck(await getCompanyBrandingForRender()),
      deckTheme: draft.deckTheme,
    };

    if (isPrint) {
      return (
        <PrintStack
          slides={draft.slides}
          branding={branding}
          brandBackgrounds={brandBackgrounds}
          draftMarker={`DRAFT — PROPOSAL v${draft.nextVersion}`}
        />
      );
    }

    return (
      <PresentationFrame
        slides={draft.slides}
        branding={branding}
        brandBackgrounds={brandBackgrounds}
        storageKey={`proposal-draft-${projectId}`}
        isDraft
        snapshotLabel={draft.projectTitle}
      />
    );
  }

  // Published snapshot path — load the exact version, never "latest."
  const snapshot = await prisma.publishedSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      version: true,
      snapshotJson: true,
    },
  });
  if (!snapshot) notFound();

  const data = snapshot.snapshotJson as unknown as SnapshotData;

  // Per Cleanup D spec: v1-legacy snapshots return 404 (no v1 exists post-Cleanup B).
  if (data.schema !== "v2-deck" || !data.deck) notFound();

  const slides = deserializeSnapshotSlides(data.deck.slides as SerializedDeckSlide[]);

  // Branding source priority:
  //   1. Frozen `snapshotJson.branding` from publish time (post-Cluster C.5
  //      snapshots). Renders identically across reloads regardless of
  //      subsequent changes to CompanySettings.
  //   2. Fallback to a live (non-admin-gated) lookup for legacy snapshots
  //      published before C.5. Acceptable drift for old snapshots; the
  //      next republish lifts them onto the frozen path.
  const brandingSource: SnapshotBranding =
    data.branding ?? (await getCompanyBrandingForRender());
  const branding = {
    ...adaptBrandingForDeck(brandingSource),
    deckTheme: data.deck.deckTheme ?? "blueprint",
  };

  if (isPrint) {
    return (
      <PrintStack
        slides={slides}
        branding={branding}
        brandBackgrounds={brandBackgrounds}
        draftMarker={null}
      />
    );
  }

  return (
    <PresentationFrame
      slides={slides}
      branding={branding}
      brandBackgrounds={brandBackgrounds}
      storageKey={`proposal-${snapshot.id}`}
      isDraft={false}
      snapshotLabel={data.project.title}
    />
  );
}

// ─── Draft-mode loader ───────────────────────────────────────────────────────

async function loadDraftDeck(projectId: string): Promise<{
  slides: ProposalSlide[];
  projectTitle: string;
  nextVersion: number;
  deckTheme: string;
} | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      subtitle: true,
      objective: true,
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
      publishedVersion: true,
      media: {
        select: { id: true, url: true, kind: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!project) return null;

  const clientName =
    [project.client1First, project.client1Last].filter(Boolean).join(" ") || null;

  const addressParts = [
    project.addressLine1,
    project.city,
    [project.state, project.zip].filter(Boolean).join(" "),
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : null;

  const coverHeroUrl =
    project.media.find((m) => m.id === project.coverHeroImageId)?.url ??
    project.media.find((m) => m.kind === "COVER")?.url ??
    project.media[0]?.url ??
    null;

  // Rooms with before/render media (copied from deck page.tsx — needed by
  // getDeckForProject's auto-sync for before/after + scope breakdown).
  let projectRoomsWithMedia: RoomWithMedia[] = [];
  try {
    const rawRooms = await prisma.room.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        selectedRenderMediaId: true,
        scopeNarrative: true,
        isProjectOverhead: true,
        media: {
          where: {
            OR: [{ type: "EXISTING" }, { type: "RENDERING", renderStatus: "DONE" }],
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
        const doneRenders = room.media.filter(
          (m) => m.type === "RENDERING" && m.renderStatus === "DONE",
        );
        const seenSources = new Set<string>();
        return doneRenders
          .filter((m) => {
            if (m.parentMediaId != null) return true;
            const key = m.sourceMediaId ?? m.id;
            if (seenSources.has(key)) return false;
            seenSources.add(key);
            return true;
          })
          .map((m) => ({
            id: m.id,
            url: m.url,
            kind: m.kind,
            renderStatus: m.renderStatus,
            caption: m.caption,
          }));
      })(),
    }));
  } catch {
    // Non-fatal — empty rooms just means no auto-synced before/after slides.
  }

  // Load value pillars for why-us slide injection (mirrors deck editor page).
  let valuePillars: WhyUsPillarItem[] = [];
  try {
    const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
    if (company) {
      const rawPillars = await prisma.valuePillar.findMany({
        where: { companyId: company.id },
        orderBy: { sortOrder: "asc" },
        include: { brandIcon: { select: { id: true, imageUrl: true } } },
      });
      valuePillars = rawPillars.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        iconUrl: p.brandIcon?.imageUrl ?? null,
      }));
    }
  } catch {
    // Non-fatal
  }

  // Objective hydration source (Presentation tab config — legacy, still read).
  const proposalRow = await prisma.proposal
    .findUnique({
      where: { projectId },
      select: { publicLayoutConfig: true },
    })
    .catch(() => null);

  const objectiveConfig: ObjectivePageConfig | null = (() => {
    try {
      const raw = proposalRow?.publicLayoutConfig as PresentationConfigSaved | null | undefined;
      return raw?.pages?.objective ?? null;
    } catch {
      return null;
    }
  })();

  const slides = await getDeckForProject({
    projectId,
    projectTitle: project.title,
    clientName,
    address,
    roomsWithMedia: projectRoomsWithMedia,
  });

  // Cover hydration — inject live hero + address into every cover slide.
  if (coverHeroUrl) {
    for (const slide of slides) {
      if (slide.type === "cover") {
        slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
      }
    }
  }
  for (const slide of slides) {
    if (slide.type === "cover" && !slide.isUserModified) {
      slide.content = { ...(slide.content ?? {}), address };
    }
  }

  // Why-us pillar injection (preserves user's selectedPillarIds).
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

  // Objective slide hydration (matches editor page's logic).
  for (const slide of slides) {
    if (slide.type !== "objective" || slide.isUserModified) continue;

    const statementText =
      objectiveConfig?.objectiveText?.trim() || project.objective?.trim() || null;
    const supportingText = project.supportingText?.trim() || null;
    const bullets = (project.bullets ?? []).filter(Boolean);
    const title = objectiveConfig?.title?.trim() || null;

    if (!statementText && !supportingText && bullets.length === 0 && !title) continue;

    const existingContent = (slide.content ?? {}) as ObjectiveContent;
    slide.headline = title ?? slide.headline ?? "Project Objective";
    slide.content = {
      ...existingContent,
      statementText,
      supportingText,
      bullets,
    };
  }

  const deckRow = await prisma.proposalDeck.findUnique({
    where: { projectId },
    select: { deckTheme: true },
  });

  return {
    slides: slides.filter((s) => s.isEnabled !== false),
    projectTitle: project.title,
    nextVersion: (project.publishedVersion ?? 0) + 1,
    deckTheme: isDeckThemeKey(deckRow?.deckTheme) ? deckRow.deckTheme : "blueprint",
  };
}

// ─── Brand background loader (shared by both paths) ──────────────────────────

async function loadBrandBackgrounds(): Promise<BrandBackgroundForUI[]> {
  const rawBgs = await prisma.brandBackground.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rawBgs.map((b) => ({
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
}

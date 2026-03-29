"use server";

import { prisma } from "@/app/lib/prisma";
import { getDeckForProject, saveAllSlides } from "@/app/lib/deck/db";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import type { ProposalSlide, WhyUsPillarItem, WhyUsContent } from "@/app/lib/deck/types";

// ─── saveDeckSlidesAction ────────────────────────────────────────────────────

/**
 * Persists the current slide state from the editor to the database.
 * Called automatically by the auto-save debounce and by the manual Save button.
 */
export async function saveDeckSlidesAction(
  projectId: string,
  slides: ProposalSlide[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    await saveAllSlides(projectId, slides);
    return { ok: true };
  } catch (err) {
    console.error("[saveDeckSlidesAction]", err);
    return { ok: false, error: String(err) };
  }
}

// ─── refreshDeckAction ───────────────────────────────────────────────────────

/**
 * Re-runs the full server-side sync and returns fresh slides.
 *
 * Flow:
 *   1. Save the caller's current slides so user edits aren't lost.
 *   2. Re-fetch rooms, value pillars, and project metadata.
 *   3. Run getDeckForProject (which auto-syncs before-after + scope-breakdown).
 *   4. Re-inject live coverHeroUrl and valuePillars into the returned slides.
 *   5. Return the updated slide list.
 */
export async function refreshDeckAction(
  projectId: string,
  currentSlides: ProposalSlide[]
): Promise<{ slides: ProposalSlide[]; error?: string }> {
  try {
    // 1. Persist current state before syncing so user edits are preserved.
    await saveAllSlides(projectId, currentSlides);

    // 2. Re-fetch project metadata.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        client1First: true,
        client1Last: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
        coverHeroImageId: true,
        media: { select: { id: true, url: true, kind: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (!project) return { slides: currentSlides, error: "Project not found" };

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

    // 3. Re-fetch rooms with media.
    const rawRooms = await prisma.room.findMany({
      where: { projectId },
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
          select: { id: true, url: true, kind: true, type: true, renderStatus: true, caption: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const roomsWithMedia = rawRooms.map((room) => ({
      id: room.id,
      name: room.name,
      sortOrder: room.sortOrder,
      selectedRenderMediaId: room.selectedRenderMediaId,
      scopeNarrative: room.scopeNarrative ?? undefined,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
      renderMedia: room.media
        .filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
    }));

    // 4. Re-fetch value pillars.
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

    // 5. Run full sync.
    const slides = await getDeckForProject({
      projectId,
      projectTitle: project.title,
      clientName,
      address,
      roomsWithMedia,
    });

    // 6. Inject live coverHeroUrl into cover slides.
    if (coverHeroUrl) {
      for (const slide of slides) {
        if (slide.type === "cover") {
          slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
        }
      }
    }

    // 7. Inject fresh value pillars into why-us slides.
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

    return { slides };
  } catch (err) {
    console.error("[refreshDeckAction]", err);
    return { slides: currentSlides, error: String(err) };
  }
}

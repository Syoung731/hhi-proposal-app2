"use server";

import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { getDeckForProject, regenerateDefaultDeck, saveAllSlides } from "@/app/lib/deck/db";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import type { ProposalSlide, WhyUsPillarItem, WhyUsContent, AdditionBullet } from "@/app/lib/deck/types";
import { callClaude } from "@/app/lib/ai/model";

// ─── fetchProjectScopeOverviewAction ─────────────────────────────────────────

/**
 * Fetches the AI-generated scope overview text from the Project record.
 * Used by the InspectorPanel "Pull from Overview" button.
 */
export async function fetchProjectScopeOverviewAction(
  projectId: string
): Promise<{ scopeOverview: string | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { scopeOverview: true },
  });
  return { scopeOverview: project?.scopeOverview ?? null };
}

// ─── deleteProjectDeckAction ─────────────────────────────────────────────────

/**
 * Delete the entire deck for a project so the user can start over. Removes the
 * ProposalDeck row, which cascades to all DeckSlide rows (schema onDelete:
 * Cascade). Does NOT touch media/renders/rooms — only the slide deck. After
 * this, the deck editor shows the empty "Generate Default Deck" state again.
 */
export async function deleteProjectDeckAction(
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  if (!projectId) return { error: "Missing projectId" };
  try {
    await prisma.proposalDeck.deleteMany({ where: { projectId } });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete deck" };
  }
}

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

// ─── generateDefaultDeckAction ────────────────────────────────────────────────

/**
 * Server-side entry point for the "Generate Default Deck" button.
 *
 * Validates preconditions (≥1 Room, project has a title + client name),
 * then calls regenerateDefaultDeck() in the chosen mode. Re-injects live
 * coverHeroUrl and valuePillars into the returned slides so the editor
 * immediately renders the current state.
 */
export async function generateDefaultDeckAction(
  projectId: string,
  mode: "keep-manual" | "replace-all"
): Promise<{ slides: ProposalSlide[]; error?: string }> {
  try {
    // Fetch project + preconditions data.
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
        hasAddition: true,
        media: { select: { id: true, url: true, kind: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (!project) return { slides: [], error: "Project not found" };

    // Precondition checks.
    const missing: string[] = [];
    if (!project.title?.trim()) missing.push("project title");
    if (!project.client1First?.trim() || !project.client1Last?.trim()) {
      missing.push("primary client name");
    }

    const roomCount = await prisma.room.count({ where: { projectId } });
    if (roomCount < 1) missing.push("at least one room");

    if (missing.length > 0) {
      return {
        slides: [],
        error: `Missing required project data: ${missing.join(", ")}.`,
      };
    }

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

    // Fetch rooms with media for the regenerate call.
    const rawRooms = await prisma.room.findMany({
      where: { projectId },
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
            OR: [{ type: "EXISTING" }, { type: "RENDERING", renderStatus: "DONE" }],
          },
          select: { id: true, url: true, kind: true, type: true, renderStatus: true, caption: true, parentMediaId: true, sourceMediaId: true },
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
      scopeOverviewShort: room.scopeOverviewShort,
      isProjectOverhead: room.isProjectOverhead,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
      renderMedia: (() => {
        const doneRenders = room.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
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

    // Regenerate.
    const slides = await regenerateDefaultDeck({
      projectId,
      projectTitle: project.title,
      clientName,
      address,
      roomsWithMedia,
      hasAddition: project.hasAddition,
      mode,
    });

    // Inject live cover hero URL.
    if (coverHeroUrl) {
      for (const slide of slides) {
        if (slide.type === "cover") {
          slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
        }
      }
    }

    // Inject live value pillars.
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
    console.error("[generateDefaultDeckAction]", err);
    return { slides: [], error: String(err) };
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
        hasAddition: true,
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
        scopeOverviewShort: true,
        media: {
          where: {
            OR: [
              { type: "EXISTING" },
              { type: "RENDERING", renderStatus: "DONE" },
            ],
          },
          select: { id: true, url: true, kind: true, type: true, renderStatus: true, caption: true, parentMediaId: true, sourceMediaId: true },
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
      scopeOverviewShort: room.scopeOverviewShort,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
      renderMedia: (() => {
        const doneRenders = room.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
        // Exclude orphaned children: when a parent render is deleted, its children get parentMediaId=null
        // and look like duplicate roots. Keep only the first root per sourceMediaId.
        const seenSources = new Set<string>();
        return doneRenders
          .filter((m) => {
            if (m.parentMediaId != null) return true; // child of existing root — keep
            const key = m.sourceMediaId ?? m.id;
            if (seenSources.has(key)) return false; // duplicate root — orphan
            seenSources.add(key);
            return true;
          })
          .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption }));
      })(),
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
      hasAddition: project.hasAddition,
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

// ─── generateAdditionBulletsAction ──────────────────────────────────────────

const DEFAULT_ADDITION_BULLETS: AdditionBullet[] = [
  { id: "b1", label: "The Structure", description: "Foundations, structural framing, and all load-bearing elements engineered to current code standards." },
  { id: "b2", label: "Engineering & Systems", description: "Mechanical, electrical, and plumbing systems designed to serve the new space seamlessly." },
  { id: "b3", label: "Finishes & Site Work", description: "Interior finishes selected to complement the existing home, with exterior work matched to current materials." },
];

/**
 * Generate 3 scope-summary bullets for the Addition Overview slide
 * by pulling from the project's room scopes and summarizing via Claude.
 */
export async function generateAdditionBulletsAction(
  projectId: string
): Promise<{ bullets: AdditionBullet[]; fromAI: boolean }> {
  // Fetch all BASE rooms with scope narratives
  const rooms = await prisma.room.findMany({
    where: {
      projectId,
      bucket: "BASE",
    },
    select: { name: true, scopeNarrative: true },
    orderBy: { sortOrder: "asc" },
  });

  const roomsWithScope = rooms.filter((r) => r.scopeNarrative?.trim());

  if (roomsWithScope.length === 0) {
    return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
  }

  const formattedScopes = roomsWithScope
    .map((r) => `${r.name}:\n${r.scopeNarrative}`)
    .join("\n\n---\n\n");

  try {
    const response = await callClaude({
      system: `You are a proposal writer for a luxury design-build company. Extract exactly 3 bullet points from these room scopes for an Addition Overview slide. Each bullet has:
- A short bold label (2-4 words, e.g. "The Structure", "Engineering & Systems", "Site Work", "Interior Finishes")
- A description (1-2 sentences, specific to this project, client-facing elevated language, no contractor jargon)

Return JSON only:
{
  "bullets": [
    {"label": "...", "description": "..."},
    {"label": "...", "description": "..."},
    {"label": "...", "description": "..."}
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Room scopes:\n\n${formattedScopes}\n\nGenerate 3 bullets that summarize the key scope areas for a property addition or major renovation project.`,
        },
      ],
      max_tokens: 512,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[generateAdditionBullets] No JSON found in response");
      return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { bullets: { label: string; description: string }[] };
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length === 0) {
      return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
    }

    const bullets: AdditionBullet[] = parsed.bullets.slice(0, 3).map((b, i) => ({
      id: `ai-${Date.now()}-${i}`,
      label: b.label,
      description: b.description,
    }));

    return { bullets, fromAI: true };
  } catch (err) {
    console.error("[generateAdditionBullets] Claude error:", err);
    return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
  }
}

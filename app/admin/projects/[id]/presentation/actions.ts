"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { MediaKind, MediaType } from "@/app/generated/prisma";
import type { Prisma } from "@/app/generated/prisma";
import type { PresentationConfigSaved } from "@/app/lib/layout-config";
import { SECTIONS, MAX_SECTIONS } from "@/app/lib/sections";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { mapCandidatesToTags, normalizeTag, normalizeTranscriptTagsToLibrary } from "@/app/lib/tag-utils";
import type { LibraryMediaItem } from "@/app/admin/settings/photo-library/types";
import { suggestObjectiveContentFromText, suggestTemplateBFitStatement } from "@/app/lib/ai/objective-content";
import {
  suggestTemplateCColumns,
  suggestTemplateCSingleColumn,
  type TemplateCColumnSuggestion,
} from "@/app/lib/ai/template-c-columns";

export type PresentationMediaSnapshotItem = {
  id: string;
  url: string;
  type: string;
  kind: string;
  roomId: string | null;
  parentMediaId: string | null;
};

export async function getPresentationMediaSnapshotAction(
  projectId: string
): Promise<
  { snapshot: PresentationMediaSnapshotItem[] } | { error: string }
> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      media: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          url: true,
          type: true,
          kind: true,
          roomId: true,
          parentMediaId: true,
        },
      },
    },
  });
  if (!project) return { error: "Project not found" };

  const snapshot: PresentationMediaSnapshotItem[] = project.media.map(
    (m) => ({
      id: m.id,
      url: m.url,
      type: m.type,
      kind: m.kind,
      roomId: m.roomId,
      parentMediaId: m.parentMediaId,
    })
  );
  return { snapshot };
}

/** Sync project.coverHeroImageId from config: accept existing media or COVER renderings with valid url. */
export async function savePresentationLayoutAction(
  projectId: string,
  config: PresentationConfigSaved
): Promise<{ error?: string }> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };

  const heroMediaId = config.pages?.cover?.heroMediaId ?? null;
  if (heroMediaId) {
    const media = await prisma.media.findFirst({
      where: { id: heroMediaId, projectId },
    });
    const validUrl = media?.url != null && media.url.trim() !== "";
    const isCoverRendering =
      media?.type === MediaType.RENDERING &&
      media?.kind === MediaKind.COVER &&
      media?.roomId == null;
    const isExisting = media != null && media.type !== MediaType.RENDERING;
    if (media && validUrl && (isExisting || isCoverRendering)) {
      await prisma.project.update({
        where: { id: projectId },
        data: { coverHeroImageId: heroMediaId },
      });
    }
  } else {
    await prisma.project.update({
      where: { id: projectId },
      data: { coverHeroImageId: null },
    });
  }

  let proposal = await prisma.proposal.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!proposal) {
    proposal = await prisma.proposal.create({
      data: { projectId, isPublic: false, publicLayoutConfig: config as object },
      select: { id: true },
    });
  } else {
    await prisma.proposal.update({
      where: { projectId },
      data: { publicLayoutConfig: config as object },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  revalidatePath(`/admin/projects/${projectId}/presentation`);
  revalidatePath(`/p/${proposal.id}`);
  revalidatePath(`/p/${proposal.id}/cover`);
  revalidatePath(`/p/${proposal.id}/objective`);
  revalidatePath(`/p/${proposal.id}/difference`);
  return {};
}

// --- Objective Page AI helpers ------------------------------------------------

export async function suggestObjectiveCopyAction(input: {
  projectId: string;
  transcriptText?: string | null;
  overviewText?: string | null;
}): Promise<{
  objectiveParagraph: string;
  commitments: string[];
}> {
  await requireAdmin();
  const result = await suggestObjectiveContentFromText({
    transcriptText: input.transcriptText,
    overviewText: input.overviewText,
  });
  return {
    objectiveParagraph: result.objectiveParagraph,
    commitments: result.commitments.slice(0, 3),
  };
}

export async function suggestObjectivePhotoFiltersAction(input: {
  projectId: string;
  transcriptText?: string | null;
  overviewText?: string | null;
}): Promise<{
  sections: string[];
  tags: string[];
}> {
  await requireAdmin();
  const result = await suggestObjectiveContentFromText({
    transcriptText: input.transcriptText,
    overviewText: input.overviewText,
  });
  const out = {
    sections: result.sections.slice(0, MAX_SECTIONS),
    tags: result.tags.slice(0, 10),
  };
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[suggestObjectivePhotoFiltersAction] returning", JSON.stringify({ sections: out.sections, tags: out.tags }));
  }
  return out;
}

// --- Template C: AI-generated columns -----------------------------------------

export async function suggestTemplateCColumnsAction(input: {
  projectId: string;
  objectiveTitle?: string | null;
  objectiveText?: string | null;
  transcriptText?: string | null;
  overviewText?: string | null;
  scopeContext?: string | null;
}): Promise<{ columns: TemplateCColumnSuggestion[]; subtitle: string } | { error: string }> {
  await requireAdmin();
  const scopeContext =
    (input.scopeContext ?? "").trim() ||
    [input.transcriptText, input.overviewText].filter(Boolean).join("\n\n");
  const icons = await prisma.brandIcon.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, tags: true },
    orderBy: [{ name: "asc" }],
  });
  try {
    const result = await suggestTemplateCColumns({
      objectiveTitle: input.objectiveTitle,
      objectiveText: input.objectiveText,
      scopeContext: scopeContext || null,
      icons: icons.map((i) => ({ id: i.id, slug: i.slug, name: i.name, tags: i.tags })),
    });
    return { columns: result.columns, subtitle: result.subtitle ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate columns.";
    return { error: message };
  }
}

export async function suggestTemplateCColumnAction(input: {
  projectId: string;
  columnIndex: number;
  objectiveTitle?: string | null;
  objectiveText?: string | null;
  transcriptText?: string | null;
  overviewText?: string | null;
  scopeContext?: string | null;
}): Promise<{ column: TemplateCColumnSuggestion } | { error: string }> {
  await requireAdmin();
  if (input.columnIndex < 0 || input.columnIndex > 2) {
    return { error: "columnIndex must be 0, 1, or 2." };
  }
  const scopeContext =
    (input.scopeContext ?? "").trim() ||
    [input.transcriptText, input.overviewText].filter(Boolean).join("\n\n");
  const icons = await prisma.brandIcon.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, tags: true },
    orderBy: [{ name: "asc" }],
  });
  try {
    const result = await suggestTemplateCSingleColumn({
      objectiveTitle: input.objectiveTitle,
      objectiveText: input.objectiveText,
      scopeContext: scopeContext || null,
      icons: icons.map((i) => ({ id: i.id, slug: i.slug, name: i.name, tags: i.tags })),
      columnIndex: input.columnIndex,
    });
    return { column: result.column };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate column.";
    return { error: message };
  }
}

// --- Template B: fit statement (short copy for layout) ----------------------

export async function suggestTemplateBFitStatementAction(input: {
  projectId: string;
  objectiveText: string;
}): Promise<{ fitStatement: string } | { error: string }> {
  await requireAdmin();
  const text = (input.objectiveText ?? "").trim();
  if (!text) {
    return { error: "Objective text is required to generate Template B fit statement." };
  }
  try {
    const fitStatement = await suggestTemplateBFitStatement(text);
    return { fitStatement };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate Template B fit statement.";
    return { error: message };
  }
}

// Backward-compatible combined action (deprecated; prefer copy/photo-specific actions).
export async function suggestObjectiveContentAction(input: {
  projectId: string;
  transcriptText?: string | null;
  overviewText?: string | null;
}): Promise<{
  objectiveParagraph: string;
  commitments: string[];
  sections: string[];
  tags: string[];
}> {
  await requireAdmin();
  const result = await suggestObjectiveContentFromText({
    transcriptText: input.transcriptText,
    overviewText: input.overviewText,
  });
  return {
    objectiveParagraph: result.objectiveParagraph,
    commitments: result.commitments.slice(0, 3),
    sections: result.sections.slice(0, MAX_SECTIONS),
    tags: result.tags.slice(0, 10),
  };
}

export async function listObjectiveSuggestedPhotosAction(input: {
  projectId?: string;
  sections: string[];
  tags?: string[];
  heroOnly?: boolean;
  limit?: number;
}): Promise<{ items: LibraryMediaItem[]; topIds: string[]; error?: string }> {
  await requireAdmin();

  const sections = (input.sections ?? []).slice(0, MAX_SECTIONS);
  // Normalize transcript/AI tags into library taxonomy for better matching (Objective: no hero-only).
  let normalizedTags = normalizeTranscriptTagsToLibrary(input.tags ?? [], COMMON_TAGS);
  if (normalizedTags.length === 0 && (input.tags ?? []).length > 0) {
    normalizedTags = (input.tags ?? [])
      .map((t) => normalizeTag(t))
      .filter(Boolean);
  }
  const limit = Math.min(24, Math.max(1, input.limit ?? 24));
  const heroOnly = input.heroOnly ?? false;

  const toIso = (d: Date | null | undefined): string =>
    d != null ? d.toISOString() : new Date(0).toISOString();

  function mapLibraryMediaToItem(m: {
    id: string;
    fileKey: string;
    url: string;
    thumbnailUrl: string | null;
    title: string | null;
    description: string | null;
    roomTypeIds: string[];
    tags: string[];
    useType: string;
    quality: string;
    orientation: string;
    marketingApproved: boolean;
    sourceProjectName: string | null;
    photographer: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date | null;
  }): LibraryMediaItem {
    return {
      id: m.id,
      fileKey: m.fileKey,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      title: m.title,
      description: m.description,
      roomTypeIds: m.roomTypeIds,
      tags: m.tags,
      useType: m.useType,
      quality: m.quality,
      orientation: m.orientation,
      marketingApproved: m.marketingApproved,
      sourceProjectName: m.sourceProjectName,
      photographer: m.photographer,
      sortOrder: m.sortOrder,
      createdAt: toIso(m.createdAt),
      updatedAt: m.updatedAt != null ? m.updatedAt.toISOString() : toIso(m.createdAt),
    };
  }

  // Fallback: most recent LibraryMedia (global) so Suggested Photos is never blank.
  // Objective does not use hero-only; fallback uses full library when no sections/tags or zero candidates.
  async function fallbackRecentLibraryMedia(): Promise<{
    items: LibraryMediaItem[];
    topIds: string[];
  }> {
    const orderBy = [
      { quality: "asc" as const },
      { createdAt: "desc" as const },
      { sortOrder: "asc" as const },
    ];
    const rows = await prisma.libraryMedia.findMany({
      where: {},
      orderBy,
      take: limit,
    });
    const items = rows.map(mapLibraryMediaToItem);
    const topIds = items.slice(0, Math.min(3, items.length)).map((m) => m.id);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[listObjectiveSuggestedPhotosAction] Fallback to recent LibraryMedia", {
        limit,
        returned: items.length,
      });
    }
    return { items, topIds };
  }

  // No sections and no tags: return most recent library photos (full library, no hero filter).
  if (sections.length === 0 && normalizedTags.length === 0) {
    return fallbackRecentLibraryMedia();
  }

  const sectionSet = new Set(sections.map((s) => s.trim().toLowerCase()));
  const tagSet = new Set(normalizedTags);

  // Query LibraryMedia (global). Inclusive: match ANY section OR ANY tag (not "match all").
  const where: Prisma.LibraryMediaWhereInput = {
    OR: [],
  };
  if (sections.length > 0) {
    where.OR!.push({ roomTypeIds: { hasSome: sections } });
  }
  if (normalizedTags.length > 0) {
    where.OR!.push({ tags: { hasSome: normalizedTags } });
  }
  if (where.OR!.length === 0) {
    return fallbackRecentLibraryMedia();
  }
  // Objective: do not filter by hero or marketing-approved; search full library.
  // (heroOnly is default false and not used for Objective.)

  const rawRows = await prisma.libraryMedia.findMany({
    where,
    orderBy: [
      { quality: "asc" as const },
      { createdAt: "desc" as const },
      { sortOrder: "asc" as const },
    ],
    take: limit * 4,
  });

  // Score: 3 * (sectionMatch ? 1 : 0) + 1 * (number of matching tags). One section match = +3; each tag match = +1.
  type Scored = { item: LibraryMediaItem; score: number; createdAt: Date };
  const scored: Scored[] = rawRows.map((m) => {
    const mediaSections = new Set(
      (m.roomTypeIds ?? []).map((s) => s.trim().toLowerCase())
    );
    const mediaTags = (m.tags ?? []).map((t) => normalizeTag(t)).filter(Boolean);
    const sectionMatch = [...sectionSet].some((s) => mediaSections.has(s));
    const matchingTagCount = mediaTags.filter((t) => tagSet.has(t)).length;
    const score = (sectionMatch ? 3 : 0) + 1 * matchingTagCount;

    return {
      item: mapLibraryMediaToItem(m),
      score,
      createdAt: m.createdAt,
    };
  });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[listObjectiveSuggestedPhotosAction] Scored LibraryMedia", {
      sections,
      tags: normalizedTags,
      candidateCount: scored.length,
      topScores: scored.slice(0, 3).map((s) => s.score),
    });
  }

  if (scored.length === 0) {
    return fallbackRecentLibraryMedia();
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const items = scored.slice(0, limit).map((s) => s.item);
  const topIds = items.slice(0, 3).map((m) => m.id);
  return { items, topIds };
}

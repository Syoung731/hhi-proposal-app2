"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getPresignedUploadUrl } from "@/app/lib/s3";
import { SECTIONS, MAX_SECTIONS } from "@/app/lib/sections";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { mapCandidatesToTags, normalizeTag } from "@/app/lib/tag-utils";
import type { Prisma } from "@/app/generated/prisma";
import type {
  LibraryUseType,
  LibraryQuality,
  LibraryOrientation,
} from "@/app/generated/prisma";
import type {
  FinalizeLibraryMediaInput as FinalizeInput,
  UpdateLibraryMediaInput as UpdateInput,
  ListLibraryMediaFilters,
  LibraryMediaItem,
  SuggestLibraryMediaTagsInput,
  SuggestLibraryMediaTagsResult,
  GetLibraryCandidatesInput,
} from "./types";

const LIBRARY_PATH_PREFIX = "library";

const toIso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

/** Generate object key: library/{yyyy}/{mm}/{timestamp}-{random}.{ext} */
function libraryFileKey(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${LIBRARY_PATH_PREFIX}/${yyyy}/${mm}/${ts}-${random}.${ext}`;
}

export async function createLibraryUploadUrlAction(
  filename: string,
  contentType: string
): Promise<
  | { uploadUrl: string; publicUrl: string; objectKey: string }
  | { error: string }
> {
  await requireAdmin();
  const objectKey = libraryFileKey(filename);
  try {
    const result = await getPresignedUploadUrl(objectKey, contentType);
    return {
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      objectKey: result.fileKey,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate upload URL";
    return { error: message };
  }
}

export async function finalizeLibraryMediaAction(
  input: FinalizeInput
): Promise<{ id?: string; error?: string }> {
  await requireAdmin();
  const { objectKey, publicUrl } = input;
  if (!objectKey || !publicUrl) return { error: "Missing objectKey or publicUrl" };

  const identity = await requireAdmin();
  const createdByUserId = identity.userId ?? undefined;

  const maxOrder = await prisma.libraryMedia
    .aggregate({ _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);

  const record = await prisma.libraryMedia.create({
    data: {
      fileKey: objectKey,
      url: publicUrl,
      thumbnailKey: input.thumbnailKey ?? undefined,
      thumbnailUrl: input.thumbnailUrl ?? undefined,
      title: input.title?.trim() || undefined,
      description: input.description?.trim() || undefined,
      roomTypeIds: input.roomTypeIds ?? [],
      tags: input.tags ?? [],
      useType: (input.useType ?? "AFTER") as LibraryUseType,
      quality: (input.quality ?? "STANDARD") as LibraryQuality,
      orientation: (input.orientation ?? "UNKNOWN") as LibraryOrientation,
      marketingApproved: input.marketingApproved ?? true,
      sourceProjectName: input.sourceProjectName?.trim() || undefined,
      sourceProjectId: input.sourceProjectId || undefined,
      photographer: input.photographer?.trim() || undefined,
      createdByUserId: createdByUserId ?? undefined,
      sortOrder: maxOrder + 1,
    },
  });
  // Learn any non-curated tags from this media item.
  if (input.tags && input.tags.length > 0) {
    await learnLibraryTags(input.tags);
  }
  revalidatePath("/admin/settings/photo-library");
  return { id: record.id };
}

export async function updateLibraryMediaAction(
  id: string,
  input: UpdateInput
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.libraryMedia.findUnique({ where: { id } });
  if (!existing) return { error: "Library media not found" };

  await prisma.libraryMedia.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title?.trim() || null }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
      ...(input.roomTypeIds !== undefined && { roomTypeIds: input.roomTypeIds }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.useType !== undefined && { useType: input.useType as LibraryUseType }),
      ...(input.quality !== undefined && { quality: input.quality as LibraryQuality }),
      ...(input.orientation !== undefined && { orientation: input.orientation as LibraryOrientation }),
      ...(input.marketingApproved !== undefined && {
        marketingApproved: input.marketingApproved,
      }),
      ...(input.sourceProjectName !== undefined && {
        sourceProjectName: input.sourceProjectName?.trim() || null,
      }),
      ...(input.sourceProjectId !== undefined && {
        sourceProjectId: input.sourceProjectId || null,
      }),
      ...(input.photographer !== undefined && {
        photographer: input.photographer?.trim() || null,
      }),
    },
  });
  // Learn any non-curated tags whenever tags are explicitly updated.
  if (input.tags && input.tags.length > 0) {
    await learnLibraryTags(input.tags);
  }
  revalidatePath("/admin/settings/photo-library");
  return {};
}

export async function deleteLibraryMediaAction(
  id: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const existing = await prisma.libraryMedia.findUnique({ where: { id } });
  if (!existing) return { error: "Library media not found" };
  await prisma.libraryMedia.delete({ where: { id } });
  // R2 delete can be added later: deleteR2Objects([existing.fileKey], { context: 'library' })
  revalidatePath("/admin/settings/photo-library");
  return {};
}

/** Treat undefined/null/""/"all"/"All ..." as no filter (return undefined). */
function normFilter(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim();
  return !s || s === "all" || s.toLowerCase().startsWith("all ") ? undefined : s;
}

export async function listLibraryMediaAction(
  filters: ListLibraryMediaFilters = {}
): Promise<{
  items: LibraryMediaItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}> {
  await requireAdmin();
  const { projectId: _projectId, ...rest } = filters;
  const page = Math.max(1, rest.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, rest.pageSize ?? 24));
  const skip = (page - 1) * pageSize;

  // Only apply quality/marketingApproved when explicitly requested. includeUnapproved=true means show full library.
  const includeUnapproved = rest.includeUnapproved === true;
  const mode = rest.mode === "heroOnly" ? "heroOnly" : "all";

  // Always query global Photo Library (LibraryMedia). projectId is ignored for listing.
  const where: Prisma.LibraryMediaWhereInput = {};

  if (!includeUnapproved) {
    if (mode === "heroOnly") {
      where.quality = "HERO_READY";
      where.marketingApproved = true;
    }
    // Only apply quality/marketingApproved from payload when explicitly passed (not default "all").
    const explicitQuality = rest.quality != null && rest.quality !== "" ? normFilter(rest.quality) : undefined;
    const explicitMarketingApproved = rest.marketingApproved !== undefined && rest.marketingApproved !== null ? rest.marketingApproved : undefined;
    if (explicitQuality) where.quality = explicitQuality as any;
    if (explicitMarketingApproved !== undefined) where.marketingApproved = explicitMarketingApproved;
  }
  // When includeUnapproved is true, we do not add quality or marketingApproved so "All ..." shows everything.

  const sectionFilter = rest.roomTypeIds?.filter((id) => normFilter(id));
  if (sectionFilter?.length) {
    where.roomTypeIds = { hasSome: sectionFilter };
  }
  const useType = normFilter(rest.useType);
  if (useType) where.useType = useType as any;
  const orientation = normFilter(rest.orientation);
  if (orientation) where.orientation = orientation as any;
  const tag = normFilter(rest.tagSearch);
  if (tag) {
    const term = tag.toLowerCase();
    where.tags = { has: term };
  }
  const textSearch = normFilter(rest.textSearch);
  if (textSearch) {
    const term = `%${textSearch}%`;
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { tags: { hasSome: [textSearch] } },
    ];
  }

  const orderBy =
    filters.sort === "oldest"
      ? [{ createdAt: "asc" as const }, { sortOrder: "asc" as const }]
      : filters.sort === "hero-first"
        ? [
            { quality: "asc" as const }, // HERO_READY before STANDARD in enum order
            { createdAt: "desc" as const },
            { sortOrder: "asc" as const },
          ]
        : [{ createdAt: "desc" as const }, { sortOrder: "asc" as const }];

  const [items, total] = await Promise.all([
    prisma.libraryMedia.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.libraryMedia.count({ where }),
  ]);

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[listLibraryMediaAction] final", { includeUnapproved, mode, where, count: total });
  }

  const mapped: LibraryMediaItem[] = items.map((m) => {
    const createdAtIso = toIso(m.createdAt) ?? new Date(0).toISOString();
    const updatedAtIso = (
      m.updatedAt != null ? m.updatedAt : m.createdAt != null ? m.createdAt : new Date(0)
    ).toISOString();
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
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
    };
  });

  return {
    items: mapped,
    total,
    page,
    pageSize,
  };
}

// --- Learned Library Tags ---------------------------------------------------

async function learnLibraryTags(rawTags: string[]): Promise<void> {
  if (!rawTags.length) return;

  const normalizedCommon = new Set(COMMON_TAGS.map((t) => normalizeTag(t)));

  const normalized = rawTags
    .map((t) => normalizeTag(t))
    .filter((t) => !!t && t.length >= 3 && t.length <= 40);

  const unique = Array.from(new Set(normalized));
  const learnable = unique.filter((t) => !normalizedCommon.has(t));

  if (!learnable.length) return;

  await prisma.$transaction(
    learnable.map((tag) =>
      prisma.libraryTag.upsert({
        where: { tag },
        create: { tag, usageCount: 1 },
        update: { usageCount: { increment: 1 } },
      })
    )
  );
}

export async function listLibraryTagsAction(): Promise<{
  tags: { tag: string; usageCount: number }[];
  error?: string;
}> {
  await requireAdmin();
  const rows = await prisma.libraryTag.findMany({
    orderBy: [{ tag: "asc" }],
  });
  return {
    tags: rows.map((r) => ({ tag: r.tag, usageCount: r.usageCount })),
  };
}

export async function getLibraryCandidatesAction(
  input: GetLibraryCandidatesInput = {}
): Promise<{ candidates: LibraryMediaItem[]; error?: string }> {
  await requireAdmin();
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));

  const where: Prisma.LibraryMediaWhereInput = {};

  if (input.roomTypes?.length) {
    where.roomTypeIds = { hasSome: input.roomTypes };
  }
  if (input.tags?.length) {
    where.tags = { hasSome: input.tags };
  }
  if (input.desiredOrientation) {
    where.orientation = input.desiredOrientation as LibraryOrientation;
  }
  if (input.desiredUseTypes?.length) {
    where.useType = { in: input.desiredUseTypes as LibraryUseType[] };
  }
  if (input.heroOnly) {
    where.quality = "HERO_READY";
  }
  // For any AI/auto-fill usage, only marketing-approved photos should be surfaced.
  where.marketingApproved = true;

  const items = await prisma.libraryMedia.findMany({
    where,
    orderBy: [{ quality: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  return {
    candidates: items.map((m) => {
      if (process.env.NODE_ENV !== "production" && !m.updatedAt) {
        // eslint-disable-next-line no-console
        console.warn("[getLibraryCandidatesAction] missing updatedAt", {
          id: m.id,
        });
      }
      const createdAtIso = toIso(m.createdAt) ?? new Date(0).toISOString();
      const updatedAtIso =
        toIso(m.updatedAt) ?? createdAtIso ?? new Date(0).toISOString();
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
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
      };
    }),
  };
}

// --- AI Suggest Tags (stub; swap internals for real vision later) ---

export async function suggestLibraryMediaTagsAction(
  input: SuggestLibraryMediaTagsInput
): Promise<{ data?: SuggestLibraryMediaTagsResult; error?: string }> {
  await requireAdmin();

  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const combined = `${title} ${description}`.toLowerCase();
  const currentSectionIds = input.currentSectionIds ?? [];
  const currentTags = input.currentTags ?? [];
  const existingSections = new Set(currentSectionIds.map((s) => s.trim().toLowerCase()));
  const existingTags = new Set(currentTags.map((t) => normalizeTag(t)));

  // Stub: priority-based suggestions (kitchen -> bath -> outdoor -> infer from tags -> generic)
  let rawSections: string[] = [];
  let rawTags: string[] = [];
  const kitchenKeywords = /\bkitchen\b/;
  const bathKeywords = /\bbath|bathroom|primary bath\b/;
  const outdoorKeywords = /\bdeck|porch|outdoor|landscap|pool\b/;
  const kitchenTagHints = ["white kitchen", "quartz", "island seating", "pendants", "open concept", "subway tile"];
  const bathTagHints = ["vanity", "double vanity", "walk-in shower"];

  const hasKitchenSection = currentSectionIds.some((s) => s.toLowerCase().includes("kitchen"));
  const hasKitchenInText = kitchenKeywords.test(combined);
  const hasBathInText = bathKeywords.test(combined);
  const hasOutdoorInText = outdoorKeywords.test(combined);
  const normalizedExistingTags = [...existingTags];
  const hasKitchenTagHint = kitchenTagHints.some((h) =>
    normalizedExistingTags.some((t) => t.includes(normalizeTag(h)))
  );
  const hasBathTagHint = bathTagHints.some((h) =>
    normalizedExistingTags.some((t) => t.includes(normalizeTag(h)))
  );

  if (hasKitchenSection) {
    rawSections = ["Kitchen", "Dining Room", "Breakfast Nook"];
    rawTags = ["white kitchen", "pendants", "open concept", "quartz", "subway tile", "modern", "waterfall island", "island seating", "two-tone cabinets"];
  } else if (hasKitchenInText || hasKitchenTagHint) {
    rawSections = ["Kitchen"];
    rawTags = ["white kitchen", "pendants", "open concept", "quartz", "subway tile", "modern", "waterfall island", "built-ins", "island seating"];
  } else if (hasBathInText || hasBathTagHint) {
    rawSections = ["Primary Bath", "Bathroom"];
    rawTags = ["double vanity", "walk-in shower", "tile surround", "modern", "transitional", "freestanding tub", "glass shower", "marble", "vanity"];
  } else if (hasOutdoorInText) {
    rawSections = ["Deck", "Screened Porch", "Landscaping"];
    rawTags = ["outdoor living", "deck rebuild", "screen porch", "pool refresh", "contemporary"];
  } else {
    rawSections = [];
    rawTags = ["transitional", "modern", "built-ins", "contemporary", "natural wood", "hardwood floors", "statement lighting"];
  }

  // Sections: only allow those in canonical SECTIONS; max MAX_SECTIONS; exclude already selected
  const suggestedSections = rawSections
    .map((s) => SECTIONS.find((canonical) => canonical === s))
    .filter((s): s is string => !!s && !existingSections.has(s.toLowerCase()))
    .slice(0, MAX_SECTIONS);

  // Tags: map through COMMON_TAGS via mapCandidatesToTags; aim for at least 6 varied
  let suggestedTags = mapCandidatesToTags(
    rawTags.filter((t) => !existingTags.has(normalizeTag(t))),
    COMMON_TAGS,
    10
  );
  if (suggestedTags.length < 6) {
    const fallback = ["transitional", "modern", "contemporary", "natural wood", "open concept", "built-ins"];
    const extra = mapCandidatesToTags(
      fallback.filter((t) => !existingTags.has(normalizeTag(t)) && !suggestedTags.some((s) => normalizeTag(s) === normalizeTag(t))),
      COMMON_TAGS,
      6 - suggestedTags.length
    );
    suggestedTags = [...suggestedTags, ...extra].slice(0, 10);
  }

  return {
    data: {
      suggestedSections,
      suggestedTags,
      suggestedUseType: "AFTER",
      suggestedQuality: "STANDARD",
      suggestedOrientation: "UNKNOWN",
      reasoning: "Stub suggestions from title/description/sections/tags",
    },
  };
}

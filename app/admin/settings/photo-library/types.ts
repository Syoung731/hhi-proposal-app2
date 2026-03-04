/**
 * Shared types for Photo Library UI and server actions.
 * Client-safe: no "use server", no prisma/auth imports.
 * Import these in client components (photo-library-tab, SectionsSidebar, library-media-picker)
 * so they never pull in the server actions module for type resolution.
 */

export type FinalizeLibraryMediaInput = {
  objectKey: string;
  publicUrl: string;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  description?: string | null;
  roomTypeIds?: string[];
  tags?: string[];
  useType?: string;
  quality?: string;
  orientation?: string;
  marketingApproved?: boolean;
  sourceProjectName?: string | null;
  sourceProjectId?: string | null;
  photographer?: string | null;
};

export type UpdateLibraryMediaInput = {
  title?: string | null;
  description?: string | null;
  roomTypeIds?: string[];
  tags?: string[];
  useType?: string;
  quality?: string;
  orientation?: string;
  marketingApproved?: boolean;
  sourceProjectName?: string | null;
  sourceProjectId?: string | null;
  photographer?: string | null;
};

export type ListLibraryMediaFilters = {
  /** Optional project scoping. When provided, listLibraryMediaAction will source from the project's Media table instead of the global LibraryMedia table. */
  projectId?: string;
  /** When "heroOnly", listLibraryMediaAction adds quality=HERO_READY and marketingApproved=true. When "all" or omitted, no quality/marketing constraints. */
  mode?: "all" | "heroOnly";
  /** When true, do not filter by quality or marketingApproved (show full library). Used by Objective page picker. */
  includeUnapproved?: boolean;
  roomTypeIds?: string[];
  tagSearch?: string;
  useType?: string;
  quality?: string | null;
  orientation?: string;
  marketingApproved?: boolean | null;
  textSearch?: string;
  page?: number;
  pageSize?: number;
  sort?: "newest" | "oldest" | "hero-first";
};

export type LibraryMediaItem = {
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
  createdAt: string;
  updatedAt: string;
};

export type SuggestLibraryMediaTagsInput = {
  imageUrl?: string | null;
  fileKey?: string | null;
  libraryMediaId?: string | null;
  title?: string | null;
  description?: string | null;
  currentSectionIds?: string[];
  currentTags?: string[];
};

export type SuggestLibraryMediaTagsResult = {
  suggestedSections: string[];
  suggestedTags: string[];
  suggestedUseType?: string;
  suggestedQuality?: string;
  suggestedOrientation?: string;
  reasoning?: string;
};

export type GetLibraryCandidatesInput = {
  roomTypes?: string[];
  tags?: string[];
  desiredOrientation?: string;
  desiredUseTypes?: string[];
  heroOnly?: boolean;
  marketingApprovedOnly?: boolean;
  limit?: number;
};

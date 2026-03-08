/**
 * Shared helpers for Presentation section default selections.
 * Used by section-page-editor (auto-fill) and can be reused by public section renderer or future routes.
 */

import { SECTIONS } from "@/app/lib/sections";

type BeforePhotoItem = { id: string; url: string };
type RoomMediaItem = { id: string; url: string; label?: string };
type LibraryMediaItemLike = { id: string; url: string; roomTypeIds?: string[]; tags?: string[] };

/**
 * Default before (existing) photo selection for a room when user has not chosen yet.
 * Returns up to maxN IDs from the first existing photos.
 */
export function getDefaultBeforeSelectionForRoom(
  existingPhotos: BeforePhotoItem[],
  maxN: number
): string[] {
  if (existingPhotos.length === 0 || maxN <= 0) return [];
  return existingPhotos.slice(0, maxN).map((m) => m.id);
}

/**
 * Default after (render) selection for a room when user has not chosen yet.
 * Uses featuredConceptMediaId first if it exists in roomMedia, then fills with remaining renderings.
 */
export function getDefaultAfterSelectionForRoom(
  roomMedia: RoomMediaItem[],
  featuredConceptMediaId: string | null,
  maxN: number
): string[] {
  if (roomMedia.length === 0 || maxN <= 0) return [];
  const n = Math.min(maxN, roomMedia.length);
  if (featuredConceptMediaId && roomMedia.some((m) => m.id === featuredConceptMediaId)) {
    const featured = roomMedia.find((m) => m.id === featuredConceptMediaId)!;
    const rest = roomMedia.filter((m) => m.id !== featuredConceptMediaId);
    return [featured, ...rest].slice(0, n).map((m) => m.id);
  }
  return roomMedia.slice(0, n).map((m) => m.id);
}

/**
 * Infer a Photo Library section/room type from the section title (e.g. "Guest Bathroom" → "Bathroom").
 */
export function inferSectionTypeFromTitle(sectionTitle: string): string | null {
  const t = sectionTitle.trim().toLowerCase();
  if (!t) return null;
  const exact = SECTIONS.find((s) => s.toLowerCase() === t);
  if (exact) return exact;
  const byLength = [...SECTIONS].sort((a, b) => b.length - a.length);
  const contained = byLength.find((s) => t.includes(s.toLowerCase()));
  if (contained) return contained;
  const keywords: { word: string; section: string }[] = [
    { word: "bath", section: "Bathroom" },
    { word: "laundry", section: "Laundry" },
    { word: "kitchen", section: "Kitchen" },
    { word: "deck", section: "Deck" },
    { word: "porch", section: "Screened Porch" },
    { word: "living", section: "Living Room" },
    { word: "bedroom", section: "Bedroom" },
    { word: "dining", section: "Dining Room" },
    { word: "office", section: "Office" },
    { word: "garage", section: "Garage" },
    { word: "closet", section: "Closet" },
    { word: "hall", section: "Entry/Hall" },
    { word: "hallway", section: "Hallway" },
    { word: "entry", section: "Entry/Hall" },
    { word: "landscap", section: "Landscaping" },
    { word: "pool", section: "Pool" },
    { word: "driveway", section: "Driveway" },
    { word: "stair", section: "Stairway" },
    { word: "bar", section: "Wet / Dry Bar" },
    { word: "pantry", section: "Pantry" },
    { word: "den", section: "Den" },
    { word: "family room", section: "Family Room" },
    { word: "breakfast", section: "Breakfast Nook" },
    { word: "carolina", section: "Carolina Room" },
  ];
  for (const { word, section } of keywords) {
    if (t.includes(word)) return section;
  }
  return null;
}

/**
 * Filter and sort library photos for Template 4: matching room type first, then fallback to all.
 */
export function filterLibraryPhotosBySectionType<T extends LibraryMediaItemLike>(
  photos: T[],
  sectionType: string | null
): { items: T[]; suggestedForLabel: string | null } {
  if (!sectionType) {
    return { items: photos, suggestedForLabel: null };
  }
  const typeLower = sectionType.toLowerCase();
  const matching = photos.filter(
    (p) =>
      (Array.isArray(p.roomTypeIds) && p.roomTypeIds.some((id) => id.toLowerCase() === typeLower)) ||
      (Array.isArray(p.tags) && p.tags.some((tag) => tag.toLowerCase().includes(typeLower)))
  );
  if (matching.length === 0) {
    return { items: photos, suggestedForLabel: null };
  }
  const selectedIds = new Set(matching.map((m) => m.id));
  const rest = photos.filter((p) => !selectedIds.has(p.id));
  return {
    items: [...matching, ...rest],
    suggestedForLabel: sectionType,
  };
}

/**
 * Default reference (completed project) photo IDs for Template 4 when referencePhotoIds is empty.
 * Uses room-type/tag matching: prefer exact room-type matches, then broader, then all.
 * Returns up to maxN IDs.
 */
export function getDefaultReferenceSelectionForRoomType(
  libraryPhotos: LibraryMediaItemLike[],
  sectionType: string | null,
  maxN: number
): string[] {
  if (libraryPhotos.length === 0 || maxN <= 0) return [];
  const { items } = filterLibraryPhotosBySectionType(libraryPhotos, sectionType);
  return items.slice(0, maxN).map((p) => p.id);
}

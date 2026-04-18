/**
 * Room/section classification and Kitchen/Bath detail types.
 *
 * Sections are scope-based work areas, not just physical rooms.
 * A section called "Kitchen Remodel & Wall Removal" is still a Kitchen.
 */

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type RoomDetailType = "kitchen" | "bathroom" | null;

/**
 * Classifies a section as Kitchen, Bathroom, or neither.
 * Checks both the section name AND its sectionType name for keywords.
 */
export function classifyRoomForDetail(
  sectionName: string,
  sectionTypeName?: string | null,
): RoomDetailType {
  const name = (sectionName || "").toLowerCase();
  const typeName = (sectionTypeName || "").toLowerCase();

  // Kitchen classification
  if (name.includes("kitchen") || typeName.includes("kitchen")) return "kitchen";

  // Bathroom classification
  if (
    name.includes("bath") ||
    name.includes("powder") ||
    name.includes("ensuite") ||
    name.includes("half bath") ||
    typeName.includes("bath") ||
    typeName.includes("powder")
  )
    return "bathroom";

  return null;
}

// ---------------------------------------------------------------------------
// RoomDetail JSON schema (stored in Room.roomDetail)
// ---------------------------------------------------------------------------

/** Common fields for all room detail types. */
interface RoomDetailBase {
  existingSource?: "rendr" | "transcript" | "manual" | null;
  recommendedSource?: "ai" | "manual" | null;
}

/** Kitchen detail stored in Room.roomDetail JSON. */
export interface KitchenDetail extends RoomDetailBase {
  // Existing (what's physically there)
  baseCabinetCountExisting?: number | null;
  baseCabinetLfExisting?: number | null;
  wallCabinetCountExisting?: number | null;
  wallCabinetLfExisting?: number | null;
  countertopSfExisting?: number | null;
  countertopLfExisting?: number | null;
  backsplashSfExisting?: number | null;
  backsplashLfExisting?: number | null;
  sinkCountExisting?: number | null;
  hasStoveExisting?: boolean | null;
  hasOvenExisting?: boolean | null;
  hasFridgeExisting?: boolean | null;
  hasDishwasherExisting?: boolean | null;

  // Recommended (what the scope calls for)
  baseCabinetCountRecommended?: number | null;
  baseCabinetLfRecommended?: number | null;
  wallCabinetCountRecommended?: number | null;
  wallCabinetLfRecommended?: number | null;
  countertopSfRecommended?: number | null;
  backsplashSfRecommended?: number | null;
  sinkCountRecommended?: number | null;
  hasStoveRecommended?: boolean | null;
  hasOvenRecommended?: boolean | null;
  hasFridgeRecommended?: boolean | null;
  hasDishwasherRecommended?: boolean | null;
}

/** Bathroom detail stored in Room.roomDetail JSON. */
export interface BathroomDetail extends RoomDetailBase {
  // Existing
  vanityCabinetCountExisting?: number | null;
  vanityCabinetLfExisting?: number | null;
  countertopSfExisting?: number | null;
  countertopLfExisting?: number | null;
  backsplashSfExisting?: number | null;
  backsplashLfExisting?: number | null;
  sinkCountExisting?: number | null;
  toiletCountExisting?: number | null;
  hasTubExisting?: boolean | null;
  hasShowerExisting?: boolean | null;
  hasTubShowerComboExisting?: boolean | null;

  // Recommended
  vanityCabinetCountRecommended?: number | null;
  vanityCabinetLfRecommended?: number | null;
  countertopSfRecommended?: number | null;
  backsplashSfRecommended?: number | null;
  sinkCountRecommended?: number | null;
  toiletCountRecommended?: number | null;
  hasTubRecommended?: boolean | null;
  hasShowerRecommended?: boolean | null;
  hasTubShowerComboRecommended?: boolean | null;
}

/** Union type for Room.roomDetail JSON. */
export type RoomDetail = KitchenDetail | BathroomDetail;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard: is this detail a KitchenDetail? */
export function isKitchenDetail(d: RoomDetail): d is KitchenDetail {
  return "baseCabinetCountExisting" in d || "hasStoveExisting" in d || "hasFridgeExisting" in d;
}

/** Type guard: is this detail a BathroomDetail? */
export function isBathroomDetail(d: RoomDetail): d is BathroomDetail {
  return "vanityCabinetCountExisting" in d || "toiletCountExisting" in d || "hasTubExisting" in d;
}

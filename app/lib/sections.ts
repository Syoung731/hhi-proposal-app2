/**
 * Single source of truth for Photo Library "Sections" (formerly Room types).
 * Used in metadata modals, detail drawer, and picker filters. Stored as strings in LibraryMedia.roomTypeIds.
 */

export const SECTIONS_INTERIOR = [
  "Entry/Hall",
  "Hallway",
  "Kitchen",
  "Dining Room",
  "Breakfast Nook",
  "Living Room",
  "Family Room",
  "Den",
  "Primary Bath",
  "Bathroom",
  "Bedroom",
  "Closet",
  "Laundry",
  "Pantry",
  "Carolina Room",
  "Stairway",
  "Wet / Dry Bar",
  "Office",
  "Garage",
] as const;

export const SECTIONS_EXTERIOR = [
  "Deck",
  "Screened Porch",
  "Landscaping",
  "Pool",
  "Driveway",
] as const;

export const SECTIONS: string[] = [
  ...SECTIONS_INTERIOR,
  ...SECTIONS_EXTERIOR,
];

export type SectionGroupKey = "Interior" | "Exterior";

export const SECTION_GROUPS: { key: SectionGroupKey; label: string; sections: readonly string[] }[] = [
  { key: "Interior", label: "Interior", sections: SECTIONS_INTERIOR },
  { key: "Exterior", label: "Exterior", sections: SECTIONS_EXTERIOR },
];

export const MAX_SECTIONS = 3;

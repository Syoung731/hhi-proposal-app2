/**
 * Normalizes a room name for matching against RoomType:
 * lowercases, trims, removes punctuation, collapses spaces,
 * and removes common suffix words (room, area, space).
 */
const SUFFIX_WORDS = ["room", "area", "space"];

export function normalizeRoomName(name: string): string {
  let s = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove punctuation (keep letters, numbers, spaces)
    .replace(/\s+/g, " ")
    .trim();

  // Remove trailing suffix words (whole-word only)
  let changed: boolean;
  do {
    changed = false;
    for (const suffix of SUFFIX_WORDS) {
      const re = new RegExp(`\\s+${escapeRegex(suffix)}$`);
      if (re.test(s)) {
        s = s.replace(re, "").trim();
        changed = true;
        break;
      }
    }
  } while (changed);

  return s;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

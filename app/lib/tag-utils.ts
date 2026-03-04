/**
 * Shared tag normalization and matching for Photo Library.
 * Safe for both client and server (no Node-only APIs).
 */

/**
 * Normalize a tag: trim, collapse multiple spaces to one, lowercase.
 * Returns empty string if result would be empty.
 */
export function normalizeTag(s: string): string {
  const t = s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return t;
}

/**
 * Token overlap ratio (Jaccard-like): intersection size / union size.
 * Tokens are split on spaces.
 */
function tokenOverlapRatio(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const OVERLAP_THRESHOLD = 0.6;

/**
 * Map a candidate tag to the nearest common tag, or return the normalized candidate as a new tag.
 * - Exact match after normalization => use common tag
 * - candidate includes commonTag or commonTag includes candidate => use common tag
 * - Token overlap >= 0.6 => use common tag
 * - Else => return normalized candidate (new tag)
 */
export function matchToCommonTag(
  candidate: string,
  commonTags: readonly string[]
): string {
  const norm = normalizeTag(candidate);
  if (!norm) return "";

  const normCommon = commonTags.map((t) => ({ original: t, norm: normalizeTag(t) }));

  // Exact match
  const exact = normCommon.find(({ norm: n }) => n === norm);
  if (exact) return exact.original;

  // Substring: candidate includes commonTag or commonTag includes candidate
  for (const { original, norm: n } of normCommon) {
    if (norm.includes(n) || n.includes(norm)) return original;
  }

  // Token overlap
  for (const { original, norm: n } of normCommon) {
    if (tokenOverlapRatio(norm, n) >= OVERLAP_THRESHOLD) return original;
  }

  return norm;
}

/**
 * Map multiple candidate tags to common or new tags; dedupe and limit.
 * Prefers common tags. Returns at most maxTags.
 */
export function mapCandidatesToTags(
  candidates: string[],
  commonTags: readonly string[],
  maxTags: number = 10
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const normalizedCommon = new Set(commonTags.map((t) => normalizeTag(t)));

  for (const c of candidates) {
    if (result.length >= maxTags) break;
    const matched = matchToCommonTag(c, commonTags);
    if (!matched) continue;
    const key = normalizeTag(matched);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(matched);
  }
  return result;
}

/**
 * Normalize a raw tag for library matching: lowercase, trim, remove punctuation, collapse spaces.
 */
function normalizeForLibrary(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+$/g, "")
    .replace(/^\s+/, "");
}

/** Map transcript / AI phrases to existing library tag taxonomy (e.g. COMMON_TAGS). */
const TRANSCRIPT_TO_LIBRARY_TAG: Record<string, string> = {
  "walk in shower": "walk-in shower",
  "walk-in shower": "walk-in shower",
  "glass shower": "glass shower",
  "tile": "tile surround",
  "tile surround": "tile surround",
  "vanity": "double vanity",
  "double vanity": "double vanity",
  "quartz": "quartz",
  "marble": "marble",
  "granite": "granite",
  "laundry": "laundry upgrade",
  "laundry room": "laundry upgrade",
  "laundry upgrade": "laundry upgrade",
  "bathroom": "tile surround",
  "bath": "tile surround",
  "kitchen": "white kitchen",
  "white kitchen": "white kitchen",
  "cabinets": "painted cabinets",
  "painted cabinets": "painted cabinets",
  "hardwood": "hardwood floors",
  "hardwood floors": "hardwood floors",
  "subway tile": "subway tile",
  "shiplap": "shiplap",
  "modern": "modern",
  "traditional": "traditional",
  "contemporary": "contemporary",
  "coastal": "coastal",
  "farmhouse": "farmhouse",
  "transitional": "transitional",
  "open concept": "open concept",
  "island": "waterfall island",
  "pendants": "pendants",
  "lighting": "statement lighting",
  "statement lighting": "statement lighting",
};

/**
 * Normalize transcript/AI-generated tags into library tag taxonomy before search.
 * - Lowercases, trims, removes punctuation.
 * - Maps common phrases to existing library tags via TRANSCRIPT_TO_LIBRARY_TAG.
 * - Collapses synonyms (e.g. "walk in shower" -> "walk-in shower").
 * - Falls back to matchToCommonTag for fuzzy match; returns only tags that exist in libraryTags.
 */
export function normalizeTranscriptTagsToLibrary(
  rawTags: string[],
  libraryTags: readonly string[]
): string[] {
  const librarySet = new Set(libraryTags.map((t) => normalizeTag(t)));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawTags) {
    const n = normalizeForLibrary(raw);
    if (!n) continue;
    const mapped = TRANSCRIPT_TO_LIBRARY_TAG[n] ?? n;
    const matched = librarySet.has(normalizeTag(mapped))
      ? mapped
      : matchToCommonTag(n, libraryTags);
    if (!matched) continue;
    const key = normalizeTag(matched);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(matched.toLowerCase());
  }
  return result;
}

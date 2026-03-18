/**
 * Heuristics to detect when a string is an item-level cost code name
 * (e.g. "43M Interior Paint - Material", "06S Dumpster / Port-a-Let - Subcontract")
 * and must NOT be used as a room or trade group name.
 *
 * Source hierarchy is: top-level cost group (room) → child trade group → items with costCode.
 * Cost code names are item-level metadata only and must never create synthetic room/group nodes.
 */

/** Suffixes that indicate a cost-code category (item-level), not a room/trade name. */
const COST_CODE_SUFFIXES = [
  " - Material",
  " - Labor",
  " - Subcontract",
  " - Materials",
  " - Labour",
];

/** Regex: 2 digits + 1 letter + space (e.g. 43M, 26M, 29M, 45S, 01L, 06S). */
const COST_CODE_PREFIX = /^\d{2}[A-Za-z]\s/;

/**
 * Returns true if the name looks like an item-level cost code name rather than
 * a true cost group (room/trade) name. Such names must not be used for
 * roomName, tradeName, or to create room/group nodes.
 */
export function looksLikeCostCodeName(name: string | null | undefined): boolean {
  if (name == null || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed) return false;

  // Ends with " - Material" / " - Labor" / " - Subcontract" etc.
  const lower = trimmed.toLowerCase();
  for (const suffix of COST_CODE_SUFFIXES) {
    if (lower.endsWith(suffix.toLowerCase())) return true;
  }

  // Starts with cost-code style prefix: 2 digits + letter (e.g. 43M, 26M, 06S).
  if (COST_CODE_PREFIX.test(trimmed)) return true;

  return false;
}

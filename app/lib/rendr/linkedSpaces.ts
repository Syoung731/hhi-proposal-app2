/**
 * Linked Rendr spaces helper.
 *
 * A Project can link multiple Rendr spaces (e.g. one scan per floor). The set is
 * stored on `Project.rendrSpaces` as a JSON array of `{ spaceId, label }`, where
 * `label` is a short per-space name (e.g. "2nd Floor") used to disambiguate
 * same-named rooms across spaces during import.
 *
 * Shared by the Rendr tab UI, the import/resync server actions, the media photo
 * flow, and the AI/transcript Rendr-context builders so they all agree on the
 * shape and parsing of the linked-space set.
 */

export type LinkedSpace = {
  spaceId: number;
  label: string;
};

/**
 * Parse the `Project.rendrSpaces` JSON value into a typed, de-duplicated list.
 * Tolerates null/legacy/malformed values by returning a best-effort array.
 */
export function parseLinkedSpaces(value: unknown): LinkedSpace[] {
  if (!Array.isArray(value)) return [];
  const out: LinkedSpace[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const spaceId =
      typeof rec.spaceId === "number"
        ? rec.spaceId
        : typeof rec.spaceId === "string"
          ? Number(rec.spaceId)
          : NaN;
    if (!Number.isFinite(spaceId) || seen.has(spaceId)) continue;
    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim()
        : `Space #${spaceId}`;
    out.push({ spaceId, label });
    seen.add(spaceId);
  }
  return out;
}

/** Convenience: just the linked space ids, in order. */
export function linkedSpaceIds(value: unknown): number[] {
  return parseLinkedSpaces(value).map((s) => s.spaceId);
}

/** Convenience: the primary (first) linked space id, or null when none. */
export function primaryLinkedSpaceId(value: unknown): number | null {
  return parseLinkedSpaces(value)[0]?.spaceId ?? null;
}

/** Look up a space's short label by id, falling back to "Space #id". */
export function labelForSpace(spaces: LinkedSpace[], spaceId: number): string {
  return spaces.find((s) => s.spaceId === spaceId)?.label ?? `Space #${spaceId}`;
}

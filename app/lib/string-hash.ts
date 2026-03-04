/**
 * Deterministic string hash for change detection (e.g. objectiveTextBSourceHash).
 * Not cryptographic; use only for equality checks.
 */
export function simpleStringHash(s: string): string {
  const str = String(s ?? "");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

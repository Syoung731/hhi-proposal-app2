/**
 * Utility for cleaning scope narrative text before client-facing display.
 * The AI Review system appends a "--- Scope Clarifications (AI Review) ---"
 * section with Q&A pairs to the room's scopeNarrative. This section is useful
 * for estimating and rendering but should NOT appear in proposal text.
 */

const CLARIFICATIONS_MARKER = "--- Scope Clarifications";

/** Strip the AI Review clarifications appendix from a scope narrative. */
export function stripScopeClarifications(narrative: string): string {
  const idx = narrative.indexOf(CLARIFICATIONS_MARKER);
  return idx !== -1 ? narrative.slice(0, idx).trim() : narrative.trim();
}

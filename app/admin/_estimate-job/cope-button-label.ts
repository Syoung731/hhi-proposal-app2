/**
 * Contextual button label for the "Project Overhead" (COPE) CTA.
 *
 * Used by `<EstimateJobProgressBanner />` today; safe to reuse on any
 * future surface (rooms tab CopeRoomCard, a hypothetical project
 * overview card, etc.) so the wording stays consistent with `copeStatus`.
 *
 * `pending` is the client-side in-flight flag — set to `true` from the
 * moment the user clicks until the server reflects `copeStatus = GENERATING`.
 * Without this the button would briefly show its IDLE/READY label between
 * click and the next poll tick, enabling double-clicks.
 */
export type CopeStatus = "IDLE" | "GENERATING" | "READY" | "FAILED";

export function copeButtonLabel(status: CopeStatus, pending: boolean): string {
  if (pending || status === "GENERATING") return "Generating\u2026";
  switch (status) {
    case "IDLE":
      return "Generate Project Overhead";
    case "READY":
      return "Update Project Overhead";
    case "FAILED":
      return "Retry Project Overhead";
    default:
      return "Project Overhead";
  }
}

/**
 * Short-form variant for surfaces with tighter real estate (rooms tab COPE
 * card button). Same `status × pending` → label mapping, just the "COPE"
 * shorthand instead of "Project Overhead".
 */
export function copeShortButtonLabel(status: CopeStatus, pending: boolean): string {
  if (pending || status === "GENERATING") return "Generating\u2026";
  switch (status) {
    case "IDLE":
      return "Generate COPE";
    case "READY":
      return "Regenerate COPE";
    case "FAILED":
      return "Retry COPE";
    default:
      return "COPE";
  }
}

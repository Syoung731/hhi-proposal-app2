/**
 * Shared status-derivation helpers for the Google Workspace DWD integration.
 *
 * Two UI surfaces render this integration today:
 *   1. The dedicated settings page at /admin/settings/integrations/google-workspace/
 *   2. The inline section inside the Integrations tab (integrations-tab.tsx)
 *
 * Both map the same Integration row's columns to a kind-tagged status. Keep
 * the mapping in one place so the two surfaces can't drift apart.
 */

export type GoogleWorkspaceStatusKind =
  | "not_configured"
  | "configured_unverified"
  | "configured_failed"
  | "active";

export interface GoogleWorkspaceStatusInput {
  configured: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastStatus: string | null;
}

export function deriveGoogleWorkspaceStatus(
  input: GoogleWorkspaceStatusInput,
): GoogleWorkspaceStatusKind {
  if (!input.configured) return "not_configured";
  if (!input.lastTestedAt) return "configured_unverified";
  if (input.isActive && input.lastStatus === "success") return "active";
  return "configured_failed";
}

/** Compact pill label for the integrations-tab sibling-consistent pill. */
export function toSimplePill(
  kind: GoogleWorkspaceStatusKind,
): "connected" | "error" | "not_connected" {
  switch (kind) {
    case "active":
      return "connected";
    case "configured_failed":
      return "error";
    case "not_configured":
    case "configured_unverified":
      return "not_connected";
  }
}

import "server-only";

/**
 * Feature flag for wiring hhi-dev-context into the main app.
 * - Defaults to enabled in non-production (local dev).
 * - Can be explicitly disabled with HHI_DEV_CONTEXT_ENABLED=false.
 */

export function isDevContextEnabled(): boolean {
  const raw = process.env.HHI_DEV_CONTEXT_ENABLED;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }

  // Default: safe + local-first. In production, be conservative.
  return process.env.NODE_ENV !== "production";
}


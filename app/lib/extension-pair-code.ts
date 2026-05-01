import { prisma } from "@/app/lib/prisma";

/**
 * Import-session window: how long after first redemption the same pair code
 * may be reused as the auth credential on `/api/extension/import-zillow-photos`.
 * Mirrors the direct-handshake nonce window in `zillow-browser-connection.ts`
 * so both pairing paths have identical session semantics.
 */
const IMPORT_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Redeem a pair code, or re-verify a previously-redeemed one within the
 * import-session window.
 *
 * State machine:
 *   - usedAt = null, now <= expiresAt   → redeem (set usedAt, return projectId)
 *   - usedAt = null, now >  expiresAt   → "Code expired" (pre-redemption TTL)
 *   - usedAt set, age <= 24h            → return projectId without modifying
 *   - usedAt set, age >  24h            → "Code session expired"
 *   - row not found                     → "Invalid code"
 *
 * Why allow reuse within 24h: the Chrome extension stores the code after
 * pairing and sends it again on every `/import-zillow-photos` call as the
 * bearer credential. Without the window, every import after the first
 * pair would 401. The window's upper bound limits damage if the code leaks.
 *
 * This is called by both the public extension route (first redeem) and the
 * import endpoint (re-verify). Same function, same semantics — there is no
 * separate "verify" path to keep in sync.
 */
export async function redeemExtensionPairCode(
  code: string
): Promise<{ projectId: string } | { error: string }> {
  const trimmed = (code ?? "").trim().toUpperCase();
  if (!trimmed) return { error: "Code is required" };

  const row = await prisma.extensionPairCode.findUnique({
    where: { code: trimmed },
    select: { id: true, projectId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { error: "Invalid code" };

  const now = new Date();

  if (row.usedAt) {
    const ageMs = now.getTime() - row.usedAt.getTime();
    if (ageMs > IMPORT_SESSION_WINDOW_MS) {
      return { error: "Code session expired — request a new pair code" };
    }
    return { projectId: row.projectId };
  }

  if (now > row.expiresAt) return { error: "Code expired" };

  await prisma.extensionPairCode.update({
    where: { id: row.id },
    data: { usedAt: now },
  });
  return { projectId: row.projectId };
}

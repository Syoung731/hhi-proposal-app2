/**
 * HMAC-signed bypass token for headless-Chromium PDF rendering.
 *
 * # The problem
 * `app/lib/pdf/render-snapshot-pdf.ts` drives Playwright to load
 * `${baseUrl}/proposals/{snapshotId}?print=1` so it can rasterize the page
 * to PDF. The headless browser has no Clerk session cookie — without a
 * bypass it would 404 against the Clerk-protected proposal route.
 *
 * # The solution
 * The PDF route signs a short-lived token with `PDF_RENDER_SECRET` that
 * encodes `{ snapshotId, isDraft?, projectId?, exp }`. The token is
 * appended to the Playwright URL as `?pdfToken=...`. The Clerk middleware
 * (`proxy.ts`) checks the token before calling `auth.protect()` and lets
 * valid tokens through to the page renderer.
 *
 * # Security model
 *   - Token is HMAC-SHA256, base64url-encoded. No JWT library — Web Crypto
 *     directly. Works in both Edge (middleware) and Node (route handler).
 *   - 5-minute TTL. Long enough for Chromium cold-start + render; short
 *     enough that a leaked URL is useless after the render finishes.
 *   - Bound to the specific snapshotId/projectId being rendered. A token
 *     issued for snapshot A cannot be used to fetch snapshot B.
 *   - Secret is required at startup. We never fall back to a default —
 *     a missing secret should block PDF rendering rather than silently
 *     produce tokens an attacker could forge.
 */

import "server-only";

const TOKEN_TTL_MS = 5 * 60 * 1000;

export type PdfRenderTokenPayload = {
  snapshotId: string;
  isDraft?: boolean;
  projectId?: string;
};

export type VerifiedPdfRenderToken = PdfRenderTokenPayload & {
  /** Unix epoch ms when the token expires. */
  exp: number;
};

function getSecret(): Uint8Array {
  const raw = process.env.PDF_RENDER_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "PDF_RENDER_SECRET is not set — required to sign and verify PDF render bypass tokens. " +
        "Set it in .env.local (dev) or Vercel project env (prod). Generate with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new TextEncoder().encode(raw);
}

function base64UrlEncode(bytes: Uint8Array): string {
  // Node and Edge both support btoa on binary strings, but neither has a
  // native base64url. Hand-roll the substitution.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message as unknown as ArrayBuffer);
  return new Uint8Array(signature);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Issue a token bound to the given snapshot. Throws if `PDF_RENDER_SECRET`
 * is unset (intentionally — a missing secret should block PDF rendering).
 */
export async function generatePdfRenderToken(
  payload: PdfRenderTokenPayload,
): Promise<string> {
  const body: VerifiedPdfRenderToken = {
    snapshotId: payload.snapshotId,
    ...(payload.isDraft !== undefined ? { isDraft: payload.isDraft } : {}),
    ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
  const bodyB64 = base64UrlEncode(bodyBytes);
  const sig = await hmacSha256(getSecret(), bodyBytes);
  const sigB64 = base64UrlEncode(sig);
  return `${bodyB64}.${sigB64}`;
}

/**
 * Verify a token. Returns the decoded payload on success, `null` on any
 * failure (bad shape, bad signature, expired). Never throws — caller
 * should treat null as "not authorized" without leaking the reason.
 *
 * Safe to call from middleware (Edge runtime) and from the page (Node).
 */
export async function verifyPdfRenderToken(
  token: string,
): Promise<VerifiedPdfRenderToken | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;

  let bodyBytes: Uint8Array;
  let providedSig: Uint8Array;
  try {
    bodyBytes = base64UrlDecode(bodyB64);
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  let expectedSig: Uint8Array;
  try {
    expectedSig = await hmacSha256(getSecret(), bodyBytes);
  } catch {
    // Secret unset — fail closed.
    return null;
  }
  if (!constantTimeEqual(providedSig, expectedSig)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.snapshotId !== "string" || typeof p.exp !== "number") return null;
  if (Date.now() > p.exp) return null;

  return {
    snapshotId: p.snapshotId,
    isDraft: typeof p.isDraft === "boolean" ? p.isDraft : undefined,
    projectId: typeof p.projectId === "string" ? p.projectId : undefined,
    exp: p.exp,
  };
}

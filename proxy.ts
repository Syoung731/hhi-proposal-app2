import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { verifyPdfRenderToken } from "@/app/lib/pdf-render-token";

/**
 * Clerk middleware (Next 16 `proxy.ts` convention) for the HHI proposal app.
 *
 * Scope A — private team deployment. The default policy is "every request
 * is gated by Clerk." The exceptions below are routes that have their own
 * auth model and must reach their handlers without Clerk redirecting first:
 *
 *   - QStash webhook workers verify a signature inside the handler via
 *     `verifySignatureAppRouter`. Clerk would redirect QStash's
 *     server-to-server call to /sign-in, so they must be public here.
 *
 *   - Chrome extension callbacks (`/api/extension/*`) authenticate with a
 *     pairing nonce or pair code, not a Clerk session. They set
 *     `Access-Control-Allow-Origin: *` because they're called from a
 *     browser-extension origin, not the app origin.
 *
 *   - The Clerk-hosted sign-in / sign-up pages (`/sign-in`, `/sign-up`)
 *     obviously cannot be Clerk-gated.
 *
 *   - PDF render bypass: `/proposals/{snapshotId}` (and the draft variant)
 *     accept a `?pdfToken=...` query param that's HMAC-signed with
 *     `PDF_RENDER_SECRET`. The PDF route mints one before driving headless
 *     Chromium, so the headless browser — which has no Clerk cookie — can
 *     load the proposal page. Token is bound to a specific snapshot/project,
 *     5 min TTL. See `app/lib/pdf-render-token.ts`.
 *
 * Everything else — `/admin/*`, `/api/*` other than the exceptions, and
 * `/proposals/*` (Scope A: client-shareable links are deferred) — is
 * gated by `auth.protect()`. For document requests that means a redirect
 * to sign-in; for API requests that means Clerk returns 404 (intentional,
 * to avoid leaking that the route exists).
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Webhook workers — verify their own signatures.
  "/api/jobs/cope-generate",
  "/api/jobs/estimate-room",
  "/api/jobs/studio-render",
  "/api/jobs/jobtread-push",
  "/api/qstash/test",
  // Chrome extension callbacks — nonce / pair-code authenticated.
  "/api/extension/(.*)",
]);

// Match the proposal page itself but NOT `/proposals/{id}/pdf` — the PDF
// route stays Clerk-gated; only the page Playwright loads needs to bypass.
const PROPOSAL_PAGE_RE = /^\/proposals\/([^/]+)\/?$/;

// Budget-print page — internal print view that the budget PDF route
// drives Playwright to. Same pdfToken bypass mechanism as proposal PDFs,
// but keyed on projectId (the token already supports that field).
//
// Lives at /budget-print/ (top level) rather than under /admin/ so it
// doesn't inherit the admin layout's Clerk chrome — Chromium has no
// session and any server-rendered Clerk component would throw
// UnauthorizedError during SSR before data-print-ready could fire.
const BUDGET_PRINT_PAGE_RE = /^\/budget-print\/([^/]+)\/?$/;

/**
 * Returns the snapshotId from a valid pdfToken on a `/proposals/{snapshotId}`
 * page request, or null if the path doesn't match, the token is absent, the
 * signature is bad, or the snapshotId in the token doesn't match the URL.
 */
async function pdfTokenSnapshotIdOrNull(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(PROPOSAL_PAGE_RE);
  if (!match) return null;
  let pathSnapshotId: string;
  try {
    pathSnapshotId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const token = url.searchParams.get("pdfToken");
  if (!token) return null;
  const verified = await verifyPdfRenderToken(token);
  if (!verified) return null;
  if (verified.snapshotId !== pathSnapshotId) return null;
  return verified.snapshotId;
}

/**
 * Returns the projectId from a valid pdfToken on a
 * `/admin/projects/{projectId}/budget-print` request, or null if anything
 * fails (path mismatch, missing token, bad signature, projectId mismatch).
 *
 * Same token format as the proposal PDF flow — we just use the
 * `projectId` field instead of `snapshotId` for path comparison. The
 * budget PDF route mints tokens with both fields populated.
 */
async function pdfTokenProjectIdOrNull(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(BUDGET_PRINT_PAGE_RE);
  if (!match) return null;
  let pathProjectId: string;
  try {
    pathProjectId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const token = url.searchParams.get("pdfToken");
  if (!token) return null;
  const verified = await verifyPdfRenderToken(token);
  if (!verified) return null;
  if (verified.projectId !== pathProjectId) return null;
  return verified.projectId;
}

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;
  if (await pdfTokenSnapshotIdOrNull(request)) return NextResponse.next();
  if (await pdfTokenProjectIdOrNull(request)) return NextResponse.next();
  await auth.protect();
});

export const config = {
  // Run on every request except Next internals and static assets.
  // The first pattern excludes `_next`, `_vercel`, and any path that
  // contains a `.` (which catches files like `favicon.ico`, `robots.txt`,
  // images served from `/public`, etc.). The second pattern always
  // includes `/api` and `/trpc` so they're not treated as static.
  matcher: [
    "/((?!_next|_vercel|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};

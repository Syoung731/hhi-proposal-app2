import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
  "/api/qstash/test",
  // Chrome extension callbacks — nonce / pair-code authenticated.
  "/api/extension/(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
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

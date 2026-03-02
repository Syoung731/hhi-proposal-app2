import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes where middleware runs but no auth is required (Clerk can still run).
// "/" and "/p/*" are NOT listed — they are excluded by config.matcher so middleware never runs for them.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/(.*)",
  "/trpc/(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    const pathname = req.nextUrl.pathname;

    // ===== TEMPORARY DEBUG LOGGING =====
    console.log("MIDDLEWARE HIT:", pathname);

    if (isPublicRoute(req)) {
      console.log("PUBLIC ROUTE PASS:", pathname);
      return NextResponse.next();
    }

    if (isAdminRoute(req)) {
      console.log("ADMIN ROUTE CHECK:", pathname);

      const { userId } = await auth();

      if (!userId) {
        console.log("ADMIN: NO USER — REDIRECTING TO SIGN-IN");
        const signInUrl = new URL("/sign-in", req.url);
        signInUrl.searchParams.set("redirect_url", req.url);
        return NextResponse.redirect(signInUrl);
      }

      console.log("ADMIN: ACCESS GRANTED");
    }

    return NextResponse.next();
  },
  {
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  }
);

// Clerk middleware runs ONLY on these routes. "/" and "/p/*" are explicitly NOT included,
// so those routes bypass middleware entirely (no Clerk).
export const config = {
  matcher: [
    "/admin/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/api/:path*",
    "/trpc/:path*",
  ],
};
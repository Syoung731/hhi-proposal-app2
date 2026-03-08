import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes where proxy runs but no auth is required (Clerk can still run).
// "/" and "/p/*" are NOT listed — they are excluded by config.matcher so proxy never runs for them.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/(.*)",
  "/trpc/(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) {
      return NextResponse.next();
    }

    if (isAdminRoute(req)) {
      const { userId } = await auth();

      if (!userId) {
        const signInUrl = new URL("/sign-in", req.url);
        signInUrl.searchParams.set("redirect_url", req.url);
        return NextResponse.redirect(signInUrl);
      }
    }

    return NextResponse.next();
  },
  {
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  }
);

// Clerk proxy runs ONLY on these routes. "/" and "/p/*" are explicitly NOT included,
// so those routes bypass proxy entirely (no Clerk).
export const config = {
  matcher: [
    "/admin/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/api/:path*",
    "/trpc/:path*",
  ],
};

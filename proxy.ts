// Auth proxy stub — Clerk removed for development.
// This passthrough replaces the Clerk redirect so all admin routes
// are accessible without authentication.
// Restore real Clerk proxy before production.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/api/:path*",
    "/trpc/:path*",
  ],
};

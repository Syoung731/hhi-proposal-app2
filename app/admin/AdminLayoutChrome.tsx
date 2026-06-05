"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AdminNav } from "./admin-nav";
import { EstimateJobProvider } from "@/app/admin/_estimate-job/context";
import { EstimateJobProgressBanner } from "@/app/admin/_estimate-job/progress-banner";

type AdminLayoutChromeProps = {
  children: React.ReactNode;
  displayName: string;
  logoLightUrl: string | null;
  brandStyle: React.CSSProperties | undefined;
};

/** Path segment that identifies the draft preview iframe (no admin chrome). */
const PREVIEW_DRAFT_SEGMENT = "/preview/draft";

export function AdminLayoutChrome({
  children,
  displayName,
  logoLightUrl,
  brandStyle,
}: AdminLayoutChromeProps) {
  const pathname = usePathname();
  const isPreviewDraft = pathname?.includes(PREVIEW_DRAFT_SEGMENT) ?? false;

  // Clerk's <UserButton> injects its own DOM only on the client (after Clerk's
  // JS loads), so server-rendered HTML has nothing there → hydration mismatch.
  // Render a same-sized placeholder until mounted so server and first client
  // render agree, then swap in the real button.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (isPreviewDraft) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        {children}
      </div>
    );
  }

  // Wrap the entire admin shell in the EstimateJobProvider so the banner can
  // survive navigation across all admin pages. Rendering the banner here
  // (rather than inside `<main>`) keeps its fixed-position overlay outside
  // the main content stacking context.
  return (
    <EstimateJobProvider>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" style={brandStyle}>
        <header className="sticky top-0 z-50 border-b-2 border-zinc-200 bg-white shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto w-full max-w-[1920px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <Link
                href="/admin"
                className="flex items-center font-semibold text-zinc-900 transition hover:opacity-80 dark:text-zinc-100"
                style={!logoLightUrl ? { color: "var(--brand-text)" } : undefined}
              >
                {logoLightUrl ? (
                  <img
                    src={logoLightUrl}
                    alt="Admin"
                    className="h-16 w-auto object-contain"
                  />
                ) : (
                  "HHI Admin"
                )}
              </Link>
              <div className="flex items-center">
                <AdminNav />
                <span className="ml-4 text-xs text-zinc-500 dark:text-zinc-500">
                  {displayName}
                </span>
                <div className="ml-3 flex items-center">
                  {mounted ? (
                    <UserButton afterSignOutUrl="/sign-in" />
                  ) : (
                    <div className="h-7 w-7" aria-hidden />
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1920px] px-6 py-10">
          {children}
        </main>
      </div>
      <EstimateJobProgressBanner />
    </EstimateJobProvider>
  );
}

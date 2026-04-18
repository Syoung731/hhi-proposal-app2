"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";

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

  if (isPreviewDraft) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        {children}
      </div>
    );
  }

  return (
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
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1920px] px-6 py-10">
        {children}
      </main>
    </div>
  );
}

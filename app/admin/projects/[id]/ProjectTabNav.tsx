"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type TabDef = { slug: string; label: string; hrefOnly?: boolean };

const BASE_TABS: TabDef[] = [
  { slug: "overview", label: "Overview" },
  { slug: "rooms", label: "Sections" },
  { slug: "media", label: "Media" },
  { slug: "timeline", label: "Timeline" },
  { slug: "investment", label: "Investment" },
  { slug: "deck", label: "Deck", hrefOnly: true },
  { slug: "publish", label: "Preview & Publish" },
];

// Presentation Studio (new AI deck builder) — in development, hidden unless the
// feature flag is on. NEXT_PUBLIC_ vars are inlined at build time, so this is
// readable in this client component.
const STUDIO_ENABLED = process.env.NEXT_PUBLIC_STUDIO_ENABLED === "true";

export function ProjectTabNav({
  projectId,
  currentTab,
  rendrConfigured,
  rightSlot,
  stickyTop = 218,
}: {
  projectId: string;
  currentTab: string;
  rendrConfigured?: boolean;
  rightSlot?: ReactNode;
  /** Override the default sticky offset (main project page = 218, deck page = 112). */
  stickyTop?: number;
}) {
  const base = `/admin/projects/${projectId}`;

  const baseTabs: TabDef[] = rendrConfigured
    ? [BASE_TABS[0], { slug: "rendr", label: "Rendr" }, ...BASE_TABS.slice(1)]
    : BASE_TABS;

  // Insert the flag-gated "Build Presentation" (Studio) tab just before Deck.
  const tabs: TabDef[] = STUDIO_ENABLED
    ? baseTabs.flatMap((t) =>
        t.slug === "deck"
          ? [{ slug: "studio", label: "Build Presentation", hrefOnly: true }, t]
          : [t],
      )
    : baseTabs;

  return (
    <nav
      className="sticky z-30 -mx-6 flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-6 dark:border-zinc-800 dark:bg-zinc-950"
      style={{ top: stickyTop }}
    >
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {tabs.map(({ slug, label, hrefOnly }) => {
          const href = hrefOnly
            ? `${base}/${slug}`
            : slug === "overview"
              ? base
              : `${base}?tab=${slug}`;
          const isActive = currentTab === slug;
          return (
            <Link
              key={slug}
              href={href}
              className={
                isActive
                  ? "border-b-2 border-zinc-900 px-4 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "px-4 py-3 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
      {rightSlot && (
        <div className="flex flex-shrink-0 items-center gap-2 py-2">
          {rightSlot}
        </div>
      )}
    </nav>
  );
}

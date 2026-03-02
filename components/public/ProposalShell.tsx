"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";
import { ProposalDrawerNav } from "./ProposalDrawerNav";
import { ProposalProgressDots } from "./ProposalProgressDots";
import { ProposalPrevNext } from "./ProposalPrevNext";

const PRESENT_KEY = "proposal-present-mode";

function usePresentationMode(proposalId: string): [boolean, () => void] {
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("mode") === "present";

  const [local, setLocal] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(PRESENT_KEY);
      if (raw == null) return false;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return Boolean(parsed[proposalId]);
    } catch {
      return false;
    }
  });

  const isPresent = fromQuery || local;

  const toggle = useCallback(() => {
    setLocal((prev) => {
      const next = !prev;
      try {
        const raw = localStorage.getItem(PRESENT_KEY);
        const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, boolean>;
        parsed[proposalId] = next;
        localStorage.setItem(PRESENT_KEY, JSON.stringify(parsed));
      } catch {
        // ignore
      }
      return next;
    });
  }, [proposalId]);

  return [isPresent, toggle];
}

type Props = {
  proposalId: string;
  children: React.ReactNode;
};

const animationClass: Record<string, string> = {
  none: "",
  fade: "animate-in fade-in duration-300",
  slide: "animate-in slide-in-from-right-4 duration-300",
};

export function ProposalShell({ proposalId, children }: Props) {
  const pathname = usePathname();
  const { layoutConfig } = useProposal();
  const transitionMode = layoutConfig.transitions?.mode ?? layoutConfig.animations?.mode;
  const animClass = animationClass[transitionMode ?? "fade"] ?? "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presentMode, togglePresentMode] = usePresentationMode(proposalId);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const link = document.querySelector<HTMLAnchorElement>('a[aria-label^="Previous"]');
    link?.click();
  }, []);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const link = document.querySelector<HTMLAnchorElement>('a[aria-label^="Next"]');
    link?.click();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const link =
          e.key === "ArrowLeft"
            ? document.querySelector<HTMLAnchorElement>('a[aria-label^="Previous"]')
            : document.querySelector<HTMLAnchorElement>('a[aria-label^="Next"]');
        if (link) {
          e.preventDefault();
          link.click();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Magazine canvas: centered, max width, generous padding */}
      <main className="mx-auto min-h-screen max-w-[1100px] px-6 pb-28 pt-12 sm:px-10 sm:pb-32 sm:pt-16 md:px-14">
        {/* Top bar: only menu (and optional presentation toggle); minimal */}
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 sm:left-6 sm:top-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-600 shadow-sm transition hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {!presentMode && (
            <button
              type="button"
              onClick={togglePresentMode}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-500 shadow-sm transition hover:bg-white hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Presentation mode"
              title="Presentation mode"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          {presentMode && (
            <button
              type="button"
              onClick={togglePresentMode}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-600 shadow-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/90 dark:hover:bg-zinc-800"
              aria-label="Exit presentation mode"
              title="Exit presentation mode"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content with optional animation on chapter change */}
        <div
          key={pathname}
          className={`proposal-chapter-content ${animClass}`.trim()}
        >
          {children}
        </div>

        {/* Bottom chrome: dots (center), prev/next (sides). Hidden in non-present when "hide chrome" is on — we only hide extra stuff; dots and prev/next stay per spec. */}
        {presentMode ? (
          <>
            <ProposalProgressDots />
            <ProposalPrevNext />
          </>
        ) : (
          <>
            <ProposalProgressDots />
            <ProposalPrevNext />
          </>
        )}
      </main>

      {/* Presentation mode: invisible left/right edge tap zones for prev/next (no swipe required on mobile) */}
      {presentMode && (
        <>
          <button
            type="button"
            className="fixed left-0 top-0 z-10 h-full w-[min(80px,15vw)] cursor-default border-0 bg-transparent p-0"
            aria-label="Previous chapter"
            onClick={goPrev}
          />
          <button
            type="button"
            className="fixed right-0 top-0 z-10 h-full w-[min(80px,15vw)] cursor-default border-0 bg-transparent p-0"
            aria-label="Next chapter"
            onClick={goNext}
          />
        </>
      )}

      {/* Slide-over drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            aria-hidden
            onClick={closeDrawer}
          />
          <aside
            className="fixed left-0 top-0 z-50 h-full w-[280px] max-w-[85vw] border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            role="dialog"
            aria-label="Proposal navigation"
          >
            <div className="flex h-14 items-center justify-end border-b border-zinc-200 px-2 dark:border-zinc-700">
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ProposalDrawerNav onNavigate={closeDrawer} />
          </aside>
        </>
      )}
    </div>
  );
}

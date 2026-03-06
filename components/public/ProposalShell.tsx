"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";
import { PresentationFrame } from "@/app/components/presentation/presentation-frame";
import { ProposalDrawerNav } from "./ProposalDrawerNav";
import { ProposalProgressDots } from "./ProposalProgressDots";
import { ProposalPrevNext } from "./ProposalPrevNext";

const PRESENT_KEY = "proposal-present-mode";

function usePresentationMode(proposalId: string): [boolean, () => void] {
  const searchParams = useSearchParams();
  const [isPresent, setIsPresent] = useState<boolean>(false);
  const initialized = useRef(false);

  // After mount, resolve presentation mode from search params + localStorage.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let fromQuery = false;
    try {
      fromQuery = searchParams.get("mode") === "present";
    } catch {
      // ignore
    }

    let fromStorage = false;
    try {
      const raw = localStorage.getItem(PRESENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        fromStorage = Boolean(parsed[proposalId]);
      }
    } catch {
      // ignore
    }

    setIsPresent(fromQuery || fromStorage);
  }, [proposalId, searchParams]);

  const toggle = useCallback(() => {
    setIsPresent((prev) => {
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

function useScaleToFit(slideW: number, slideH: number) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const next = Math.min(vw / slideW, vh / slideH);
      setScale(next);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [slideW, slideH]);

  return scale;
}

type Props = {
  proposalId: string;
  children: React.ReactNode;
};

export function ProposalShell({ proposalId, children }: Props) {
  const pathname = usePathname();
  const { layoutConfig, presentationSettings } = useProposal();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presentMode, togglePresentMode] = usePresentationMode(proposalId);
  const [hydrated, setHydrated] = useState(false);

  const isSectionPage = Boolean(pathname?.includes("/section/"));

  const SLIDE_W = 1365;
  const SLIDE_H = 768;
  const scale = useScaleToFit(SLIDE_W, SLIDE_H);

  const showPresent = hydrated && presentMode;

  useEffect(() => {
    setHydrated(true);
  }, []);

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
    <div
      className={
        showPresent
          ? "fixed inset-0 bg-zinc-50 dark:bg-zinc-950"
          : "relative min-h-screen bg-zinc-50 dark:bg-zinc-950"
      }
    >
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
        {hydrated && presentMode && (
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

      {showPresent ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="absolute left-0 right-0 top-4 z-20 flex justify-center">
            <ProposalProgressDots inline />
          </div>
          <ProposalPrevNext edge />
          <div
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
              transformOrigin: "center",
            }}
            className="relative"
          >
            <PresentationFrame
              settings={presentationSettings}
              pageKey={pathname}
            >
              {children}
            </PresentationFrame>
          </div>
        </div>
      ) : isSectionPage ? (
        <main className="mx-auto w-full max-w-none px-6 py-8 pb-12 pt-16 sm:px-10 sm:pt-20">
          <div className="mb-6 flex w-full justify-center">
            <ProposalProgressDots inline />
          </div>
          <PresentationFrame
            settings={presentationSettings}
            pageKey={pathname}
          >
            {children}
          </PresentationFrame>
          <ProposalPrevNext edge />
        </main>
      ) : (
        <main className="mx-auto min-h-screen max-w-[1100px] px-6 pb-12 pt-16 sm:px-10 sm:pb-12 sm:pt-20 md:px-14">
          <div className="mb-6 flex w-full justify-center">
            <ProposalProgressDots inline />
          </div>
          <PresentationFrame
            settings={presentationSettings}
            pageKey={pathname}
          >
            {children}
          </PresentationFrame>
          <ProposalPrevNext edge />
        </main>
      )}

      {/* Presentation mode: invisible left/right edge tap zones for prev/next (no swipe required on mobile) */}
      {showPresent && (
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

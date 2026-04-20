"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideCard } from "@/app/lib/deck/SlideCard";
import { slideTitle } from "./slide-titles";

interface Props {
  slides: ProposalSlide[];
  branding: DeckBranding;
  brandBackgrounds: BrandBackgroundForUI[];
  /** Per-snapshot key used for localStorage (present-mode persistence). */
  storageKey: string;
  /** When true, shows the DRAFT PREVIEW banner. */
  isDraft: boolean;
  /** Shown in the drawer header — project title. */
  snapshotLabel: string;
}

/**
 * Full client-facing presentation shell.
 *
 * Navigation model: single-page, in-memory slide array. Active slide index is
 * client state; URL hash (#slide-N) mirrors it for deep-links and browser
 * history. Prev/Next buttons, arrow keys, and space bar all nudge the index;
 * the drawer jumps directly.
 *
 * Present mode: localStorage-backed toggle keyed by storageKey. URL
 * ?mode=present overrides on first mount. In present mode, the viewport is
 * fully given over to the 16:9 slide (no chrome inset).
 */
export function PresentationFrame({
  slides,
  branding,
  brandBackgrounds,
  storageKey,
  isDraft,
  snapshotLabel,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const initializedRef = useRef(false);

  const visibleSlides = useMemo(
    () => slides.filter((s) => s.isEnabled !== false),
    [slides],
  );

  const total = visibleSlides.length;
  const activeSlide = visibleSlides[activeIndex] ?? null;

  // Resolve initial state from URL hash + ?mode=present + localStorage once.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setHydrated(true);

    let index = 0;
    try {
      const hash = window.location.hash;
      const match = hash.match(/^#slide-(\d+)$/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= total) {
          index = parsed - 1;
        }
      }
    } catch {
      // ignore
    }
    setActiveIndex(index);

    let present = false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "present") present = true;
    } catch {
      // ignore
    }
    if (!present) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { present?: boolean };
          present = Boolean(parsed?.present);
        }
      } catch {
        // ignore
      }
    }
    setPresentMode(present);
  }, [storageKey, total]);

  // Keep URL hash in sync with activeIndex (without adding to history stack).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const next = `#slide-${activeIndex + 1}`;
      if (window.location.hash !== next) {
        // Use replaceState to avoid polluting back-button history per slide.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
      }
    } catch {
      // ignore
    }
  }, [activeIndex, hydrated]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setActiveIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const togglePresent = useCallback(() => {
    setPresentMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ present: next }));
      } catch {
        // ignore
      }
      return next;
    });
  }, [storageKey]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't steal keys from form inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "Escape") {
        if (drawerOpen) {
          setDrawerOpen(false);
          return;
        }
        if (presentMode) {
          togglePresent();
          return;
        }
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(total - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, presentMode, goPrev, goNext, togglePresent, total]);

  // Respond to manual hash edits (e.g. user pasting a #slide-5 URL).
  useEffect(() => {
    function onHashChange() {
      const match = window.location.hash.match(/^#slide-(\d+)$/);
      if (!match) return;
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= total) {
        setActiveIndex(parsed - 1);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [total]);

  if (total === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-zinc-500">This proposal has no slides yet.</p>
      </div>
    );
  }

  return (
    <div
      className={
        presentMode
          ? "fixed inset-0 flex items-center justify-center"
          : "relative flex min-h-screen flex-col items-center justify-center"
      }
      style={{ background: "#ECEAE5" }}
    >
      {/* Draft banner — only when explicitly in draft mode */}
      {isDraft && (
        <div
          className="absolute left-0 right-0 top-0 z-30 flex items-center justify-center gap-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-white"
          style={{ background: "#F47216" }}
        >
          <span>● DRAFT PREVIEW — NOT FOR CLIENT</span>
        </div>
      )}

      {/* Top-left chrome: drawer trigger + present toggle */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{ top: isDraft ? 32 : 16, left: 16 }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300/60 bg-white/95 text-zinc-700 shadow-sm transition hover:bg-white hover:text-zinc-900"
          aria-label="Open menu"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={togglePresent}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300/60 bg-white/95 text-zinc-600 shadow-sm transition hover:bg-white hover:text-zinc-900"
          aria-label={presentMode ? "Exit presentation mode" : "Presentation mode"}
          title={presentMode ? "Exit presentation mode (Esc)" : "Presentation mode"}
        >
          {presentMode ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Center 16:9 slide card */}
      <div
        className="relative"
        style={{
          width: "100%",
          maxWidth: presentMode
            ? "min(100vw, calc(100vh * 16/9))"
            : "min(calc(100vw - 48px), calc((100vh - 160px) * 16/9))",
          aspectRatio: "16 / 9",
          boxShadow: presentMode
            ? "none"
            : "0 4px 6px -1px rgba(0,0,0,0.08), 0 20px 60px -12px rgba(0,0,0,0.25)",
          borderRadius: presentMode ? 0 : 2,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {activeSlide && (
          <SlideCard
            slide={activeSlide}
            branding={branding}
            brandBackgrounds={brandBackgrounds}
            hideTextZoneOverlay
          />
        )}
      </div>

      {/* Progress dots — inline under slide in windowed mode, top-center in present mode */}
      {total > 1 && (
        <div
          className={
            presentMode
              ? "pointer-events-none absolute left-0 right-0 z-20 flex justify-center"
              : "mt-6 flex justify-center"
          }
          style={presentMode ? { top: isDraft ? 40 : 16 } : undefined}
        >
          <div className="pointer-events-auto flex items-center gap-1.5">
            {visibleSlides.map((_, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={active ? "page" : undefined}
                  className="rounded-full transition"
                  style={{
                    width: active ? 22 : 6,
                    height: 6,
                    background: active ? "#1A2332" : "rgba(26,35,50,0.25)",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Prev / Next buttons — edge-floating */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={activeIndex === 0}
            aria-label="Previous slide"
            className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300/60 bg-white/95 text-zinc-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
            style={{ left: 16, top: "50%", transform: "translateY(-50%)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
            aria-label="Next slide"
            className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300/60 bg-white/95 text-zinc-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
            style={{ right: 16, top: "50%", transform: "translateY(-50%)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Slide counter bottom-right */}
      <div
        className="absolute z-20 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm"
        style={{ bottom: 16, right: 16 }}
      >
        {activeIndex + 1} / {total}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            aria-hidden
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 z-50 flex h-full w-[320px] max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-xl"
            role="dialog"
            aria-label="Proposal navigation"
          >
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
              <div className="truncate pr-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-400">
                  Proposal
                </p>
                <p
                  className="truncate text-sm text-zinc-800"
                  style={{ fontFamily: "Cormorant Garamond, serif" }}
                >
                  {snapshotLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                aria-label="Close menu"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {visibleSlides.map((slide, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => {
                      setActiveIndex(i);
                      setDrawerOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate text-sm">
                      {slideTitle(slide, i)}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </>
      )}
    </div>
  );
}

"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";

const linkClass =
  "flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

type ProposalPrevNextProps = {
  /** When true, render in normal document flow (no absolute positioning). */
  inline?: boolean;
  /** When true, prev fixed left edge, next fixed right edge (off the slide). Portaled to body so fixed is viewport-relative. */
  edge?: boolean;
};

export function ProposalPrevNext({ inline, edge }: ProposalPrevNextProps) {
  const pathname = usePathname();
  const { sections } = useProposal();
  const currentIndex = sections.findIndex((s) => pathname === s.href);
  const prev = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < sections.length - 1
      ? sections[currentIndex + 1]
      : null;

  if (edge) {
    const edgeContent = (
      <div
        className="fixed left-0 right-0 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between px-4 pointer-events-none sm:px-6"
        aria-hidden
      >
        <div className="pointer-events-auto">
          {prev ? (
            <Link href={prev.href} className={linkClass} aria-label={`Previous: ${prev.label}`}>
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="truncate max-w-[120px] sm:max-w-[180px]">{prev.label}</span>
            </Link>
          ) : null}
        </div>
        <div className="pointer-events-auto">
          {next ? (
            <Link href={next.href} className={linkClass} aria-label={`Next: ${next.label}`}>
              <span className="truncate max-w-[120px] sm:max-w-[180px]">{next.label}</span>
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : null}
        </div>
      </div>
    );
    if (typeof document !== "undefined") {
      return createPortal(edgeContent, document.body);
    }
    return edgeContent;
  }

  return (
    <div
      className={
        inline
          ? "flex w-full items-center justify-between gap-4"
          : "pointer-events-none absolute bottom-6 left-0 right-0 z-10 flex items-center justify-between px-4 sm:px-8"
      }
    >
      <div className="pointer-events-auto flex min-w-0 flex-1 justify-start">
        {prev ? (
          <Link href={prev.href} className={linkClass} aria-label={`Previous: ${prev.label}`}>
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="truncate">{prev.label}</span>
          </Link>
        ) : (
          <span />
        )}
      </div>
      <div className="pointer-events-auto flex min-w-0 flex-1 justify-end">
        {next ? (
          <Link href={next.href} className={linkClass} aria-label={`Next: ${next.label}`}>
            <span className="truncate">{next.label}</span>
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

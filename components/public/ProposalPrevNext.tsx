"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";

export function ProposalPrevNext() {
  const pathname = usePathname();
  const { sections } = useProposal();
  const currentIndex = sections.findIndex((s) => pathname === s.href);
  const prev = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < sections.length - 1
      ? sections[currentIndex + 1]
      : null;

  return (
    <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 flex items-center justify-between px-4 sm:px-8">
      <div className="pointer-events-auto flex min-w-0 flex-1 justify-start">
        {prev ? (
          <Link
            href={prev.href}
            className="flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label={`Previous: ${prev.label}`}
          >
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
          <Link
            href={next.href}
            className="flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label={`Next: ${next.label}`}
          >
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

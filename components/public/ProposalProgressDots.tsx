"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";

type ProposalProgressDotsProps = {
  /** When true, render in normal document flow (no absolute positioning). */
  inline?: boolean;
};

export function ProposalProgressDots({ inline }: ProposalProgressDotsProps) {
  const pathname = usePathname();
  const { sections } = useProposal();
  const currentIndex = sections.findIndex((s) => pathname === s.href);

  return (
    <div
      className={
        inline ? "flex justify-center" : "absolute bottom-6 left-0 right-0 z-10 flex justify-center"
      }
    >
      <nav
        className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-2 py-1.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90"
        aria-label="Section progress"
      >
        {sections.map((section, i) => {
          const isActive = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={`block h-2 w-2 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-500 ${
                isActive
                  ? "bg-zinc-900 dark:bg-zinc-100"
                  : "bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              }`}
              aria-label={`${section.label}${isActive ? ", current" : ""}`}
              aria-current={isActive ? "true" : undefined}
              title={section.label}
            />
          );
        })}
      </nav>
    </div>
  );
}

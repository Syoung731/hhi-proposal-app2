"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProposal } from "@/app/p/[id]/ProposalContext";

type Props = {
  onNavigate?: () => void;
};

export function ProposalDrawerNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const { sections } = useProposal();

  const scopeSections = sections.filter((s) => s.type === "room");
  const otherSections = sections.filter((s) => s.type === "page");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Contents
        </h2>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Proposal sections">
        <ul className="space-y-0.5">
          {otherSections.map((section) => {
            const isActive = pathname === section.href;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  onClick={onNavigate}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {scopeSections.length > 0 && (
          <>
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <h3 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Sections
              </h3>
            </div>
            <ul className="mt-1 space-y-0.5">
              {scopeSections.map((section) => {
                const isActive = pathname === section.href;
                return (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      onClick={onNavigate}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                      }`}
                    >
                      {section.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
    </div>
  );
}

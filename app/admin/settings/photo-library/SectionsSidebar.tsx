"use client";

/**
 * Pure client UI: sections filter sidebar for Photo Library.
 * Do not import prisma, server actions, requireAdmin, or any file that pulls them in.
 * Only safe imports: react, UI libs, @/app/lib/sections (constants only).
 */
import { useState, useEffect } from "react";
import { SECTION_GROUPS, MAX_SECTIONS } from "@/app/lib/sections";

export function SectionsSidebar({
  value,
  onChange,
}: {
  value: string[];
  onChange: (sectionIds: string[]) => void;
}) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedSet = new Set(value);
  const count = value.length;

  const toggle = (section: string) => {
    if (selectedSet.has(section)) {
      onChange(value.filter((s) => s !== section));
      return;
    }
    if (count >= MAX_SECTIONS) {
      setToast("Max 3 sections.");
      return;
    }
    onChange([...value, section]);
  };

  const clearSections = () => {
    onChange([]);
  };

  return (
    <aside
      className="w-[240px] shrink-0 self-start rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
      style={{ position: "sticky", top: 0 }}
    >
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Sections
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Pick up to 3
        </p>
        <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Selected {count}/{MAX_SECTIONS}
        </p>
      </div>

      <nav className="space-y-1">
        <button
          type="button"
          onClick={clearSections}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-700/80"
        >
          All sections
        </button>

        {SECTION_GROUPS.map((group) => (
          <div key={group.key} className="pt-2">
            <p className="px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {group.label}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {group.sections.map((section) => {
                const selected = selectedSet.has(section);
                return (
                  <li key={section}>
                    <button
                      type="button"
                      onClick={() => toggle(section)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? "bg-zinc-200/90 text-zinc-900 dark:bg-zinc-600/80 dark:text-zinc-100"
                          : "text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-700/60"
                      }`}
                    >
                      {selected ? (
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-zinc-600 text-white dark:bg-zinc-400 dark:text-zinc-900"
                          aria-hidden
                        >
                          <CheckIcon className="h-2.5 w-2.5" />
                        </span>
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 truncate">{section}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {toast && (
        <div
          className="absolute bottom-3 left-3 right-3 rounded-md bg-zinc-800 px-3 py-2 text-center text-xs font-medium text-white shadow-lg dark:bg-zinc-200 dark:text-zinc-900"
          role="status"
        >
          {toast}
        </div>
      )}
    </aside>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

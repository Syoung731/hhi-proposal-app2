"use client";

import type { PageListItem, PresentationPageId } from "./types";

type PageListProps = {
  items: PageListItem[];
  selectedId: PresentationPageId | null;
  onSelect: (id: PresentationPageId) => void;
};

export function PageList({ items, selectedId, onSelect }: PageListProps) {
  return (
    <div className="max-h-[60vh] overflow-y-auto p-2">
      {items.map((item) => {
        const isActive = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
              isActive
                ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
            }`}
          >
            <span className="truncate font-medium">{item.label}</span>
            {typeof item.badge === "number" && (
                <span className="flex shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                  {item.badge}
                </span>
              )}
          </button>
        );
      })}
    </div>
  );
}

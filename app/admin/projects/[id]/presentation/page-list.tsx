"use client";

import type { PageListItem, PresentationPageId } from "./types";

type PageListProps = {
  items: PageListItem[];
  selectedId: PresentationPageId | null;
  onSelect: (id: PresentationPageId) => void;
};

type EnhancedPageListProps = PageListProps & {
  sectionsExpanded: boolean;
  onToggleSectionsExpanded: () => void;
  onToggleRoomPublished: (roomId: string, published: boolean) => void;
  onToggleAdditionalSectionsPublished: (published: boolean) => void;
  onToggleAllSectionsPublished: (published: boolean) => void;
};

export function PageList({
  items,
  selectedId,
  onSelect,
  sectionsExpanded,
  onToggleSectionsExpanded,
  onToggleRoomPublished,
  onToggleAdditionalSectionsPublished,
  onToggleAllSectionsPublished,
}: EnhancedPageListProps) {
  const topLevel = items.filter(
    (item) => item.kind !== "room" && item.kind !== "rollup"
  );
  const sectionItems = items.filter(
    (item) => item.kind === "room" || item.kind === "rollup"
  );

  return (
    <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2">
      <div className="space-y-1">
        {topLevel.map((item) => {
          const isActive = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                isActive
                  ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                  : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className="truncate font-medium">{item.label}</span>
              {typeof item.badge === "number" && (
                <span className="ml-2 flex shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sectionItems.length > 0 && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={onToggleSectionsExpanded}
              className="flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              <span>{sectionsExpanded ? "▾" : "▸"}</span>
              <span>Sections</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleAllSectionsPublished(true)}
                className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Include all
              </button>
              <button
                type="button"
                onClick={() => onToggleAllSectionsPublished(false)}
                className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Exclude all
              </button>
            </div>
          </div>
          {sectionsExpanded && (
            <div className="mt-1 space-y-1">
              {sectionItems.map((item) => {
                const isActive = item.id === selectedId;
                const published = item.published !== false;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                      isActive
                        ? "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
                        : "border-transparent hover:bg-zinc-200/80 dark:hover:bg-zinc-700/50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={published}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (item.kind === "room" && item.roomId) {
                            onToggleRoomPublished(item.roomId, e.target.checked);
                          } else if (item.kind === "rollup") {
                            onToggleAdditionalSectionsPublished(e.target.checked);
                          }
                        }}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {item.label}
                        {!published && (
                          <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                            (Not Published)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof item.badge === "number" && (
                        <span className="flex shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-600">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

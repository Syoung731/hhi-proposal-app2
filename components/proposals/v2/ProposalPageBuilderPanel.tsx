"use client";

import type { ProposalPageConfig } from "./page-model";
import { PAGE_TYPES, LAYOUT_KEYS } from "./page-model";
import type { ProposalPageConfigActions } from "./useProposalPageConfigState";

export type ProposalPageBuilderPanelProps = {
  pages: ProposalPageConfig;
  actions: ProposalPageConfigActions;
};

const sorted = (pages: ProposalPageConfig) =>
  [...pages].sort((a, b) => a.order - b.order);

export function ProposalPageBuilderPanel({
  pages,
  actions,
}: ProposalPageBuilderPanelProps) {
  const ordered = sorted(pages);

  return (
    <aside
      className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/80 overflow-y-auto"
      aria-label="Page builder (dev)"
    >
      <div className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          DEV Page Builder
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Changes are local only
        </p>
      </div>

      <div className="p-3 space-y-4">
        {/* Add page */}
        <div>
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            Add page
          </p>
          <div className="flex flex-wrap gap-1">
            {PAGE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => actions.addPageByType(type)}
                className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                + {type}
              </button>
            ))}
          </div>
        </div>

        {/* Page list */}
        <div className="space-y-3">
          {ordered.map((page) => (
            <div
              key={page.id}
              className={`rounded-lg border p-2 ${
                page.isEnabled
                  ? "border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800/50"
                  : "border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/30 opacity-75"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {page.type} #{page.order + 1}
                </span>
                <label className="flex items-center gap-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={page.isEnabled}
                    onChange={() => actions.toggleEnabled(page.id)}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                  <span className="text-xs text-zinc-500">on</span>
                </label>
              </div>

              <div className="mb-2">
                <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">
                  Layout
                </label>
                <select
                  value={page.layoutKey}
                  onChange={(e) => actions.setLayoutKey(page.id, e.target.value)}
                  className="w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-200"
                >
                  {(LAYOUT_KEYS[page.type] as readonly string[]).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => actions.moveUp(page.id)}
                  disabled={ordered.findIndex((p) => p.id === page.id) === 0}
                  className="rounded border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 text-xs disabled:opacity-40"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => actions.moveDown(page.id)}
                  disabled={
                    ordered.findIndex((p) => p.id === page.id) ===
                    ordered.length - 1
                  }
                  className="rounded border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 text-xs disabled:opacity-40"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => actions.duplicate(page.id)}
                  className="rounded border border-zinc-300 dark:border-zinc-600 px-1.5 py-0.5 text-xs"
                  title="Duplicate"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => actions.remove(page.id)}
                  className="rounded border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-xs text-red-700 dark:text-red-400"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

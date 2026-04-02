"use client";

import { useState, useEffect } from "react";

type TemplateItem = {
  id: string;
  name: string;
  costCode: string | null;
  costType: string | null;
  catalogItem: { id: string; name: string; unitCost: number | null; unitPrice: number | null; unit: string; trade: string | null } | null;
};

type TradeGroup = {
  id: string;
  name: string;
  sortOrder: number;
  items: TemplateItem[];
};

type RoomTemplate = {
  id: string;
  name: string;
  displayName: string | null;
  active: boolean;
  tradeGroups: TradeGroup[];
};

type AvailableTemplate = {
  id: string;
  name: string;
  alreadyImported: boolean;
};

export function TemplatesTab() {
  const [templates, setTemplates] = useState<RoomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [available, setAvailable] = useState<AvailableTemplate[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/templates/imported");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  async function openImportModal() {
    setImportModalOpen(true);
    setLoadingAvailable(true);
    setSelectedIds(new Set());
    setImportResult(null);
    try {
      const res = await fetch("/api/settings/templates/available");
      const data = await res.json();
      setAvailable(data.templates ?? []);
    } catch {
      setAvailable([]);
    } finally {
      setLoadingAvailable(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    if (selectedIds.size === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/settings/templates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.error) {
        setImportResult(`Error: ${data.error}`);
      } else {
        const count = data.imported?.length ?? 0;
        setImportResult(`Imported ${count} template(s)`);
        setImportModalOpen(false);
        await loadTemplates();
      }
    } catch (e) {
      setImportResult(`Import failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  }

  async function toggleActive(template: RoomTemplate) {
    const newActive = !template.active;
    try {
      // Simple toggle via a PATCH-style call — we'll do it inline
      await fetch("/api/settings/templates/imported", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id, active: newActive }),
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? { ...t, active: newActive } : t))
      );
    } catch {
      // Silently fail — UI already reflects previous state
    }
  }

  function totalItemCount(t: RoomTemplate) {
    return t.tradeGroups.reduce((sum, g) => sum + g.items.length, 0);
  }

  function matchedCount(t: RoomTemplate) {
    return t.tradeGroups.reduce(
      (sum, g) => sum + g.items.filter((i) => i.catalogItem != null).length,
      0
    );
  }

  return (
    <div className="space-y-6">
      {/* Import Banner */}
      <div className="flex items-center gap-4">
        <button
          onClick={openImportModal}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Import from JobTread
        </button>
        {importResult && (
          <span className={`text-sm ${importResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
            {importResult}
          </span>
        )}
      </div>

      {/* Imported Templates */}
      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No templates imported yet. Click &quot;Import from JobTread&quot; to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const expanded = expandedId === t.id;
            const items = totalItemCount(t);
            const matched = matchedCount(t);
            return (
              <div
                key={t.id}
                className={`rounded-lg border ${t.active ? "border-zinc-200 dark:border-zinc-700" : "border-zinc-200/60 opacity-60 dark:border-zinc-800"} bg-white dark:bg-zinc-900`}
              >
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3"
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                >
                  <span className="text-zinc-400">{expanded ? "▾" : "▸"}</span>
                  <div className="flex-1">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {t.displayName ?? t.name}
                    </span>
                    <span className="ml-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {t.tradeGroups.length} trade groups · {items} items · {matched}/{items} matched
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(t);
                    }}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      t.active
                        ? "border border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
                        : "border border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {t.active ? "Active" : "Inactive"}
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    {t.tradeGroups.map((g) => (
                      <div key={g.id} className="mb-3 last:mb-0">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          {g.name}
                          <span className="ml-2 font-normal normal-case">({g.items.length} items)</span>
                        </p>
                        <div className="space-y-0.5 pl-3">
                          {g.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 text-sm">
                              {item.catalogItem ? (
                                <span className="text-green-600 dark:text-green-400" title="Matched to catalog">✓</span>
                              ) : (
                                <span className="text-amber-500 dark:text-amber-400" title="Not matched to catalog">○</span>
                              )}
                              <span className="text-zinc-700 dark:text-zinc-300">{item.name}</span>
                              {!item.catalogItem && (
                                <span className="text-xs text-amber-600 dark:text-amber-400">unmatched</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import Modal */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setImportModalOpen(false)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Import Room Templates
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Select templates from your JobTread cost group templates.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {loadingAvailable ? (
                <p className="py-4 text-center text-sm text-zinc-500">Loading templates from JobTread…</p>
              ) : available.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">No templates found.</p>
              ) : (
                <div className="space-y-1">
                  {available.map((t) => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                        t.alreadyImported
                          ? "cursor-default opacity-50"
                          : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={t.alreadyImported || selectedIds.has(t.id)}
                        disabled={t.alreadyImported}
                        onChange={() => toggleSelect(t.id)}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <span className="flex-1 text-zinc-900 dark:text-zinc-100">{t.name}</span>
                      {t.alreadyImported && (
                        <span className="text-xs text-zinc-400">(Imported)</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
              {importResult && (
                <span className={`mr-auto text-sm ${importResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                  {importResult}
                </span>
              )}
              <button
                onClick={() => setImportModalOpen(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || selectedIds.size === 0}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {importing ? "Importing…" : `Import ${selectedIds.size} Selected`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

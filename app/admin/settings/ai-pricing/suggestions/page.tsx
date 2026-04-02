"use client";

import { useEffect, useState, useCallback } from "react";

interface Suggestion {
  id: string;
  itemName: string;
  tradeGroup: string | null;
  suggestedUnit: string | null;
  avgUnitPrice: number | null;
  avgUnitCost: number | null;
  occurrenceCount: number;
  status: string;
  resolvedAt: string | null;
  catalogItemId: string | null;
}

type FilterStatus = "all" | "pending" | "added" | "dismissed";

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [loading, setLoading] = useState(true);
  const [accentColor, setAccentColor] = useState("#F47216");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    const qs = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/settings/catalog/suggestions${qs}`);
    const data = await res.json();
    setSuggestions(data.suggestions ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    fetch("/api/settings/context")
      .then((r) => r.json())
      .then((d) => {
        if (d.accentColor) setAccentColor(d.accentColor);
      })
      .catch(() => {});
  }, []);

  async function handleAddToCatalog(id: string) {
    setActionLoading(id);
    await fetch(`/api/settings/catalog/suggestions/${id}/add`, { method: "POST" });
    await fetchSuggestions();
    setActionLoading(null);
  }

  async function handleDismiss(id: string) {
    setActionLoading(id);
    await fetch(`/api/settings/catalog/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    await fetchSuggestions();
    setActionLoading(null);
  }

  async function handleRestore(id: string) {
    setActionLoading(id);
    await fetch(`/api/settings/catalog/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    await fetchSuggestions();
    setActionLoading(null);
  }

  const filters: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "added", label: "Added" },
    { key: "dismissed", label: "Dismissed" },
  ];

  function formatDollar(v: number | null) {
    if (v == null) return "—";
    return `$${v.toFixed(2)}`;
  }

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          AI Pricing
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Catalog Suggestions
        </p>
      </header>

      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Items the AI priced that aren&apos;t in your catalog yet. Add frequently used items to improve future estimates.
      </p>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={
              filter === f.key
                ? { backgroundColor: accentColor, color: "#fff" }
                : { backgroundColor: "transparent", color: "#71717a" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading suggestions...</p>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No suggestions yet. Run some AI estimates and items not found in your catalog will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-3 pr-4">Item Name</th>
                <th className="pb-3 pr-4">Trade</th>
                <th className="pb-3 pr-4 text-right">Times Used</th>
                <th className="pb-3 pr-4 text-right">Avg Price</th>
                <th className="pb-3 pr-4 text-right">Avg Cost</th>
                <th className="pb-3 pr-4">Unit</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td
                    className="py-3 pr-4 font-medium text-zinc-900 dark:text-zinc-100"
                    style={s.status === "dismissed" ? { textDecoration: "line-through", color: "#a1a1aa" } : {}}
                  >
                    {s.itemName}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {s.tradeGroup ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">
                    {s.occurrenceCount}
                  </td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">
                    {formatDollar(s.avgUnitPrice)}
                  </td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">
                    {formatDollar(s.avgUnitCost)}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {s.suggestedUnit ?? "EA"}
                  </td>
                  <td className="py-3 pr-4">
                    {s.status === "pending" && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                        Pending
                      </span>
                    )}
                    {s.status === "added" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        In Catalog
                      </span>
                    )}
                    {s.status === "dismissed" && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 line-through">
                        Dismissed
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    {s.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddToCatalog(s.id)}
                          disabled={actionLoading === s.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                          style={{ backgroundColor: accentColor }}
                        >
                          {actionLoading === s.id ? "Adding..." : "Add to Catalog"}
                        </button>
                        <button
                          onClick={() => handleDismiss(s.id)}
                          disabled={actionLoading === s.id}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {s.status === "dismissed" && (
                      <button
                        onClick={() => handleRestore(s.id)}
                        disabled={actionLoading === s.id}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Restore
                      </button>
                    )}
                    {s.status === "added" && (
                      <span className="text-xs text-green-600">
                        <svg className="mr-1 inline h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        In Catalog
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

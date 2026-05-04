"use client";

import { useState, useEffect, useMemo } from "react";
import { hideCatalogItems, unhideCatalogItems } from "./catalog-actions";

type CatalogItem = {
  id: string;
  jobtreadId: string;
  name: string;
  description: string | null;
  costCode: string | null;
  costType: string | null;
  unitCost: number | null;
  unitPrice: number | null;
  unit: string;
  trade: string | null;
  hidden: boolean;
  lastSyncedAt: string;
};

const TRADE_COLORS: Record<string, string> = {
  "Demolition": "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  "Electrical": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Plumbing": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Cabinets/Countertops": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Tile": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "Flooring": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Paint": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Trim": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Doors": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Framing": "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "HVAC": "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  "Drywall": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  "Insulation": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Windows": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  "Admin/Overhead": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const DEFAULT_BADGE = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function formatCurrency(val: number | null) {
  if (val == null) return "—";
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SortKey = "trade" | "name" | "costType" | "unitCost" | "unitPrice" | "unit";
type SortDir = "asc" | "desc";

export function CatalogTab() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [costTypeFilter, setCostTypeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trade");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showHidden, setShowHidden] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mutating, setMutating] = useState(false);
  const [mutationResult, setMutationResult] = useState<string | null>(null);

  async function loadItems(includeHidden: boolean) {
    setLoading(true);
    try {
      const url = includeHidden
        ? "/api/settings/catalog/items?includeHidden=true"
        : "/api/settings/catalog/items";
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems(showHidden);
    setSelectedIds(new Set());
  }, [showHidden]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/settings/catalog/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(`Synced ${data.total} items (${data.updated} updated, ${data.created} created)`);
        await loadItems(showHidden);
      }
    } catch (e) {
      setSyncResult(`Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  const trades = useMemo(() => {
    const set = new Set(items.map((i) => i.trade).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const costTypes = useMemo(() => {
    const set = new Set(items.map((i) => i.costType).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const lastSynced = useMemo(() => {
    if (items.length === 0) return null;
    const dates = items.map((i) => new Date(i.lastSyncedAt).getTime());
    return new Date(Math.max(...dates));
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (tradeFilter) {
      result = result.filter((i) => i.trade === tradeFilter);
    }
    if (costTypeFilter) {
      result = result.filter((i) => i.costType === costTypeFilter);
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [items, search, tradeFilter, costTypeFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = filtered.map((i) => i.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const selectedCount = selectedIds.size;
  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );
  const allSelectedAreHidden = selectedItems.length > 0 && selectedItems.every((i) => i.hidden);

  async function handleHide() {
    if (selectedCount === 0) return;
    setMutating(true);
    setMutationResult(null);
    try {
      const result = await hideCatalogItems(Array.from(selectedIds));
      setMutationResult(`Hid ${result.count} item${result.count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      await loadItems(showHidden);
    } catch (e) {
      setMutationResult(`Hide failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setMutating(false);
    }
  }

  async function handleUnhide() {
    if (selectedCount === 0) return;
    setMutating(true);
    setMutationResult(null);
    try {
      const result = await unhideCatalogItems(Array.from(selectedIds));
      setMutationResult(`Unhid ${result.count} item${result.count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      await loadItems(showHidden);
    } catch (e) {
      setMutationResult(`Unhide failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setMutating(false);
    }
  }

  const visibleIds = filtered.map((i) => i.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-6">
      {/* Sync Banner */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex-1">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {lastSynced
              ? `Last synced: ${lastSynced.toLocaleDateString()} ${lastSynced.toLocaleTimeString()}`
              : items.length === 0
                ? "Never synced"
                : "Catalog loaded"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {items.length} items in catalog
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{ minHeight: 32 }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {syncing ? "Syncing…" : "Sync from JobTread"}
        </button>
        {syncResult && (
          <p className={`w-full text-sm ${syncResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
            {syncResult}
          </p>
        )}
      </div>

      {/* Filters + Show Hidden + Bulk action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minHeight: 32 }}
          className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          style={{ minHeight: 32 }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All Trades</option>
          {trades.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={costTypeFilter}
          onChange={(e) => setCostTypeFilter(e.target.value)}
          style={{ minHeight: 32 }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All Cost Types</option>
          {costTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            style={{ minHeight: 16, minWidth: 16 }}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          Show hidden
        </label>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {filtered.length} of {items.length} items
        </span>
      </div>

      {/* Bulk action bar — appears when items are selected */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {selectedCount} selected
          </span>
          {!allSelectedAreHidden && (
            <button
              onClick={handleHide}
              disabled={mutating}
              style={{ minHeight: 32 }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {mutating ? "Hiding…" : `Hide ${selectedCount} Selected`}
            </button>
          )}
          {selectedItems.some((i) => i.hidden) && (
            <button
              onClick={handleUnhide}
              disabled={mutating}
              style={{ minHeight: 32 }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {mutating ? "Unhiding…" : `Unhide ${selectedItems.filter((i) => i.hidden).length} Selected`}
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ minHeight: 32 }}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Clear
          </button>
          {mutationResult && (
            <span className={`text-sm ${mutationResult.startsWith("Hide failed") || mutationResult.startsWith("Unhide failed") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
              {mutationResult}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading catalog…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No catalog items yet. Click &quot;Sync from JobTread&quot; to pull your pricing catalog.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible"
                    style={{ minHeight: 16, minWidth: 16 }}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                  />
                </th>
                <th className="cursor-pointer px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("trade")}>
                  Trade {sortIcon("trade")}
                </th>
                <th className="cursor-pointer px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("name")}>
                  Name {sortIcon("name")}
                </th>
                <th className="cursor-pointer px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("costType")}>
                  Cost Type {sortIcon("costType")}
                </th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("unitCost")}>
                  Unit Cost {sortIcon("unitCost")}
                </th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("unitPrice")}>
                  Unit Price {sortIcon("unitPrice")}
                </th>
                <th className="cursor-pointer px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400" onClick={() => toggleSort("unit")}>
                  Unit {sortIcon("unit")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${item.hidden ? "opacity-50" : ""} ${isSelected ? "bg-zinc-50 dark:bg-zinc-800/40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.name}`}
                        style={{ minHeight: 16, minWidth: 16 }}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {item.trade ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_COLORS[item.trade] ?? DEFAULT_BADGE}`}>
                          {item.trade}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                      {item.name}
                      {item.hidden && (
                        <span className="ml-2 inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{item.costType ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{formatCurrency(item.unitCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100 font-medium">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-500">{item.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

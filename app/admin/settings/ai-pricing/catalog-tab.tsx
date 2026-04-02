"use client";

import { useState, useEffect, useMemo } from "react";

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

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/catalog/items");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, []);

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
        await loadItems();
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
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
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All Cost Types</option>
          {costTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {filtered.length} of {items.length} items
        </span>
      </div>

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
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-3 py-2">
                    {item.trade ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_COLORS[item.trade] ?? DEFAULT_BADGE}`}>
                        {item.trade}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{item.name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{item.costType ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{formatCurrency(item.unitCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100 font-medium">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-500">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

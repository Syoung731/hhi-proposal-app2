"use client";

import { useEffect, useState } from "react";

interface StatsData {
  totalEstimates: number;
  totalLineItems: number;
  avgEstimateTotal: number;
  avgItemsPerEstimate: number;
  totalCorrections: number;
  totalApiCost: number;
  sourceDistribution: Array<{ source: string; count: number; percentage: number }>;
  overallMatchRate: number;
  matchRateByTemplate: Array<{ templateName: string; matchRate: number; totalItems: number }>;
  commonAiPriced: Array<{ name: string; tradeGroup: string; count: number; avgPrice: number }>;
  mostCorrected: Array<{ name: string; field: string; avgOriginal: number; avgCorrected: number; count: number }>;
  recentEstimates: Array<{ id: string; createdAt: string; roomName: string; totalPrice: number; lineItemCount: number; correctionCount: number }>;
}

const SOURCE_COLORS: Record<string, string> = {
  CATALOG: "#F47216",
  ALLOWANCE: "#f59e0b",
  AI_PRICED: "#3b82f6",
  MANUAL: "#8b5cf6",
  CALC: "#6366f1",
};

function formatDollar(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function formatDollarPrecise(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accentColor, setAccentColor] = useState("#F47216");

  useEffect(() => {
    fetch("/api/settings/ai-pricing/stats")
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/settings/context")
      .then((r) => r.json())
      .then((d) => { if (d.accentColor) setAccentColor(d.accentColor); })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-400">Loading stats...</p>
      </div>
    );
  }

  if (!stats || stats.totalEstimates === 0) {
    return (
      <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">AI Pricing</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Stats</p>
        </header>
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No estimates yet. Generate some AI estimates to see stats here.
          </p>
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Total Estimates", value: stats.totalEstimates.toString() },
    { label: "Total Line Items", value: stats.totalLineItems.toString() },
    { label: "Avg Estimate Total", value: formatDollar(stats.avgEstimateTotal) },
    { label: "Avg Items/Estimate", value: stats.avgItemsPerEstimate.toString() },
    { label: "Total Corrections", value: stats.totalCorrections.toString() },
    { label: "Est. API Cost", value: formatDollarPrecise(stats.totalApiCost) },
  ];

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">AI Pricing</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Stats</p>
      </header>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Track estimate accuracy and system performance over time.
      </p>

      {/* Section 1: Top-line metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }} className="mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Section 2: Source Distribution */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Line Item Sources</h2>
        <div className="mb-3 flex h-6 w-full overflow-hidden rounded-full">
          {stats.sourceDistribution.map((s) => (
            <div
              key={s.source}
              style={{
                width: `${s.percentage}%`,
                backgroundColor: SOURCE_COLORS[s.source] ?? "#9ca3af",
                minWidth: s.percentage > 0 ? "4px" : "0",
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {stats.sourceDistribution.map((s) => (
            <div key={s.source} className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[s.source] ?? "#9ca3af" }} />
              <span className="text-zinc-600 dark:text-zinc-400">{s.source}</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.count}</span>
              <span className="text-zinc-400">({s.percentage}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Catalog Match Rate by Template */}
      {stats.matchRateByTemplate.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Catalog Match Rate</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-3 pr-4">Template Name</th>
                <th className="pb-3 pr-4 text-right">Match Rate</th>
                <th className="pb-3 text-right">Total Items</th>
              </tr>
            </thead>
            <tbody>
              {stats.matchRateByTemplate
                .sort((a, b) => b.matchRate - a.matchRate)
                .map((t) => (
                  <tr key={t.templateName} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{t.templateName}</td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div className="h-full rounded-full" style={{ width: `${t.matchRate}%`, backgroundColor: accentColor }} />
                        </div>
                        <span className="w-12 text-right font-medium text-zinc-900 dark:text-zinc-100">{t.matchRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-zinc-600 dark:text-zinc-400">{t.totalItems}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 4: Most Common AI-Priced Items */}
      {stats.commonAiPriced.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Frequently AI-Priced Items (not in catalog)</h2>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Consider adding these to your catalog via the Suggestions page.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-3 pr-4">Item Name</th>
                <th className="pb-3 pr-4">Trade Group</th>
                <th className="pb-3 pr-4 text-right">Times Used</th>
                <th className="pb-3 text-right">Avg Price</th>
              </tr>
            </thead>
            <tbody>
              {stats.commonAiPriced.map((item) => (
                <tr key={`${item.name}-${item.tradeGroup}`} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{item.name}</td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">{item.tradeGroup}</td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">{item.count}</td>
                  <td className="py-3 text-right text-zinc-900 dark:text-zinc-100">{formatDollarPrecise(item.avgPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 5: Most Corrected Items */}
      {stats.mostCorrected.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Most Corrected Items</h2>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Items estimators frequently adjust — the AI will learn from these over time.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-3 pr-4">Item Name</th>
                <th className="pb-3 pr-4">Field</th>
                <th className="pb-3 pr-4 text-right">Avg Original</th>
                <th className="pb-3 pr-4 text-right">Avg Corrected</th>
                <th className="pb-3 text-right">Times Corrected</th>
              </tr>
            </thead>
            <tbody>
              {stats.mostCorrected.map((item, idx) => (
                <tr key={`${item.name}-${item.field}-${idx}`} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{item.name}</td>
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">{item.field}</td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">{item.field === "quantity" ? item.avgOriginal : formatDollarPrecise(item.avgOriginal)}</td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">{item.field === "quantity" ? item.avgCorrected : formatDollarPrecise(item.avgCorrected)}</td>
                  <td className="py-3 text-right text-zinc-900 dark:text-zinc-100">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 6: Recent Estimates */}
      {stats.recentEstimates.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Estimates</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Room</th>
                <th className="pb-3 pr-4 text-right">Total</th>
                <th className="pb-3 pr-4 text-right">Items</th>
                <th className="pb-3 text-right">Corrections</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentEstimates.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{e.roomName}</td>
                  <td className="py-3 pr-4 text-right text-zinc-900 dark:text-zinc-100">{formatDollar(e.totalPrice)}</td>
                  <td className="py-3 pr-4 text-right text-zinc-600 dark:text-zinc-400">{e.lineItemCount}</td>
                  <td className="py-3 text-right text-zinc-600 dark:text-zinc-400">{e.correctionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

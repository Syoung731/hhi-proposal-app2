"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectRetainer, type UpdateProjectRetainerPatch } from "./actions";
import { computeRetainer, type RetainerSettings } from "@/app/lib/retainer";
import { InvestmentGroupTree, type SectionRow } from "./investment-group-tree";

type Section = {
  id: string;
  name: string;
  sortOrder: number;
  bucket: string;
  sectionTypeName: string;
  category: string | null;
  totalLow: number | null;
  totalTarget: number | null;
  totalHigh: number | null;
  displayGroupId: string | null;
  displayGroupOrder: number;
  isProjectOverhead: boolean;
};

type Item = {
  id: string;
  bucket: string;
  label: string;
  rangeLow: number | null;
  rangeTarget: number | null;
  rangeHigh: number | null;
  notes: string | null;
  overrideLow: number | null;
  overrideTarget: number | null;
  overrideHigh: number | null;
  overrideNotes: string | null;
  isOverride: boolean;
  includeInTotals: boolean;
  sortOrder: number;
};

type Retainer = {
  enabled: boolean;
  percent: number;
  roundTo: number;
  override: number | null;
};

type Props = {
  projectId: string;
  sections: Section[];
  items: Item[];
  retainer: Retainer;
  /** Project.displayGroupOrder — saved slug sequence for the tree. Empty = use default. */
  groupOrder?: string[];
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function InvestmentTab({ projectId, sections, retainer, groupOrder = [] }: Props) {
  const sectionsSorted = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  // Build the tree's SectionRow[] — same data, renamed fields.
  const treeSections: SectionRow[] = useMemo(
    () =>
      sectionsSorted.map((s) => ({
        id: s.id,
        name: s.name,
        bucket: s.bucket,
        sectionTypeName: s.sectionTypeName,
        totalLow: s.totalLow,
        totalTarget: s.totalTarget,
        totalHigh: s.totalHigh,
        displayGroupId: s.displayGroupId,
        displayGroupOrder: s.displayGroupOrder,
        isProjectOverhead: s.isProjectOverhead,
      })),
    [sectionsSorted]
  );

  const subtotalLow = sectionsSorted.reduce((sum, s) => sum + (s.totalLow ?? 0), 0);
  const subtotalTarget = sectionsSorted.reduce((sum, s) => sum + (s.totalTarget ?? 0), 0);
  const subtotalHigh = sectionsSorted.reduce((sum, s) => sum + (s.totalHigh ?? 0), 0);

  const settings: RetainerSettings = {
    enabled: retainer.enabled,
    percent: retainer.percent,
    roundTo: retainer.roundTo,
    override: retainer.override,
  };
  const retainerAmount = computeRetainer(subtotalHigh, settings);

  const grandLow = subtotalLow + retainerAmount;
  const grandTarget = subtotalTarget + retainerAmount;
  const grandHigh = subtotalHigh + retainerAmount;

  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="space-y-6">
      <TotalsCard
        subtotalLow={subtotalLow}
        subtotalTarget={subtotalTarget}
        subtotalHigh={subtotalHigh}
        retainerAmount={retainerAmount}
        retainerEnabled={retainer.enabled}
        grandLow={grandLow}
        grandTarget={grandTarget}
        grandHigh={grandHigh}
      />

      <RetainerPanel
        projectId={projectId}
        retainer={retainer}
        subtotalHigh={subtotalHigh}
        computedAmount={retainerAmount}
      />

      <section>
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
          aria-expanded={showBreakdown}
        >
          <span>Per-section breakdown ({sectionsSorted.length})</span>
          <span className="text-zinc-400">{showBreakdown ? "▾" : "▸"}</span>
        </button>
        {showBreakdown && (
          <div className="mt-3">
            <InvestmentGroupTree
              projectId={projectId}
              sections={treeSections}
              groupOrder={groupOrder}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ── Totals card ────────────────────────────────────────────────────────────

function TotalsCard({
  subtotalLow,
  subtotalTarget,
  subtotalHigh,
  retainerAmount,
  retainerEnabled,
  grandLow,
  grandTarget,
  grandHigh,
}: {
  subtotalLow: number;
  subtotalTarget: number;
  subtotalHigh: number;
  retainerAmount: number;
  retainerEnabled: boolean;
  grandLow: number;
  grandTarget: number;
  grandHigh: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 bg-gradient-to-b from-zinc-50 to-white px-5 py-3 dark:border-zinc-800 dark:from-zinc-800/40 dark:to-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Project Investment
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_auto_auto]">
        <TotalsRow
          label="Subtotal (sections)"
          low={subtotalLow}
          target={subtotalTarget}
          high={subtotalHigh}
        />
        {retainerEnabled && (
          <TotalsRow
            label="Design / Feasibility Retainer"
            low={retainerAmount}
            target={retainerAmount}
            high={retainerAmount}
            subdued
          />
        )}
        <TotalsRow
          label="Grand Total"
          low={grandLow}
          target={grandTarget}
          high={grandHigh}
          emphasis
        />
      </div>
    </section>
  );
}

function TotalsRow({
  label,
  low,
  target,
  high,
  emphasis,
  subdued,
}: {
  label: string;
  low: number;
  target: number;
  high: number;
  emphasis?: boolean;
  subdued?: boolean;
}) {
  const labelClass = emphasis
    ? "text-sm font-semibold text-zinc-900 dark:text-zinc-100"
    : subdued
      ? "text-sm text-zinc-600 dark:text-zinc-400"
      : "text-sm text-zinc-700 dark:text-zinc-300";
  const valueClass = emphasis
    ? "text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
    : subdued
      ? "text-sm text-zinc-700 tabular-nums dark:text-zinc-300"
      : "text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-100";
  const rowBg = emphasis
    ? "bg-orange-50/60 dark:bg-orange-500/5"
    : "";
  const borderTop = emphasis ? "border-t-2 border-orange-200 dark:border-orange-500/30" : "border-t border-zinc-100 dark:border-zinc-800";

  return (
    <div className={`col-span-full grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-5 py-3 ${borderTop} ${rowBg}`}>
      <div className={labelClass}>{label}</div>
      <Cell label="Low" value={low} valueClass={valueClass} />
      <Cell label="Target" value={target} valueClass={valueClass} />
      <Cell label="High" value={high} valueClass={valueClass} />
    </div>
  );
}

function Cell({ label, value, valueClass }: { label: string; value: number; valueClass: string }) {
  return (
    <div className="flex min-w-[110px] flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <span className={valueClass}>{formatMoney(value)}</span>
    </div>
  );
}

// ── Retainer editor ────────────────────────────────────────────────────────

function RetainerPanel({
  projectId,
  retainer,
  subtotalHigh,
  computedAmount,
}: {
  projectId: string;
  retainer: Retainer;
  subtotalHigh: number;
  computedAmount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(retainer.enabled);
  const [percentPct, setPercentPct] = useState(
    (retainer.percent * 100).toFixed(2).replace(/\.?0+$/, "")
  );
  const [roundTo, setRoundTo] = useState(String(retainer.roundTo));
  const [overrideStr, setOverrideStr] = useState(
    retainer.override != null ? String(retainer.override) : ""
  );

  useEffect(() => {
    setEnabled(retainer.enabled);
    setPercentPct((retainer.percent * 100).toFixed(2).replace(/\.?0+$/, ""));
    setRoundTo(String(retainer.roundTo));
    setOverrideStr(retainer.override != null ? String(retainer.override) : "");
  }, [retainer.enabled, retainer.percent, retainer.roundTo, retainer.override]);

  async function patch(p: UpdateProjectRetainerPatch) {
    setSaving(true);
    try {
      await updateProjectRetainer(projectId, p);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const pctNum = parseFloat(percentPct);
  const rawComputed = Number.isFinite(pctNum) ? subtotalHigh * (pctNum / 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Design / Feasibility Retainer
          </h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                void patch({ retainerEnabled: e.target.checked });
              }}
              className="rounded border-zinc-300 dark:border-zinc-600"
            />
            <span>Include on this project</span>
          </label>
        </div>
        {saving && <span className="text-xs text-zinc-400">Saving…</span>}
      </div>

      <div className={`px-5 py-4 ${enabled ? "" : "opacity-50"}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_auto_auto_1fr]">
          {/* Percent */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Percent of subtotal high
            </label>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                min={0}
                max={100}
                value={percentPct}
                disabled={!enabled}
                onChange={(e) => setPercentPct(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(percentPct);
                  if (!Number.isFinite(v) || v < 0 || v > 100) return;
                  void patch({ retainerPercent: v / 100 });
                }}
                className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          </div>

          {/* Round to */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Round to nearest
            </label>
            <select
              value={roundTo}
              disabled={!enabled}
              onChange={(e) => {
                setRoundTo(e.target.value);
                void patch({ retainerRoundTo: parseInt(e.target.value, 10) });
              }}
              className="mt-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="1">$1</option>
              <option value="100">$100</option>
              <option value="500">$500</option>
              <option value="1000">$1,000</option>
              <option value="5000">$5,000</option>
            </select>
          </div>

          {/* Override */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Override amount
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-sm text-zinc-500">$</span>
              <input
                type="number"
                min={0}
                step={100}
                placeholder="—"
                value={overrideStr}
                disabled={!enabled}
                onChange={(e) => setOverrideStr(e.target.value)}
                onBlur={() => {
                  const trimmed = overrideStr.trim();
                  if (trimmed === "") {
                    void patch({ retainerOverride: null });
                    return;
                  }
                  const n = parseInt(trimmed, 10);
                  void patch({ retainerOverride: Number.isNaN(n) ? null : n });
                }}
                className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {overrideStr && enabled && (
                <button
                  type="button"
                  onClick={() => {
                    setOverrideStr("");
                    void patch({ retainerOverride: null });
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                  title="Clear override"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Computed result */}
          <div className="flex flex-col items-end justify-center rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Retainer amount
            </span>
            <span className="text-xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {formatMoney(computedAmount)}
            </span>
            <span className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {retainer.override != null
                ? "Manual override"
                : `${percentPct}% of ${formatMoney(subtotalHigh)} = ${formatMoney(rawComputed)}`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

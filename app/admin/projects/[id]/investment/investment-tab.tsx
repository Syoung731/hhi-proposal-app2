"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateInvestmentLineItemAction,
  deleteInvestmentLineItemAction,
  updateInvestmentLineItem,
  type UpdateInvestmentLineItemPatch,
} from "./actions";

const BUCKET_LABELS: Record<string, string> = {
  BASE: "Base",
  ALTERNATE: "Alternates",
  ALLOWANCE: "Allowances",
};

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

type Props = {
  projectId: string;
  sections: Section[];
  items: Item[];
};

function roundDollars(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value);
}

function effectiveLow(item: Item): number | null {
  if (item.isOverride) return item.overrideLow ?? null;
  return item.rangeLow;
}

function effectiveTarget(item: Item): number | null {
  if (item.isOverride) return item.overrideTarget ?? null;
  return item.rangeTarget;
}

function effectiveHigh(item: Item): number | null {
  if (item.isOverride) return item.overrideHigh ?? null;
  return item.rangeHigh;
}

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

function basePricingLabel(section: Section): string {
  const hasAny =
    section.totalLow != null ||
    section.totalTarget != null ||
    section.totalHigh != null;
  if (!hasAny) return "TBD";
  const parts: string[] = [];
  if (section.totalLow != null) parts.push(formatMoney(Math.round(section.totalLow)));
  if (section.totalTarget != null) parts.push(formatMoney(Math.round(section.totalTarget)));
  if (section.totalHigh != null) parts.push(formatMoney(Math.round(section.totalHigh)));
  return parts.join(" / ");
}

export function InvestmentTab({ projectId, sections, items: initialItems }: Props) {
  const router = useRouter();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const itemsSorted = [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const sectionsByBucket = (bucket: string) =>
    sections.filter((s) => s.bucket === bucket).sort((a, b) => a.sortOrder - b.sortOrder);

  const itemsInTotals = initialItems.filter((i) => i.includeInTotals);
  let totalLow = 0;
  let totalTarget = 0;
  let totalHigh = 0;
  for (const item of itemsInTotals) {
    totalLow += effectiveLow(item) ?? 0;
    totalTarget += effectiveTarget(item) ?? 0;
    totalHigh += effectiveHigh(item) ?? 0;
  }

  async function handleDelete(itemId: string) {
    if (!confirm("Remove this line item?")) return;
    await deleteInvestmentLineItemAction(projectId, itemId);
    router.refresh();
  }

  async function handlePatch(itemId: string, patch: UpdateInvestmentLineItemPatch) {
    await updateInvestmentLineItem(projectId, itemId, patch);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Sections by bucket (read-only totals from each section) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Sections (totals per section)
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Section
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Bucket
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Category
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Low / Target / High
                </th>
              </tr>
            </thead>
            <tbody>
              {(["BASE", "ALTERNATE", "ALLOWANCE"] as const).map((bucket) =>
                sectionsByBucket(bucket).map((section) => (
                  <tr
                    key={section.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                      {section.name}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {BUCKET_LABELS[bucket] ?? bucket}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {section.sectionTypeName}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {basePricingLabel(section)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Investment rollups per bucket (Base, Alternates, Allowances) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Investment rollups by bucket
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Bucket
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Rollup (Low / Target / High)
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Effective (proposal)
                </th>
                <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Override / In totals
                </th>
              </tr>
            </thead>
            <tbody>
              {itemsSorted.map((item) => {
                const effLow = effectiveLow(item);
                const effTarget = effectiveTarget(item);
                const effHigh = effectiveHigh(item);
                const effectiveLabel =
                  effLow != null || effTarget != null || effHigh != null
                    ? [effLow, effTarget, effHigh].map(formatMoney).join(" / ")
                    : "TBD";
                const rollupLabel =
                  item.rangeLow != null || item.rangeTarget != null || item.rangeHigh != null
                    ? [item.rangeLow, item.rangeTarget, item.rangeHigh].map(formatMoney).join(" / ")
                    : "—";
                return (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {rollupLabel}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {effectiveLabel}
                    </td>
                    <td className="px-4 py-2">
                      <SectionRowOverrides
                        item={item}
                        onPatch={(p) => handlePatch(item.id, p)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Totals (items with “Include in totals”)
        </h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            <span className="text-zinc-500 dark:text-zinc-400">Low: </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatMoney(totalLow)}
            </span>
          </span>
          <span>
            <span className="text-zinc-500 dark:text-zinc-400">Target: </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatMoney(totalTarget)}
            </span>
          </span>
          <span>
            <span className="text-zinc-500 dark:text-zinc-400">High: </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatMoney(totalHigh)}
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}

function ManualItemTargetInput({
  value,
  onPatch,
}: {
  value: number | null;
  onPatch: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);
  const handleBlur = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      onPatch(null);
      return;
    }
    const n = parseInt(trimmed, 10);
    onPatch(Number.isNaN(n) ? null : n);
  };
  return (
    <input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      placeholder="—"
      min={0}
      className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}

function SectionRowOverrides({
  item,
  onPatch,
}: {
  item: Item;
  onPatch: (p: UpdateInvestmentLineItemPatch) => void;
}) {
  const [overrideLow, setOverrideLow] = useState(
    item.overrideLow != null ? String(item.overrideLow) : ""
  );
  const [overrideTarget, setOverrideTarget] = useState(
    item.overrideTarget != null ? String(item.overrideTarget) : ""
  );
  const [overrideHigh, setOverrideHigh] = useState(
    item.overrideHigh != null ? String(item.overrideHigh) : ""
  );
  const [overrideNotes, setOverrideNotes] = useState(item.overrideNotes ?? "");

  const applyOverrideValues = () => {
    const low = overrideLow.trim() ? parseInt(overrideLow, 10) : null;
    const target = overrideTarget.trim() ? parseInt(overrideTarget, 10) : null;
    const high = overrideHigh.trim() ? parseInt(overrideHigh, 10) : null;
    const patch: UpdateInvestmentLineItemPatch = {
      overrideLow: low != null && !Number.isNaN(low) ? low : null,
      overrideTarget: target != null && !Number.isNaN(target) ? target : null,
      overrideHigh: high != null && !Number.isNaN(high) ? high : null,
      overrideNotes: overrideNotes.trim() || null,
    };
    onPatch(patch);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={item.isOverride}
          onChange={(e) => {
            const on = e.target.checked;
            onPatch({ isOverride: on });
            if (!on) {
              setOverrideLow("");
              setOverrideTarget("");
              setOverrideHigh("");
              setOverrideNotes("");
            }
          }}
          className="rounded border-zinc-300 dark:border-zinc-600"
        />
        <span className="text-xs">Override for proposal</span>
      </label>
      {item.isOverride && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="number"
            value={overrideLow}
            onChange={(e) => setOverrideLow(e.target.value)}
            onBlur={applyOverrideValues}
            placeholder="Low $"
            min={0}
            className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="number"
            value={overrideTarget}
            onChange={(e) => setOverrideTarget(e.target.value)}
            onBlur={applyOverrideValues}
            placeholder="Target $"
            min={0}
            className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="number"
            value={overrideHigh}
            onChange={(e) => setOverrideHigh(e.target.value)}
            onBlur={applyOverrideValues}
            placeholder="High $"
            min={0}
            className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="text"
            value={overrideNotes}
            onChange={(e) => setOverrideNotes(e.target.value)}
            onBlur={() => onPatch({ overrideNotes: overrideNotes.trim() || null })}
            placeholder="Override notes"
            className="min-w-[120px] rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      )}
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={item.includeInTotals}
          onChange={(e) => onPatch({ includeInTotals: e.target.checked })}
          className="rounded border-zinc-300 dark:border-zinc-600"
        />
        <span className="text-xs">Include in totals</span>
      </label>
    </div>
  );
}

function ItemForm({
  projectId,
  item,
  onDone,
  onCancel,
  submitAction,
}: {
  projectId: string;
  item?: Item;
  onDone: () => void;
  onCancel: () => void;
  submitAction: typeof updateInvestmentLineItemAction;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [rangeLow, setRangeLow] = useState(
    item?.rangeLow != null ? String(item.rangeLow) : ""
  );
  const [rangeTarget, setRangeTarget] = useState(
    item?.rangeTarget != null ? String(item.rangeTarget) : ""
  );
  const [rangeHigh, setRangeHigh] = useState(
    item?.rangeHigh != null ? String(item.rangeHigh) : ""
  );
  const [notes, setNotes] = useState(item?.notes ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("label", label);
    formData.set("rangeLow", rangeLow);
    formData.set("rangeTarget", rangeTarget);
    formData.set("rangeHigh", rangeHigh);
    formData.set("notes", notes);
    if (item) {
      await (submitAction as typeof updateInvestmentLineItemAction)(
        projectId,
        item.id,
        formData
      );
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 py-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        required
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="number"
        value={rangeLow}
        onChange={(e) => setRangeLow(e.target.value)}
        placeholder="Low $"
        min={0}
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="number"
        value={rangeTarget}
        onChange={(e) => setRangeTarget(e.target.value)}
        placeholder="Target $"
        min={0}
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="number"
        value={rangeHigh}
        onChange={(e) => setRangeHigh(e.target.value)}
        placeholder="High $"
        min={0}
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="w-32 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <button
        type="submit"
        className="rounded bg-zinc-900 px-2 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {item ? "Save" : "Add"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600"
      >
        Cancel
      </button>
    </form>
  );
}

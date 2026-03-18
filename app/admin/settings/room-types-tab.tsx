"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateSectionTypePricingAction,
  updateSectionTypePricingBasisAction,
  saveRoomTypePctAction,
  recomputeSectionTypeLowHighAction,
  deleteSectionType,
} from "./actions";
import type { SectionTypeForUI } from "./settings-tabs";

const PRICING_BASIS_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "PER_SF", label: "$/SF" },
  { value: "PER_EACH", label: "$/EA" },
  { value: "PER_JOB", label: "$/Job" },
] as const;

const DEFAULT_LOW_PCT = -10;
const DEFAULT_HIGH_PCT = 10;

const NULL_PLACEHOLDER = "—";

/** Consistent 2-decimal money formatting; does not floor/ceil (avoids false Override from rounding). */
function formatMoney(value: number | null): string {
  if (value == null) return "";
  return (Math.round(value * 100) / 100).toFixed(2);
}
function formatTargetForInput(value: number | null): string {
  return formatMoney(value);
}
function formatLowForInput(value: number | null): string {
  return formatMoney(value);
}
function formatHighForInput(value: number | null): string {
  return formatMoney(value);
}

type DraftMap = Record<string, { low?: string; target?: string; high?: string }>;

type Props = {
  sectionTypes: SectionTypeForUI[];
  roomTypeLowPct: number | null;
  roomTypeHighPct: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  INTERIOR: "Interior",
  EXTERIOR: "Exterior",
  SYSTEMS: "Systems",
  WHOLE_HOME: "Whole home",
  ADDITION: "Addition",
  FAST: "Fast",
};

function sortByCategoryThenName(list: SectionTypeForUI[]): SectionTypeForUI[] {
  return [...list].sort((a, b) => {
    const catA = CATEGORY_LABELS[a.category] ?? a.category;
    const catB = CATEGORY_LABELS[b.category] ?? b.category;
    if (catA !== catB) return catA.localeCompare(catB);
    return a.name.localeCompare(b.name);
  });
}

export function RoomTypesTab({
  sectionTypes: initialSectionTypes,
  roomTypeLowPct: initialLowPct,
  roomTypeHighPct: initialHighPct,
}: Props) {
  const router = useRouter();
  const lowPct = initialLowPct ?? DEFAULT_LOW_PCT;
  const highPct = initialHighPct ?? DEFAULT_HIGH_PCT;

  const [list, setList] = useState<SectionTypeForUI[]>(() =>
    sortByCategoryThenName(initialSectionTypes)
  );
  const [draft, setDraft] = useState<DraftMap>({});
  const [cellStatus, setCellStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [cellError, setCellError] = useState<Record<string, string>>({});
  const [pctLowInput, setPctLowInput] = useState("");
  const [pctHighInput, setPctHighInput] = useState("");
  const [pctStatus, setPctStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pctErrorMessage, setPctErrorMessage] = useState<string | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteReassignId, setDeleteReassignId] = useState<string | "">("");
  const [deleteSaving, setDeleteSaving] = useState(false);
  /** Per-row override flag: only toggled by checkbox or set when user manually edits Low/High. Not set when editing Target. */
  const [explicitLowOverride, setExplicitLowOverride] = useState<Record<string, boolean>>({});
  const [explicitHighOverride, setExplicitHighOverride] = useState<Record<string, boolean>>({});
  const targetInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lowInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const highInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const SUPPORTS_OVERRIDE_BASES = ["PER_SF", "PER_JOB", "PER_EACH"] as const;
  function supportsOverride(row: SectionTypeForUI): boolean {
    return SUPPORTS_OVERRIDE_BASES.includes(row.pricingBasis as (typeof SUPPORTS_OVERRIDE_BASES)[number]);
  }

  /** Computed low: round DOWN to whole dollars. Used for all priced bases when Override OFF. */
  function computedLow(row: SectionTypeForUI): number | null {
    if (row.priceTarget == null) return null;
    const v = row.priceTarget * (1 + lowPct / 100);
    return Math.floor(v);
  }
  /** Computed high: round UP to whole dollars. Used for all priced bases when Override OFF. */
  function computedHigh(row: SectionTypeForUI): number | null {
    if (row.priceTarget == null) return null;
    const v = row.priceTarget * (1 + highPct / 100);
    return Math.ceil(v);
  }
  function displayLow(row: SectionTypeForUI): number | null {
    if (row.priceLow != null) return row.priceLow;
    return computedLow(row);
  }
  function displayHigh(row: SectionTypeForUI): number | null {
    if (row.priceHigh != null) return row.priceHigh;
    return computedHigh(row);
  }

  const FLOAT_TOLERANCE = 0.001;
  /** Override for PER_SF, PER_JOB, PER_EACH: explicit session flag OR stored value differs from computed beyond tolerance. If target null, default false. */
  function effectiveLowOverride(row: SectionTypeForUI): boolean {
    if (!supportsOverride(row)) return false;
    if (explicitLowOverride[row.id] !== undefined) return explicitLowOverride[row.id];
    if (row.priceTarget == null) return false;
    const stored = row.priceLow ?? 0;
    const computed = computedLow(row) ?? 0;
    return row.priceLow != null && Math.abs(stored - computed) > FLOAT_TOLERANCE;
  }
  function effectiveHighOverride(row: SectionTypeForUI): boolean {
    if (!supportsOverride(row)) return false;
    if (explicitHighOverride[row.id] !== undefined) return explicitHighOverride[row.id];
    if (row.priceTarget == null) return false;
    const stored = row.priceHigh ?? 0;
    const computed = computedHigh(row) ?? 0;
    return row.priceHigh != null && Math.abs(stored - computed) > FLOAT_TOLERANCE;
  }

  function priceColumnLabel(basis: string): string {
    switch (basis) {
      case "PER_SF": return "$/SF";
      case "PER_EACH": return "$/EA";
      case "PER_JOB": return "$/Job";
      default: return "Price";
    }
  }

  useEffect(() => {
    setList(sortByCategoryThenName(initialSectionTypes));
  }, [initialSectionTypes]);

  useEffect(() => {
    setPctLowInput(initialLowPct != null ? String(initialLowPct) : String(DEFAULT_LOW_PCT));
    setPctHighInput(initialHighPct != null ? String(initialHighPct) : String(DEFAULT_HIGH_PCT));
  }, [initialLowPct, initialHighPct]);

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteModalId(id);
    setDeleteReassignId("");
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteModalId) return;
    setDeleteSaving(true);
    const result = await deleteSectionType(deleteModalId, deleteReassignId || null);
    setDeleteSaving(false);
    if (result.error) {
      setPctStatus("error");
      setPctErrorMessage(result.error);
      return;
    }
    setDeleteModalId(null);
    setDeleteReassignId("");
    setList((prev) => prev.filter((r) => r.id !== deleteModalId));
  }, [deleteModalId, deleteReassignId]);

  const saveTargetCell = useCallback(
    async (sectionId: string, rawValue: string): Promise<{ error?: string }> => {
      const row = list.find((r) => r.id === sectionId);
      if (!row) return {};
      if (row.pricingBasis === "NONE") return {};
      const trimmed = rawValue.trim();
      if (trimmed === "") {
        if (row.priceTarget == null) {
          setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], target: "" } }));
          return {};
        }
        setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
        setCellError((e) => ({ ...e, [sectionId]: "" }));
        const result = await updateSectionTypePricingAction(sectionId, { priceTarget: null });
        if (result.error) {
          setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
          setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
          return result;
        }
        setList((prev) =>
          prev.map((r) =>
            r.id === sectionId
              ? { ...r, priceTarget: null, priceLow: null, priceHigh: null }
              : r
          )
        );
        setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], target: "" } }));
        setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
        setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
        router.refresh();
        return {};
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return { error: "Invalid number" };
      if (parsed <= 0) return { error: "Price must be greater than 0" };
      const savedTarget = Math.round(parsed * 100) / 100;

      setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
      setCellError((e) => ({ ...e, [sectionId]: "" }));
      const result = await updateSectionTypePricingAction(sectionId, { priceTarget: savedTarget });
      if (result.error) {
        setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
        setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
        return result;
      }
      // Do not call recompute or write computed low/high to state; display remains computed via displayLow/displayHigh when priceLow/priceHigh are null.
      setList((prev) =>
        prev.map((r) =>
          r.id === sectionId ? { ...r, priceTarget: savedTarget } : r
        )
      );
      setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], target: formatTargetForInput(savedTarget) } }));
      setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
      router.refresh();
      return {};
    },
    [router, list]
  );

  const saveLowCell = useCallback(
    async (sectionId: string, rawValue: string): Promise<{ error?: string }> => {
      const row = list.find((r) => r.id === sectionId);
      if (!row || row.pricingBasis === "NONE") return {};
      const trimmed = rawValue.trim();
      if (trimmed === "") {
        if (row.priceLow == null) {
          setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], low: "" } }));
          return {};
        }
        setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
        setCellError((e) => ({ ...e, [sectionId]: "" }));
        const result = await updateSectionTypePricingAction(sectionId, { priceLow: null });
        if (result.error) {
          setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
          setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
          return result;
        }
        setExplicitLowOverride((prev) => ({ ...prev, [sectionId]: false }));
        setList((prev) =>
          prev.map((r) => (r.id === sectionId ? { ...r, priceLow: null } : r))
        );
        setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], low: "" } }));
        setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
        setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
        router.refresh();
        return {};
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed) || parsed < 0) return { error: "Invalid number" };
      if (parsed <= 0) return { error: "Price must be greater than 0" };
      const savedLow = Math.floor(parsed);
      if (row.priceHigh != null && savedLow > row.priceHigh) {
        return { error: "Low must be less than or equal to High" };
      }
      setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
      setCellError((e) => ({ ...e, [sectionId]: "" }));
      const result = await updateSectionTypePricingAction(sectionId, { priceLow: savedLow });
      if (result.error) {
        setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
        setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
        return result;
      }
      setExplicitLowOverride((prev) => ({ ...prev, [sectionId]: true }));
      setList((prev) =>
        prev.map((r) => (r.id === sectionId ? { ...r, priceLow: savedLow } : r))
      );
      setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], low: formatLowForInput(savedLow) } }));
      setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
      router.refresh();
      return {};
    },
    [router, list]
  );

  const saveHighCell = useCallback(
    async (sectionId: string, rawValue: string): Promise<{ error?: string }> => {
      const row = list.find((r) => r.id === sectionId);
      if (!row || row.pricingBasis === "NONE") return {};
      const trimmed = rawValue.trim();
      if (trimmed === "") {
        if (row.priceHigh == null) {
          setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], high: "" } }));
          return {};
        }
        setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
        setCellError((e) => ({ ...e, [sectionId]: "" }));
        const result = await updateSectionTypePricingAction(sectionId, { priceHigh: null });
        if (result.error) {
          setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
          setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
          return result;
        }
        setExplicitHighOverride((prev) => ({ ...prev, [sectionId]: false }));
        setList((prev) =>
          prev.map((r) => (r.id === sectionId ? { ...r, priceHigh: null } : r))
        );
        setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], high: "" } }));
        setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
        setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
        router.refresh();
        return {};
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed) || parsed < 0) return { error: "Invalid number" };
      if (parsed <= 0) return { error: "Price must be greater than 0" };
      const savedHigh = Math.ceil(parsed);
      if (row.priceLow != null && row.priceLow > savedHigh) {
        return { error: "Low must be less than or equal to High" };
      }
      setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
      setCellError((e) => ({ ...e, [sectionId]: "" }));
      const result = await updateSectionTypePricingAction(sectionId, { priceHigh: savedHigh });
      if (result.error) {
        setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
        setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Invalid number" }));
        return result;
      }
      setExplicitHighOverride((prev) => ({ ...prev, [sectionId]: true }));
      setList((prev) =>
        prev.map((r) => (r.id === sectionId ? { ...r, priceHigh: savedHigh } : r))
      );
      setDraft((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], high: formatHighForInput(savedHigh) } }));
      setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
      router.refresh();
      return {};
    },
    [router, list]
  );

  const handleTargetBlur = useCallback(
    async (row: SectionTypeForUI) => {
      if (row.pricingBasis === "NONE") return;
      const value = draft[row.id]?.target ?? formatTargetForInput(row.priceTarget);
      await saveTargetCell(row.id, value);
    },
    [draft, saveTargetCell]
  );

  const handleLowBlur = useCallback(
    async (row: SectionTypeForUI) => {
      if (row.pricingBasis === "NONE") return;
      if (supportsOverride(row) && !effectiveLowOverride(row)) return;
      const effectiveValue =
        draft[row.id]?.low ?? formatLowForInput(row.priceLow ?? computedLow(row));
      await saveLowCell(row.id, effectiveValue);
    },
    [draft, saveLowCell]
  );

  const handleHighBlur = useCallback(
    async (row: SectionTypeForUI) => {
      if (row.pricingBasis === "NONE") return;
      if (supportsOverride(row) && !effectiveHighOverride(row)) return;
      const effectiveValue =
        draft[row.id]?.high ?? formatHighForInput(row.priceHigh ?? computedHigh(row));
      await saveHighCell(row.id, effectiveValue);
    },
    [draft, saveHighCell]
  );

  const handleLowOverrideToggle = useCallback(
    async (row: SectionTypeForUI, enabled: boolean) => {
      if (!supportsOverride(row)) return;
      if (enabled) {
        setExplicitLowOverride((prev) => ({ ...prev, [row.id]: true }));
        const base = row.priceLow ?? computedLow(row);
        setDraft((prev) => ({
          ...prev,
          [row.id]: { ...prev[row.id], low: base != null ? formatLowForInput(base) : "" },
        }));
        setTimeout(() => lowInputRefs.current[row.id]?.focus(), 0);
        return;
      }
      setExplicitLowOverride((prev) => ({ ...prev, [row.id]: false }));
      setCellStatus((s) => ({ ...s, [row.id]: "saving" }));
      setCellError((e) => ({ ...e, [row.id]: "" }));
      const result = await updateSectionTypePricingAction(row.id, { priceLow: null });
      if (result.error) {
        setCellStatus((s) => ({ ...s, [row.id]: "error" }));
        setCellError((e) => ({ ...e, [row.id]: result.error ?? "Invalid number" }));
        setExplicitLowOverride((prev) => ({ ...prev, [row.id]: true }));
        return;
      }
      setList((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, priceLow: null } : r))
      );
      setDraft((prev) => ({ ...prev, [row.id]: { ...prev[row.id], low: "" } }));
      setCellStatus((s) => ({ ...s, [row.id]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [row.id]: "idle" })), 2000);
      router.refresh();
    },
    [router]
  );

  const handleHighOverrideToggle = useCallback(
    async (row: SectionTypeForUI, enabled: boolean) => {
      if (!supportsOverride(row)) return;
      if (enabled) {
        setExplicitHighOverride((prev) => ({ ...prev, [row.id]: true }));
        const base = row.priceHigh ?? computedHigh(row);
        setDraft((prev) => ({
          ...prev,
          [row.id]: { ...prev[row.id], high: base != null ? formatHighForInput(base) : "" },
        }));
        setTimeout(() => highInputRefs.current[row.id]?.focus(), 0);
        return;
      }
      setExplicitHighOverride((prev) => ({ ...prev, [row.id]: false }));
      setCellStatus((s) => ({ ...s, [row.id]: "saving" }));
      setCellError((e) => ({ ...e, [row.id]: "" }));
      const result = await updateSectionTypePricingAction(row.id, { priceHigh: null });
      if (result.error) {
        setCellStatus((s) => ({ ...s, [row.id]: "error" }));
        setCellError((e) => ({ ...e, [row.id]: result.error ?? "Invalid number" }));
        setExplicitHighOverride((prev) => ({ ...prev, [row.id]: true }));
        return;
      }
      setList((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, priceHigh: null } : r))
      );
      setDraft((prev) => ({ ...prev, [row.id]: { ...prev[row.id], high: "" } }));
      setCellStatus((s) => ({ ...s, [row.id]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [row.id]: "idle" })), 2000);
      router.refresh();
    },
    [router]
  );

  const handlePricingBasisChange = useCallback(
    async (sectionId: string, newBasis: string) => {
      setCellStatus((s) => ({ ...s, [sectionId]: "saving" }));
      setCellError((e) => ({ ...e, [sectionId]: "" }));
      const result = await updateSectionTypePricingBasisAction(sectionId, newBasis);
      if (result.error) {
        setCellStatus((s) => ({ ...s, [sectionId]: "error" }));
        setCellError((e) => ({ ...e, [sectionId]: result.error ?? "Failed" }));
        return;
      }
      setList((prev) =>
        prev.map((r) => (r.id === sectionId ? { ...r, pricingBasis: newBasis } : r))
      );
      setCellStatus((s) => ({ ...s, [sectionId]: "saved" }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [sectionId]: "idle" })), 2000);
      router.refresh();
    },
    [router]
  );

  async function handleSavePct() {
    const low = pctLowInput.trim() === "" ? null : Number(pctLowInput);
    const high = pctHighInput.trim() === "" ? null : Number(pctHighInput);
    if (low !== null && Number.isNaN(low)) {
      setPctErrorMessage("Low % must be a number");
      setPctStatus("error");
      return;
    }
    if (high !== null && Number.isNaN(high)) {
      setPctErrorMessage("High % must be a number");
      setPctStatus("error");
      return;
    }
    setPctStatus("saving");
    setPctErrorMessage(null);
    const result = await saveRoomTypePctAction(low, high);
    if (result.error) {
      setPctErrorMessage(result.error);
      setPctStatus("error");
      return;
    }
    const recomputeResult = await recomputeSectionTypeLowHighAction();
    if (recomputeResult.error) {
      setPctErrorMessage(recomputeResult.error);
      setPctStatus("error");
      return;
    }
    setPctStatus("saved");
    router.refresh();
    setTimeout(() => setPctStatus("idle"), 3000);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Pricing Profiles
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Set Pricing Basis per section type, then edit Low, Target, and High. For $/SF, $/Job, and $/EA, Low/High are computed from Target (whole dollars) using the percentages below when Override is off; check Override to edit and persist custom Low/High.
      </p>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">Category</th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">Name</th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">Pricing Basis</th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                <div className="flex flex-col gap-1">
                  <div className="font-medium">Low</div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>Low %</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={pctLowInput}
                      onChange={(e) => setPctLowInput(e.target.value)}
                      onBlur={() => handleSavePct()}
                      className="h-7 w-14 rounded-md border border-zinc-300 bg-white px-2 text-right text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    />
                  </div>
                  {pctStatus === "saving" && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Saving…</span>}
                  {pctStatus === "saved" && <span className="text-[11px] text-green-600 dark:text-green-400">Saved</span>}
                </div>
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">Target</th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                <div className="flex flex-col gap-1">
                  <div className="font-medium">High</div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>High %</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={pctHighInput}
                      onChange={(e) => setPctHighInput(e.target.value)}
                      onBlur={() => handleSavePct()}
                      className="h-7 w-14 rounded-md border border-zinc-300 bg-white px-2 text-right text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    />
                  </div>
                  {pctStatus === "saving" && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Saving…</span>}
                  {pctStatus === "saved" && <span className="text-[11px] text-green-600 dark:text-green-400">Saved</span>}
                  {pctStatus === "error" && pctErrorMessage && <span className="text-[11px] text-red-600 dark:text-red-400">{pctErrorMessage}</span>}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No section types. Add them in the Section Types tab first.
                </td>
              </tr>
            ) : (
              list.map((row, index) => {
                const hasPricing = row.pricingBasis !== "NONE";
                const unitLabel = priceColumnLabel(row.pricingBasis);
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-zinc-200 dark:border-zinc-700 ${
                      index % 2 === 0 ? "bg-white dark:bg-zinc-900/30" : "bg-zinc-50/50 dark:bg-zinc-800/30"
                    }`}
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {CATEGORY_LABELS[row.category] ?? row.category}
                    </td>
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center justify-between gap-2">
                        <span>{row.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(row.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.pricingBasis}
                        onChange={(e) => handlePricingBasisChange(row.id, e.target.value)}
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label={`Pricing basis for ${row.name}`}
                      >
                        {PRICING_BASIS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      {!hasPricing ? (
                        <span className="text-zinc-400 dark:text-zinc-500">{NULL_PLACEHOLDER}</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-nowrap">
                            <span className="shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden>$</span>
                            <input
                              ref={(el) => { lowInputRefs.current[row.id] = el; }}
                              type="text"
                              inputMode="decimal"
                              placeholder={NULL_PLACEHOLDER}
                              aria-label={`${unitLabel} Low for ${row.name}`}
                              readOnly={!effectiveLowOverride(row)}
                              value={effectiveLowOverride(row)
                                ? (draft[row.id]?.low ?? formatLowForInput(row.priceLow ?? computedLow(row)))
                                : (computedLow(row) != null ? formatLowForInput(computedLow(row)) : "")}
                              onChange={(e) => effectiveLowOverride(row) && setDraft((prev) => ({ ...prev, [row.id]: { ...prev[row.id], low: e.target.value } }))}
                              onBlur={() => handleLowBlur(row)}
                              className={`w-24 rounded border px-2 py-1 tabular-nums text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 ${
                                !effectiveLowOverride(row) ? "cursor-default bg-zinc-50 dark:bg-zinc-800/50" : ""
                              } ${cellStatus[row.id] === "error" ? "border-red-500 dark:border-red-500" : "border-zinc-300 dark:border-zinc-600"}`}
                            />
                            <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                              <input
                                type="checkbox"
                                className="h-3 w-3 rounded border-zinc-300 dark:border-zinc-600"
                                checked={!!effectiveLowOverride(row)}
                                onChange={(e) => handleLowOverrideToggle(row, e.target.checked)}
                              />
                              <span>Override</span>
                            </label>
                          </div>
                          {cellStatus[row.id] === "saving" && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>}
                          {cellStatus[row.id] === "saved" && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                          {cellStatus[row.id] === "error" && cellError[row.id] && <span className="text-xs text-red-600 dark:text-red-400" title={cellError[row.id]}>{cellError[row.id]}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {!hasPricing ? (
                        <span className="text-zinc-400 dark:text-zinc-500">{NULL_PLACEHOLDER}</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-zinc-500 dark:text-zinc-400" aria-hidden>$</span>
                            <input
                              ref={(el) => { targetInputRefs.current[row.id] = el; }}
                              type="text"
                              inputMode="decimal"
                              placeholder={NULL_PLACEHOLDER}
                              aria-label={`${unitLabel} Target for ${row.name}`}
                              value={draft[row.id]?.target ?? formatTargetForInput(row.priceTarget)}
                              onChange={(e) => setDraft((prev) => ({ ...prev, [row.id]: { ...prev[row.id], target: e.target.value } }))}
                              onBlur={() => handleTargetBlur(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const value = draft[row.id]?.target ?? formatTargetForInput(row.priceTarget);
                                  saveTargetCell(row.id, value).then((res) => {
                                    if (!res.error && index + 1 < list.length) targetInputRefs.current[list[index + 1]!.id]?.focus();
                                  });
                                }
                              }}
                              className={`w-24 rounded border px-2 py-1 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 ${
                                cellStatus[row.id] === "error" ? "border-red-500 dark:border-red-500" : "border-zinc-300 dark:border-zinc-600"
                              }`}
                            />
                          </div>
                          {cellStatus[row.id] === "saving" && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>}
                          {cellStatus[row.id] === "saved" && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                          {cellStatus[row.id] === "error" && cellError[row.id] && <span className="text-xs text-red-600 dark:text-red-400" title={cellError[row.id]}>{cellError[row.id]}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {!hasPricing ? (
                        <span className="text-zinc-400 dark:text-zinc-500">{NULL_PLACEHOLDER}</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-nowrap">
                            <span className="shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden>$</span>
                            <input
                              ref={(el) => { highInputRefs.current[row.id] = el; }}
                              type="text"
                              inputMode="decimal"
                              placeholder={NULL_PLACEHOLDER}
                              aria-label={`${unitLabel} High for ${row.name}`}
                              readOnly={!effectiveHighOverride(row)}
                              value={effectiveHighOverride(row)
                                ? (draft[row.id]?.high ?? formatHighForInput(row.priceHigh ?? computedHigh(row)))
                                : (computedHigh(row) != null ? formatHighForInput(computedHigh(row)) : "")}
                              onChange={(e) => effectiveHighOverride(row) && setDraft((prev) => ({ ...prev, [row.id]: { ...prev[row.id], high: e.target.value } }))}
                              onBlur={() => handleHighBlur(row)}
                              className={`w-24 rounded border px-2 py-1 tabular-nums text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 ${
                                !effectiveHighOverride(row) ? "cursor-default bg-zinc-50 dark:bg-zinc-800/50" : ""
                              } ${cellStatus[row.id] === "error" ? "border-red-500 dark:border-red-500" : "border-zinc-300 dark:border-zinc-600"}`}
                            />
                            <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                              <input
                                type="checkbox"
                                className="h-3 w-3 rounded border-zinc-300 dark:border-zinc-600"
                                checked={!!effectiveHighOverride(row)}
                                onChange={(e) => handleHighOverrideToggle(row, e.target.checked)}
                              />
                              <span>Override</span>
                            </label>
                          </div>
                          {cellStatus[row.id] === "saving" && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>}
                          {cellStatus[row.id] === "saved" && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                          {cellStatus[row.id] === "error" && cellError[row.id] && <span className="text-xs text-red-600 dark:text-red-400" title={cellError[row.id]}>{cellError[row.id]}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {deleteModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Delete Pricing Profile
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              You are about to delete this Pricing Profile. You can optionally reassign all sections
              that use it to another profile. If you skip reassignment, those sections will become
              Custom (no profile).
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reassign sections to
              </label>
              <select
                value={deleteReassignId}
                onChange={(e) => setDeleteReassignId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Do not reassign (set to Custom)</option>
                {list
                  .filter((row) => row.id !== deleteModalId)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={() => {
                  setDeleteModalId(null);
                  setDeleteReassignId("");
                }}
                disabled={deleteSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
                onClick={handleConfirmDelete}
                disabled={deleteSaving}
              >
                {deleteSaving ? "Deleting…" : "Delete profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

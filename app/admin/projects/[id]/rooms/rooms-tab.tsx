"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { copeShortButtonLabel, type CopeStatus } from "@/app/admin/_estimate-job/cope-button-label";
import type { UnmatchedRoomItem } from "./actions";
import {
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
  deleteAllRoomsAction,
  reorderRoomsAction,
  generateRoomsFromTranscriptAction,
  checkRendrAvailable,
  updateRoomScopesFromTranscriptAction,
  rewriteRoomScopeAction,
  mergeRoomsWithAiAction,
  updateRoomsRoomType,
  updateRoomsSectionType,
  updateRoomSubAreasAction,
  updateRoomPricingTierAction,
  updateRoomManualPriceAction,
  updateProjectDefaultCeilingHeightAction,
  updateRoomTemplateAction,
  updateRoomDetailAction,
} from "./actions";
import { classifyRoomForDetail } from "@/app/lib/room-classification";
import { updateProjectStylePresetAction } from "../overview/actions";
import { getRoomTypes } from "@/app/admin/settings/actions";
import { NewRoomTypesModal } from "./new-room-types-modal";
import { AIEstimatePanel } from "./ai-estimate-panel";
import { BulkReviewAndEstimateModal } from "./bulk-review-and-estimate-modal";
import { RetryFailedRoomsBar } from "./retry-failed-rooms-bar";
import { BudgetExportButton } from "./budget-export-button";
import { ScopeReviewModal, type ReviewQuestion } from "./scope-review-modal";
import { formatInchesToFeetInches, parseFeetInchesToInches } from "@/app/lib/dimensions";
import { getEffectiveMeasurementMode, computeUnitQuantity } from "@/app/lib/section-unit-quantity";
import { getEstimateUnitLabel } from "@/app/lib/estimate-unit-labels";
import type { MeasurementMode, EstimateUnit } from "@/app/generated/prisma";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CURRENCY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

/** Whole dollars with $ and commas, e.g. "$12,345". */
function formatMoneyWhole(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Sq Ft from saved dimensions (lengthIn × widthIn → sq ft). Only when both present and > 0. */
function getSqFt(room: Room): number | null {
  const len = room.lengthIn;
  const wid = room.widthIn;
  if (len == null || wid == null || len <= 0 || wid <= 0) return null;
  return (len / 12) * (wid / 12);
}

/** Combined Sq Ft: base room.areaSqFt (or dimensions) + included sub-areas. */
function getCombinedSqFt(room: Room): number | null {
  const base =
    room.areaSqFt != null && !Number.isNaN(room.areaSqFt) && room.areaSqFt > 0
      ? room.areaSqFt
      : getSqFt(room) ?? 0;
  const extra =
    room.subAreas
      ?.filter((sa) => sa.includeInArea ?? true)
      .map((sa) => {
        if (sa.areaSqFt != null && !Number.isNaN(sa.areaSqFt) && sa.areaSqFt > 0) return sa.areaSqFt;
        const len = sa.lengthIn;
        const wid = sa.widthIn;
        if (len == null || wid == null || len <= 0 || wid <= 0) return 0;
        return (len / 12) * (wid / 12);
      })
      .reduce((a, b) => a + b, 0) ?? 0;
  const total = base + extra;
  return total > 0 ? total : null;
}

/**
 * Effective $/SF low and high for a room (for price range).
 * A) If room.estPricePerSqFt set → both low and high = that value.
 * B) Else if roomType has pricing → low/high from roomType with fallbacks (Target, then single value for both).
 * C) Else null.
 */
function getPerSqFtRange(room: Room): { low: number; high: number } | null {
  if (room.estPricePerSqFt != null && room.estPricePerSqFt > 0) {
    return { low: room.estPricePerSqFt, high: room.estPricePerSqFt };
  }
  const rt = room.roomType;
  if (!rt) return null;
  const low = rt.pricePerSqFtLow ?? rt.pricePerSqFtTarget ?? rt.pricePerSqFtHigh ?? null;
  const high = rt.pricePerSqFtHigh ?? rt.pricePerSqFtTarget ?? rt.pricePerSqFtLow ?? null;
  if (low == null || high == null) return null;
  return { low, high };
}

/** Room price range in whole dollars (floor low, ceil high), or null if Sq Ft or $/SF range unavailable. */
function getRoomPriceRange(room: Room): { low: number; high: number } | null {
  const sqFt = getSqFt(room);
  const perSqFt = getPerSqFtRange(room);
  if (sqFt == null || perSqFt == null) return null;
  return {
    low: Math.floor(sqFt * perSqFt.low),
    high: Math.ceil(sqFt * perSqFt.high),
  };
}

/** Result for section card price range pill: range, single target, need dimensions, or nothing. */
type SectionPriceRangeResult =
  | { kind: "range"; low: number; high: number; tooltip: string }
  | { kind: "target"; value: number; tooltip: string }
  | { kind: "needDimensions"; tooltip: string }
  | null;

/** SectionType shape used for pricing (id, pricingBasis, priceLow, priceTarget, priceHigh, category). */
type SectionTypeForPricing = {
  id: string;
  name: string;
  category: string;
  pricingBasis?: string | null;
  priceLow?: number | null;
  priceTarget?: number | null;
  priceHigh?: number | null;
};

const DEFAULT_LOW_PCT = -10;
const DEFAULT_HIGH_PCT = 10;

/**
 * Get unit low/high ($ per unit) for a SectionType using overrides or global % from target.
 * Low floors to whole dollars, high ceils to whole dollars when computed from target.
 * Returns null if pricingBasis is NONE or there is no target and no overrides.
 *
 * Inline test cases (conceptual):
 * - PER_SF: priceTarget=100, lowPct=-10, highPct=10 → unitLow=90 (floor), unitHigh=110 (ceil). priceLow override 85 → unitLow=85.
 * - PER_JOB: priceTarget=5000, no overrides → unitLow=4500, unitHigh=5500.
 */
function getUnitLowHigh(
  sectionType: SectionTypeForPricing,
  lowPct: number,
  highPct: number
): { unitLow: number; unitHigh: number } | null {
  const basis = sectionType.pricingBasis ?? "NONE";
  if (basis === "NONE") return null;

  const target = sectionType.priceTarget ?? null;
  const overrideLow = sectionType.priceLow ?? null;
  const overrideHigh = sectionType.priceHigh ?? null;

  const unitLow: number | null =
    overrideLow ??
    (target != null ? Math.floor(target * (1 + lowPct / 100)) : null);
  const unitHigh: number | null =
    overrideHigh ??
    (target != null ? Math.ceil(target * (1 + highPct / 100)) : null);

  if (unitLow == null && unitHigh == null) return null;
  const low = unitLow ?? unitHigh!;
  const high = unitHigh ?? unitLow!;
  return { unitLow: low, unitHigh: high };
}

/**
 * Compute range totals (lowTotal, highTotal) for the blue pill from section + sectionType.
 * Whole-dollar: lowTotal floored, highTotal ceiled.
 * - PER_SF: lowTotal = floor(unitLow * sqFt), highTotal = ceil(unitHigh * sqFt). Requires sqFt > 0.
 * - PER_JOB: lowTotal = floor(unitLow), highTotal = ceil(unitHigh) (no multiplying).
 * - PER_EACH: lowTotal = floor(unitLow * qty), highTotal = ceil(unitHigh * qty); qty defaults to 1.
 *
 * Inline test cases (conceptual):
 * - PER_SF: unitLow=90, unitHigh=110, sqFt=100 → lowTotal=9000, highTotal=11000.
 * - PER_JOB: unitLow=4500, unitHigh=5500 → lowTotal=4500, highTotal=5500 (no multiplying).
 */
function getRangeTotal(
  room: Room,
  sectionType: SectionTypeForPricing,
  unitLow: number,
  unitHigh: number
): { lowTotal: number; highTotal: number; tooltip: string } | null {
  const basis = sectionType.pricingBasis ?? "NONE";

  if (basis === "PER_SF") {
    const sqFt = getCombinedSqFt(room);
    if (sqFt == null || sqFt <= 0) return null;
    const lowTotal = Math.floor(unitLow * sqFt);
    const highTotal = Math.ceil(unitHigh * sqFt);
    const tooltip = `Pricing Profile: ${sectionType.name} ($/SF) × ${sqFt.toFixed(1)} SF`;
    return { lowTotal, highTotal, tooltip };
  }

  if (basis === "PER_JOB") {
    const lowTotal = Math.floor(unitLow);
    const highTotal = Math.ceil(unitHigh);
    const tooltip = `Pricing Profile: ${sectionType.name} ($/Job)`;
    return { lowTotal, highTotal, tooltip };
  }

  if (basis === "PER_EACH") {
    const qty = room.quantity ?? room.unitQuantity ?? 1;
    const lowTotal = Math.floor(unitLow * qty);
    const highTotal = Math.ceil(unitHigh * qty);
    const tooltip = `Pricing Profile: ${sectionType.name} ($/EA) × ${qty}`;
    return { lowTotal, highTotal, tooltip };
  }

  return null;
}

/**
 * Compute what to show in the blue price range pill for a section card.
 * Uses correct SectionType (section.sectionTypeId) when mapped; does not treat mapped sections as Custom.
 * Pricing basis: PER_SF (unit × sqFt, whole-dollar floor/ceil), PER_JOB (unit = total), PER_EACH (unit × qty), NONE = no pill.
 */
function getSectionPriceRangeDisplay(
  room: Room,
  lowPct: number = DEFAULT_LOW_PCT,
  highPct: number = DEFAULT_HIGH_PCT
): SectionPriceRangeResult {
  const rt = room.roomType;
  const st = room.sectionType;

  // 1) Section has a Pricing Profile (SectionType): use SectionType pricing only
  if (room.sectionTypeId && st) {
    const basis = st.pricingBasis ?? "NONE";

    if (basis === "NONE") return null;
    const noTargetAndNoOverrides =
      (st.priceTarget == null && st.priceLow == null && st.priceHigh == null);
    if (noTargetAndNoOverrides) return null;

    const unitRange = getUnitLowHigh(st, lowPct, highPct);
    if (!unitRange) return null;

    const { unitLow, unitHigh } = unitRange;

    if (basis === "PER_SF") {
      const sqFt = getCombinedSqFt(room);
      if (sqFt == null || sqFt <= 0) {
        return {
          kind: "needDimensions",
          tooltip: `Pricing Profile: ${st.name} ($/SF) — set dimensions to estimate`,
        };
      }
      const rangeTotal = getRangeTotal(room, st, unitLow, unitHigh);
      if (!rangeTotal) return null;
      const { lowTotal, highTotal, tooltip } = rangeTotal;
      if (lowTotal === highTotal) return { kind: "target", value: lowTotal, tooltip };
      return { kind: "range", low: lowTotal, high: highTotal, tooltip };
    }

    if (basis === "PER_JOB" || basis === "PER_EACH") {
      const rangeTotal = getRangeTotal(room, st, unitLow, unitHigh);
      if (!rangeTotal) return null;
      const { lowTotal, highTotal, tooltip } = rangeTotal;
      if (lowTotal === highTotal) return { kind: "target", value: lowTotal, tooltip };
      return { kind: "range", low: lowTotal, high: highTotal, tooltip };
    }

    return null;
  }

  // 2) No SectionType: fall back to RoomType ($/SF) if set
  if (room.roomTypeId && rt) {
    const sqFt = getCombinedSqFt(room);
    if (sqFt == null) {
      return {
        kind: "needDimensions",
        tooltip: `Pricing Profile: ${rt.name} ($/SF) — set dimensions to estimate`,
      };
    }
    const lowRate = rt.pricePerSqFtLow ?? rt.pricePerSqFtTarget ?? rt.pricePerSqFtHigh ?? null;
    const highRate = rt.pricePerSqFtHigh ?? rt.pricePerSqFtTarget ?? rt.pricePerSqFtLow ?? null;
    if (lowRate == null || highRate == null) return null;
    const low = Math.floor(sqFt * lowRate);
    const high = Math.ceil(sqFt * highRate);
    const tooltip = `Pricing Profile: ${rt.name} ($/SF) × ${sqFt.toFixed(1)} SF`;
    if (low === high) return { kind: "target", value: low, tooltip };
    return { kind: "range", low, high, tooltip };
  }

  // 3) Custom: use section's stored totals (whole dollars)
  const totalLow = room.totalLow != null ? Math.round(room.totalLow) : null;
  const totalTarget = room.totalTarget != null ? Math.round(room.totalTarget) : null;
  const totalHigh = room.totalHigh != null ? Math.round(room.totalHigh) : null;
  if (totalLow != null || totalTarget != null || totalHigh != null) {
    const low = totalLow ?? totalTarget ?? totalHigh ?? 0;
    const high = totalHigh ?? totalTarget ?? totalLow ?? 0;
    const tooltip = "Custom price";
    if (low === high) return { kind: "target", value: low, tooltip };
    if (totalLow != null && totalHigh != null) {
      return { kind: "range", low: totalLow, high: totalHigh, tooltip };
    }
    if (totalTarget != null) return { kind: "target", value: totalTarget, tooltip };
    return { kind: "target", value: low, tooltip };
  }

  return null;
}

const BLUE_PILL_CLASS =
  "inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200";

function SectionPriceRangePill({ result }: { result: SectionPriceRangeResult }) {
  if (result == null) return null;
  if (result.kind === "needDimensions") {
    return (
      <span className={BLUE_PILL_CLASS} title={result.tooltip}>
        Set dimensions to estimate
      </span>
    );
  }
  if (result.kind === "target") {
    return (
      <span className={BLUE_PILL_CLASS} title={result.tooltip}>
        Target: {formatMoneyWhole(result.value)}
      </span>
    );
  }
  const text =
    result.low === result.high
      ? formatMoneyWhole(result.low)
      : `${formatMoneyWhole(result.low)} – ${formatMoneyWhole(result.high)}`;
  return (
    <span className={BLUE_PILL_CLASS} title={result.tooltip}>
      {text}
    </span>
  );
}

/** Inline pill content for SectionPriceRange (text only, no wrapper). */
function profilePillText(result: SectionPriceRangeResult): string {
  if (result == null) return "—";
  if (result.kind === "needDimensions") return "Set dimensions";
  if (result.kind === "target") return formatMoneyWhole(result.value);
  return result.low === result.high
    ? formatMoneyWhole(result.low)
    : `${formatMoneyWhole(result.low)} – ${formatMoneyWhole(result.high)}`;
}

function ManualPricePopup({
  projectId,
  roomId,
  initialLow,
  initialHigh,
  onClose,
  onSaved,
}: {
  projectId: string;
  roomId: string;
  initialLow: number | null;
  initialHigh: number | null;
  onClose: () => void;
  onSaved: (low: number | null, high: number | null) => void;
}) {
  const [lowStr, setLowStr] = useState(initialLow != null ? String(initialLow) : "");
  const [highStr, setHighStr] = useState(initialHigh != null ? String(initialHigh) : "");
  const [saving, setSaving] = useState(false);

  function parseDollars(s: string): number | null {
    const cleaned = s.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : Math.round(n);
  }

  async function handleSave() {
    const low = parseDollars(lowStr);
    const high = parseDollars(highStr);
    setSaving(true);
    await updateRoomManualPriceAction(projectId, roomId, low, high);
    setSaving(false);
    onSaved(low, high);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">Manual Price Override</h3>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Low</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
              <input
                type="text"
                value={lowStr}
                onChange={(e) => setLowStr(e.target.value)}
                placeholder="0"
                className="w-full rounded border border-zinc-300 pl-5 pr-2 py-1.5 text-sm tabular-nums text-right"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              />
            </div>
          </div>
          <span className="text-zinc-300 mt-5">–</span>
          <div className="flex-1">
            <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">High</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
              <input
                type="text"
                value={highStr}
                onChange={(e) => setHighStr(e.target.value)}
                placeholder="0"
                className="w-full rounded border border-zinc-300 pl-5 pr-2 py-1.5 text-sm tabular-nums text-right"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingTierSelector({
  projectId,
  room,
  profileResult,
  refreshKey,
  onTierChanged,
}: {
  projectId: string;
  room: { id: string; pricingTier?: "PROFILE" | "AI_ESTIMATE" | "MANUAL"; totalLow?: number | null; totalTarget?: number | null; totalHigh?: number | null };
  profileResult: SectionPriceRangeResult;
  refreshKey?: number;
  onTierChanged?: () => void;
}) {
  const [tier, setTier] = useState<"PROFILE" | "AI_ESTIMATE" | "MANUAL">(room.pricingTier ?? "PROFILE");
  const [estimate, setEstimate] = useState<{ totalPrice: number; rangeLow: number; rangeHigh: number } | null>(null);
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [manualLow, setManualLow] = useState<number | null>(room.totalLow != null ? Math.round(room.totalLow) : null);
  const [manualHigh, setManualHigh] = useState<number | null>(room.totalHigh != null ? Math.round(room.totalHigh) : null);

  useEffect(() => { setTier(room.pricingTier ?? "PROFILE"); }, [room.pricingTier]);

  // Fetch estimate data for AI tier display
  useEffect(() => {
    fetch(`/api/ai-estimate?projectId=${projectId}&sectionId=${room.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.estimate) {
          const est = data.estimate;
          const lineItems = est.lineItems ?? [];
          let low = lineItems.reduce((s: number, i: { totalPriceLow?: number; totalPrice: number }) => s + (i.totalPriceLow ?? 0), 0);
          let high = lineItems.reduce((s: number, i: { totalPriceHigh?: number; totalPrice: number }) => s + (i.totalPriceHigh ?? 0), 0);
          if ((low <= 0 || high <= 0 || low === high) && est.totalPrice > 0) {
            low = Math.round(est.totalPrice * 0.9);
            high = Math.round(est.totalPrice * 1.1);
          }
          setEstimate({ totalPrice: est.totalPrice, rangeLow: low, rangeHigh: high });
        }
      })
      .catch(() => {});
  }, [projectId, room.id, refreshKey]);

  async function handleChange(newTier: "PROFILE" | "AI_ESTIMATE" | "MANUAL") {
    if (newTier === "MANUAL") {
      setShowManualPopup(true);
      return;
    }
    setTier(newTier);
    await updateRoomPricingTierAction(projectId, room.id, newTier);
    onTierChanged?.();
  }

  const profileText = profilePillText(profileResult);
  const aiHasRange = estimate && estimate.rangeLow > 0 && estimate.rangeHigh > 0 && estimate.rangeLow !== estimate.rangeHigh;
  const aiText = estimate
    ? aiHasRange
      ? `${formatMoneyWhole(estimate.rangeLow)} – ${formatMoneyWhole(estimate.rangeHigh)}`
      : formatMoneyWhole(estimate.totalPrice)
    : "—";

  const hasManualValues = manualLow != null && manualHigh != null && (manualLow > 0 || manualHigh > 0);
  const manualText = hasManualValues
    ? manualLow !== manualHigh
      ? `${formatMoneyWhole(manualLow!)} – ${formatMoneyWhole(manualHigh!)}`
      : formatMoneyWhole(manualLow!)
    : "";

  const tiers: { key: "PROFILE" | "AI_ESTIMATE" | "MANUAL"; label: string; value: string; color: string; activeColor: string; available: boolean }[] = [
    { key: "PROFILE", label: "SQFT Pricing", value: profileText, color: "text-blue-600 border-blue-200 bg-blue-50", activeColor: "ring-2 ring-blue-400 border-blue-400 bg-blue-100", available: profileResult != null },
    { key: "AI_ESTIMATE", label: "AI Estimate", value: aiText, color: "text-amber-700 border-amber-200 bg-amber-50", activeColor: "ring-2 ring-amber-400 border-amber-400 bg-amber-100", available: estimate != null },
    { key: "MANUAL", label: "Manual", value: manualText, color: "text-zinc-600 border-zinc-200 bg-zinc-50", activeColor: "ring-2 ring-zinc-400 border-zinc-400 bg-zinc-100", available: true },
  ];

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {tiers.map((t) => {
        const isActive = tier === t.key;
        const dimmed = !isActive && !t.available;
        const isManual = t.key === "MANUAL";
        return (
          <label
            key={t.key}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium cursor-pointer transition-all select-none ${
              isActive ? t.activeColor : t.color
            } ${dimmed ? "opacity-40 cursor-not-allowed" : ""} ${!isActive ? "opacity-60 hover:opacity-90" : ""}`}
          >
            <input
              type="radio"
              name={`tier-${room.id}`}
              value={t.key}
              checked={isActive}
              onChange={() => handleChange(t.key)}
              disabled={dimmed}
              className="h-3 w-3 accent-current"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide">{t.label}{t.value ? ":" : ""}</span>
            {t.value && <span className="tabular-nums">{t.value}</span>}
            {isManual && isActive && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowManualPopup(true); }}
                className="ml-0.5 text-[10px] text-zinc-500 hover:text-zinc-700 underline"
              >
                edit
              </button>
            )}
          </label>
        );
      })}
      {showManualPopup && (
        <ManualPricePopup
          projectId={projectId}
          roomId={room.id}
          initialLow={manualLow}
          initialHigh={manualHigh}
          onClose={() => setShowManualPopup(false)}
          onSaved={(low, high) => {
            setManualLow(low);
            setManualHigh(high);
            setTier("MANUAL");
            onTierChanged?.();
          }}
        />
      )}
    </div>
  );
}

type Room = {
  id: string;
  name: string;
  scopeNarrative: string;
  scopeSource?: string | null;
  scopeUpdatedAt?: Date | string | null;
  sortOrder: number;
  roomTypeId?: string | null;
  roomType?: { id: string; name: string; pricePerSqFtLow?: number | null; pricePerSqFtTarget?: number | null; pricePerSqFtHigh?: number | null } | null;
  stylePresetId?: string | null;
  stylePreset?: { id: string; name: string } | null;
  estPricePerSqFt?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  ceilingHeightIn?: number | null;
  sectionTypeId?: string | null;
  sectionType?: { id: string; name: string; category: string; defaultMeasurementMode: string; defaultEstimateUnit: string; customUnitLabel: string | null; pricingBasis?: string | null; priceLow?: number | null; priceTarget?: number | null; priceHigh?: number | null } | null;
  measurementMode?: MeasurementMode | null;
  areaSqFt?: number | null;
  quantity?: number | null;
  origin?: string;
  estimateUnit?: EstimateUnit | null;
  customUnitLabel?: string | null;
  unitQuantity?: number | null;
  unitQuantityManualOverride?: boolean;
  bucket?: "BASE" | "ALTERNATE" | "ALLOWANCE";
  pricingTier?: "PROFILE" | "AI_ESTIMATE" | "MANUAL";
  isProjectOverhead?: boolean;
  totalLow?: number | null;
  totalTarget?: number | null;
  totalHigh?: number | null;
  unitRateLow?: number | null;
  unitRateTarget?: number | null;
  unitRateHigh?: number | null;
  scopeQA?: unknown;
  estimateStaleReason?: string | null;
  roomTemplateId?: string | null;
  wallsSF?: number | null;
  ceilingSF?: number | null;
  perimeterLF?: number | null;
  paintableSF?: number | null;
  windowCount?: number | null;
  windowsSF?: number | null;
  doorCount?: number | null;
  doorsSF?: number | null;
  measurementSource?: string | null;
  rendrCeilingHeightFt?: number | null;
  rendrRoomMappings?: { index: number; label: string }[] | null;
  roomDetail?: Record<string, unknown> | null;
  subAreas?: {
    id: string;
    name: string;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
    areaSqFt?: number | null;
    sortOrder: number;
    includeInArea?: boolean | null;
  }[];
};

type RoomTypeOption = { id: string; name: string };
type StylePresetOption = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string; defaultMeasurementMode: string; defaultEstimateUnit: string; customUnitLabel: string | null };
type RoomTemplateOption = { id: string; name: string; displayName?: string | null; active: boolean };

/** Measurement source indicator badge for section cards. */
function MeasurementSourceBadge({ room }: { room: Room }) {
  const source = room.measurementSource;
  const mappings = room.rendrRoomMappings as { index: number; label: string }[] | null;

  if (!source && !mappings?.length) return null;

  const badge = (() => {
    if (source === "rendr") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Rendr
        </span>
      );
    }
    if (source === "transcript") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Transcript
        </span>
      );
    }
    if (source === "manual") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          Manual
        </span>
      );
    }
    return null;
  })();

  const rendrLink = mappings?.length ? (
    <span className="text-xs text-zinc-400 dark:text-zinc-500" title={mappings.map((m) => m.label).join(" + ")}>
      Linked to Rendr: {mappings.map((m) => m.label).join(" + ")}
    </span>
  ) : null;

  return (
    <>
      {badge}
      {rendrLink}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rendr Data Grid — compact display of LiDAR measurements + fixtures
// ---------------------------------------------------------------------------

function RendrDataGrid({ room, projectId }: { room: Room; projectId: string }) {
  if (room.measurementSource !== "rendr") return null;

  const rendrCeilingFt = room.rendrCeilingHeightFt ?? null;
  const detail = room.roomDetail as Record<string, unknown> | null;
  const roomType = classifyRoomForDetail(room.name, room.sectionType?.name);

  // Local state for editable recommended values
  const buildRecValues = useCallback(() => {
    if (!detail) return {};
    const rec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail)) {
      if (k.endsWith("Recommended") || k === "recommendedSource") rec[k] = v;
    }
    return rec;
  }, [detail]);
  const [recValues, setRecValues] = useState<Record<string, unknown>>(buildRecValues);
  const [saving, setSaving] = useState(false);

  // Sync recValues when room.roomDetail changes (e.g., after AI recalculation)
  useEffect(() => {
    setRecValues(buildRecValues());
  }, [buildRecValues]);

  const saveRecommended = useCallback(async (key: string, value: unknown) => {
    const updated = { ...detail, ...recValues, [key]: value, recommendedSource: "manual" };
    setRecValues((prev) => ({ ...prev, [key]: value, recommendedSource: "manual" }));
    setSaving(true);
    try {
      await updateRoomDetailAction(projectId, room.id, updated);
    } finally {
      setSaving(false);
    }
  }, [detail, recValues, projectId, room.id]);

  const getRec = (key: string) => recValues[key] ?? detail?.[key] ?? null;

  // Number input for recommended values
  const RecNum = ({ label, existKey, recKey, unit }: { label: string; existKey: string; recKey: string; unit?: string }) => {
    const existVal = detail?.[existKey] as number | null | undefined;
    const recVal = getRec(recKey) as number | null | undefined;
    if (existVal == null && recVal == null) return null;
    return (
      <tr>
        <td className="pr-3 py-0.5 text-zinc-500 dark:text-zinc-400">{label}{unit ? ` (${unit})` : ""}</td>
        <td className="pr-3 py-0.5 text-center">{existVal ?? "—"}</td>
        <td className="py-0.5">
          <input
            type="number"
            step="any"
            className="w-16 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-center text-xs dark:border-zinc-600 dark:bg-zinc-800"
            defaultValue={recVal ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim() === "" ? null : Number(e.target.value);
              if (v !== recVal) saveRecommended(recKey, v);
            }}
          />
        </td>
      </tr>
    );
  };

  // Boolean checkbox for recommended values
  const RecBool = ({ label, existKey, recKey }: { label: string; existKey: string; recKey: string }) => {
    const existVal = detail?.[existKey] as boolean | null | undefined;
    const recVal = getRec(recKey) as boolean | null | undefined;
    if (existVal == null && recVal == null) return null;
    return (
      <tr>
        <td className="pr-3 py-0.5 text-zinc-500 dark:text-zinc-400">{label}</td>
        <td className="pr-3 py-0.5 text-center">{existVal ? "\u2713" : "—"}</td>
        <td className="py-0.5 text-center">
          <input
            type="checkbox"
            checked={recVal === true}
            onChange={(e) => saveRecommended(recKey, e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-orange-500 focus:ring-orange-500 dark:border-zinc-600"
          />
        </td>
      </tr>
    );
  };

  const recSource = (getRec("recommendedSource") as string) ?? detail?.recommendedSource;

  return (
    <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Rendr Data
        {saving && <span className="text-orange-500 normal-case font-normal">saving...</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {room.areaSqFt ? <span>Floor: {room.areaSqFt.toFixed(1)} SF</span> : null}
        {room.wallsSF ? <span>Walls: {room.wallsSF.toFixed(1)} SF</span> : null}
        {room.ceilingSF ? <span>Ceiling: {room.ceilingSF.toFixed(1)} SF</span> : null}
        {room.perimeterLF ? <span>Perimeter: {room.perimeterLF.toFixed(1)} LF</span> : null}
        {room.paintableSF ? <span>Paintable: {room.paintableSF.toFixed(1)} SF</span> : null}
        {room.windowCount ? <span>Windows: {room.windowCount}{room.windowsSF ? ` (${room.windowsSF.toFixed(1)} SF)` : ""}</span> : null}
        {room.doorCount ? <span>Doors: {room.doorCount}{room.doorsSF ? ` (${room.doorsSF.toFixed(1)} SF)` : ""}</span> : null}
        {rendrCeilingFt ? <span>Ceiling Ht: {rendrCeilingFt.toFixed(1)} ft</span> : null}
      </div>
      {roomType && detail && (
        <table className="mt-2 text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <th className="pr-3 pb-0.5 text-left font-semibold">Fixtures</th>
              <th className="pr-3 pb-0.5 text-center font-semibold">Existing</th>
              <th className="pb-0.5 text-center font-semibold">
                Recommended
                {recSource && (
                  <span className="ml-1 normal-case font-normal">
                    ({recSource === "manual" ? "edited" : recSource === "rendr" ? "Rendr" : "AI"})
                  </span>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-600 dark:text-zinc-400">
            {roomType === "kitchen" && (
              <>
                <RecNum label="Base Cabinets" existKey="baseCabinetCountExisting" recKey="baseCabinetCountRecommended" />
                <RecNum label="Base Cab LF" existKey="baseCabinetLfExisting" recKey="baseCabinetLfRecommended" unit="LF" />
                <RecNum label="Wall Cabinets" existKey="wallCabinetCountExisting" recKey="wallCabinetCountRecommended" />
                <RecNum label="Wall Cab LF" existKey="wallCabinetLfExisting" recKey="wallCabinetLfRecommended" unit="LF" />
                <RecNum label="Countertop" existKey="countertopSfExisting" recKey="countertopSfRecommended" unit="SF" />
                <RecNum label="Backsplash" existKey="backsplashSfExisting" recKey="backsplashSfRecommended" unit="SF" />
                <RecNum label="Sinks" existKey="sinkCountExisting" recKey="sinkCountRecommended" />
                <RecBool label="Stove" existKey="hasStoveExisting" recKey="hasStoveRecommended" />
                <RecBool label="Oven" existKey="hasOvenExisting" recKey="hasOvenRecommended" />
                <RecBool label="Fridge" existKey="hasFridgeExisting" recKey="hasFridgeRecommended" />
                <RecBool label="Dishwasher" existKey="hasDishwasherExisting" recKey="hasDishwasherRecommended" />
              </>
            )}
            {roomType === "bathroom" && (
              <>
                <RecNum label="Vanity" existKey="vanityCabinetCountExisting" recKey="vanityCabinetCountRecommended" />
                <RecNum label="Vanity LF" existKey="vanityCabinetLfExisting" recKey="vanityCabinetLfRecommended" unit="LF" />
                <RecNum label="Countertop" existKey="countertopSfExisting" recKey="countertopSfRecommended" unit="SF" />
                <RecNum label="Backsplash" existKey="backsplashSfExisting" recKey="backsplashSfRecommended" unit="SF" />
                <RecNum label="Sinks" existKey="sinkCountExisting" recKey="sinkCountRecommended" />
                <RecNum label="Toilets" existKey="toiletCountExisting" recKey="toiletCountRecommended" />
                <RecBool label="Tub" existKey="hasTubExisting" recKey="hasTubRecommended" />
                <RecBool label="Shower" existKey="hasShowerExisting" recKey="hasShowerRecommended" />
                <RecBool label="Tub/Shower Combo" existKey="hasTubShowerComboExisting" recKey="hasTubShowerComboRecommended" />
              </>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Auto-match a room name to a template name. */
function autoMatchTemplate(roomName: string, templates: RoomTemplateOption[]): string | null {
  const lower = roomName.toLowerCase();
  const rules: [string[], string][] = [
    [["kitchen"], "kitchen"],
    [["bath", "bathroom", "powder"], "bath"],
    [["laundry", "mud room", "mudroom"], "laundry"],
    [["closet"], "closet"],
    [["cope", "admin", "project execution", "overhead"], "cope"],
  ];
  for (const [keywords, match] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const t = templates.find((t) => t.name.toLowerCase().includes(match));
      if (t) return t.id;
    }
  }
  // Default: Standard Room for everything else
  return templates.find((t) => {
    const n = t.name.toLowerCase();
    return n.includes("standard") || n === "general" || n === "standard room";
  })?.id ?? null;
}

type Props = {
  projectId: string;
  projectStylePresetId: string | null;
  defaultCeilingHeightFt: number;
  rooms: Room[];
  projectQA?: unknown;
  stylePresets: StylePresetOption[];
  sectionTypes: SectionTypeOption[];
  /** Global Low % (e.g. -10). Used to compute unit low from SectionType priceTarget when override not set. */
  roomTypeLowPct?: number;
  /** Global High % (e.g. 10). Used to compute unit high from SectionType priceTarget when override not set. */
  roomTypeHighPct?: number;
  /** Drives the COPE card button label (Generate / Regenerate / Generating / Retry). */
  projectCopeStatus: CopeStatus;
};

function formatScopeUpdatedAt(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** Format SectionType for Pricing Profile display: "Bathroom (Interior)" or "Custom" when unmapped. */
function formatPricingProfileLabel(
  sectionType: { name: string; category?: string } | null | undefined
): string {
  if (!sectionType?.name) return "Custom";
  const categoryLabel = sectionType.category
    ? sectionType.category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  return categoryLabel ? `${sectionType.name} (${categoryLabel})` : sectionType.name;
}

/** Sq Ft = (lengthIn/12)*(widthIn/12), 1 decimal; "—" if either missing. */
function sqFtDisplay(lengthIn: number | null | undefined, widthIn: number | null | undefined, rendrAreaSqFt?: number | null): string {
  if (rendrAreaSqFt != null && rendrAreaSqFt > 0) return rendrAreaSqFt.toFixed(1);
  if (lengthIn == null || widthIn == null) return "—";
  const sqFt = (lengthIn / 12) * (widthIn / 12);
  return sqFt.toFixed(1);
}

/** Perimeter (linear ft) = 2 * ((lengthIn/12) + (widthIn/12)); "—" if length or width missing. */
function perimeterDisplay(lengthIn: number | null | undefined, widthIn: number | null | undefined, rendrPerimeterLF?: number | null): string {
  if (rendrPerimeterLF != null && rendrPerimeterLF > 0) return rendrPerimeterLF.toFixed(1);
  if (lengthIn == null || widthIn == null) return "—";
  const perimeterFt = 2 * (lengthIn / 12 + widthIn / 12);
  return perimeterFt.toFixed(1);
}

/** Wall SF = perimeterFt * (ceilingHeightIn/12); "—" if length, width, or ceiling missing. */
function wallSfDisplay(
  lengthIn: number | null | undefined,
  widthIn: number | null | undefined,
  ceilingHeightIn: number | null | undefined,
  rendrWallsSF?: number | null,
): string {
  // Prefer Rendr direct measurement when available
  if (rendrWallsSF != null && rendrWallsSF > 0) return rendrWallsSF.toFixed(1);
  if (lengthIn == null || widthIn == null || ceilingHeightIn == null) return "—";
  const perimeterFt = 2 * (lengthIn / 12 + widthIn / 12);
  const wallSf = perimeterFt * (ceilingHeightIn / 12);
  return wallSf.toFixed(1);
}

/** Resolve effective inches from current input or saved room value (for live derived metrics). */
function effectiveInches(
  str: string,
  roomValue: number | null | undefined
): number | null {
  const trimmed = str.trim();
  if (!trimmed) return roomValue ?? null;
  const p = parseFeetInchesToInches(trimmed);
  if (p.error != null) return roomValue ?? null;
  return p.inches ?? roomValue ?? null;
}

function RoomDimensionsRow({
  projectId,
  room,
  onSaved,
}: {
  projectId: string;
  room: Room;
  onSaved: () => void;
}) {
  const [lengthStr, setLengthStr] = useState(() => formatInchesToFeetInches(room.lengthIn ?? null));
  const [widthStr, setWidthStr] = useState(() => formatInchesToFeetInches(room.widthIn ?? null));
  const [ceilingStr, setCeilingStr] = useState(() => formatInchesToFeetInches(room.ceilingHeightIn ?? null));
  const [errors, setErrors] = useState<{ length?: string; width?: string; ceiling?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLengthStr(formatInchesToFeetInches(room.lengthIn ?? null));
    setWidthStr(formatInchesToFeetInches(room.widthIn ?? null));
    setCeilingStr(formatInchesToFeetInches(room.ceilingHeightIn ?? null));
  }, [room.id, room.lengthIn, room.widthIn, room.ceilingHeightIn]);

  const saveDimensions = useCallback(
    async (newLength: string, newWidth: string, newCeiling: string) => {
      const formData = new FormData();
      formData.set("name", room.name);
      formData.set("scopeNarrative", room.scopeNarrative ?? "");
      formData.set("estPricePerSqFt", room.estPricePerSqFt != null ? String(room.estPricePerSqFt) : "");
      formData.set("lengthIn", newLength);
      formData.set("widthIn", newWidth);
      formData.set("ceilingHeightIn", newCeiling);
      // Preserve all existing room fields so updateRoomAction doesn't reset them
      formData.set("sectionTypeId", room.sectionTypeId ?? "");
      formData.set("origin", room.origin ?? "MANUAL");
      formData.set("bucket", room.bucket ?? "BASE");
      formData.set("measurementMode", room.measurementMode ?? "");
      // Don't send old areaSqFt — let the server recalculate from new dimensions
      formData.set("areaSqFt", "");
      formData.set("quantity", room.quantity != null ? String(room.quantity) : "");
      formData.set("estimateUnit", room.estimateUnit ?? "");
      formData.set("customUnitLabel", room.customUnitLabel ?? "");
      formData.set("unitQuantityManualOverride", room.unitQuantityManualOverride ? "true" : "false");
      if (room.unitQuantityManualOverride && room.unitQuantity != null) {
        formData.set("unitQuantityOverride", String(room.unitQuantity));
      }
      if (room.unitRateLow != null) formData.set("unitRateLow", String(room.unitRateLow));
      if (room.unitRateTarget != null) formData.set("unitRateTarget", String(room.unitRateTarget));
      if (room.unitRateHigh != null) formData.set("unitRateHigh", String(room.unitRateHigh));
      setSaving(true);
      await updateRoomAction(projectId, room.id, formData);
      setSaving(false);
      onSaved();
    },
    [projectId, room, onSaved]
  );

  function handleBlur(
    kind: "length" | "width" | "ceiling",
    raw: string,
    setStr: (s: string) => void
  ) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setStr("");
      setErrors((e) => ({ ...e, [kind]: undefined }));
      saveDimensions(
        kind === "length" ? "" : lengthStr,
        kind === "width" ? "" : widthStr,
        kind === "ceiling" ? "" : ceilingStr
      );
      return;
    }
    const parsed = parseFeetInchesToInches(trimmed);
    if (parsed.error) {
      setErrors((e) => ({ ...e, [kind]: parsed.error }));
      return;
    }
    const normalized = formatInchesToFeetInches(parsed.inches);
    setStr(normalized);
    setErrors((e) => ({ ...e, [kind]: undefined }));
    const newLength = kind === "length" ? normalized : lengthStr;
    const newWidth = kind === "width" ? normalized : widthStr;
    const newCeiling = kind === "ceiling" ? normalized : ceilingStr;
    saveDimensions(newLength, newWidth, newCeiling);
  }

  const effectiveLengthIn = effectiveInches(lengthStr, room.lengthIn);
  const effectiveWidthIn = effectiveInches(widthStr, room.widthIn);
  const effectiveCeilingHeightIn = effectiveInches(ceilingStr, room.ceilingHeightIn);

  const hasRendr = room.measurementSource === "rendr" || (room.wallsSF != null && room.wallsSF > 0);
  const isRendrActive = room.measurementSource === "rendr";

  const handleSourceToggle = async (useRendr: boolean) => {
    const formData = new FormData();
    formData.set("name", room.name);
    formData.set("scopeNarrative", room.scopeNarrative ?? "");
    formData.set("estPricePerSqFt", room.estPricePerSqFt != null ? String(room.estPricePerSqFt) : "");
    formData.set("lengthIn", lengthStr);
    formData.set("widthIn", widthStr);
    formData.set("ceilingHeightIn", useRendr && room.rendrCeilingHeightFt
      ? formatInchesToFeetInches(Math.round(room.rendrCeilingHeightFt * 12))
      : ceilingStr);
    formData.set("sectionTypeId", room.sectionTypeId ?? "");
    formData.set("origin", room.origin ?? "MANUAL");
    formData.set("bucket", room.bucket ?? "BASE");
    formData.set("measurementMode", room.measurementMode ?? "");
    formData.set("areaSqFt", useRendr && room.areaSqFt != null ? String(room.areaSqFt) : "");
    // Explicit source toggle — without this the server's dimsChanged heuristic
    // can't distinguish "switch back to Rendr" (no field changes) from "no-op".
    formData.set("measurementSource", useRendr ? "rendr" : "manual");
    formData.set("quantity", room.quantity != null ? String(room.quantity) : "");
    formData.set("estimateUnit", room.estimateUnit ?? "");
    formData.set("customUnitLabel", room.customUnitLabel ?? "");
    formData.set("unitQuantityManualOverride", room.unitQuantityManualOverride ? "true" : "false");
    if (room.unitQuantityManualOverride && room.unitQuantity != null) {
      formData.set("unitQuantityOverride", String(room.unitQuantity));
    }
    if (room.unitRateLow != null) formData.set("unitRateLow", String(room.unitRateLow));
    if (room.unitRateTarget != null) formData.set("unitRateTarget", String(room.unitRateTarget));
    if (room.unitRateHigh != null) formData.set("unitRateHigh", String(room.unitRateHigh));
    setSaving(true);
    await updateRoomAction(projectId, room.id, formData);
    setSaving(false);
    onSaved();
  };

  // Metrics based on active source
  const displaySqFt = isRendrActive
    ? (room.areaSqFt != null ? String(room.areaSqFt) : "—")
    : sqFtDisplay(effectiveLengthIn, effectiveWidthIn);
  const displayPerimeter = isRendrActive && room.perimeterLF
    ? room.perimeterLF.toFixed(1)
    : perimeterDisplay(effectiveLengthIn, effectiveWidthIn);
  const displayWallSF = isRendrActive && room.wallsSF
    ? room.wallsSF.toFixed(1)
    : wallSfDisplay(effectiveLengthIn, effectiveWidthIn, effectiveCeilingHeightIn);

  return (
    <div className="mt-2 space-y-1">
      {/* Row label for Transcript/Manual (only when dual rows) */}
      {hasRendr && (
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Transcript / Manual
        </div>
      )}
      {/* Transcript/Manual dimension inputs */}
      <div className="flex flex-wrap items-center gap-3 gap-y-1">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Length</label>
          <input type="text" value={lengthStr} onChange={(e) => setLengthStr(e.target.value)} onBlur={() => handleBlur("length", lengthStr, setLengthStr)} placeholder="e.g. 12' 6&quot;" className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" aria-label="Length (ft/in)" />
          {errors.length && <p className="text-xs text-red-600 dark:text-red-400">{errors.length}</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Width</label>
          <input type="text" value={widthStr} onChange={(e) => setWidthStr(e.target.value)} onBlur={() => handleBlur("width", widthStr, setWidthStr)} placeholder="e.g. 12' 6&quot;" className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" aria-label="Width (ft/in)" />
          {errors.width && <p className="text-xs text-red-600 dark:text-red-400">{errors.width}</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Ceiling</label>
          <input type="text" value={ceilingStr} onChange={(e) => setCeilingStr(e.target.value)} onBlur={() => handleBlur("ceiling", ceilingStr, setCeilingStr)} placeholder="e.g. 9'" className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" aria-label="Ceiling height (ft/in)" />
          {errors.ceiling && <p className="text-xs text-red-600 dark:text-red-400">{errors.ceiling}</p>}
        </div>
        {!hasRendr && (
          <>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Sq Ft: {sqFtDisplay(effectiveLengthIn, effectiveWidthIn)}</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Perimeter: {perimeterDisplay(effectiveLengthIn, effectiveWidthIn)} LF</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Wall SF: {wallSfDisplay(effectiveLengthIn, effectiveWidthIn, effectiveCeilingHeightIn)}</span>
          </>
        )}
        {hasRendr && !isRendrActive && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Sq Ft: {sqFtDisplay(effectiveLengthIn, effectiveWidthIn)}</span>
        )}
        {saving && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>}
      </div>
      {/* Rendr row */}
      {hasRendr && (
        <>
          <div className="text-[10px] font-medium uppercase tracking-wider text-green-600 dark:text-green-400">
            Rendr (LiDAR)
          </div>
          <div className="flex flex-wrap items-center gap-3 gap-y-1">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-400 dark:text-zinc-500">Area</label>
              <div className="flex h-[30px] w-24 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {room.areaSqFt ? `${room.areaSqFt.toFixed(1)} SF` : "—"}
              </div>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-400 dark:text-zinc-500">Ceiling</label>
              <div className="flex h-[30px] w-24 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {room.rendrCeilingHeightFt ? `${room.rendrCeilingHeightFt} ft` : "—"}
              </div>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-400 dark:text-zinc-500">Perimeter</label>
              <div className="flex h-[30px] w-24 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {room.perimeterLF ? `${room.perimeterLF.toFixed(1)} LF` : "—"}
              </div>
            </div>
          </div>
          {/* Source selection */}
          <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name={`source-${room.id}`} checked={!isRendrActive} onChange={() => handleSourceToggle(false)} className="h-3.5 w-3.5 text-zinc-600" />
              Use Transcript/Manual
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name={`source-${room.id}`} checked={isRendrActive} onChange={() => handleSourceToggle(true)} className="h-3.5 w-3.5 text-green-600" />
              Use Rendr (LiDAR)
            </label>
          </div>
          {/* Metrics summary */}
          <div className="flex flex-wrap gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Sq Ft: {displaySqFt}</span>
            <span>Perimeter: {displayPerimeter} LF</span>
            <span>Wall SF: {displayWallSF}</span>
          </div>
        </>
      )}
    </div>
  );
}

type SubAreaEditorRow = {
  id: string | null;
  name: string;
  length: string;
  width: string;
  ceilingHeight: string;
  includeInArea: boolean;
};

function RoomSubAreasEditor({
  projectId,
  room,
  onSaved,
}: {
  projectId: string;
  room: Room;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<SubAreaEditorRow[]>(() => {
    const sorted = [...(room.subAreas ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return sorted.map((sa) => ({
      id: sa.id,
      name: sa.name ?? "",
      length: formatInchesToFeetInches(sa.lengthIn ?? null),
      width: formatInchesToFeetInches(sa.widthIn ?? null),
      ceilingHeight: formatInchesToFeetInches(sa.ceilingHeightIn ?? null),
      includeInArea: sa.includeInArea ?? true,
    }));
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sorted = [...(room.subAreas ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    setRows(
      sorted.map((sa) => ({
        id: sa.id,
        name: sa.name ?? "",
        length: formatInchesToFeetInches(sa.lengthIn ?? null),
        width: formatInchesToFeetInches(sa.widthIn ?? null),
        ceilingHeight: formatInchesToFeetInches(sa.ceilingHeightIn ?? null),
        includeInArea: sa.includeInArea ?? true,
      }))
    );
  }, [room.id, room.subAreas]);

  function updateRow(index: number, patch: Partial<SubAreaEditorRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: null, name: "", length: "", width: "", ceilingHeight: "", includeInArea: true },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    await updateRoomSubAreasAction(projectId, room.id, rows);
    setSaving(false);
    onSaved();
  }

  const overallSqFtPreview = (() => {
    const baseLen = room.lengthIn ?? null;
    const baseWid = room.widthIn ?? null;
    const base =
      baseLen != null && baseWid != null && baseLen > 0 && baseWid > 0
        ? (baseLen / 12) * (baseWid / 12)
        : room.areaSqFt ?? 0;
    const extra = rows
      .filter((r) => r.includeInArea)
      .map((r) => {
        const lenIn = effectiveInches(r.length, null);
        const widIn = effectiveInches(r.width, null);
        if (lenIn == null || widIn == null || lenIn <= 0 || widIn <= 0) return 0;
        return (lenIn / 12) * (widIn / 12);
      })
      .reduce((a, b) => a + b, 0);
    const total = base + extra;
    return total > 0 ? total : null;
  })();

  if (!rows.length) {
    return (
      <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-dashed border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Add sub-area
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      <div className="flex items-center justify-between">
        <div className="font-medium text-zinc-700 dark:text-zinc-300">
          Sub-areas
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Add
        </button>
      </div>
      <div className="space-y-1">
        {rows.map((row, index) => {
          const lenIn = effectiveInches(row.length, null);
          const widIn = effectiveInches(row.width, null);
          const ceilIn = effectiveInches(row.ceilingHeight, null);
          return (
            <div key={row.id ?? index} className="space-y-0.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    Area name
                  </label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    placeholder="e.g. Toilet room"
                    className="w-56 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    Length
                  </label>
                  <input
                    type="text"
                    value={row.length}
                    onChange={(e) => updateRow(index, { length: e.target.value })}
                    placeholder="L"
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    Width
                  </label>
                  <input
                    type="text"
                    value={row.width}
                    onChange={(e) => updateRow(index, { width: e.target.value })}
                    placeholder="W"
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    Ceiling
                  </label>
                  <input
                    type="text"
                    value={row.ceilingHeight}
                    onChange={(e) => updateRow(index, { ceilingHeight: e.target.value })}
                    placeholder="Ceiling"
                    className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.includeInArea}
                    onChange={(e) => updateRow(index, { includeInArea: e.target.checked })}
                    className="h-3 w-3 rounded border-zinc-300 dark:border-zinc-600"
                  />
                  Include in overall Sq Ft
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="ml-auto rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  Sq Ft: {sqFtDisplay(lenIn, widIn)}
                </span>
                <span>
                  Perimeter: {perimeterDisplay(lenIn, widIn)} LF
                </span>
                <span>
                  Wall SF: {wallSfDisplay(lenIn, widIn, ceilIn)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {saving && (
        <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Saving sub-areas…</div>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-1 rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save sub-areas
      </button>
    </div>
  );
}

export function RoomsTab({ projectId, projectStylePresetId: initialProjectStylePresetId, defaultCeilingHeightFt: initialCeilingHeight, rooms: initialRooms, projectQA, stylePresets, sectionTypes, roomTypeLowPct = DEFAULT_LOW_PCT, roomTypeHighPct = DEFAULT_HIGH_PCT, projectCopeStatus }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [rooms, setRooms] = useState<Room[]>(() =>
    [...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [projectStylePresetId, setProjectStylePresetId] = useState<string | null>(initialProjectStylePresetId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showUpdateScopesConfirm, setShowUpdateScopesConfirm] = useState(false);
  const [updateScopesSelectedIds, setUpdateScopesSelectedIds] = useState<Set<string>>(new Set());
  const [updatingScopeRoomId, setUpdatingScopeRoomId] = useState<string | null>(null);
  const [showRendrModal, setShowRendrModal] = useState(false);
  const [rendrRoomCount, setRendrRoomCount] = useState(0);
  const [includeRendr, setIncludeRendr] = useState(true);
  const [showBulkEstimateModal, setShowBulkEstimateModal] = useState(false);
  const [estimateRefreshKey, setEstimateRefreshKey] = useState(0);
  const [reviewingRoomId, setReviewingRoomId] = useState<string | null>(null);
  // Project-level review is now handled by the unified BulkReviewAndEstimateModal
  const [rewritingRoomId, setRewritingRoomId] = useState<string | null>(null);
  const [unmatchedRooms, setUnmatchedRooms] = useState<UnmatchedRoomItem[] | null>(null);
  const [activeRoomTypes, setActiveRoomTypes] = useState<RoomTypeOption[]>([]);
  const [updatingRoomTypeId, setUpdatingRoomTypeId] = useState<string | null>(null);
  const [updatingSectionTypeId, setUpdatingSectionTypeId] = useState<string | null>(null);
  const [updatingProjectStylePreset, setUpdatingProjectStylePreset] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [roomTemplates, setRoomTemplates] = useState<RoomTemplateOption[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string | null>>({});
  const [ceilingHeight, setCeilingHeight] = useState<number>(initialCeilingHeight);
  const [ceilingHeightSaved, setCeilingHeightSaved] = useState(false);

  useEffect(() => setMounted(true), []);

  // "Scroll to COPE section" — triggered by the banner's "Not now" dismissed
  // state link, which navigates to /admin/projects/{id}?tab=rooms&scrollToCope=1.
  // We scroll once the COPE card is in the DOM, then strip the param so
  // subsequent navigations don't re-scroll. `scrollIntoView` with `block: "start"`
  // puts the card at the top of the scroll container with a small offset via
  // the sticky admin header.
  useEffect(() => {
    if (searchParams?.get("scrollToCope") !== "1") return;
    const el = document.querySelector('[data-cope-room-card="true"]');
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Strip the query param so a subsequent tab-switch or link-click doesn't
    // re-fire the scroll. Using router.replace keeps history clean.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("scrollToCope");
    const qs = params.toString();
    router.replace(`/admin/projects/${projectId}${qs ? `?${qs}` : ""}`);
  }, [searchParams, router, projectId]);
  useEffect(() => {
    getRoomTypes().then((list) => {
      setActiveRoomTypes((list ?? []).filter((r) => r.active).map((r) => ({ id: r.id, name: r.name })));
    });
    // Fetch room templates
    fetch("/api/settings/templates/imported")
      .then((r) => r.json())
      .then((data) => {
        const templates: RoomTemplateOption[] = (data.templates ?? [])
          .filter((t: RoomTemplateOption) => t.active)
          .map((t: RoomTemplateOption) => ({ id: t.id, name: t.name, displayName: t.displayName, active: t.active }));
        setRoomTemplates(templates);
        // Use saved roomTemplateId if available, otherwise auto-match by name
        const matches: Record<string, string | null> = {};
        for (const room of initialRooms) {
          matches[room.id] = room.roomTemplateId ?? autoMatchTemplate(room.name, templates);
        }
        setSelectedTemplates((prev) => ({ ...matches, ...prev }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setRooms([...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initialRooms]);
  useEffect(() => {
    setProjectStylePresetId(initialProjectStylePresetId ?? null);
  }, [initialProjectStylePresetId]);

  // Phase 8C Bug 2: listen for background-job terminal transitions dispatched
  // by <EstimateJobProgressBanner />. Bumping `estimateRefreshKey` re-renders
  // every <AIEstimatePanel> with a new `refreshKey` prop, which triggers its
  // internal fetch of `/api/ai-estimate?…`. Without this, client-side panels
  // stay stuck on "No AI estimate yet" until a hard-reload because
  // `router.refresh()` only re-runs server components, not client state.
  useEffect(() => {
    function handleJobEvent(e: Event) {
      const ce = e as CustomEvent<{ projectId?: string }>;
      if (ce.detail?.projectId && ce.detail.projectId !== projectId) return;
      setEstimateRefreshKey((k) => k + 1);
    }
    window.addEventListener("hhi:estimate-job-terminal", handleJobEvent);
    window.addEventListener("hhi:cope-ready", handleJobEvent);
    return () => {
      window.removeEventListener("hhi:estimate-job-terminal", handleJobEvent);
      window.removeEventListener("hhi:cope-ready", handleJobEvent);
    };
  }, [projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this section? Associated media will be unlinked.")) return;
    try {
      const res = await deleteRoomAction(projectId, roomId);
      if (res?.error) {
        alert(res.error);
        return;
      }
    } catch {
      // Transport failure (e.g. dev-server restart / dropped connection) — the
      // server action never returned. Surface a friendly message instead of
      // crashing to the error overlay, and let the user refresh + retry. (The
      // delete may have completed server-side; the refresh below would show it.)
      alert(
        "Couldn't reach the server to delete the section. Please refresh the page and try again.",
      );
    }
    router.refresh();
  }

  function toggleSelected(roomId: string) {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId)
        ? prev.filter((id) => id !== roomId)
        : [...prev, roomId]
    );
  }

  async function handleGenerateFromTranscriptClick() {
    // Check if Rendr is available — show modal if so, otherwise generate directly
    try {
      const rendrCheck = await checkRendrAvailable(projectId);
      if (rendrCheck.hasRendr) {
        setRendrRoomCount(rendrCheck.roomCount);
        setIncludeRendr(true);
        setShowRendrModal(true);
        return;
      }
    } catch {
      // If check fails, proceed without Rendr
    }
    await doGenerateFromTranscript(false);
  }

  async function doGenerateFromTranscript(withRendr: boolean) {
    setShowRendrModal(false);
    setGenerating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await generateRoomsFromTranscriptAction(projectId, withRendr);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        const parts: string[] = [];
        if (result.updated > 0) parts.push(`Updated scope on ${result.updated} section(s)`);
        if (result.created > 0) parts.push(`created ${result.created} new section(s)`);
        if (result.skipped > 0) parts.push(`skipped ${result.skipped} duplicate(s)`);
        if (withRendr) parts.push("with Rendr measurements");
        setStatusMessage(parts.length > 0 ? parts.join(", ") + "." : "No changes made.");
        if (result.unmatchedRooms?.length) {
          setUnmatchedRooms(result.unmatchedRooms);
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteAll() {
    if (!rooms.length) return;
    if (
      !confirm(
        "Delete ALL sections in this project? This cannot be undone. Associated media will be unlinked.",
      )
    ) {
      return;
    }
    await deleteAllRoomsAction(projectId);
    router.refresh();
  }

  async function handleMergeSelected() {
    if (selectedRoomIds.length < 2 || merging) return;
    const ordered = rooms.filter((r) => selectedRoomIds.includes(r.id));
    if (!ordered.length) return;
    const defaultName = ordered[0]?.name ?? "Merged Section";
    const selectedNames = ordered.map((r) => r.name).join(", ");
    const confirmMessage =
      `Merge these ${ordered.length} sections into "${defaultName}"?\n\n` +
      `Sections: ${selectedNames}\n\n` +
      `This will:\n` +
      `  • Combine their scope narratives into one\n` +
      `  • Keep "${defaultName}" as the section name\n` +
      `  • Delete the other sections permanently\n\n` +
      `For proposal-only grouping, use the Investment tab instead. This action cannot be undone.`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    setMerging(true);
    setStatusMessage(null);
    try {
      const result = await mergeRoomsWithAiAction(
        projectId,
        selectedRoomIds,
        defaultName
      );
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        setSelectedRoomIds([]);
      }
      router.refresh();
    } finally {
      setMerging(false);
    }
  }

  function openUpdateScopesConfirm() {
    // Default selection: all non-overhead rooms checked.
    setUpdateScopesSelectedIds(
      new Set(rooms.filter((r) => !r.isProjectOverhead).map((r) => r.id)),
    );
    setShowUpdateScopesConfirm(true);
  }

  async function handleUpdateFromTranscriptConfirm() {
    setShowUpdateScopesConfirm(false);
    setUpdating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    const allNonOverheadIds = rooms.filter((r) => !r.isProjectOverhead).map((r) => r.id);
    const allSelected =
      updateScopesSelectedIds.size === allNonOverheadIds.length &&
      allNonOverheadIds.every((id) => updateScopesSelectedIds.has(id));
    // Only pass a filter when the selection is a strict subset of all rooms.
    // When everything is selected, omit the filter so the legacy behavior
    // (which can also create new sections from the transcript) is preserved.
    const targetIds = allSelected ? undefined : Array.from(updateScopesSelectedIds);
    try {
      const result = await updateRoomScopesFromTranscriptAction(projectId, targetIds);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        setStatusMessage(
          `Updated ${result.updated} sections. Added ${result.created} new. Skipped ${result.skipped}.`
        );
        if (result.unmatchedRooms?.length) {
          setUnmatchedRooms(result.unmatchedRooms);
        }
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdateRoomScopeFromTranscript(roomId: string) {
    setUpdatingScopeRoomId(roomId);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await updateRoomScopesFromTranscriptAction(projectId, [roomId]);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else if (result.updated === 0) {
        setStatusMessage(
          `No transcript content matched this section. Try the bulk Update scopes flow if the section name was renamed.`,
        );
      } else {
        setStatusMessage(`Section scope updated from transcript.`);
      }
    } finally {
      setUpdatingScopeRoomId(null);
    }
  }

  async function handleRewriteScope(roomId: string) {
    setRewritingRoomId(roomId);
    setStatusMessage(null);
    try {
      const result = await rewriteRoomScopeAction(projectId, roomId);
      router.refresh();
      if (result.error) setStatusMessage(result.error);
    } finally {
      setRewritingRoomId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rooms.findIndex((r) => r.id === active.id);
    const newIndex = rooms.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newRooms = arrayMove(rooms, oldIndex, newIndex);
    setRooms(newRooms);

    const orderedIds = newRooms.map((r) => r.id);
    await reorderRoomsAction(projectId, orderedIds);
    router.refresh();
  }

  async function handleRoomTypeChange(roomId: string, roomTypeId: string | null) {
    setUpdatingRoomTypeId(roomId);
    await updateRoomsRoomType([roomId], roomTypeId);
    router.refresh();
    setUpdatingRoomTypeId(null);
  }

  async function handleSectionTypeChange(roomId: string, sectionTypeId: string | null) {
    setUpdatingSectionTypeId(roomId);
    await updateRoomsSectionType([roomId], sectionTypeId);
    router.refresh();
    setUpdatingSectionTypeId(null);
  }

  async function handleProjectStylePresetChange(stylePresetId: string | null) {
    setUpdatingProjectStylePreset(true);
    const result = await updateProjectStylePresetAction(projectId, stylePresetId);
    if (!result.error) {
      setProjectStylePresetId(stylePresetId);
    }
    router.refresh();
    setUpdatingProjectStylePreset(false);
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <RoomForm
          projectId={projectId}
          sectionTypes={sectionTypes}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
          submitAction={createRoomAction}
        />
      ) : (
        <>
        <RetryFailedRoomsBar
          projectId={projectId}
          onRequeued={() => setEstimateRefreshKey((k) => k + 1)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Add section
          </button>
          <button
            type="button"
            onClick={handleGenerateFromTranscriptClick}
            disabled={generating || updating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {generating ? "Generating…" : rooms.some(r => !r.isProjectOverhead && r.origin === "IMPORTED" && r.measurementSource === "rendr") ? "Generate scope from transcript" : "Generate sections from transcript"}
          </button>
          <button
            type="button"
            onClick={openUpdateScopesConfirm}
            disabled={updating || generating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {updating ? "Updating…" : "Update scopes from transcript"}
          </button>
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={!rooms.length}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-zinc-800"
          >
            Delete all sections
          </button>
          <button
            type="button"
            onClick={handleMergeSelected}
            disabled={selectedRoomIds.length < 2 || merging}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {merging ? "Merging…" : "Merge selected"}
          </button>
          <button
            type="button"
            onClick={() => setShowBulkEstimateModal(true)}
            disabled={!rooms.length}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-brand-accent disabled:opacity-50" style={{ borderColor: "var(--brand-accent-spinner-track)", backgroundColor: "var(--brand-accent-lighter)" }}
          >
            Generate AI Estimates
          </button>
          <BudgetExportButton projectId={projectId} disabled={!rooms.length} />
          <span className="ml-2 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            Default Ceiling Height:
            <input
              type="number"
              min={6}
              max={20}
              step={0.5}
              value={ceilingHeight}
              onChange={(e) => setCeilingHeight(Number(e.target.value))}
              onBlur={async () => {
                const result = await updateProjectDefaultCeilingHeightAction(projectId, ceilingHeight);
                if (result.error) { alert(result.error); }
                else { setCeilingHeightSaved(true); setTimeout(() => setCeilingHeightSaved(false), 1500); }
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-[60px] rounded border border-zinc-300 px-1.5 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            />
            ft
            {ceilingHeightSaved && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
          </span>
          <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
            Style Preset (applies to all sections):
          </span>
          <select
            value={projectStylePresetId ?? ""}
            onChange={(e) => handleProjectStylePresetChange(e.target.value || null)}
            disabled={updatingProjectStylePreset}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label="Style Preset (applies to all sections)"
          >
            <option value="">Default (first active)</option>
            {stylePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {selectedRoomIds.length >= 2 && (
          <p className="text-xs italic text-zinc-500 dark:text-zinc-400 -mt-2">
            Merging combines sections structurally (one scope, one pricing profile).
            {" "}For proposal-only grouping, use the <strong>Investment tab</strong> instead.
          </p>
        )}
        </>
      )}
      {showRendrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rendr-generate-title"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="rendr-generate-title"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Generate Sections
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Rendr scan detected{rendrRoomCount > 0 ? ` with ${rendrRoomCount} rooms` : ""}.
            </p>
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeRendr}
                onChange={(e) => setIncludeRendr(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-500 dark:border-zinc-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">Include Rendr measurements</span>
                <br />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  The AI will use LiDAR room data (areas, ceiling heights, fixtures)
                  alongside the transcript for more accurate sections.
                </span>
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRendrModal(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doGenerateFromTranscript(includeRendr)}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
      {showUpdateScopesConfirm && (() => {
        const selectableRooms = rooms.filter((r) => !r.isProjectOverhead);
        const selectedCount = updateScopesSelectedIds.size;
        const allChecked = selectableRooms.length > 0 && selectableRooms.every((r) => updateScopesSelectedIds.has(r.id));
        const toggleRoom = (id: string) => {
          setUpdateScopesSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        };
        const toggleAll = () => {
          setUpdateScopesSelectedIds(allChecked ? new Set() : new Set(selectableRooms.map((r) => r.id)));
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-scopes-confirm-title"
          >
            <div className="flex w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
                <h2
                  id="update-scopes-confirm-title"
                  className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  Update scopes from transcript
                </h2>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Pick the sections to refresh. The AI re-reads the full transcript but only
                  rewrites the selected scopes.
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto p-4">
                {selectableRooms.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No sections to update.</p>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 pb-2 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                      Select all ({selectableRooms.length})
                    </label>
                    <div className="mt-2 space-y-1.5">
                      {selectableRooms.map((r) => (
                        <label
                          key={r.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <input
                            type="checkbox"
                            checked={updateScopesSelectedIds.has(r.id)}
                            onChange={() => toggleRoom(r.id)}
                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                          />
                          {r.name}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedCount} of {selectableRooms.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUpdateScopesConfirm(false)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateFromTranscriptConfirm}
                    disabled={selectedCount === 0}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Update {selectedCount}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {unmatchedRooms != null && unmatchedRooms.length > 0 && (
        <NewRoomTypesModal
          projectId={projectId}
          unmatchedRooms={unmatchedRooms}
          onClose={() => setUnmatchedRooms(null)}
        />
      )}
      {showBulkEstimateModal && (
        <BulkReviewAndEstimateModal
          projectId={projectId}
          rooms={rooms.filter((r) => !r.isProjectOverhead).map((r) => ({ id: r.id, name: r.name, scopeNarrative: r.scopeNarrative, scopeQA: r.scopeQA, isProjectOverhead: false, estimateStaleReason: r.estimateStaleReason ?? null, roomTemplateId: r.roomTemplateId ?? null }))}
          roomTemplates={roomTemplates}
          selectedTemplates={selectedTemplates}
          projectQA={projectQA}
          onClose={() => { setShowBulkEstimateModal(false); setEstimateRefreshKey((k) => k + 1); router.refresh(); }}
        />
      )}
      {statusMessage && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusMessage}
        </p>
      )}
      {/* COPE room card — always first, not sortable */}
      {rooms.filter((r) => r.isProjectOverhead).map((room) => (
        <CopeRoomCard
          key={room.id}
          projectId={projectId}
          room={room}
          roomTemplates={roomTemplates}
          selectedTemplateId={selectedTemplates[room.id] ?? null}
          onTemplateChange={(roomId, templateId) => { setSelectedTemplates((prev) => ({ ...prev, [roomId]: templateId })); updateRoomTemplateAction(projectId, roomId, templateId); }}
          estimateRefreshKey={estimateRefreshKey}
          otherRoomsHaveEstimates={rooms.some((r) => !r.isProjectOverhead && r.pricingTier === "AI_ESTIMATE")}
          projectCopeStatus={projectCopeStatus}
          onEstimateGenerated={() => { setEstimateRefreshKey((k) => k + 1); router.refresh(); }}
        />
      ))}
      {!mounted || editingId ? (
        <div className="space-y-2">
            {rooms.filter((r) => !r.isProjectOverhead).map((room) => (
            <StaticRoomCard
              key={room.id}
              projectId={projectId}
              room={room}
              activeRoomTypes={activeRoomTypes}
              sectionTypes={sectionTypes}
              roomTypeLowPct={roomTypeLowPct}
              roomTypeHighPct={roomTypeHighPct}
              updatingRoomTypeId={updatingRoomTypeId}
              updatingSectionTypeId={updatingSectionTypeId}
              selected={selectedRoomIds.includes(room.id)}
              onToggleSelected={() => toggleSelected(room.id)}
              onRoomTypeChange={handleRoomTypeChange}
              onSectionTypeChange={handleSectionTypeChange}
              onDimensionsSaved={() => router.refresh()}
              isEditing={editingId === room.id}
              isRewriting={rewritingRoomId === room.id}
              isUpdatingScope={updatingScopeRoomId === room.id}
              onEdit={() => setEditingId(room.id)}
              onDoneEdit={() => {
                setEditingId(null);
                router.refresh();
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(room.id)}
              onRewriteScope={() => handleRewriteScope(room.id)}
              onUpdateScopeFromTranscript={() => handleUpdateRoomScopeFromTranscript(room.id)}
              roomTemplates={roomTemplates}
              selectedTemplateId={selectedTemplates[room.id] ?? null}
              onTemplateChange={(roomId, templateId) => { setSelectedTemplates((prev) => ({ ...prev, [roomId]: templateId })); updateRoomTemplateAction(projectId, roomId, templateId); }}
              estimateRefreshKey={estimateRefreshKey}
              onReviewScope={() => setReviewingRoomId(room.id)}
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rooms.filter((r) => !r.isProjectOverhead).map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rooms.filter((r) => !r.isProjectOverhead).map((room) => (
                <SortableRoomCard
                  key={room.id}
                  projectId={projectId}
                  room={room}
                  activeRoomTypes={activeRoomTypes}
                  sectionTypes={sectionTypes}
                  roomTypeLowPct={roomTypeLowPct}
                  roomTypeHighPct={roomTypeHighPct}
                  updatingRoomTypeId={updatingRoomTypeId}
                  updatingSectionTypeId={updatingSectionTypeId}
                  selected={selectedRoomIds.includes(room.id)}
                  onToggleSelected={() => toggleSelected(room.id)}
                  onRoomTypeChange={handleRoomTypeChange}
                  onSectionTypeChange={handleSectionTypeChange}
                  onDimensionsSaved={() => router.refresh()}
                  isEditing={editingId === room.id}
                  isRewriting={rewritingRoomId === room.id}
                  isUpdatingScope={updatingScopeRoomId === room.id}
                  onEdit={() => setEditingId(room.id)}
                  onDoneEdit={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(room.id)}
                  onRewriteScope={() => handleRewriteScope(room.id)}
                  onUpdateScopeFromTranscript={() => handleUpdateRoomScopeFromTranscript(room.id)}
                  roomTemplates={roomTemplates}
                  selectedTemplateId={selectedTemplates[room.id] ?? null}
                  onTemplateChange={(roomId, templateId) => { setSelectedTemplates((prev) => ({ ...prev, [roomId]: templateId })); updateRoomTemplateAction(projectId, roomId, templateId); }}
                  estimateRefreshKey={estimateRefreshKey}
                  onReviewScope={() => setReviewingRoomId(room.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Scope Review Modal */}
      {reviewingRoomId && (
        <ScopeReviewModal
          roomId={reviewingRoomId}
          projectId={projectId}
          level="room"
          existingQA={rooms.find((r) => r.id === reviewingRoomId)?.scopeQA as { questions?: ReviewQuestion[] } | null}
          onComplete={() => {
            setReviewingRoomId(null);
            setEstimateRefreshKey((k) => k + 1);
            router.refresh();
          }}
          onClose={() => setReviewingRoomId(null)}
        />
      )}
      {/* Project-level review is now handled by the unified BulkReviewAndEstimateModal */}
    </div>
  );
}

function CopeRoomCard({
  projectId,
  room,
  roomTemplates,
  selectedTemplateId,
  onTemplateChange,
  estimateRefreshKey,
  otherRoomsHaveEstimates,
  projectCopeStatus,
  onEstimateGenerated,
}: {
  projectId: string;
  room: Room;
  roomTemplates: RoomTemplateOption[];
  selectedTemplateId: string | null;
  onTemplateChange: (roomId: string, templateId: string | null) => void;
  estimateRefreshKey?: number;
  otherRoomsHaveEstimates: boolean;
  projectCopeStatus: CopeStatus;
  onEstimateGenerated: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defensive: if the server-observed copeStatus reaches a terminal state
  // (READY / FAILED), clear the local `generating` flag. Belt-and-suspenders
  // for the rare case where the POST response is delayed or hangs but the
  // backend has already finished — the button label otherwise stays stuck
  // on "Generating…" even though the parent prop says otherwise.
  useEffect(() => {
    if (projectCopeStatus === "READY" || projectCopeStatus === "FAILED") {
      setGenerating(false);
    }
  }, [projectCopeStatus]);

  async function handleGenerateCope() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/cope-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onEstimateGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate COPE estimate");
    } finally {
      setGenerating(false);
    }
  }

  const copeTemplate = roomTemplates.find((t) => t.name.toLowerCase().includes("cope"));

  // Contextual button state. The `generating` flag captures the local click
  // in-flight window; once the server accepts, projectCopeStatus transitions
  // to GENERATING on the next parent refresh and the label matches. The
  // `!otherRoomsHaveEstimates` guard stays — COPE math aggregates over
  // upstream estimates, so there's nothing to compute from on a fresh project.
  const inFlight = generating || projectCopeStatus === "GENERATING";
  const copeButtonDisabled = inFlight || !otherRoomsHaveEstimates;
  const copeButtonTitle = !otherRoomsHaveEstimates
    ? "Generate room estimates first"
    : undefined;

  return (
    <div
      data-cope-room-card="true"
      className="mb-2 rounded-lg border border-slate-300 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
    >
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              PROJECT OVERHEAD
            </span>
          </div>
          <h3 className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
            {room.name}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {room.scopeNarrative || "—"}
          </p>
          {/* Room Template — locked to COPE */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Room Template:</span>
            <select
              value={copeTemplate?.id ?? selectedTemplateId ?? ""}
              disabled
              className="rounded border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs text-zinc-500 cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              aria-label="Room Template (locked)"
            >
              <option value={copeTemplate?.id ?? ""}>{copeTemplate?.displayName || copeTemplate?.name || "COPE"}</option>
            </select>
          </div>
          {/* COPE Estimate Button — contextual label via copeShortButtonLabel */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateCope}
              disabled={copeButtonDisabled}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium shadow-sm ${
                inFlight
                  ? "bg-amber-500 text-white cursor-wait"
                  : !otherRoomsHaveEstimates
                    ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                    : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
              title={copeButtonTitle}
            >
              {copeShortButtonLabel(projectCopeStatus, generating)}
            </button>
          </div>
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
          {/* Reuse the AI Estimate Panel for display */}
          {room.estimateStaleReason && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded mt-2">
              ⚠️ {room.estimateStaleReason}
            </div>
          )}
          <AIEstimatePanel
            projectId={projectId}
            roomId={room.id}
            roomName={room.name}
            scopeNarrative={room.scopeNarrative}
            squareFootage={null}
            selectedTemplateId={copeTemplate?.id ?? selectedTemplateId}
            templates={roomTemplates}
            refreshKey={estimateRefreshKey}
            estimateStaleReason={room.estimateStaleReason}
          />
        </div>
        <div className="shrink-0 flex flex-col gap-2 items-stretch">
          {/* No delete button — COPE is required */}
          <button
            type="button"
            disabled
            className="w-36 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-400 cursor-not-allowed"
            title="Required for every project"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function StaticRoomCard({
  projectId,
  room,
  activeRoomTypes,
  sectionTypes,
  roomTypeLowPct,
  roomTypeHighPct,
  updatingRoomTypeId,
  updatingSectionTypeId,
  selected,
  onToggleSelected,
  onRoomTypeChange,
  onSectionTypeChange,
  onDimensionsSaved,
  isEditing,
  isRewriting,
  isUpdatingScope,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
  onUpdateScopeFromTranscript,
  roomTemplates,
  selectedTemplateId,
  onTemplateChange,
  estimateRefreshKey,
  onReviewScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  sectionTypes: SectionTypeOption[];
  roomTypeLowPct: number;
  roomTypeHighPct: number;
  updatingRoomTypeId: string | null;
  updatingSectionTypeId: string | null;
  selected: boolean;
  onToggleSelected: () => void;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onSectionTypeChange: (roomId: string, sectionTypeId: string | null) => void;
  onDimensionsSaved: () => void;
  isEditing: boolean;
  isRewriting: boolean;
  isUpdatingScope: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
  onUpdateScopeFromTranscript: () => void;
  roomTemplates: RoomTemplateOption[];
  selectedTemplateId: string | null;
  onTemplateChange: (roomId: string, templateId: string | null) => void;
  estimateRefreshKey?: number;
  onReviewScope: () => void;
}) {
  const effectiveMode = getEffectiveMeasurementMode(room, (room.sectionType?.defaultMeasurementMode ?? null) as MeasurementMode | null);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {isEditing ? (
        <RoomForm
          projectId={projectId}
          room={room}
          sectionTypes={sectionTypes}
          onDone={onDoneEdit}
          onCancel={onCancelEdit}
          submitAction={updateRoomAction}
        />
      ) : (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
                aria-label="Select section"
              />
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                {room.name}
              </h3>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Section type:
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {room.sectionType?.name ?? "Unassigned"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Origin:
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {room.origin === "AI_TRANSCRIPT" ? "AI" : room.origin === "MANUAL" ? "Manual" : room.origin ?? "Manual"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Pricing Profile:
              </span>
              <select
                value={room.sectionTypeId ?? ""}
                onChange={(e) =>
                  onSectionTypeChange(room.id, e.target.value || null)
                }
                disabled={updatingSectionTypeId === room.id}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                aria-label="Pricing Profile"
              >
                <option value="">Custom</option>
                {sectionTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {formatPricingProfileLabel(st)}
                  </option>
                ))}
              </select>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Sq Ft: {(() => {
                  const sf = getCombinedSqFt(room);
                  return sf != null ? sf.toFixed(2) : "—";
                })()}
              </span>
              <MeasurementSourceBadge room={room} />
            </div>
            {/* Three-tier pricing selector */}
            <PricingTierSelector
              projectId={projectId}
              room={room}
              profileResult={getSectionPriceRangeDisplay(room, roomTypeLowPct, roomTypeHighPct)}
              refreshKey={estimateRefreshKey}
              onTierChanged={onDimensionsSaved}
            />
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {room.scopeNarrative || "—"}
            </p>
            <p
              className={
                room.scopeSource === "MANUAL"
                  ? "mt-1 text-xs text-green-600 dark:text-green-400"
                  : "mt-1 text-xs text-red-600 dark:text-red-400"
              }
            >
              {room.scopeSource === "MANUAL" ? "Manually updated" : "Updated by AI"}
              {room.scopeUpdatedAt != null && (
                <> · {formatScopeUpdatedAt(room.scopeUpdatedAt)}</>
              )}
            </p>
            {(effectiveMode === "DIMENSIONS" || effectiveMode === "AREA") && (
              <RoomDimensionsRow projectId={projectId} room={room} onSaved={onDimensionsSaved} />
            )}
            {effectiveMode === "COUNT" && (
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Quantity: {room.quantity ?? "—"}
              </div>
            )}
            <RoomSubAreasEditor projectId={projectId} room={room} onSaved={onDimensionsSaved} />
            <RendrDataGrid room={room} projectId={projectId} />
            {/* AI Estimate Panel — includes template selector + review button in header */}
            {room.estimateStaleReason && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded mt-2">
                ⚠️ {room.estimateStaleReason}
              </div>
            )}
            <AIEstimatePanel
              projectId={projectId}
              roomId={room.id}
              roomName={room.name}
              scopeNarrative={room.scopeNarrative}
              squareFootage={getCombinedSqFt(room)}
              selectedTemplateId={selectedTemplateId}
              templates={roomTemplates}
              refreshKey={estimateRefreshKey}
              estimateStaleReason={room.estimateStaleReason}
              onTemplateChange={(templateId) => onTemplateChange(room.id, templateId)}
              onReviewScope={onReviewScope}
              hasScopeQA={!!room.scopeQA}
            />
          </div>
          <div className="shrink-0 flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={onRewriteScope}
              disabled={isRewriting}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isRewriting ? "Rewriting…" : "Rewrite with AI"}
            </button>
            <button
              type="button"
              onClick={onUpdateScopeFromTranscript}
              disabled={isUpdatingScope}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isUpdatingScope ? "Updating…" : "Update from transcript"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-36 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-zinc-800"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableRoomCard({
  projectId,
  room,
  activeRoomTypes,
  sectionTypes,
  roomTypeLowPct,
  roomTypeHighPct,
  updatingRoomTypeId,
  updatingSectionTypeId,
  onRoomTypeChange,
  onSectionTypeChange,
  onDimensionsSaved,
  isEditing,
  isRewriting,
  isUpdatingScope,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
  onUpdateScopeFromTranscript,
  selected,
  onToggleSelected,
  roomTemplates,
  selectedTemplateId,
  onTemplateChange,
  estimateRefreshKey,
  onReviewScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  sectionTypes: SectionTypeOption[];
  roomTypeLowPct: number;
  roomTypeHighPct: number;
  updatingRoomTypeId: string | null;
  updatingSectionTypeId: string | null;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onSectionTypeChange: (roomId: string, sectionTypeId: string | null) => void;
  onDimensionsSaved: () => void;
  isEditing: boolean;
  isRewriting: boolean;
  isUpdatingScope: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
  onUpdateScopeFromTranscript: () => void;
  selected: boolean;
  onToggleSelected: () => void;
  roomTemplates: RoomTemplateOption[];
  selectedTemplateId: string | null;
  onTemplateChange: (roomId: string, templateId: string | null) => void;
  estimateRefreshKey?: number;
  onReviewScope: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: "move" as const,
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
    opacity: isDragging ? 0.98 : 1,
    userSelect: isDragging ? ("none" as const) : undefined,
  };

  const effectiveMode = getEffectiveMeasurementMode(room, (room.sectionType?.defaultMeasurementMode ?? null) as MeasurementMode | null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {isEditing ? (
        <RoomForm
          projectId={projectId}
          room={room}
          sectionTypes={sectionTypes}
          onDone={onDoneEdit}
          onCancel={onCancelEdit}
          submitAction={updateRoomAction}
        />
      ) : (
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <button
              type="button"
              className="mt-0.5 shrink-0 flex cursor-move select-none text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              {...attributes}
              {...listeners}
            >
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={onToggleSelected}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
                  aria-label="Select section"
                />
                <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                  {room.name}
                </h3>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Section type:
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {room.sectionType?.name ?? "Unassigned"}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Origin:
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {room.origin === "AI_TRANSCRIPT" ? "AI" : room.origin === "MANUAL" ? "Manual" : room.origin ?? "Manual"}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Pricing Profile:
                </span>
                <select
                  value={room.sectionTypeId ?? ""}
                  onChange={(e) =>
                    onSectionTypeChange(room.id, e.target.value || null)
                  }
                  disabled={updatingSectionTypeId === room.id}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Pricing Profile"
                >
                  <option value="">Custom</option>
                  {sectionTypes.map((st) => (
                    <option key={st.id} value={st.id}>
                      {formatPricingProfileLabel(st)}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Sq Ft: {(() => {
                    const sf = getCombinedSqFt(room);
                    return sf != null ? sf.toFixed(2) : "—";
                  })()}
                </span>
                <MeasurementSourceBadge room={room} />
              </div>
              {/* Three-tier pricing selector */}
              <PricingTierSelector
                projectId={projectId}
                room={room}
                profileResult={getSectionPriceRangeDisplay(room, roomTypeLowPct, roomTypeHighPct)}
                refreshKey={estimateRefreshKey}
                onTierChanged={onDimensionsSaved}
              />
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                {room.scopeNarrative || "—"}
              </p>
              <p
                className={
                  room.scopeSource === "MANUAL"
                    ? "mt-1 text-xs text-green-600 dark:text-green-400"
                    : "mt-1 text-xs text-red-600 dark:text-red-400"
                }
              >
                {room.scopeSource === "MANUAL" ? "Manually updated" : "Updated by AI"}
                {room.scopeUpdatedAt != null && (
                  <> · {formatScopeUpdatedAt(room.scopeUpdatedAt)}</>
                )}
              </p>
              {(effectiveMode === "DIMENSIONS" || effectiveMode === "AREA") && (
                <RoomDimensionsRow projectId={projectId} room={room} onSaved={onDimensionsSaved} />
              )}
              {effectiveMode === "COUNT" && (
                <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Quantity: {room.quantity ?? "—"}
                </div>
              )}
              <RoomSubAreasEditor projectId={projectId} room={room} onSaved={onDimensionsSaved} />
              <RendrDataGrid room={room} projectId={projectId} />
              {/* AI Estimate Panel — includes template selector + review button in header */}
              {room.estimateStaleReason && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1.5 rounded mt-2">
                  ⚠️ {room.estimateStaleReason}
                </div>
              )}
              <AIEstimatePanel
                projectId={projectId}
                roomId={room.id}
                roomName={room.name}
                scopeNarrative={room.scopeNarrative}
                squareFootage={getCombinedSqFt(room)}
                selectedTemplateId={selectedTemplateId}
                templates={roomTemplates}
                refreshKey={estimateRefreshKey}
                estimateStaleReason={room.estimateStaleReason}
                onTemplateChange={(templateId) => onTemplateChange(room.id, templateId)}
                onReviewScope={onReviewScope}
                hasScopeQA={!!room.scopeQA}
              />
            </div>
          </div>
          <div className="shrink-0 flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={onRewriteScope}
              disabled={isRewriting}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isRewriting ? "Rewriting…" : "Rewrite with AI"}
            </button>
            <button
              type="button"
              onClick={onUpdateScopeFromTranscript}
              disabled={isUpdatingScope}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isUpdatingScope ? "Updating…" : "Update from transcript"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-36 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-zinc-800"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const MEASUREMENT_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "USE_TYPE_DEFAULT", label: "Use Type Default" },
  { value: "NONE", label: "None" },
  { value: "DIMENSIONS", label: "Dimensions" },
  { value: "AREA", label: "Area" },
  { value: "COUNT", label: "Count" },
];

const ESTIMATE_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "USE_TYPE_DEFAULT", label: "Use Type Default" },
  { value: "SF", label: "SF (sq ft)" },
  { value: "LF", label: "LF (linear ft)" },
  { value: "EA", label: "EA (each)" },
  { value: "SQ", label: "SQ (roof squares)" },
  { value: "HR", label: "HR (hours)" },
  { value: "DAY", label: "DAY (days)" },
  { value: "ROOM", label: "ROOM" },
  { value: "UNIT", label: "UNIT" },
  { value: "GAL", label: "GAL (gallons)" },
  { value: "CUSTOM", label: "Custom" },
];

function RoomForm({
  projectId,
  room,
  sectionTypes,
  onDone,
  onCancel,
  submitAction,
}: {
  projectId: string;
  room?: Room;
  sectionTypes: SectionTypeOption[];
  onDone: () => void;
  onCancel: () => void;
  submitAction: typeof createRoomAction | typeof updateRoomAction;
}) {
  const router = useRouter();
  const [name, setName] = useState(room?.name ?? "");
  const [scopeNarrative, setScopeNarrative] = useState(room?.scopeNarrative ?? "");
  const [sectionTypeId, setSectionTypeId] = useState(room?.sectionTypeId ?? "");
  const [origin, setOrigin] = useState(room?.origin ?? "MANUAL");
  const [estPricePerSqFt, setEstPricePerSqFt] = useState<string>(
    room?.estPricePerSqFt != null ? String(room.estPricePerSqFt) : ""
  );
  const [measurementModeOverride, setMeasurementModeOverride] = useState<string>(
    room?.measurementMode != null ? room.measurementMode : "USE_TYPE_DEFAULT"
  );
  const [areaSqFt, setAreaSqFt] = useState<string>(room?.areaSqFt != null ? String(room.areaSqFt) : "");
  const [quantity, setQuantity] = useState<string>(room?.quantity != null ? String(room.quantity) : "1");
  const [estimateUnitOverride, setEstimateUnitOverride] = useState<string>(
    room?.estimateUnit != null ? room.estimateUnit : "USE_TYPE_DEFAULT"
  );
  const [customUnitLabel, setCustomUnitLabel] = useState(room?.customUnitLabel ?? "");
  const [unitQuantityManualOverride, setUnitQuantityManualOverride] = useState(room?.unitQuantityManualOverride ?? false);
  const [unitQuantityOverride, setUnitQuantityOverride] = useState(room?.unitQuantity != null ? String(room.unitQuantity) : "");
  const [lengthStr, setLengthStr] = useState(() =>
    room ? formatInchesToFeetInches(room.lengthIn ?? null) : ""
  );
  const [widthStr, setWidthStr] = useState(() =>
    room ? formatInchesToFeetInches(room.widthIn ?? null) : ""
  );
  const [ceilingStr, setCeilingStr] = useState(() =>
    room ? formatInchesToFeetInches(room.ceilingHeightIn ?? null) : ""
  );
  const [bucketOverride, setBucketOverride] = useState<"BASE" | "ALTERNATE" | "ALLOWANCE">(room?.bucket ?? "BASE");
  const [unitRateLowStr, setUnitRateLowStr] = useState(room?.unitRateLow != null ? String(room.unitRateLow) : "");
  const [unitRateTargetStr, setUnitRateTargetStr] = useState(room?.unitRateTarget != null ? String(room.unitRateTarget) : "");
  const [unitRateHighStr, setUnitRateHighStr] = useState(room?.unitRateHigh != null ? String(room.unitRateHigh) : "");
  const [dimensionError, setDimensionError] = useState<string | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  type SubAreaFormRow = {
    id: string | null;
    name: string;
    length: string;
    width: string;
    ceilingHeight: string;
  };

  // Sub-areas are now managed on the main Sections page, not in this Edit form.

  const effectiveMode: MeasurementMode = (() => {
    if (measurementModeOverride && measurementModeOverride !== "USE_TYPE_DEFAULT") return measurementModeOverride as MeasurementMode;
    const def = room?.sectionType?.defaultMeasurementMode;
    return (def ?? "NONE") as MeasurementMode;
  })();
  const effectiveUnit: EstimateUnit | null = (() => {
    if (estimateUnitOverride && estimateUnitOverride !== "USE_TYPE_DEFAULT") return estimateUnitOverride as EstimateUnit;
    const def = room?.sectionType?.defaultEstimateUnit;
    return (def ?? "SF") as EstimateUnit;
  })();
  const computedArea = (() => {
    const len = effectiveInches(lengthStr, room?.lengthIn ?? null);
    const wid = effectiveInches(widthStr, room?.widthIn ?? null);
    if (len == null || wid == null) return null;
    return (len / 12) * (wid / 12);
  })();
  const computedUnitQty = (() => {
    if (effectiveMode === "DIMENSIONS" && computedArea != null) return computedArea;
    if (effectiveMode === "AREA") {
      const a = areaSqFt.trim() === "" ? null : Number(areaSqFt);
      return a != null && !Number.isNaN(a) ? a : null;
    }
    if (effectiveMode === "COUNT") {
      const q = quantity.trim() === "" ? null : parseInt(quantity, 10);
      return q != null && !Number.isNaN(q) ? q : null;
    }
    return null;
  })();
  const displayUnitQty = unitQuantityManualOverride && unitQuantityOverride.trim() !== "" && !Number.isNaN(Number(unitQuantityOverride))
    ? Number(unitQuantityOverride)
    : computedUnitQty;

  /** Suggested default: target → low → high (display-only; used for "Use default" button when room.estPricePerSqFt is null). */
  const suggestedDefault =
    room?.roomType != null
      ? room.roomType.pricePerSqFtTarget ?? room.roomType.pricePerSqFtLow ?? room.roomType.pricePerSqFtHigh ?? null
      : null;

  function buildFormData(includePrice: boolean, dimensionStrings?: { length: string; width: string; ceiling: string }) {
    const formData = new FormData();
    formData.set("name", name);
    formData.set("scopeNarrative", scopeNarrative);
    if (!room) {
      formData.set("sectionTypeId", sectionTypeId.trim() || "");
    }
    if (room) {
      formData.set("sectionTypeId", sectionTypeId.trim() || "");
      formData.set("origin", origin);
      formData.set("bucket", bucketOverride);
      formData.set("measurementMode", measurementModeOverride === "USE_TYPE_DEFAULT" ? "" : measurementModeOverride);
      formData.set("areaSqFt", areaSqFt.trim());
      formData.set("quantity", quantity.trim());
      formData.set("estimateUnit", estimateUnitOverride === "USE_TYPE_DEFAULT" ? "" : estimateUnitOverride);
      formData.set("customUnitLabel", customUnitLabel.trim());
      formData.set("unitQuantityManualOverride", unitQuantityManualOverride ? "true" : "false");
      formData.set("unitQuantityOverride", unitQuantityOverride.trim());
      if (unitRateLowStr.trim() !== "") formData.set("unitRateLow", unitRateLowStr.trim());
      if (unitRateTargetStr.trim() !== "") formData.set("unitRateTarget", unitRateTargetStr.trim());
      if (unitRateHighStr.trim() !== "") formData.set("unitRateHigh", unitRateHighStr.trim());
    }
    if (includePrice && room) {
      const trimmed = estPricePerSqFt.trim();
      formData.set("estPricePerSqFt", trimmed === "" ? "" : trimmed);
    }
    if (room && dimensionStrings) {
      formData.set("lengthIn", dimensionStrings.length);
      formData.set("widthIn", dimensionStrings.width);
      formData.set("ceilingHeightIn", dimensionStrings.ceiling);
    }
    return formData;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDimensionError(null);
    if (room) {
      const len = lengthStr.trim();
      const wid = widthStr.trim();
      const cel = ceilingStr.trim();
      for (const [label, raw] of [
        ["Length", len],
        ["Width", wid],
        ["Ceiling height", cel],
      ] as const) {
        if (raw) {
          const parsed = parseFeetInchesToInches(raw);
          if (parsed.error) {
            setDimensionError(`${label}: ${parsed.error}`);
            return;
          }
        }
      }
      const formData = buildFormData(true, { length: lengthStr, width: widthStr, ceiling: ceilingStr });
      await (submitAction as typeof updateRoomAction)(projectId, room.id, formData);
    } else {
      const formData = buildFormData(false);
      await (submitAction as typeof createRoomAction)(projectId, formData);
    }
    onDone();
  }

  async function savePriceOnBlur() {
    if (!room) return;
    const trimmed = estPricePerSqFt.trim();
    const parsed = trimmed === "" ? null : (Number(trimmed) || null);
    if (parsed !== null && parsed <= 0) return;
    if (parsed === (room.estPricePerSqFt ?? null)) return;
    setSavingPrice(true);
    const formData = buildFormData(true, { length: lengthStr, width: widthStr, ceiling: ceilingStr });
    await (submitAction as typeof updateRoomAction)(projectId, room.id, formData);
    setSavingPrice(false);
    router.refresh();
  }

  function handleBlurPrice() {
    const trimmed = estPricePerSqFt.trim();
    const num = trimmed === "" ? null : Number(trimmed);
    if (num != null && !Number.isNaN(num) && num >= 0) {
      setEstPricePerSqFt(num.toFixed(2));
    }
    if (room) savePriceOnBlur();
  }

  /** Only sets input (and thus FormData on next submit); does not auto-save. Shown only when room.estPricePerSqFt is null. */
  function handleUseDefault() {
    if (suggestedDefault == null) return;
    setEstPricePerSqFt(String(suggestedDefault));
  }

  const hasPrice = estPricePerSqFt.trim() !== "" && !Number.isNaN(Number(estPricePerSqFt.trim()));
  const displayPriceNum = hasPrice ? Number(estPricePerSqFt.trim()) : null;
  const showSuggestion = !!room?.roomTypeId && suggestedDefault != null && room?.estPricePerSqFt == null;
  const showUseDefaultButton = !!room && room.estPricePerSqFt == null && suggestedDefault != null;
  const showOverrideNote = !!room?.roomTypeId && hasPrice && suggestedDefault != null;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Section name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kitchen, Primary Bath"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Section type
        </label>
        <select
          value={sectionTypeId}
          onChange={(e) => setSectionTypeId(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label="Section type"
        >
          <option value="">Unassigned</option>
          {sectionTypes.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </div>
      {room && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Origin
          </label>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Origin"
          >
            <option value="MANUAL">Manual</option>
            <option value="AI_TRANSCRIPT">AI</option>
            <option value="TEMPLATE">Template</option>
            <option value="IMPORTED">Imported</option>
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Price per Sq Ft
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={estPricePerSqFt}
            onChange={(e) => setEstPricePerSqFt(e.target.value)}
            onBlur={handleBlurPrice}
            placeholder="Optional"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {displayPriceNum != null && (
            <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400" aria-hidden>
              {CURRENCY_FMT.format(displayPriceNum)}
            </span>
          )}
        </div>
        {savingPrice && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Saving…</p>
        )}
        {showSuggestion && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Suggested from Pricing Profile: {CURRENCY_FMT.format(suggestedDefault!)}
            {showUseDefaultButton && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={handleUseDefault}
                  className="text-zinc-700 underline hover:no-underline dark:text-zinc-300"
                >
                  Use default from Pricing Profile
                </button>
              </>
            )}
          </p>
        )}
        {showOverrideNote && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Override from default</p>
        )}
      </div>
      {room && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Override measurement mode
            </label>
            <select
              value={measurementModeOverride}
              onChange={(e) => setMeasurementModeOverride(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              aria-label="Measurement mode"
            >
              {MEASUREMENT_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {effectiveMode !== "NONE" && (
            <>
              {effectiveMode === "DIMENSIONS" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Dimensions (Length × Width; optional Height)
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Length
              </label>
              <input
                type="text"
                value={lengthStr}
                onChange={(e) => setLengthStr(e.target.value)}
                onBlur={() => {
                  const t = lengthStr.trim();
                  if (!t) return;
                  const p = parseFeetInchesToInches(t);
                  if (!p.error) setLengthStr(formatInchesToFeetInches(p.inches));
                }}
                placeholder="e.g. 12' 6&quot;"
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Width
              </label>
              <input
                type="text"
                value={widthStr}
                onChange={(e) => setWidthStr(e.target.value)}
                onBlur={() => {
                  const t = widthStr.trim();
                  if (!t) return;
                  const p = parseFeetInchesToInches(t);
                  if (!p.error) setWidthStr(formatInchesToFeetInches(p.inches));
                }}
                placeholder="e.g. 12' 6&quot;"
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Ceiling
              </label>
              <input
                type="text"
                value={ceilingStr}
                onChange={(e) => setCeilingStr(e.target.value)}
                onBlur={() => {
                  const t = ceilingStr.trim();
                  if (!t) return;
                  const p = parseFeetInchesToInches(t);
                  if (!p.error) setCeilingStr(formatInchesToFeetInches(p.inches));
                }}
                placeholder="e.g. 9'"
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <span className="self-center text-sm text-zinc-500 dark:text-zinc-400">
              Sq Ft: {sqFtDisplay(
                effectiveInches(lengthStr, room.lengthIn),
                effectiveInches(widthStr, room.widthIn),
                room.measurementSource === "rendr" ? undefined : room.areaSqFt,
              )}
            </span>
            <span className="self-center text-sm text-zinc-500 dark:text-zinc-400">
              Perimeter: {perimeterDisplay(
                effectiveInches(lengthStr, room.lengthIn),
                effectiveInches(widthStr, room.widthIn),
                room.perimeterLF,
              )} LF
            </span>
            <span className="self-center text-sm text-zinc-500 dark:text-zinc-400">
              Wall SF: {wallSfDisplay(
                effectiveInches(lengthStr, room.lengthIn),
                effectiveInches(widthStr, room.widthIn),
                effectiveInches(ceilingStr, room.ceilingHeightIn),
                room.wallsSF,
              )}
            </span>
          </div>
          {/* Rendr reference data */}
          {room && (room.wallsSF != null || room.rendrCeilingHeightFt != null) && (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-green-600 dark:text-green-400">Rendr ref:</span>
              {room.areaSqFt != null && <span>Area: {room.areaSqFt.toFixed(1)} SF</span>}
              {room.rendrCeilingHeightFt != null && <span>Ceiling: {room.rendrCeilingHeightFt.toFixed(1)} ft</span>}
              {room.perimeterLF != null && <span>Perimeter: {room.perimeterLF.toFixed(1)} LF</span>}
              {room.wallsSF != null && <span>Wall SF: {room.wallsSF.toFixed(1)}</span>}
            </div>
          )}
          {dimensionError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{dimensionError}</p>
          )}
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Area (read-only): {computedArea != null ? computedArea.toFixed(2) : "—"} sq ft
          </p>
                </div>
              )}
              {effectiveMode === "AREA" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Area (Sq Ft)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={areaSqFt}
                    onChange={(e) => setAreaSqFt(e.target.value)}
                    className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    aria-label="Area sq ft"
                  />
                </div>
              )}
              {effectiveMode === "COUNT" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    aria-label="Quantity"
                  />
                </div>
              )}
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Estimate unit
            </label>
            <select
              value={estimateUnitOverride}
              onChange={(e) => setEstimateUnitOverride(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              aria-label="Estimate unit"
            >
              {ESTIMATE_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {effectiveUnit !== "CUSTOM" && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Unit label: {getEstimateUnitLabel(effectiveUnit, null)}
              </p>
            )}
            {effectiveUnit === "CUSTOM" && (
              <div className="mt-2">
                <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Custom unit label
                </label>
                <input
                  type="text"
                  value={customUnitLabel}
                  onChange={(e) => setCustomUnitLabel(e.target.value)}
                  placeholder={room?.sectionType?.customUnitLabel ?? "e.g. set"}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Unit quantity: {displayUnitQty != null ? displayUnitQty.toFixed(2) : "—"}
              </span>
              <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={unitQuantityManualOverride}
                  onChange={(e) => setUnitQuantityManualOverride(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                Override
              </label>
              {unitQuantityManualOverride && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitQuantityOverride}
                  onChange={(e) => setUnitQuantityOverride(e.target.value)}
                  placeholder="Override value"
                  className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  aria-label="Unit quantity override"
                />
              )}
            </div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              {advancedOpen ? "▼ Advanced" : "▶ Advanced"}
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Unit rate Low ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitRateLowStr}
                      onChange={(e) => setUnitRateLowStr(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Unit rate Target ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitRateTargetStr}
                      onChange={(e) => setUnitRateTargetStr(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Unit rate High ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitRateHighStr}
                      onChange={(e) => setUnitRateHighStr(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Override unit rates (leave blank to use Pricing Profile defaults for AREA).
                </p>
              </div>
            )}
          </div>
        </>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Scope narrative (paragraph)
        </label>
        <textarea
          value={scopeNarrative}
          onChange={(e) => setScopeNarrative(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {room ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
          Cancel
        </button>
      </div>
    </form>
  );
}

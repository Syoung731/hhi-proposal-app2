"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnmatchedRoomItem } from "./actions";
import {
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
  reorderRoomsAction,
  generateRoomsFromTranscriptAction,
  updateRoomScopesFromTranscriptAction,
  rewriteRoomScopeAction,
  updateRoomsRoomType,
} from "./actions";
import { updateProjectStylePresetAction } from "../overview/actions";
import { getRoomTypes } from "@/app/admin/settings/actions";
import { NewRoomTypesModal } from "./new-room-types-modal";
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

/**
 * Compute what to show in the blue price range pill for a section card.
 * - Pricing Profile = RoomType: use profile $/SF × section sqft; if no sqft → need dimensions.
 * - Custom: use section totalLow/totalTarget/totalHigh; if only one number → target; else try sectionType × driver.
 */
function getSectionPriceRangeDisplay(room: Room): SectionPriceRangeResult {
  const rt = room.roomType;
  const st = room.sectionType;

  // Pricing Profile = RoomType ($/SF)
  if (room.roomTypeId && rt) {
    const sqFt = getSqFt(room);
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

  // Custom: use section's stored totals first
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

  // Custom with no totals: try SectionType profile × quantity driver
  if (room.sectionTypeId && st && st.pricingBasis && st.pricingBasis !== "NONE") {
    const basis = st.pricingBasis;
    const pl = st.priceLow ?? st.priceTarget ?? st.priceHigh ?? null;
    const ph = st.priceHigh ?? st.priceTarget ?? st.priceLow ?? null;
    if (pl == null && ph == null) return null;

    const defaultMode = (st.defaultMeasurementMode ?? null) as MeasurementMode | null;
    let multiplier: number | null = null;
    if (basis === "PER_SF") {
      multiplier = getSqFt(room) ?? computeUnitQuantity(room, defaultMode);
      if (multiplier == null) {
        return {
          kind: "needDimensions",
          tooltip: `Pricing Profile: ${st.name} ($/SF) — set dimensions to estimate`,
        };
      }
    } else if (basis === "PER_EACH") {
      multiplier = room.quantity ?? room.unitQuantity ?? (computeUnitQuantity(room, defaultMode) ?? null);
      if (multiplier == null) {
        return {
          kind: "needDimensions",
          tooltip: `Pricing Profile: ${st.name} ($/EA) — set quantity to estimate`,
        };
      }
    } else if (basis === "PER_JOB") {
      multiplier = 1;
    }
    if (multiplier == null) return null;

    const low = Math.floor((pl ?? ph!) * multiplier);
    const high = Math.ceil((ph ?? pl!) * multiplier);
    const unitLabel = basis === "PER_SF" ? "SF" : basis === "PER_EACH" ? "EA" : "Job";
    const tooltip = `Pricing Profile: ${st.name} ($${unitLabel}) × ${multiplier}${basis === "PER_SF" ? " SF" : basis === "PER_EACH" ? " EA" : ""}`.trim();
    if (low === high) return { kind: "target", value: low, tooltip };
    return { kind: "range", low, high, tooltip };
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
  totalLow?: number | null;
  totalTarget?: number | null;
  totalHigh?: number | null;
  unitRateLow?: number | null;
  unitRateTarget?: number | null;
  unitRateHigh?: number | null;
};

type RoomTypeOption = { id: string; name: string };
type StylePresetOption = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string; defaultMeasurementMode: string; defaultEstimateUnit: string; customUnitLabel: string | null };

type Props = {
  projectId: string;
  projectStylePresetId: string | null;
  rooms: Room[];
  stylePresets: StylePresetOption[];
  sectionTypes: SectionTypeOption[];
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

/** Sq Ft = (lengthIn/12)*(widthIn/12), 1 decimal; "—" if either missing. */
function sqFtDisplay(lengthIn: number | null | undefined, widthIn: number | null | undefined): string {
  if (lengthIn == null || widthIn == null) return "—";
  const sqFt = (lengthIn / 12) * (widthIn / 12);
  return sqFt.toFixed(1);
}

/** Perimeter (linear ft) = 2 * ((lengthIn/12) + (widthIn/12)); "—" if length or width missing. */
function perimeterDisplay(lengthIn: number | null | undefined, widthIn: number | null | undefined): string {
  if (lengthIn == null || widthIn == null) return "—";
  const perimeterFt = 2 * (lengthIn / 12 + widthIn / 12);
  return perimeterFt.toFixed(1);
}

/** Wall SF = perimeterFt * (ceilingHeightIn/12); "—" if length, width, or ceiling missing. */
function wallSfDisplay(
  lengthIn: number | null | undefined,
  widthIn: number | null | undefined,
  ceilingHeightIn: number | null | undefined
): string {
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
      setSaving(true);
      await updateRoomAction(projectId, room.id, formData);
      setSaving(false);
      onSaved();
    },
    [projectId, room.id, room.name, room.scopeNarrative, room.estPricePerSqFt, onSaved]
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

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-3 gap-y-1">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Length
          </label>
          <input
            type="text"
            value={lengthStr}
            onChange={(e) => setLengthStr(e.target.value)}
            onBlur={() => handleBlur("length", lengthStr, setLengthStr)}
            placeholder="e.g. 12' 6&quot;"
            className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Length (ft/in)"
          />
          {errors.length && <p className="text-xs text-red-600 dark:text-red-400">{errors.length}</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Width
          </label>
          <input
            type="text"
            value={widthStr}
            onChange={(e) => setWidthStr(e.target.value)}
            onBlur={() => handleBlur("width", widthStr, setWidthStr)}
            placeholder="e.g. 12' 6&quot;"
            className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Width (ft/in)"
          />
          {errors.width && <p className="text-xs text-red-600 dark:text-red-400">{errors.width}</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Ceiling
          </label>
          <input
            type="text"
            value={ceilingStr}
            onChange={(e) => setCeilingStr(e.target.value)}
            onBlur={() => handleBlur("ceiling", ceilingStr, setCeilingStr)}
            placeholder="e.g. 9'"
            className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Ceiling height (ft/in)"
          />
          {errors.ceiling && <p className="text-xs text-red-600 dark:text-red-400">{errors.ceiling}</p>}
        </div>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Sq Ft: {sqFtDisplay(effectiveLengthIn, effectiveWidthIn)}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Perimeter: {perimeterDisplay(effectiveLengthIn, effectiveWidthIn)} LF
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Wall SF: {wallSfDisplay(effectiveLengthIn, effectiveWidthIn, effectiveCeilingHeightIn)}
        </span>
        {saving && <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>}
      </div>
    </div>
  );
}

export function RoomsTab({ projectId, projectStylePresetId: initialProjectStylePresetId, rooms: initialRooms, stylePresets, sectionTypes }: Props) {
  const router = useRouter();
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
  const [rewritingRoomId, setRewritingRoomId] = useState<string | null>(null);
  const [unmatchedRooms, setUnmatchedRooms] = useState<UnmatchedRoomItem[] | null>(null);
  const [activeRoomTypes, setActiveRoomTypes] = useState<RoomTypeOption[]>([]);
  const [updatingRoomTypeId, setUpdatingRoomTypeId] = useState<string | null>(null);
  const [updatingProjectStylePreset, setUpdatingProjectStylePreset] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    getRoomTypes().then((list) => {
      setActiveRoomTypes((list ?? []).filter((r) => r.active).map((r) => ({ id: r.id, name: r.name })));
    });
  }, []);
  useEffect(() => {
    setRooms([...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initialRooms]);
  useEffect(() => {
    setProjectStylePresetId(initialProjectStylePresetId ?? null);
  }, [initialProjectStylePresetId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this section? Associated media will be unlinked.")) return;
    await deleteRoomAction(projectId, roomId);
    router.refresh();
  }

  async function handleGenerateFromTranscript() {
    setGenerating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await generateRoomsFromTranscriptAction(projectId);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        setStatusMessage(
          `Generated ${result.created} sections. Skipped ${result.skipped} duplicates.`
        );
        if (result.unmatchedRooms?.length) {
          setUnmatchedRooms(result.unmatchedRooms);
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  function openUpdateScopesConfirm() {
    setShowUpdateScopesConfirm(true);
  }

  async function handleUpdateFromTranscriptConfirm() {
    setShowUpdateScopesConfirm(false);
    setUpdating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await updateRoomScopesFromTranscriptAction(projectId);
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
            onClick={handleGenerateFromTranscript}
            disabled={generating || updating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {generating ? "Generating…" : "Generate sections from transcript"}
          </button>
          <button
            type="button"
            onClick={openUpdateScopesConfirm}
            disabled={updating || generating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {updating ? "Updating…" : "Update scopes from transcript"}
          </button>
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
      )}
      {showUpdateScopesConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-scopes-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="update-scopes-confirm-title"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Update scopes from transcript
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will overwrite scope paragraphs for existing sections. Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
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
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {unmatchedRooms != null && unmatchedRooms.length > 0 && (
        <NewRoomTypesModal
          projectId={projectId}
          unmatchedRooms={unmatchedRooms}
          onClose={() => setUnmatchedRooms(null)}
        />
      )}
      {statusMessage && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusMessage}
        </p>
      )}
      {!mounted || editingId ? (
        <div className="space-y-2">
            {rooms.map((room) => (
            <StaticRoomCard
              key={room.id}
              projectId={projectId}
              room={room}
              activeRoomTypes={activeRoomTypes}
              sectionTypes={sectionTypes}
              updatingRoomTypeId={updatingRoomTypeId}
              onRoomTypeChange={handleRoomTypeChange}
              onDimensionsSaved={() => router.refresh()}
              isEditing={editingId === room.id}
              isRewriting={rewritingRoomId === room.id}
              onEdit={() => setEditingId(room.id)}
              onDoneEdit={() => {
                setEditingId(null);
                router.refresh();
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(room.id)}
              onRewriteScope={() => handleRewriteScope(room.id)}
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
            items={rooms.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rooms.map((room) => (
                <SortableRoomCard
                  key={room.id}
                  projectId={projectId}
                  room={room}
                  activeRoomTypes={activeRoomTypes}
                  sectionTypes={sectionTypes}
                  updatingRoomTypeId={updatingRoomTypeId}
                  onRoomTypeChange={handleRoomTypeChange}
                  onDimensionsSaved={() => router.refresh()}
                  isEditing={editingId === room.id}
                  isRewriting={rewritingRoomId === room.id}
                  onEdit={() => setEditingId(room.id)}
                  onDoneEdit={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(room.id)}
                  onRewriteScope={() => handleRewriteScope(room.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function StaticRoomCard({
  projectId,
  room,
  activeRoomTypes,
  sectionTypes,
  updatingRoomTypeId,
  onRoomTypeChange,
  onDimensionsSaved,
  isEditing,
  isRewriting,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  sectionTypes: SectionTypeOption[];
  updatingRoomTypeId: string | null;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onDimensionsSaved: () => void;
  isEditing: boolean;
  isRewriting: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
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
                value={room.roomTypeId ?? ""}
                onChange={(e) =>
                  onRoomTypeChange(room.id, e.target.value || null)
                }
                disabled={updatingRoomTypeId === room.id}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                aria-label="Pricing Profile"
              >
                <option value="">Custom</option>
                {activeRoomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>
              <SectionPriceRangePill result={getSectionPriceRangeDisplay(room)} />
            </div>
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
            <AdvancedSectionOptions projectId={projectId} room={room} onSaved={onDimensionsSaved} />
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

function AdvancedSectionOptions({
  projectId,
  room,
  onSaved,
}: {
  projectId: string;
  room: Room;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<"BASE" | "ALTERNATE" | "ALLOWANCE">(room.bucket ?? "BASE");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setBucket(room.bucket ?? "BASE");
  }, [room.id, room.bucket]);
  const handleBucketChange = useCallback(
    async (newBucket: "BASE" | "ALTERNATE" | "ALLOWANCE") => {
      setBucket(newBucket);
      setSaving(true);
      const formData = new FormData();
      formData.set("name", room.name);
      formData.set("scopeNarrative", room.scopeNarrative ?? "");
      formData.set("bucket", newBucket);
      formData.set("estPricePerSqFt", room.estPricePerSqFt != null ? String(room.estPricePerSqFt) : "");
      formData.set("lengthIn", formatInchesToFeetInches(room.lengthIn ?? null));
      formData.set("widthIn", formatInchesToFeetInches(room.widthIn ?? null));
      formData.set("ceilingHeightIn", formatInchesToFeetInches(room.ceilingHeightIn ?? null));
      formData.set("sectionTypeId", room.sectionTypeId ?? "");
      formData.set("origin", room.origin ?? "MANUAL");
      formData.set("measurementMode", room.measurementMode ?? "");
      formData.set("areaSqFt", room.areaSqFt != null ? String(room.areaSqFt) : "");
      formData.set("quantity", room.quantity != null ? String(room.quantity) : "");
      formData.set("estimateUnit", room.estimateUnit ?? "");
      formData.set("customUnitLabel", room.customUnitLabel ?? "");
      formData.set("unitQuantityManualOverride", room.unitQuantityManualOverride ? "true" : "false");
      formData.set("unitQuantityOverride", room.unitQuantity != null ? String(room.unitQuantity) : "");
      await updateRoomAction(projectId, room.id, formData);
      setSaving(false);
      onSaved();
    },
    [projectId, room, onSaved]
  );
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        {open ? "▼ Advanced" : "▶ Advanced"}
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Bucket:</span>
          <select
            value={bucket}
            onChange={(e) => handleBucketChange(e.target.value as "BASE" | "ALTERNATE" | "ALLOWANCE")}
            disabled={saving}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Bucket"
          >
            <option value="BASE">Base</option>
            <option value="ALTERNATE">Alternate</option>
            <option value="ALLOWANCE">Allowance</option>
          </select>
          {saving && <span className="text-xs text-zinc-500">Saving…</span>}
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
  updatingRoomTypeId,
  onRoomTypeChange,
  onDimensionsSaved,
  isEditing,
  isRewriting,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  sectionTypes: SectionTypeOption[];
  updatingRoomTypeId: string | null;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onDimensionsSaved: () => void;
  isEditing: boolean;
  isRewriting: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
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
                  value={room.roomTypeId ?? ""}
                  onChange={(e) =>
                    onRoomTypeChange(room.id, e.target.value || null)
                  }
                  disabled={updatingRoomTypeId === room.id}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Pricing Profile"
                >
                  <option value="">Custom</option>
                  {activeRoomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
                <SectionPriceRangePill result={getSectionPriceRangeDisplay(room)} />
              </div>
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
              <AdvancedSectionOptions projectId={projectId} room={room} onSaved={onDimensionsSaved} />
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
                effectiveInches(widthStr, room.widthIn)
              )}
            </span>
            <span className="self-center text-sm text-zinc-500 dark:text-zinc-400">
              Perimeter: {perimeterDisplay(
                effectiveInches(lengthStr, room.lengthIn),
                effectiveInches(widthStr, room.widthIn)
              )} LF
            </span>
            <span className="self-center text-sm text-zinc-500 dark:text-zinc-400">
              Wall SF: {wallSfDisplay(
                effectiveInches(lengthStr, room.lengthIn),
                effectiveInches(widthStr, room.widthIn),
                effectiveInches(ceilingStr, room.ceilingHeightIn)
              )}
            </span>
          </div>
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
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Bucket</label>
                  <select
                    value={bucketOverride}
                    onChange={(e) => setBucketOverride(e.target.value as "BASE" | "ALTERNATE" | "ALLOWANCE")}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    aria-label="Bucket"
                  >
                    <option value="BASE">Base</option>
                    <option value="ALTERNATE">Alternate</option>
                    <option value="ALLOWANCE">Allowance</option>
                  </select>
                </div>
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

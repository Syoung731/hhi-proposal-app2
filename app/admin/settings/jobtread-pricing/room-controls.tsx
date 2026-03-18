"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setRoomIncludeInPricingAction,
  updateRoomManualSqFtOverrideAction,
  updateRoomSectionTypeAction,
  createSectionTypeForPricingRoomAction,
} from "./actions";
import { SectionCategory, PricingBasis } from "@/app/generated/prisma";

type SectionTypeOption = {
  id: string;
  name: string;
};

type Props = {
  roomId: string;
  includeInPricing: boolean;
  manualSqFtOverride: number | null;
  autoDetectedSqFt: number | null;
  sectionTypeId: string | null;
  sectionTypes: SectionTypeOption[];
  /** When true, render a single compact row (no wrap) for tree-grid use. */
  compact?: boolean;
  /** In compact mode, show this room name inline after the include checkbox. */
  roomName?: string;
};

export function RoomControls({
  roomId,
  includeInPricing,
  manualSqFtOverride,
  autoDetectedSqFt,
  sectionTypeId,
  sectionTypes,
  compact = false,
  roomName,
}: Props) {
  const router = useRouter();
  const [isPendingInclude, startInclude] = useTransition();
  const [isPendingSqFt, startSqFt] = useTransition();
  const [isPendingSection, startSection] = useTransition();

  const [manualSqFtInput, setManualSqFtInput] = useState<string>(
    manualSqFtOverride != null ? String(manualSqFtOverride) : "",
  );

  function handleIncludeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    startInclude(async () => {
      await setRoomIncludeInPricingAction(roomId, next);
      router.refresh();
    });
  }

  function handleSaveSqFt() {
    const trimmed = manualSqFtInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || parsed <= 0)) {
      startSqFt(async () => {
        await updateRoomManualSqFtOverrideAction(roomId, null);
        router.refresh();
      });
      return;
    }
    startSqFt(async () => {
      await updateRoomManualSqFtOverrideAction(roomId, parsed);
      router.refresh();
    });
  }

  function handleClearSqFt() {
    setManualSqFtInput("");
    startSqFt(async () => {
      await updateRoomManualSqFtOverrideAction(roomId, null);
      router.refresh();
    });
  }

  function handleSectionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const nextId = value === "" ? null : value;
    startSection(async () => {
      await updateRoomSectionTypeAction(roomId, nextId);
      router.refresh();
    });
  }

  const isAnyPending = isPendingInclude || isPendingSqFt || isPendingSection;

  const inputCls =
    "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const btnCls =
    "inline-flex items-center rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
  const btnGhostCls =
    "inline-flex items-center rounded border border-transparent px-1.5 py-0.5 text-zinc-500 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-200";

  if (compact) {
    return (
      <div className="flex flex-nowrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <label className="flex shrink-0 items-center gap-1">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
            checked={includeInPricing}
            onChange={handleIncludeChange}
            disabled={isPendingInclude}
          />
          <span className="whitespace-nowrap text-[11px]">
            {isPendingInclude ? "…" : "Inc"}
          </span>
        </label>
        {roomName != null && roomName !== "" && (
          <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
            {roomName}
          </span>
        )}
        <input
          type="number"
          step="1"
          min="0"
          value={manualSqFtInput}
          onChange={(e) => setManualSqFtInput(e.target.value)}
          className={`h-6 w-16 shrink-0 text-xs ${inputCls}`}
          placeholder={
            autoDetectedSqFt != null && Number.isFinite(autoDetectedSqFt)
              ? String(autoDetectedSqFt)
              : ""
          }
        />
        <button
          type="button"
          onClick={handleSaveSqFt}
          disabled={isPendingSqFt}
          className={`shrink-0 text-[11px] ${btnCls}`}
        >
          {isPendingSqFt ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleClearSqFt}
          disabled={isPendingSqFt}
          className={`shrink-0 text-[11px] ${btnGhostCls}`}
        >
          Clear
        </button>
        {isAnyPending && (
          <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
            Updating…
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-300">
      <label className="inline-flex items-center gap-1">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
          checked={includeInPricing}
          onChange={handleIncludeChange}
          disabled={isPendingInclude}
        />
        <span>{isPendingInclude ? "Updating…" : "Include in pricing"}</span>
      </label>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-zinc-500 dark:text-zinc-400">Sq Ft:</span>
        <input
          type="number"
          step="1"
          min="0"
          value={manualSqFtInput}
          onChange={(e) => setManualSqFtInput(e.target.value)}
          className={`h-6 w-20 ${inputCls} text-[11px]`}
          placeholder={
            autoDetectedSqFt != null && Number.isFinite(autoDetectedSqFt)
              ? String(autoDetectedSqFt)
              : ""
          }
        />
        <button
          type="button"
          onClick={handleSaveSqFt}
          disabled={isPendingSqFt}
          className={`text-[10px] ${btnCls}`}
        >
          {isPendingSqFt ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleClearSqFt}
          disabled={isPendingSqFt}
          className={`text-[10px] ${btnGhostCls}`}
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-zinc-500 dark:text-zinc-400">Section Type:</span>
        <select
          value={sectionTypeId ?? ""}
          onChange={handleSectionChange}
          disabled={isPendingSection}
          className={`h-6 max-w-[220px] ${inputCls} text-[11px]`}
        >
          <option value="">
            {sectionTypeId ? "Clear mapping" : "Select Section Type"}
          </option>
          {sectionTypes.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </div>

      {isAnyPending && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Updating room…
        </span>
      )}
    </div>
  );
}

type RoomNotesMappingCellProps = {
  roomId: string;
  sectionTypeId: string | null;
  sectionTypes: SectionTypeOption[];
  isUnmapped: boolean;
  isMissingSqFt: boolean;
};

export function RoomNotesMappingCell({
  roomId,
  sectionTypeId,
  sectionTypes,
  isUnmapped,
  isMissingSqFt,
}: RoomNotesMappingCellProps) {
  const router = useRouter();
  const [isPendingSection, startSection] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [isPendingCreate, startCreate] = useTransition();
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<SectionCategory>("INTERIOR");
  const [newPricingBasis, setNewPricingBasis] =
    useState<PricingBasis>("NONE");
  const [error, setError] = useState<string | null>(null);

  function handleSectionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const nextId = value === "" ? null : value;
    startSection(async () => {
      await updateRoomSectionTypeAction(roomId, nextId);
      router.refresh();
    });
  }

  function handleQuickCreate(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setError(null);
    startCreate(async () => {
      const result = await createSectionTypeForPricingRoomAction(roomId, {
        name: trimmed,
        category: newCategory,
        pricingBasis: newPricingBasis,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsCreating(false);
      setNewName("");
      setNewCategory("INTERIOR");
      setNewPricingBasis("NONE");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sectionTypeId ?? ""}
          onChange={handleSectionChange}
          disabled={isPendingSection}
          className="h-6 min-w-[128px] max-w-[180px] rounded border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">
            {sectionTypeId ? "Clear mapping" : "Assign Section Type"}
          </option>
          {sectionTypes.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setIsCreating((prev) => !prev);
            setError(null);
          }}
          className="inline-flex h-6 items-center rounded border border-dashed border-zinc-300 px-1.5 text-[10px] text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Create new section type"
        >
          + New
        </button>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {isUnmapped && (
            <span className="inline-flex items-center rounded bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              Unmapped
            </span>
          )}
          {isMissingSqFt && (
            <span className="inline-flex items-center rounded bg-red-100/80 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/50 dark:text-red-200">
              Missing Sq Ft
            </span>
          )}
        </span>
      </div>
      {isCreating && (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-dashed border-zinc-200 bg-zinc-50/80 px-2 py-1.5 dark:border-zinc-700/70 dark:bg-zinc-900/40">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Section type name"
            className="h-6 min-w-[120px] rounded border border-zinc-300 bg-white px-1.5 text-[11px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <select
            value={newCategory}
            onChange={(e) =>
              setNewCategory(e.target.value as SectionCategory)
            }
            className="h-6 rounded border border-zinc-300 bg-white px-1.5 text-[11px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="INTERIOR">Interior</option>
            <option value="EXTERIOR">Exterior</option>
            <option value="SYSTEMS">Systems</option>
            <option value="WHOLE_HOME">Whole home</option>
            <option value="ADDITION">Addition</option>
            <option value="FAST">Fast</option>
          </select>
          <select
            value={newPricingBasis}
            onChange={(e) =>
              setNewPricingBasis(e.target.value as PricingBasis)
            }
            className="h-6 rounded border border-zinc-300 bg-white px-1.5 text-[11px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="NONE">No pricing</option>
            <option value="PER_SF">Per SF</option>
            <option value="PER_EACH">Per each</option>
            <option value="PER_JOB">Per job</option>
          </select>
          <button
            type="button"
            disabled={isPendingCreate}
            onClick={handleQuickCreate}
            className="inline-flex h-6 items-center justify-center rounded border border-zinc-300 bg-white px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewName("");
              setNewCategory("INTERIOR");
              setNewPricingBasis("NONE");
              setError(null);
            }}
            className="inline-flex h-6 items-center justify-center rounded border border-transparent px-2 text-[11px] text-zinc-500 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          {error && (
            <span className="text-[10px] text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JobIncludeCheckbox } from "./job-controls";
import { RoomNotesMappingCell } from "./room-controls";
import {
  setRoomIncludeInPricingAction,
  updateRoomManualSqFtOverrideAction,
} from "./actions";

type SectionTypeOption = {
  id: string;
  name: string;
};

type ItemRow = {
  id: string;
  itemName: string;
  costType: string | null;
  costCode: string | null;
  costCodeName: string | null;
  extCost: number;
  extSell: number;
};

type TradeRow = {
  id: string;
  tradeName: string;
  totalCost: number;
  totalSell: number;
  items: ItemRow[];
};

type RoomRow = {
  id: string;
  roomName: string;
  includeInPricing: boolean;
  sectionTypeId: string | null;
  sectionType?: { name: string } | null;
  normalizedRoomName: string | null;
  autoDetectedSqFt: number | null;
  manualSqFtOverride: number | null;
  costPerSqFt: number | null;
  sellPerSqFt: number | null;
  totalCost: number;
  totalSell: number;
  sqFtSource: string | null;
  hasValidSqFt: boolean;
  trades: TradeRow[];
};

type JobRow = {
  id: string;
  jobId: string;
  jobName: string;
  jobNumber: string | null;
  includeInPricing: boolean;
  totalCost: number;
  totalSell: number;
  rooms: RoomRow[];
};

type Props = {
  jobs: JobRow[];
  sectionTypes: SectionTypeOption[];
};

const GRID_TEMPLATE_COLUMNS =
  "minmax(220px,0.9fr) 64px 44px 44px 108px 130px 130px minmax(300px,1.8fr) 56px";

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMoneyPerSqFt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `$${value.toFixed(2)}`;
}

function formatSqFtDisplay(
  manualSqFt: number | null | undefined,
  autoSqFt: number | null | undefined,
): string {
  if (manualSqFt != null && manualSqFt > 0) {
    return manualSqFt.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (autoSqFt != null && autoSqFt > 0) {
    return autoSqFt.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return "—";
}

function formatMarginPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** Job-level gross profit and margin % from totalSell / totalCost. */
function jobMargin(job: JobRow): {
  grossProfit: number;
  marginPct: number | null;
} {
  const sell = job.totalSell;
  const cost = job.totalCost;
  const grossProfit = Number.isFinite(sell) && Number.isFinite(cost) ? sell - cost : 0;
  const marginPct =
    sell > 0 && Number.isFinite(grossProfit) ? grossProfit / sell : null;
  return { grossProfit, marginPct };
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center text-lg font-semibold text-zinc-600 dark:text-zinc-400"
      aria-hidden
    >
      {expanded ? "▾" : "▸"}
    </span>
  );
}

export function PricingTreeGrid({ jobs, sectionTypes }: Props) {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(
    () => new Set(jobs.map((j) => j.id)),
  );
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(
    () => new Set<string>(),
  );

  function toggleJob(id: string) {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRoom(id: string) {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTrade(id: string) {
    setExpandedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No pricing staging data found. Parse and sync a JobTread budget, then
        rebuild the staging layer.
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto overflow-y-visible rounded-lg border border-zinc-300 dark:border-zinc-600">
      <table className="w-full min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b-2 border-zinc-300 bg-zinc-100 text-xs font-medium uppercase tracking-wide text-zinc-600 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]">
            <th className="w-10 px-2 py-1.5 text-left" />
            <th className="px-2 py-1.5 text-left">
              <div
                className="grid items-center gap-x-1.5"
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
              >
                <span className="block min-w-0 shrink-0 pl-2">Room</span>
                <span className="col-span-3 px-1 text-center">Actual Square Ft</span>
                <span className="px-2 text-right">Sell / Sq Ft</span>
                <span className="px-2 text-right">Total Sell</span>
                <span className="block px-2 text-right pr-6">Total Cost</span>
                <span className="block min-w-0 shrink-0 text-left pl-4">Notes / Mapping</span>
                <span className="min-w-0 shrink-0 px-1 text-center">Include</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const jobExpanded = expandedJobs.has(job.id);
            return (
              <JobRowView
                key={job.id}
                job={job}
                expanded={jobExpanded}
                onToggle={() => toggleJob(job.id)}
                expandedRooms={expandedRooms}
                onToggleRoom={toggleRoom}
                expandedTrades={expandedTrades}
                onToggleTrade={toggleTrade}
                sectionTypes={sectionTypes}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type JobRowViewProps = {
  job: JobRow;
  expanded: boolean;
  onToggle: () => void;
  expandedRooms: Set<string>;
  onToggleRoom: (id: string) => void;
  expandedTrades: Set<string>;
  onToggleTrade: (id: string) => void;
  sectionTypes: SectionTypeOption[];
};

function JobRowView({
  job,
  expanded,
  onToggle,
  expandedRooms,
  onToggleRoom,
  expandedTrades,
  onToggleTrade,
  sectionTypes,
}: JobRowViewProps) {
  const { grossProfit, marginPct } = jobMargin(job);
  const hasMargin = job.totalSell > 0;
  const jobNumberDisplay = job.jobNumber?.trim() || job.jobId;

  return (
    <>
      <tr className="border-b border-t border-zinc-300 bg-zinc-100/80 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100">
        <td className="w-10 border-r border-zinc-300 px-2 py-2 align-middle dark:border-zinc-600">
          {job.rooms.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
              aria-label={expanded ? "Collapse job" : "Expand job"}
            >
              <Chevron expanded={expanded} />
            </button>
          )}
        </td>
        <td className="px-3 py-3 align-middle">
          <div
            className="grid items-center gap-x-1.5"
            style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
          >
            <div className="min-w-0 space-y-1 pl-2">
              <div className="font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                {job.jobName}
              </div>
              <div className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                Job #{jobNumberDisplay} · {job.rooms.length} room{job.rooms.length !== 1 ? "s" : ""}
              </div>
              <div className="text-[12px] tabular-nums leading-snug text-zinc-600 dark:text-zinc-300">
                Sell {formatCurrency(job.totalSell)} · Cost {formatCurrency(job.totalCost)}
                {hasMargin && marginPct != null && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    · {formatMarginPct(marginPct)} margin
                  </span>
                )}
              </div>
            </div>
            <span />
            <span />
            <span />
            <span className="text-right text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400">
              —
            </span>
            <span className="text-right text-[12px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatCurrency(job.totalSell)}
            </span>
            <span className="pr-6 text-right text-[12px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatCurrency(job.totalCost)}
            </span>
            <span className="pl-4 text-left text-[11px] text-zinc-500 dark:text-zinc-400">
              {/* Notes / mapping summary could go here in future */}
            </span>
            <div className="flex items-center justify-center">
              <JobIncludeCheckbox
                jobId={job.jobId}
                includeInPricing={job.includeInPricing}
              />
            </div>
          </div>
        </td>
      </tr>
      {expanded &&
        job.rooms.map((room, roomIndex) => (
          <RoomRowView
            key={room.id}
            room={room}
            roomIndex={roomIndex}
            expanded={expandedRooms.has(room.id)}
            onToggle={() => onToggleRoom(room.id)}
            expandedTrades={expandedTrades}
            onToggleTrade={onToggleTrade}
            sectionTypes={sectionTypes}
          />
        ))}
    </>
  );
}

type RoomRowViewProps = {
  room: RoomRow;
  roomIndex: number;
  expanded: boolean;
  onToggle: () => void;
  expandedTrades: Set<string>;
  onToggleTrade: (id: string) => void;
  sectionTypes: SectionTypeOption[];
};

type RoomInlineControlsProps = {
  roomId: string;
  roomName: string;
  manualSqFtOverride: number | null;
  autoDetectedSqFt: number | null;
};

function RoomIncludeCheckboxCell({
  roomId,
  includeInPricing,
}: {
  roomId: string;
  includeInPricing: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    startTransition(async () => {
      await setRoomIncludeInPricingAction(roomId, next);
      router.refresh();
    });
  }

  return (
    <label className="flex items-center justify-center">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
        checked={includeInPricing}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Include in pricing"
      />
    </label>
  );
}

function RoomInlineControls({
  roomId,
  roomName,
  manualSqFtOverride,
  autoDetectedSqFt,
}: Omit<RoomInlineControlsProps, "includeInPricing">) {
  const router = useRouter();
  const [isPendingSqFt, startSqFt] = useTransition();
  const [manualSqFtInput, setManualSqFtInput] = useState<string>(
    manualSqFtOverride != null ? String(manualSqFtOverride) : "",
  );

  const savedValue = manualSqFtOverride ?? null;
  const inputParsed =
    manualSqFtInput.trim() === ""
      ? null
      : (() => {
          const n = Number(manualSqFtInput.trim());
          return Number.isFinite(n) ? n : null;
        })();
  const hasValueChanged = inputParsed !== savedValue;
  const canClear =
    manualSqFtOverride != null || (manualSqFtInput.trim() !== "" && inputParsed != null);

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

  const sqFtPlaceholder =
    autoDetectedSqFt != null && Number.isFinite(autoDetectedSqFt)
      ? String(autoDetectedSqFt)
      : "";

  return (
    <>
      <div className="min-w-0 truncate pl-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
        {roomName}
      </div>
      <div className="group flex items-center gap-1">
        <input
          type="number"
          step="1"
          min="0"
          value={manualSqFtInput}
          onChange={(e) => setManualSqFtInput(e.target.value)}
          placeholder={sqFtPlaceholder}
          className="h-6 w-14 rounded border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        {hasValueChanged && (
          <button
            type="button"
            onClick={handleSaveSqFt}
            disabled={isPendingSqFt}
            className="inline-flex h-6 shrink-0 items-center justify-center rounded px-1.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            {isPendingSqFt ? "…" : "Save"}
          </button>
        )}
        {canClear && (
          <button
            type="button"
            onClick={handleClearSqFt}
            disabled={isPendingSqFt}
            className="inline-flex h-6 shrink-0 items-center justify-center rounded px-1 text-[10px] text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Clear override"
          >
            Clear
          </button>
        )}
      </div>
      <span />
      <span />
    </>
  );
}

function RoomRowView({
  room,
  roomIndex,
  expanded,
  onToggle,
  expandedTrades,
  onToggleTrade,
  sectionTypes,
}: RoomRowViewProps) {
  const autoSqFt = room.autoDetectedSqFt;
  const manualSqFt = room.manualSqFtOverride;
  const sellPerSqFt = formatMoneyPerSqFt(room.sellPerSqFt);
  const totalSell = formatCurrency(room.totalSell);
  const totalCost = formatCurrency(room.totalCost);
  const isUnmapped = room.sectionTypeId == null;
  const isMissingSqFt = !room.hasValidSqFt;
  const zebra = roomIndex % 2 === 1;

  return (
    <>
      <tr
        className={
          zebra
            ? "border-b border-zinc-200 bg-zinc-50/70 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200"
            : "border-b border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-200"
        }
      >
        <td className="w-10 border-r border-zinc-200 px-2 py-1 align-middle dark:border-zinc-700">
          {room.trades.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className="ml-4 inline-flex min-h-9 min-w-9 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
              aria-label={expanded ? "Collapse room" : "Expand room"}
            >
              <Chevron expanded={expanded} />
            </button>
          )}
        </td>
        <td className="px-2 py-1 align-middle">
          <div
            className="grid items-center gap-x-1.5"
            style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
          >
            <RoomInlineControls
              roomId={room.id}
              roomName={room.roomName}
              manualSqFtOverride={manualSqFt}
              autoDetectedSqFt={autoSqFt}
            />
            <span className="text-right text-[12px] tabular-nums text-zinc-800 dark:text-zinc-100">
              {sellPerSqFt}
            </span>
            <span className="text-right text-[12px] tabular-nums text-zinc-800 dark:text-zinc-100">
              {totalSell}
            </span>
            <span className="pr-6 text-right text-[12px] tabular-nums text-zinc-800 dark:text-zinc-100">
              {totalCost}
            </span>
            <div className="pl-4">
              <RoomNotesMappingCell
                roomId={room.id}
                sectionTypeId={room.sectionTypeId}
                sectionTypes={sectionTypes}
                isUnmapped={isUnmapped}
                isMissingSqFt={isMissingSqFt}
              />
            </div>
            <RoomIncludeCheckboxCell
              roomId={room.id}
              includeInPricing={room.includeInPricing}
            />
          </div>
        </td>
      </tr>
      {expanded &&
        room.trades.map((trade) => {
          const tradeExpanded = expandedTrades.has(trade.id);
          const hasItems = trade.items.length > 0;
          return (
            <Fragment key={trade.id}>
              <tr
                className="border-b border-zinc-200 bg-zinc-50/40 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400"
              >
                <td className="w-10 border-r border-zinc-200 px-2 py-0.5 align-middle dark:border-zinc-700">
                  {hasItems && (
                    <button
                      type="button"
                      onClick={() => onToggleTrade(trade.id)}
                      className="ml-6 inline-flex min-h-7 min-w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                      aria-label={tradeExpanded ? "Collapse items" : "Expand items"}
                    >
                      <Chevron expanded={tradeExpanded} />
                    </button>
                  )}
                </td>
                <td className="px-2 py-0.5 align-middle">
                  <div
                    className="grid items-center gap-x-1.5"
                    style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
                  >
                    <div className="pl-2 text-[13px] font-medium text-zinc-600 dark:text-zinc-400">
                      {trade.tradeName}
                    </div>
                    <span />
                    <span />
                    <span />
                    <span className="text-right tabular-nums text-zinc-400 dark:text-zinc-500">
                      —
                    </span>
                    <span className="text-right text-[12px] font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatCurrency(trade.totalSell)}
                    </span>
                    <span className="pr-6 text-right text-[12px] font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatCurrency(trade.totalCost)}
                    </span>
                    <span className="pl-4" />
                    <span />
                  </div>
                </td>
              </tr>
              {tradeExpanded &&
                trade.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 bg-white/80 text-zinc-500 dark:border-zinc-700/80 dark:bg-zinc-900/20 dark:text-zinc-400"
                  >
                    <td className="w-10 border-r border-zinc-200 px-2 py-0.5 align-middle dark:border-zinc-700" />
                    <td className="px-2 py-0.5 align-middle">
                      <div
                        className="grid items-center gap-x-1.5"
                        style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 pl-8">
                          <span className="truncate text-[12px] text-zinc-600 dark:text-zinc-300">
                            {item.itemName}
                          </span>
                          {item.costType != null && item.costType !== "" && (
                            <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                              {item.costType}
                            </span>
                          )}
                        </div>
                        <span />
                        <span />
                        <span />
                        <span className="text-right text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                          —
                        </span>
                        <span className="text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatCurrency(item.extSell)}
                        </span>
                        <span className="pr-6 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatCurrency(item.extCost)}
                        </span>
                        <span className="pl-4" />
                        <span />
                      </div>
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
    </>
  );
}

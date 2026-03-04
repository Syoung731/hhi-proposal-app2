"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { listLibraryMediaAction } from "./actions";
import type { LibraryMediaItem, ListLibraryMediaFilters } from "./types";
import { isAllowedHostForNextImage } from "@/app/lib/media";
import { SECTIONS } from "@/app/lib/sections";

/** Normalize filter value: treat empty, "all", or "All ..." as no filter (undefined). */
const norm = (v?: string | null): string | undefined => {
  const s = (v ?? "").trim();
  return !s || s === "all" || s.startsWith("All ") ? undefined : s;
};

const USE_TYPE_OPTIONS = [
  { value: "BEFORE", label: "Before" },
  { value: "AFTER", label: "After" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RENDER", label: "Render" },
  { value: "DETAIL", label: "Detail" },
  { value: "LIFESTYLE", label: "Lifestyle" },
] as const;

const QUALITY_OPTIONS = [
  { value: "HERO_READY", label: "Hero Ready" },
  { value: "STANDARD", label: "Standard" },
] as const;

const ORIENTATION_OPTIONS = [
  { value: "LANDSCAPE", label: "Landscape" },
  { value: "PORTRAIT", label: "Portrait" },
  { value: "SQUARE", label: "Square" },
  { value: "PANORAMA", label: "Panorama" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (selected: LibraryMediaItem[]) => void;
  multiple?: boolean;
  /** When "heroOnly", list shows only HERO_READY + marketingApproved. When "all" (default), no hidden constraints. */
  mode?: "all" | "heroOnly";
  /** When true, pass includeUnapproved so the library shows all photos (no quality/marketing filter). Use for Objective page. */
  includeUnapproved?: boolean;
  /** Optional project scope – when provided, server action will read from that project's Media table. */
  projectId?: string;
  /** When true, require a projectId and show an inline error if missing. */
  requireProject?: boolean;
  /** Optional initial filters when the picker is first opened (e.g. from Objective builder). */
  initialFilters?: Partial<ListLibraryMediaFilters>;
};

export function LibraryMediaPicker({
  open,
  onClose,
  onSelect,
  multiple = true,
  mode = "all",
  includeUnapproved = false,
  projectId,
  requireProject,
  initialFilters,
}: Props) {
  const [items, setItems] = useState<LibraryMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ListLibraryMediaFilters>(() => ({
    page: 1,
    pageSize: 24,
    sort: "newest",
    ...(initialFilters ?? {}),
  }));

  const fetchList = useCallback(async () => {
    if (!open) return;
    if (requireProject && !projectId) return;
    setLoading(true);
    const section = filters.roomTypeIds?.[0] ?? "";
    const useType = norm(filters.useType);
    const orientation = norm(filters.orientation);
    const tagSearch = norm(filters.tagSearch);
    const payload = {
      ...filters,
      mode,
      includeUnapproved: includeUnapproved || undefined,
      projectId,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 24,
      roomTypeIds: norm(section) ? [norm(section)!] : undefined,
      useType,
      orientation,
      tagSearch,
    };
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[LibraryMediaPicker] payload", payload, "-> requesting listLibraryMediaAction");
    }
    const result = await listLibraryMediaAction(payload);
    setLoading(false);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[LibraryMediaPicker] Response", { payload, total: result.total, itemCount: result.items.length, error: result.error });
    }
    if (!result.error) {
      setItems(result.items);
    }
  }, [
    open,
    mode,
    includeUnapproved,
    projectId,
    requireProject,
    filters.page,
    filters.pageSize,
    filters.roomTypeIds,
    filters.tagSearch,
    filters.useType,
    filters.quality,
    filters.orientation,
    filters.marketingApproved,
    filters.textSearch,
    filters.sort,
  ]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      fetchList();
    }
  }, [open, fetchList]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedItems = items.filter((i) => selected.has(i.id));
    onSelect(selectedItems);
    onClose();
  };

  if (!open) return null;

  const missingProject = !!requireProject && !projectId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Select from Photo Library
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        {missingProject && (
          <div className="border-b border-zinc-200 bg-amber-50 px-6 py-3 text-sm text-amber-800 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-200">
            Missing projectId – cannot load project photos.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <select
            value={filters.roomTypeIds?.[0] ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                roomTypeIds: e.target.value ? [e.target.value] : undefined,
                page: 1,
              }))
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All sections</option>
            {SECTIONS.slice()
              .sort((a, b) => a.localeCompare(b))
              .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
              ))}
          </select>
          <select
            value={filters.useType ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                useType: (e.target.value || undefined) as ListLibraryMediaFilters["useType"],
                page: 1,
              }))
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All use types</option>
            {USE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filters.orientation ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                orientation: (e.target.value || undefined) as ListLibraryMediaFilters["orientation"],
                page: 1,
              }))
            }
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All orientations</option>
            {ORIENTATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Tag search"
            value={filters.tagSearch ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, tagSearch: e.target.value || undefined, page: 1 }))
            }
            className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {missingProject ? (
            <p className="py-8 text-center text-sm text-amber-700 dark:text-amber-300">
              Missing projectId – cannot load project photos.
            </p>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {mode === "all" ? "No library photos uploaded yet." : "No photos match filters."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const imgUrl = item.thumbnailUrl ?? item.url;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={`relative aspect-[4/3] w-full overflow-hidden rounded-lg border-2 transition ${
                      isSelected
                        ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                        : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                    }`}
                  >
                    {imgUrl && isAllowedHostForNextImage(imgUrl) ? (
                      <Image
                        src={imgUrl}
                        alt={item.title ?? "Library photo"}
                        fill
                        className="object-cover"
                        sizes="120px"
                      />
                    ) : imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={item.title ?? "Library photo"}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    {isSelected && (
                      <span className="absolute right-2 top-2 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

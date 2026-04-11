"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import {
  createLibraryUploadUrlAction,
  finalizeLibraryMediaAction,
  updateLibraryMediaAction,
  deleteLibraryMediaAction,
  listLibraryMediaAction,
  suggestLibraryMediaTagsAction,
  listLibraryTagsAction,
} from "./actions";
import type {
  LibraryMediaItem,
  FinalizeLibraryMediaInput,
  ListLibraryMediaFilters,
  SuggestLibraryMediaTagsResult,
} from "./types";
import { LibraryMediaPicker } from "./library-media-picker";
import { isAllowedHostForNextImage } from "@/app/lib/media";
import { SECTION_GROUPS, MAX_SECTIONS } from "@/app/lib/sections";
import { SectionsSidebar } from "./SectionsSidebar";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { normalizeTag } from "@/app/lib/tag-utils";

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

type QueuedFile = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  objectKey?: string;
  publicUrl?: string;
  detectedOrientation?: "LANDSCAPE" | "PORTRAIT" | "SQUARE" | "UNKNOWN";
};

/** Auto-detect orientation from image dimensions: width > height → Landscape, height > width → Portrait, equal → Square. */
function detectOrientationFromFile(file: File): Promise<"LANDSCAPE" | "PORTRAIT" | "SQUARE" | "UNKNOWN"> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve("UNKNOWN");
      return;
    }
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > h) resolve("LANDSCAPE");
      else if (h > w) resolve("PORTRAIT");
      else resolve("SQUARE");
    };
    img.onerror = () => resolve("UNKNOWN");
    img.src = url;
  });
}

export function PhotoLibraryTab() {
  const [items, setItems] = useState<LibraryMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [metadataDrafts, setMetadataDrafts] = useState<Record<number, Partial<FinalizeLibraryMediaInput>>>({});

  const [detailItem, setDetailItem] = useState<LibraryMediaItem | null>(null);
  const [detailDraft, setDetailDraft] = useState<Partial<LibraryMediaItem>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const [filters, setFilters] = useState<ListLibraryMediaFilters>({
    sort: "newest",
    page: 1,
    pageSize: 24,
  });
  const [learnedTags, setLearnedTags] = useState<string[]>([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const result = await listLibraryMediaAction({
      ...filters,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 24,
    });
    setLoading(false);
    if (result.error) {
      setErrorMessage(result.error);
      return;
    }
    setItems(result.items);
    setTotal(result.total);
    setPage(result.page);
  }, [filters.page, filters.pageSize, filters.roomTypeIds, filters.tagSearch, filters.useType, filters.quality, filters.orientation, filters.marketingApproved, filters.textSearch, filters.sort]);

  const refreshLearnedTags = useCallback(async () => {
    const result = await listLibraryTagsAction();
    if (result.error) return;
    const unique = Array.from(
      new Set(
        result.tags
          .map((t) => normalizeTag(t.tag))
          .filter((t) => !!t)
      )
    );
    setLearnedTags(unique);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    refreshLearnedTags();
  }, [refreshLearnedTags]);

  const showStatus = (msg: string, isError: boolean) => {
    if (isError) {
      setErrorMessage(msg);
      setStatus("error");
      setTimeout(() => {
        setErrorMessage(null);
        setStatus("idle");
      }, 5000);
    } else {
      setSuccessMessage(msg);
      setStatus("saved");
      setTimeout(() => {
        setSuccessMessage(null);
        setStatus("idle");
      }, 3000);
    }
  };

  const handleUploadClick = () => {
    setQueuedFiles([]);
    setBatchMode(false);
    setMetadataDrafts({});
    setUploadModalOpen(true);
  };

  const handleFilesSelected = (files: File[]) => {
    const safeFiles = Array.from(files ?? []);
    if (!safeFiles.length) return;
    const next: QueuedFile[] = safeFiles.map((file) => ({ file, status: "queued" }));
    setQueuedFiles((prev) => [...prev, ...next]);
  };

  const removeQueued = (index: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
    setMetadataDrafts((d) => {
      const out = { ...d };
      delete out[index];
      return out;
    });
  };


  const startUploads = async () => {
    const queued = queuedFiles.filter((q) => q.status === "queued");
    if (queued.length === 0) {
      setBatchMode(true);
      return;
    }
    for (let i = 0; i < queuedFiles.length; i++) {
      const q = queuedFiles[i]!;
      if (q.status !== "queued") continue;
      setQueuedFiles((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: "uploading" } : p))
      );
      let orientation: "LANDSCAPE" | "PORTRAIT" | "SQUARE" | "UNKNOWN" = "UNKNOWN";
      try {
        orientation = await detectOrientationFromFile(q.file);
      } catch {
        /* ignore */
      }
      const result = await createLibraryUploadUrlAction(
        q.file.name,
        q.file.type || "application/octet-stream"
      );
      if ("error" in result) {
        setQueuedFiles((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", error: result.error } : p
          )
        );
        continue;
      }
      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: q.file,
        headers: { "Content-Type": q.file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        setQueuedFiles((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: "error", error: "Upload failed: " + putRes.statusText }
              : p
          )
        );
        continue;
      }
      setQueuedFiles((prev) =>
        prev.map((p, idx) =>
          idx === i
            ? {
                ...p,
                status: "done",
                objectKey: result.objectKey,
                publicUrl: result.publicUrl,
                detectedOrientation: orientation,
              }
            : p
        )
      );
    }
    setTimeout(() => {
      setBatchMode(true);
    }, 0);
  };

  const saveAllMetadata = async () => {
    let savedCount = 0;
    let lastError: string | null = null;
    for (let i = 0; i < queuedFiles.length; i++) {
      const q = queuedFiles[i];
      if (!q || q.status !== "done" || !q.objectKey || !q.publicUrl) continue;
      const draft = metadataDrafts[i] ?? {};
      const result = await finalizeLibraryMediaAction({
        objectKey: q.objectKey,
        publicUrl: q.publicUrl,
        roomTypeIds: draft.roomTypeIds ?? [],
        tags: draft.tags ?? [],
        useType: draft.useType ?? "AFTER",
        quality: draft.quality ?? "STANDARD",
        orientation: q.detectedOrientation ?? "UNKNOWN",
        marketingApproved: draft.marketingApproved ?? true,
        sourceProjectName: draft.sourceProjectName ?? undefined,
        sourceProjectId: draft.sourceProjectId ?? undefined,
        photographer: draft.photographer ?? undefined,
      });
      if (result.error) {
        lastError = result.error;
      } else {
        savedCount++;
      }
    }
    await refreshLearnedTags();
    setBatchMode(false);
    setUploadModalOpen(false);
    setQueuedFiles([]);
    setMetadataDrafts({});
    fetchList();
    if (lastError) {
      showStatus(`Saved ${savedCount} photos. Last error: ${lastError}`, true);
    } else {
      showStatus(`${savedCount} photo${savedCount === 1 ? "" : "s"} added to library.`, false);
    }
  };

  const openDetail = (item: LibraryMediaItem) => {
    setDetailItem(item);
    setDetailDraft({
      roomTypeIds: item.roomTypeIds,
      tags: item.tags,
      useType: item.useType,
      quality: item.quality,
      marketingApproved: item.marketingApproved,
      sourceProjectName: item.sourceProjectName,
      photographer: item.photographer,
    });
  };

  const saveDetail = async () => {
    if (!detailItem) return;
    setStatus("saving");
    const result = await updateLibraryMediaAction(detailItem.id, {
      roomTypeIds: detailDraft.roomTypeIds ?? [],
      tags: detailDraft.tags ?? [],
      useType: detailDraft.useType as FinalizeLibraryMediaInput["useType"],
      quality: detailDraft.quality as FinalizeLibraryMediaInput["quality"],
      marketingApproved: detailDraft.marketingApproved,
      sourceProjectName: detailDraft.sourceProjectName ?? undefined,
      photographer: detailDraft.photographer ?? undefined,
    });
    if (result.error) {
      showStatus(result.error, true);
      return;
    }
    await refreshLearnedTags();
    setDetailItem(null);
    fetchList();
    showStatus("Metadata saved.", false);
  };

  const deleteDetail = async () => {
    if (!detailItem || !confirm("Delete this photo from the library?")) return;
    const result = await deleteLibraryMediaAction(detailItem.id);
    if (result.error) {
      showStatus(result.error, true);
      return;
    }
    setDetailItem(null);
    fetchList();
    showStatus("Photo removed.", false);
  };

  const clearFilters = () => {
    setFilters({
      sort: "newest",
      page: 1,
      pageSize: 24,
    });
  };

  const sectionDisplayName = (sectionId: string) => sectionId;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Photo Library
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Past work photos used across presentations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Add to Selection
          </button>
          <button
            type="button"
            disabled
            className="rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
            title="Coming soon"
          >
            Bulk Edit
          </button>
          <button
            type="button"
            onClick={handleUploadClick}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Upload Photos
          </button>
        </div>
      </header>

      {errorMessage && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          {successMessage}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <SectionsSidebar
          value={filters.roomTypeIds ?? []}
          onChange={(roomTypeIds) =>
            setFilters((f) => ({
              ...f,
              roomTypeIds: roomTypeIds.length ? roomTypeIds : undefined,
              page: 1,
            }))
          }
        />

        <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.useType ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              useType: (e.target.value || undefined) as ListLibraryMediaFilters["useType"],
              page: 1,
            }))
          }
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All use types</option>
          {USE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.quality ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              quality: (e.target.value || undefined) as ListLibraryMediaFilters["quality"],
              page: 1,
            }))
          }
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All quality</option>
          {QUALITY_OPTIONS.map((o) => (
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
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All orientations</option>
          {ORIENTATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={filters.marketingApproved ?? false}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                marketingApproved: e.target.checked ? true : undefined,
                page: 1,
              }))
            }
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Marketing approved
        </label>
        <input
          type="text"
          placeholder="Tag search"
          value={filters.tagSearch ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, tagSearch: e.target.value || undefined, page: 1 }))
          }
          className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <input
          type="text"
          // text search kept in filters for potential future use; hidden from UI
          placeholder="Search"
          value={filters.textSearch ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, textSearch: e.target.value || undefined, page: 1 }))
          }
          className="hidden w-44 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={filters.sort ?? "newest"}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              sort: e.target.value as ListLibraryMediaFilters["sort"],
              page: 1,
            }))
          }
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="hero-first">Hero first</option>
        </select>
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Clear filters
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-zinc-500 dark:text-zinc-400">
            No photos match. Upload some or adjust filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  className="relative aspect-[4/3] w-full overflow-hidden"
                >
                  {item.thumbnailUrl ? (
                    isAllowedHostForNextImage(item.thumbnailUrl) ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt="Library photo"
                        fill
                        className="object-cover transition group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                      />
                    ) : (
                      <img
                        src={item.thumbnailUrl}
                        alt="Library photo"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    )
                  ) : isAllowedHostForNextImage(item.url) ? (
                    <Image
                      src={item.url}
                      alt="Library photo"
                      fill
                      className="object-cover transition group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt="Library photo"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                    {item.quality === "HERO_READY" && (
                      <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-xs font-medium text-white">
                        HERO
                      </span>
                    )}
                    <span className="rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                      {ORIENTATION_OPTIONS.find((o) => o.value === item.orientation)?.label ?? item.orientation}
                    </span>
                    <span className="rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                      {USE_TYPE_OPTIONS.find((o) => o.value === item.useType)?.label ?? item.useType}
                    </span>
                    {item.marketingApproved && (
                      <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-xs text-white">
                        MARKETING
                      </span>
                    )}
                    {item.roomTypeIds.length > 0 && (
                      <span className="truncate rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
                        {sectionDisplayName(item.roomTypeIds[0]!)}
                        {item.roomTypeIds.length > 1 ? ` +${item.roomTypeIds.length - 1}` : ""}
                      </span>
                    )}
                  </div>
                </button>
                <div className="border-t border-zinc-200 bg-white px-2 py-1.5 text-left text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  {item.sourceProjectName && (
                    <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {item.sourceProjectName}
                    </p>
                  )}
                  <p className="mt-0.5">
                    Loaded:{" "}
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {total > pageSize && (
            <div className="flex justify-center gap-2 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-600"
              >
                Previous
              </button>
              <span className="py-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-600"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

        </div>
      </div>

      {uploadModalOpen && (
        <UploadModal
          queuedFiles={queuedFiles}
          batchMode={batchMode}
          metadataDrafts={metadataDrafts}
          setMetadataDrafts={setMetadataDrafts}
          onFilesSelected={handleFilesSelected}
          onRemove={removeQueued}
          onStartUploads={startUploads}
          onSaveAll={saveAllMetadata}
          learnedTags={learnedTags}
          onClose={() => {
            setUploadModalOpen(false);
            setQueuedFiles([]);
            setBatchMode(false);
            setMetadataDrafts({});
          }}
        />
      )}

      {detailItem && (
        <DetailDrawer
          item={detailItem}
          draft={detailDraft}
          setDraft={setDetailDraft}
          onSave={saveDetail}
          onDelete={deleteDetail}
          onClose={() => setDetailItem(null)}
          learnedTags={learnedTags}
        />
      )}

      <LibraryMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(selected) => {
          console.log("Selected library media:", selected);
          setPickerOpen(false);
        }}
        multiple
      />
    </div>
  );
}

function SectionsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (roomTypeIds: string[]) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [maxMessage, setMaxMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q)
      return SECTION_GROUPS.map((g) => ({ ...g, sections: [...g.sections] }));
    return SECTION_GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((s) =>
        s.toLowerCase().includes(q)
      ),
    })).filter((g) => g.sections.length > 0);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addSection = (section: string) => {
    if (selectedSet.has(section)) return;
    if (value.length >= MAX_SECTIONS) {
      setMaxMessage("Maximum 3 sections.");
      setTimeout(() => setMaxMessage(null), 3000);
      return;
    }
    setMaxMessage(null);
    onChange([...value, section]);
    setSearch("");
    setDropdownOpen(false);
  };

  const removeSection = (section: string) => {
    onChange(value.filter((s) => s !== section));
    setMaxMessage(null);
  };

  return (
    <div ref={containerRef} className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Sections
      </span>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          placeholder="Select a section…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                No sections match
              </p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.key}>
                  <p className="sticky top-0 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {group.label}
                  </p>
                  {group.sections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSection(s)}
                      disabled={selectedSet.has(s)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-sm text-zinc-800 dark:bg-zinc-600 dark:text-zinc-200"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSection(s)}
                className="rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-500"
                aria-label={`Remove ${s}`}
              >
                <span aria-hidden>×</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {maxMessage && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{maxMessage}</p>
      )}
    </div>
  );
}

function HybridTagsField({
  value,
  onChange,
  learnedTags,
  maxChipsDisplay = 12,
}: {
  value: string[];
  onChange: (updater: (prev: string[]) => string[]) => void;
  learnedTags: string[];
  maxChipsDisplay?: number;
}) {
  const [commonSelectValue, setCommonSelectValue] = useState("");
  const [freeformInput, setFreeformInput] = useState("");
  const [freeformFocused, setFreeformFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const existingSet = useMemo(
    () => new Set(value.map((t) => normalizeTag(t))),
    [value]
  );

  const normalizedCommonSet = useMemo(
    () => new Set(COMMON_TAGS.map((t) => normalizeTag(t))),
    []
  );

  const allKnownTags = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of COMMON_TAGS) {
      const n = normalizeTag(t);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      result.push(t);
    }
    for (const t of learnedTags) {
      const n = normalizeTag(t);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      result.push(t);
    }
    return result;
  }, [learnedTags]);

  const sortedCommonTags = useMemo(
    () => [...COMMON_TAGS].sort((a, b) => a.localeCompare(b)),
    []
  );

  const availableCommonTags = useMemo(
    () =>
      sortedCommonTags.filter((t) => {
        const norm = normalizeTag(t);
        if (existingSet.has(norm)) return false;
        return true;
      }),
    [sortedCommonTags, existingSet]
  );

  const availableLearnedTags = useMemo(
    () =>
      [...learnedTags]
        .filter((t) => {
          const norm = normalizeTag(t);
          if (!norm) return false;
          if (normalizedCommonSet.has(norm)) return false;
          if (existingSet.has(norm)) return false;
          return true;
        })
        .sort((a, b) => a.localeCompare(b)),
    [learnedTags, normalizedCommonSet, existingSet]
  );
  const sortedDisplayChips = useMemo(
    () => [...value].sort((a, b) => a.localeCompare(b)),
    [value]
  );

  const suggestions = useMemo(() => {
    const q = normalizeTag(freeformInput);
    if (!q) return [] as { label: string; norm: string }[];
    const matches = allKnownTags
      .map((tag) => ({ label: tag, norm: normalizeTag(tag) }))
      .filter(({ norm }) => norm.includes(q) && !existingSet.has(norm));
    matches.sort((a, b) => {
      const aStarts = a.norm.startsWith(q);
      const bStarts = b.norm.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label);
    });
    return matches.slice(0, 5);
  }, [freeformInput, allKnownTags, existingSet]);

  useEffect(() => {
    if (!suggestions.length) {
      setHighlightedIndex(-1);
    } else if (highlightedIndex >= suggestions.length) {
      setHighlightedIndex(suggestions.length - 1);
    }
  }, [suggestions, highlightedIndex]);

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    onChange((prev) => {
      const exists = prev.some((t) => normalizeTag(t) === normalized);
      if (exists) return prev;
      return [...prev, normalized];
    });
  };

  const removeTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    onChange((prev) => prev.filter((t) => normalizeTag(t) !== normalized));
  };

  const handleCommonSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) return;
    addTag(v);
    setCommonSelectValue("");
  };

  const commitFreeformInput = () => {
    const normalized = normalizeTag(freeformInput);
    if (!normalized) {
      setFreeformInput("");
      return;
    }
    addTag(normalized);
    setFreeformInput("");
  };

  const handleFreeformKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!suggestions.length) return;
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < 0 || prev + 1 >= suggestions.length ? 0 : prev + 1
      );
      return;
    }
    if (e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
      return;
    }
    if (e.key === "Escape") {
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (suggestions.length > 0 && highlightedIndex >= 0) {
        const chosen = suggestions[highlightedIndex];
        if (chosen) {
          addTag(chosen.label);
          setFreeformInput("");
          setHighlightedIndex(-1);
        }
      } else {
        commitFreeformInput();
      }
    }
  };

  const handleFreeformBlur = () => {
    commitFreeformInput();
    setFreeformFocused(false);
    setHighlightedIndex(-1);
  };

  const handleSuggestionSelect = (tag: string) => {
    addTag(tag);
    setFreeformInput("");
    setHighlightedIndex(-1);
  };

  const displayChips = sortedDisplayChips.slice(0, maxChipsDisplay);
  const moreCount = value.length - maxChipsDisplay;

  const showSuggestions =
    freeformFocused && freeformInput.trim().length > 0 && suggestions.length > 0;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Common tags
        </span>
        <select
          value={commonSelectValue}
          onChange={handleCommonSelect}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Select a tag…</option>
          {availableCommonTags.length > 0 && (
            <optgroup label="Common Tags">
              {availableCommonTags.map((t) => (
                <option key={`common-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
          {availableLearnedTags.length > 0 && (
            <optgroup label="Learned Tags">
              {availableLearnedTags.map((t) => (
                <option key={`learned-${t}`} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Add tags
        </span>
        <div className="relative">
          <input
            type="text"
            value={freeformInput}
            onChange={(e) => setFreeformInput(e.target.value)}
            onKeyDown={handleFreeformKeyDown}
            onFocus={() => setFreeformFocused(true)}
            onBlur={handleFreeformBlur}
            placeholder="Type and press Enter…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {suggestions.map((s, index) => (
                <button
                  key={s.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSuggestionSelect(s.label);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                    index === highlightedIndex
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
                  }`}
                >
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {displayChips.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-0.5 text-sm text-zinc-800 dark:bg-zinc-600 dark:text-zinc-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full p-0.5 hover:bg-zinc-300 dark:hover:bg-zinc-500"
                aria-label={`Remove ${tag}`}
              >
                <span className="sr-only">Remove</span>
                <span aria-hidden>×</span>
              </button>
            </span>
          ))}
          {moreCount > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">+{moreCount} more</span>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionsBlock({
  result,
  currentSections,
  currentTags,
  currentUseType,
  currentQuality,
  onSectionsChange,
  onTagsChange,
  onUseTypeChange,
  onQualityChange,
  onDismiss,
}: {
  result: SuggestLibraryMediaTagsResult;
  currentSections: string[];
  currentTags: string[];
  currentUseType: string;
  currentQuality: string;
  onSectionsChange: (sections: string[]) => void;
  onTagsChange: (tags: string[]) => void;
  onUseTypeChange: (v: string) => void;
  onQualityChange: (v: string) => void;
  onDismiss: () => void;
}) {
  const [replaceWithSection, setReplaceWithSection] = useState<string | null>(null);
  const currentTagsSet = useMemo(() => new Set(currentTags.map((t) => normalizeTag(t))), [currentTags]);
  const sortedSuggestedSections = useMemo(
    () => [...result.suggestedSections].sort((a, b) => a.localeCompare(b)),
    [result.suggestedSections]
  );
  const sortedSuggestedTags = useMemo(
    () => [...result.suggestedTags].sort((a, b) => a.localeCompare(b)),
    [result.suggestedTags]
  );

  const handleSuggestedSectionClick = (s: string) => {
    const isSelected = currentSections.includes(s);
    if (isSelected) {
      onSectionsChange(currentSections.filter((x) => x !== s));
      setReplaceWithSection(null);
      return;
    }
    if (currentSections.length < MAX_SECTIONS) {
      onSectionsChange([...currentSections, s]);
      return;
    }
    setReplaceWithSection(s);
  };

  const handleReplaceSection = (oldSection: string) => {
    if (!replaceWithSection) return;
    onSectionsChange(
      currentSections.map((x) => (x === oldSection ? replaceWithSection : x))
    );
    setReplaceWithSection(null);
  };

  const handleSuggestedTagClick = (t: string) => {
    const n = normalizeTag(t);
    if (!n) return;
    if (currentTagsSet.has(n)) {
      onTagsChange(currentTags.filter((x) => normalizeTag(x) !== n));
    } else {
      const existing = new Set(currentTags.map((x) => normalizeTag(x)));
      if (existing.has(n)) return;
      onTagsChange([...currentTags, t]);
    }
  };

  const hasSuggestedPills = result.suggestedUseType ?? result.suggestedQuality;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Suggested</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Dismiss suggestions
        </button>
      </div>

      {sortedSuggestedSections.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">Sections</p>
          {replaceWithSection ? (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Replace one with &quot;{replaceWithSection}&quot;:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {currentSections.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleReplaceSection(s)}
                    className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  >
                    {s} → Replace
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setReplaceWithSection(null)}
                  className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sortedSuggestedSections.map((s) => {
                const selected = currentSections.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestedSectionClick(s)}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm ${
                      selected
                        ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                        : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sortedSuggestedTags.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {sortedSuggestedTags.map((t) => {
              const selected = currentTagsSet.has(normalizeTag(t));
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSuggestedTagClick(t)}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm ${
                    selected
                      ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                      : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-500"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasSuggestedPills && (
        <div className="space-y-2">
          {result.suggestedUseType && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Use type</p>
              <div className="flex flex-wrap gap-1.5">
                {USE_TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onUseTypeChange(o.value)}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      currentUseType === o.value
                        ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                        : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                    } ${result.suggestedUseType === o.value ? "ring-1 ring-amber-400" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {result.suggestedQuality && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Quality</p>
              <div className="flex flex-wrap gap-1.5">
                {QUALITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onQualityChange(o.value)}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      currentQuality === o.value
                        ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                        : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                    } ${result.suggestedQuality === o.value ? "ring-1 ring-amber-400" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SUGGEST_DEBOUNCE_MS = 500;
const suggestionsCache = new Map<
  string,
  { data: SuggestLibraryMediaTagsResult; signature: string }
>();

function buildSuggestSignature(parts: {
  title?: string | null;
  notes?: string | null;
  sections: string[];
  tags: string[];
  mediaKey: string;
}) {
  return JSON.stringify({
    title: parts.title ?? "",
    notes: parts.notes ?? "",
    sections: parts.sections,
    tags: parts.tags,
    mediaKey: parts.mediaKey,
  });
}

function UploadModal({
  queuedFiles,
  batchMode,
  metadataDrafts,
  setMetadataDrafts,
  onFilesSelected,
  onRemove,
  onStartUploads,
  onSaveAll,
  onClose,
  learnedTags,
}: {
  queuedFiles: QueuedFile[];
  batchMode: boolean;
  metadataDrafts: Record<number, Partial<FinalizeLibraryMediaInput>>;
  setMetadataDrafts: React.Dispatch<React.SetStateAction<Record<number, Partial<FinalizeLibraryMediaInput>>>>;
  onFilesSelected: (files: File[]) => void;
  onRemove: (index: number) => void;
  onStartUploads: () => Promise<void>;
  onSaveAll: () => Promise<void>;
  onClose: () => void;
  learnedTags: string[];
}) {
  const [saving, setSaving] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [batchDraft, setBatchDraft] = useState<Partial<FinalizeLibraryMediaInput>>({
    marketingApproved: true,
  });
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [applyFlash, setApplyFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isPickingRef = useRef(false);
  const hasQueued = queuedFiles.some((q) => q.status === "queued");

  const doneIndices = useMemo(
    () => queuedFiles.map((q, i) => (q.status === "done" ? i : -1)).filter((i) => i >= 0),
    [queuedFiles]
  );

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === doneIndices.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(doneIndices));
    }
  };

  const applyBatchToSelected = () => {
    const count = selectedIndices.size;
    if (count === 0) return;
    const appliedSections = batchDraft.roomTypeIds ?? [];
    const appliedTags = batchDraft.tags ?? [];
    setMetadataDrafts((prev) => {
      const next = { ...prev };
      for (const idx of selectedIndices) {
        const existing = next[idx] ?? {};
        const merged: Partial<FinalizeLibraryMediaInput> = { ...existing };
        if (appliedSections.length > 0) {
          const existingSections = existing.roomTypeIds ?? [];
          const combined = Array.from(new Set([...existingSections, ...appliedSections])).slice(0, 3);
          merged.roomTypeIds = combined;
        }
        if (appliedTags.length > 0) {
          const existingTags = existing.tags ?? [];
          const combined = Array.from(new Set([...existingTags, ...appliedTags]));
          merged.tags = combined;
        }
        if (batchDraft.useType) merged.useType = batchDraft.useType;
        if (batchDraft.quality) merged.quality = batchDraft.quality;
        if (batchDraft.marketingApproved !== undefined) merged.marketingApproved = batchDraft.marketingApproved;
        next[idx] = merged;
      }
      return next;
    });
    // Build flash message
    const parts: string[] = [];
    if (appliedSections.length > 0) parts.push(appliedSections.join(", "));
    if (appliedTags.length > 0) parts.push(appliedTags.length + " tag" + (appliedTags.length > 1 ? "s" : ""));
    const label = parts.length > 0 ? parts.join(" + ") : "Settings";
    setApplyFlash(`Applied ${label} to ${count} photo${count > 1 ? "s" : ""}`);
    setTimeout(() => setApplyFlash(null), 3000);
    // Reset controls for next batch
    setBatchDraft({ marketingApproved: true });
    setSelectedIndices(new Set());
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await onSaveAll();
    setSaving(false);
  };

  const taggedCount = doneIndices.filter((i) => {
    const d = metadataDrafts[i];
    return d && ((d.roomTypeIds && d.roomTypeIds.length > 0) || (d.tags && d.tags.length > 0));
  }).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {batchMode ? "Tag & Organize" : "Upload Photos"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <div className="min-w-0 p-6">
          {!batchMode ? (
            <>
              <div className="mb-3 block">
                <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Drag files here or click to select
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) {
                      isPickingRef.current = false;
                      return;
                    }
                    onFilesSelected(files);
                    e.target.value = "";
                    isPickingRef.current = false;
                  }}
                />
                <div
                  className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 py-8 dark:border-zinc-600 dark:bg-zinc-800/50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isPickingRef.current) return;
                    const input = fileInputRef.current;
                    if (!input) return;
                    isPickingRef.current = true;
                    input.click();
                    setTimeout(() => {
                      isPickingRef.current = false;
                    }, 0);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("border-zinc-500");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-zinc-500");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-zinc-500");
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (!files.length) return;
                    onFilesSelected(files);
                  }}
                >
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Select multiple images
                  </span>
                </div>
              </div>
              {queuedFiles.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {queuedFiles.map((q, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">
                        {q.file.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {q.status === "queued" && "Queued"}
                        {q.status === "uploading" && "Uploading…"}
                        {q.status === "done" && "Done"}
                        {q.status === "error" && (q.error ?? "Error")}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="ml-2 rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-600 dark:hover:text-zinc-100"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onStartUploads}
                  disabled={queuedFiles.length === 0}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {hasQueued ? "Upload & tag" : "Tag photos"}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {/* Batch controls */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedIndices.size > 0
                    ? `Apply to ${selectedIndices.size} selected photo${selectedIndices.size !== 1 ? "s" : ""}`
                    : "Select photos below, then set tags here"}
                </p>
                <div className="space-y-3">
                  <SectionsField
                    value={batchDraft.roomTypeIds ?? []}
                    onChange={(roomTypeIds) => setBatchDraft((d) => ({ ...d, roomTypeIds }))}
                  />
                  <HybridTagsField
                    value={batchDraft.tags ?? []}
                    learnedTags={learnedTags}
                    onChange={(updater) =>
                      setBatchDraft((d) => ({ ...d, tags: updater(d.tags ?? []) }))
                    }
                    maxChipsDisplay={12}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Use type
                      </span>
                      <select
                        value={batchDraft.useType ?? "AFTER"}
                        onChange={(e) =>
                          setBatchDraft((d) => ({ ...d, useType: e.target.value as FinalizeLibraryMediaInput["useType"] }))
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {USE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Quality
                      </span>
                      <select
                        value={batchDraft.quality ?? "STANDARD"}
                        onChange={(e) =>
                          setBatchDraft((d) => ({ ...d, quality: e.target.value as FinalizeLibraryMediaInput["quality"] }))
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {QUALITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-1">
                      <input
                        type="checkbox"
                        checked={batchDraft.marketingApproved ?? true}
                        onChange={(e) => setBatchDraft((d) => ({ ...d, marketingApproved: e.target.checked }))}
                        className="rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        Marketing approved
                      </span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={applyBatchToSelected}
                    disabled={selectedIndices.size === 0}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Apply to {selectedIndices.size} selected &rarr;
                  </button>
                </div>
              </div>

              {/* Flash notification */}
              {applyFlash && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
                  <span>&#10003;</span>
                  <span>{applyFlash}</span>
                  <span className="ml-auto text-xs text-green-600 dark:text-green-500">Select next group below</span>
                </div>
              )}

              {/* Selection header */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIndices.size === doneIndices.length && doneIndices.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Select all</span>
                </label>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {taggedCount} of {doneIndices.length} tagged
                </span>
              </div>

              {/* Photo grid */}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {doneIndices.map((i) => {
                  const q = queuedFiles[i];
                  if (!q || !q.publicUrl) return null;
                  const draft = metadataDrafts[i] ?? {};
                  const isSelected = selectedIndices.has(i);
                  const isFocused = focusedIndex === i;
                  const hasTags = (draft.roomTypeIds && draft.roomTypeIds.length > 0) || (draft.tags && draft.tags.length > 0);
                  return (
                    <div
                      key={i}
                      className={`relative cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
                        isFocused
                          ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                          : isSelected
                          ? "border-zinc-900 dark:border-zinc-100"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(i)}
                          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                        />
                      </div>
                      {/* Thumbnail */}
                      <div
                        className="aspect-square bg-zinc-100 dark:bg-zinc-800"
                        onClick={() => setFocusedIndex(isFocused ? null : i)}
                      >
                        <img
                          src={q.publicUrl}
                          alt={q.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {/* Tag chips overlay */}
                      {hasTags && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                          <div className="flex flex-wrap gap-0.5">
                            {(draft.roomTypeIds ?? []).slice(0, 2).map((s) => (
                              <span key={s} className="rounded bg-blue-500/80 px-1 py-0.5 text-[10px] text-white">
                                {s}
                              </span>
                            ))}
                            {(draft.tags ?? []).slice(0, 2).map((t) => (
                              <span key={t} className="rounded bg-zinc-500/80 px-1 py-0.5 text-[10px] text-white">
                                {t}
                              </span>
                            ))}
                            {((draft.roomTypeIds?.length ?? 0) + (draft.tags?.length ?? 0)) > 4 && (
                              <span className="text-[10px] text-zinc-300">
                                +{(draft.roomTypeIds?.length ?? 0) + (draft.tags?.length ?? 0) - 4}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Focused photo inline editor */}
              {focusedIndex !== null && (() => {
                const q = queuedFiles[focusedIndex];
                if (!q || !q.publicUrl) return null;
                const draft = metadataDrafts[focusedIndex] ?? {};
                const setDraft = (up: Partial<FinalizeLibraryMediaInput>) =>
                  setMetadataDrafts((prev) => ({
                    ...prev,
                    [focusedIndex]: { ...prev[focusedIndex], ...up },
                  }));
                return (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        Editing: {q.file.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setFocusedIndex(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Close
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                      <div className="aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        <img
                          src={q.publicUrl}
                          alt={q.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-3">
                        <SectionsField
                          value={draft.roomTypeIds ?? []}
                          onChange={(roomTypeIds) => setDraft({ roomTypeIds })}
                        />
                        <HybridTagsField
                          value={draft.tags ?? []}
                          learnedTags={learnedTags}
                          onChange={(updater) =>
                            setMetadataDrafts((prev) => {
                              const current = prev[focusedIndex] ?? {};
                              const nextTags = updater(current.tags ?? []);
                              return { ...prev, [focusedIndex]: { ...current, tags: nextTags } };
                            })
                          }
                          maxChipsDisplay={8}
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                              Use type
                            </span>
                            <select
                              value={draft.useType ?? "AFTER"}
                              onChange={(e) =>
                                setDraft({ useType: e.target.value as FinalizeLibraryMediaInput["useType"] })
                              }
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              {USE_TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                              Quality
                            </span>
                            <select
                              value={draft.quality ?? "STANDARD"}
                              onChange={(e) =>
                                setDraft({ quality: e.target.value as FinalizeLibraryMediaInput["quality"] })
                              }
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              {QUALITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-end gap-2 pb-1">
                            <input
                              type="checkbox"
                              checked={draft.marketingApproved ?? true}
                              onChange={(e) => setDraft({ marketingApproved: e.target.checked })}
                              className="rounded border-zinc-300 dark:border-zinc-600"
                            />
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">
                              Marketing approved
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Footer actions */}
              <div className="flex justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                >
                  Skip tagging
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving || doneIndices.length === 0}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {saving ? "Saving…" : `Save all ${doneIndices.length} photos`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({
  item,
  draft,
  setDraft,
  onSave,
  onDelete,
  onClose,
  learnedTags,
}: {
  item: LibraryMediaItem;
  draft: Partial<LibraryMediaItem>;
  setDraft: React.Dispatch<React.SetStateAction<Partial<LibraryMediaItem>>>;
  onSave: () => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
  learnedTags: string[];
}) {
  const [saving, setSaving] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestResult, setSuggestResult] = useState<SuggestLibraryMediaTagsResult | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageUrl = item.thumbnailUrl ?? item.url;
  const mediaKey = item.id;

  const fetchSuggestionsForDetail = useCallback(async () => {
    const signature = buildSuggestSignature({
      title: draft.title,
      notes: draft.description,
      sections: draft.roomTypeIds ?? [],
      tags: draft.tags ?? [],
      mediaKey,
    });
    const cached = suggestionsCache.get(mediaKey);
    if (cached && cached.signature === signature) {
      setSuggestResult(cached.data);
      setSuggestError(null);
      return;
    }
    setSuggestLoading(true);
    setSuggestError(null);
    const res = await suggestLibraryMediaTagsAction({
      libraryMediaId: item.id,
      imageUrl: item.url ?? undefined,
      fileKey: item.fileKey ?? undefined,
      title: draft.title ?? undefined,
      description: draft.description ?? undefined,
      currentSectionIds: draft.roomTypeIds ?? [],
      currentTags: draft.tags ?? [],
    });
    setSuggestLoading(false);
    if (res.error) {
      setSuggestError(res.error);
      setSuggestResult(null);
      return;
    }
    if (res.data) {
      setSuggestResult(res.data);
      setSuggestError(null);
      suggestionsCache.set(mediaKey, { data: res.data, signature });
    }
  }, [item.id, item.url, item.fileKey, draft.title, draft.description, draft.roomTypeIds, draft.tags]);

  useEffect(() => {
    setSuggestionsDismissed(false);
    setSuggestError(null);
    fetchSuggestionsForDetail();
  }, [item.id, fetchSuggestionsForDetail]);

  useEffect(() => {
    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    detailDebounceRef.current = setTimeout(() => {
      detailDebounceRef.current = null;
      fetchSuggestionsForDetail();
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    };
  }, [
    draft.title,
    draft.description,
    draft.roomTypeIds,
    draft.tags,
  ]);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-x-hidden overflow-y-auto border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Edit photo
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>
      <div className="min-w-0 space-y-4 p-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <img
            src={imageUrl}
            alt="Library photo"
            className="h-full w-full object-contain"
          />
        </div>
        <SectionsField
          value={draft.roomTypeIds ?? []}
          onChange={(roomTypeIds) => setDraft((d) => ({ ...d, roomTypeIds }))}
        />
        <HybridTagsField
          value={draft.tags ?? []}
          learnedTags={learnedTags}
          onChange={(updater) =>
            setDraft((d) => {
              const prevTags = d.tags ?? [];
              const nextTags = updater(prevTags);
              return { ...d, tags: nextTags };
            })
          }
        />
        {suggestLoading && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Suggesting…</p>
        )}
        {suggestError && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Couldn&apos;t load suggestions.{" "}
            <button
              type="button"
              onClick={() => fetchSuggestionsForDetail()}
              className="underline hover:no-underline"
            >
              Retry
            </button>
          </p>
        )}
        {suggestResult && !suggestionsDismissed && (
          <SuggestionsBlock
            result={suggestResult}
            currentSections={draft.roomTypeIds ?? []}
            currentTags={draft.tags ?? []}
            currentUseType={draft.useType ?? item.useType}
            currentQuality={draft.quality ?? item.quality}
            onSectionsChange={(roomTypeIds) => setDraft((d) => ({ ...d, roomTypeIds }))}
            onTagsChange={(tags) => setDraft((d) => ({ ...d, tags }))}
            onUseTypeChange={(v) => setDraft((d) => ({ ...d, useType: v }))}
            onQualityChange={(v) => setDraft((d) => ({ ...d, quality: v }))}
            onDismiss={() => setSuggestionsDismissed(true)}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Use type
            </span>
            <select
              value={draft.useType ?? item.useType}
              onChange={(e) => setDraft((d) => ({ ...d, useType: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {USE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Quality
            </span>
            <select
              value={draft.quality ?? item.quality}
              onChange={(e) => setDraft((d) => ({ ...d, quality: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Orientation: <strong>{ORIENTATION_OPTIONS.find((o) => o.value === item.orientation)?.label ?? item.orientation}</strong> (set from image dimensions, not editable)
        </p>
        <label className="block">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.marketingApproved ?? false}
              onChange={(e) => setDraft((d) => ({ ...d, marketingApproved: e.target.checked }))}
              className="rounded border-zinc-300 dark:border-zinc-600"
            />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Marketing approved
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            If checked, this photo can be used in client-facing presentations and marketing.
          </p>
        </label>
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Created</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {new Date(item.createdAt).toLocaleString()}
          </p>
          <p className="mt-2 mb-1 text-xs text-zinc-500 dark:text-zinc-400">Object key</p>
          <p className="break-all text-xs text-zinc-600 dark:text-zinc-400">{item.fileKey}</p>
          <p className="mt-2 mb-1 text-xs text-zinc-500 dark:text-zinc-400">URL</p>
          <p className="break-all text-xs text-zinc-600 dark:text-zinc-400 truncate" title={item.url}>
            {item.url}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-4">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              await onSave();
              setSaving(false);
            }}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

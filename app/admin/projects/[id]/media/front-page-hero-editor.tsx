"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  getPresignedUploadUrlAction,
  createMediaAction,
  startHeroRenderAction,
  setProjectHeroMediaAction,
  clearCoverHeroAction,
  deleteHeroRenderAction,
} from "./actions";
import { ChangesDetectedSummary } from "./changes-detected-summary";
import { HERO_PRESETS, HERO_PRESET_LABELS, type HeroPresetKey } from "./hero-presets";
import { MediaType } from "@/app/generated/prisma";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

const POLL_INTERVAL_MS = 7000;
const MAX_HERO_VERSIONS_PER_SOURCE = 3;

type MediaItem = {
  id: string;
  createdAt: Date | string;
  type: string;
  kind?: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  sortOrder: number;
  room: { id: string; name: string } | null;
  fileKey?: string;
  sourceMediaId?: string | null;
  parentMediaId?: string | null;
  editInstruction?: string | null;
  renderStatus?: string | null;
  renderError?: string | null;
};

function isLegacyBlobUrl(url: string): boolean {
  return url.includes("blob.vercel-storage.com");
}

function getNormalizedRenderStatus(render: MediaItem): string {
  return render.renderStatus ?? (render.url ? "DONE" : "PENDING");
}

function getCoverSourceTooltip(m: MediaItem, typeLabel: string): string {
  const from = m.room?.name ?? "Front Page";
  const lines = [`From: ${from}`, `Type: ${typeLabel}`];
  if (m.createdAt) {
    const d = typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt;
    if (!Number.isNaN(d.getTime())) {
      lines.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
    }
  }
  return lines.join("\n");
}

function CoverSourceThumb({
  media: m,
  isSelected,
  onSelect,
  typeLabel,
}: {
  media: MediaItem;
  isSelected: boolean;
  onSelect: () => void;
  typeLabel: "Existing" | "Rendered";
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
        isSelected ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-600"
      }`}
      title={getCoverSourceTooltip(m, typeLabel)}
    >
      {isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
        <img src={m.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Image
          src={m.url}
          alt=""
          fill
          className="object-cover"
          sizes="56px"
          unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")}
        />
      )}
    </button>
  );
}

type Props = {
  projectId: string;
  media: MediaItem[];
  coverHeroImageId: string | null;
};

export function FrontPageHeroEditor({ projectId, media, coverHeroImageId }: Props) {
  const router = useRouter();
  const [activeSourceMediaId, setActiveSourceMediaId] = useState<string | null>(null);
  const [activeRenderMediaId, setActiveRenderMediaId] = useState<string | null>(null);
  const [heroPresets, setHeroPresets] = useState<Set<HeroPresetKey>>(new Set());
  const [heroInstructions, setHeroInstructions] = useState("");
  const [heroRenderError, setHeroRenderError] = useState<string | null>(null);
  const [heroRendering, setHeroRendering] = useState(false);
  const [optimisticHeroRenders, setOptimisticHeroRenders] = useState<MediaItem[]>([]);

  // Cover sources: split into Existing (non-RENDERING) and Rendered (section RENDERING only).
  const frontPagePhotos = media.filter(
    (m) => m.roomId == null && m.type !== MediaType.RENDERING
  );
  const sectionExisting = media.filter(
    (m) => m.roomId != null && m.type !== MediaType.RENDERING
  );
  const sectionRendered = media.filter(
    (m) =>
      m.roomId != null &&
      m.type === MediaType.RENDERING &&
      m.url != null &&
      m.url !== "" &&
      !isBadPlaceholderUrl(m.url)
  );
  const hasValidUrl = (m: MediaItem) => m.url != null && m.url !== "" && !isBadPlaceholderUrl(m.url);
  // Existing Photos: Front Page + Section, type !== RENDERING, with url
  const existingSourceItems = [...frontPagePhotos, ...sectionExisting].filter(hasValidUrl);
  // Rendered Photos: section renderings only (roomId != null); COVER/roomId null are in Versions
  const renderedSourceItems = sectionRendered;
  const eligibleSources = [...existingSourceItems, ...renderedSourceItems];
  // Hero render versions: RENDERING, kind COVER, roomId null
  const heroRenders = media
    .filter(
      (m) =>
        m.type === MediaType.RENDERING &&
        m.kind === "COVER" &&
        m.roomId == null
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const heroRendersWithOptimistic = (() => {
    const serverIds = new Set(heroRenders.map((m) => m.id));
    const extra = optimisticHeroRenders.filter((o) => !serverIds.has(o.id));
    if (!extra.length) return heroRenders;
    return [...heroRenders, ...extra].sort(
      (a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  })();

  const allVersionsForSource =
    activeSourceMediaId == null
      ? []
      : heroRendersWithOptimistic
          .filter((m) => m.sourceMediaId === activeSourceMediaId)
          .sort((a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const versionsForSource = allVersionsForSource.slice(0, MAX_HERO_VERSIONS_PER_SOURCE);
  const versionCount = allVersionsForSource.length;
  const canAddVersion = versionCount < MAX_HERO_VERSIONS_PER_SOURCE;

  const selectedSource = activeSourceMediaId ? eligibleSources.find((m) => m.id === activeSourceMediaId) : null;
  const viewedRender =
    activeRenderMediaId && heroRendersWithOptimistic.some((m) => m.id === activeRenderMediaId)
      ? heroRendersWithOptimistic.find((m) => m.id === activeRenderMediaId) ?? null
      : allVersionsForSource[0] ?? null;

  // Concept grouping: one box per source that has at least one COVER version
  const sourceIdsWithVersions = Array.from(
    new Set(heroRendersWithOptimistic.map((m) => m.sourceMediaId).filter(Boolean)) as Set<string>
  );
  const conceptGroups = sourceIdsWithVersions.map((sourceId) => {
    const versions = heroRendersWithOptimistic
      .filter((m) => m.sourceMediaId === sourceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const sourceMedia = media.find((m) => m.id === sourceId);
    return {
      sourceId,
      sourceMedia: sourceMedia ?? null,
      versions,
      canAddVersion: versions.length < MAX_HERO_VERSIONS_PER_SOURCE,
    };
  });

  const hasPending = heroRendersWithOptimistic.some(
    (m) => getNormalizedRenderStatus(m) === "QUEUED" || getNormalizedRenderStatus(m) === "RENDERING"
  );

  useEffect(() => {
    const serverIds = new Set(media.filter((m) => m.type === MediaType.RENDERING).map((m) => m.id));
    setOptimisticHeroRenders((prev) => prev.filter((o) => !serverIds.has(o.id)));
  }, [media]);

  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasPending, router]);

  useEffect(() => {
    const firstId = eligibleSources[0]?.id ?? null;
    setActiveSourceMediaId((prev) => {
      if (prev && eligibleSources.some((m) => m.id === prev)) return prev;
      return firstId;
    });
  }, [eligibleSources]);

  // Only sync viewing (activeRenderMediaId) when source or version list changes; don't overwrite user's click on v2
  const versionIdsKey = versionsForSource.map((m) => m.id).join(",");
  useEffect(() => {
    const inVersions = (id: string) => versionsForSource.some((m) => m.id === id);
    const defaultId =
      coverHeroImageId && inVersions(coverHeroImageId)
        ? coverHeroImageId
        : versionsForSource.find((m) => getNormalizedRenderStatus(m) === "DONE")?.id ?? versionsForSource[0]?.id ?? null;
    setActiveRenderMediaId((prev) => {
      if (prev && inVersions(prev)) return prev;
      return defaultId;
    });
  }, [activeSourceMediaId, versionIdsKey]);

  function togglePreset(key: HeroPresetKey) {
    setHeroPresets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleUpdateForSource(sourceMediaId: string) {
    if (heroRendering) return;
    const sourceMedia = media.find((m) => m.id === sourceMediaId);
    if (!sourceMedia?.url?.trim()) {
      setHeroRenderError("Source has no image.");
      return;
    }
    const group = conceptGroups.find((g) => g.sourceId === sourceMediaId);
    if (group && !group.canAddVersion) {
      setHeroRenderError("Max 3 versions per source. Delete one to add another.");
      return;
    }
    setHeroRendering(true);
    setHeroRenderError(null);
    const result = await startHeroRenderAction(
      projectId,
      sourceMediaId,
      Array.from(heroPresets),
      heroInstructions.trim()
    );
    setHeroRendering(false);
    if ("error" in result) {
      setHeroRenderError(result.error);
      return;
    }
    const newId = result.mediaId ?? result.id;
    const placeholder: MediaItem = {
      id: newId,
      createdAt: new Date().toISOString(),
      type: MediaType.RENDERING,
      caption: null,
      tags: [],
      roomId: null,
      url: result.url ?? "",
      sortOrder: heroRendersWithOptimistic.length,
      room: null,
      sourceMediaId,
      parentMediaId: sourceMediaId,
      renderStatus: (result.renderStatus as string) ?? "DONE",
    };
    setOptimisticHeroRenders((prev) => [...prev, placeholder]);
    setActiveSourceMediaId(sourceMediaId);
    setActiveRenderMediaId(newId);
    router.refresh();
  }

  async function handleSetSelected(mediaId: string) {
    setHeroRenderError(null);
    const err = await setProjectHeroMediaAction(projectId, mediaId);
    if (err?.error) setHeroRenderError(err.error);
    else router.refresh();
  }

  async function handleClearSelected() {
    setHeroRenderError(null);
    const err = await clearCoverHeroAction(projectId);
    if (err?.error) setHeroRenderError(err.error);
    else router.refresh();
  }

  async function handleDelete(mediaId: string) {
    if (!confirm("Delete this hero rendering?")) return;
    const err = await deleteHeroRenderAction(projectId, mediaId);
    if (err?.error) setHeroRenderError(err.error);
    else {
      if (activeRenderMediaId === mediaId) {
        const remaining = heroRendersWithOptimistic.filter((m) => m.id !== mediaId);
        setActiveRenderMediaId(remaining[0]?.id ?? null);
      }
      router.refresh();
    }
  }

  const viewedStatus = viewedRender ? getNormalizedRenderStatus(viewedRender) : null;
  const showSpinner =
    viewedRender &&
    ((viewedStatus === "QUEUED" || viewedStatus === "RENDERING") || isBadPlaceholderUrl(viewedRender.url));
  const usePlainImg =
    viewedRender &&
    !showSpinner &&
    (isLegacyBlobUrl(viewedRender.url) || !isAllowedHostForNextImage(viewedRender.url));

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Front Page</h2>

      {/* 1) Upload + source thumbnails */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
        <h3 className="mb-2 text-base font-medium text-zinc-900 dark:text-zinc-100">Front Page Photos</h3>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Project-level photos for the cover. Select a source below to view, set as cover, or render.
        </p>
        <FrontPageUploadButton projectId={projectId} onSuccess={() => router.refresh()} onError={setHeroRenderError} />
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">Source (Existing & Rendered)</p>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Click a thumbnail to use as the hero source.
          </p>
          <div className="flex flex-wrap gap-2">
            {existingSourceItems.length === 0 && renderedSourceItems.length === 0 ? (
              <p className="text-sm text-zinc-500">None yet. Upload above or add section photos in a section.</p>
            ) : (
              <>
                {existingSourceItems.map((m) => (
                  <CoverSourceThumb
                    key={m.id}
                    media={m}
                    isSelected={m.id === activeSourceMediaId}
                    onSelect={() => setActiveSourceMediaId(m.id)}
                    typeLabel="Existing"
                  />
                ))}
                {renderedSourceItems.map((m) => (
                  <CoverSourceThumb
                    key={m.id}
                    media={m}
                    isSelected={m.id === activeSourceMediaId}
                    onSelect={() => setActiveSourceMediaId(m.id)}
                    typeLabel="Rendered"
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2) Large Before and Render */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Before</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
            {selectedSource ? (
              isLegacyBlobUrl(selectedSource.url) || !isAllowedHostForNextImage(selectedSource.url) ? (
                <img src={selectedSource.url} alt="Before" className="h-full w-full object-cover" />
              ) : (
                <Image
                  src={selectedSource.url}
                  alt="Before"
                  fill
                  className="object-cover"
                  sizes="(max-width:768px) 50vw, 25vw"
                  unoptimized={selectedSource.url.startsWith("blob:") || !selectedSource.url.startsWith("http")}
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Select a source above
              </div>
            )}
          </div>
          {activeSourceMediaId && selectedSource?.url && !isBadPlaceholderUrl(selectedSource.url) && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => handleSetSelected(activeSourceMediaId)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Set as Cover (No Render)
              </button>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Render</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
            {viewedRender ? (
              showSpinner ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                  {viewedStatus === "QUEUED" ? "Queued…" : "Rendering…"}
                </div>
              ) : usePlainImg ? (
                <img src={viewedRender.url} alt="Render" className="h-full w-full object-cover" />
              ) : (
                <Image
                  src={viewedRender.url}
                  alt="Render"
                  fill
                  className="object-cover"
                  sizes="(max-width:768px) 50vw, 25vw"
                  unoptimized={viewedRender.url.startsWith("blob:") || !viewedRender.url.startsWith("http")}
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                {activeSourceMediaId ? "No versions yet. Use Update below." : "Select a source above"}
              </div>
            )}
          </div>
          {viewedRender && !showSpinner && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {coverHeroImageId === viewedRender.id ? (
                <button
                  type="button"
                  onClick={handleClearSelected}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Clear Selected
                </button>
              ) : getNormalizedRenderStatus(viewedRender) === "DONE" ? (
                <button
                  type="button"
                  onClick={() => handleSetSelected(viewedRender.id)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Selected for Proposal
                </button>
              ) : null}
              {viewedRender.url && !isBadPlaceholderUrl(viewedRender.url) && (
                <a
                  href={viewedRender.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  Download
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(viewedRender.id)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Delete
              </button>
            </div>
          )}
          {viewedRender?.sourceMediaId && !showSpinner && viewedRender.url && (
            <ChangesDetectedSummary
              projectId={projectId}
              sourceMediaId={viewedRender.sourceMediaId}
              renderMediaId={viewedRender.id}
            />
          )}
        </div>
      </div>

      {/* 3) AI Update Settings — presets, prompt, Render button */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
        <h3 className="mb-3 text-base font-medium text-zinc-900 dark:text-zinc-100">AI Update Settings</h3>
        {heroRenderError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{heroRenderError}</p>}
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
          {HERO_PRESETS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={heroPresets.has(key)}
                onChange={() => togglePreset(key)}
                className="rounded border-zinc-300"
              />
              {HERO_PRESET_LABELS[key]}
            </label>
          ))}
        </div>
        <textarea
          value={heroInstructions}
          onChange={(e) => setHeroInstructions(e.target.value)}
          placeholder="e.g. Make the sky more dramatic, remove the person in the corner…"
          rows={2}
          className="mb-3 w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={!activeSourceMediaId || heroRendering}
          onClick={() => activeSourceMediaId && handleUpdateForSource(activeSourceMediaId)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {heroRendering ? "Rendering…" : "Update (Render New)"}
        </button>
      </div>

      {/* 4) Versions — only when versions exist */}
      {conceptGroups.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Versions</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {conceptGroups.map((group) => {
              const viewingInGroup = group.versions.find((m) => m.id === activeRenderMediaId);
              const selectedInGroupMedia = coverHeroImageId ? group.versions.find((v) => v.id === coverHeroImageId) : null;
              const conceptActiveMediaId =
                viewingInGroup ??
                selectedInGroupMedia ??
                group.versions.find((m) => getNormalizedRenderStatus(m) === "DONE") ??
                group.versions[0] ??
                null;
              const selectedInGroup = coverHeroImageId && group.versions.some((v) => v.id === coverHeroImageId);
              return (
                <div
                  key={group.sourceId}
                  className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      From: {group.sourceMedia?.room?.name ?? "Front Page"}
                    </p>
                    {group.versions.some((v) => v.id === activeRenderMediaId) && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                        Viewing
                      </span>
                    )}
                    {selectedInGroup && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                        Selected for Proposal
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
                    {group.versions.map((m, idx) => {
                      const isViewing = m.id === activeRenderMediaId;
                      const isSelected = coverHeroImageId === m.id;
                      const status = getNormalizedRenderStatus(m);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setActiveSourceMediaId(group.sourceId);
                            setActiveRenderMediaId(m.id);
                          }}
                          className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border-2 transition-shadow ${
                            isViewing ? "ring-2 ring-blue-600 ring-offset-1 border-blue-500 dark:ring-offset-zinc-900" : isSelected ? "ring-2 ring-green-500 ring-offset-1 border-green-500 dark:ring-offset-zinc-900" : "border-zinc-200 dark:border-zinc-600"
                          }`}
                        >
                          {status === "QUEUED" || status === "RENDERING" ? (
                            <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-100 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                              Generating…
                            </span>
                          ) : status === "FAILED" ? (
                            <span className="flex h-full w-full items-center justify-center bg-red-100 text-xs dark:bg-red-900/50 dark:text-red-300">✕</span>
                          ) : !isBadPlaceholderUrl(m.url) ? (
                            isLegacyBlobUrl(m.url) || !isAllowedHostForNextImage(m.url) ? (
                              <img src={m.url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Image src={m.url} alt="" fill className="object-cover" sizes="72px" unoptimized={m.url.startsWith("blob:") || !m.url.startsWith("http")} />
                            )
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-zinc-100 text-[10px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">No image</span>
                          )}
                          {isSelected && (
                            <span className="absolute bottom-0 left-0 right-0 bg-green-600 py-0.5 text-center text-[10px] font-medium text-white">Selected for Proposal</span>
                          )}
                          <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">v{idx + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FrontPageUploadButton({
  projectId,
  onSuccess,
  onError,
}: {
  projectId: string;
  onSuccess: () => void;
  onError: (s: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    e.target.value = "";
    setUploading(true);
    onError(null);
    for (const file of files) {
      try {
        const result = await getPresignedUploadUrlAction(
          projectId,
          file.name,
          file.type || "application/octet-stream"
        );
        if ("error" in result) {
          onError(result.error);
          continue;
        }
        const putRes = await fetch(result.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) {
          onError("Upload failed: " + putRes.statusText);
          continue;
        }
        const formData = new FormData();
        formData.set("projectId", projectId);
        formData.set("fileKey", result.fileKey);
        formData.set("url", result.publicUrl);
        formData.set("type", MediaType.EXISTING);
        formData.set("roomId", ""); // project-level: roomId null
        formData.set("placement", "FRONT_PAGE");
        const res = await createMediaAction(formData);
        if (res.error) onError(res.error);
        else onSuccess();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setUploading(false);
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={uploading}
        onChange={handleFile}
      />
      {uploading ? "Uploading…" : "Upload Front Page Photo(s)"}
    </label>
  );
}

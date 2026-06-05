"use client";

import { useState, useCallback, useEffect } from "react";
import { RendrDashboard } from "./rendr-dashboard";
import { RendrProjectsPage } from "./rendr-projects-page";
import { RendrSpacesPage } from "./rendr-spaces-page";
import { RendrMatchingTable, type ExtendedMapping } from "./rendr-matching-table";
import { RendrFloorPlan } from "./rendr-floor-plan";
import { linkRendrProject, unlinkRendrProject, importRendrMeasurements, previewRendrResync, executeRendrResync, type ResyncDiff } from "./rendr-actions";
import type { ImperialTakeoffData } from "@/app/lib/rendr/types";
import type { LinkedSpace } from "@/app/lib/rendr/linkedSpaces";

type AppRoom = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string };
type ActivePage = "dashboard" | "projects" | "spaces";
type SpaceTab = "floorplan" | "photos" | "rooms" | "about";

type Props = {
  projectId: string;
  rendrSpaces: LinkedSpace[];
  rendrProjectId: number | null;
  rendrImportedAt: string | null;
  rooms: AppRoom[];
  sectionTypes: SectionTypeOption[];
};

const NAV_ITEMS: { key: ActivePage; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg> },
  { key: "projects", label: "Projects", icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg> },
  { key: "spaces", label: "Spaces", icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m10.5-6v4.5m0-4.5h-4.5m4.5 0L15 9m-10.5 6v4.5m0-4.5h4.5m-4.5 4.5L9 15m10.5 6v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg> },
];

const SPACE_TABS: { key: SpaceTab; label: string }[] = [
  { key: "rooms", label: "Rooms" },
  { key: "floorplan", label: "Floor Plan" },
  { key: "photos", label: "Photos" },
  { key: "about", label: "About" },
];

// ---------------------------------------------------------------------------
// Photo type for space detail
// ---------------------------------------------------------------------------
interface SpacePhoto { id: string; created: string; }

export function RendrShell({ projectId, rendrSpaces, rendrProjectId, rendrImportedAt, rooms, sectionTypes }: Props) {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [linkedSpaces, setLinkedSpaces] = useState<LinkedSpace[]>(rendrSpaces);
  const [linkedProjectId, setLinkedProjectId] = useState(rendrProjectId);
  const [importedAt, setImportedAt] = useState(rendrImportedAt);
  // Active space within the linked detail view (the space switcher).
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(rendrSpaces[0]?.spaceId ?? null);
  // Takeoff per linked space (one scan per floor), keyed by spaceId.
  const [takeoffBySpace, setTakeoffBySpace] = useState<Record<number, ImperialTakeoffData>>({});
  const [showMatching, setShowMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Linked space detail state (for the active space)
  const [spaceTab, setSpaceTab] = useState<SpaceTab>("rooms");
  const [photos, setPhotos] = useState<SpacePhoto[]>([]);
  const [spaceDetail, setSpaceDetail] = useState<{ title: string; notes: string; saved_date: string; field_notes: string | null } | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Re-sync state
  const [resyncDiffs, setResyncDiffs] = useState<ResyncDiff[] | null>(null);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [resyncSelectedIds, setResyncSelectedIds] = useState<Set<string>>(new Set());

  // Fetch takeoff for every linked space (used by the combined matching table and
  // the active-space Rooms tab).
  useEffect(() => {
    if (linkedSpaces.length === 0) {
      setTakeoffBySpace({});
      return;
    }
    let cancelled = false;
    Promise.all(
      linkedSpaces.map(async (s) => {
        try {
          const r = await fetch(`/api/rendr/spaces/${s.spaceId}/takeoff`);
          const d = await r.json();
          if (d.error) return null;
          return [s.spaceId, d as ImperialTakeoffData] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<number, ImperialTakeoffData> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setTakeoffBySpace(map);
    });
    return () => { cancelled = true; };
  }, [linkedSpaces]);

  // Fetch detail + photos for the active space.
  useEffect(() => {
    if (activeSpaceId == null) return;
    setPhotosLoading(true);
    setPhotos([]);
    setSpaceDetail(null);
    fetch(`/api/rendr/spaces/${activeSpaceId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.photos) setPhotos(d.photos);
        setSpaceDetail({ title: d.title ?? "", notes: d.notes ?? "", saved_date: d.saved_date ?? "", field_notes: d.field_notes ?? null });
      })
      .catch(() => {})
      .finally(() => setPhotosLoading(false));
  }, [activeSpaceId]);

  const handleLink = useCallback(async (rendrProjId: number | null, spaces: LinkedSpace[]) => {
    try {
      await linkRendrProject(projectId, rendrProjId, spaces);
      setLinkedProjectId(rendrProjId);
      setLinkedSpaces(spaces);
      setActiveSpaceId(spaces[0]?.spaceId ?? null);
      setImportedAt(null);
      setSpaceTab("rooms");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link");
    }
  }, [projectId]);

  const handleUnlink = useCallback(async () => {
    try {
      await unlinkRendrProject(projectId);
      setLinkedSpaces([]);
      setLinkedProjectId(null);
      setActiveSpaceId(null);
      setTakeoffBySpace({});
      setImportedAt(null);
      setSpaceDetail(null);
      setPhotos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink");
    }
  }, [projectId]);

  const handleImport = useCallback(async (
    mappings: ExtendedMapping[],
  ) => {
    try {
      await importRendrMeasurements(projectId, mappings);
      setImportedAt(new Date().toISOString());
      setShowMatching(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }, [projectId]);

  const handlePreviewResync = useCallback(async () => {
    setResyncLoading(true);
    try {
      const diffs = await previewRendrResync(projectId);
      setResyncDiffs(diffs);
      // Auto-select non-manually-edited sections
      setResyncSelectedIds(new Set(diffs.filter((d) => !d.wasManuallyEdited).map((d) => d.roomId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview resync");
    } finally {
      setResyncLoading(false);
    }
  }, [projectId]);

  const handleExecuteResync = useCallback(async () => {
    if (resyncSelectedIds.size === 0) return;
    setResyncLoading(true);
    try {
      await executeRendrResync(projectId, [...resyncSelectedIds]);
      setImportedAt(new Date().toISOString());
      setResyncDiffs(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-sync failed");
    } finally {
      setResyncLoading(false);
    }
  }, [projectId, resyncSelectedIds]);

  // Check if any rooms have Rendr mappings (for showing re-sync button)
  const hasRendrMappings = rooms.length > 0 && importedAt;
  // Takeoff data for the currently-viewed space.
  const activeTakeoff = activeSpaceId != null ? takeoffBySpace[activeSpaceId] ?? null : null;
  // All linked spaces have takeoff loaded → combined import is ready.
  const allTakeoffsLoaded = linkedSpaces.length > 0 && linkedSpaces.every((s) => takeoffBySpace[s.spaceId]);
  const multiSpace = linkedSpaces.length > 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // LINKED STATE — Show space detail directly (no sidebar)
  // ═══════════════════════════════════════════════════════════════════════════
  if (linkedSpaces.length > 0) {
    // Re-sync diff overlay
    if (resyncDiffs !== null) {
      return (
        <div className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Re-sync from Rendr — Review Changes
          </h3>
          {resyncDiffs.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              All measurements are up to date. No changes needed.
            </div>
          ) : (
            <div className="space-y-4">
              {resyncDiffs.map((diff) => (
                <div key={diff.roomId} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <div className="mb-2 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={resyncSelectedIds.has(diff.roomId)}
                      onChange={(e) => {
                        const next = new Set(resyncSelectedIds);
                        if (e.target.checked) next.add(diff.roomId);
                        else next.delete(diff.roomId);
                        setResyncSelectedIds(next);
                      }}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{diff.roomName}</span>
                    {diff.wasManuallyEdited && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Manually edited
                      </span>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-500 dark:text-zinc-400">
                        <th className="pb-1 text-left font-medium">Field</th>
                        <th className="pb-1 text-right font-medium">Current</th>
                        <th className="pb-1 text-right font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.changes.map((c) => (
                        <tr key={c.field} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="py-1 text-zinc-700 dark:text-zinc-300">{c.field}</td>
                          <td className="py-1 text-right text-zinc-500">{c.current ?? "—"}</td>
                          <td className="py-1 text-right font-medium text-zinc-900 dark:text-zinc-100">{c.updated ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setResyncDiffs(null)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            {resyncDiffs.length > 0 && (
              <button
                onClick={handleExecuteResync}
                disabled={resyncLoading || resyncSelectedIds.size === 0}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {resyncLoading ? "Syncing..." : `Update ${resyncSelectedIds.size} section(s)`}
              </button>
            )}
          </div>
        </div>
      );
    }

    // Matching table overlay — combined across all linked spaces
    if (showMatching && allTakeoffsLoaded) {
      return (
        <div className="p-6">
          <RendrMatchingTable
            spaces={linkedSpaces}
            takeoffBySpace={takeoffBySpace}
            appRooms={rooms}
            sectionTypes={sectionTypes}
            projectId={projectId}
            onConfirm={handleImport}
            onCancel={() => setShowMatching(false)}
          />
        </div>
      );
    }

    const activeLabel = linkedSpaces.find((s) => s.spaceId === activeSpaceId)?.label ?? "";
    const spaceTitle = spaceDetail?.title || activeLabel || (activeSpaceId != null ? `Space #${activeSpaceId}` : "Rendr Scans");

    return (
      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{spaceTitle}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {multiSpace ? `${linkedSpaces.length} spaces linked to this project` : "Linked to this project"}
              {importedAt && <span className="ml-2 text-green-600 dark:text-green-400">· Measurements imported</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {hasRendrMappings && (
              <button
                onClick={handlePreviewResync}
                disabled={resyncLoading}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {resyncLoading ? "Loading..." : "Re-sync from Rendr"}
              </button>
            )}
            <button
              onClick={() => setShowMatching(true)}
              disabled={!allTakeoffsLoaded}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {!allTakeoffsLoaded ? "Loading…" : importedAt ? "Re-import Measurements" : "Import Measurements"}
            </button>
            <button
              onClick={handleUnlink}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              Unlink from Project
            </button>
          </div>
        </div>

        {/* Space switcher — one tab per linked space (floor) */}
        {multiSpace && (
          <div className="mb-4 flex flex-wrap gap-2">
            {linkedSpaces.map((s) => (
              <button
                key={s.spaceId}
                onClick={() => { setActiveSpaceId(s.spaceId); setSpaceTab("rooms"); }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeSpaceId === s.spaceId
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          {SPACE_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSpaceTab(key)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                spaceTab === key
                  ? "bg-orange-500 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Floor Plan */}
        {spaceTab === "floorplan" && activeSpaceId != null && (
          <RendrFloorPlan spaceId={activeSpaceId} />
        )}

        {/* Photos */}
        {spaceTab === "photos" && (
          <div>
            {photosLoading ? (
              <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" /> Loading photos...
              </div>
            ) : photos.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">No photos available.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <img
                      src={`/api/rendr/spaces/${activeSpaceId}/photos/${photo.id}`}
                      alt="Space photo"
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                    <div className="px-3 py-2 text-xs text-zinc-400">
                      {new Date(photo.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rooms */}
        {spaceTab === "rooms" && activeTakeoff && (
          <div>
            {activeTakeoff.rooms.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">No room data available.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeTakeoff.rooms.map((room, idx) => {
                  const t = room.takeoff;
                  return (
                    <div key={idx} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
                      <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{room.label}</h4>
                      </div>
                      <div className="px-4 py-3">
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-zinc-500">Area:</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.floorSF} SqFt</span>
                        </div>
                        <div className="mb-3 flex items-center justify-between text-sm">
                          <span className="text-zinc-500">Perimeter:</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.perimeterLF} LnFt</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t.wallsSF > 0 && <Chip label="Walls" sub={`${t.wallsSF} SF`} />}
                          {t.ceilingSF > 0 && <Chip label="Ceiling" sub={`${t.ceilingSF} SF`} />}
                          {t.numberOfWindows > 0 && <Chip label={`${t.numberOfWindows} Win`} sub={t.windowsSF > 0 ? `${t.windowsSF} SF` : undefined} />}
                          {t.numberOfDoors > 0 && <Chip label={`${t.numberOfDoors} Door`} sub={t.doorsSF > 0 ? `${t.doorsSF} SF` : undefined} />}
                          {t.numberOfSinks > 0 && <Chip label={`${t.numberOfSinks} Sink`} />}
                          {t.numberOfToilets > 0 && <Chip label={`${t.numberOfToilets} Toilet`} />}
                          {t.numberOfBathtubs > 0 && <Chip label={`${t.numberOfBathtubs} Tub`} />}
                          {t.numberOfBaseCabinets > 0 && <Chip label={`${t.numberOfBaseCabinets} Base Cab`} sub={`${t.baseCabinetsLF} LF`} />}
                          {t.numberOfWallCabinets > 0 && <Chip label={`${t.numberOfWallCabinets} Wall Cab`} sub={`${t.wallCabinetsLF} LF`} />}
                          {t.countertopsSF > 0 && <Chip label="Counter" sub={`${t.countertopsSF} SF`} />}
                          {t.backsplashSF > 0 && <Chip label="Backsplash" sub={`${t.backsplashSF} SF`} />}
                          {t.numberOfOvens > 0 && <Chip label={`${t.numberOfOvens} Oven`} />}
                          {t.numberOfStoves > 0 && <Chip label={`${t.numberOfStoves} Stove`} />}
                          {t.numberOfRefrigerators > 0 && <Chip label={`${t.numberOfRefrigerators} Fridge`} />}
                          {t.numberOfDishwashers > 0 && <Chip label={`${t.numberOfDishwashers} DW`} />}
                          {t.numberOfFirePlaces > 0 && <Chip label={`${t.numberOfFirePlaces} FP`} />}
                          {t.numberOfStairs > 0 && <Chip label={`${t.numberOfStairs} Stair`} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* About */}
        {spaceTab === "about" && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">Space Information</h3>
            <div className="space-y-4 text-sm">
              <div><span className="text-zinc-500">Space Name:</span> <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{spaceDetail?.title}</span></div>
              {multiSpace && <div><span className="text-zinc-500">Floor Label:</span> <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{activeLabel}</span></div>}
              <div><span className="text-zinc-500">Space ID:</span> <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{activeSpaceId}</span></div>
              {linkedProjectId && <div><span className="text-zinc-500">Rendr Project:</span> <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">#{linkedProjectId}</span></div>}
              <div><span className="text-zinc-500">Notes:</span> <span className="ml-2 text-zinc-900 dark:text-zinc-100">{spaceDetail?.notes || "No notes"}</span></div>
              {spaceDetail?.field_notes && <div><span className="text-zinc-500">Field Notes:</span> <span className="ml-2 text-zinc-900 dark:text-zinc-100">{spaceDetail.field_notes}</span></div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNLINKED STATE — Show sidebar with Dashboard / Projects / Spaces
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex min-h-[500px]">
      {/* ─── Left Sidebar ─── */}
      <div className="flex w-52 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
        {/* Rendr Logo */}
        <div className="flex items-center border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <svg className="h-6" viewBox="0 0 242 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M30 18.011v29.99l29.994-18.002-29.979-11.993-.015.005z" fill="#5068C9"/>
            <path d="M30.015 18.006l29.978 11.993-.01-23.992-29.968 11z" fill="#0047BA"/>
            <path d="M29.994 0L0 6.007l30 12.004.015-.005-.02-.005V0z" fill="#5068C9"/>
            <path d="M29.994 0v18l.02.006 29.97-11.999L29.993 0z" fill="#2F57C2"/>
            <path d="M96.63 18.305h5.145c3.855 0 3.855.816 3.855 1.409v.733c0 .63 0 1.409-3.855 1.409H96.63V18.305zm10.966 6.998c-.175-.346-.34-.66-.568-.97.955-.578 1.936-1.636 1.972-3.891v-.733c0-1.115-.521-4.758-7.225-4.758H93.28v14.986h3.35V25.2h5.145c1.92 0 2.302.769 2.998 2.157l1.29 2.575h3.757l-1.94-4.102c-.108-.191-.196-.372-.284-.537M172.328 24.761l-10.203-9.805h-2.808v14.987h3.35v-9.806l10.208 9.806h2.823V14.956h-3.37v9.805zM200.701 26.573h-4.949v-8.268h4.949c3.53 0 4.5.77 4.5 3.571v1.125c0 2.803-.965 3.572-4.5 3.572zm0-11.617h-8.299v14.987h8.299c5.207 0 7.849-2.333 7.849-6.942v-1.125c0-5.723-4.268-6.92-7.849-6.92zM228.585 18.305h5.145c3.855 0 3.855.816 3.855 1.409v.733c0 .63 0 1.409-3.855 1.409h-5.145v-3.55zm11.25 7.535c-.108-.191-.196-.372-.284-.537a6.676 6.676 0 00-.567-.97c.954-.578 1.935-1.636 1.971-3.891v-.733c0-1.115-.521-4.758-7.225-4.758h-8.495v14.986h3.35V25.2h5.145c1.92 0 2.302.769 2.998 2.162l1.29 2.576h3.758l-1.941-4.103v.005zM126.433 29.943h16.148v-3.37h-12.799v-2.457h10.259v-3.35h-10.259v-2.46h12.799v-3.35h-16.148v14.987z" fill="#12284C"/>
          </svg>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map(({ key, label, icon }) => {
            const isActive = activePage === key;
            return (
              <button
                key={key}
                onClick={() => setActivePage(key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                <span className={isActive ? "text-orange-600 dark:text-orange-400" : ""}>{icon}</span>
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {activePage === "dashboard" && (
          <RendrDashboard onNavigate={setActivePage} />
        )}

        {activePage === "projects" && (
          <RendrProjectsPage onLinkSpaces={handleLink} />
        )}

        {activePage === "spaces" && (
          <RendrSpacesPage onDone={() => setActivePage("projects")} />
        )}
      </div>
    </div>
  );
}

function Chip({ label, sub }: { label: string; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
      {label}
      {sub && <span className="text-zinc-400">({sub})</span>}
    </span>
  );
}

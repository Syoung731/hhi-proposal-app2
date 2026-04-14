"use client";

import { useState, useEffect, useCallback } from "react";
import { RendrProjectBrowser } from "./rendr-project-browser";
import { RendrMatchingTable } from "./rendr-matching-table";
import { linkRendrProject, unlinkRendrProject, importRendrMeasurements } from "./rendr-actions";
import type { ImperialTakeoffData } from "@/app/lib/rendr/types";

type AppRoom = { id: string; name: string };

type Props = {
  projectId: string;
  rendrSpaceId: number | null;
  rendrProjectId: number | null;
  rendrImportedAt: string | null;
  rooms: AppRoom[];
};

type TabState = "empty" | "linked" | "importing" | "imported";

export function RendrTab({ projectId, rendrSpaceId, rendrProjectId, rendrImportedAt, rooms }: Props) {
  const [state, setState] = useState<TabState>(
    rendrImportedAt ? "imported" : rendrSpaceId ? "linked" : "empty",
  );
  const [showBrowser, setShowBrowser] = useState(false);
  const [takeoffData, setTakeoffData] = useState<ImperialTakeoffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedSpaceId, setLinkedSpaceId] = useState(rendrSpaceId);
  const [linkedProjectId, setLinkedProjectId] = useState(rendrProjectId);
  const [importResult, setImportResult] = useState<{ count: number } | null>(
    rendrImportedAt ? { count: rooms.length } : null,
  );
  const [unlinking, setUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  const fetchTakeoff = useCallback(async (spaceId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rendr/spaces/${spaceId}/takeoff`);
      if (!res.ok) throw new Error("Failed to fetch scan data");
      const data = await res.json();
      setTakeoffData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scan data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkedSpaceId && (state === "linked" || state === "imported")) {
      fetchTakeoff(linkedSpaceId);
    }
  }, [linkedSpaceId, state, fetchTakeoff]);

  const handleLink = async (rendrProjId: number, spaceId: number) => {
    try {
      await linkRendrProject(projectId, rendrProjId, spaceId);
      setLinkedProjectId(rendrProjId);
      setLinkedSpaceId(spaceId);
      setState("linked");
      setShowBrowser(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link project");
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      await unlinkRendrProject(projectId);
      setLinkedSpaceId(null);
      setLinkedProjectId(null);
      setTakeoffData(null);
      setImportResult(null);
      setState("empty");
      setShowUnlinkConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink");
    } finally {
      setUnlinking(false);
    }
  };

  const handleImport = async (
    mappings: { rendrRoomIndex: number; appRoomId: string; floorSF: number }[],
  ) => {
    try {
      const result = await importRendrMeasurements(projectId, mappings);
      setImportResult({ count: result.importedCount });
      setState("imported");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  };

  // ─── State A: No scan linked ───
  if (state === "empty" && !showBrowser) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
          <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m10.5-6v4.5m0-4.5h-4.5m4.5 0L15 9m-10.5 6v4.5m0-4.5h4.5m-4.5 4.5L9 15m10.5 6v-4.5m0 4.5h-4.5m4.5 0L15 15" />
          </svg>
        </div>
        <h3 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Connect a Rendr Scan
        </h3>
        <p className="mb-6 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          Link a Rendr project to import LiDAR measurements directly into your room dimensions.
        </p>
        <button
          onClick={() => setShowBrowser(true)}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Browse Rendr Projects
        </button>
      </div>
    );
  }

  // ─── Browser modal ───
  if (showBrowser) {
    return (
      <RendrProjectBrowser
        onSelect={handleLink}
        onClose={() => setShowBrowser(false)}
      />
    );
  }

  // ─── State C: Import in progress ───
  if (state === "importing" && takeoffData) {
    return (
      <RendrMatchingTable
        takeoffData={takeoffData}
        appRooms={rooms}
        projectId={projectId}
        onConfirm={handleImport}
        onCancel={() => setState("linked")}
      />
    );
  }

  // ─── State B: Linked / State D: Imported ───
  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Header info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Rendr LiDAR Scan
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Project #{linkedProjectId} &middot; Space #{linkedSpaceId}
            {state === "imported" && importResult && (
              <span className="ml-2 text-green-600 dark:text-green-400">
                &middot; {importResult.count} rooms imported
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {state === "imported" && (
            <button
              onClick={() => setState("importing")}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              Re-import
            </button>
          )}
          {state === "linked" && (
            <button
              onClick={() => setState("importing")}
              disabled={loading || !takeoffData}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Import Measurements
            </button>
          )}
          <button
            onClick={() => setShowUnlinkConfirm(true)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Unlink
          </button>
        </div>
      </div>

      {/* Unlink confirmation */}
      {showUnlinkConfirm && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-3 text-sm text-red-700 dark:text-red-400">
            Are you sure you want to unlink this Rendr scan? Imported measurements will remain on rooms.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {unlinking ? "Unlinking..." : "Yes, Unlink"}
            </button>
            <button
              onClick={() => setShowUnlinkConfirm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          Loading scan data...
        </div>
      )}

      {/* Room list + Floor plan side by side */}
      {takeoffData && !loading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Room list */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Scanned Rooms ({takeoffData.rooms.length})
            </h4>
            <div className="space-y-2">
              {takeoffData.rooms.length === 0 ? (
                <p className="text-sm text-zinc-500">This scan contains no room data.</p>
              ) : (
                takeoffData.rooms.map((room, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700"
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {room.label}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {room.takeoff.floorSF} SF &middot; {room.takeoff.perimeterLF} LF perimeter
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Floor plan */}
          {linkedSpaceId && (
            <div>
              <h4 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Floor Plan Reference
              </h4>
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                <iframe
                  src={`/api/rendr/spaces/${linkedSpaceId}/floorplan`}
                  className="h-[500px] w-full"
                  title="Rendr Floor Plan"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

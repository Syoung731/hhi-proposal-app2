"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ImperialTakeoffData } from "@/app/lib/rendr/types";
import type { LinkedSpace } from "@/app/lib/rendr/linkedSpaces";
import { RendrFloorPlan } from "./rendr-floor-plan";
import { RendrWallElevations } from "./rendr-wall-elevations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RendrSpace {
  id: number;
  title: string;
  created: string;
  notes: string;
  deleted?: boolean;
}

interface RendrProject {
  id: string;
  name: string;
  description: string;
  created: string;
  owner: string;
  spaces?: RendrSpace[];
}

type Props = {
  /** Link one or more spaces (floors) to the app project, each with a short label. */
  onLinkSpaces: (projectId: number | null, spaces: LinkedSpace[]) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateGroup(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Unknown Date";
  }
}

function dateKey(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "unknown";
  }
}

function groupByDate(projects: RendrProject[]): { date: string; label: string; count: number; items: RendrProject[] }[] {
  const groups = new Map<string, { label: string; items: RendrProject[] }>();
  for (const p of projects) {
    const key = dateKey(p.created);
    if (!groups.has(key)) {
      groups.set(key, { label: formatDateGroup(p.created), items: [] });
    }
    groups.get(key)!.items.push(p);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, { label, items }]) => ({ date, label, count: items.length, items }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RendrProjectsPage({ onLinkSpaces }: Props) {
  // ─── Data ───
  const [allProjects, setAllProjects] = useState<RendrProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── UI state ───
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedProject, setSelectedProject] = useState<RendrProject | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // ─── Multi-select linking (within a project's space list) ───
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<number>>(new Set());
  const [spaceLabels, setSpaceLabels] = useState<Record<number, string>>({});

  // ─── Space detail state ───
  const [selectedSpace, setSelectedSpace] = useState<RendrSpace | null>(null);
  const [spaceData, setSpaceData] = useState<ImperialTakeoffData | null>(null);
  const [spaceDataLoading, setSpaceDataLoading] = useState(false);

  // Reset multi-select when entering/leaving a project.
  const openProject = useCallback((proj: RendrProject) => {
    setSelectedProject(proj);
    setSelectedSpaceIds(new Set());
    setSpaceLabels({});
  }, []);

  const toggleSpaceSelected = useCallback((space: RendrSpace) => {
    setSelectedSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(space.id)) next.delete(space.id);
      else next.add(space.id);
      return next;
    });
    setSpaceLabels((prev) => (prev[space.id] ? prev : { ...prev, [space.id]: space.title }));
  }, []);

  // ─── Fetch all projects ───
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rendr/projects?page=1&page_size=100");
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllProjects(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleViewSpace = useCallback(async (space: RendrSpace) => {
    setSelectedSpace(space);
    setSpaceData(null);
    setSpaceDataLoading(true);
    try {
      const res = await fetch(`/api/rendr/spaces/${space.id}/takeoff`);
      if (!res.ok) throw new Error("Failed to load space data");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSpaceData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load space data");
    } finally {
      setSpaceDataLoading(false);
    }
  }, []);

  // ─── Filter ───
  const currentYear = new Date().getFullYear();
  const filtered = useMemo(() => {
    let list = showAll
      ? allProjects
      : allProjects.filter((p) => {
          try { return new Date(p.created).getFullYear() === currentYear; }
          catch { return false; }
        });
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [allProjects, showAll, search, currentYear]);

  const hiddenCount = allProjects.length - allProjects.filter((p) => {
    try { return new Date(p.created).getFullYear() === currentYear; } catch { return false; }
  }).length;

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  // ─── Space detail view ───
  if (selectedSpace) {
    return (
      <SpaceDetailView
        space={selectedSpace}
        data={spaceData}
        loading={spaceDataLoading}
        projectId={selectedProject ? Number(selectedProject.id) : null}
        onBack={() => { setSelectedSpace(null); setSpaceData(null); }}
        onLink={() => {
          onLinkSpaces(
            selectedProject ? Number(selectedProject.id) : null,
            [{ spaceId: selectedSpace.id, label: selectedSpace.title }],
          );
        }}
      />
    );
  }

  // ─── Space picker within a project (multi-select) ───
  if (selectedProject) {
    const projId = Number(selectedProject.id);
    const spacesToLink: LinkedSpace[] = (selectedProject.spaces ?? [])
      .filter((s) => selectedSpaceIds.has(s.id))
      .map((s) => ({ spaceId: s.id, label: (spaceLabels[s.id] ?? s.title).trim() || s.title }));

    return (
      <div className="pb-24">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => setSelectedProject(null)}
              className="mb-1 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Projects
            </button>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedProject.name}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select one or more spaces to link. For a multi-floor scan, give each a short
              label (e.g. &quot;1st Floor&quot;, &quot;2nd Floor&quot;) to keep same-named rooms apart.
            </p>
          </div>
        </div>

        {/* Spaces within project */}
        {!selectedProject.spaces?.length ? (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">No spaces in this project.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedProject.spaces.map((space) => {
              const checked = selectedSpaceIds.has(space.id);
              return (
                <div
                  key={space.id}
                  className={`rounded-xl border bg-white p-4 transition-all dark:bg-zinc-800 ${
                    checked
                      ? "border-orange-300 dark:border-orange-600"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSpaceSelected(space)}
                      className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400 dark:border-zinc-600"
                    />
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m10.5-6v4.5m0-4.5h-4.5m4.5 0L15 9m-10.5 6v4.5m0-4.5h4.5m-4.5 4.5L9 15m10.5 6v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{space.title}</span>
                      {space.notes && (
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{space.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleViewSpace(space)}
                      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Preview
                    </button>
                    <span className="shrink-0 text-xs text-zinc-400">{new Date(space.created).toLocaleDateString()}</span>
                  </div>

                  {/* Per-space short label (shown when selected) */}
                  {checked && (
                    <div className="mt-3 flex items-center gap-2 pl-7">
                      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Short label
                      </label>
                      <input
                        type="text"
                        value={spaceLabels[space.id] ?? space.title}
                        onChange={(e) =>
                          setSpaceLabels((prev) => ({ ...prev, [space.id]: e.target.value }))
                        }
                        placeholder="e.g. 2nd Floor"
                        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Sticky link bar */}
        {spacesToLink.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                {spacesToLink.length} space{spacesToLink.length !== 1 ? "s" : ""} selected
                <span className="ml-2 text-zinc-400">{spacesToLink.map((s) => s.label).join(" · ")}</span>
              </span>
              <button
                onClick={() => onLinkSpaces(projId, spacesToLink)}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
                Link {spacesToLink.length} space{spacesToLink.length !== 1 ? "s" : ""} to project
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Main projects list ───
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Projects</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Project
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Enter project..."
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-zinc-400 hover:text-zinc-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Project list grouped by date */}
      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          Loading projects...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-500">
            {search ? "No projects match your search." : "No projects found."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.date}>
              {/* Date header */}
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{group.label}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                  {group.count}
                </span>
              </div>

              {/* Project cards */}
              <div className="space-y-2">
                {group.items.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => openProject(proj)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-all hover:border-orange-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-orange-600"
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: project info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{proj.name}</h3>
                          {proj.description && (
                            <span className="hidden truncate text-xs text-zinc-400 sm:inline">&mdash; {proj.description}</span>
                          )}
                        </div>
                        {/* Space chips */}
                        {proj.spaces && proj.spaces.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {proj.spaces.map((s) => (
                              <span
                                key={s.id}
                                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m10.5-6v4.5m0-4.5h-4.5m4.5 0L15 9m-10.5 6v4.5m0-4.5h4.5m-4.5 4.5L9 15m10.5 6v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                                </svg>
                                {s.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Right: meta */}
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-zinc-400">
                        <span>{proj.owner || ""}</span>
                        <span>{new Date(proj.created).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Show older toggle */}
          {!showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
            >
              Show {hiddenCount} older project{hiddenCount !== 1 ? "s" : ""}
            </button>
          )}
          {showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
            >
              Show only {currentYear} projects
            </button>
          )}
        </div>
      )}

      {/* Add Project Modal */}
      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onCreated={(proj) => {
            setAllProjects((prev) => [proj, ...prev]);
            setShowAddModal(false);
            openProject(proj);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Detail View — tabbed interface matching Rendr UI
// ---------------------------------------------------------------------------

type SpaceTab = "floorplan" | "photos" | "rooms" | "about";

interface SpacePhoto {
  id: string;
  space_photo_url: string;
  space_photo_thumbnail_url: string;
  created: string;
}

const SPACE_TABS: { key: SpaceTab; label: string }[] = [
  { key: "floorplan", label: "Floor Plan" },
  { key: "photos", label: "Photos" },
  { key: "rooms", label: "Rooms" },
  { key: "about", label: "About" },
];

function SpaceDetailView({
  space,
  data,
  loading,
  projectId,
  onBack,
  onLink,
}: {
  space: RendrSpace;
  data: ImperialTakeoffData | null;
  loading: boolean;
  projectId: number | null;
  onBack: () => void;
  onLink: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SpaceTab>("rooms");
  const [photos, setPhotos] = useState<SpacePhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [spaceDetail, setSpaceDetail] = useState<{ notes: string; saved_date: string; field_notes: string | null } | null>(null);

  // Fetch space detail (for photos + about)
  useEffect(() => {
    setPhotosLoading(true);
    fetch(`/api/rendr/spaces/${space.id}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.photos) setPhotos(d.photos);
        setSpaceDetail({ notes: d.notes ?? "", saved_date: d.saved_date ?? "", field_notes: d.field_notes ?? null });
      })
      .catch(() => {})
      .finally(() => setPhotosLoading(false));
  }, [space.id]);


  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-1 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{space.title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Scanned {new Date(space.created).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={onLink}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
          </svg>
          Link to This Project
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {SPACE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-orange-500 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          Loading...
        </div>
      )}

      {/* ─── Floor Plan Tab ─── */}
      {activeTab === "floorplan" && !loading && (
        <RendrFloorPlan spaceId={space.id} />
      )}

      {/* ─── Photos Tab ─── */}
      {activeTab === "photos" && (
        <div>
          {photosLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading photos...
            </div>
          ) : photos.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">No photos available for this space.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  {/* Use proxied URL via our API */}
                  <img
                    src={`/api/rendr/spaces/${space.id}/photos/${photo.id}`}
                    alt="Space photo"
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="px-3 py-2 text-xs text-zinc-400">
                    {new Date(photo.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" "}
                    {new Date(photo.created).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Rooms Tab ─── */}
      {activeTab === "rooms" && data && !loading && (
        <div>
          {data.rooms.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">No room data available.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.rooms.map((room, idx) => {
                const t = room.takeoff;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {/* Room header */}
                    <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{room.label}</h4>
                    </div>

                    {/* Key dimensions */}
                    <div className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-zinc-500">Area:</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.floorSF} SqFt</span>
                      </div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="text-zinc-500">Perimeter:</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{t.perimeterLF} LnFt</span>
                      </div>

                      {/* Detail chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {t.wallsSF > 0 && <Chip label="Walls" sublabel={`${t.wallsSF} SF`} />}
                        {t.ceilingSF > 0 && <Chip label="Ceiling" sublabel={`${t.ceilingSF} SF`} />}
                        {t.numberOfWindows > 0 && <Chip label={`${t.numberOfWindows} Win`} sublabel={t.windowsSF > 0 ? `${t.windowsSF} SF` : undefined} />}
                        {t.numberOfDoors > 0 && <Chip label={`${t.numberOfDoors} Door`} sublabel={t.doorsSF > 0 ? `${t.doorsSF} SF` : undefined} />}
                        {t.numberOfSinks > 0 && <Chip label={`${t.numberOfSinks} Sink`} />}
                        {t.numberOfToilets > 0 && <Chip label={`${t.numberOfToilets} Toilet`} />}
                        {t.numberOfBathtubs > 0 && <Chip label={`${t.numberOfBathtubs} Tub`} />}
                        {t.numberOfBaseCabinets > 0 && <Chip label={`${t.numberOfBaseCabinets} Base Cab`} sublabel={`${t.baseCabinetsLF} LF`} />}
                        {t.numberOfWallCabinets > 0 && <Chip label={`${t.numberOfWallCabinets} Wall Cab`} sublabel={`${t.wallCabinetsLF} LF`} />}
                        {t.countertopsLF > 0 && <Chip label="Counter" sublabel={`${t.countertopsLF} LF`} />}
                        {t.backsplashLF > 0 && <Chip label="Backsplash" sublabel={`${t.backsplashLF} LF`} />}
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

      {/* ─── About Tab ─── */}
      {activeTab === "about" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
          <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">Space Information</h3>
          <div className="space-y-4">
            <AboutRow icon="folder" label="Space Name" value={space.title} />
            {projectId && <AboutRow icon="project" label="Associated Project" value={`Project #${projectId}`} />}
            <AboutRow icon="calendar" label="Scanned" value={
              new Date(space.created).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric",
              }) + " at " + new Date(space.created).toLocaleTimeString("en-US", {
                hour: "numeric", minute: "2-digit",
              })
            } />
            <AboutRow icon="notes" label="Notes" value={spaceDetail?.notes || "No notes"} />
            {spaceDetail?.field_notes && (
              <AboutRow icon="notes" label="Field Notes" value={spaceDetail.field_notes} />
            )}
          </div>
        </div>
      )}

      {!data && !loading && activeTab === "rooms" && (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-500">No takeoff data available for this space.</p>
        </div>
      )}
    </div>
  );
}

function AboutRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const icons: Record<string, React.ReactNode> = {
    folder: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>,
    project: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    calendar: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
    notes: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  };
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-zinc-400">{icons[icon]}</span>
      <div>
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
        <div className="text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable UI atoms
// ---------------------------------------------------------------------------

function Chip({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
      {label}
      {sublabel && <span className="text-zinc-400">({sublabel})</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add Project Modal
// ---------------------------------------------------------------------------

function AddProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: RendrProject) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Unassigned spaces ───
  const [allSpaces, setAllSpaces] = useState<RendrSpace[]>([]);
  const [assignedSpaceIds, setAssignedSpaceIds] = useState<Set<number>>(new Set());
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<number>>(new Set());
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [spaceSearch, setSpaceSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [spacesRes, projectsRes] = await Promise.all([
          fetch("/api/rendr/spaces?page=1&page_size=100"),
          fetch("/api/rendr/projects?page=1&page_size=100"),
        ]);
        const spacesData = await spacesRes.json();
        const projectsData = await projectsRes.json();

        const spaces: RendrSpace[] = spacesData.items ?? [];
        const projects: RendrProject[] = projectsData.items ?? [];

        // Build set of space IDs already assigned to a project
        const assigned = new Set<number>();
        for (const p of projects) {
          for (const s of p.spaces ?? []) {
            assigned.add(s.id);
          }
        }

        setAllSpaces(spaces.filter((s) => !s.deleted));
        setAssignedSpaceIds(assigned);
      } catch {
        setError("Failed to load spaces");
      } finally {
        setSpacesLoading(false);
      }
    }
    load();
  }, []);

  const unassignedSpaces = allSpaces
    .filter((s) => !assignedSpaceIds.has(s.id))
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    .filter((s) => {
      if (!spaceSearch.trim()) return true;
      return s.title.toLowerCase().includes(spaceSearch.toLowerCase());
    });

  const toggleSpace = (id: number) => {
    setSelectedSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rendr/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          spaceIds: Array.from(selectedSpaceIds).map(String),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create project");
      onCreated(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Add Project</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Project Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 123 Main Street"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            {/* Unassigned spaces */}
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Add Spaces {selectedSpaceIds.size > 0 && (
                  <span className="text-orange-600">({selectedSpaceIds.size} selected)</span>
                )}
              </label>
              {/* Space search */}
              {!spacesLoading && allSpaces.filter((s) => !assignedSpaceIds.has(s.id)).length > 0 && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800">
                  <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={spaceSearch}
                    onChange={(e) => setSpaceSearch(e.target.value)}
                    placeholder="Search spaces..."
                    className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
                  />
                  {spaceSearch && (
                    <button onClick={() => setSpaceSearch("")} className="text-zinc-400 hover:text-zinc-600">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {spacesLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                  Loading available spaces...
                </div>
              ) : unassignedSpaces.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  {spaceSearch ? "No spaces match your search." : "All spaces are already assigned to projects."}
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                  {unassignedSpaces.map((space) => {
                    const checked = selectedSpaceIds.has(space.id);
                    return (
                      <label
                        key={space.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          checked
                            ? "bg-orange-50 dark:bg-orange-900/20"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSpace(space.id)}
                          className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400 dark:border-zinc-600"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {space.title}
                          </span>
                          <span className="ml-2 text-xs text-zinc-400">
                            {new Date(space.created).toLocaleDateString()}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create & Select"}
          </button>
        </div>
      </div>
    </div>
  );
}

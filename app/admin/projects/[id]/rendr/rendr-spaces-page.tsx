"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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
  /** After spaces are added to a project, navigate to the Projects page */
  onDone: () => void;
};

export function RendrSpacesPage({ onDone }: Props) {
  const [spaces, setSpaces] = useState<RendrSpace[]>([]);
  const [projects, setProjects] = useState<RendrProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Assignment mode
  const [showAssign, setShowAssign] = useState(false);
  const [assignMode, setAssignMode] = useState<"existing" | "new">("existing");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Build set of space IDs already assigned
  const assignedSpaceIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of projects) {
      for (const s of p.spaces ?? []) ids.add(s.id);
    }
    return ids;
  }, [projects]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/rendr/spaces?page=1&page_size=100").then((r) => r.json()),
      fetch("/api/rendr/projects?page=1&page_size=100").then((r) => r.json()),
    ])
      .then(([spacesData, projectsData]) => {
        const allSpaces: RendrSpace[] = (spacesData.items ?? []).filter((s: RendrSpace) => !s.deleted);
        setSpaces(allSpaces.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()));
        setProjects(projectsData.items ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return spaces;
    const q = search.toLowerCase();
    return spaces.filter((s) => s.title.toLowerCase().includes(q));
  }, [spaces, search]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unassigned = filtered.filter((s) => !assignedSpaceIds.has(s.id));
    setSelectedIds(new Set(unassigned.map((s) => s.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setError(null);

    try {
      const spaceIdStrs = Array.from(selectedIds).map(String);

      if (assignMode === "new") {
        if (!newProjectName.trim()) throw new Error("Project name is required");
        const res = await fetch("/api/rendr/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newProjectName.trim(),
            description: newProjectDesc.trim(),
            spaceIds: spaceIdStrs,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create project");
      } else {
        if (!selectedProjectId) throw new Error("Select a project");
        // Add spaces to existing project via PUT
        const res = await fetch(`/api/rendr/projects/${selectedProjectId}/spaces`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(spaceIdStrs),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to add spaces to project");
        }
      }

      // Success — go to projects
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign spaces");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" /> Loading spaces...
    </div>
  );

  const unassignedCount = filtered.filter((s) => !assignedSpaceIds.has(s.id)).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Spaces</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select spaces to add to a project.
          </p>
        </div>
        {selectedIds.size > 0 && !showAssign && (
          <button
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add {selectedIds.size} Space{selectedIds.size !== 1 ? "s" : ""} to Project
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Assignment panel */}
      {showAssign && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/10">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Add {selectedIds.size} space{selectedIds.size !== 1 ? "s" : ""} to a project
          </h3>

          {/* Mode toggle */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setAssignMode("existing")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                assignMode === "existing"
                  ? "bg-orange-500 text-white"
                  : "bg-white text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
              }`}
            >
              Existing Project
            </button>
            <button
              onClick={() => setAssignMode("new")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                assignMode === "new"
                  ? "bg-orange-500 text-white"
                  : "bg-white text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
              }`}
            >
              New Project
            </button>
          </div>

          {assignMode === "existing" ? (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Select project</label>
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">— Choose a project —</option>
                {projects
                  .filter((p) => new Date(p.created).getFullYear() === new Date().getFullYear())
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.spaces?.length ?? 0} spaces)
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="mb-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Project Name *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. 123 Main Street"
                  className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Description</label>
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Optional"
                  className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-orange-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAssign}
              disabled={assigning || (assignMode === "existing" ? !selectedProjectId : !newProjectName.trim())}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {assigning ? "Adding..." : assignMode === "new" ? "Create Project & Add Spaces" : "Add Spaces to Project"}
            </button>
            <button
              onClick={() => setShowAssign(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search + bulk actions */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
          <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search spaces..."
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none dark:text-zinc-100"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-zinc-400 hover:text-zinc-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {selectedIds.size > 0 && (
            <button onClick={clearSelection} className="text-zinc-500 hover:text-zinc-700 underline">Clear ({selectedIds.size})</button>
          )}
          {unassignedCount > 0 && selectedIds.size < unassignedCount && (
            <button onClick={selectAll} className="text-blue-500 hover:text-blue-700 underline">Select all unassigned</button>
          )}
        </div>
      </div>

      {/* Spaces list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          {search ? "No spaces match your search." : "No spaces found."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((space) => {
            const isAssigned = assignedSpaceIds.has(space.id);
            const isSelected = selectedIds.has(space.id);
            return (
              <label
                key={space.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  isSelected
                    ? "border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/10"
                    : isAssigned
                      ? "border-zinc-100 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isAssigned}
                  onChange={() => toggleSelect(space.id)}
                  className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400 disabled:opacity-40 dark:border-zinc-600"
                />
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{space.title}</span>
                    {space.notes && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{space.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    {isAssigned && (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-500 dark:bg-zinc-700">In project</span>
                    )}
                    <span>{new Date(space.created).toLocaleDateString()}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

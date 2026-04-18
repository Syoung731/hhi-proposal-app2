"use client";

import { useState, useEffect, useCallback } from "react";

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
  onSelect: (projectId: number | null, spaceId: number) => void;
  onClose: () => void;
  /** When opened from shell sidebar, skip to this view and hide the internal tabs. */
  initialView?: "projects" | "spaces";
};

type ActiveView = "projects" | "spaces";

export function RendrProjectBrowser({ onSelect, onClose, initialView }: Props) {
  const [activeView, setActiveView] = useState<ActiveView>(initialView ?? "projects");
  const hideInternalTabs = !!initialView;

  // ─── Projects state ───
  const [allProjects, setAllProjects] = useState<RendrProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<RendrProject | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // ─── Spaces state ───
  const [spaces, setSpaces] = useState<RendrSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesPage, setSpacesPage] = useState(1);
  const [spacesHasMore, setSpacesHasMore] = useState(false);
  const [spacesLoaded, setSpacesLoaded] = useState(false);

  // ─── Create project state ───
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ─── Fetch functions ───

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rendr/projects?page=1&page_size=100");
      if (!res.ok) throw new Error("Failed to load Rendr projects");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items: RendrProject[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data) ? data : [];
      setAllProjects(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const fetchSpaces = useCallback(async (p: number) => {
    setSpacesLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rendr/spaces?page=${p}`);
      if (!res.ok) throw new Error("Failed to load Rendr spaces");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items: RendrSpace[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data) ? data : [];
      setSpaces(p === 1 ? items : (prev) => [...prev, ...items]);
      setSpacesHasMore(!!data.pagination?.next_page);
      setSpacesPage(p);
      setSpacesLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load spaces");
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  // Load projects on mount
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Filter projects: current year = active, or show all
  const currentYear = new Date().getFullYear();
  const projects = showAllProjects
    ? allProjects
    : allProjects.filter((p) => {
        try { return new Date(p.created).getFullYear() === currentYear; }
        catch { return false; }
      });
  const hiddenCount = allProjects.length - projects.length;

  // Lazy-load spaces when switching to spaces view
  useEffect(() => {
    if (activeView === "spaces" && !spacesLoaded) {
      fetchSpaces(1);
    }
  }, [activeView, spacesLoaded, fetchSpaces]);

  // ─── Create project handler ───

  const handleCreateProject = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rendr/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create project");
      // Prepend new project to list
      setAllProjects((prev) => [data, ...prev]);
      setShowCreateForm(false);
      setCreateName("");
      setCreateDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  // ─── Header ───

  const headerTitle = selectedProject
    ? "Select a Space"
    : showCreateForm
      ? "Create Rendr Project"
      : activeView === "projects"
        ? "Rendr Projects"
        : "Rendr Spaces";

  const handleBack = () => {
    if (selectedProject) {
      setSelectedProject(null);
    } else if (showCreateForm) {
      setShowCreateForm(false);
    } else {
      onClose();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — hidden when shell provides its own header */}
      {(!hideInternalTabs || selectedProject || showCreateForm) && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{headerTitle}</h3>
          <button
            onClick={handleBack}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {selectedProject || showCreateForm ? "Back" : hideInternalTabs ? "" : "Cancel"}
          </button>
        </div>
      )}

      {/* Sidebar tabs — only show when not drilled into a project or create form, and not embedded in shell */}
      {!hideInternalTabs && !selectedProject && !showCreateForm && (
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setActiveView("projects")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeView === "projects"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Projects
          </button>
          <button
            onClick={() => setActiveView("spaces")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeView === "spaces"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Spaces
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ─── Create Project Form ─── */}
      {showCreateForm && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Project Name *
            </label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. 123 Main Street"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateProject}
              disabled={creating || !createName.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Projects View ─── */}
      {activeView === "projects" && !selectedProject && !showCreateForm && (
        <div className="space-y-2">
          {/* Create project button */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full rounded-lg border border-dashed border-zinc-400 py-3 text-sm font-medium text-zinc-600 hover:border-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-500 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            + Create New Project
          </button>

          {projectsLoading && allProjects.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading Rendr projects...
            </div>
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {showAllProjects ? "No Rendr projects found." : "No projects this year."}
            </p>
          ) : (
            <>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProject(proj)}
                  className="w-full rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{proj.name}</span>
                    <div className="flex items-center gap-2">
                      {proj.spaces && (
                        <span className="text-xs text-zinc-400">{proj.spaces.length} space{proj.spaces.length !== 1 ? "s" : ""}</span>
                      )}
                      <span className="text-xs text-zinc-400">{new Date(proj.created).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {proj.description && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{proj.description}</p>
                  )}
                </button>
              ))}
              {!showAllProjects && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllProjects(true)}
                  className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
                >
                  Show {hiddenCount} older project{hiddenCount !== 1 ? "s" : ""}
                </button>
              )}
              {showAllProjects && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllProjects(false)}
                  className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
                >
                  Show only {currentYear} projects
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Space selection within project ─── */}
      {selectedProject && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Project: <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedProject.name}</span>
          </p>
          {!selectedProject.spaces?.length ? (
            <p className="py-8 text-center text-sm text-zinc-500">No spaces found in this project.</p>
          ) : (
            selectedProject.spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => onSelect(Number(selectedProject.id), space.id)}
                className="w-full rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{space.title}</span>
                  <span className="text-xs text-zinc-400">{new Date(space.created).toLocaleDateString()}</span>
                </div>
                {space.notes && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{space.notes}</p>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ─── Spaces View (all spaces) ─── */}
      {activeView === "spaces" && !selectedProject && !showCreateForm && (
        <div className="space-y-2">
          {spacesLoading && spaces.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading Rendr spaces...
            </div>
          ) : spaces.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No Rendr spaces found.</p>
          ) : (
            <>
              {spaces.filter((s) => !s.deleted).map((space) => (
                <button
                  key={space.id}
                  onClick={() => onSelect(null, space.id)}
                  className="w-full rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{space.title}</span>
                    <span className="text-xs text-zinc-400">{new Date(space.created).toLocaleDateString()}</span>
                  </div>
                  {space.notes && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{space.notes}</p>
                  )}
                </button>
              ))}
              {spacesHasMore && (
                <button
                  onClick={() => fetchSpaces(spacesPage + 1)}
                  disabled={spacesLoading}
                  className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
                >
                  {spacesLoading ? "Loading..." : "Load More"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

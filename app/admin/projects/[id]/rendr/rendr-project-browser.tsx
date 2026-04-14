"use client";

import { useState, useEffect } from "react";

interface RendrProject {
  id: number;
  name: string;
  description: string;
  created_at: string;
  spaces?: RendrSpace[];
}

interface RendrSpace {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

type Props = {
  onSelect: (projectId: number, spaceId: number) => void;
  onClose: () => void;
};

export function RendrProjectBrowser({ onSelect, onClose }: Props) {
  const [projects, setProjects] = useState<RendrProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedProject, setSelectedProject] = useState<RendrProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  useEffect(() => {
    fetchProjects(1);
  }, []);

  const fetchProjects = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rendr/projects?page=${p}`);
      if (!res.ok) throw new Error("Failed to load Rendr projects");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProjects(p === 1 ? data.results : [...projects, ...data.results]);
      setHasMore(!!data.next);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = async (proj: RendrProject) => {
    setLoadingProject(true);
    setError(null);
    try {
      const res = await fetch(`/api/rendr/projects/${proj.id}`);
      if (!res.ok) throw new Error("Failed to load project details");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelectedProject(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoadingProject(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {selectedProject ? "Select a Space" : "Select a Rendr Project"}
        </h3>
        <button
          onClick={selectedProject ? () => setSelectedProject(null) : onClose}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {selectedProject ? "Back to Projects" : "Cancel"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Project list */}
      {!selectedProject && (
        <div className="space-y-2">
          {loading && projects.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading Rendr projects...
            </div>
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No Rendr projects found.</p>
          ) : (
            <>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => handleSelectProject(proj)}
                  disabled={loadingProject}
                  className="w-full rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {proj.name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(proj.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {proj.description && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {proj.description}
                    </p>
                  )}
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => fetchProjects(page + 1)}
                  disabled={loading}
                  className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:hover:border-zinc-500"
                >
                  {loading ? "Loading..." : "Load More"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Space selection within project */}
      {selectedProject && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Project: <span className="font-medium text-zinc-700 dark:text-zinc-300">{selectedProject.name}</span>
          </p>
          {loadingProject ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading spaces...
            </div>
          ) : !selectedProject.spaces?.length ? (
            <p className="py-8 text-center text-sm text-zinc-500">No spaces found in this project.</p>
          ) : (
            selectedProject.spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => onSelect(selectedProject.id, space.id)}
                className="w-full rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {space.name}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(space.created_at).toLocaleDateString()}
                  </span>
                </div>
                {space.description && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {space.description}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

type Props = {
  onNavigate: (page: "projects" | "spaces") => void;
};

export function RendrDashboard({ onNavigate }: Props) {
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [spaceCount, setSpaceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rendr/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProjectCount(data.projectCount ?? 0);
        setSpaceCount(data.spaceCount ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Welcome back to RENDR
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Here&apos;s what&apos;s happening with your projects and spaces today.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Projects */}
        <button
          onClick={() => onNavigate("projects")}
          className="group rounded-xl border border-zinc-200 bg-white p-6 text-left transition-all hover:border-orange-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-orange-600"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <svg className="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {loading ? (
              <div className="h-9 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            ) : (
              projectCount ?? 0
            )}
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-500 group-hover:text-orange-600 dark:text-zinc-400 dark:group-hover:text-orange-400">
            Active Projects
          </div>
        </button>

        {/* Captured Spaces */}
        <button
          onClick={() => onNavigate("spaces")}
          className="group rounded-xl border border-zinc-200 bg-white p-6 text-left transition-all hover:border-orange-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-orange-600"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m10.5-6v4.5m0-4.5h-4.5m4.5 0L15 9m-10.5 6v4.5m0-4.5h4.5m-4.5 4.5L9 15m10.5 6v-4.5m0 4.5h-4.5m4.5 0L15 15" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {loading ? (
              <div className="h-9 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            ) : (
              spaceCount ?? 0
            )}
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-500 group-hover:text-blue-600 dark:text-zinc-400 dark:group-hover:text-blue-400">
            Captured Spaces
          </div>
        </button>
      </div>
    </div>
  );
}

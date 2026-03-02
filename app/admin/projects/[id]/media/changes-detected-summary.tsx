"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getCompareRenderChangesAction } from "./actions";

type Props = {
  projectId: string;
  sourceMediaId: string;
  renderMediaId: string;
};

type Result =
  | { ok: true; bullets: string[]; rawText?: string }
  | { error: string };

const DEBOUNCE_MS = 400;

export function ChangesDetectedSummary({ projectId, sourceMediaId, renderMediaId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = `${sourceMediaId}:${renderMediaId}`;
    if (fetchedKey !== null && fetchedKey !== key) {
      setResult(null);
      setFetchedKey(null);
    }
  }, [sourceMediaId, renderMediaId, fetchedKey]);

  const fetchChanges = useCallback(async () => {
    const key = `${sourceMediaId}:${renderMediaId}`;
    if (fetchedKey === key && result !== null) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await getCompareRenderChangesAction(projectId, sourceMediaId, renderMediaId);
      setResult(data);
      setFetchedKey(key);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong comparing the images.";
      setResult({ error: message });
      setFetchedKey(key);
    } finally {
      setLoading(false);
    }
  }, [projectId, sourceMediaId, renderMediaId, fetchedKey, result]);

  const handleToggle = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = !expanded;
    setExpanded(next);
    if (next) {
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void fetchChanges();
      }, DEBOUNCE_MS);
    }
  }, [expanded, fetchChanges]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-800/50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
      >
        <span>Show changes</span>
        <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
          {expanded ? "▼" : "▶"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-700">
          {loading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Comparing source and render…</p>
          )}
          {!loading && result !== null && (
            <>
              {"error" in result ? (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {result.error}
                </p>
              ) : (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                  {result.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

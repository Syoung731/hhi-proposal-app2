"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Tracks the currently-active bulk estimate job for the logged-in admin.
 *
 * Persisted to localStorage under `STORAGE_KEY` so the banner survives
 * navigation + page reload. State is intentionally flat and small so
 * hydration is fast and tab-sync works via the `storage` event.
 */

const STORAGE_KEY = "hhi:estimateJob:active";

type PersistedState = {
  activeJobId: string | null;
  projectId: string | null;
  totalItems: number | null;
  /**
   * The id of the job the user most recently dismissed. Not load-bearing for
   * the banner's default behavior (dismissing clears `activeJobId`), but kept
   * around so callers like `startJob` can detect tampering / repeat dismissal.
   */
  lastDismissedJobId: string | null;
};

const EMPTY: PersistedState = {
  activeJobId: null,
  projectId: null,
  totalItems: null,
  lastDismissedJobId: null,
};

function readStorage(): PersistedState {
  try {
    if (typeof window === "undefined") return EMPTY;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      activeJobId: parsed.activeJobId ?? null,
      projectId: parsed.projectId ?? null,
      totalItems: typeof parsed.totalItems === "number" ? parsed.totalItems : null,
      lastDismissedJobId: parsed.lastDismissedJobId ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function writeStorage(s: PersistedState): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded or private-mode storage rejection — fine to drop.
    // The banner will still work in-memory for the current session.
  }
}

type EstimateJobContextValue = PersistedState & {
  /** Activate the banner for a newly-kicked-off job. Clears any prior dismissal. */
  startJob: (jobId: string, projectId: string, totalItems: number) => void;
  /** Close the banner; next mount won't re-surface this job. */
  dismissJob: () => void;
  /** `false` on the first render; flips `true` after the localStorage hydration effect. Use to avoid SSR/client mismatch flicker. */
  hasHydrated: boolean;
};

const Ctx = createContext<EstimateJobContextValue | null>(null);

export function EstimateJobProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Hydrate from localStorage once on mount (client-only).
  useEffect(() => {
    setState(readStorage());
    setHasHydrated(true);
  }, []);

  // Cross-tab sync: if another tab dismisses or starts a job, mirror it here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setState(readStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startJob = useCallback(
    (jobId: string, projectId: string, totalItems: number) => {
      const next: PersistedState = {
        activeJobId: jobId,
        projectId,
        totalItems,
        lastDismissedJobId: null,
      };
      setState(next);
      writeStorage(next);
    },
    [],
  );

  const dismissJob = useCallback(() => {
    setState((prev) => {
      const next: PersistedState = {
        activeJobId: null,
        projectId: null,
        totalItems: null,
        lastDismissedJobId: prev.activeJobId,
      };
      writeStorage(next);
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ ...state, startJob, dismissJob, hasHydrated }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEstimateJob(): EstimateJobContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEstimateJob must be used within <EstimateJobProvider>");
  return c;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEstimateJob } from "@/app/admin/_estimate-job/context";
import { copeButtonLabel, type CopeStatus } from "@/app/admin/_estimate-job/cope-button-label";

/**
 * Fixed bottom-right banner that tracks a bulk estimate job end-to-end,
 * plus the Phase 8C COPE auto-trigger that follows a clean COMPLETED.
 *
 * State machine (combined job.status × project.copeStatus):
 *   RUNNING/QUEUED          → progress bar + ETA (unchanged from 8B)
 *   FAILED                  → red, no COPE (nothing to aggregate over)
 *   COMPLETED + GENERATING  → "Generating project overhead…", not dismissible
 *   COMPLETED + READY       → "All done." + 10s auto-dismiss
 *   COMPLETED + FAILED      → red, copeError, "Retry Project Overhead" button
 *   COMPLETED + IDLE        → depends on `autoGenerateCope` + how long we've
 *                              been at IDLE (<20s: show spinner; >=20s or auto
 *                              off: show "Generate Project Overhead" button)
 *   PARTIAL + (non-GENERATING) → yellow, two buttons: "Retry failed rooms
 *                                 first" (primary, navigates) + "Update
 *                                 Project Overhead anyway" (secondary, POSTs)
 *   PARTIAL + GENERATING    → "Generating project overhead…" (user accepted
 *                              the partial-data warning and kicked it off)
 */

type JobResponseItem = {
  id: string;
  roomId: string;
  roomName: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  estimateId: string | null;
};

type JobResponse = {
  id: string;
  projectId: string;
  projectTitle: string;
  project: {
    id: string;
    title: string;
    copeStatus: CopeStatus;
    copeGeneratedAt: string | null;
    copeError: string | null;
  };
  autoGenerateCope: boolean;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  totalItems: number;
  completedItems: number;
  failedItems: number;
  startedAt: string | null;
  completedAt: string | null;
  items: JobResponseItem[];
};

const POLL_INTERVAL_MS = 3_000;
/**
 * Grace window we'll wait for the QStash auto-trigger worker to acquire the
 * COPE lock after the EstimateJob rolls up to COMPLETED. Cover the typical
 * delivery latency (~1–3s on dev CLI, ~3–10s on prod Upstash) with plenty
 * of slack. If `copeStatus` is still IDLE after this, the user sees the
 * manual "Generate Project Overhead" button.
 */
const COPE_AUTO_TRIGGER_GRACE_MS = 20_000;
const COPE_ERROR_TRUNCATE = 140;

function isTerminal(status: JobResponse["status"]): boolean {
  return status === "COMPLETED" || status === "PARTIAL" || status === "FAILED";
}

export function EstimateJobProgressBanner() {
  const router = useRouter();
  const { activeJobId, projectId: ctxProjectId, totalItems: ctxTotal, dismissJob } =
    useEstimateJob();
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref: Date.now() of the first poll observation of job.status terminal.
  // Used to decide if COMPLETED+IDLE is "waiting for worker" vs "auto off".
  const firstTerminalAtRef = useRef<number | null>(null);

  // Refs for edge-triggered `router.refresh()` on status transitions (Bug 2).
  // Stored as refs (not state) so mutation doesn't trigger a re-render; we
  // only want the *comparison* to drive the refresh side-effect.
  const prevJobStatusRef = useRef<JobResponse["status"] | null>(null);
  const prevCopeStatusRef = useRef<CopeStatus | null>(null);

  // Tracks whether the user clicked "Not now" on the COMPLETED+IDLE+auto-off
  // confirmation prompt. Once true, the banner shows the "dismissed-but-not-
  // generated" state instead of re-prompting on every poll tick. Resets on a
  // new activeJobId so the next bulk run starts fresh. Deliberately NOT
  // persisted — a reload is a reasonable place to re-ask.
  const userDismissedCopePromptRef = useRef(false);
  // Bumping this forces a re-render after the ref flips (ref mutation alone
  // doesn't schedule a render, but we need the banner body to reflect the
  // new state immediately on "Not now" click).
  const [, setDismissTick] = useState(0);

  // Portal target. The banner renders via `createPortal` into `document.body`
  // so its `position: fixed` always resolves against the viewport — not
  // against some ancestor with transform/filter/backdrop-filter/perspective/
  // will-change/contain, any of which create a new containing block for
  // fixed descendants.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Local pending state for COPE-trigger button clicks — captures the
  // copeStatus at the moment of click; cleared once polling observes any
  // transition away. Prevents the button label flashing between click and
  // the first poll that sees `GENERATING`.
  const [pendingFromCopeStatus, setPendingFromCopeStatus] = useState<CopeStatus | null>(null);
  const [copeClickError, setCopeClickError] = useState<string | null>(null);

  // Poll the job status. Effect cleans up on unmount OR when activeJobId changes.
  useEffect(() => {
    if (!activeJobId) {
      setJob(null);
      setError(null);
      firstTerminalAtRef.current = null;
      userDismissedCopePromptRef.current = false;
      setPendingFromCopeStatus(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${activeJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) setError("Job not found — it may have been deleted.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as JobResponse;
        if (cancelled) return;
        setJob(data);
        setError(null);

        // Record the first time we observe terminal — used by the IDLE-grace logic.
        if (isTerminal(data.status) && firstTerminalAtRef.current == null) {
          firstTerminalAtRef.current = Date.now();
        }

        // Stop polling when there's nothing actionable left: the job is
        // terminal AND COPE isn't in flight AND we're past the auto-trigger
        // grace window for COMPLETED+IDLE (which could mean the QStash
        // message is still in transit) AND no user-initiated Generate click
        // is still waiting for the server to acknowledge by flipping
        // copeStatus away from the pre-click value. Without the last
        // clause, auto-off+IDLE bulk-completion stops polling before the
        // user can click Generate, so we'd never observe the transition.
        const jobDone = isTerminal(data.status);
        const copeInFlight = data.project.copeStatus === "GENERATING";
        const copeInGrace =
          data.status === "COMPLETED" &&
          data.project.copeStatus === "IDLE" &&
          data.autoGenerateCope &&
          firstTerminalAtRef.current != null &&
          Date.now() - firstTerminalAtRef.current < COPE_AUTO_TRIGGER_GRACE_MS;
        const awaitingClickResolution = pendingFromCopeStatus !== null;
        if (jobDone && !copeInFlight && !copeInGrace && !awaitingClickResolution) return;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load job");
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `pendingFromCopeStatus` is in deps so clicking Generate re-subscribes
    // the poll — the user's click flips it from null to the captured status,
    // and the next tick observes the server's IDLE → GENERATING transition.
  }, [activeJobId, pendingFromCopeStatus]);

  // Clear the "pending COPE click" sentinel once polling observes any
  // transition away from the copeStatus that was captured on click.
  useEffect(() => {
    if (!pendingFromCopeStatus) return;
    const current = job?.project.copeStatus;
    if (current && current !== pendingFromCopeStatus) {
      setPendingFromCopeStatus(null);
      setCopeClickError(null);
    }
  }, [pendingFromCopeStatus, job?.project.copeStatus]);

  // Edge-triggered refresh on status transitions. Two mechanisms fire together:
  //
  //   1. `router.refresh()` — rebuilds server components on the current route
  //      (project overhead rollups, investment totals rendered server-side).
  //
  //   2. `window.dispatchEvent(...)` — notifies CLIENT components that need to
  //      re-fetch their own data. The Rooms tab's <AIEstimatePanel> uses an
  //      internal `refreshKey` prop to trigger its fetch; router.refresh()
  //      alone doesn't touch that state, so without this event the user would
  //      see stale "No AI estimate yet" cards until hard-reload.
  //
  // Refs gate the comparison so rapid polls at the same status don't re-fire.
  useEffect(() => {
    if (!job) return;
    const prevJob = prevJobStatusRef.current;
    const prevCope = prevCopeStatusRef.current;
    const estimatesJustTerminal =
      prevJob != null && !isTerminal(prevJob) && isTerminal(job.status);
    const copeJustReady =
      prevCope != null && prevCope !== "READY" && job.project.copeStatus === "READY";
    // NEW: IDLE/FAILED → GENERATING and ANY → FAILED. Without these, the
    // rooms tab doesn't learn that a user-clicked Generate has actually
    // begun (so CopeRoomCard's projectCopeStatus prop stays stale at IDLE
    // until READY lands, never passing through GENERATING). Also covers
    // the COPE-failure surface so the error copy appears promptly.
    const copeStartedGenerating =
      prevCope != null && prevCope !== "GENERATING" && job.project.copeStatus === "GENERATING";
    const copeJustFailed =
      prevCope != null && prevCope !== "FAILED" && job.project.copeStatus === "FAILED";
    if (estimatesJustTerminal || copeJustReady || copeStartedGenerating || copeJustFailed) {
      router.refresh();
      if (estimatesJustTerminal) {
        window.dispatchEvent(
          new CustomEvent("hhi:estimate-job-terminal", {
            detail: { projectId: job.projectId, jobId: job.id, status: job.status },
          }),
        );
      }
      if (copeJustReady) {
        window.dispatchEvent(
          new CustomEvent("hhi:cope-ready", {
            detail: { projectId: job.projectId, jobId: job.id },
          }),
        );
      }
    }
    prevJobStatusRef.current = job.status;
    prevCopeStatusRef.current = job.project.copeStatus;
  }, [job, router]);

  const completed = job?.completedItems ?? 0;
  const failed = job?.failedItems ?? 0;
  const total = job?.totalItems ?? ctxTotal ?? 0;
  const jobStatus = job?.status ?? "QUEUED";
  const copeStatus: CopeStatus = job?.project.copeStatus ?? "IDLE";
  const projectId = job?.projectId ?? ctxProjectId;
  const autoGenerateCope = job?.autoGenerateCope ?? true;
  const copeError = job?.project.copeError ?? null;

  const pendingCopeClick = pendingFromCopeStatus != null && pendingFromCopeStatus === copeStatus;

  // Time since first terminal (for IDLE-grace fallback rendering).
  const firstTerminalAt = firstTerminalAtRef.current;
  const inAutoTriggerGrace =
    jobStatus === "COMPLETED" &&
    copeStatus === "IDLE" &&
    autoGenerateCope &&
    firstTerminalAt != null &&
    Date.now() - firstTerminalAt < COPE_AUTO_TRIGGER_GRACE_MS;

  // ETA must be computed BEFORE any early-return so hook order stays stable.
  const eta = useMemo(() => {
    if (jobStatus !== "RUNNING" && jobStatus !== "QUEUED") return null;
    if (!job?.startedAt) return null;
    if (completed < 1) return null;
    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    if (elapsedMs <= 0) return null;
    const ratePerMs = completed / elapsedMs;
    const remainingMs = (total - completed) / ratePerMs;
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
    const mins = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `~${mins}m remaining`;
  }, [jobStatus, job?.startedAt, completed, total]);

  const dismissCopePrompt = useCallback(() => {
    userDismissedCopePromptRef.current = true;
    setDismissTick((n) => n + 1);
  }, []);

  const triggerCopeGeneration = useCallback(async () => {
    if (!projectId) return;
    if (pendingCopeClick) return;
    setPendingFromCopeStatus(copeStatus);
    setCopeClickError(null);
    try {
      const res = await fetch("/api/cope-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        // 409 BUSY is not a user error — another caller (e.g. auto-trigger)
        // already holds the lock. Let polling surface the shared progress.
        if (res.status === 409) return;
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setCopeClickError(body?.error ?? `Request failed (HTTP ${res.status})`);
        setPendingFromCopeStatus(null);
      }
    } catch (e) {
      setCopeClickError(e instanceof Error ? e.message : "Request failed");
      setPendingFromCopeStatus(null);
    }
  }, [projectId, pendingCopeClick, copeStatus]);

  if (!activeJobId) return null;
  // Wait one tick for the portal target to populate. On the first render
  // after `activeJobId` flips from null to set, `portalTarget` is still null
  // (the setter runs in a useEffect). Skipping this render is fine — polling
  // will trigger the next render with the target available.
  if (!portalTarget) return null;

  const copeGenerating = copeStatus === "GENERATING";
  const jobTerminal = isTerminal(jobStatus);
  // Dismissibility: never while job is in-flight OR while COPE is generating.
  // Dismissibility: terminal + COPE not in flight (including auto-trigger
  // grace window, which renders identically to GENERATING).
  const canDismiss = jobTerminal && !copeGenerating && !inAutoTriggerGrace;

  // ---------- Visual theme ----------
  // When COPE is in flight or failed, let its state drive the border color
  // so the user's eye catches the COPE-specific outcome.
  let tone: "green" | "amber" | "red" | "neutral" = "neutral";
  if (jobStatus === "FAILED") tone = "red";
  else if (jobStatus === "COMPLETED") {
    if (copeStatus === "FAILED") tone = "red";
    else if (copeGenerating || inAutoTriggerGrace) tone = "neutral";
    else tone = "green";
  } else if (jobStatus === "PARTIAL") tone = "amber";

  const borderClass =
    tone === "green"
      ? "border-green-500"
      : tone === "amber"
        ? "border-amber-500"
        : tone === "red"
          ? "border-red-500"
          : "border-zinc-300 dark:border-zinc-600";

  // Convenience: the "auto off + COMPLETED + IDLE" branch has two sub-states
  // distinguished by `userDismissedCopePromptRef` (confirmation prompt vs.
  // "Not now" dismissed state). Computed once so the JSX below can key off it.
  const autoOffIdleTerminal =
    jobStatus === "COMPLETED" &&
    copeStatus === "IDLE" &&
    !inAutoTriggerGrace &&
    !autoGenerateCope;
  const userDismissedCopePrompt = userDismissedCopePromptRef.current;

  // ---------- Title ----------
  let title: string;
  if (!jobTerminal) title = "Generating estimates";
  else if (jobStatus === "FAILED") title = "Estimates failed";
  else if (copeGenerating || inAutoTriggerGrace) title = "Generating project overhead";
  else if (copeStatus === "FAILED") title = "Project overhead failed";
  else if (jobStatus === "PARTIAL") title = "Some estimates failed";
  else if (copeStatus === "READY") title = "All done";
  else if (autoOffIdleTerminal && userDismissedCopePrompt) title = "All done";
  else title = "Estimates ready";

  // ---------- Glyph ----------
  const showSpinner =
    !jobTerminal || copeGenerating || inAutoTriggerGrace;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border-2 bg-white shadow-lg dark:bg-zinc-900 ${borderClass}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Status glyph */}
        <div className="pt-0.5">
          {showSpinner ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
          ) : tone === "green" ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
              &#10003;
            </span>
          ) : tone === "amber" ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              !
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              &#10007;
            </span>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
            {canDismiss && (
              <button
                type="button"
                onClick={dismissJob}
                className="-mr-1 -mt-0.5 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Dismiss"
              >
                &#10005;
              </button>
            )}
          </div>

          {job?.projectTitle && (
            <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
              {job.projectTitle}
            </p>
          )}

          {/* ========================================================== */}
          {/* RUNNING / QUEUED — progress bar unchanged from Phase 8B     */}
          {/* ========================================================== */}
          {!jobTerminal && total > 0 && (
            <>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-zinc-700 transition-[width] duration-500 dark:bg-zinc-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, ((completed + failed) / total) * 100),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                {completed} of {total} complete
                {failed > 0 ? `, ${failed} failed` : ""}
                {eta ? ` — ${eta}` : ""}
              </p>
            </>
          )}

          {/* ========================================================== */}
          {/* FAILED — no COPE options (nothing to aggregate over)        */}
          {/* ========================================================== */}
          {jobStatus === "FAILED" && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              All estimates failed.{" "}
              {projectId && (
                <Link
                  href={`/admin/projects/${projectId}?tab=rooms`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--brand-accent)" }}
                >
                  Open project
                </Link>
              )}
            </p>
          )}

          {/* ========================================================== */}
          {/* COPE GENERATING (or in grace window after auto-trigger)     */}
          {/* ========================================================== */}
          {jobTerminal && jobStatus !== "FAILED" && (copeGenerating || inAutoTriggerGrace) && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {jobStatus === "PARTIAL"
                ? `Estimates: ${failed} of ${total} failed. Generating project overhead…`
                : "Generating project overhead…"}
            </p>
          )}

          {/* ========================================================== */}
          {/* COPE READY                                                  */}
          {/* ========================================================== */}
          {jobStatus === "COMPLETED" && copeStatus === "READY" && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              All {total} estimates + project overhead ready.{" "}
              {projectId && (
                <Link
                  href={`/admin/projects/${projectId}?tab=rooms`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--brand-accent)" }}
                >
                  Open project
                </Link>
              )}
            </p>
          )}
          {jobStatus === "PARTIAL" && copeStatus === "READY" && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Project overhead calculated from partial data.{" "}
              {projectId && (
                <Link
                  href={`/admin/projects/${projectId}?tab=rooms`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--brand-accent)" }}
                >
                  Open project
                </Link>
              )}
            </p>
          )}

          {/* ========================================================== */}
          {/* COPE FAILED — red border + truncated error + retry button  */}
          {/* ========================================================== */}
          {jobTerminal && jobStatus !== "FAILED" && copeStatus === "FAILED" && (
            <>
              <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                Project overhead generation failed.
              </p>
              {copeError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400" title={copeError}>
                  {copeError.length > COPE_ERROR_TRUNCATE
                    ? `${copeError.slice(0, COPE_ERROR_TRUNCATE)}…`
                    : copeError}
                </p>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={triggerCopeGeneration}
                  disabled={pendingCopeClick}
                  className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                >
                  {copeButtonLabel(copeStatus, pendingCopeClick)}
                </button>
              </div>
            </>
          )}

          {/* ========================================================== */}
          {/* COMPLETED + IDLE + auto OFF (and past grace window) —       */}
          {/* manual "Generate Project Overhead"                           */}
          {/* ========================================================== */}
          {/* COMPLETED + IDLE + auto OFF + not-yet-dismissed:                */}
          {/* confirmation prompt with [Generate] [Not now].                  */}
          {autoOffIdleTerminal && !userDismissedCopePrompt && (
            <>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                All {total} estimates generated. Would you like to generate Project Overhead now?
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerCopeGeneration}
                  disabled={pendingCopeClick}
                  className="rounded-md px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
                  style={{ backgroundColor: "var(--brand-accent)" }}
                >
                  {pendingCopeClick ? "Generating\u2026" : "Generate"}
                </button>
                <button
                  type="button"
                  onClick={dismissCopePrompt}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Not now
                </button>
              </div>
            </>
          )}

          {/* COMPLETED + IDLE + auto OFF + user-dismissed:                   */}
          {/* link that navigates to rooms tab with ?scrollToCope=1, which    */}
          {/* RoomsTab reads on mount to scroll the COPE card into view.      */}
          {autoOffIdleTerminal && userDismissedCopePrompt && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Project overhead not yet generated. Use the{" "}
              {projectId ? (
                <Link
                  href={`/admin/projects/${projectId}?tab=rooms&scrollToCope=1`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--brand-accent)" }}
                >
                  Generate COPE button
                </Link>
              ) : (
                <span className="font-medium">Generate COPE button</span>
              )}
              {" "}in the Project Overhead section when ready.
            </p>
          )}

          {/* ========================================================== */}
          {/* COMPLETED + IDLE + auto ON + past grace (auto-trigger       */}
          {/* apparently failed to publish) — fallback to manual button.  */}
          {/* ========================================================== */}
          {jobStatus === "COMPLETED" &&
            copeStatus === "IDLE" &&
            !inAutoTriggerGrace &&
            autoGenerateCope && (
              <>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  All {total} estimates ready. Auto-trigger didn&rsquo;t kick off — run it manually:
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={triggerCopeGeneration}
                    disabled={pendingCopeClick}
                    className="rounded-md px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
                    style={{ backgroundColor: "var(--brand-accent)" }}
                  >
                    {copeButtonLabel(copeStatus, pendingCopeClick)}
                  </button>
                </div>
              </>
            )}

          {/* ========================================================== */}
          {/* PARTIAL + not-generating-COPE — two-button prompt           */}
          {/* ========================================================== */}
          {jobStatus === "PARTIAL" &&
            !copeGenerating &&
            copeStatus !== "READY" &&
            copeStatus !== "FAILED" && (
              <>
                <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                  {failed} of {total} rooms failed to estimate. Project overhead calculations will be based on incomplete data.
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {projectId && (
                    <Link
                      href={`/admin/projects/${projectId}?tab=rooms`}
                      className="rounded-md px-3 py-1 text-center text-xs font-semibold text-white shadow-sm"
                      style={{ backgroundColor: "var(--brand-accent)" }}
                    >
                      Retry failed rooms first
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={triggerCopeGeneration}
                    disabled={pendingCopeClick}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {pendingCopeClick ? "Generating\u2026" : "Update Project Overhead anyway"}
                  </button>
                </div>
              </>
            )}

          {/* ========================================================== */}
          {/* Error surfaces (poll errors + post-click errors)            */}
          {/* ========================================================== */}
          {error && !jobTerminal && (
            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>
          )}
          {copeClickError && (
            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{copeClickError}</p>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

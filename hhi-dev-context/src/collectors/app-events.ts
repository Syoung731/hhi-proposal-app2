/**
 * Manual app event logging for hhi-dev-context.
 * Use from app code or scripts to record errors, sync runs, task runs, and route health.
 * Does not expose secrets or raw env.
 */

import {
  insertError,
  insertLog,
  insertSyncRun,
  updateSyncRun,
  insertSnapshot,
  insertTaskRun,
  updateTaskRun,
  upsertRouteHealth,
  type SyncStatus,
  type TaskRunStatus,
  type RouteHealthStatus,
} from "../db/store";

/** Optional metadata for errors (route, file, jobId, env, component). */
export interface ErrorMeta {
  route?: string | null;
  file?: string | null;
  jobId?: string | null;
  env?: "local" | "staging" | "production" | null;
  component?: string | null;
}

/** Optional metadata for logs (route, jobId, component, eventType). */
export interface LogMeta {
  route?: string | null;
  jobId?: string | null;
  component?: string | null;
  eventType?: string | null;
}

/** Log an app or server error with optional metadata (no env values). */
export function logAppError(params: {
  source: "app" | "server" | "build" | string;
  message: string;
  stack?: string | null;
  code?: string | null;
  severity?: "info" | "warn" | "error";
} & ErrorMeta): number {
  return insertError({
    source: params.source,
    message: params.message,
    stack: params.stack ?? null,
    code: params.code ?? null,
    severity: params.severity ?? "error",
    route: params.route ?? null,
    file: params.file ?? null,
    job_id: params.jobId ?? null,
    env: params.env ?? null,
    component: params.component ?? null,
  });
}

/** Log a generic log entry with optional metadata. */
export function logAppLog(params: {
  source: string;
  level?: string;
  message: string;
  meta?: string | null;
  severity?: "debug" | "info" | "warn" | "error";
} & LogMeta): number {
  return insertLog({
    source: params.source,
    level: params.level ?? params.severity ?? "info",
    message: params.message,
    meta: params.meta ?? null,
    severity: params.severity ?? "info",
    route: params.route ?? null,
    job_id: params.jobId ?? null,
    component: params.component ?? null,
    event_type: params.eventType ?? null,
  });
}

/**
 * Start a sync run; returns id. Call logSyncRun again or updateSyncRunStatus to finish.
 */
export function logSyncRun(params: {
  jobId: string;
  status: SyncStatus;
  startedAt: string; // ISO
  finishedAt?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
}): number {
  return insertSyncRun({
    job_id: params.jobId,
    status: params.status,
    started_at: params.startedAt,
    finished_at: params.finishedAt ?? null,
    summary: params.summary ?? null,
    error_message: params.errorMessage ?? null,
  });
}

/** Update an existing sync run by id (e.g. mark finished). */
export function updateSyncRunStatus(
  id: number,
  updates: { status: SyncStatus; finishedAt?: string; summary?: string; errorMessage?: string }
): void {
  updateSyncRun(id, {
    status: updates.status,
    finished_at: updates.finishedAt,
    summary: updates.summary,
    error_message: updates.errorMessage,
  });
}

/** Start a task run (build, lint, test, etc.). Returns task run id. */
export function logTaskRunStart(
  taskName: string,
  meta?: { route?: string | null; jobId?: string | null }
): number {
  return insertTaskRun({
    task_name: taskName,
    status: "running",
    started_at: new Date().toISOString(),
    route: meta?.route ?? null,
    job_id: meta?.jobId ?? null,
  });
}

/** Finish a task run (status ok/failed, optional summary and output excerpt; excerpt is truncated). */
export function logTaskRunFinish(
  taskRunId: number,
  status: "ok" | "failed",
  summary?: string | null,
  outputExcerpt?: string | null
): void {
  updateTaskRun(taskRunId, {
    status,
    ended_at: new Date().toISOString(),
    summary: summary ?? undefined,
    output_excerpt: outputExcerpt ?? undefined,
  });
}

/** Record or update route health (upsert by route). */
export function logRouteHealth(
  route: string,
  status: RouteHealthStatus,
  meta?: {
    latestErrorId?: number | null;
    latestLogId?: number | null;
    responseTimeMs?: number | null;
    activeJobId?: string | null;
    notes?: string | null;
  }
): number {
  return upsertRouteHealth({
    route,
    status,
    last_checked_at: new Date().toISOString(),
    latest_error_id: meta?.latestErrorId ?? null,
    latest_log_id: meta?.latestLogId ?? null,
    response_time_ms: meta?.responseTimeMs ?? null,
    active_job_id: meta?.activeJobId ?? null,
    notes: meta?.notes ?? null,
  });
}

/**
 * Log build/lint/test task status and optionally attach to a new snapshot.
 * If branch is provided, creates a snapshot with that task_status; otherwise only logs.
 */
export function logTaskStatus(params: {
  source: string; // e.g. "build" | "lint" | "test"
  status: "ok" | "fail";
  message: string;
  branch?: string | null;
  changedCount?: number;
} & LogMeta): number {
  const severity = params.status === "ok" ? "info" : "error";
  const logId = insertLog({
    source: params.source,
    level: severity,
    message: params.message,
    meta: params.branch ? JSON.stringify({ branch: params.branch, changedCount: params.changedCount }) : null,
    severity: params.status === "ok" ? "info" : "error",
    route: params.route ?? null,
    job_id: params.jobId ?? null,
    component: params.component ?? null,
    event_type: params.eventType ?? null,
  });
  if (params.branch != null && params.status === "ok") {
    const taskStatus = `${params.source}:ok`;
    insertSnapshot({
      branch: params.branch,
      changed_count: params.changedCount ?? 0,
      task_status: taskStatus,
    });
  }
  return logId;
}

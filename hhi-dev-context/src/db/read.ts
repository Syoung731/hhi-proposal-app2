/**
 * Read-only queries for hhi-dev-context API.
 * No secrets or raw env; only structured dev state.
 */

import type { DevSnapshot, DevError, DevLog, SyncRun, ChangedFile, TaskRun, RouteHealth } from "../types";
import { getDb, getDbPath, setDb as setSchemaDb } from "./schema";

/** Summary payload for AI / compact overview. */
export interface DevSummary {
  branch: string | null;
  commit_hash: string | null;
  top_changed_files: { path: string; status: string }[];
  latest_task_statuses: Record<string, { status: TaskRun["status"]; summary?: string | null; ended_at?: string | null }>;
  latest_sync_run: SyncRun | null;
  route_health: RouteHealth[];
  error_counts_by_source: Record<string, number>;
  latest_errors: DevError[];
}

export function setReadDb(db: import("sql.js").Database | null): void {
  setSchemaDb(db);
}

/** Run query and return rows as objects. sql.js returns columns + values; we map to objects. */
function queryAll(db: import("sql.js").Database, sql: string, params: (string | number)[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    rows.push(row);
  }
  stmt.free();
  return rows;
}

function queryOne(db: import("sql.js").Database, sql: string, params: (string | number)[] = []): Record<string, unknown> | null {
  const rows = queryAll(db, sql, params);
  return rows[0] ?? null;
}

function rowToSnapshot(row: Record<string, unknown>): DevSnapshot {
  return {
    id: row.id as number,
    branch: row.branch as string,
    commit_hash: (row.commit_hash as string) ?? null,
    changed_count: row.changed_count as number,
    task_status: (row.task_status as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToError(row: Record<string, unknown>): DevError {
  const severity = (row.severity as string) || "error";
  const envRaw = (row.env as string | null | undefined) ?? null;
  const env =
    envRaw === "local" || envRaw === "staging" || envRaw === "production" ? envRaw : null;
  return {
    id: row.id as number,
    source: row.source as string,
    message: row.message as string,
    stack: (row.stack as string) ?? null,
    code: (row.code as string) ?? null,
    severity: severity === "info" || severity === "warn" ? severity : "error",
    route: (row.route as string) ?? null,
    file: (row.file as string) ?? null,
    job_id: (row.job_id as string) ?? null,
    env,
    component: (row.component as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToLog(row: Record<string, unknown>): DevLog {
  const severity = (row.severity as string) || "info";
  const s = severity === "debug" || severity === "warn" || severity === "error" ? severity : "info";
  return {
    id: row.id as number,
    source: row.source as string,
    level: row.level as string,
    message: row.message as string,
    meta: (row.meta as string) ?? null,
    severity: s,
    route: (row.route as string) ?? null,
    job_id: (row.job_id as string) ?? null,
    component: (row.component as string) ?? null,
    event_type: (row.event_type as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToSyncRun(row: Record<string, unknown>): SyncRun {
  return {
    id: row.id as number,
    job_id: row.job_id as string,
    status: row.status as SyncRun["status"],
    started_at: row.started_at as string,
    finished_at: (row.finished_at as string) ?? null,
    summary: (row.summary as string) ?? null,
    error_message: (row.error_message as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToChangedFile(row: Record<string, unknown>): ChangedFile {
  return {
    id: row.id as number,
    snapshot_id: row.snapshot_id as number,
    path: row.path as string,
    status: row.status as string,
    created_at: row.created_at as string,
  };
}

function rowToTaskRun(row: Record<string, unknown>): TaskRun {
  return {
    id: row.id as number,
    task_name: row.task_name as string,
    status: row.status as TaskRun["status"],
    started_at: row.started_at as string,
    ended_at: (row.ended_at as string) ?? null,
    summary: (row.summary as string) ?? null,
    output_excerpt: (row.output_excerpt as string) ?? null,
    route: (row.route as string) ?? null,
    job_id: (row.job_id as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToRouteHealth(row: Record<string, unknown>): RouteHealth {
  return {
    id: row.id as number,
    route: row.route as string,
    status: row.status as RouteHealth["status"],
    last_checked_at: row.last_checked_at as string,
    latest_error_id: (row.latest_error_id as number) ?? null,
    latest_log_id: (row.latest_log_id as number) ?? null,
    response_time_ms: (row.response_time_ms as number) ?? null,
    active_job_id: (row.active_job_id as string) ?? null,
    notes: (row.notes as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** Latest snapshot (most recent by id). */
export function getLatestSnapshot(): DevSnapshot | null {
  const db = getDb();
  const row = queryOne(db, "SELECT * FROM snapshots ORDER BY id DESC LIMIT 1");
  return row ? rowToSnapshot(row) : null;
}

/** Recent errors, default limit 20. */
export function getErrors(limit = 20): DevError[] {
  const db = getDb();
  const cap = Math.max(1, Math.min(limit, 100));
  const rows = queryAll(db, "SELECT * FROM errors ORDER BY created_at DESC LIMIT ?", [cap]);
  return rows.map((r) => rowToError(r));
}

/** Logs with optional source filter, default limit 50. */
export function getLogs(options: { source?: string; limit?: number } = {}): DevLog[] {
  const { source, limit = 50 } = options;
  const db = getDb();
  const cap = Math.max(1, Math.min(limit, 200));
  const rows = source
    ? queryAll(db, "SELECT * FROM logs WHERE source = ? ORDER BY created_at DESC LIMIT ?", [source, cap])
    : queryAll(db, "SELECT * FROM logs ORDER BY created_at DESC LIMIT ?", [cap]);
  return rows.map((r) => rowToLog(r));
}

/** Single sync run by job_id (latest if multiple). */
export function getSyncRunByJobId(jobId: string): SyncRun | null {
  const db = getDb();
  const row = queryOne(db, "SELECT * FROM sync_runs WHERE job_id = ? ORDER BY id DESC LIMIT 1", [jobId]);
  return row ? rowToSyncRun(row) : null;
}

/**
 * Recent changed files, one row per path (latest snapshot wins), newest insert first.
 * Avoids repeating the same path across many historical git snapshots.
 */
export function getChangedFiles(limit = 50): ChangedFile[] {
  const db = getDb();
  const cap = Math.max(1, Math.min(limit, 100));
  const rows = queryAll(
    db,
    `SELECT c.* FROM changed_files c
     INNER JOIN (
       SELECT path, MAX(id) AS max_id FROM changed_files GROUP BY path
     ) t ON c.id = t.max_id
     ORDER BY c.id DESC
     LIMIT ?`,
    [cap],
  );
  return rows.map((r) => rowToChangedFile(r));
}

/** Task runs: optional limit and taskName filter. */
export function getTaskRuns(options: { limit?: number; taskName?: string } = {}): TaskRun[] {
  const { limit = 20, taskName } = options;
  const db = getDb();
  const cap = Math.max(1, Math.min(limit, 100));
  const rows = taskName
    ? queryAll(db, "SELECT * FROM task_runs WHERE task_name = ? ORDER BY id DESC LIMIT ?", [taskName, cap])
    : queryAll(db, "SELECT * FROM task_runs ORDER BY id DESC LIMIT ?", [cap]);
  return rows.map((r) => rowToTaskRun(r));
}

/** Latest task run for a given task name. */
export function getLatestTaskRun(taskName: string): TaskRun | null {
  const db = getDb();
  const row = queryOne(db, "SELECT * FROM task_runs WHERE task_name = ? ORDER BY id DESC LIMIT 1", [taskName]);
  return row ? rowToTaskRun(row) : null;
}

/** All route health entries, or single route if route param provided. */
export function getRouteHealth(route?: string): RouteHealth[] {
  const db = getDb();
  if (route) {
    const row = queryOne(db, "SELECT * FROM route_health WHERE route = ?", [route]);
    return row ? [rowToRouteHealth(row)] : [];
  }
  const rows = queryAll(db, "SELECT * FROM route_health ORDER BY route ASC");
  return rows.map((r) => rowToRouteHealth(r));
}

/** Compact summary for AI / debugging overview. */
export function getSummary(): DevSummary {
  const snapshot = getLatestSnapshot();
  const topFiles = getChangedFiles(10).map((f) => ({ path: f.path, status: f.status }));
  const taskRuns = getTaskRuns({ limit: 50 });
  const latestByTask: DevSummary["latest_task_statuses"] = {};
  for (const run of taskRuns) {
    if (latestByTask[run.task_name] == null) {
      latestByTask[run.task_name] = {
        status: run.status,
        summary: run.summary ?? null,
        ended_at: run.ended_at ?? null,
      };
    }
  }
  const db = getDb();
  const latestSyncRow = queryOne(db, "SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1");
  const latest_sync_run = latestSyncRow ? rowToSyncRun(latestSyncRow) : null;
  const route_health = getRouteHealth();
  const errors = getErrors(100);
  const error_counts_by_source: Record<string, number> = {};
  for (const e of errors) {
    error_counts_by_source[e.source] = (error_counts_by_source[e.source] ?? 0) + 1;
  }
  const latest_errors = getErrors(5);

  return {
    branch: snapshot?.branch ?? null,
    commit_hash: snapshot?.commit_hash ?? null,
    top_changed_files: topFiles,
    latest_task_statuses: latestByTask,
    latest_sync_run,
    route_health,
    error_counts_by_source,
    latest_errors,
  };
}

export { getDbPath };

/**
 * Write-only store for ingesting dev context data.
 * Used by collectors and app-event logger; read path is in the API layer.
 */

import type { DevSnapshot, DevError, DevLog, SyncRun, ChangedFile } from "../types";
import { getDb, persist, setDb as setSchemaDb } from "./schema";

const MAX_EXCERPT_LEN = 2000;

/** Call from API or tests to inject a DB instance (e.g. in-memory). */
export function setDb(db: import("sql.js").Database | null): void {
  setSchemaDb(db);
}

/** Truncate string for output_excerpt / safe display; no secrets. */
export function truncateExcerpt(s: string | null | undefined, maxLen: number = MAX_EXCERPT_LEN): string | null {
  if (s == null || s === "") return null;
  const t = String(s).slice(0, maxLen);
  return t.length < s.length ? t + "…" : t;
}

/** Get the last inserted row id. sql.js can be inconsistent with last_insert_rowid after load. */
function lastId(table: "snapshots" | "errors" | "logs" | "sync_runs" | "task_runs" | "route_health"): number {
  const db = getDb();
  const result = db.exec(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`);
  if (!result[0]?.values?.length) return 0;
  const val = result[0].values[0][0];
  return typeof val === "number" ? val : Number(val) || 0;
}

// --- Snapshots & changed files ---

export interface SnapshotInput {
  branch: string;
  commit_hash?: string | null;
  changed_count: number;
  task_status?: string | null;
}

export function insertSnapshot(input: SnapshotInput): number {
  const db = getDb();
  db.run(
    "INSERT INTO snapshots (branch, commit_hash, changed_count, task_status) VALUES (?, ?, ?, ?)",
    [
      input.branch,
      input.commit_hash ?? null,
      input.changed_count,
      input.task_status ?? null,
    ]
  );
  const id = lastId("snapshots");
  persist();
  return id;
}

export function insertChangedFiles(snapshotId: number, files: { path: string; status: string }[]): void {
  const db = getDb();
  const merged = new Map<string, { path: string; status: string }>();
  for (const f of files) {
    merged.set(f.path, f);
  }
  const unique = [...merged.values()];
  const stmt = db.prepare("INSERT INTO changed_files (snapshot_id, path, status) VALUES (?, ?, ?)");
  for (const f of unique) {
    stmt.bind([snapshotId, f.path, f.status]);
    stmt.step();
    stmt.reset();
  }
  stmt.free();
  persist();
}

// --- Errors ---

export interface ErrorInput {
  source: string;
  message: string;
  stack?: string | null;
  code?: string | null;
  severity?: "info" | "warn" | "error";
  route?: string | null;
  file?: string | null;
  job_id?: string | null;
  env?: "local" | "staging" | "production" | null;
  component?: string | null;
}

export function insertError(input: ErrorInput): number {
  const db = getDb();
  db.run(
    `INSERT INTO errors (source, message, stack, code, severity, route, file, job_id, env, component)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.source,
      input.message,
      input.stack ?? null,
      input.code ?? null,
      input.severity ?? "error",
      input.route ?? null,
      input.file ?? null,
      input.job_id ?? null,
      input.env ?? null,
      input.component ?? null,
    ]
  );
  persist();
  return lastId("errors");
}

// --- Logs ---

export interface LogInput {
  source: string;
  level: string;
  message: string;
  meta?: string | null;
  severity?: "debug" | "info" | "warn" | "error";
  route?: string | null;
  job_id?: string | null;
  component?: string | null;
  event_type?: string | null;
}

export function insertLog(input: LogInput): number {
  const db = getDb();
  db.run(
    `INSERT INTO logs (source, level, message, meta, severity, route, job_id, component, event_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.source,
      input.level,
      input.message,
      input.meta ?? null,
      input.severity ?? "info",
      input.route ?? null,
      input.job_id ?? null,
      input.component ?? null,
      input.event_type ?? null,
    ]
  );
  persist();
  return lastId("logs");
}

// --- Sync runs ---

export type SyncStatus = "pending" | "running" | "success" | "failed";

export interface SyncRunInput {
  job_id: string;
  status: SyncStatus;
  started_at: string; // ISO
  finished_at?: string | null;
  summary?: string | null;
  error_message?: string | null;
}

export function insertSyncRun(input: SyncRunInput): number {
  const db = getDb();
  db.run(
    `INSERT INTO sync_runs (job_id, status, started_at, finished_at, summary, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.job_id,
      input.status,
      input.started_at,
      input.finished_at ?? null,
      input.summary ?? null,
      input.error_message ?? null,
    ]
  );
  persist();
  return lastId("sync_runs");
}

export function updateSyncRun(
  id: number,
  updates: { status: SyncStatus; finished_at?: string; summary?: string; error_message?: string }
): void {
  const db = getDb();
  db.run(
    `UPDATE sync_runs SET status = ?, finished_at = ?, summary = ?, error_message = ?
     WHERE id = ?`,
    [updates.status, updates.finished_at ?? null, updates.summary ?? null, updates.error_message ?? null, id]
  );
  persist();
}

// --- Task runs ---

export type TaskRunStatus = "running" | "ok" | "failed";

export interface TaskRunInput {
  task_name: string;
  status: TaskRunStatus;
  started_at: string;
  ended_at?: string | null;
  summary?: string | null;
  output_excerpt?: string | null; // will be truncated
  route?: string | null;
  job_id?: string | null;
}

export function insertTaskRun(input: TaskRunInput): number {
  const db = getDb();
  const excerpt = truncateExcerpt(input.output_excerpt);
  db.run(
    `INSERT INTO task_runs (task_name, status, started_at, ended_at, summary, output_excerpt, route, job_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.task_name,
      input.status,
      input.started_at,
      input.ended_at ?? null,
      input.summary ?? null,
      excerpt,
      input.route ?? null,
      input.job_id ?? null,
    ]
  );
  persist();
  return lastId("task_runs");
}

export function updateTaskRun(
  id: number,
  updates: { status: TaskRunStatus; ended_at?: string; summary?: string; output_excerpt?: string }
): void {
  const db = getDb();
  const excerpt = truncateExcerpt(updates.output_excerpt);
  db.run(
    `UPDATE task_runs SET status = ?, ended_at = ?, summary = ?, output_excerpt = ? WHERE id = ?`,
    [
      updates.status,
      updates.ended_at ?? null,
      updates.summary ?? null,
      excerpt ?? null,
      id,
    ]
  );
  persist();
}

// --- Route health ---

export type RouteHealthStatus = "ok" | "warn" | "error";

export interface RouteHealthInput {
  route: string;
  status: RouteHealthStatus;
  last_checked_at: string;
  latest_error_id?: number | null;
  latest_log_id?: number | null;
  response_time_ms?: number | null;
  active_job_id?: string | null;
  notes?: string | null;
}

/** Upsert by route (INSERT OR REPLACE would change id; we do SELECT then UPDATE or INSERT). */
export function upsertRouteHealth(input: RouteHealthInput): number {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare("SELECT id FROM route_health WHERE route = ?");
  stmt.bind([input.route]);
  const hasRow = stmt.step();
  stmt.free();

  if (hasRow) {
    const idStmt = db.prepare("SELECT id FROM route_health WHERE route = ?");
    idStmt.bind([input.route]);
    idStmt.step();
    const row = idStmt.getAsObject() as { id: number };
    idStmt.free();
    const id = row.id;
    db.run(
      `UPDATE route_health SET status = ?, last_checked_at = ?, latest_error_id = ?, latest_log_id = ?,
       response_time_ms = ?, active_job_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        input.status,
        input.last_checked_at,
        input.latest_error_id ?? null,
        input.latest_log_id ?? null,
        input.response_time_ms ?? null,
        input.active_job_id ?? null,
        input.notes ?? null,
        now,
        id,
      ]
    );
    persist();
    return id;
  }

  db.run(
    `INSERT INTO route_health (route, status, last_checked_at, latest_error_id, latest_log_id, response_time_ms, active_job_id, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.route,
      input.status,
      input.last_checked_at,
      input.latest_error_id ?? null,
      input.latest_log_id ?? null,
      input.response_time_ms ?? null,
      input.active_job_id ?? null,
      input.notes ?? null,
      now,
    ]
  );
  persist();
  return lastId("route_health");
}

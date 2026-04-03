/**
 * Type definitions for hhi-dev-context.
 * All entities are stored in SQLite; these types match DB shape and API responses.
 */

/** Single dev-environment snapshot (branch + commit + changed files + optional task status). */
export interface DevSnapshot {
  id: number;
  branch: string;
  commit_hash?: string | null;
  changed_count: number;
  task_status?: string | null;
  created_at: string; // ISO
}

/** Recorded app or server error (no raw env or secrets). */
export interface DevError {
  id: number;
  source: string; // e.g. "app" | "server" | "build"
  message: string;
  stack?: string | null;
  code?: string | null;
  severity: "info" | "warn" | "error";
  route?: string | null;
  file?: string | null;
  job_id?: string | null;
  env?: "local" | "staging" | "production" | null;
  component?: string | null;
  created_at: string;
}

/** Generic log entry with optional source and level. */
export interface DevLog {
  id: number;
  source: string; // e.g. "app" | "server" | "collector"
  level: string; // kept for backward compat; prefer severity
  message: string;
  meta?: string | null; // JSON string for extra data
  severity: "debug" | "info" | "warn" | "error";
  route?: string | null;
  job_id?: string | null;
  component?: string | null;
  event_type?: string | null;
  created_at: string;
}

/** One sync job run (e.g. Jobtread sync, export). */
export interface SyncRun {
  id: number;
  job_id: string; // external job identifier
  status: "pending" | "running" | "success" | "failed";
  started_at: string;
  finished_at?: string | null;
  summary?: string | null; // short human-readable summary
  error_message?: string | null;
  created_at: string;
}

/** One changed file from git status. */
export interface ChangedFile {
  id: number;
  snapshot_id: number;
  path: string;
  status: string; // e.g. "M" | "A" | "D" | "??"
  created_at: string;
}

/** Structured task run (build, lint, test, etc.). */
export interface TaskRun {
  id: number;
  task_name: string;
  status: "running" | "ok" | "failed";
  started_at: string;
  ended_at?: string | null;
  summary?: string | null;
  output_excerpt?: string | null; // truncated
  route?: string | null;
  job_id?: string | null;
  created_at: string;
}

/** Route health entry (per-route status and metadata). */
export interface RouteHealth {
  id: number;
  route: string;
  status: "ok" | "warn" | "error";
  last_checked_at: string;
  latest_error_id?: number | null;
  latest_log_id?: number | null;
  response_time_ms?: number | null;
  active_job_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

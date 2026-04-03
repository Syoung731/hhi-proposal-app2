/**
 * SQLite schema for hhi-dev-context (sql.js for portability, no native build).
 * Creates tables if they do not exist; runs defensive migrations for existing DBs.
 */

import fs from "fs";
import path from "path";
import type { Database } from "sql.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), ".hhi-dev-context", "dev-context.db");

export function getDbPath(): string {
  return process.env.HHI_DEV_CONTEXT_DB ?? DEFAULT_DB_PATH;
}

let dbInstance: Database | null = null;
let dbPath: string = DEFAULT_DB_PATH;

/** Base schema: tables with original + new columns where possible. New tables at end. */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch TEXT NOT NULL,
    commit_hash TEXT,
    changed_count INTEGER NOT NULL DEFAULT 0,
    task_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    code TEXT,
    severity TEXT NOT NULL DEFAULT 'error',
    route TEXT,
    file TEXT,
    job_id TEXT,
    env TEXT,
    component TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    meta TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    route TEXT,
    job_id TEXT,
    component TEXT,
    event_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','running','success','failed')),
    started_at TEXT NOT NULL,
    finished_at TEXT,
    summary TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS changed_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
    path TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','ok','failed')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    summary TEXT,
    output_excerpt TEXT,
    route TEXT,
    job_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS route_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('ok','warn','error')),
    last_checked_at TEXT NOT NULL,
    latest_error_id INTEGER,
    latest_log_id INTEGER,
    response_time_ms INTEGER,
    active_job_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_errors_created ON errors(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
  CREATE INDEX IF NOT EXISTS idx_sync_runs_job_id ON sync_runs(job_id);
  CREATE INDEX IF NOT EXISTS idx_changed_files_snapshot ON changed_files(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_task_runs_task_name ON task_runs(task_name);
  CREATE INDEX IF NOT EXISTS idx_task_runs_started ON task_runs(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_route_health_route ON route_health(route);
`;

/** Returns true if table has column (safe for missing table). */
function hasColumn(db: Database, table: string, column: string): boolean {
  try {
    const r = db.exec(`SELECT name FROM pragma_table_info('${table}') WHERE name = '${column}'`);
    return r[0]?.values?.length === 1;
  } catch {
    return false;
  }
}

/** Add column to table if missing. Safe for existing DBs. */
function addColumnIfMissing(db: Database, table: string, column: string, typeAndNull: string): void {
  if (hasColumn(db, table, column)) return;
  try {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeAndNull}`);
  } catch {
    // ignore duplicate or invalid
  }
}

/** Run migrations for DBs created before new columns/tables existed. */
function runMigrations(db: Database): void {
  // Snapshots: commit_hash
  addColumnIfMissing(db, "snapshots", "commit_hash", "TEXT");

  // Errors: severity, route, file, job_id, env, component
  addColumnIfMissing(db, "errors", "severity", "TEXT DEFAULT 'error'");
  addColumnIfMissing(db, "errors", "route", "TEXT");
  addColumnIfMissing(db, "errors", "file", "TEXT");
  addColumnIfMissing(db, "errors", "job_id", "TEXT");
  addColumnIfMissing(db, "errors", "env", "TEXT");
  addColumnIfMissing(db, "errors", "component", "TEXT");

  // Logs: severity, route, job_id, component, event_type
  addColumnIfMissing(db, "logs", "severity", "TEXT DEFAULT 'info'");
  addColumnIfMissing(db, "logs", "route", "TEXT");
  addColumnIfMissing(db, "logs", "job_id", "TEXT");
  addColumnIfMissing(db, "logs", "component", "TEXT");
  addColumnIfMissing(db, "logs", "event_type", "TEXT");

  // New tables (CREATE IF NOT EXISTS already in SCHEMA_SQL; run again in case of old DB that ran before we added them)
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running','ok','failed')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      summary TEXT,
      output_excerpt TEXT,
      route TEXT,
      job_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS route_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ok','warn','error')),
      last_checked_at TEXT NOT NULL,
      latest_error_id INTEGER,
      latest_log_id INTEGER,
      response_time_ms INTEGER,
      active_job_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_task_runs_task_name ON task_runs(task_name)");
  } catch { /* ignore */ }
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_task_runs_started ON task_runs(started_at DESC)");
  } catch { /* ignore */ }
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_route_health_route ON route_health(route)");
  } catch { /* ignore */ }
}

/** Load or create DB and run schema + migrations. Call once before using getDb(). */
export async function createDb(targetPath?: string): Promise<Database> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const pathToUse = targetPath ?? getDbPath();
  dbPath = pathToUse;

  const dir = path.dirname(pathToUse);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: Database;
  if (fs.existsSync(pathToUse)) {
    const buf = fs.readFileSync(pathToUse);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  dbInstance = db;
  return db;
}

/** Persist in-memory DB to file. Call after writes. */
export function persist(): void {
  if (!dbInstance) return;
  const data = dbInstance.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error("hhi-dev-context: call createDb() first (e.g. await initDb())");
  }
  return dbInstance;
}

/** Init and persist helper for use in server/scripts. */
export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  return createDb();
}

/** For tests: set DB instance and optional path. */
export function setDb(db: Database | null, pathOverride?: string): void {
  dbInstance = db;
  if (pathOverride !== undefined) dbPath = pathOverride;
}

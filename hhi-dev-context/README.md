# hhi-dev-context

Local dev context service: captures app/dev state (git, errors, logs, sync runs, task runs, route health, changed files) and exposes it via internal HTTP endpoints.

- `GET /...` endpoints are read-only for debugging (`/summary`, route health, errors, etc.)
- `POST /ingest/*` endpoints are localhost-only ingestion points used by the main app

SQLite-backed (via `sql.js`); no auth on localhost. Includes an AI-friendly `/summary` endpoint. MCP wrapper and UI are out of scope for now.

## File tree

```
hhi-dev-context/
├── README.md
├── scripts/
│   ├── collect-git.ts    # CLI: run git collector (branch, commit hash, changed files)
│   └── run-server.ts     # CLI: start local HTTP API (GET + POST ingestion)
└── src/
    ├── types.ts          # DevSnapshot, DevError, DevLog, SyncRun, ChangedFile, TaskRun, RouteHealth
    ├── db/
    │   ├── schema.ts     # SQLite schema + migrations, createDb, getDbPath
    │   ├── store.ts      # Write: snapshots, errors, logs, sync_runs, task_runs, route_health, changed_files
    │   └── read.ts       # Read: getters + getSummary()
    ├── api/
    │   └── server.ts     # HTTP server, GET + localhost POST ingestion routes
    └── collectors/
        ├── index.ts      # Re-exports for app usage
        ├── git-collector.ts  # collectGit(), parsePorcelain()
        └── app-events.ts     # logAppError, logAppLog, logSyncRun, logTaskRunStart, logTaskRunFinish, logRouteHealth, logTaskStatus
```

DB and default location: `.hhi-dev-context/dev-context.db` (under project root). Override with `HHI_DEV_CONTEXT_DB`. Storage uses **sql.js** (SQLite in WebAssembly) so no native build or Python is required.

## Schema / entities

- **snapshots** – branch, commit_hash, changed_count, task_status
- **errors** – source, message, stack, code, severity (info|warn|error), route, file, job_id, env, component
- **logs** – source, level, message, meta, severity (debug|info|warn|error), route, job_id, component, event_type
- **sync_runs** – job_id, status, started_at, finished_at, summary, error_message
- **changed_files** – snapshot_id, path (file-level repo-relative path), status (e.g. M, A, D, ??)
- **task_runs** – task_name, status (running|ok|failed), started_at, ended_at, summary, output_excerpt (truncated), route, job_id
- **route_health** – route (unique), status (ok|warn|error), last_checked_at, latest_error_id, latest_log_id, response_time_ms, active_job_id, notes

Existing DBs are migrated on load: new columns and tables are added defensively. If you prefer a clean slate, delete `.hhi-dev-context/dev-context.db` and restart (lightweight rebuild).

## How to run locally

1. **Install deps** (from repo root): `sql.js` is in `package.json`; run `npm install`.

2. **Start the local dev-context HTTP server** (default port 3999):
   ```bash
   npm run dev-context:serve
   ```
   Or: `npx tsx hhi-dev-context/scripts/run-server.ts`  
   Override port: `HHI_DEV_CONTEXT_PORT=4000 npm run dev-context:serve`

3. **Run the git collector** (from repo root):
   ```bash
   npm run dev-context:collect-git
   ```
   Optional: `HHI_TASK_STATUS="build:ok lint:ok" npm run dev-context:collect-git`  
   Captures branch, short commit hash, and **file-level** changed paths from `git status` (not directory buckets). Uses `git rev-parse --show-toplevel` so running the script from any subdirectory of the repo still resolves paths correctly, and `--untracked-files=all` so untracked folders are expanded to individual files. Paths are stored repo-relative with forward slashes.

4. **Send app events from the main app** (localhost-only).

The Next.js app posts events to `POST /ingest/*` using the app-side wrapper (`src/lib/dev-context`). The app never imports `hhi-dev-context` internals, and `sql.js` stays isolated inside this service.

## Endpoints (GET read-only + localhost POST ingestion)

| Method | Path | Query / Body | Description |
|--------|------|--------------|-------------|
| `GET` | `/snapshot` | — | Latest dev snapshot (branch, commit_hash, changed_count, task_status) |
| `GET` | `/errors` | `limit=20` | Recent errors (with severity, route, file, job_id, env, component) |
| `GET` | `/logs` | `source=app`, `limit=50` | Recent logs; optional `source` filter |
| `GET` | `/sync/:jobId` | — | Sync run by job id |
| `GET` | `/changed-files` | `limit=50` | Unique paths from recent git snapshots (latest row per path, newest first); each `path` is a full repo-relative file path |
| `GET` | `/task-runs` | `limit=20`, `task=build` | Recent task runs; optional `task` filter |
| `GET` | `/task-runs/latest` | `task=build` | Latest task run for given task name |
| `GET` | `/route-health` | — | All route health entries |
| `GET` | `/route-health/:route` | — | Single route health (e.g. `/route-health/GET%2Fapi%2Fhealth`) |
| `GET` | `/summary` | — | Compact AI-friendly summary |
| `POST` | `/ingest/error` | JSON body | Ingest an app/server error event |
| `POST` | `/ingest/log` | JSON body | Ingest an app/server log event |
| `POST` | `/ingest/task-run/start` | JSON body | Start a task run (`status=running`) |
| `POST` | `/ingest/task-run/finish` | JSON body | Finish a task run (`status=ok|failed`) |
| `POST` | `/ingest/route-health` | JSON body | Upsert route health |
| `POST` | `/ingest/sync-run` | JSON body | Start a sync run |
| `POST` | `/ingest/sync-run/update` | JSON body | Update a sync run to finished state |

Base URL when server is running: `http://127.0.0.1:3999`

When the main app talks to this service, it uses `HHI_DEV_CONTEXT_BASE_URL` (defaulting to the value above).

## Example responses

**GET /task-runs/latest?task=build**
```json
{
  "id": 1,
  "task_name": "build",
  "status": "ok",
  "started_at": "2025-03-19T12:00:00.000Z",
  "ended_at": "2025-03-19T12:00:15.000Z",
  "summary": "Build completed in 15s",
  "output_excerpt": "...last 2000 chars of output...",
  "route": null,
  "job_id": null,
  "created_at": "2025-03-19T12:00:00.000Z"
}
```
If no run for that task: `{ "taskRun": null }`

**GET /route-health/GET%2Fapi%2Fhealth** (route = `GET /api/health`)
```json
{
  "id": 1,
  "route": "GET /api/health",
  "status": "ok",
  "last_checked_at": "2025-03-19T12:00:00.000Z",
  "latest_error_id": null,
  "latest_log_id": null,
  "response_time_ms": 12,
  "active_job_id": null,
  "notes": "DB OK",
  "created_at": "2025-03-19T11:00:00.000Z",
  "updated_at": "2025-03-19T12:00:00.000Z"
}
```
If not found: `404` with `{ "error": "Route not found", "route": "GET /api/health" }`

**GET /summary**
```json
{
  "branch": "main",
  "commit_hash": "a1b2c3d",
  "top_changed_files": [
    { "path": "app/api/health/route.ts", "status": "M" },
    { "path": "components/Header.tsx", "status": "??" }
  ],
  "latest_task_statuses": {
    "build": { "status": "ok", "summary": "Build completed", "ended_at": "2025-03-19T12:00:15.000Z" },
    "lint": { "status": "ok", "summary": null, "ended_at": "2025-03-19T12:00:20.000Z" }
  },
  "latest_sync_run": {
    "id": 1,
    "job_id": "jobtread-sync-1",
    "status": "success",
    "started_at": "2025-03-19T11:00:00.000Z",
    "finished_at": "2025-03-19T11:01:00.000Z",
    "summary": "Synced 10 items",
    "error_message": null,
    "created_at": "2025-03-19T11:00:00.000Z"
  },
  "route_health": [
    {
      "id": 1,
      "route": "GET /api/health",
      "status": "ok",
      "last_checked_at": "2025-03-19T12:00:00.000Z",
      "latest_error_id": null,
      "latest_log_id": null,
      "response_time_ms": 12,
      "active_job_id": null,
      "notes": "DB OK",
      "created_at": "2025-03-19T11:00:00.000Z",
      "updated_at": "2025-03-19T12:00:00.000Z"
    }
  ],
  "error_counts_by_source": { "app": 2, "build": 1 },
  "latest_errors": [
    {
      "id": 3,
      "source": "app",
      "message": "Something failed",
      "stack": "Error: ...",
      "code": null,
      "severity": "error",
      "route": "/api/foo",
      "file": null,
      "job_id": null,
      "env": "local",
      "component": null,
      "created_at": "2025-03-19T12:00:00.000Z"
    }
  ]
}
```

## Migration notes

- **Existing DBs**: On first load after upgrade, the service runs defensive migrations: adds missing columns to `snapshots` (commit_hash), `errors` (severity, route, file, job_id, env, component), `logs` (severity, route, job_id, component, event_type), and creates `task_runs` and `route_health` if not present. No data is dropped.
- **Lightweight rebuild**: To start with a fresh schema (e.g. after major changes), delete the DB file: `rm -rf .hhi-dev-context` (or delete `.hhi-dev-context/dev-context.db`). The next run will create a new DB with the full schema.

## Key files

| File | Purpose |
|------|--------|
| `src/types.ts` | Shared types for API and DB |
| `src/db/schema.ts` | SQLite schema + defensive migrations |
| `src/db/store.ts` | All write operations (used by collectors) |
| `src/db/read.ts` | All read operations + getSummary() |
| `src/api/server.ts` | HTTP server and GET routing |
| `src/collectors/git-collector.ts` | Git branch + commit hash + changed files → SQLite |
| `src/collectors/app-events.ts` | logAppError, logAppLog, logTaskRunStart, logTaskRunFinish, logRouteHealth, logTaskStatus |

No write endpoints are exposed to HTTP. No secrets or raw env are ever returned. Output excerpts are truncated (e.g. 2000 chars).

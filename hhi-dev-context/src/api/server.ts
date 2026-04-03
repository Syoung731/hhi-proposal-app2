/**
 * Local dev context service HTTP server for `hhi-dev-context`.
 *
 * - GET endpoints are read-only and intended for app-side debugging UI/scripts.
 * - POST /ingest/* endpoints are localhost-only ingestion points for the main app.
 *
 * No auth for localhost; do not expose secrets or env.
 */

import http from "http";
import {
  getLatestSnapshot,
  getErrors,
  getLogs,
  getSyncRunByJobId,
  getChangedFiles,
  getTaskRuns,
  getLatestTaskRun,
  getRouteHealth,
  getSummary,
} from "../db/read";
import {
  insertError,
  insertLog,
  insertTaskRun,
  updateTaskRun,
  upsertRouteHealth,
  insertSyncRun,
  updateSyncRun,
} from "../db/store";

const PORT = Number(process.env.HHI_DEV_CONTEXT_PORT) || 3999;

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): URLSearchParams {
  const i = url.indexOf("?");
  return new URLSearchParams(i >= 0 ? url.slice(i) : "");
}

function isLocalRequest(req: http.IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === "127.0.0.1" || addr === "::1" || !addr; // be permissive when remoteAddress is unavailable
}

async function readJsonBody(req: http.IncomingMessage, maxBytes = 128 * 1024): Promise<any | null> {
  return await new Promise((resolve) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  match: RegExpMatchArray | null,
) => void | Promise<void>;

const router: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  {
    method: "GET",
    pattern: /^\/snapshot\/?$/,
    handler(_req, res) {
      const snapshot = getLatestSnapshot();
      sendJson(res, 200, snapshot ?? { snapshot: null });
    },
  },
  {
    method: "GET",
    pattern: /^\/errors\/?$/,
    handler(req, res) {
      const url = req.url ?? "";
      const q = parseQuery(url);
      const limit = Math.min(100, Math.max(1, parseInt(q.get("limit") ?? "20", 10) || 20));
      const list = getErrors(limit);
      sendJson(res, 200, { errors: list });
    },
  },
  {
    method: "GET",
    pattern: /^\/logs\/?$/,
    handler(req, res) {
      const url = req.url ?? "";
      const q = parseQuery(url);
      const source = q.get("source") ?? undefined;
      const limit = Math.min(200, Math.max(1, parseInt(q.get("limit") ?? "50", 10) || 50));
      const list = getLogs({ source, limit });
      sendJson(res, 200, { logs: list });
    },
  },
  {
    method: "GET",
    pattern: /^\/sync\/([^/]+)\/?$/,
    handler(req, res, match) {
      const jobId = match?.[1] ? decodeURIComponent(match[1]) : "";
      if (!jobId) {
        sendJson(res, 400, { error: "Missing jobId" });
        return;
      }
      const run = getSyncRunByJobId(jobId);
      if (!run) {
        sendJson(res, 404, { error: "Sync run not found", jobId });
        return;
      }
      sendJson(res, 200, run);
    },
  },
  {
    method: "GET",
    pattern: /^\/changed-files\/?$/,
    handler(req, res) {
      const url = req.url ?? "";
      const q = parseQuery(url);
      const limit = Math.min(100, Math.max(1, parseInt(q.get("limit") ?? "50", 10) || 50));
      const list = getChangedFiles(limit);
      sendJson(res, 200, { changed_files: list });
    },
  },
  {
    method: "GET",
    pattern: /^\/task-runs\/latest\/?$/,
    handler(req, res) {
      const url = req.url ?? "";
      const q = parseQuery(url);
      const task = q.get("task") ?? q.get("taskName") ?? "";
      if (!task) {
        sendJson(res, 400, { error: "Missing task name; use ?task=build" });
        return;
      }
      const run = getLatestTaskRun(task);
      sendJson(res, 200, run ?? { taskRun: null });
    },
  },
  {
    method: "GET",
    pattern: /^\/task-runs\/?$/,
    handler(req, res) {
      const url = req.url ?? "";
      const q = parseQuery(url);
      const limit = Math.min(100, Math.max(1, parseInt(q.get("limit") ?? "20", 10) || 20));
      const task = q.get("task") ?? q.get("taskName") ?? undefined;
      const list = getTaskRuns({ limit, taskName: task });
      sendJson(res, 200, { task_runs: list });
    },
  },
  {
    method: "GET",
    pattern: /^\/route-health\/(.+)$/,
    handler(req, res, match) {
      const route = match?.[1] ? decodeURIComponent(match[1]) : "";
      if (!route) {
        sendJson(res, 400, { error: "Missing route" });
        return;
      }
      const list = getRouteHealth(route);
      if (list.length === 0) {
        sendJson(res, 404, { error: "Route not found", route });
        return;
      }
      sendJson(res, 200, list[0]);
    },
  },
  {
    method: "GET",
    pattern: /^\/route-health\/?$/,
    handler(_req, res) {
      const list = getRouteHealth();
      sendJson(res, 200, { route_health: list });
    },
  },
  {
    method: "GET",
    pattern: /^\/summary\/?$/,
    handler(_req, res) {
      const summary = getSummary();
      sendJson(res, 200, summary);
    },
  },
  // ---------------------------
  // Local ingestion endpoints
  // ---------------------------
  {
    method: "POST",
    pattern: /^\/ingest\/error\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const id = insertError({
        source: String(body.source ?? ""),
        message: String(body.message ?? ""),
        severity: body.severity,
        route: body.route ?? null,
        file: body.file ?? null,
        job_id: body.jobId ?? null,
        env: body.env ?? null,
        component: body.component ?? null,
        code: body.code ?? null,
        stack: body.stack ?? null,
      });
      sendJson(res, 200, { ok: true, id });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/log\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const id = insertLog({
        source: String(body.source ?? ""),
        level: String(body.level ?? "info"),
        message: String(body.message ?? ""),
        meta: body.meta ?? null,
        severity: body.severity,
        route: body.route ?? null,
        job_id: body.jobId ?? null,
        component: body.component ?? null,
        event_type: body.eventType ?? null,
      });
      sendJson(res, 200, { ok: true, id });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/task-run\/start\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const now = new Date().toISOString();
      const taskRunId = insertTaskRun({
        task_name: String(body.taskName ?? ""),
        status: "running",
        started_at: now,
        route: body.route ?? null,
        job_id: body.jobId ?? null,
      });
      sendJson(res, 200, { ok: true, taskRunId });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/task-run\/finish\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const now = new Date().toISOString();
      const syncStatus: "ok" | "failed" = body.status === "ok" ? "ok" : "failed";
      const taskRunId = Number(body.taskRunId);
      if (!taskRunId) return sendJson(res, 400, { error: "Missing taskRunId" });

      updateTaskRun(taskRunId, {
        status: syncStatus,
        ended_at: now,
        summary: body.summary ?? null,
        output_excerpt: body.outputExcerpt ?? null,
      });
      sendJson(res, 200, { ok: true });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/route-health\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const now = new Date().toISOString();
      const id = upsertRouteHealth({
        route: String(body.route ?? ""),
        status: body.status === "warn" ? "warn" : body.status === "error" ? "error" : "ok",
        last_checked_at: now,
        latest_error_id: body.latestErrorId ?? null,
        latest_log_id: body.latestLogId ?? null,
        response_time_ms: body.responseTimeMs ?? null,
        active_job_id: body.activeJobId ?? null,
        notes: body.notes ?? null,
      });
      sendJson(res, 200, { ok: true, id });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/sync-run\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const now = new Date().toISOString();
      const syncRunId = insertSyncRun({
        job_id: String(body.jobId ?? ""),
        status: body.status,
        started_at: now,
        summary: body.summary ?? null,
        error_message: body.errorMessage ?? null,
      });
      sendJson(res, 200, { ok: true, syncRunId });
    },
  },
  {
    method: "POST",
    pattern: /^\/ingest\/sync-run\/update\/?$/,
    async handler(req, res) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Forbidden" });
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") return sendJson(res, 400, { error: "Invalid JSON" });

      const now = new Date().toISOString();
      const id = Number(body.syncRunId);
      if (!id) return sendJson(res, 400, { error: "Missing syncRunId" });

      updateSyncRun(id, {
        status: body.status,
        finished_at: now,
        summary: body.summary ?? null,
        error_message: body.errorMessage ?? null,
      });
      sendJson(res, 200, { ok: true });
    },
  },
];

function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0] ?? "";
  for (const route of router) {
    if (req.method !== route.method) continue;
    const match = path.match(route.pattern);
    if (match) {
      const result = route.handler(req, res, match);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch(() => sendJson(res, 500, { error: "Internal error" }));
      }
      return;
    }
  }
  notFound(res);
});

export function start(): http.Server {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`hhi-dev-context read-only API: http://127.0.0.1:${PORT}`);
  });
  return server;
}

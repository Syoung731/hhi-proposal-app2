import { isDevContextEnabled } from "./enabled";

import "server-only";

type DevErrorSeverity = "info" | "warn" | "error";
type DevEnv = "local" | "staging" | "production";
type DevLogSeverity = "debug" | "info" | "warn" | "error";
type TaskRunStatus = "running" | "ok" | "failed";
type RouteHealthStatus = "ok" | "warn" | "error";

export type DevSyncStatus = "pending" | "running" | "success" | "failed";

type DevContextBaseUrl = string;

const MAX_STACK_LEN = 4000;
const DEFAULT_BASE_URL: DevContextBaseUrl = "http://127.0.0.1:3999";
const REQUEST_TIMEOUT_MS = 1500;

function truncate(s: string | null | undefined, maxLen: number): string | null {
  if (s == null) return null;
  const str = String(s);
  if (!str) return null;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

function getBaseUrl(): string {
  return process.env.HHI_DEV_CONTEXT_BASE_URL ?? DEFAULT_BASE_URL;
}

async function postToDevContext<T>(path: string, body: unknown): Promise<T | null> {
  if (!isDevContextEnabled()) return null;

  const baseUrl = getBaseUrl();
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as T | null;
    return json ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function logDevError(params: {
  source: string;
  message: string;
  severity: DevErrorSeverity;
  route?: string | null;
  file?: string | null;
  jobId?: string | null;
  env?: DevEnv | null;
  component?: string | null;
  code?: string | null;
  stack?: string | null;
}): Promise<number | null> {
  const payload = {
    source: params.source,
    message: params.message,
    severity: params.severity,
    route: params.route ?? null,
    file: params.file ?? null,
    jobId: params.jobId ?? null,
    env: params.env ?? null,
    component: params.component ?? null,
    code: params.code ?? null,
    stack: truncate(params.stack, MAX_STACK_LEN),
  };

  const res = await postToDevContext<{ ok: true; id: number }>("/ingest/error", payload);
  return res?.id ?? null;
}

export async function logDevLog(params: {
  source: string;
  message: string;
  severity: DevLogSeverity;
  route?: string | null;
  jobId?: string | null;
  component?: string | null;
  eventType?: string | null;
  meta?: string | null;
}): Promise<number | null> {
  const payload = {
    source: params.source,
    level: params.severity, // keep `level` aligned; service still stores both
    message: params.message,
    meta: params.meta ?? null,
    severity: params.severity,
    route: params.route ?? null,
    jobId: params.jobId ?? null,
    component: params.component ?? null,
    eventType: params.eventType ?? null,
  };

  const res = await postToDevContext<{ ok: true; id: number }>("/ingest/log", payload);
  return res?.id ?? null;
}

export async function startDevTaskRun(
  taskName: string,
  meta?: { route?: string | null; jobId?: string | null },
): Promise<number | null> {
  const res = await postToDevContext<{ ok: true; taskRunId: number }>("/ingest/task-run/start", {
    taskName,
    route: meta?.route ?? null,
    jobId: meta?.jobId ?? null,
  });
  return res?.taskRunId ?? null;
}

export async function finishDevTaskRun(
  taskRunId: number,
  status: TaskRunStatus,
  summary?: string | null,
  outputExcerpt?: string | null,
): Promise<void> {
  const normalizedStatus: "ok" | "failed" = status === "running" ? "failed" : status;
  await postToDevContext<{ ok: true }>("/ingest/task-run/finish", {
    taskRunId,
    status: normalizedStatus,
    summary: summary ?? null,
    outputExcerpt: outputExcerpt ?? null,
  });
}

export async function logDevRouteHealth(
  route: string,
  status: RouteHealthStatus,
  meta?: {
    responseTimeMs?: number | null;
    activeJobId?: string | null;
    notes?: string | null;
    latestErrorId?: number | null;
    latestLogId?: number | null;
  },
): Promise<number | null> {
  const res = await postToDevContext<{ ok: true; id: number }>("/ingest/route-health", {
    route,
    status,
    latestErrorId: meta?.latestErrorId ?? null,
    latestLogId: meta?.latestLogId ?? null,
    responseTimeMs: meta?.responseTimeMs ?? null,
    activeJobId: meta?.activeJobId ?? null,
    notes: meta?.notes ?? null,
  });
  return res?.id ?? null;
}

export async function logDevSyncRun(params: {
  jobId?: string | null;
  status: DevSyncStatus;
  summary?: string | null;
  errorMessage?: string | null;
  route?: string | null;
}): Promise<number | null> {
  const prefix = params.route ? `[route=${params.route}] ` : "";
  const summaryOut = params.summary
    ? `${prefix}${params.summary}`
    : prefix.trim()
      ? prefix.trim()
      : null;

  const res = await postToDevContext<{ ok: true; syncRunId: number }>("/ingest/sync-run", {
    // sync_runs.job_id is currently non-null in the local service schema.
    // For batch-oriented runs, allow omitted/null and fallback to a stable local id.
    jobId: params.jobId ?? "batch-run",
    status: params.status,
    summary: summaryOut,
    errorMessage: params.errorMessage ?? null,
  });
  return res?.syncRunId ?? null;
}

export async function updateDevSyncRun(
  syncRunId: number,
  params: {
    status: DevSyncStatus;
    summary?: string | null;
    errorMessage?: string | null;
    route?: string | null;
  },
): Promise<void> {
  const prefix = params.route ? `[route=${params.route}] ` : "";
  const summaryOut = params.summary ? `${prefix}${params.summary}` : null;

  await postToDevContext<{ ok: true }>("/ingest/sync-run/update", {
    syncRunId,
    status: params.status,
    summary: summaryOut,
    errorMessage: params.errorMessage ?? null,
  });
}


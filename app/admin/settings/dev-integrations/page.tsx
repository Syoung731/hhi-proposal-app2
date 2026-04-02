import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/app/lib/auth";
import { logDevError, logDevRouteHealth } from "@/src/lib/dev-context";

export const dynamic = "force-dynamic";

const DEFAULT_DEV_CONTEXT_BASE_URL = "http://127.0.0.1:3999";
const PRICING_ROUTE = "/admin/settings/jobtread-pricing";
const DEV_INTEGRATIONS_ROUTE = "/admin/settings/dev-integrations";

/** Per-request ceiling for dev-context HTTP reads (AbortSignal). */
const DEV_CONTEXT_FETCH_TIMEOUT_MS = 3000;

const EXPOSED_MCP_TOOLS = [
  "get_summary",
  "get_route_health",
  "get_latest_errors",
  "get_latest_sync_run",
  "get_changed_files",
  "get_task_runs",
] as const;

type SectionLabel = "summary" | "pricing route health" | "MCP status check";

type FetchState<T> =
  | { ok: true; data: T; url: string; durationMs: number }
  | {
      ok: false;
      error: string;
      url: string;
      status?: number;
      durationMs: number;
      timedOut: boolean;
    };

function getBaseUrl() {
  return (process.env.HHI_DEV_CONTEXT_BASE_URL ?? DEFAULT_DEV_CONTEXT_BASE_URL).replace(/\/+$/, "");
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  return /aborted|timeout/i.test(error.message);
}

async function getDevContextJson<T>(
  path: string,
  query: Record<string, string | number | undefined> | undefined,
  timeoutMs: number,
): Promise<FetchState<T>> {
  const url = new URL(`${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  const urlString = url.toString();
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlString, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        status: response.status,
        url: urlString,
        durationMs,
        timedOut: false,
      };
    }

    const json = (await response.json()) as T;
    return { ok: true, data: json, url: urlString, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const timedOut = isAbortError(error);
    return {
      ok: false,
      error: timedOut ? `Timed out after ${timeoutMs}ms` : error instanceof Error ? error.message : "Request failed",
      url: urlString,
      durationMs,
      timedOut,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function logSectionFailure(section: SectionLabel, state: FetchState<unknown>): Promise<void> {
  if (state.ok) return;
  await logDevError({
    source: "server",
    severity: "warn",
    route: DEV_INTEGRATIONS_ROUTE,
    component: "dev-integrations-fetch",
    code: state.timedOut ? "DEV_CONTEXT_TIMEOUT" : "DEV_CONTEXT_FETCH_FAILED",
    message: state.timedOut
      ? `dev-context fetch timed out: section=${section} (${state.error})`
      : `dev-context fetch failed: section=${section}: ${state.error}${state.status != null ? ` (HTTP ${state.status})` : ""}`,
  });
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  const classes = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300"
    : "border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

function SectionWarning({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
      {children}
    </p>
  );
}

export default async function DevIntegrationsSettingsPage() {
  await requireAdmin();
  const pageLoadStarted = Date.now();

  const settled = await Promise.allSettled([
    getDevContextJson<Record<string, unknown>>("/summary", undefined, DEV_CONTEXT_FETCH_TIMEOUT_MS),
    getDevContextJson<Record<string, unknown>>(
      `/route-health/${encodeURIComponent(PRICING_ROUTE)}`,
      undefined,
      DEV_CONTEXT_FETCH_TIMEOUT_MS,
    ),
    /** Lightweight read used as MCP-style dev-context probe (same HTTP surface MCP tools use). */
    getDevContextJson<{ changed_files?: unknown[] }>("/changed-files", { limit: 1 }, DEV_CONTEXT_FETCH_TIMEOUT_MS),
  ]);

  const summaryResult: FetchState<Record<string, unknown>> =
    settled[0]?.status === "fulfilled"
      ? settled[0].value
      : {
          ok: false,
          error: settled[0]?.reason instanceof Error ? settled[0].reason.message : "Request failed",
          url: `${getBaseUrl()}/summary`,
          durationMs: 0,
          timedOut: false,
        };

  const pricingRouteResult: FetchState<Record<string, unknown>> =
    settled[1]?.status === "fulfilled"
      ? settled[1].value
      : {
          ok: false,
          error: settled[1]?.reason instanceof Error ? settled[1].reason.message : "Request failed",
          url: `${getBaseUrl()}/route-health/${encodeURIComponent(PRICING_ROUTE)}`,
          durationMs: 0,
          timedOut: false,
        };

  const mcpProbeResult: FetchState<{ changed_files?: unknown[] }> =
    settled[2]?.status === "fulfilled"
      ? settled[2].value
      : {
          ok: false,
          error: settled[2]?.reason instanceof Error ? settled[2].reason.message : "Request failed",
          url: `${getBaseUrl()}/changed-files?limit=1`,
          durationMs: 0,
          timedOut: false,
        };

  const sections: { label: SectionLabel; state: FetchState<unknown> }[] = [
    { label: "summary", state: summaryResult },
    { label: "pricing route health", state: pricingRouteResult },
    { label: "MCP status check", state: mcpProbeResult },
  ];

  for (const { label, state } of sections) {
    if (!state.ok) {
      await logSectionFailure(label, state);
    }
  }

  const failed = sections.filter((s) => !s.state.ok);
  const anyTimedOut = failed.some((s) => !s.state.ok && s.state.timedOut);
  const allFailed = failed.length === sections.length;
  const overallStatus = allFailed ? ("error" as const) : failed.length > 0 ? ("warn" as const) : ("ok" as const);

  const totalMs = Date.now() - pageLoadStarted;
  const routeNotes = [
    `sections: summary=${summaryResult.ok ? "ok" : "fail"}, pricing=${pricingRouteResult.ok ? "ok" : "fail"}, mcpProbe=${mcpProbeResult.ok ? "ok" : "fail"}`,
    failed.length ? `failed: ${failed.map((f) => f.label).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  await logDevRouteHealth(DEV_INTEGRATIONS_ROUTE, overallStatus, {
    responseTimeMs: totalMs,
    notes: routeNotes.slice(0, 500),
  });

  const summary = summaryResult.ok ? summaryResult.data : null;
  const latestSyncRun =
    summary && typeof summary === "object" && "latest_sync_run" in summary
      ? (summary.latest_sync_run as Record<string, unknown> | null)
      : null;
  const pricingRouteHealth = pricingRouteResult.ok ? pricingRouteResult.data : null;

  const timedOutLabels = failed.filter((s) => !s.state.ok && s.state.timedOut).map((s) => s.label);

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Company Setup</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">DEV Integrations</p>
          </div>
          <Link
            href="/admin/settings/dev-integrations"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Refresh
          </Link>
        </div>
        {failed.length > 0 && (
          <SectionWarning>
            {anyTimedOut
              ? `Dev context timed out (${DEV_CONTEXT_FETCH_TIMEOUT_MS}ms) for: ${timedOutLabels.join(", ") || "unknown"}.`
              : `Dev context unavailable for: ${failed.map((f) => f.label).join(", ")}.`}{" "}
            Other sections below may still show data.
          </SectionWarning>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Dev Context
          </p>
          <div className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <p>
              <span className="font-medium">Base URL:</span> <code>{getBaseUrl()}</code>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Reachable:</span>
              <StatusPill ok={summaryResult.ok} label={summaryResult.ok ? "OK" : "Unavailable"} />
              <span className="text-xs text-zinc-500">
                {summaryResult.ok ? `${summaryResult.durationMs}ms` : summaryResult.timedOut ? "timeout" : "error"}
              </span>
            </p>
            {!summaryResult.ok && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {summaryResult.error}
                {summaryResult.status ? ` (status ${summaryResult.status})` : ""}
              </p>
            )}
          </div>
        </article>

        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            MCP Server
          </p>
          <div className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <p>
              <span className="font-medium">Mode:</span> stdio (local process)
            </p>
            <p>
              <span className="font-medium">Run command:</span> <code>npm run dev-context:mcp</code>
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Dev-context probe:</span>
              <StatusPill ok={mcpProbeResult.ok} label={mcpProbeResult.ok ? "OK" : "Unavailable"} />
              <span className="text-xs text-zinc-500">
                {mcpProbeResult.ok ? `${mcpProbeResult.durationMs}ms` : mcpProbeResult.timedOut ? "timeout" : "error"}
              </span>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Uses GET /changed-files?limit=1 (same API MCP tools read).
            </p>
            {!mcpProbeResult.ok && (
              <SectionWarning>
                MCP status check failed: {mcpProbeResult.error}
                {mcpProbeResult.timedOut ? " — MCP tools may be unable to reach dev-context." : ""}
              </SectionWarning>
            )}
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Summary
          </p>
          {!summaryResult.ok && summaryResult.timedOut && (
            <SectionWarning>Summary request timed out; data below may be stale or empty.</SectionWarning>
          )}
          {summary ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {JSON.stringify(summary, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No summary data available.</p>
          )}
        </article>

        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Latest Sync Run
          </p>
          {latestSyncRun ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {JSON.stringify(latestSyncRun, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No sync run data found in summary.</p>
          )}
        </article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pricing Route Health
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Route: <code>{PRICING_ROUTE}</code>
          </p>
          {!pricingRouteResult.ok && pricingRouteResult.timedOut && (
            <SectionWarning>Pricing route health timed out; unable to load JobTread pricing route snapshot.</SectionWarning>
          )}
          {pricingRouteHealth ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {JSON.stringify(pricingRouteHealth, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Route health not found yet.
              {!pricingRouteResult.ok ? ` (${pricingRouteResult.error})` : ""}
            </p>
          )}
        </article>

        <article className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Exposed MCP Tools
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {EXPOSED_MCP_TOOLS.map((toolName) => (
              <li key={toolName}>
                <code>{toolName}</code>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}

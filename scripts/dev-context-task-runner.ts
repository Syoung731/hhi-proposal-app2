import { spawn } from "child_process";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_BASE_URL = "http://127.0.0.1:3999";
const REQUEST_TIMEOUT_MS = 1500;

function isEnabled(): boolean {
  const raw = process.env.HHI_DEV_CONTEXT_ENABLED;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return process.env.NODE_ENV !== "production";
}

function getBaseUrl(): string {
  return process.env.HHI_DEV_CONTEXT_BASE_URL ?? DEFAULT_BASE_URL;
}

async function postToDevContext<T>(path: string, body: unknown): Promise<T | null> {
  if (!isEnabled()) return null;

  const url = `${getBaseUrl().replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

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
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function startDevTaskRun(
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

async function finishDevTaskRun(
  taskRunId: number,
  status: "ok" | "failed",
  summary?: string | null,
  outputExcerpt?: string | null,
): Promise<void> {
  await postToDevContext<{ ok: true }>("/ingest/task-run/finish", {
    taskRunId,
    status,
    summary: summary ?? null,
    outputExcerpt: outputExcerpt ?? null,
  });
}

function getCommandArgs(argv: string[]): { taskName: string; command: string; args: string[] } {
  const taskName = argv[2];
  if (!taskName) throw new Error("Usage: dev-context-task-runner.ts <taskName> -- <command> [args...]");

  const sep = argv.indexOf("--");
  if (sep === -1) throw new Error("Missing `--` separator.");
  const command = argv[sep + 1];
  if (!command) throw new Error("Missing command after `--`.");
  const args = argv.slice(sep + 2);
  return { taskName, command, args };
}

async function main() {
  // Ensure local-first behavior for this script.
  process.env.HHI_DEV_CONTEXT_ENABLED = "true";

  const { taskName, command, args } = getCommandArgs(process.argv);

  const taskRunId = await startDevTaskRun(taskName, { route: null, jobId: null });
  let childExitCode: number | null = null;

  const cap = 2000;
  let stderrTail = "";
  let stdoutTail = "";

  // eslint-disable-next-line no-console
  console.log(`[dev-context] task "${taskName}" started (id=${taskRunId ?? "n/a"})`);

  const childCommand = command === "node" ? process.execPath : command;

  const child = spawn(childCommand, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[dev-context] spawn failed:", {
      command: childCommand,
      args,
      err,
    });
  });

  const exitCode: number = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  childExitCode = exitCode;

  const status = exitCode === 0 ? ("ok" as const) : ("failed" as const);
  const summary = exitCode === 0 ? `${taskName} finished successfully` : `${taskName} failed (exit=${exitCode})`;
  const excerpt = stderrTail || stdoutTail || null;

  if (taskRunId != null) {
    await finishDevTaskRun(taskRunId, status, summary, excerpt);
  }

  // small grace so writes are flushed
  await sleep(100);
  process.exit(exitCode);
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error("[dev-context] task runner crashed:", e);
  try {
    // best-effort: no taskRunId available here, so nothing to finish
    process.exit(1);
  } catch {
    process.exit(1);
  }
});


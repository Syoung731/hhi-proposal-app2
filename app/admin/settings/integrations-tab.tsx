"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  saveIntegrationsAction,
  getJobTreadIntegrationAction,
  saveJobTreadIntegrationAction,
  testJobTreadConnectionAction,
  getSyncedBudgetInspectorAction,
  parseAndSyncBudgetTextAction,
  parseAndSyncBudgetJsonAction,
  getAnthropicIntegrationAction,
  saveAnthropicApiKeyAction,
  testAnthropicConnectionAction,
} from "./actions";
import type { CompanySettingsForUI } from "./settings-tabs";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const inputClass =
  "w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

const TEST_JOB_ID_STORAGE_KEY = "admin.integrations.jobtread.testJobId";
const BUDGET_TEXT_DRAFT_STORAGE_KEY = "admin.integrations.jobtread.budgetTextDraft";
const BUDGET_JSON_DRAFT_STORAGE_KEY = "admin.integrations.jobtread.budgetJsonDraft";
const DEFAULT_TEST_JOB_ID = "22PJXd2cjdhN";

const isDev = process.env.NODE_ENV === "development";

type JobTreadState = Awaited<ReturnType<typeof getJobTreadIntegrationAction>>;

type SyncResult = {
  jobId: string;
  rowCount: number;
  officialSell: string;
  officialCost: string;
  status: string;
};

function getConnectionBadgeState(jobTread: JobTreadState | null): "connected" | "error" | "not_connected" {
  if (!jobTread) return "not_connected";
  const status = (jobTread.lastStatus ?? "").toLowerCase();
  if (status === "success") return "connected";
  if (status === "error") return "error";
  return "not_connected";
}

type Props = { settings: CompanySettingsForUI };

export function IntegrationsTab({ settings }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [jobTread, setJobTread] = useState<JobTreadState | null>(null);
  const [jobTreadLoading, setJobTreadLoading] = useState(true);
  const [jobTreadSaveStatus, setJobTreadSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [jobTreadSaveError, setJobTreadSaveError] = useState<string | null>(null);
  const [jobTreadTestStatus, setJobTreadTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [jobTreadTestError, setJobTreadTestError] = useState<string | null>(null);

  const [testJobId, setTestJobId] = useState(DEFAULT_TEST_JOB_ID);
  const [syncStatus, setSyncStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [inspectorData, setInspectorData] = useState<Awaited<ReturnType<typeof getSyncedBudgetInspectorAction>> | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);

  const [budgetTextDraft, setBudgetTextDraft] = useState("");
  const [pasteSyncStatus, setPasteSyncStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [pasteSyncResult, setPasteSyncResult] = useState<{
    jobId: string;
    rowCount: number;
    officialSell: string;
    officialCost: string;
    status: string;
  } | null>(null);
  const [pasteSyncError, setPasteSyncError] = useState<string | null>(null);

  const [budgetJsonDraft, setBudgetJsonDraft] = useState("");
  const [pasteJsonSyncStatus, setPasteJsonSyncStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [pasteJsonSyncResult, setPasteJsonSyncResult] = useState<{
    jobId: string;
    rowCount: number;
    officialSell: string;
    officialCost: string;
    status: string;
  } | null>(null);
  const [pasteJsonSyncError, setPasteJsonSyncError] = useState<string | null>(null);

  const refreshJobTread = useCallback(async () => {
    const data = await getJobTreadIntegrationAction();
    setJobTread(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJobTreadIntegrationAction().then((data) => {
      if (!cancelled) {
        setJobTread(data);
        setJobTreadLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(TEST_JOB_ID_STORAGE_KEY);
      if (stored && stored.trim()) {
        setTestJobId(stored.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(BUDGET_TEXT_DRAFT_STORAGE_KEY);
      if (stored != null) {
        setBudgetTextDraft(stored);
      }
    } catch {
      // ignore
    }
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(BUDGET_JSON_DRAFT_STORAGE_KEY);
      if (stored != null) {
        setBudgetJsonDraft(stored);
      }
    } catch {
      // ignore
    }
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    try {
      localStorage.setItem(BUDGET_TEXT_DRAFT_STORAGE_KEY, budgetTextDraft);
    } catch {
      // ignore
    }
  }, [isDev, budgetTextDraft]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;
    try {
      localStorage.setItem(BUDGET_JSON_DRAFT_STORAGE_KEY, budgetJsonDraft);
    } catch {
      // ignore
    }
  }, [isDev, budgetJsonDraft]);

  const integrationsJsonString =
    settings.integrationsJson != null
      ? JSON.stringify(settings.integrationsJson, null, 2)
      : "{}";

  async function handleIntegrationsSubmit(formData: FormData) {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveIntegrationsAction(formData);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  async function handleJobTreadSubmit(formData: FormData) {
    setJobTreadSaveStatus("saving");
    setJobTreadSaveError(null);
    const result = await saveJobTreadIntegrationAction(formData);
    if (result.error) {
      setJobTreadSaveStatus("error");
      setJobTreadSaveError(result.error);
      return;
    }
    setJobTreadSaveStatus("saved");
    await refreshJobTread();
    router.refresh();
    setTimeout(() => setJobTreadSaveStatus("idle"), 3000);
  }

  async function handleTestConnection() {
    setJobTreadTestStatus("testing");
    setJobTreadTestError(null);
    const result = await testJobTreadConnectionAction();
    if (result.ok) {
      setJobTreadTestStatus("ok");
      await refreshJobTread();
      router.refresh();
    } else {
      setJobTreadTestStatus("error");
      setJobTreadTestError(result.error ?? "Connection failed");
    }
    setTimeout(() => setJobTreadTestStatus("idle"), 4000);
  }

  async function handleRunSync() {
    const jobId = testJobId.trim();
    if (!jobId) {
      setSyncError("Enter a job ID");
      return;
    }
    setSyncStatus("running");
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/jobtread/sync-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncStatus("error");
        setSyncError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.ok && data.jobId) {
        setSyncStatus("ok");
        setSyncResult({
          jobId: data.jobId,
          rowCount: data.rowCount ?? 0,
          officialSell: data.officialSell ?? "—",
          officialCost: data.officialCost ?? "—",
          status: data.status ?? "—",
        });
        try {
          localStorage.setItem(TEST_JOB_ID_STORAGE_KEY, jobId);
        } catch {
          // ignore
        }
        await refreshJobTread();
        loadInspector(jobId);
        router.refresh();
      } else {
        setSyncStatus("error");
        setSyncError(data?.error ?? "Unexpected response");
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncError(e instanceof Error ? e.message : "Request failed");
    }
  }

  async function loadInspector(overrideJobId?: string) {
    const jobId = (overrideJobId ?? testJobId).trim();
    if (!jobId) return;
    setInspectorLoading(true);
    setInspectorData(null);
    try {
      const result = await getSyncedBudgetInspectorAction(jobId);
      setInspectorData(result);
    } finally {
      setInspectorLoading(false);
    }
  }

  async function handlePasteSync() {
    if (!budgetTextDraft.trim()) return;
    setPasteSyncStatus("running");
    setPasteSyncError(null);
    setPasteSyncResult(null);
    const formData = new FormData();
    formData.set("budgetText", budgetTextDraft);
    const result = await parseAndSyncBudgetTextAction(formData);
    if (result.ok) {
      setPasteSyncStatus("ok");
      setPasteSyncResult({
        jobId: result.jobId,
        rowCount: result.rowCount,
        officialSell: result.officialSell,
        officialCost: result.officialCost,
        status: result.status,
      });
      setTestJobId(result.jobId);
      try {
        localStorage.setItem(TEST_JOB_ID_STORAGE_KEY, result.jobId);
      } catch {
        // ignore
      }
      loadInspector(result.jobId);
      router.refresh();
    } else {
      setPasteSyncStatus("error");
      setPasteSyncError(result.error);
    }
  }

  async function handlePasteJsonSync() {
    if (!budgetJsonDraft.trim()) return;
    setPasteJsonSyncStatus("running");
    setPasteJsonSyncError(null);
    setPasteJsonSyncResult(null);
    const formData = new FormData();
    formData.set("budgetJson", budgetJsonDraft);
    const result = await parseAndSyncBudgetJsonAction(formData);
    if (result.ok) {
      setPasteJsonSyncStatus("ok");
      setPasteJsonSyncResult({
        jobId: result.jobId,
        rowCount: result.rowCount,
        officialSell: result.officialSell,
        officialCost: result.officialCost,
        status: result.status,
      });
      setTestJobId(result.jobId);
      try {
        localStorage.setItem(TEST_JOB_ID_STORAGE_KEY, result.jobId);
      } catch {
        // ignore
      }
      loadInspector(result.jobId);
      router.refresh();
    } else {
      setPasteJsonSyncStatus("error");
      setPasteJsonSyncError(result.error);
    }
  }

  // --- Anthropic state ---
  type AnthropicState = Awaited<ReturnType<typeof getAnthropicIntegrationAction>>;
  const [anthropic, setAnthropic] = useState<AnthropicState | null>(null);
  const [anthropicLoading, setAnthropicLoading] = useState(true);
  const [anthropicSaveStatus, setAnthropicSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [anthropicSaveError, setAnthropicSaveError] = useState<string | null>(null);
  const [anthropicTestStatus, setAnthropicTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [anthropicTestResult, setAnthropicTestResult] = useState<string | null>(null);
  const [anthropicTestError, setAnthropicTestError] = useState<string | null>(null);

  const refreshAnthropic = useCallback(async () => {
    const data = await getAnthropicIntegrationAction();
    setAnthropic(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAnthropicIntegrationAction().then((data) => {
      if (!cancelled) {
        setAnthropic(data);
        setAnthropicLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleAnthropicSave(formData: FormData) {
    setAnthropicSaveStatus("saving");
    setAnthropicSaveError(null);
    const result = await saveAnthropicApiKeyAction(formData);
    if (result.error) {
      setAnthropicSaveStatus("error");
      setAnthropicSaveError(result.error);
      return;
    }
    setAnthropicSaveStatus("saved");
    await refreshAnthropic();
    router.refresh();
    setTimeout(() => setAnthropicSaveStatus("idle"), 3000);
  }

  async function handleAnthropicTest() {
    setAnthropicTestStatus("testing");
    setAnthropicTestError(null);
    setAnthropicTestResult(null);
    const result = await testAnthropicConnectionAction();
    if (result.ok) {
      setAnthropicTestStatus("ok");
      setAnthropicTestResult(`Connected — model: ${result.model}`);
      await refreshAnthropic();
      router.refresh();
    } else {
      setAnthropicTestStatus("error");
      setAnthropicTestError(result.error ?? "Connection failed");
    }
    setTimeout(() => setAnthropicTestStatus("idle"), 5000);
  }

  const anthropicBadge: "connected" | "error" | "not_connected" =
    anthropicTestStatus === "ok"
      ? "connected"
      : anthropicTestStatus === "error"
        ? "error"
        : anthropic?.lastStatus === "success"
          ? "connected"
          : anthropic?.lastStatus === "error"
            ? "error"
            : anthropic?.hasApiKey
              ? "connected"
              : "not_connected";

  const badgeState = getConnectionBadgeState(jobTread);

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Integrations
      </h2>

      {/* JobTread integration */}
      <section className="space-y-4">
        {/* A. Header + Status badge */}
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            JobTread
          </h3>
          <span
            className={
              badgeState === "connected"
                ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
                : badgeState === "error"
                  ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
                  : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }
          >
            {badgeState === "connected"
              ? "Connected"
              : badgeState === "error"
                ? "Error"
                : "Not Connected"}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect to JobTread for pricing and budget sync. Enter your Grant Key from the JobTread API settings.
        </p>

        {jobTreadLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
            {/* B. Existing settings form */}
            <form
              action={handleJobTreadSubmit}
              className="flex flex-col gap-4"
            >
              <div>
                <label htmlFor="jobtreadName" className={labelClass}>
                  Integration name
                </label>
                <input
                  id="jobtreadName"
                  name="jobtreadName"
                  type="text"
                  defaultValue={jobTread?.name ?? "JobTread"}
                  placeholder="JobTread"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="jobtreadBaseUrl" className={labelClass}>
                  API base URL
                </label>
                <input
                  id="jobtreadBaseUrl"
                  name="jobtreadBaseUrl"
                  type="url"
                  defaultValue={jobTread?.apiBaseUrl ?? "https://api.jobtread.com/pave"}
                  placeholder="https://api.jobtread.com/pave"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="jobtreadGrantKey" className={labelClass}>
                  Grant key
                </label>
                <input
                  id="jobtreadGrantKey"
                  name="jobtreadGrantKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    jobTread?.hasGrantKey
                      ? "Leave blank to keep existing key"
                      : "Enter your JobTread grant key"
                  }
                  className={inputClass}
                />
                {jobTread?.hasGrantKey && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    A grant key is already set. Enter a new value only to replace it.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={jobTreadSaveStatus === "saving"}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {jobTreadSaveStatus === "saving" ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={jobTreadTestStatus === "testing" || !jobTread?.hasGrantKey}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {jobTreadTestStatus === "testing"
                    ? "Testing…"
                    : jobTreadTestStatus === "ok"
                      ? "Connection OK"
                      : "Test connection"}
                </button>
                {jobTreadSaveStatus === "saved" && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Saved successfully.
                  </span>
                )}
                {jobTreadSaveStatus === "error" && jobTreadSaveError && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {jobTreadSaveError}
                  </span>
                )}
                {jobTreadTestStatus === "error" && jobTreadTestError && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Test failed: {jobTreadTestError}
                  </span>
                )}
              </div>
            </form>

            {/* C. Metadata / debug block */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900/50">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Integration metadata
              </h4>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Provider</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">jobtread</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Base URL</dt>
                  <dd className="break-all font-mono text-zinc-900 dark:text-zinc-100">
                    {jobTread?.apiBaseUrl || "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Secret stored</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {jobTread?.hasGrantKey ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Last status</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {jobTread?.lastStatus ?? "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Last tested</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {jobTread?.lastTestedAt
                      ? new Date(jobTread.lastTestedAt).toLocaleString()
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Last message</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {jobTread?.lastMessage?.trim() || "None"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* D. Test Job Sync */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900/50">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Test job sync
              </h4>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Sync one JobTread job budget into the app. Enter a job ID and run sync.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <label htmlFor="testJobId" className={labelClass}>
                    Test job ID
                  </label>
                  <input
                    id="testJobId"
                    type="text"
                    value={testJobId}
                    onChange={(e) => setTestJobId(e.target.value)}
                    placeholder={DEFAULT_TEST_JOB_ID}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRunSync}
                  disabled={syncStatus === "running" || !jobTread?.hasGrantKey}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {syncStatus === "running" ? "Syncing…" : "Run sync"}
                </button>
              </div>
              {syncStatus === "ok" && syncResult && (
                <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-900/20">
                  <p className="font-medium text-green-800 dark:text-green-200">Sync completed</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-green-700 dark:text-green-300 sm:grid-cols-4">
                    <span>jobId: {syncResult.jobId}</span>
                    <span>Rows: {syncResult.rowCount}</span>
                    <span>Sell: {syncResult.officialSell}</span>
                    <span>Cost: {syncResult.officialCost}</span>
                  </dl>
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">Status: {syncResult.status}</p>
                </div>
              )}
              {syncStatus === "error" && syncError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {syncError}
                </p>
              )}
            </div>

            {/* E. Synced budget inspector */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900/50">
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Synced budget inspector
              </h4>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Inspect synced budget data for the test job above. Uses the same job ID as the sync field.
              </p>
              <button
                type="button"
                onClick={() => loadInspector(testJobId)}
                disabled={inspectorLoading || !testJobId.trim()}
                className="mb-4 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {inspectorLoading ? "Loading…" : "Load synced budget"}
              </button>

              {inspectorLoading && (
                <p className="text-sm text-zinc-500">Loading…</p>
              )}

              {!inspectorLoading && inspectorData && !inspectorData.summary && (
                <div className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                  No synced data for this job yet. Run a sync above, then load again to inspect the results.
                </div>
              )}

              {!inspectorLoading && inspectorData?.summary && (
                <>
                  <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-600 dark:bg-zinc-800/30">
                    <h5 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Sync summary
                    </h5>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Job name</dt>
                        <dd className="font-medium text-zinc-900 dark:text-zinc-100">{inspectorData.summary.jobName}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Job ID</dt>
                        <dd className="font-mono text-zinc-900 dark:text-zinc-100">{inspectorData.summary.jobId}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Job number</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.jobNumber ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Last synced</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">
                          {inspectorData.summary.lastSyncedAt
                            ? new Date(inspectorData.summary.lastSyncedAt).toLocaleString()
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.lastSyncStatus ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Message</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.lastSyncMessage ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Row count</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.lastRowCount}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Official sell</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.officialSellTotal}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Official cost</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.officialCostTotal}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Source summary sell</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.sourceSummarySell ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 dark:text-zinc-400">Source summary cost</dt>
                        <dd className="text-zinc-900 dark:text-zinc-100">{inspectorData.summary.sourceSummaryCost ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="overflow-x-auto">
                    <h5 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      First 25 rows
                    </h5>
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-600">
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Group</th>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Item</th>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Cost code</th>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Cost type</th>
                          <th className="px-2 py-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Qty</th>
                          <th className="px-2 py-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Unit cost</th>
                          <th className="px-2 py-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Unit price</th>
                          <th className="px-2 py-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Ext cost</th>
                          <th className="px-2 py-1.5 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Ext sell</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectorData.rows.map((row) => (
                          <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-700">
                            <td className="px-2 py-1.5 text-zinc-900 dark:text-zinc-100">{row.groupName ?? "—"}</td>
                            <td className="px-2 py-1.5 text-zinc-900 dark:text-zinc-100">{row.itemName}</td>
                            <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{row.costCode ?? "—"}</td>
                            <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{row.costType ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.quantity ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.unitCost ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{row.unitPrice ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{row.extCost}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{row.extSell}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {inspectorData.summary.lastRowCount > 25 && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Showing first 25 of {inspectorData.summary.lastRowCount} rows.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* F. Dev-only: Paste budget export text */}
            {isDev && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Paste JobTread budget export (Dev Only)
                </h4>
                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Paste the DataX-style budget export text here, then click Parse &amp; Sync to run through the canonical sync. For development and testing only.
                </p>
                <textarea
                  value={budgetTextDraft}
                  onChange={(e) => setBudgetTextDraft(e.target.value)}
                  placeholder="Paste DataX-style export (Job: ... Summary: ... group headings and - item lines)"
                  rows={8}
                  className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePasteSync}
                    disabled={pasteSyncStatus === "running" || !budgetTextDraft.trim()}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {pasteSyncStatus === "running" ? "Parsing & syncing…" : "Parse & sync budget text"}
                  </button>
                  {pasteSyncStatus === "ok" && pasteSyncResult && (
                    <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/20">
                      <span className="font-medium text-green-800 dark:text-green-200">Synced:</span>{" "}
                      {pasteSyncResult.jobId} · {pasteSyncResult.rowCount} rows · Sell {pasteSyncResult.officialSell} · Cost {pasteSyncResult.officialCost}
                    </div>
                  )}
                  {pasteSyncStatus === "error" && pasteSyncError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {pasteSyncError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* G. Dev-only: Paste budget JSON */}
            {isDev && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Paste JobTread budget JSON (Dev Only)
                </h4>
                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Paste budget-shaped JSON (jobId, jobName, groups, items) here, then click Parse &amp; Sync to run through the same canonical sync as text import.
                </p>
                <textarea
                  value={budgetJsonDraft}
                  onChange={(e) => setBudgetJsonDraft(e.target.value)}
                  placeholder='{"jobId":"...","jobName":"...","groups":[],"items":[{...}]}'
                  rows={8}
                  className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePasteJsonSync}
                    disabled={pasteJsonSyncStatus === "running" || !budgetJsonDraft.trim()}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {pasteJsonSyncStatus === "running" ? "Parsing & syncing…" : "Parse & sync budget JSON"}
                  </button>
                  {pasteJsonSyncStatus === "ok" && pasteJsonSyncResult && (
                    <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/20">
                      <span className="font-medium text-green-800 dark:text-green-200">Synced:</span>{" "}
                      {pasteJsonSyncResult.jobId} · {pasteJsonSyncResult.rowCount} rows · Sell {pasteJsonSyncResult.officialSell} · Cost {pasteJsonSyncResult.officialCost}
                    </div>
                  )}
                  {pasteJsonSyncStatus === "error" && pasteJsonSyncError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {pasteJsonSyncError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Anthropic (Claude AI) integration */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            Anthropic (Claude AI)
          </h3>
          <span
            className={
              anthropicBadge === "connected"
                ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
                : anthropicBadge === "error"
                  ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
                  : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }
          >
            {anthropicBadge === "connected"
              ? "Connected"
              : anthropicBadge === "error"
                ? "Error"
                : "Not Connected"}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Powers the AI Estimate Engine. Paste your API key below — it is stored encrypted in the database.
        </p>

        {anthropicLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
            {/* API key form */}
            <form action={handleAnthropicSave} className="flex flex-col gap-4">
              <div>
                <label htmlFor="anthropicApiKey" className={labelClass}>
                  API key
                </label>
                <input
                  id="anthropicApiKey"
                  name="anthropicApiKey"
                  type="password"
                  placeholder={anthropic?.hasApiKey ? "••••••••  (saved — paste new key to replace)" : "sk-ant-api03-..."}
                  className={inputClass}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Get a key from{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    console.anthropic.com
                  </a>
                  . Leave blank to keep the existing key.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={anthropicSaveStatus === "saving"}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {anthropicSaveStatus === "saving" ? "Saving…" : "Save Key"}
                </button>
                {anthropicSaveStatus === "saved" && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Saved successfully.
                  </span>
                )}
                {anthropicSaveStatus === "error" && anthropicSaveError && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {anthropicSaveError}
                  </span>
                )}
              </div>
            </form>

            {/* Test connection */}
            <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <button
                type="button"
                onClick={handleAnthropicTest}
                disabled={anthropicTestStatus === "testing" || !anthropic?.hasApiKey}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {anthropicTestStatus === "testing" ? "Testing…" : "Test Connection"}
              </button>
              {anthropicTestStatus === "ok" && anthropicTestResult && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  {anthropicTestResult}
                </span>
              )}
              {anthropicTestStatus === "error" && anthropicTestError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  {anthropicTestError}
                </span>
              )}
              {anthropicTestStatus === "idle" && anthropic?.lastStatus === "success" && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last tested: {anthropic.lastTestedAt ? new Date(anthropic.lastTestedAt).toLocaleString() : "—"}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Generic integrations JSON (existing) */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
          Other integrations (JSON)
        </h3>
        <form action={handleIntegrationsSubmit} className="space-y-4">
          <div>
            <label htmlFor="integrationsJson" className={labelClass}>
              Integrations config (JSON)
            </label>
            <textarea
              id="integrationsJson"
              name="integrationsJson"
              rows={12}
              defaultValue={integrationsJsonString}
              className="w-full max-w-2xl rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={status === "saving"}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && (
              <span className="text-sm text-green-600 dark:text-green-400">
                Saved successfully.
              </span>
            )}
            {status === "error" && errorMessage && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {errorMessage}
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

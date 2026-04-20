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
  saveAnthropicModelAction,
  getGeminiIntegrationAction,
  saveGeminiApiKeyAction,
  testGeminiConnectionAction,
  saveGeminiModelsAction,
  getGooglePlacesIntegrationAction,
  saveGooglePlacesApiKeyAction,
  testGooglePlacesConnectionAction,
  getGoogleReviewsIntegrationAction,
  saveGoogleReviewsCredentialsAction,
  testGoogleReviewsConnectionAction,
} from "./actions";
import { GoogleWorkspaceForm } from "./integrations/google-workspace/GoogleWorkspaceForm";
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

  // Model selector state
  type ModelOption = { id: string; displayName: string; maxTokens: number; maxInputTokens: number; description: string; tier: string };
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(settings.anthropicModel || "claude-sonnet-4-6");
  const [modelSaveStatus, setModelSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/anthropic-models");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setModelOptions(data.models ?? []);
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  async function handleModelSave() {
    setModelSaveStatus("saving");
    setModelSaveError(null);
    const result = await saveAnthropicModelAction(selectedModel);
    if (result.error) {
      setModelSaveStatus("error");
      setModelSaveError(result.error);
    } else {
      setModelSaveStatus("saved");
      setTimeout(() => setModelSaveStatus("idle"), 3000);
    }
  }

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
        if (data?.hasApiKey) fetchModels();
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

  // --- Google Gemini state ---
  type GeminiState = Awaited<ReturnType<typeof getGeminiIntegrationAction>>;
  const [gemini, setGemini] = useState<GeminiState | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(true);
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [geminiSaveError, setGeminiSaveError] = useState<string | null>(null);
  const [geminiTestStatus, setGeminiTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [geminiTestResult, setGeminiTestResult] = useState<string | null>(null);
  const [geminiTestError, setGeminiTestError] = useState<string | null>(null);

  type GeminiModelOption = { id: string; displayName: string; description: string; category: string; inputTokenLimit: number; outputTokenLimit: number };
  const [geminiModelOptions, setGeminiModelOptions] = useState<GeminiModelOption[]>([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false);
  const [geminiModelsError, setGeminiModelsError] = useState<string | null>(null);
  const [selectedGeminiImageModel, setSelectedGeminiImageModel] = useState<string>(settings.geminiImageModel || "gemini-2.5-flash-image");
  const [selectedGeminiImageGenModel, setSelectedGeminiImageGenModel] = useState<string>(settings.geminiImageGenModel || "imagen-4.0-fast-generate-001");
  const [geminiModelSaveStatus, setGeminiModelSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [geminiModelSaveError, setGeminiModelSaveError] = useState<string | null>(null);

  const fetchGeminiModels = useCallback(async () => {
    setGeminiModelsLoading(true);
    setGeminiModelsError(null);
    try {
      const res = await fetch("/api/settings/gemini-models");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeminiModelOptions(data.models ?? []);
    } catch (err) {
      setGeminiModelsError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setGeminiModelsLoading(false);
    }
  }, []);

  const refreshGemini = useCallback(async () => {
    const data = await getGeminiIntegrationAction();
    setGemini(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getGeminiIntegrationAction().then((data) => {
      if (!cancelled) {
        setGemini(data);
        setGeminiLoading(false);
        if (data?.hasApiKey) fetchGeminiModels();
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGeminiSave(formData: FormData) {
    setGeminiSaveStatus("saving");
    setGeminiSaveError(null);
    const result = await saveGeminiApiKeyAction(formData);
    if (result.error) {
      setGeminiSaveStatus("error");
      setGeminiSaveError(result.error);
    } else {
      setGeminiSaveStatus("saved");
      await refreshGemini();
      fetchGeminiModels();
      setTimeout(() => setGeminiSaveStatus("idle"), 3000);
    }
  }

  async function handleGeminiTest() {
    setGeminiTestStatus("testing");
    setGeminiTestResult(null);
    setGeminiTestError(null);
    const result = await testGeminiConnectionAction();
    if (result.ok) {
      setGeminiTestStatus("ok");
      setGeminiTestResult(result.model ?? "Connected");
      await refreshGemini();
    } else {
      setGeminiTestStatus("error");
      setGeminiTestError(result.error ?? "Connection failed");
    }
  }

  async function handleGeminiModelSave() {
    setGeminiModelSaveStatus("saving");
    setGeminiModelSaveError(null);
    const result = await saveGeminiModelsAction(selectedGeminiImageModel, selectedGeminiImageGenModel);
    if (result.error) {
      setGeminiModelSaveStatus("error");
      setGeminiModelSaveError(result.error);
    } else {
      setGeminiModelSaveStatus("saved");
      setTimeout(() => setGeminiModelSaveStatus("idle"), 3000);
    }
  }

  const geminiBadge =
    geminiTestStatus === "ok"
      ? "connected"
      : geminiTestStatus === "error"
        ? "error"
        : gemini?.lastStatus === "success"
          ? "connected"
          : gemini?.lastStatus === "error"
            ? "error"
            : gemini?.hasApiKey
              ? "connected"
              : "not_connected";

  // --- Google Places state ---
  type GooglePlacesState = Awaited<ReturnType<typeof getGooglePlacesIntegrationAction>>;
  const [googlePlaces, setGooglePlaces] = useState<GooglePlacesState | null>(null);
  const [googlePlacesLoading, setGooglePlacesLoading] = useState(true);
  const [googlePlacesSaveStatus, setGooglePlacesSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [googlePlacesSaveError, setGooglePlacesSaveError] = useState<string | null>(null);
  const [googlePlacesTestStatus, setGooglePlacesTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [googlePlacesTestResult, setGooglePlacesTestResult] = useState<string | null>(null);
  const [googlePlacesTestError, setGooglePlacesTestError] = useState<string | null>(null);

  const refreshGooglePlaces = useCallback(async () => {
    const data = await getGooglePlacesIntegrationAction();
    setGooglePlaces(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getGooglePlacesIntegrationAction().then((data) => {
      if (!cancelled) {
        setGooglePlaces(data);
        setGooglePlacesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleGooglePlacesSave(formData: FormData) {
    setGooglePlacesSaveStatus("saving");
    setGooglePlacesSaveError(null);
    const result = await saveGooglePlacesApiKeyAction(formData);
    if (result.error) {
      setGooglePlacesSaveStatus("error");
      setGooglePlacesSaveError(result.error);
      return;
    }
    setGooglePlacesSaveStatus("saved");
    await refreshGooglePlaces();
    router.refresh();
    setTimeout(() => setGooglePlacesSaveStatus("idle"), 3000);
  }

  async function handleGooglePlacesTest() {
    setGooglePlacesTestStatus("testing");
    setGooglePlacesTestError(null);
    setGooglePlacesTestResult(null);
    const result = await testGooglePlacesConnectionAction();
    if (result.ok) {
      setGooglePlacesTestStatus("ok");
      setGooglePlacesTestResult("Connected — Places API responding");
      await refreshGooglePlaces();
      router.refresh();
    } else {
      setGooglePlacesTestStatus("error");
      setGooglePlacesTestError(result.error ?? "Connection failed");
    }
    setTimeout(() => setGooglePlacesTestStatus("idle"), 5000);
  }

  const googlePlacesBadge: "connected" | "error" | "not_connected" =
    googlePlacesTestStatus === "ok"
      ? "connected"
      : googlePlacesTestStatus === "error"
        ? "error"
        : googlePlaces?.lastStatus === "success"
          ? "connected"
          : googlePlaces?.lastStatus === "error"
            ? "error"
            : googlePlaces?.hasApiKey
              ? "connected"
              : "not_connected";

  // --- Google Reviews state ---
  type GoogleReviewsState = Awaited<ReturnType<typeof getGoogleReviewsIntegrationAction>>;
  const [googleReviews, setGoogleReviews] = useState<GoogleReviewsState | null>(null);
  const [googleReviewsLoading, setGoogleReviewsLoading] = useState(true);
  const [googleReviewsSaveStatus, setGoogleReviewsSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [googleReviewsSaveError, setGoogleReviewsSaveError] = useState<string | null>(null);
  const [googleReviewsTestStatus, setGoogleReviewsTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [googleReviewsTestResult, setGoogleReviewsTestResult] = useState<string | null>(null);
  const [googleReviewsTestError, setGoogleReviewsTestError] = useState<string | null>(null);

  const refreshGoogleReviews = useCallback(async () => {
    const data = await getGoogleReviewsIntegrationAction();
    setGoogleReviews(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getGoogleReviewsIntegrationAction().then((data) => {
      if (!cancelled) {
        setGoogleReviews(data);
        setGoogleReviewsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleGoogleReviewsSave(formData: FormData) {
    setGoogleReviewsSaveStatus("saving");
    setGoogleReviewsSaveError(null);
    const result = await saveGoogleReviewsCredentialsAction(formData);
    if (result.error) {
      setGoogleReviewsSaveStatus("error");
      setGoogleReviewsSaveError(result.error);
      return;
    }
    setGoogleReviewsSaveStatus("saved");
    await refreshGoogleReviews();
    router.refresh();
    setTimeout(() => setGoogleReviewsSaveStatus("idle"), 3000);
  }

  async function handleGoogleReviewsTest() {
    setGoogleReviewsTestStatus("testing");
    setGoogleReviewsTestError(null);
    setGoogleReviewsTestResult(null);
    const result = await testGoogleReviewsConnectionAction();
    if (result.ok) {
      setGoogleReviewsTestStatus("ok");
      setGoogleReviewsTestResult("Connected");
      await refreshGoogleReviews();
      router.refresh();
    } else {
      setGoogleReviewsTestStatus("error");
      setGoogleReviewsTestError(result.error ?? "Connection failed");
    }
    setTimeout(() => setGoogleReviewsTestStatus("idle"), 5000);
  }

  const googleReviewsBadge: "connected" | "error" | "not_connected" =
    googleReviewsTestStatus === "ok"
      ? "connected"
      : googleReviewsTestStatus === "error"
        ? "error"
        : googleReviews?.lastStatus === "success"
          ? "connected"
          : googleReviews?.lastStatus === "error"
            ? "error"
            : googleReviews?.hasApiKey && googleReviews?.placeId
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

            {/* AI Model selector */}
            {anthropic?.hasApiKey && (
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="anthropicModel" className={labelClass}>
                    AI Model
                  </label>
                  <button
                    type="button"
                    onClick={fetchModels}
                    disabled={modelsLoading}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
                  >
                    {modelsLoading ? "Loading…" : "Refresh models"}
                  </button>
                </div>

                {modelsError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{modelsError}</p>
                )}

                <select
                  id="anthropicModel"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={inputClass}
                  disabled={modelsLoading}
                >
                  {modelOptions.length === 0 && (
                    <option value={selectedModel}>{selectedModel}</option>
                  )}
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} — {m.maxInputTokens >= 1000000 ? "1M" : `${Math.round(m.maxInputTokens / 1000)}K`} context, {Math.round(m.maxTokens / 1000)}K output
                    </option>
                  ))}
                </select>

                {(() => {
                  const sel = modelOptions.find((m) => m.id === selectedModel);
                  if (!sel) return null;
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium mr-2 ${
                        sel.tier === "flagship" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                        : sel.tier === "fast" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      }`}>
                        {sel.tier === "flagship" ? "Flagship" : sel.tier === "fast" ? "Fast" : "Balanced"}
                      </span>
                      {sel.description}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleModelSave}
                    disabled={modelSaveStatus === "saving" || selectedModel === (settings.anthropicModel || "claude-sonnet-4-6")}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {modelSaveStatus === "saving" ? "Saving…" : "Save Model"}
                  </button>
                  {modelSaveStatus === "saved" && (
                    <span className="text-sm text-green-600 dark:text-green-400">Model saved.</span>
                  )}
                  {modelSaveStatus === "error" && modelSaveError && (
                    <span className="text-sm text-red-600 dark:text-red-400">{modelSaveError}</span>
                  )}
                </div>
              </div>
            )}

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

      {/* Google Gemini (AI Images) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            Google Gemini (AI Images)
          </h3>
          <span
            className={
              geminiBadge === "connected"
                ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
                : geminiBadge === "error"
                  ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
                  : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }
          >
            {geminiBadge === "connected" ? "Connected" : geminiBadge === "error" ? "Error" : "Not Connected"}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Powers room rendering, slide background generation, and brand icon creation.
        </p>

        {geminiLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
            {/* API key form */}
            <form action={handleGeminiSave} className="flex flex-col gap-4">
              <div>
                <label htmlFor="geminiApiKey" className={labelClass}>API key</label>
                <input
                  id="geminiApiKey"
                  name="geminiApiKey"
                  type="password"
                  placeholder={gemini?.hasApiKey ? "••••••••  (saved — paste new key to replace)" : "AIza..."}
                  className={inputClass}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Get a key from{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
                    Google AI Studio
                  </a>. Leave blank to keep the existing key.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={geminiSaveStatus === "saving"} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {geminiSaveStatus === "saving" ? "Saving…" : "Save Key"}
                </button>
                {geminiSaveStatus === "saved" && <span className="text-sm text-green-600 dark:text-green-400">Saved successfully.</span>}
                {geminiSaveStatus === "error" && geminiSaveError && <span className="text-sm text-red-600 dark:text-red-400">{geminiSaveError}</span>}
              </div>
            </form>

            {/* Model selectors */}
            {gemini?.hasApiKey && (
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700 space-y-4">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>AI Models</span>
                  <button type="button" onClick={fetchGeminiModels} disabled={geminiModelsLoading} className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline">
                    {geminiModelsLoading ? "Loading…" : "Refresh models"}
                  </button>
                </div>
                {geminiModelsError && <p className="text-xs text-red-600 dark:text-red-400">{geminiModelsError}</p>}

                {/* Image Model */}
                <div className="space-y-1">
                  <label htmlFor="geminiImageModel" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Image Model (rendering, vision, editing)</label>
                  <select id="geminiImageModel" value={selectedGeminiImageModel} onChange={(e) => setSelectedGeminiImageModel(e.target.value)} className={inputClass} disabled={geminiModelsLoading}>
                    {geminiModelOptions.filter((m) => m.category === "image").length === 0 && (
                      <option value={selectedGeminiImageModel}>{selectedGeminiImageModel}</option>
                    )}
                    {geminiModelOptions.filter((m) => m.category === "image").map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                  {(() => {
                    const sel = geminiModelOptions.find((m) => m.id === selectedGeminiImageModel);
                    return sel ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{sel.description}</p> : null;
                  })()}
                </div>

                {/* Imagen Model */}
                <div className="space-y-1">
                  <label htmlFor="geminiImageGenModel" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Image Generation Model (text-to-image, slide backgrounds)</label>
                  <select id="geminiImageGenModel" value={selectedGeminiImageGenModel} onChange={(e) => setSelectedGeminiImageGenModel(e.target.value)} className={inputClass} disabled={geminiModelsLoading}>
                    {geminiModelOptions.filter((m) => m.category === "imagen").length === 0 && (
                      <option value={selectedGeminiImageGenModel}>{selectedGeminiImageGenModel}</option>
                    )}
                    {geminiModelOptions.filter((m) => m.category === "imagen").map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                  {(() => {
                    const sel = geminiModelOptions.find((m) => m.id === selectedGeminiImageGenModel);
                    return sel ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{sel.description}</p> : null;
                  })()}
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleGeminiModelSave} disabled={geminiModelSaveStatus === "saving"} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                    {geminiModelSaveStatus === "saving" ? "Saving…" : "Save Models"}
                  </button>
                  {geminiModelSaveStatus === "saved" && <span className="text-sm text-green-600 dark:text-green-400">Models saved.</span>}
                  {geminiModelSaveStatus === "error" && geminiModelSaveError && <span className="text-sm text-red-600 dark:text-red-400">{geminiModelSaveError}</span>}
                </div>
              </div>
            )}

            {/* Test connection */}
            <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <button type="button" onClick={handleGeminiTest} disabled={geminiTestStatus === "testing" || !gemini?.hasApiKey} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                {geminiTestStatus === "testing" ? "Testing…" : "Test Connection"}
              </button>
              {geminiTestStatus === "ok" && geminiTestResult && <span className="text-sm text-green-600 dark:text-green-400">{geminiTestResult}</span>}
              {geminiTestStatus === "error" && geminiTestError && <span className="text-sm text-red-600 dark:text-red-400">{geminiTestError}</span>}
              {geminiTestStatus === "idle" && gemini?.lastStatus === "success" && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last tested: {gemini.lastTestedAt ? new Date(gemini.lastTestedAt).toLocaleString() : "—"}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Google Places (address autocomplete) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            Google Places
          </h3>
          <span
            className={
              googlePlacesBadge === "connected"
                ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
                : googlePlacesBadge === "error"
                  ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
                  : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }
          >
            {googlePlacesBadge === "connected"
              ? "Connected"
              : googlePlacesBadge === "error"
                ? "Error"
                : "Not Connected"}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Powers address autocomplete on the Overview tab. Paste your API key below — it is stored encrypted in the database.
          Note: This key is loaded client-side for autocomplete, so restrict it by HTTP referrer in the Google Cloud Console.
        </p>

        {googlePlacesLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : (
          <div className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
            {/* API key form */}
            <form action={handleGooglePlacesSave} className="flex flex-col gap-4">
              <div>
                <label htmlFor="googlePlacesApiKey" className={labelClass}>
                  API key
                </label>
                <input
                  id="googlePlacesApiKey"
                  name="googlePlacesApiKey"
                  type="password"
                  placeholder={googlePlaces?.hasApiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (saved \u2014 paste new key to replace)" : "AIza..."}
                  className={inputClass}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Get a key from{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Google Cloud Console
                  </a>
                  {" "}with the <strong>Places API</strong> enabled. Leave blank to keep the existing key.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={googlePlacesSaveStatus === "saving"}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {googlePlacesSaveStatus === "saving" ? "Saving..." : "Save Key"}
                </button>
                {googlePlacesSaveStatus === "saved" && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Saved successfully.
                  </span>
                )}
                {googlePlacesSaveStatus === "error" && googlePlacesSaveError && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {googlePlacesSaveError}
                  </span>
                )}
              </div>
            </form>

            {/* Test connection */}
            <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <button
                type="button"
                onClick={handleGooglePlacesTest}
                disabled={googlePlacesTestStatus === "testing" || !googlePlaces?.hasApiKey}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {googlePlacesTestStatus === "testing" ? "Testing..." : "Test Connection"}
              </button>
              {googlePlacesTestStatus === "ok" && googlePlacesTestResult && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  {googlePlacesTestResult}
                </span>
              )}
              {googlePlacesTestStatus === "error" && googlePlacesTestError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  {googlePlacesTestError}
                </span>
              )}
              {googlePlacesTestStatus === "idle" && googlePlaces?.lastStatus === "success" && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last tested: {googlePlaces.lastTestedAt ? new Date(googlePlaces.lastTestedAt).toLocaleString() : "\u2014"}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Google Reviews (testimonial sync) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            Google Reviews
          </h3>
          <span
            className={
              googleReviewsBadge === "connected"
                ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
                : googleReviewsBadge === "error"
                  ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
                  : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }
          >
            {googleReviewsBadge === "connected"
              ? "Connected"
              : googleReviewsBadge === "error"
                ? "Error"
                : "Not configured"}
          </span>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sync Google Reviews into your Testimonial Library for use in proposal decks.
        </p>

        {googleReviewsLoading ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading...</p>
        ) : (
          <div className="space-y-4">
            <form
              action={handleGoogleReviewsSave}
              className="space-y-3"
            >
              <div>
                <label className={labelClass}>API Key</label>
                <input
                  name="googleReviewsApiKey"
                  type="password"
                  placeholder={googleReviews?.hasApiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)" : "Enter Google Places API key"}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Place ID</label>
                <input
                  name="googleReviewsPlaceId"
                  type="text"
                  defaultValue={googleReviews?.placeId ?? ""}
                  placeholder="ChIJ..."
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Find yours at{" "}
                  <a
                    href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Google Place ID Finder
                  </a>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={googleReviewsSaveStatus === "saving"}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {googleReviewsSaveStatus === "saving" ? "Saving..." : "Save Credentials"}
                </button>
                {googleReviewsSaveStatus === "saved" && (
                  <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
                )}
                {googleReviewsSaveStatus === "error" && googleReviewsSaveError && (
                  <span className="text-sm text-red-600 dark:text-red-400">{googleReviewsSaveError}</span>
                )}
              </div>
            </form>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleGoogleReviewsTest}
                disabled={googleReviewsTestStatus === "testing" || !googleReviews?.hasApiKey}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {googleReviewsTestStatus === "testing" ? "Testing..." : "Test Connection"}
              </button>
              {googleReviewsTestStatus === "ok" && googleReviewsTestResult && (
                <span className="text-sm text-green-600 dark:text-green-400">{googleReviewsTestResult}</span>
              )}
              {googleReviewsTestStatus === "error" && googleReviewsTestError && (
                <span className="text-sm text-red-600 dark:text-red-400">{googleReviewsTestError}</span>
              )}
              {googleReviewsTestStatus === "idle" && googleReviews?.lastStatus === "success" && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last tested: {googleReviews.lastTestedAt ? new Date(googleReviews.lastTestedAt).toLocaleString() : "\u2014"}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Google Workspace (outbound email) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
            Google Workspace (Outbound Email)
          </h3>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Outbound email pipeline for proposal deliveries. Uses a Google Cloud
          service account with Domain-Wide Delegation to send via Gmail API on
          behalf of any Workspace user in the authorized domain.
        </p>
        {/* GoogleWorkspaceForm is self-loading (own status fetch). It also
            renders on its own page at /admin/settings/integrations/google-workspace/. */}
        <GoogleWorkspaceForm currentAdminEmail={null} />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Rendr LiDAR Integration                                            */}
      {/* ------------------------------------------------------------------ */}
      <RendrIntegrationCard />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Rendr LiDAR Integration Card
// ---------------------------------------------------------------------------

function RendrIntegrationCard() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/integrations/rendr/credentials")
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) {
          setClientId(data.clientId ?? "");
          setIsActive(data.isActive ?? false);
          setLastTestedAt(data.lastTestedAt ?? null);
          setLastTestResult(data.lastTestResult ?? null);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/integrations/rendr/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSaveStatus("error");
        setSaveError(data.error ?? "Failed to save");
        return;
      }
      setSaveStatus("saved");
      setIsActive(false);
      setLastTestResult(null);
      setLastTestedAt(null);
      setClientSecret("");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setSaveError("Network error");
    }
  };

  const handleTest = async () => {
    setTestStatus("testing");
    setTestMessage(null);
    try {
      const res = await fetch("/api/admin/integrations/rendr/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestStatus("ok");
        setTestMessage(data.message);
        setIsActive(true);
        setLastTestedAt(new Date().toISOString());
        setLastTestResult("success");
      } else {
        setTestStatus("error");
        setTestMessage(data.message);
        setLastTestResult("failed");
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Network error");
    }
  };

  const rendrPill: "connected" | "error" | "not_connected" =
    isActive && lastTestResult === "success"
      ? "connected"
      : lastTestResult === "failed"
        ? "error"
        : "not_connected";
  const rendrPillLabel =
    rendrPill === "connected"
      ? "Connected"
      : rendrPill === "error"
        ? "Error"
        : "Not connected";
  const rendrPillClass =
    rendrPill === "connected"
      ? "inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800/40 dark:text-green-200"
      : rendrPill === "error"
        ? "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-800/40 dark:text-red-200"
        : "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";

  if (!loaded) return null;

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Rendr LiDAR
        </h2>
        <span className={rendrPillClass}>{rendrPillLabel}</span>
        {lastTestedAt && lastTestResult === "success" && (
          <span className="text-xs text-zinc-400">
            {new Date(lastTestedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Connect your Rendr account to import LiDAR scan data into project rooms.
      </p>

      <div className="space-y-3">
        <div>
          <label className={labelClass}>Client ID</label>
          <input
            type="text"
            className={inputClass}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Enter Rendr Client ID"
          />
        </div>
        <div>
          <label className={labelClass}>Client Secret</label>
          <div className="relative max-w-xl">
            <input
              type={showSecret ? "text" : "password"}
              className={inputClass}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={isActive ? "********** (saved)" : "Enter Rendr Client Secret"}
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === "saving" || !clientId.trim() || !clientSecret.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saveStatus === "saving" ? "Saving..." : "Save Credentials"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === "testing" || !clientId.trim()}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          {testStatus === "testing" ? "Testing..." : "Test Connection"}
        </button>
        {saveStatus === "saved" && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
        )}
        {saveStatus === "error" && saveError && (
          <span className="text-sm text-red-600 dark:text-red-400">{saveError}</span>
        )}
        {testStatus === "ok" && testMessage && (
          <span className="text-sm text-green-600 dark:text-green-400">{testMessage}</span>
        )}
        {testStatus === "error" && testMessage && (
          <span className="text-sm text-red-600 dark:text-red-400">{testMessage}</span>
        )}
      </div>
    </section>
  );
}

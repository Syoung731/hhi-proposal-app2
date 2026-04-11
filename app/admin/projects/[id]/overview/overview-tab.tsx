"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { updateProjectOverviewAction, updateProjectTranscriptAction, type OverviewFieldErrors } from "./actions";
import { generateOverviewFromTranscriptAction } from "./generate-overview-action";
import { AddressAutocomplete } from "./address-autocomplete";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** AI overview shape from server (all optional). */
type OverviewDraft = {
  title?: string;
  subtitle?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  client1First?: string;
  client1Last?: string;
  client2First?: string;
  client2Last?: string;
  objective?: string;
  supportingText?: string;
  bullets?: string[];
  scopeOverview?: string;
};

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** AI draft state: overview fields + rooms from last generate (rooms used on Sections tab). */
type AiDraftState = {
  overview: OverviewDraft;
  rooms?: { name: string; description: string }[];
  /** Fields where AI value differs from current (normalized). Empty = no changes. */
  changedFields: readonly DiffFieldId[];
};

const DIFF_FIELD_IDS = [
  "title",
  "subtitle",
  "objective",
  "supportingText",
  "bullets",
  "scopeOverview",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "zip",
  "client1First",
  "client1Last",
  "client2First",
  "client2Last",
] as const;

type DiffFieldId = (typeof DIFF_FIELD_IDS)[number];

const DIFF_FIELD_LABELS: Record<DiffFieldId, string> = {
  title: "Title",
  subtitle: "Subtitle",
  objective: "Objective",
  supportingText: "Supporting Text",
  bullets: "Bullets",
  scopeOverview: "Scope Overview",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  zip: "Zip",
  client1First: "Client 1 first",
  client1Last: "Client 1 last",
  client2First: "Client 2 first",
  client2Last: "Client 2 last",
};

type AutosaveStatus = "idle" | "saving" | "saved" | "failed";
type ApplySaveStatus = "idle" | "saving" | "saved" | "failed";

type Props = {
  projectId: string;
  project: {
    title: string;
    subtitle: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    client1First: string | null;
    client1Last: string | null;
    client2First: string | null;
    client2Last: string | null;
    transcriptText: string | null;
    objective: string | null;
    supportingText: string | null;
    bullets: string[];
    scopeOverview: string | null;
    coverHeroImageId: string | null;
  };
};

const hasExistingTranscript = (text: string | null) =>
  !!text?.trim();

export function OverviewTab({ projectId, project }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [transcriptLoaded, setTranscriptLoaded] = useState(() =>
    hasExistingTranscript(project.transcriptText)
  );
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(() =>
    hasExistingTranscript(project.transcriptText)
  );
  const [transcriptValue, setTranscriptValue] = useState(
    project.transcriptText ?? ""
  );
  const [savedTranscriptValue, setSavedTranscriptValue] = useState(
    project.transcriptText ?? ""
  );
  const [userHasEditedTranscript, setUserHasEditedTranscript] = useState(false);
  const [transcriptFileName, setTranscriptFileName] = useState<string | null>(
    null
  );
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiDraftState | null>(null);
  const [applySelections, setApplySelections] = useState<Partial<Record<DiffFieldId, boolean>>>({});
  const [applySaveStatus, setApplySaveStatus] = useState<ApplySaveStatus>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [saveFieldErrors, setSaveFieldErrors] = useState<OverviewFieldErrors | null>(null);
  const [appliedToast, setAppliedToast] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DEBOUNCE_MS = 800;

  const saveTranscriptToServer = useCallback(
    async (value: string) => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return;
      setAutosaveStatus("saving");
      try {
        const result = await updateProjectTranscriptAction(projectId, trimmed);
        if ("error" in result) {
          setAutosaveStatus("failed");
        } else {
          setAutosaveStatus("saved");
          setSavedTranscriptValue(trimmed);
        }
      } catch {
        setAutosaveStatus("failed");
      }
    },
    [projectId]
  );

  // Debounced auto-save when transcript text changes (typing/paste) — 800ms, not every keystroke
  useEffect(() => {
    const trimmed = transcriptValue?.trim() ?? "";
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!trimmed) return;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      saveTranscriptToServer(transcriptValue);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [transcriptValue, saveTranscriptToServer]);

  function getCurrentValue(field: DiffFieldId): string {
    const el = formRef.current?.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) return (el.value ?? "").trim();
    const fromProject = project[field as keyof Props["project"]];
    return fromProject != null ? String(fromProject) : "";
  }

  function getAiValueFromOverview(overview: OverviewDraft, field: DiffFieldId): string {
    if (field === "bullets") {
      const arr = overview.bullets;
      return Array.isArray(arr) ? arr.filter(Boolean).join("\n") : "";
    }
    const v = overview[field as Exclude<DiffFieldId, "bullets">];
    return v != null ? String(v).trim() : "";
  }

  /** Build FormData from current form (overview fields only) and current transcript. Does not overwrite transcript. */
  function buildFormDataFromForm(): FormData {
    const form = formRef.current;
    const fd = new FormData();
    const overviewFieldNames = [
      "title", "subtitle", "addressLine1", "addressLine2", "city", "state", "zip",
      "client1First", "client1Last", "client2First", "client2Last", "objective",
      "supportingText", "bullets", "scopeOverview",
    ] as const;
    if (form) {
      for (const name of overviewFieldNames) {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && "value" in el) fd.append(name, (el.value ?? "").trim());
      }
    }
    fd.append("transcriptText", transcriptValue ?? "");
    return fd;
  }

  async function runGenerate() {
    setError(null);
    setApplyError(null);
    const transcriptText = transcriptValue.trim();
    if (transcriptText === "") {
      setError("Paste or upload a transcript first.");
      return;
    }
    setLoading(true);
    try {
      const result = await generateOverviewFromTranscriptAction(projectId);
      const overview = (result.overview ?? {}) as OverviewDraft;
      // Merge scope overview (generated from rooms, returned at top level) into the draft
      if (result.scopeOverview) {
        overview.scopeOverview = result.scopeOverview;
      }
      const changedFields = DIFF_FIELD_IDS.filter((field) => {
        const current = normalize(getCurrentValue(field));
        const ai = normalize(getAiValueFromOverview(overview, field));
        // Skip: AI returned empty but current has a value — "not found" ≠ "clear it"
        if (!ai && current) return false;
        return current !== ai;
      }) as DiffFieldId[];
      setAiDraft({
        overview,
        rooms: result.rooms,
        changedFields,
      });
      setApplySelections({});
      setAiOpen(changedFields.length > 0);
      if (changedFields.length > 0) {
        setTimeout(
          () =>
            aiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          50
        );
      }
    } catch {
      setError(
        "AI generation failed. Check server logs and your API key/model settings."
      );
    } finally {
      setLoading(false);
    }
  }

  function getAiValue(field: DiffFieldId): string {
    if (!aiDraft?.overview) return "";
    if (field === "bullets") {
      const arr = aiDraft.overview.bullets;
      return Array.isArray(arr) ? arr.filter(Boolean).join("\n") : "";
    }
    const v = aiDraft.overview[field as Exclude<DiffFieldId, "bullets">];
    return v != null ? String(v).trim() : "";
  }

  function setAiValue(field: DiffFieldId, value: string) {
    setAiDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        overview: {
          ...prev.overview,
          [field]: field === "bullets" ? value.split("\n").filter(Boolean) : value,
        },
      };
    });
  }

  function isApplyChecked(field: DiffFieldId, isChanged: boolean): boolean {
    return applySelections[field] ?? isChanged;
  }

  function setApplyChecked(field: DiffFieldId, checked: boolean) {
    setApplySelections((prev) => ({ ...prev, [field]: checked }));
  }

  function applyToForm(fieldsToApply: DiffFieldId[]) {
    if (!aiDraft) return;
    fieldsToApply.forEach((name) => {
      const value = getAiValue(name);
      const input = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function dismissAiPanel() {
    flushSync(() => {
      setAiDraft(null);
      setAiOpen(false);
      setApplySelections({});
      setApplyError(null);
      setSaveFieldErrors(null);
    });
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 3000);
    setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function applySelected() {
    if (!aiDraft || aiDraft.changedFields.length === 0) return;
    const toApply = aiDraft.changedFields.filter((field) =>
      isApplyChecked(field, true)
    );
    if (toApply.length === 0) return;
    applyToForm(toApply);
    dismissAiPanel();
  }

  function applyAllChanges() {
    if (!aiDraft || aiDraft.changedFields.length === 0) return;
    applyToForm([...aiDraft.changedFields]);
    dismissAiPanel();
  }

  async function submit(formData: FormData) {
    setSaveFieldErrors(null);
    const result = await updateProjectOverviewAction(projectId, formData);
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      setSaveFieldErrors(result.fieldErrors);
      return;
    }
    if (result.error && !result.fieldErrors) {
      setError(result.error);
      return;
    }
    setSaveFieldErrors(null);
    setError(null);
    router.refresh();
  }

  async function onTranscriptFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setTranscriptValue(text);
      setUserHasEditedTranscript(false); // change from file load, not typing
      setTranscriptLoaded(true);
      setTranscriptCollapsed(false); // expand to show newly loaded transcript
      setTranscriptFileName(file.name);
      setError(null);
      // Auto-save immediately when file is loaded so Generate Overview can use it
      if (text?.trim()) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        saveTranscriptToServer(text);
      }
    } catch {
      setError("Failed to read transcript file.");
    }
  }

  function handleEraseTranscript() {
    if (transcriptRef.current) transcriptRef.current.value = "";
    setTranscriptLoaded(false);
    setTranscriptCollapsed(false);
    setTranscriptValue("");
    setSavedTranscriptValue("");
    setUserHasEditedTranscript(false);
    setTranscriptFileName(null);
    setError(null);
    setAutosaveStatus("idle");
    setAiDraft(null);
    if (transcriptFileInputRef.current)
      transcriptFileInputRef.current.value = "";
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function handleSaveTranscriptNow() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const trimmed = transcriptValue?.trim() ?? "";
    if (trimmed) saveTranscriptToServer(transcriptValue);
  }

  const showTranscriptArea = transcriptLoaded;
  const hasTranscript = !!transcriptValue.trim();
  const hasUnsavedTranscriptChanges =
    userHasEditedTranscript && transcriptValue !== savedTranscriptValue;
  const generateDisabled =
    loading || !hasTranscript || autosaveStatus === "saving";

  function handleOverviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(buildFormDataFromForm());
  }

  const transcriptWordCount = transcriptValue.trim().split(/\s+/).filter(Boolean).length;

  return (
    <form ref={formRef} onSubmit={handleOverviewSubmit} className="max-w-2xl space-y-4">
      {/* Applied toast */}
      {appliedToast && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
          AI suggestions applied
        </div>
      )}

      {saveFieldErrors && Object.keys(saveFieldErrors).length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Please complete all required fields.</p>
          <p className="mt-1 text-red-700 dark:text-red-300">
            Fix the errors below and save again.
          </p>
        </div>
      )}

      {/* Collapsible Transcript Panel */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            onClick={() => setTranscriptCollapsed(!transcriptCollapsed)}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            <span className="text-xs text-zinc-400">{transcriptCollapsed ? "\u25B6" : "\u25BC"}</span>
            Project Transcript
          </button>
          {transcriptLoaded && transcriptCollapsed && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {transcriptFileName ? `${transcriptFileName} \u00B7 ` : ""}{transcriptWordCount.toLocaleString()} words
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <input
              ref={transcriptFileInputRef}
              id="transcriptFile"
              type="file"
              accept=".txt,.md,.text"
              aria-label="Choose transcript file"
              className="sr-only"
              onChange={onTranscriptFileChange}
            />
            <label
              htmlFor="transcriptFile"
              className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Choose Transcript
            </label>
            <button
              type="button"
              onClick={handleEraseTranscript}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Erase
            </button>
          </div>
        </div>
        {!transcriptCollapsed && (
          <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
            {showTranscriptArea ? (
              <textarea
                ref={transcriptRef}
                name="transcriptText"
                value={transcriptValue}
                onChange={(e) => {
                  setTranscriptValue(e.target.value);
                  setUserHasEditedTranscript(true);
                }}
                rows={6}
                className={inputClass}
                placeholder="Paste or upload transcript..."
              />
            ) : (
              <>
                <input type="hidden" name="transcriptText" value="" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No transcript loaded. Upload a file or paste text above.
                </p>
              </>
            )}
            {showTranscriptArea && (
              <div className="flex flex-wrap items-center gap-2">
                {hasUnsavedTranscriptChanges && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Unsaved transcript changes
                  </span>
                )}
                {autosaveStatus !== "idle" && (
                  <span
                    className={`text-sm ${
                      autosaveStatus === "saving"
                        ? "text-zinc-500 dark:text-zinc-400"
                        : autosaveStatus === "saved"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {autosaveStatus === "saving"
                      ? "Saving..."
                      : autosaveStatus === "saved"
                        ? "Saved"
                        : "Save failed"}
                  </span>
                )}
                {hasTranscript && (
                  <button
                    type="button"
                    onClick={handleSaveTranscriptNow}
                    disabled={autosaveStatus === "saving"}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Save transcript
                  </button>
                )}
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}
      </div>

      {/* Generate Overview button */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runGenerate}
          disabled={generateDisabled}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Overview"}
        </button>
      </div>

      {/* AI Suggestions Panel */}
      {aiDraft && (
        <div
          ref={aiPanelRef}
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
        >
          {aiDraft.changedFields.length === 0 ? (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No changes found from transcript.
              </p>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={runGenerate}
                  disabled={loading}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Regenerate
                </button>
              </div>
            </>
          ) : aiOpen ? (
            <>
              <header className="mb-3">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  AI Suggestions
                </h3>
                {applySaveStatus === "saving" && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Saving...
                  </p>
                )}
                {applySaveStatus === "saved" && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Saved
                  </p>
                )}
                {applySaveStatus === "failed" && applyError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {applyError}
                  </p>
                )}
                {applySaveStatus === "idle" && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Review changes before applying.
                  </p>
                )}
              </header>

              {aiDraft.rooms != null && aiDraft.rooms.length > 0 && (
                <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Sections detected: {aiDraft.rooms.length} (used on Sections tab)
                </p>
              )}

              <div className="space-y-2">
                {aiDraft.changedFields.map((field) => {
                  const current = getCurrentValue(field);
                  const ai = getAiValue(field);
                  const checked = isApplyChecked(field, true);
                  return (
                    <div
                      key={field}
                      className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {DIFF_FIELD_LABELS[field]}
                        </span>
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                          Changed
                        </span>
                      </div>
                      <div className="mt-1 grid gap-2 text-zinc-600 dark:text-zinc-400">
                        <div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            Current:{" "}
                          </span>
                          <span className="break-words">
                            {current || <em className="text-zinc-400">&mdash;</em>}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            AI suggestion:
                          </span>
                          {(field === "objective" || field === "supportingText" || field === "bullets" || field === "scopeOverview") ? (
                            <textarea
                              className="mt-1 w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
                              rows={field === "objective" ? 3 : field === "scopeOverview" ? 4 : 2}
                              value={ai}
                              onChange={(e) => setAiValue(field, e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
                              value={ai}
                              onChange={(e) => setAiValue(field, e.target.value)}
                            />
                          )}
                          {field === "title" && (
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              Format: Street - Project Type (e.g. 34 Sussex Lane - Multiple Bathroom + Laundry Updates)
                            </p>
                          )}
                          {field === "scopeOverview" && ai && (
                            <p className={`mt-1 text-xs ${
                              ai.split(/\s+/).filter(Boolean).length > 250
                                ? "text-red-600 dark:text-red-400"
                                : ai.split(/\s+/).filter(Boolean).length > 200
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-zinc-500 dark:text-zinc-400"
                            }`}>
                              {ai.split(/\s+/).filter(Boolean).length} words
                            </p>
                          )}
                        </div>
                      </div>
                      <label className="mt-2 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setApplyChecked(field, !checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-green-600 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800"
                        />
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Apply
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>

              {/* Note when scope overview was not generated (no rooms with scopes) */}
              {aiDraft && !aiDraft.changedFields.includes("scopeOverview") && !aiDraft.overview.scopeOverview && (
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 italic">
                  Scope Overview not generated — add room scopes in the Sections tab first.
                </p>
              )}

              <div className="mt-4 flex flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <button
                    type="button"
                    onClick={runGenerate}
                    disabled={loading}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {applySaveStatus === "saving" && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Saving...
                    </span>
                  )}
                  {applySaveStatus === "saved" && (
                    <span className="text-sm text-green-600 dark:text-green-400">
                      Saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => applySelected()}
                    disabled={loading || applySaveStatus === "saving"}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Apply selected
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAllChanges()}
                    disabled={loading || applySaveStatus === "saving"}
                    className="rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 dark:bg-zinc-800 dark:text-green-400 dark:hover:bg-green-950/30"
                  >
                    Apply all changes
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Form fields */}
      <div ref={formSectionRef} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="title">Title <span className="text-red-600 dark:text-red-400">*</span></label>
          <input
            id="title"
            name="title"
            defaultValue={project.title}
            required
            aria-invalid={!!saveFieldErrors?.title}
            aria-describedby={saveFieldErrors?.title ? "title-error" : undefined}
            className={inputClass}
          />
          {saveFieldErrors?.title && (
            <p id="title-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.title}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="subtitle">Subtitle <span className="text-red-600 dark:text-red-400">*</span></label>
          <input
            id="subtitle"
            name="subtitle"
            defaultValue={project.subtitle ?? ""}
            required
            aria-invalid={!!saveFieldErrors?.subtitle}
            aria-describedby={saveFieldErrors?.subtitle ? "subtitle-error" : undefined}
            className={inputClass}
          />
          {saveFieldErrors?.subtitle && (
            <p id="subtitle-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.subtitle}</p>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2">
          <span className={labelClass}>Address</span>
          <AddressAutocomplete
            inputClass={inputClass}
            onSelect={({ addressLine1, city, state, zip }) => {
              const form = formRef.current;
              if (!form) return;
              const fields: Record<string, string> = { addressLine1, city, state, zip };
              for (const [name, value] of Object.entries(fields)) {
                const el = form.elements.namedItem(name) as HTMLInputElement | null;
                if (el) {
                  el.value = value;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
            }}
          />
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="addressLine1">Address line 1 <span className="text-red-600 dark:text-red-400">*</span></label>
            <input
              id="addressLine1"
              name="addressLine1"
              defaultValue={project.addressLine1 ?? ""}
              required
              aria-invalid={!!saveFieldErrors?.addressLine1}
              aria-describedby={saveFieldErrors?.addressLine1 ? "addressLine1-error" : undefined}
              className={inputClass}
            />
            {saveFieldErrors?.addressLine1 && (
              <p id="addressLine1-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.addressLine1}</p>
            )}
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="addressLine2">Address line 2</label>
            <input
              id="addressLine2"
              name="addressLine2"
              defaultValue={project.addressLine2 ?? ""}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="city">City <span className="text-red-600 dark:text-red-400">*</span></label>
              <input
                id="city"
                name="city"
                defaultValue={project.city || "Hilton Head Island"}
                required
                aria-invalid={!!saveFieldErrors?.city}
                aria-describedby={saveFieldErrors?.city ? "city-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.city && (
                <p id="city-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.city}</p>
              )}
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="state">State <span className="text-red-600 dark:text-red-400">*</span></label>
              <input
                id="state"
                name="state"
                defaultValue={project.state || "SC"}
                required
                aria-invalid={!!saveFieldErrors?.state}
                aria-describedby={saveFieldErrors?.state ? "state-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.state && (
                <p id="state-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.state}</p>
              )}
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="zip">Zip <span className="text-red-600 dark:text-red-400">*</span></label>
              <input
                id="zip"
                name="zip"
                defaultValue={project.zip ?? ""}
                required
                aria-invalid={!!saveFieldErrors?.zip}
                aria-describedby={saveFieldErrors?.zip ? "zip-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.zip && (
                <p id="zip-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.zip}</p>
              )}
            </div>
          </div>
        </div>

        {/* Client 1 */}
        <div className="space-y-2">
          <span className={labelClass}>Client 1 (at least one owner) <span className="text-red-600 dark:text-red-400">*</span></span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="client1First">First name</label>
              <input
                id="client1First"
                name="client1First"
                defaultValue={project.client1First ?? ""}
                aria-invalid={!!saveFieldErrors?.client1First}
                aria-describedby={saveFieldErrors?.client1First ? "client1First-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.client1First && (
                <p id="client1First-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.client1First}</p>
              )}
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="client1Last">Last name</label>
              <input
                id="client1Last"
                name="client1Last"
                defaultValue={project.client1Last ?? ""}
                aria-invalid={!!saveFieldErrors?.client1Last}
                aria-describedby={saveFieldErrors?.client1Last ? "client1Last-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.client1Last && (
                <p id="client1Last-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.client1Last}</p>
              )}
            </div>
          </div>
        </div>

        {/* Client 2 */}
        <div className="space-y-2">
          <span className={labelClass}>Client 2 (optional; if one name given, both required)</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="client2First">First name</label>
              <input
                id="client2First"
                name="client2First"
                defaultValue={project.client2First ?? ""}
                aria-invalid={!!saveFieldErrors?.client2First}
                aria-describedby={saveFieldErrors?.client2First ? "client2First-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.client2First && (
                <p id="client2First-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.client2First}</p>
              )}
            </div>
            <div>
              <label className="mb-0.5 block text-xs text-zinc-500" htmlFor="client2Last">Last name</label>
              <input
                id="client2Last"
                name="client2Last"
                defaultValue={project.client2Last ?? ""}
                aria-invalid={!!saveFieldErrors?.client2Last}
                aria-describedby={saveFieldErrors?.client2Last ? "client2Last-error" : undefined}
                className={inputClass}
              />
              {saveFieldErrors?.client2Last && (
                <p id="client2Last-error" className="mt-1 text-sm text-red-600 dark:text-red-400">{saveFieldErrors.client2Last}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Objective</label>
          <textarea
            name="objective"
            defaultValue={project.objective ?? ""}
            rows={4}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Supporting Text</label>
          <textarea
            name="supportingText"
            defaultValue={project.supportingText ?? ""}
            rows={3}
            className={inputClass}
            placeholder="AI-generated supporting paragraph — regenerate to populate"
          />
          {!project.supportingText && (
            <p className="mt-1 text-xs text-zinc-400">Not yet generated — click Regenerate above to populate.</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Bullets</label>
          <textarea
            name="bullets"
            defaultValue={(project.bullets ?? []).join("\n")}
            rows={3}
            className={inputClass}
            placeholder="One bullet per line (up to 3)"
          />
          {(!project.bullets || project.bullets.length === 0) && (
            <p className="mt-1 text-xs text-zinc-400">Not yet generated — click Regenerate above to populate.</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Scope Overview</label>
          <textarea
            name="scopeOverview"
            defaultValue={project.scopeOverview ?? ""}
            rows={5}
            className={inputClass}
            placeholder="AI-generated scope overview — summarizes all room scopes into a cohesive narrative"
          />
          {!project.scopeOverview && (
            <p className="mt-1 text-xs text-zinc-400">
              Not yet generated — click Generate Overview to create from your room scopes.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Save overview
        </button>
      </div>
    </form>
  );
}

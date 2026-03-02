"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { updateProjectOverviewAction, updateProjectTranscriptAction, type OverviewFieldErrors } from "./actions";
import { generateOverviewFromTranscriptAction } from "./generate-overview-action";

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
    coverHeroImageId: string | null;
  };
};

const hasExistingTranscript = (text: string | null) =>
  !!text?.trim();

export function OverviewTab({ projectId, project }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [transcriptLoaded, setTranscriptLoaded] = useState(() =>
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
    const v = overview[field];
    return v != null ? String(v).trim() : "";
  }

  /** Build FormData from current form (overview fields only) and current transcript. Does not overwrite transcript. */
  function buildFormDataFromForm(): FormData {
    const form = formRef.current;
    const fd = new FormData();
    const overviewFieldNames = [
      "title", "subtitle", "addressLine1", "addressLine2", "city", "state", "zip",
      "client1First", "client1Last", "client2First", "client2Last", "objective",
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
      const changedFields = DIFF_FIELD_IDS.filter((field) =>
        normalize(getCurrentValue(field)) !== normalize(getAiValueFromOverview(overview, field))
      ) as DiffFieldId[];
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
    const v = aiDraft.overview[field];
    return v != null ? String(v).trim() : "";
  }

  function setAiValue(field: DiffFieldId, value: string) {
    setAiDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        overview: {
          ...prev.overview,
          [field]: value,
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

  async function persistOverviewFromForm(): Promise<boolean> {
    setApplySaveStatus("saving");
    setApplyError(null);
    setSaveFieldErrors(null);
    try {
      const formData = buildFormDataFromForm();
      const result = await updateProjectOverviewAction(projectId, formData);
      if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
        setApplySaveStatus("failed");
        setApplyError(result.error ?? "Please complete all required fields.");
        setSaveFieldErrors(result.fieldErrors);
        return false;
      }
      if (result.error) {
        setApplySaveStatus("failed");
        setApplyError(result.error);
        return false;
      }
      setApplySaveStatus("saved");
      setApplyError(null);
      // Clear all AI suggestion UI state so the panel and "Changed" markers disappear immediately
      flushSync(() => {
        setAiDraft(null);
        setAiOpen(false);
        setApplySelections({});
        setSaveFieldErrors(null);
      });
      router.refresh();
      setTimeout(() => setApplySaveStatus("idle"), 2000);
      return true;
    } catch {
      setApplySaveStatus("failed");
      setApplyError("Failed to save.");
      return false;
    }
  }

  async function applySelected() {
    if (!aiDraft || aiDraft.changedFields.length === 0) return;
    const toApply = aiDraft.changedFields.filter((field) =>
      isApplyChecked(field, true)
    );
    if (toApply.length === 0) return;
    applyToForm(toApply);
    await persistOverviewFromForm();
  }

  async function applyAllChanges() {
    if (!aiDraft || aiDraft.changedFields.length === 0) return;
    applyToForm([...aiDraft.changedFields]);
    await persistOverviewFromForm();
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

  return (
    <form ref={formRef} onSubmit={handleOverviewSubmit} className="max-w-2xl space-y-4">
      {saveFieldErrors && Object.keys(saveFieldErrors).length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Please complete all required fields.</p>
          <p className="mt-1 text-red-700 dark:text-red-300">
            Fix the errors below and save again.
          </p>
        </div>
      )}
      {aiDraft && (
        <div
          ref={aiPanelRef}
          className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
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
                    Saving…
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
                            {current || <em className="text-zinc-400">—</em>}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            AI suggestion:
                          </span>
                          {field === "objective" ? (
                            <textarea
                              className="mt-1 w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
                              rows={3}
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
                      Saving…
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

      {/* Transcript section */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
            className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Choose Transcript – AI Notetaker
          </label>
          {transcriptFileName && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {transcriptFileName}
            </span>
          )}
          <button
            type="button"
            onClick={handleEraseTranscript}
            className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Erase Transcript
          </button>
        </div>
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
            placeholder="Paste or upload transcript…"
          />
        ) : (
          <input type="hidden" name="transcriptText" value="" />
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
                  ? "Saving…"
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

      {/* Generate Overview – below transcript */}
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
              defaultValue={project.city ?? ""}
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
              defaultValue={project.state ?? ""}
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

      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save overview
      </button>
    </form>
  );
}

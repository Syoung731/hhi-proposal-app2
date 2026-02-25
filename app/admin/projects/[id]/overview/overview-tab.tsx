"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectOverviewAction, updateProjectTranscriptAction, updateProjectStylePresetAction } from "./actions";
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

/** AI draft state: overview fields + rooms from last generate (rooms used on Rooms tab). */
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

type StylePresetOption = { id: string; name: string };

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
    stylePresetId: string | null;
    stylePreset: { id: string; name: string } | null;
  };
  stylePresets: StylePresetOption[];
  media: { id: string; url: string; kind: string; type: string; caption: string | null }[];
};

const hasExistingTranscript = (text: string | null) =>
  !!text?.trim();

export function OverviewTab({ projectId, project, stylePresets }: Props) {
  const router = useRouter();
  const [defaultPresetSaving, setDefaultPresetSaving] = useState(false);
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
      const overview = result.overview ?? {};
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
    try {
      const formData = buildFormDataFromForm();
      const result = await updateProjectOverviewAction(projectId, formData);
      if (result.error) {
        setApplySaveStatus("failed");
        setApplyError(result.error);
        return false;
      }
      setApplySaveStatus("saved");
      setAiDraft(null);
      setAiOpen(false);
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
    await updateProjectOverviewAction(projectId, formData);
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

  return (
    <form ref={formRef} action={submit} className="max-w-2xl space-y-4">
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
                  Rooms detected: {aiDraft.rooms.length} (used on Rooms tab)
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
                      <div className="mt-1 grid gap-1 text-zinc-600 dark:text-zinc-400">
                        <div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">Current: </span>
                          <span className="break-words">
                            {current || <em className="text-zinc-400">—</em>}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">AI: </span>
                          <span className="break-words">
                            {ai || <em className="text-zinc-400">—</em>}
                          </span>
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
            Choose Transcript – Plaud Note
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
        <label className={labelClass}>Title</label>
        <input
          name="title"
          defaultValue={project.title}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Subtitle</label>
        <input
          name="subtitle"
          defaultValue={project.subtitle ?? ""}
          className={inputClass}
        />
      </div>

      {/* Address */}
      <div className="space-y-2">
        <span className={labelClass}>Address</span>
        <div>
          <label className="mb-0.5 block text-xs text-zinc-500">Address line 1</label>
          <input
            name="addressLine1"
            defaultValue={project.addressLine1 ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-zinc-500">Address line 2</label>
          <input
            name="addressLine2"
            defaultValue={project.addressLine2 ?? ""}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">City</label>
            <input
              name="city"
              defaultValue={project.city ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">State</label>
            <input
              name="state"
              defaultValue={project.state ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">Zip</label>
            <input
              name="zip"
              defaultValue={project.zip ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Client 1 */}
      <div className="space-y-2">
        <span className={labelClass}>Client 1</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">First name</label>
            <input
              name="client1First"
              defaultValue={project.client1First ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">Last name</label>
            <input
              name="client1Last"
              defaultValue={project.client1Last ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Client 2 */}
      <div className="space-y-2">
        <span className={labelClass}>Client 2</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">First name</label>
            <input
              name="client2First"
              defaultValue={project.client2First ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-zinc-500">Last name</label>
            <input
              name="client2Last"
              defaultValue={project.client2Last ?? ""}
              className={inputClass}
            />
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

      {/* Defaults – project-level default style preset for renderings */}
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <span className={labelClass}>Defaults</span>
        <div>
          <label className="mb-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
            Default Style Preset
          </label>
          <select
            value={project.stylePresetId ?? ""}
            onChange={async (e) => {
              const value = e.target.value || null;
              setDefaultPresetSaving(true);
              await updateProjectStylePresetAction(projectId, value);
              setDefaultPresetSaving(false);
              router.refresh();
            }}
            disabled={defaultPresetSaving}
            className="mt-1 max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">None (use first active preset when rendering)</option>
            {stylePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {defaultPresetSaving && (
            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
              Saving…
            </span>
          )}
        </div>
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

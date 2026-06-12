"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DISCOVERY_SECTIONS,
  QUESTIONNAIRE_INTRO,
  PRIORITY_NOTE,
  TOTAL_QUESTIONS,
  type DiscoveryQuestion,
} from "@/app/lib/discovery/questions";

type AnswerDto = {
  questionKey: string;
  answerText: string;
  updatedBy: string;
  updatedAt: string;
};

type LinkDto = {
  id: string;
  questionKey: string;
  url: string;
  label: string;
  addedBy: string;
};

type FileDto = {
  id: string;
  questionKey: string;
  fileName: string;
  publicUrl: string;
  sizeBytes: number;
  uploadedBy: string;
};

type SaveState = "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 900;
const NAME_STORAGE_KEY = "hhi-discovery-name";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Render the **bold** spans used in question text. */
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-[#1A2332]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
}

export default function DiscoveryForm({
  portalKey,
  initialAnswers,
  initialLinks,
  initialAttachments,
}: {
  portalKey: string;
  initialAnswers: AnswerDto[];
  initialLinks: LinkDto[];
  initialAttachments: FileDto[];
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerDto>>(() =>
    Object.fromEntries(initialAnswers.map((a) => [a.questionKey, a]))
  );
  const [links, setLinks] = useState<LinkDto[]>(initialLinks);
  const [files, setFiles] = useState<FileDto[]>(initialAttachments);
  const [name, setName] = useState("");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingCount, setUploadingCount] = useState<Record<string, number>>({});
  const [linkDrafts, setLinkDrafts] = useState<
    Record<string, { open: boolean; url: string; label: string }>
  >({});

  // Question keys with local edits not yet confirmed by the server — these
  // are protected from being overwritten by the focus refetch.
  const dirtyKeys = useRef<Set<string>>(new Set());
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const stored = window.localStorage.getItem(NAME_STORAGE_KEY);
    if (stored) setName(stored);
  }, []);

  const apiHeaders = useMemo(
    () => ({ "Content-Type": "application/json", "x-discovery-key": portalKey }),
    [portalKey]
  );

  const setSaveState = useCallback((key: string, state: SaveState | null) => {
    setSaveStates((prev) => {
      const next = { ...prev };
      if (state === null) delete next[key];
      else next[key] = state;
      return next;
    });
  }, []);

  const setError = useCallback((key: string, message: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message === null) delete next[key];
      else next[key] = message;
      return next;
    });
  }, []);

  const saveAnswer = useCallback(
    async (questionKey: string) => {
      const current = answersRef.current[questionKey];
      const answerText = current?.answerText ?? "";
      setSaveState(questionKey, "saving");
      setError(questionKey, null);
      try {
        const res = await fetch("/api/discovery/answer", {
          method: "PUT",
          headers: apiHeaders,
          body: JSON.stringify({
            questionKey,
            answerText,
            updatedBy: nameRef.current,
          }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const data = (await res.json()) as { answer: AnswerDto };
        // Only clear the dirty flag if nothing changed while the request
        // was in flight — otherwise the pending debounce will re-save.
        if ((answersRef.current[questionKey]?.answerText ?? "") === answerText) {
          dirtyKeys.current.delete(questionKey);
          setAnswers((prev) => ({ ...prev, [questionKey]: data.answer }));
        }
        setSaveState(questionKey, "saved");
      } catch {
        setSaveState(questionKey, "error");
        setError(questionKey, "Couldn't save — check your connection and keep typing; we'll retry.");
        // Leave the key dirty and retry on the next edit/blur.
      }
    },
    [apiHeaders, setError, setSaveState]
  );

  const handleAnswerChange = useCallback(
    (questionKey: string, value: string) => {
      dirtyKeys.current.add(questionKey);
      setAnswers((prev) => ({
        ...prev,
        [questionKey]: {
          questionKey,
          answerText: value,
          updatedBy: prev[questionKey]?.updatedBy ?? "",
          updatedAt: prev[questionKey]?.updatedAt ?? "",
        },
      }));
      if (saveTimers.current[questionKey]) clearTimeout(saveTimers.current[questionKey]);
      saveTimers.current[questionKey] = setTimeout(
        () => void saveAnswer(questionKey),
        AUTOSAVE_DELAY_MS
      );
    },
    [saveAnswer]
  );

  const flushSave = useCallback(
    (questionKey: string) => {
      if (!dirtyKeys.current.has(questionKey)) return;
      if (saveTimers.current[questionKey]) clearTimeout(saveTimers.current[questionKey]);
      void saveAnswer(questionKey);
    },
    [saveAnswer]
  );

  // Pull teammates' changes when the tab regains focus. Locally-dirty
  // questions are never overwritten.
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch("/api/discovery/data", {
          headers: { "x-discovery-key": portalKey },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          answers: AnswerDto[];
          links: LinkDto[];
          attachments: FileDto[];
        };
        setAnswers((prev) => {
          const next = { ...prev };
          for (const answer of data.answers) {
            if (!dirtyKeys.current.has(answer.questionKey)) {
              next[answer.questionKey] = answer;
            }
          }
          return next;
        });
        setLinks(data.links);
        setFiles(data.attachments);
      } catch {
        // Offline — keep local state.
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [portalKey]);

  const addLink = useCallback(
    async (questionKey: string) => {
      const draft = linkDrafts[questionKey];
      if (!draft?.url.trim()) return;
      setError(questionKey, null);
      try {
        const res = await fetch("/api/discovery/link", {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            questionKey,
            url: draft.url.trim(),
            label: draft.label.trim(),
            addedBy: nameRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't add link");
        setLinks((prev) =>
          prev.some((l) => l.id === data.link.id) ? prev : [...prev, data.link as LinkDto]
        );
        setLinkDrafts((prev) => ({
          ...prev,
          [questionKey]: { open: false, url: "", label: "" },
        }));
      } catch (e) {
        setError(questionKey, e instanceof Error ? e.message : "Couldn't add link");
      }
    },
    [apiHeaders, linkDrafts, setError]
  );

  const removeLink = useCallback(
    async (link: LinkDto) => {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      await fetch(`/api/discovery/link?id=${encodeURIComponent(link.id)}`, {
        method: "DELETE",
        headers: apiHeaders,
      }).catch(() => undefined);
    },
    [apiHeaders]
  );

  const uploadFiles = useCallback(
    async (questionKey: string, fileList: FileList) => {
      const selected = Array.from(fileList);
      if (selected.length === 0) return;
      setError(questionKey, null);
      setUploadingCount((prev) => ({
        ...prev,
        [questionKey]: (prev[questionKey] ?? 0) + selected.length,
      }));
      for (const file of selected) {
        try {
          const presignRes = await fetch("/api/discovery/upload", {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
              questionKey,
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              size: file.size,
            }),
          });
          const presign = await presignRes.json();
          if (!presignRes.ok) throw new Error(presign.error ?? "Upload failed");

          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!putRes.ok) throw new Error("Upload to storage failed");

          const commitRes = await fetch("/api/discovery/attachment", {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
              questionKey,
              fileName: file.name,
              fileKey: presign.fileKey,
              publicUrl: presign.publicUrl,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              uploadedBy: nameRef.current,
            }),
          });
          const commit = await commitRes.json();
          if (!commitRes.ok) throw new Error(commit.error ?? "Couldn't record upload");
          setFiles((prev) =>
            prev.some((f) => f.id === commit.attachment.id)
              ? prev
              : [...prev, commit.attachment as FileDto]
          );
        } catch (e) {
          setError(
            questionKey,
            e instanceof Error ? `${file.name}: ${e.message}` : `${file.name}: upload failed`
          );
        } finally {
          setUploadingCount((prev) => ({
            ...prev,
            [questionKey]: Math.max(0, (prev[questionKey] ?? 1) - 1),
          }));
        }
      }
    },
    [apiHeaders, setError]
  );

  const removeFile = useCallback(
    async (file: FileDto) => {
      if (!window.confirm(`Remove "${file.fileName}"?`)) return;
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      await fetch(`/api/discovery/attachment?id=${encodeURIComponent(file.id)}`, {
        method: "DELETE",
        headers: apiHeaders,
      }).catch(() => undefined);
    },
    [apiHeaders]
  );

  const isAnswered = useCallback(
    (questionKey: string) =>
      !!answers[questionKey]?.answerText.trim() ||
      links.some((l) => l.questionKey === questionKey) ||
      files.some((f) => f.questionKey === questionKey),
    [answers, links, files]
  );

  const answeredTotal = useMemo(
    () =>
      DISCOVERY_SECTIONS.reduce(
        (sum, section) => sum + section.questions.filter((q) => isAnswered(q.key)).length,
        0
      ),
    [isAnswered]
  );

  return (
    <main className="min-h-screen bg-[#FAF7F1] text-[#1A2332]">
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#E8E1D5] bg-[#FAF7F1]/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-[#F47216]">
                HHI Builders
              </p>
              <h1 className="text-xl font-semibold leading-tight [font-family:var(--font-cormorant)] sm:text-2xl">
                Website Discovery Questionnaire
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold">
                  {answeredTotal}{" "}
                  <span className="font-normal text-[#1A2332]/50">/ {TOTAL_QUESTIONS}</span>
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[#1A2332]/50">
                  answered
                </p>
              </div>
              <a
                href={`/api/discovery/export?k=${encodeURIComponent(portalKey)}`}
                className="rounded-lg bg-[#1A2332] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#F47216]"
              >
                Export answers
              </a>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 w-full overflow-hidden rounded bg-[#E8E1D5]">
            <div
              className="h-full rounded bg-[#F47216] transition-all"
              style={{ width: `${(answeredTotal / TOTAL_QUESTIONS) * 100}%` }}
            />
          </div>
          {/* Section jump nav */}
          <nav className="mt-2 flex gap-1.5 overflow-x-auto pb-1 text-xs">
            {DISCOVERY_SECTIONS.map((section) => {
              const done = section.questions.filter((q) => isAnswered(q.key)).length;
              const complete = done === section.questions.length;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={`whitespace-nowrap rounded-full border px-2.5 py-1 transition-colors ${
                    complete
                      ? "border-[#F47216] bg-[#F47216]/10 text-[#c25400]"
                      : "border-[#E8E1D5] bg-white text-[#1A2332]/70 hover:border-[#F47216]"
                  }`}
                >
                  {section.star ? "⭐ " : ""}
                  {section.num}. {section.title}
                  <span className="ml-1 text-[#1A2332]/40">
                    {done}/{section.questions.length}
                  </span>
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 pb-24 pt-8">
        {/* ── Intro + name ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[#E8E1D5] bg-white p-6">
          <p className="text-sm leading-relaxed text-[#1A2332]/80">{QUESTIONNAIRE_INTRO}</p>
          <p className="mt-2 text-sm font-medium text-[#c25400]">⭐ {PRIORITY_NOTE}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="discovery-name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="discovery-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                window.localStorage.setItem(NAME_STORAGE_KEY, e.target.value);
              }}
              placeholder="So we know who answered"
              className="w-64 rounded-lg border border-[#E8E1D5] bg-[#FAF7F1] px-3 py-2 text-sm outline-none focus:border-[#F47216]"
            />
            {!name.trim() && (
              <span className="text-xs text-[#1A2332]/50">
                Add your name so answers are attributed to you.
              </span>
            )}
          </div>
        </div>

        {/* ── Sections ─────────────────────────────────────────────── */}
        {DISCOVERY_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-12 scroll-mt-40">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-semibold [font-family:var(--font-cormorant)] sm:text-3xl">
                Section {section.num} — {section.title}
              </h2>
              {section.star && (
                <span className="whitespace-nowrap rounded-full bg-[#F47216]/10 px-2.5 py-0.5 text-xs font-semibold text-[#c25400]">
                  ⭐ {section.note ?? "Priority"}
                </span>
              )}
            </div>
            <div className="mt-2 h-[3px] w-16 rounded bg-[#F47216]" />

            <div className="mt-6 space-y-5">
              {section.questions.map((question) => (
                <QuestionCard
                  key={question.key}
                  question={question}
                  answer={answers[question.key]}
                  questionLinks={links.filter((l) => l.questionKey === question.key)}
                  questionFiles={files.filter((f) => f.questionKey === question.key)}
                  saveState={saveStates[question.key]}
                  error={errors[question.key]}
                  uploading={(uploadingCount[question.key] ?? 0) > 0}
                  linkDraft={linkDrafts[question.key]}
                  onAnswerChange={handleAnswerChange}
                  onBlur={flushSave}
                  onLinkDraftChange={(key, draft) =>
                    setLinkDrafts((prev) => ({ ...prev, [key]: draft }))
                  }
                  onAddLink={addLink}
                  onRemoveLink={removeLink}
                  onUpload={uploadFiles}
                  onRemoveFile={removeFile}
                />
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-16 border-t border-[#E8E1D5] pt-6 text-center text-xs text-[#1A2332]/50">
          Answers save automatically. When the team is done, use{" "}
          <span className="font-medium text-[#1A2332]/70">Export answers</span> (top right) to
          download everything as one document.
        </footer>
      </div>
    </main>
  );
}

function QuestionCard({
  question,
  answer,
  questionLinks,
  questionFiles,
  saveState,
  error,
  uploading,
  linkDraft,
  onAnswerChange,
  onBlur,
  onLinkDraftChange,
  onAddLink,
  onRemoveLink,
  onUpload,
  onRemoveFile,
}: {
  question: DiscoveryQuestion;
  answer?: AnswerDto;
  questionLinks: LinkDto[];
  questionFiles: FileDto[];
  saveState?: SaveState;
  error?: string;
  uploading: boolean;
  linkDraft?: { open: boolean; url: string; label: string };
  onAnswerChange: (key: string, value: string) => void;
  onBlur: (key: string) => void;
  onLinkDraftChange: (key: string, draft: { open: boolean; url: string; label: string }) => void;
  onAddLink: (key: string) => void;
  onRemoveLink: (link: LinkDto) => void;
  onUpload: (key: string, files: FileList) => void;
  onRemoveFile: (file: FileDto) => void;
}) {
  const text = answer?.answerText ?? "";
  const attribution =
    answer?.updatedBy && answer?.updatedAt
      ? `${answer.updatedBy} · ${new Date(answer.updatedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`
      : null;

  return (
    <>
      {question.subheading && (
        <h3 className="pt-2 text-lg font-semibold text-[#1A2332]/90 [font-family:var(--font-cormorant)]">
          {question.subheading}
        </h3>
      )}
      <div className="rounded-xl border border-[#E8E1D5] bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A2332] text-xs font-semibold text-white">
            {question.num}
          </span>
          <p className="text-[15px] leading-relaxed text-[#1A2332]/90">
            {renderBold(question.text)}
          </p>
        </div>

        <textarea
          ref={autoResize}
          value={text}
          onChange={(e) => {
            onAnswerChange(question.key, e.target.value);
            autoResize(e.target);
          }}
          onBlur={() => onBlur(question.key)}
          placeholder="Type your answer — bullets welcome…"
          className="mt-3 w-full resize-none rounded-lg border border-[#E8E1D5] bg-[#FAF7F1] px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-[#F47216]"
        />

        {/* Action row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {!text.trim() && (
            <button
              type="button"
              onClick={() => onAnswerChange(question.key, "TBD")}
              className="rounded-full border border-[#E8E1D5] px-2.5 py-1 text-[#1A2332]/60 transition-colors hover:border-[#F47216] hover:text-[#c25400]"
            >
              Mark TBD
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onLinkDraftChange(question.key, {
                open: !(linkDraft?.open ?? false),
                url: linkDraft?.url ?? "",
                label: linkDraft?.label ?? "",
              })
            }
            className="rounded-full border border-[#E8E1D5] px-2.5 py-1 text-[#1A2332]/60 transition-colors hover:border-[#F47216] hover:text-[#c25400]"
          >
            + Add link
          </button>
          <label className="cursor-pointer rounded-full border border-[#E8E1D5] px-2.5 py-1 text-[#1A2332]/60 transition-colors hover:border-[#F47216] hover:text-[#c25400]">
            {uploading ? "Uploading…" : "+ Attach file"}
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.length) onUpload(question.key, e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className="ml-auto text-[#1A2332]/45">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && (
              <span className="text-emerald-600">Saved ✓{attribution ? ` · ${attribution}` : ""}</span>
            )}
            {saveState === "error" && <span className="text-red-600">Save failed</span>}
            {!saveState && attribution && `Last edited by ${attribution}`}
          </span>
        </div>

        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

        {/* Link draft form */}
        {linkDraft?.open && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="url"
              value={linkDraft.url}
              onChange={(e) => onLinkDraftChange(question.key, { ...linkDraft, url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onAddLink(question.key)}
              placeholder="https://…"
              className="min-w-52 flex-1 rounded-lg border border-[#E8E1D5] bg-[#FAF7F1] px-3 py-2 text-xs outline-none focus:border-[#F47216]"
            />
            <input
              type="text"
              value={linkDraft.label}
              onChange={(e) =>
                onLinkDraftChange(question.key, { ...linkDraft, label: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && onAddLink(question.key)}
              placeholder="Label (optional)"
              className="w-44 rounded-lg border border-[#E8E1D5] bg-[#FAF7F1] px-3 py-2 text-xs outline-none focus:border-[#F47216]"
            />
            <button
              type="button"
              onClick={() => onAddLink(question.key)}
              className="rounded-lg bg-[#1A2332] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#F47216]"
            >
              Add
            </button>
          </div>
        )}

        {/* Saved links */}
        {questionLinks.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {questionLinks.map((link) => (
              <li key={link.id} className="flex items-center gap-2 text-xs">
                <span className="text-[#F47216]">🔗</span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-[#1A2332] underline decoration-[#F47216]/40 underline-offset-2 hover:decoration-[#F47216]"
                >
                  {link.label || link.url}
                </a>
                {link.addedBy && <span className="text-[#1A2332]/40">· {link.addedBy}</span>}
                <button
                  type="button"
                  onClick={() => onRemoveLink(link)}
                  aria-label="Remove link"
                  className="ml-auto px-1 text-[#1A2332]/35 transition-colors hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Saved files */}
        {questionFiles.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {questionFiles.map((file) => (
              <li key={file.id} className="flex items-center gap-2 text-xs">
                <span className="text-[#F47216]">📎</span>
                <a
                  href={file.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-[#1A2332] underline decoration-[#F47216]/40 underline-offset-2 hover:decoration-[#F47216]"
                >
                  {file.fileName}
                </a>
                <span className="text-[#1A2332]/40">
                  {formatBytes(file.sizeBytes)}
                  {file.uploadedBy ? ` · ${file.uploadedBy}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(file)}
                  aria-label="Remove file"
                  className="ml-auto px-1 text-[#1A2332]/35 transition-colors hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

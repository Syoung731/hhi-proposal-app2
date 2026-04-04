"use client";

import { useCallback, useEffect, useState } from "react";
import { QuestionInput, type ReviewQuestion } from "./scope-review-modal";

// ---------- Types ----------

type Room = {
  id: string;
  name: string;
  scopeNarrative: string;
  scopeQA: unknown;
  isProjectOverhead: boolean;
};

type RoomTemplateOption = {
  id: string;
  name: string;
  displayName?: string | null;
  active: boolean;
};

type Phase = "review" | "generating" | "done";

type RoomGenStatus = "pending" | "generating" | "done" | "error" | "skipped";

type RoomGenRow = {
  roomId: string;
  roomName: string;
  templateId: string | null;
  hasScope: boolean;
  status: RoomGenStatus;
  error?: string;
};

// ---------- Template auto-matching ----------

function autoMatchTemplate(roomName: string, templates: RoomTemplateOption[]): string | null {
  const lower = roomName.toLowerCase();
  const rules: [string[], string][] = [
    [["kitchen"], "kitchen"],
    [["bath", "bathroom"], "bath"],
    [["laundry"], "laundry"],
    [["closet"], "closet"],
  ];
  for (const [keywords, match] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const t = templates.find((t) => t.name.toLowerCase().includes(match));
      if (t) return t.id;
    }
  }
  return null;
}

// ---------- Component ----------

export function BulkReviewAndEstimateModal({
  projectId,
  rooms,
  roomTemplates,
  selectedTemplates,
  projectQA,
  onClose,
}: {
  projectId: string;
  rooms: Room[];
  roomTemplates: RoomTemplateOption[];
  selectedTemplates: Record<string, string | null>;
  projectQA: unknown;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("review");

  // --- Phase 1: QA Review state ---
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-room questions: { roomId: ReviewQuestion[] }
  const [roomQuestions, setRoomQuestions] = useState<Record<string, ReviewQuestion[]>>({});
  const [projectQuestions, setProjectQuestions] = useState<ReviewQuestion[]>([]);
  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // --- Phase 2: Generation state ---
  const [genRows, setGenRows] = useState<RoomGenRow[]>([]);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [copeStatus, setCopeStatus] = useState<RoomGenStatus>("pending");
  const [copeError, setCopeError] = useState<string | null>(null);

  // Filter to non-COPE rooms with scope
  const estimateRooms = rooms.filter((r) => !r.isProjectOverhead);

  // ==================== Phase 1: Load Questions ====================

  useEffect(() => {
    async function fetchQuestions() {
      setLoadingQuestions(true);
      setLoadError(null);
      try {
        const roomIds = estimateRooms
          .filter((r) => r.scopeNarrative?.trim())
          .map((r) => r.id);

        const res = await fetch("/api/ai-review/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            roomIds,
            includeProject: true,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Merge fetched questions with existing answers
        const newRoomQuestions: Record<string, ReviewQuestion[]> = {};
        for (const room of estimateRooms) {
          const fetched = (data.rooms?.[room.id]?.questions ?? []) as ReviewQuestion[];
          const existingQA = room.scopeQA as { questions?: ReviewQuestion[] } | null;

          newRoomQuestions[room.id] = fetched.map((q: ReviewQuestion) => {
            const existing = existingQA?.questions?.find(
              (eq) => eq.id === q.id || eq.question === q.question,
            );
            return {
              ...q,
              answer: existing?.answer ?? q.defaultAnswer,
            };
          });
        }
        setRoomQuestions(newRoomQuestions);

        // Project questions
        const fetchedProjectQ = (data.project?.questions ?? []) as ReviewQuestion[];
        const existingProjectQA = projectQA as { questions?: ReviewQuestion[] } | null;
        setProjectQuestions(
          fetchedProjectQ.map((q: ReviewQuestion) => {
            const existing = existingProjectQA?.questions?.find(
              (eq) => eq.id === q.id || eq.question === q.question,
            );
            return {
              ...q,
              answer: existing?.answer ?? q.defaultAnswer,
            };
          }),
        );
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load questions");
      } finally {
        setLoadingQuestions(false);
      }
    }

    fetchQuestions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== Phase 1: QA handlers ====================

  function updateRoomAnswer(roomId: string, questionId: string, value: unknown) {
    setRoomQuestions((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? []).map((q) =>
        q.id === questionId ? { ...q, answer: value } : q,
      ),
    }));
  }

  function updateProjectAnswer(questionId: string, value: unknown) {
    setProjectQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, answer: value } : q)),
    );
  }

  function toggleSection(sectionId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  const totalQuestions = Object.values(roomQuestions).reduce((s, qs) => s + qs.length, 0) + projectQuestions.length;

  // ==================== Phase 2: Save QA + Generate ====================

  const handleConfirmAndGenerate = useCallback(async (useDefaults: boolean) => {
    // 1. Prepare questions (apply defaults if requested)
    const finalRoomQuestions = { ...roomQuestions };
    if (useDefaults) {
      for (const roomId of Object.keys(finalRoomQuestions)) {
        finalRoomQuestions[roomId] = finalRoomQuestions[roomId]!.map((q) => ({
          ...q,
          answer: q.answer ?? q.defaultAnswer,
        }));
      }
    }

    const finalProjectQuestions = useDefaults
      ? projectQuestions.map((q) => ({ ...q, answer: q.answer ?? q.defaultAnswer }))
      : projectQuestions;

    // 2. Build generation rows
    const rows: RoomGenRow[] = estimateRooms.map((room) => ({
      roomId: room.id,
      roomName: room.name,
      templateId: selectedTemplates[room.id] ?? autoMatchTemplate(room.name, roomTemplates),
      hasScope: !!room.scopeNarrative?.trim(),
      status: "pending" as const,
    }));
    setGenRows(rows);
    setCopeStatus("pending");
    setCopeError(null);
    setPhase("generating");

    // 3. Save all QA answers in parallel
    const savePromises: Promise<void>[] = [];

    for (const room of estimateRooms) {
      const questions = finalRoomQuestions[room.id];
      if (questions && questions.length > 0) {
        savePromises.push(
          fetch("/api/ai-review/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId: room.id,
              projectId,
              level: "room",
              questions,
            }),
          }).then(() => undefined),
        );
      }
    }

    if (finalProjectQuestions.length > 0) {
      savePromises.push(
        fetch("/api/ai-review/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            level: "project",
            questions: finalProjectQuestions,
          }),
        }).then(() => undefined),
      );
    }

    await Promise.allSettled(savePromises);

    // 4. Generate estimates sequentially
    const toProcess = rows.filter((r) => r.hasScope && r.templateId);
    setGenProgress({ current: 0, total: toProcess.length });

    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i]!;
      setGenProgress({ current: i + 1, total: toProcess.length });

      setGenRows((prev) =>
        prev.map((r) => (r.roomId === row.roomId ? { ...r, status: "generating" } : r)),
      );

      try {
        const room = estimateRooms.find((r) => r.id === row.roomId);
        const res = await fetch("/api/ai-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            sectionId: row.roomId,
            roomTemplateId: row.templateId,
            scopeNarrative: room?.scopeNarrative ?? "",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setGenRows((prev) =>
          prev.map((r) => (r.roomId === row.roomId ? { ...r, status: "done" } : r)),
        );
      } catch (err) {
        setGenRows((prev) =>
          prev.map((r) =>
            r.roomId === row.roomId
              ? { ...r, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : r,
          ),
        );
      }
    }

    // Mark skipped rows
    const processedIds = new Set(toProcess.map((r) => r.roomId));
    setGenRows((prev) =>
      prev.map((r) => {
        if (processedIds.has(r.roomId) || r.status !== "pending") return r;
        return { ...r, status: "skipped", error: !r.templateId ? "No template" : "No scope" };
      }),
    );

    // 5. Generate COPE
    setCopeStatus("generating");
    try {
      const copeRes = await fetch("/api/cope-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!copeRes.ok) {
        const data = await copeRes.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `HTTP ${copeRes.status}`);
      }
      setCopeStatus("done");
    } catch (err) {
      setCopeStatus("error");
      setCopeError(err instanceof Error ? err.message : "COPE estimate failed");
    }

    setPhase("done");
  }, [roomQuestions, projectQuestions, estimateRooms, selectedTemplates, roomTemplates, projectId]);

  // ==================== Render ====================

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-3xl max-h-[85vh] flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {phase === "review"
                ? "Review & Generate Estimates"
                : phase === "generating"
                  ? "Generating Estimates"
                  : "Estimates Complete"}
            </h2>
            {phase === "review" && !loadingQuestions && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {totalQuestions > 0
                  ? `${totalQuestions} questions across ${Object.keys(roomQuestions).filter((id) => (roomQuestions[id]?.length ?? 0) > 0).length} rooms + project`
                  : "No questions needed \u2014 scopes look complete"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === "review" && (
            <>
              {loadingQuestions && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Reviewing all scopes...
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Generating questions for {estimateRooms.filter((r) => r.scopeNarrative?.trim()).length} rooms + project overhead
                  </p>
                </div>
              )}

              {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {loadError}
                </div>
              )}

              {!loadingQuestions && !loadError && (
                <div className="space-y-4">
                  {/* Room sections */}
                  {estimateRooms.map((room) => {
                    const questions = roomQuestions[room.id] ?? [];
                    const isCollapsed = collapsedSections.has(room.id);

                    return (
                      <div
                        key={room.id}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSection(room.id)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400">
                              {isCollapsed ? "\u25B6" : "\u25BC"}
                            </span>
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {room.name}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {questions.length > 0
                                ? `(${questions.length} question${questions.length !== 1 ? "s" : ""})`
                                : ""}
                            </span>
                          </div>
                          {!room.scopeNarrative?.trim() && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              No scope
                            </span>
                          )}
                          {room.scopeNarrative?.trim() && questions.length === 0 && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Scope complete
                            </span>
                          )}
                        </button>

                        {!isCollapsed && questions.length > 0 && (
                          <div className="space-y-3 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                            {questions.map((q, idx) => (
                              <div
                                key={q.id}
                                className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30"
                              >
                                <div className="mb-1 flex items-start gap-2">
                                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                                    {idx + 1}
                                  </span>
                                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                    {q.question}
                                  </p>
                                </div>
                                <p className="mb-2 ml-6 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {q.reason}
                                </p>
                                <div className="ml-6">
                                  <QuestionInput
                                    question={q}
                                    onChange={(val) => updateRoomAnswer(room.id, q.id, val)}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Project Overhead section */}
                  {projectQuestions.length > 0 && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800">
                      <button
                        type="button"
                        onClick={() => toggleSection("__project__")}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left bg-amber-50/50 dark:bg-amber-900/10 rounded-t-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">
                            {collapsedSections.has("__project__") ? "\u25B6" : "\u25BC"}
                          </span>
                          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                            Project Overhead (COPE)
                          </span>
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            ({projectQuestions.length} question{projectQuestions.length !== 1 ? "s" : ""})
                          </span>
                        </div>
                      </button>

                      {!collapsedSections.has("__project__") && (
                        <div className="space-y-3 border-t border-amber-100 px-4 py-3 dark:border-amber-800">
                          {projectQuestions.map((q, idx) => (
                            <div
                              key={q.id}
                              className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30"
                            >
                              <div className="mb-1 flex items-start gap-2">
                                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                  {idx + 1}
                                </span>
                                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                  {q.question}
                                </p>
                              </div>
                              <p className="mb-2 ml-6 text-[11px] text-zinc-500 dark:text-zinc-400">
                                {q.reason}
                              </p>
                              <div className="ml-6">
                                <QuestionInput
                                  question={q}
                                  onChange={(val) => updateProjectAnswer(q.id, val)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Phase 2: Generation Progress */}
          {(phase === "generating" || phase === "done") && (
            <div className="space-y-2">
              {genRows.map((row) => (
                <div
                  key={row.roomId}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-2 dark:border-zinc-800"
                >
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                    {row.roomName}
                  </span>
                  <div className="flex items-center gap-2">
                    {row.status === "pending" && (
                      <span className="text-xs text-zinc-400">&middot;</span>
                    )}
                    {row.status === "generating" && (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                    )}
                    {row.status === "done" && (
                      <span className="text-sm text-green-600 font-bold">&#10003;</span>
                    )}
                    {row.status === "error" && (
                      <span
                        className="text-sm text-red-500 cursor-help"
                        title={row.error}
                      >
                        &#10007;
                      </span>
                    )}
                    {row.status === "skipped" && (
                      <span
                        className="text-xs text-zinc-400 cursor-help"
                        title={row.error}
                      >
                        skip
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* COPE row */}
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/30 px-4 py-2 dark:border-amber-800 dark:bg-amber-900/10">
                <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Project Overhead (COPE)
                </span>
                <div className="flex items-center gap-2">
                  {copeStatus === "pending" && (
                    <span className="text-xs text-zinc-400">&middot;</span>
                  )}
                  {copeStatus === "generating" && (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                  )}
                  {copeStatus === "done" && (
                    <span className="text-sm text-green-600 font-bold">&#10003;</span>
                  )}
                  {copeStatus === "error" && (
                    <span
                      className="text-sm text-red-500 cursor-help"
                      title={copeError ?? undefined}
                    >
                      &#10007; {copeError}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {phase === "generating" && copeStatus !== "generating" && (
              <span>Processing {genProgress.current} of {genProgress.total} rooms...</span>
            )}
            {phase === "generating" && copeStatus === "generating" && (
              <span>Generating COPE estimate...</span>
            )}
            {phase === "done" && (
              <span>
                {genRows.filter((r) => r.status === "done").length} rooms generated
                {genRows.filter((r) => r.status === "error").length > 0 && (
                  <>, {genRows.filter((r) => r.status === "error").length} errors</>
                )}
                {copeStatus === "done" && <>, COPE generated</>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {phase === "done" ? "Close" : "Cancel"}
            </button>

            {phase === "review" && !loadingQuestions && (
              <>
                {totalQuestions > 0 && (
                  <button
                    type="button"
                    onClick={() => handleConfirmAndGenerate(true)}
                    className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    Accept Defaults & Generate
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleConfirmAndGenerate(false)}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  {totalQuestions > 0 ? "Confirm & Generate All" : "Generate All Estimates"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

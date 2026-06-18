"use client";

import { useCallback, useEffect, useState } from "react";
import { QuestionInput, type ReviewQuestion } from "./scope-review-modal";
import { useEstimateJob } from "@/app/admin/_estimate-job/context";
import { autoMatchTemplate } from "./auto-match-template";

// ---------- Types ----------

type Room = {
  id: string;
  name: string;
  scopeNarrative: string;
  scopeQA: unknown;
  isProjectOverhead: boolean;
  estimateStaleReason?: string | null;
  roomTemplateId?: string | null;
  /**
   * SectionType.category (INTERIOR | EXTERIOR | ADDITION | ...). Used by
   * autoMatchTemplate to prefer exterior-flavored templates for exterior/
   * addition rooms. Optional — callers that don't have it pass nothing.
   */
  sectionCategory?: string | null;
};

type RoomTemplateOption = {
  id: string;
  name: string;
  displayName?: string | null;
  active: boolean;
};

/**
 * Modal phases after Phase 8B:
 *   select   - pick rooms + templates
 *   review   - answer AI-generated clarifying questions
 *   starting - bulk API call in flight (brief — usually <2s)
 *   done     - job queued; banner takes over for live progress
 *
 * The old `generating` phase with its per-row progress rendering is gone —
 * that job belongs to <EstimateJobProgressBanner /> now.
 */
type Phase = "select" | "review" | "starting" | "done";

type SelectRow = {
  roomId: string;
  roomName: string;
  hasScope: boolean;
  hasEstimate: boolean;
  isStale: boolean;
  templateId: string | null;
  checked: boolean;
};

// ---------- Answer merge helper ----------

/**
 * Merge an existing saved answer into a newly generated question.
 * Only reuses the old answer if:
 * 1. The question text matches exactly (not just ID — IDs like q1/q2 get reused)
 * 2. For choice questions, the old answer is one of the current options
 * 3. For boolean questions, the old answer is a valid boolean
 * Otherwise falls back to the AI's defaultAnswer.
 */
function mergeAnswer(
  newQ: ReviewQuestion,
  existingQuestions: ReviewQuestion[] | undefined,
): unknown {
  if (!existingQuestions?.length) return newQ.defaultAnswer;

  // Only match on question text (IDs like q1, q2 get reused across different question sets)
  const match = existingQuestions.find(
    (eq) => eq.question === newQ.question,
  );
  if (!match || match.answer == null) return newQ.defaultAnswer;

  // Validate the old answer still fits the new question's type/options
  const answer = match.answer;
  const qType = newQ.type || "text";

  if (qType === "choice" && newQ.options?.length) {
    // For choice: old answer must be one of the current options
    if (typeof answer === "string" && newQ.options.includes(answer)) return answer;
    return newQ.defaultAnswer;
  }

  if (qType === "boolean") {
    if (typeof answer === "boolean") return answer;
    const s = String(answer).toLowerCase().trim();
    if (s === "yes" || s === "true") return true;
    if (s === "no" || s === "false") return false;
    return newQ.defaultAnswer;
  }

  if (qType === "number") {
    const n = Number(answer);
    if (!isNaN(n)) return n;
    return newQ.defaultAnswer;
  }

  // text type: accept any string
  return answer;
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
  const [phase, setPhase] = useState<Phase>("select");

  // Filter to non-COPE rooms
  const estimateRooms = rooms.filter((r) => !r.isProjectOverhead);

  // --- Select phase state ---
  const [selectRows, setSelectRows] = useState<SelectRow[]>([]);
  const [selectLoading, setSelectLoading] = useState(true);

  // --- Review phase state ---
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roomQuestions, setRoomQuestions] = useState<Record<string, ReviewQuestion[]>>({});
  const [projectQuestions, setProjectQuestions] = useState<ReviewQuestion[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // --- Kickoff phase state (Phase 8B: short-lived; live progress is in the banner) ---
  const [startError, setStartError] = useState<string | null>(null);
  const [queuedTotal, setQueuedTotal] = useState(0);
  const { startJob } = useEstimateJob();

  // ==================== Select Phase: Init rows ====================

  useEffect(() => {
    async function init() {
      const checks = await Promise.all(
        estimateRooms.map(async (room) => {
          try {
            const res = await fetch(`/api/ai-estimate?projectId=${projectId}&sectionId=${room.id}`);
            const data = await res.json();
            return { roomId: room.id, hasEstimate: !!data.estimate };
          } catch {
            return { roomId: room.id, hasEstimate: false };
          }
        })
      );
      const checkMap = new Map(checks.map((c) => [c.roomId, c.hasEstimate]));

      setSelectRows(
        estimateRooms.map((room) => ({
          roomId: room.id,
          roomName: room.name,
          hasScope: !!room.scopeNarrative?.trim(),
          hasEstimate: checkMap.get(room.id) ?? false,
          isStale: !!room.estimateStaleReason,
          templateId: selectedTemplates[room.id] ?? room.roomTemplateId ?? autoMatchTemplate(room.name, roomTemplates, room.sectionCategory ?? null),
          checked: true,
        }))
      );
      setSelectLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelectRow(roomId: string) {
    setSelectRows((prev) => prev.map((r) => r.roomId === roomId ? { ...r, checked: !r.checked } : r));
  }

  function toggleSelectAll(checked: boolean) {
    setSelectRows((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function setSelectTemplate(roomId: string, templateId: string | null) {
    setSelectRows((prev) => prev.map((r) => r.roomId === roomId ? { ...r, templateId } : r));
  }

  const checkedSelectCount = selectRows.filter((r) => r.checked).length;

  // ==================== Transition: Select → Review ====================

  async function handleContinueToReview() {
    setPhase("review");
    setLoadingQuestions(true);
    setLoadError(null);
    try {
      const checkedRows = selectRows.filter((r) => r.checked && r.hasScope);

      // Only request new AI review for rooms that are stale or have no saved QA.
      // Rooms with existing non-stale QA keep their saved answers.
      const roomsNeedingReview = checkedRows.filter((r) => {
        const room = estimateRooms.find((er) => er.id === r.roomId);
        const existingQA = room?.scopeQA as { questions?: ReviewQuestion[] } | null;
        const hasAnswers = (existingQA?.questions?.length ?? 0) > 0;
        return r.isStale || !hasAnswers;
      });

      const roomIdsForReview = roomsNeedingReview.map((r) => r.roomId);

      // Also check if project QA needs review
      const existingProjectQA = projectQA as { questions?: ReviewQuestion[] } | null;
      const projectNeedsReview = !(existingProjectQA?.questions?.length);

      const newRoomQuestions: Record<string, ReviewQuestion[]> = {};

      // For rooms with existing non-stale answers, use them directly
      for (const sr of checkedRows) {
        if (roomIdsForReview.includes(sr.roomId)) continue;
        const room = estimateRooms.find((r) => r.id === sr.roomId);
        const existingQA = room?.scopeQA as { questions?: ReviewQuestion[] } | null;
        if (existingQA?.questions?.length) {
          newRoomQuestions[sr.roomId] = existingQA.questions;
        }
      }

      // Fetch new questions only for rooms that need review
      if (roomIdsForReview.length > 0 || projectNeedsReview) {
        const res = await fetch("/api/ai-review/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            roomIds: roomIdsForReview,
            includeProject: projectNeedsReview,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Merge fetched questions with existing answers (validated)
        for (const roomId of roomIdsForReview) {
          const room = estimateRooms.find((r) => r.id === roomId);
          if (!room) continue;
          const fetched = (data.rooms?.[roomId]?.questions ?? []) as ReviewQuestion[];
          const existingQA = room.scopeQA as { questions?: ReviewQuestion[] } | null;

          newRoomQuestions[roomId] = fetched.map((q: ReviewQuestion) => ({
            ...q,
            answer: mergeAnswer(q, existingQA?.questions),
          }));
        }

        // Project questions
        if (projectNeedsReview) {
          const fetchedProjectQ = (data.project?.questions ?? []) as ReviewQuestion[];
          setProjectQuestions(
            fetchedProjectQ.map((q: ReviewQuestion) => ({
              ...q,
              answer: mergeAnswer(q, existingProjectQA?.questions),
            })),
          );
        } else if (existingProjectQA?.questions?.length) {
          setProjectQuestions(existingProjectQA.questions);
        }
      } else {
        // All rooms have existing answers, no API call needed
        if (existingProjectQA?.questions?.length) {
          setProjectQuestions(existingProjectQA.questions);
        }
      }

      setRoomQuestions(newRoomQuestions);

      // Auto-collapse rooms that have existing non-stale answers (no new questions to review)
      const roomsWithExistingAnswers = checkedRows
        .filter((r) => !roomIdsForReview.includes(r.roomId))
        .map((r) => r.roomId);
      if (roomsWithExistingAnswers.length > 0) {
        setCollapsedSections(new Set(roomsWithExistingAnswers));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoadingQuestions(false);
    }
  }

  // ==================== Review Phase: QA handlers ====================

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

  const checkedRooms = selectRows.filter((r) => r.checked);
  const totalQuestions = Object.values(roomQuestions).reduce((s, qs) => s + qs.length, 0) + projectQuestions.length;

  // ==================== Generate Phase: Save QA + Generate ====================

  /**
   * Phase 8B kickoff: save QA answers in parallel, then POST /api/ai-estimate/bulk
   * to queue one job per eligible room. Live progress now happens in the
   * persistent <EstimateJobProgressBanner /> mounted in AdminLayoutChrome —
   * the modal hands off to it via `startJob()` and closes.
   *
   * COPE is intentionally not queued here. With room estimates now running
   * asynchronously, synchronous COPE generation would either (a) read stale
   * room totals, or (b) block this handler until every room finished, which
   * defeats the purpose. COPE retains its existing per-COPE-room generator
   * on the rooms tab, run after the banner reports COMPLETED.
   */
  const handleConfirmAndGenerate = useCallback(
    async (useDefaults: boolean) => {
      setStartError(null);

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

      setPhase("starting");

      // Save QA answers in parallel; failures here shouldn't block the bulk job
      // since the answers are already in React state (and worker reads scopeQA
      // from the persisted Room record — we just want it persisted first).
      const savePromises: Promise<void>[] = [];
      for (const sr of checkedRooms) {
        const questions = finalRoomQuestions[sr.roomId];
        if (questions && questions.length > 0) {
          savePromises.push(
            fetch("/api/ai-review/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomId: sr.roomId,
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

      // Build the bulk payload from eligible checked rooms (has scope + template).
      const eligibleRooms = checkedRooms.filter((r) => r.hasScope && r.templateId);
      if (eligibleRooms.length === 0) {
        setPhase("review");
        setStartError("No rooms with both a scope and a template to queue.");
        return;
      }

      const bulkBody = {
        projectId,
        rooms: eligibleRooms.map((sr) => {
          const room = estimateRooms.find((r) => r.id === sr.roomId);
          return {
            roomId: sr.roomId,
            roomTemplateId: sr.templateId!,
            scopeNarrative: room?.scopeNarrative ?? "",
          };
        }),
        metadata: { source: "bulk-review-modal" },
      };

      try {
        const res = await fetch("/api/ai-estimate/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bulkBody),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const result = (await res.json()) as { jobId: string; totalItems: number; publishFailures?: number };

        // Hand off to the persistent banner — this makes it appear immediately
        // in the corner so the user sees the transition even if the modal
        // closes in the same tick.
        startJob(result.jobId, projectId, result.totalItems);
        setQueuedTotal(result.totalItems);
        setPhase("done");

        // Brief "started" confirmation, then auto-close. 1.5s is enough to
        // register the success state without blocking the user's next action.
        setTimeout(() => onClose(), 1500);
      } catch (err) {
        setStartError(err instanceof Error ? err.message : "Failed to start estimates");
        setPhase("review");
      }
    },
    [roomQuestions, projectQuestions, checkedRooms, estimateRooms, projectId, startJob, onClose],
  );

  // ==================== Render ====================

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-full max-w-3xl flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {phase === "select"
                ? "Generate AI Estimates"
                : phase === "review"
                  ? "Review & Generate Estimates"
                  : phase === "starting"
                    ? "Starting Background Job"
                    : "Estimates Queued"}
            </h2>
            {phase === "select" && !selectLoading && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Select rooms and assign templates
              </p>
            )}
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

          {/* ========== Select Phase ========== */}
          {phase === "select" && (
            <>
              {selectLoading ? (
                <p className="text-sm text-zinc-500 py-8 text-center">Loading rooms...</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-wider text-zinc-400">
                      <th className="pb-2 pr-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectRows.length > 0 && selectRows.every((r) => r.checked)}
                          onChange={(e) => toggleSelectAll(e.target.checked)}
                          className="h-3 w-3"
                          style={{ accentColor: "var(--brand-accent)" }}
                        />
                      </th>
                      <th className="pb-2 pr-2">Room</th>
                      <th className="pb-2 pr-2 w-44">Template</th>
                      <th className="pb-2 pr-2 w-16 text-center">Scope</th>
                      <th className="pb-2 w-20 text-center">Estimate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectRows.map((row) => (
                      <tr key={row.roomId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                        <td className="py-1.5 pr-2">
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={() => toggleSelectRow(row.roomId)}
                            className="h-3 w-3"
                            style={{ accentColor: "var(--brand-accent)" }}
                          />
                        </td>
                        <td className="py-1.5 pr-2 font-medium text-zinc-800">{row.roomName}</td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={row.templateId ?? ""}
                            onChange={(e) => setSelectTemplate(row.roomId, e.target.value || null)}
                            className={`w-full rounded border px-1.5 py-0.5 text-xs ${!row.templateId ? "border-red-300 bg-red-50" : "border-zinc-300 bg-white"}`}
                          >
                            <option value="">Select template...</option>
                            {roomTemplates.map((t) => (
                              <option key={t.id} value={t.id}>{t.displayName || t.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          {row.hasScope ? (
                            <span className="text-green-600" title="Has scope narrative">&#10003;</span>
                          ) : (
                            <span className="text-red-400" title="No scope narrative">&#10007;</span>
                          )}
                        </td>
                        <td className="py-1.5 text-center">
                          {row.hasEstimate && row.isStale ? (
                            <span className="inline-flex items-center rounded bg-red-50 px-1 py-px text-[10px] font-medium text-red-600 border border-red-200">stale</span>
                          ) : row.hasEstimate ? (
                            <span className="inline-flex items-center rounded bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-600 border border-amber-200">exists</span>
                          ) : (
                            <span className="text-zinc-300">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ========== Review Phase ========== */}
          {phase === "review" && (
            <>
              {loadingQuestions && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--brand-accent-spinner-track)", borderTopColor: "var(--brand-accent)" }} />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Reviewing all scopes...
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Generating questions for {checkedRooms.filter((r) => r.hasScope).length} rooms + project overhead
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
                  {/* Room sections — only checked rooms */}
                  {checkedRooms.map((sr) => {
                    const room = estimateRooms.find((r) => r.id === sr.roomId);
                    if (!room) return null;
                    const questions = roomQuestions[room.id] ?? [];
                    const isCollapsed = collapsedSections.has(room.id);
                    const hasSavedAnswers = !sr.isStale && ((room.scopeQA as { questions?: unknown[] } | null)?.questions?.length ?? 0) > 0;

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
                          {hasSavedAnswers && (
                            <span className="text-xs text-green-600 dark:text-green-400">
                              ✓ Previously answered — using saved
                            </span>
                          )}
                          {!hasSavedAnswers && !room.scopeNarrative?.trim() && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              No scope
                            </span>
                          )}
                          {!hasSavedAnswers && room.scopeNarrative?.trim() && questions.length === 0 && (
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
                                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-brand-accent" style={{ backgroundColor: "var(--brand-accent-light)" }}>
                                    {idx + 1}
                                  </span>
                                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                    {q.question}
                                  </p>
                                </div>
                                <p className="mb-2 ml-6 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {q.reason || ((q as unknown as Record<string, string>).impact) || ""}
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
                                {q.reason || ((q as unknown as Record<string, string>).impact) || ""}
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

          {/* ========== Kickoff + Done (Phase 8B) ========== */}
          {phase === "starting" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <span
                className="inline-block h-6 w-6 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--brand-accent-spinner-track)", borderTopColor: "var(--brand-accent)" }}
              />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Starting background job…
              </p>
            </div>
          )}
          {phase === "done" && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                &#10003;
              </span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Estimates started
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {queuedTotal} room{queuedTotal === 1 ? "" : "s"} processing in background — progress shown in the banner.
              </p>
            </div>
          )}
        </div>

        {/* Inline error — kickoff failures keep the modal open so the user can correct + retry. */}
        {startError && (
          <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            Failed to start estimates: {startError}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {phase === "select" && !selectLoading && (
              <span>{checkedSelectCount} of {selectRows.length} rooms selected</span>
            )}
            {phase === "starting" && <span>Queuing background job&hellip;</span>}
            {phase === "done" && (
              <span>
                {queuedTotal} estimates queued
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={phase === "review" ? () => setPhase("select") : onClose}
              disabled={phase === "starting"}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {phase === "done" ? "Close" : phase === "review" ? "Back" : "Cancel"}
            </button>

            {phase === "select" && !selectLoading && (
              <button
                type="button"
                onClick={handleContinueToReview}
                disabled={checkedSelectCount === 0}
                className={`rounded-lg px-5 py-2 text-sm font-semibold shadow-sm ${
                  checkedSelectCount === 0
                    ? "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                    : "text-white"
                }`}
                style={checkedSelectCount > 0 ? { backgroundColor: "var(--brand-accent)" } : undefined}
              >
                Continue to Review
              </button>
            )}

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
                  className="rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--brand-accent)" }}
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

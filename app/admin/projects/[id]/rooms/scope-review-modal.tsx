"use client";

import { useCallback, useEffect, useState } from "react";

export interface ReviewQuestion {
  id: string;
  question: string;
  reason: string;
  type: "number" | "boolean" | "choice" | "text";
  unit: string | null;
  defaultAnswer: unknown;
  answer: unknown;
  options: string[] | null;
}

interface ScopeReviewModalProps {
  roomId?: string;
  projectId: string;
  level: "room" | "project";
  existingQA: { questions?: ReviewQuestion[] } | null;
  onComplete: (questions: ReviewQuestion[]) => void;
  onClose: () => void;
}

export function ScopeReviewModal({
  roomId,
  projectId,
  level,
  existingQA,
  onComplete,
  onClose,
}: ScopeReviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);

  // Generate questions on mount
  useEffect(() => {
    generateQuestions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, projectId, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions");

      const newQuestions: ReviewQuestion[] = (data.questions ?? []).map(
        (q: ReviewQuestion) => {
          // If we have existing answers, pre-fill them
          const existing = existingQA?.questions?.find(
            (eq) => eq.id === q.id || eq.question === q.question,
          );
          return {
            ...q,
            answer: existing?.answer ?? q.defaultAnswer,
          };
        },
      );
      setQuestions(newQuestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [roomId, projectId, level, existingQA]);

  const updateAnswer = (id: string, value: unknown) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, answer: value } : q)),
    );
  };

  const handleSave = async (andGenerate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-review/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, projectId, level, questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      if (andGenerate) {
        onComplete(questions);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSaving(false);
    }
  };

  const acceptDefaultsAndGenerate = async () => {
    // Set all answers to defaults
    const withDefaults = questions.map((q) => ({
      ...q,
      answer: q.answer ?? q.defaultAnswer,
    }));
    setQuestions(withDefaults);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-review/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          projectId,
          level,
          questions: withDefaults,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onComplete(withDefaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {level === "room" ? "Scope Review" : "Project Review"}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {level === "room"
                ? "Answer these questions to improve estimate accuracy"
                : "Answer these questions to improve COPE estimate accuracy"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              <p className="text-sm text-zinc-500">Reviewing scope...</p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && questions.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No questions generated. The scope looks complete.
            </p>
          )}

          {!loading && questions.length > 0 && (
            <div className="space-y-5">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <div className="mb-1 flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                      {idx + 1}
                    </span>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {q.question}
                    </p>
                  </div>
                  <p className="mb-3 ml-7 text-xs text-zinc-500 dark:text-zinc-400">
                    {q.reason}
                  </p>
                  <div className="ml-7">
                    <QuestionInput
                      question={q}
                      onChange={(val) => updateAnswer(q.id, val)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && questions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <button
              onClick={acceptDefaultsAndGenerate}
              disabled={saving}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {saving ? "Saving..." : "Accept Defaults & Generate"}
            </button>
            <div className="flex-1" />
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400"
            >
              Save for Later
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Confirm & Generate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Question Input Component ----------

function QuestionInput({
  question,
  onChange,
}: {
  question: ReviewQuestion;
  onChange: (value: unknown) => void;
}) {
  switch (question.type) {
    case "number":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={question.answer != null ? String(question.answer) : ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className="w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {question.unit && (
            <span className="text-sm text-zinc-500">{question.unit}</span>
          )}
          <span className="ml-2 text-xs text-zinc-400">
            AI suggested: {String(question.defaultAnswer)}
            {question.unit ? ` ${question.unit}` : ""}
          </span>
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={question.answer === true}
              onChange={() => onChange(true)}
              className="h-4 w-4 text-indigo-600"
            />
            <span className="text-zinc-700 dark:text-zinc-300">Yes</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={question.answer === false}
              onChange={() => onChange(false)}
              className="h-4 w-4 text-indigo-600"
            />
            <span className="text-zinc-700 dark:text-zinc-300">No</span>
          </label>
          <span className="ml-2 text-xs text-zinc-400">
            AI suggested: {question.defaultAnswer ? "Yes" : "No"}
          </span>
        </div>
      );

    case "choice":
      return (
        <div className="space-y-1.5">
          {(question.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`q-${question.id}`}
                checked={question.answer === opt}
                onChange={() => onChange(opt)}
                className="h-4 w-4 text-indigo-600"
              />
              <span className="text-zinc-700 dark:text-zinc-300">{opt}</span>
              {opt === question.defaultAnswer && (
                <span className="text-xs text-indigo-500">(AI suggested)</span>
              )}
            </label>
          ))}
        </div>
      );

    case "text":
      return (
        <div>
          <input
            type="text"
            value={question.answer != null ? String(question.answer) : ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder={question.defaultAnswer ? String(question.defaultAnswer) : "Enter answer..."}
          />
          {question.defaultAnswer != null && (
            <span className="mt-1 text-xs text-zinc-400">
              AI suggested: {String(question.defaultAnswer)}
            </span>
          )}
        </div>
      );

    default:
      return null;
  }
}

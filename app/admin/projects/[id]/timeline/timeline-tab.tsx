"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ensureTimelinePhasesAction,
  updateTimelinePhaseFieldAction,
  resetTimelinePhaseFieldAction,
} from "./actions";
import {
  TIMELINE_PHASE_DEFINITIONS,
  type TimelinePhaseDefinition,
} from "@/app/lib/timeline-phases";
import type { TimelinePhaseType } from "@/app/generated/prisma";

type Phase = {
  id: string;
  phase: TimelinePhaseType;
  nameOverride: string | null;
  descriptionOverride: string | null;
  durationText: string;
  sortOrder: number;
};

type Props = {
  projectId: string;
  phases: Phase[];
};

export function TimelineTab({ projectId, phases: initialPhases }: Props) {
  const router = useRouter();
  const [phases, setPhases] = useState(initialPhases);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sync local state when server props change (e.g. after router.refresh()).
  useEffect(() => {
    setPhases(initialPhases);
  }, [initialPhases]);

  // Auto-provision the 5 phase rows on first visit.
  useEffect(() => {
    if (initialPhases.length < TIMELINE_PHASE_DEFINITIONS.length) {
      ensureTimelinePhasesAction(projectId).then(() => router.refresh());
    }
  }, [projectId, initialPhases.length, router]);

  const phaseByType = new Map(phases.map((p) => [p.phase, p]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Project Timeline
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Edit any phase name, description, or duration. Empty fields fall back
          to the canonical HHI default copy. These values feed the project
          timeline slide in the deck.
        </p>
      </div>

      <div className="space-y-4">
        {TIMELINE_PHASE_DEFINITIONS.map((def, idx) => {
          const record = phaseByType.get(def.phase);
          if (!record) return null;
          const isEditing = editingId === record.id;
          return (
            <PhaseCard
              key={record.id}
              projectId={projectId}
              def={def}
              record={record}
              indexLabel={labelForPhase(def, idx)}
              isEditing={isEditing}
              onEdit={() => setEditingId(record.id)}
              onDone={() => {
                setEditingId(null);
                router.refresh();
              }}
              onCancel={() => setEditingId(null)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Per-card component ──────────────────────────────────────────────────────

type PhaseCardProps = {
  projectId: string;
  def: TimelinePhaseDefinition;
  record: Phase;
  indexLabel: string;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onCancel: () => void;
};

function PhaseCard({
  projectId,
  def,
  record,
  indexLabel,
  isEditing,
  onEdit,
  onDone,
  onCancel,
}: PhaseCardProps) {
  const effectiveName = record.nameOverride?.trim() || def.name;
  const effectiveDescription =
    record.descriptionOverride?.trim() || def.description;
  const storedDuration = record.durationText.trim();
  const defaultDuration = def.defaultDuration?.trim() ?? "";
  const effectiveDuration =
    storedDuration.length > 0 ? storedDuration : defaultDuration;
  const isCustomDuration =
    def.hasDuration &&
    storedDuration.length > 0 &&
    storedDuration !== defaultDuration;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {indexLabel}
            {def.hasDuration && effectiveDuration && !isEditing && (
              <span
                className={
                  isCustomDuration
                    ? "ml-2 text-orange-600 dark:text-orange-400"
                    : "ml-2 text-zinc-900 dark:text-zinc-100"
                }
              >
                {effectiveDuration}
              </span>
            )}
          </p>
          {!isEditing && (
            <h3 className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {effectiveName}
            </h3>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Edit
          </button>
        )}
      </div>

      {!isEditing ? (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {effectiveDescription}
        </p>
      ) : (
        <PhaseEditor
          projectId={projectId}
          def={def}
          record={record}
          onDone={onDone}
          onCancel={onCancel}
        />
      )}

      {!def.hasDuration && !isEditing && (
        <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-500">
          Milestone — no duration
        </p>
      )}
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

type PhaseEditorProps = {
  projectId: string;
  def: TimelinePhaseDefinition;
  record: Phase;
  onDone: () => void;
  onCancel: () => void;
};

function PhaseEditor({
  projectId,
  def,
  record,
  onDone,
  onCancel,
}: PhaseEditorProps) {
  const [name, setName] = useState(record.nameOverride ?? "");
  const [description, setDescription] = useState(
    record.descriptionOverride ?? ""
  );
  const [duration, setDuration] = useState(record.durationText);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const ops: Array<Promise<unknown>> = [];
      if ((record.nameOverride ?? "") !== name) {
        ops.push(
          updateTimelinePhaseFieldAction(projectId, record.id, "name", name)
        );
      }
      if ((record.descriptionOverride ?? "") !== description) {
        ops.push(
          updateTimelinePhaseFieldAction(
            projectId,
            record.id,
            "description",
            description
          )
        );
      }
      if (def.hasDuration && record.durationText !== duration) {
        ops.push(
          updateTimelinePhaseFieldAction(
            projectId,
            record.id,
            "duration",
            duration
          )
        );
      }
      await Promise.all(ops);
      onDone();
    });
  }

  function handleResetField(field: "name" | "description" | "duration") {
    startTransition(async () => {
      await resetTimelinePhaseFieldAction(projectId, record.id, field);
      if (field === "name") setName("");
      if (field === "description") setDescription("");
      if (field === "duration") setDuration(def.defaultDuration ?? "");
    });
  }

  const hasNameOverride = !!record.nameOverride;
  const hasDescriptionOverride = !!record.descriptionOverride;
  const hasCustomDuration =
    def.hasDuration && record.durationText !== (def.defaultDuration ?? "");

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor={`name-${record.id}`}
            className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            Name
          </label>
          {hasNameOverride && (
            <button
              type="button"
              onClick={() => handleResetField("name")}
              className="text-xs text-orange-600 hover:underline dark:text-orange-400"
            >
              Reset to default
            </button>
          )}
        </div>
        <input
          id={`name-${record.id}`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={def.name}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
          Leave blank to use the canonical HHI name.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor={`description-${record.id}`}
            className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
          >
            Description
          </label>
          {hasDescriptionOverride && (
            <button
              type="button"
              onClick={() => handleResetField("description")}
              className="text-xs text-orange-600 hover:underline dark:text-orange-400"
            >
              Reset to default
            </button>
          )}
        </div>
        <textarea
          id={`description-${record.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={def.description}
          rows={4}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
          Leave blank to use the canonical HHI description.
        </p>
      </div>

      {def.hasDuration && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor={`duration-${record.id}`}
              className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              Duration
            </label>
            {hasCustomDuration && (
              <button
                type="button"
                onClick={() => handleResetField("duration")}
                className="text-xs text-orange-600 hover:underline dark:text-orange-400"
              >
                Reset to default
              </button>
            )}
          </div>
          <input
            id={`duration-${record.id}`}
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={def.defaultDuration ?? "e.g. 4 to 8 weeks"}
            className="w-56 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Saving\u2026" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function labelForPhase(def: TimelinePhaseDefinition, idx: number): string {
  if (!def.hasDuration) return `Step ${idx + 1} — Milestone`;
  const phaseIdx = TIMELINE_PHASE_DEFINITIONS.filter((d) => d.hasDuration).findIndex(
    (d) => d.id === def.id
  );
  return phaseIdx >= 0 ? `Phase ${phaseIdx + 1}` : `Step ${idx + 1}`;
}

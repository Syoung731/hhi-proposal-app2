/**
 * Canonical HHI Builders project timeline copy.
 *
 * Every phase — including the 2 milestones — has a row in `TimelinePhase`.
 * `nameOverride` and `descriptionOverride` are per-project overrides; when
 * null, the canonical default from `TIMELINE_PHASE_DEFINITIONS` is used.
 *
 * Only the 3 phases with `hasDuration: true` carry a `durationText`; the 2
 * milestones render as headline-only markers on the timeline deck
 * slide.
 */

import { TimelinePhaseType } from "@/app/generated/prisma";
import type { ProjectPhase } from "@/app/lib/deck/types";

export type TimelinePhaseDefinition = {
  id: string;
  phase: TimelinePhaseType;
  name: string;
  description: string;
  /** When true, the phase has an editable duration stored in TimelinePhase. */
  hasDuration: boolean;
  /** Default duration text used when no TimelinePhase record exists yet. */
  defaultDuration?: string;
};

export const TIMELINE_PHASE_DEFINITIONS: TimelinePhaseDefinition[] = [
  {
    id: "sign-contract",
    phase: TimelinePhaseType.SIGN_CONTRACT,
    name: "Sign Initial Contract",
    description:
      "Once the contract is signed, clients are invoiced for the initial phase cost which includes architectural design coordination, structural engineering, and pre-construction review.",
    hasDuration: false,
  },
  {
    id: "start-design",
    phase: TimelinePhaseType.START_DESIGN,
    name: "Start of Architectural, Design & Feasibility Phase",
    description:
      "Our team comes to your house to review and measure the space in detail. Review of the overall project usage, structural conditions, and feasibility. Date is fluid based on date of contract signing.",
    hasDuration: false,
  },
  {
    id: "design",
    phase: TimelinePhaseType.DESIGN_FEASIBILITY,
    name: "Architectural Design Phase",
    description:
      "This is where you and our team collaborate to finalize the remodel plan with We could then bring in Architects, Structural Engineers, etc... This is when we determine what is needed for ARB approval (if required)all design, selections and estimating of build proposal happen during this phase.",
    hasDuration: true,
    defaultDuration: "4 to 8 weeks",
  },
  {
    id: "precon",
    phase: TimelinePhaseType.PRECONSTRUCTION,
    name: "Pre-Construction Phase",
    description:
      "This is where materials are spec'd and ordered, permit documents are prepared and executed. Our project team reviews the plan for the home and the feasibility of the design plan based on your home\u2019s unique features.",
    hasDuration: true,
    defaultDuration: "3 to 5 weeks",
  },
  {
    id: "construction",
    phase: TimelinePhaseType.CONSTRUCTION,
    name: "Construction Phase",
    description:
      "Our build team and trade partners work to execute the agreed plan in your home.",
    hasDuration: true,
    defaultDuration: "12 to 16 weeks",
  },
];

/**
 * Lookup the canonical definition for a given TimelinePhaseType enum value.
 */
export function getTimelinePhaseDefinition(
  phase: TimelinePhaseType
): TimelinePhaseDefinition | undefined {
  return TIMELINE_PHASE_DEFINITIONS.find((d) => d.phase === phase);
}

/**
 * Resolve the effective name for a TimelinePhase record — override if set,
 * else the canonical default.
 */
export function resolvePhaseName(
  def: TimelinePhaseDefinition,
  nameOverride: string | null | undefined
): string {
  const trimmed = nameOverride?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : def.name;
}

/**
 * Resolve the effective description for a TimelinePhase record — override if
 * set, else the canonical default.
 */
export function resolvePhaseDescription(
  def: TimelinePhaseDefinition,
  descriptionOverride: string | null | undefined
): string {
  const trimmed = descriptionOverride?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : def.description;
}

/**
 * Parse a human duration string ("4 to 8 weeks", "12-16 weeks", "6 weeks")
 * into a numeric week range. Returns null when no number is present
 * (milestones carry empty durations). The week-axis layout sizes segments
 * by `high` — the conservative upper bound of the range.
 */
export function parseWeeksRange(
  duration: string | null | undefined
): { low: number; high: number } | null {
  const nums = (duration ?? "").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const low = Number(nums[0]);
  const high = Number(nums[1] ?? nums[0]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low, high: Math.max(low, high) };
}

/**
 * Build the full 5-entry ProjectPhase array for a timeline slide,
 * merging TimelinePhase override fields onto the hardcoded definitions.
 * Milestone entries (hasDuration: false) get an empty `duration` string.
 */
export function buildProjectPhases(
  timelinePhases: ReadonlyArray<{
    phase: TimelinePhaseType;
    nameOverride?: string | null;
    descriptionOverride?: string | null;
    durationText?: string | null;
  }>
): ProjectPhase[] {
  const byPhase = new Map(timelinePhases.map((p) => [p.phase, p]));
  return TIMELINE_PHASE_DEFINITIONS.map((def) => {
    const record = byPhase.get(def.phase);
    let duration = "";
    if (def.hasDuration) {
      const stored = record?.durationText?.trim() ?? "";
      duration = stored.length > 0 ? stored : (def.defaultDuration ?? "");
    }
    return {
      id: def.id,
      name: resolvePhaseName(def, record?.nameOverride),
      duration,
      description: resolvePhaseDescription(def, record?.descriptionOverride),
    };
  });
}

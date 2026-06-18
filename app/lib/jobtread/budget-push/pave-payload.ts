import "server-only";

/**
 * Pave payload builders for the template-overlay JobTread budget push.
 *
 * These turn a (resolved) {@link JobTreadBudgetTree} into the INNER Pave query
 * objects handed to `jobTreadRequest(query)` — i.e. WITHOUT the outer
 * `{ query: { $: { grantKey }, ... } }` wrapper that the client adds.
 *
 * Two shapes are produced:
 *
 *   1. {@link buildCreateJobPayload} — a single `createJob` op that creates a
 *      new job under a location and writes the ENTIRE Room > Trade > Item budget
 *      via nested `lineItems` (`newCostGroup` per room → `newCostGroup` per
 *      trade → `newCostItem` per line). One round-trip, JobTread cap 1500 items.
 *
 *   2. {@link buildExistingJobCostItems} — for pushing into an EXISTING job.
 *      JobTread cannot create nested groups + items keyed off ids that don't
 *      exist yet in a single flat op array, so this returns an ORDERED PLAN of
 *      op "stages": room groups, then trade groups (need their room group id),
 *      then items (need their trade group id). The caller sequences the stages,
 *      threading created ids forward via the `idRef` placeholders documented
 *      on {@link ExistingJobCostItemsPlan}.
 *
 * Field grounding (docs/jobtread-write-plan.md):
 *   - `createJob` inputs: `locationId` (REQUIRED), `name` (max 30 chars),
 *     `number`, `customFieldValues`, `lineItems` (max 1500). `lineItems[]` is
 *     `oneOf { newCostGroup, existingCostGroup, newCostItem, existingCostItem }`
 *     and `newCostGroup` has a nested `lineItems` → whole budget in one call.
 *   - `createCostItem` inputs: `name`, `description`, `quantity`, `unitCost`,
 *     `unitPrice`, `unitId`, `costCodeId`, `costTypeId`, `allowanceType`,
 *     targeting via `costGroupId` / `jobId` / `organizationId`.
 *   - `createCostGroup` inputs: `name`, `jobId`, `parentCostGroupId`.
 *   - "Job Stage" custom field id = `22P5KyX5Me24` (set via `customFieldValues`).
 *
 * server-only. These builders are PURE — they construct query objects and send
 * nothing.
 */

import type {
  BuildCreateJobOptions,
  BuildExistingJobOptions,
  CostCodeResolution,
  CostTypeHint,
  JobTreadBudgetTree,
  JTCostItem,
  JTTradeGroup,
  PaveQuery,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JobTread job name maximum length (chars). Names are truncated to this. */
const JOB_NAME_MAX_LENGTH = 30;

/** JobTread custom-field id for the "Job Stage" field. */
const JOB_STAGE_CUSTOM_FIELD_ID = "22P5KyX5Me24";

/**
 * JobTread cap on `createJob.lineItems` total entries (groups + items combined).
 * Exceeding this means the create-in-one-call path is not viable and the caller
 * must fall back to a created job + {@link buildExistingJobCostItems} batches.
 */
export const CREATE_JOB_LINE_ITEMS_MAX = 1500;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Truncate a job name to JobTread's 30-char limit (trimming trailing space). */
function truncateJobName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= JOB_NAME_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, JOB_NAME_MAX_LENGTH).trimEnd();
}

/**
 * Derive the Material / Install / Sub hint for resolver fallback from a cost
 * item's name suffix and/or its resolved cost-type name. Item names follow
 * "[PREFIX] Item - Material" / "… - Install"; structured costType (when known)
 * takes precedence.
 */
function deriveCostTypeHint(item: JTCostItem): CostTypeHint {
  const typeName = item.costTypeName?.toLowerCase() ?? "";
  if (typeName.includes("labor")) return "Install";
  if (typeName.includes("material")) return "Material";
  if (
    typeName.includes("sub") ||
    typeName.includes("subcontract")
  ) {
    return "Sub";
  }

  const name = item.name.toLowerCase();
  if (/\s-\s*install\b/.test(name) || name.endsWith("- install")) {
    return "Install";
  }
  if (/\s-\s*material\b/.test(name) || name.endsWith("- material")) {
    return "Material";
  }
  if (/\s-\s*sub\b/.test(name) || name.endsWith("- sub")) {
    return "Sub";
  }
  // Default to Material — most unsuffixed lines are physical materials, and the
  // resolver routes Install/Labor to Subcontract separately. (Mirrors
  // costTypeHintFromName in dry-run.ts.)
  return "Material";
}

/**
 * Resolve the cost code + cost type ids for a line. Prefers ids already present
 * on the tree item (set during the merge); otherwise runs the resolver, passing
 * the authoritative template cost-code/cost-type names when available so it can
 * take the high-confidence `template-exact` path.
 */
function resolveLineCodes(
  item: JTCostItem,
  trade: JTTradeGroup,
  resolver: BuildCreateJobOptions["resolver"],
): { costCodeId: string | null; costTypeId: string | null } {
  // Already resolved on the tree — trust it.
  if (item.costCodeId != null && item.costTypeId != null) {
    return { costCodeId: item.costCodeId, costTypeId: item.costTypeId };
  }

  const resolution: CostCodeResolution = resolver.resolve(
    trade.tradeName,
    deriveCostTypeHint(item),
    item.costCodeName,
    item.costTypeName,
  );

  return {
    // Keep any id the tree already had over a null from the resolver.
    costCodeId: item.costCodeId ?? resolution.costCodeId,
    costTypeId: item.costTypeId ?? resolution.costTypeId,
  };
}

/**
 * Build the `$` input map for one `newCostItem` (used inside `createJob`'s
 * nested `lineItems`) OR one `createCostItem` op (existing-job path). Shared so
 * the two paths emit identical line shapes.
 *
 * Omits fields that are unknown rather than sending nulls:
 *   - `unitId` is always omitted — the tree carries only a unit abbreviation
 *     string (`item.unit`), not a JobTread unit id; resolving unit ids is out
 *     of scope. (The abbreviation is preserved in `description` so it isn't
 *     lost.)
 *   - `costCodeId` / `costTypeId` omitted when unresolved (null).
 *   - `allowanceType` omitted when null.
 */
function buildCostItemInput(
  item: JTCostItem,
  trade: JTTradeGroup,
  resolver: BuildCreateJobOptions["resolver"],
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const { costCodeId, costTypeId } = resolveLineCodes(item, trade, resolver);

  const input: Record<string, unknown> = {
    name: item.name,
    quantity: item.quantity,
    unitCost: item.unitCost,
    unitPrice: item.unitPrice,
    ...extra,
  };

  // Preserve the unit abbreviation in the description (we cannot send unitId).
  if (item.unit && item.unit.trim()) {
    input.description = `Unit: ${item.unit.trim()}`;
  }

  if (costCodeId != null) input.costCodeId = costCodeId;
  if (costTypeId != null) input.costTypeId = costTypeId;
  if (item.allowanceType != null) input.allowanceType = item.allowanceType;

  return input;
}

// ---------------------------------------------------------------------------
// createJob (new job + full nested budget in one call)
// ---------------------------------------------------------------------------

/**
 * Build the inner Pave query for a `createJob` op that creates a new job under
 * `opts.locationId` and writes the entire Room > Trade > Item budget via nested
 * `lineItems` in one call.
 *
 * Structure:
 *   createJob.$ = {
 *     locationId, name (≤30), number?, customFieldValues? (Job Stage),
 *     lineItems: [ newCostGroup(room) { lineItems: [ newCostGroup(trade) {
 *       lineItems: [ newCostItem(line), … ] }, … ] }, … ]
 *   }
 *   createdJob = { id:{}, number:{} }  // requested return fields
 *
 * Empty trade groups (no items) and empty rooms (no non-empty trades) are
 * skipped so JobTread isn't sent hollow groups.
 *
 * NOTE on the 1500-item cap: the total `newCostGroup` + `newCostItem` count is
 * computed and, when it exceeds {@link CREATE_JOB_LINE_ITEMS_MAX}, exposed via
 * the `__overLimit` / `__lineItemCount` debug markers on the returned object so
 * the caller can detect the overflow and fall back to the existing-job batch
 * path. (These `__`-prefixed keys are inert metadata; Pave ignores unknown
 * sibling keys, and the caller should strip/inspect them before sending.)
 */
export function buildCreateJobPayload(
  tree: JobTreadBudgetTree,
  opts: BuildCreateJobOptions,
): PaveQuery {
  const { locationId, name, number, jobStageValue, resolver } = opts;

  let lineItemCount = 0;
  const lineItems: Record<string, unknown>[] = [];

  for (const room of tree.rooms) {
    const tradeNodes: Record<string, unknown>[] = [];

    for (const trade of [...room.trades].sort(bySortOrder)) {
      const itemNodes: Record<string, unknown>[] = [];

      for (const item of [...trade.items].sort(bySortOrder)) {
        itemNodes.push({
          newCostItem: buildCostItemInput(item, trade, resolver),
        });
        lineItemCount += 1;
      }

      if (itemNodes.length === 0) continue; // skip hollow trade groups

      tradeNodes.push({
        newCostGroup: {
          name: trade.tradeName,
          lineItems: itemNodes,
        },
      });
      lineItemCount += 1;
    }

    if (tradeNodes.length === 0) continue; // skip hollow rooms

    lineItems.push({
      newCostGroup: {
        name: room.roomName,
        // Top-level room group: explicit null parent.
        parentCostGroupId: null,
        lineItems: tradeNodes,
      },
    });
    lineItemCount += 1;
  }

  const createJobInput: Record<string, unknown> = {
    locationId,
    name: truncateJobName(name),
    lineItems,
  };

  if (number != null && number.trim()) {
    createJobInput.number = number.trim();
  }

  if (jobStageValue != null && jobStageValue.trim()) {
    createJobInput.customFieldValues = {
      [JOB_STAGE_CUSTOM_FIELD_ID]: jobStageValue.trim(),
    };
  }

  const payload: PaveQuery = {
    createJob: {
      $: createJobInput,
      createdJob: {
        id: {},
        number: {},
      },
    },
    // Inert debug markers (Pave ignores unknown sibling keys). The caller can
    // read these to detect the 1500-item overflow before sending, then strip.
    __lineItemCount: lineItemCount,
    __overLimit: lineItemCount > CREATE_JOB_LINE_ITEMS_MAX,
  };

  return payload;
}

// ---------------------------------------------------------------------------
// Existing-job push (createCostGroup + createCostItem batches)
// ---------------------------------------------------------------------------

/**
 * A single deferred Pave op in the existing-job plan. `query` is the inner Pave
 * query object to send (one create op). `idRef` is a stable key the caller maps
 * to the created node's id after the op runs, so later ops can reference it.
 */
export interface PlannedOp {
  /** Stable reference key for the id this op creates (room/trade group id). */
  idRef: string;
  /**
   * The inner Pave query for this single op. Any `parentCostGroupId` /
   * `costGroupId` value equal to one of the placeholders in
   * {@link ExistingJobCostItemsPlan.placeholders} must be substituted with the
   * real id resolved from an earlier stage's `idRef` before sending.
   */
  query: PaveQuery;
  /**
   * The placeholder string used in this op's `parentCostGroupId` /
   * `costGroupId` (refers to a prior op's `idRef`), or null for ops that target
   * the job directly (top-level room groups).
   */
  dependsOn: string | null;
}

/**
 * The ordered, staged plan for pushing a full budget into an EXISTING job.
 *
 * JobTread create ops cannot reference ids that don't exist yet, so a flat
 * single-call op array won't work for nested groups. The caller must run the
 * stages IN ORDER, and after each op resolve its created id (keyed by `idRef`)
 * so the next stage's placeholder references can be substituted:
 *
 *   Stage 1 — `roomGroups`: `createCostGroup` per room, `jobId = opts.jobId`,
 *             `parentCostGroupId = null`. Each yields a room group id.
 *   Stage 2 — `tradeGroups`: `createCostGroup` per trade, `jobId = opts.jobId`,
 *             `parentCostGroupId = <placeholder for its room's idRef>`.
 *   Stage 3 — `costItems`: `createCostItem` per line,
 *             `costGroupId = <placeholder for its trade's idRef>`.
 *
 * `placeholders` maps every `idRef` to the literal placeholder string used in
 * downstream ops, so the caller can do a direct value-swap once it knows the
 * real id. Placeholders are of the form `"$ref:<idRef>"` and never collide with
 * real JobTread ids.
 */
export interface ExistingJobCostItemsPlan {
  jobId: string;
  /** Stage 1: room-level `createCostGroup` ops (parent = null, target = job). */
  roomGroups: PlannedOp[];
  /** Stage 2: trade-level `createCostGroup` ops (parent = a room group). */
  tradeGroups: PlannedOp[];
  /** Stage 3: `createCostItem` ops (target = a trade group). */
  costItems: PlannedOp[];
  /** Map of every `idRef` → the placeholder token used to reference it. */
  placeholders: Record<string, string>;
}

/** Build the placeholder token for an idRef (used in downstream op inputs). */
function refPlaceholder(idRef: string): string {
  return `$ref:${idRef}`;
}

let _refSeq = 0;
/** Deterministic-within-a-call unique idRef generator. */
function nextRef(prefix: string): string {
  _refSeq += 1;
  return `${prefix}:${_refSeq}`;
}

/**
 * Build the staged op plan for pushing the budget into an existing job
 * (`opts.jobId`). Returns an {@link ExistingJobCostItemsPlan} wrapped in a
 * `PaveQuery` shape (so it satisfies the {@link BuildExistingJobCostItemsFn}
 * signature) — the caller reads `.__plan` to drive the staged sequencing.
 *
 * The returned object is NOT a single sendable query: existing-job pushes are
 * inherently multi-call because nested group ids don't exist until their parent
 * op runs. The plan documents the ordering dependencies explicitly:
 *
 *   1. Send every `roomGroups[i].query`; record `createdCostGroup.id` under
 *      `roomGroups[i].idRef`.
 *   2. For each `tradeGroups[i]`, substitute its `dependsOn` placeholder in
 *      `query.createCostGroup.$.parentCostGroupId` with the real room group id,
 *      send it, record the id under `tradeGroups[i].idRef`.
 *   3. For each `costItems[i]`, substitute its `dependsOn` placeholder in
 *      `query.createCostItem.$.costGroupId` with the real trade group id, send.
 *
 * Each op requests the created node's id back (`createdCostGroup.id` /
 * `createdCostItem.id`) so the caller can thread ids forward.
 *
 * Hollow trade groups (no items) and hollow rooms (no non-empty trades) are
 * skipped, matching {@link buildCreateJobPayload}.
 */
export function buildExistingJobCostItems(
  tree: JobTreadBudgetTree,
  opts: BuildExistingJobOptions,
): PaveQuery {
  const { jobId, resolver } = opts;

  // Reset the per-call ref sequence so idRefs are deterministic per invocation.
  _refSeq = 0;

  const roomGroups: PlannedOp[] = [];
  const tradeGroups: PlannedOp[] = [];
  const costItems: PlannedOp[] = [];
  const placeholders: Record<string, string> = {};

  for (const room of tree.rooms) {
    // Pre-scan: does this room have any non-empty trade? Skip hollow rooms.
    const nonEmptyTrades = [...room.trades]
      .sort(bySortOrder)
      .filter((t) => t.items.length > 0);
    if (nonEmptyTrades.length === 0) continue;

    const roomRef = nextRef("room");
    placeholders[roomRef] = refPlaceholder(roomRef);

    roomGroups.push({
      idRef: roomRef,
      dependsOn: null,
      query: {
        createCostGroup: {
          $: {
            jobId,
            name: room.roomName,
            parentCostGroupId: null,
          },
          createdCostGroup: { id: {} },
        },
      },
    });

    for (const trade of nonEmptyTrades) {
      const tradeRef = nextRef("trade");
      placeholders[tradeRef] = refPlaceholder(tradeRef);

      tradeGroups.push({
        idRef: tradeRef,
        dependsOn: roomRef,
        query: {
          createCostGroup: {
            $: {
              jobId,
              name: trade.tradeName,
              // Placeholder — caller swaps for the real room group id.
              parentCostGroupId: refPlaceholder(roomRef),
            },
            createdCostGroup: { id: {} },
          },
        },
      });

      for (const item of [...trade.items].sort(bySortOrder)) {
        const itemRef = nextRef("item");
        costItems.push({
          idRef: itemRef,
          dependsOn: tradeRef,
          query: {
            createCostItem: {
              $: buildCostItemInput(item, trade, resolver, {
                // Placeholder — caller swaps for the real trade group id.
                costGroupId: refPlaceholder(tradeRef),
              }),
              createdCostItem: { id: {} },
            },
          },
        });
      }
    }
  }

  const plan: ExistingJobCostItemsPlan = {
    jobId,
    roomGroups,
    tradeGroups,
    costItems,
    placeholders,
  };

  // Returned under `__plan` so the object satisfies PaveQuery while signalling
  // (via the absence of a top-level op key) that it is a multi-stage plan, not
  // a single sendable query.
  return { __plan: plan };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/** Stable ascending sort by `sortOrder`. */
function bySortOrder(
  a: { sortOrder: number },
  b: { sortOrder: number },
): number {
  return a.sortOrder - b.sortOrder;
}

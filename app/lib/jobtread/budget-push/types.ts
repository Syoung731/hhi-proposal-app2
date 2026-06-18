/**
 * Shared contracts for the "template-overlay" JobTread budget push.
 *
 * This file is the single source of truth for the data model and the EXACT
 * function signatures that the sibling modules under
 * `app/lib/jobtread/budget-push/` implement against. It is pure types +
 * signature aliases — NO runtime logic lives here.
 *
 * # The template-overlay model (see docs/jobtread-write-plan.md)
 * Per Room, the pushed budget is built as:
 *   1. TEMPLATE_SCAFFOLD — every `RoomTemplateTradeGroup` → every
 *      `RoomTemplateItem`, emitted at quantity 0 / $0 so JobTread shows the
 *      complete estimator checklist even for trades the estimate didn't use.
 *   2. ESTIMATE — each `EstimateLineItem` matched onto its scaffold item
 *      (`catalogItemId` → `jobtreadItemId` → name) fills in quantity,
 *      unitCost, unitPrice (the scaffold line is "overlaid", not duplicated).
 *   3. EXTRA — estimate lines with no template match (custom AI items,
 *      engineering-assembly lines) appended under their trade group.
 *
 * # JobTread shape mirrored by the tree
 *   Room  → top-level CostGroup (parentCostGroup = null), named `Room.name`
 *   Trade → child CostGroup under the room (`tradeName` / `jobtreadGroupId`)
 *   Line  → CostItem (`name`, `quantity`, `unitId`, `unitCost`, `unitPrice`,
 *           `costCodeId`, `costTypeId`, `allowanceType`)
 *
 * # Field grounding (real Prisma models)
 *   Room(230)                  → roomId, roomName(name), isProjectOverhead,
 *                                sectionType.category(SectionCategory),
 *                                roomTemplateId
 *   RoomTemplateTradeGroup(1117) → tradeName(name), jobtreadGroupId, sortOrder
 *   RoomTemplateItem(1131)     → templateItemId(id), jobtreadItemId, costCode,
 *                                costType, sortOrder
 *   EstimateLineItem(1179)     → estimateLineItemId(id), name, quantity, unit,
 *                                unitCost, unitPrice, tradeGroup, source,
 *                                catalogItemId, sortOrder
 *   PricingCatalogItem(1075)   → jobtreadId, costCode, costType, unit
 *
 * # Pricing on a pushed line
 * JobTread has no per-line low/high range. We push the TARGET only:
 * `unitPrice` (estimate `unitPrice`) and `unitCost` (estimate `unitCost`).
 * Scaffold-only lines carry quantity 0 with the template's costs (typically 0).
 */

import "server-only";

// ---------------------------------------------------------------------------
// Line source
// ---------------------------------------------------------------------------

/**
 * Where a pushed cost item originated in the template-overlay merge.
 *
 * - `TEMPLATE_SCAFFOLD` — a `RoomTemplateItem` with no matching estimate line;
 *   emitted at quantity 0 / $0 so the full template appears in JobTread.
 * - `ESTIMATE` — a `RoomTemplateItem` that an `EstimateLineItem` matched and
 *   filled in (quantity/unitCost/unitPrice come from the estimate).
 * - `EXTRA` — an `EstimateLineItem` with no template match, appended under its
 *   trade group (custom AI items, engineering-assembly lines).
 */
export type JTLineSource = "TEMPLATE_SCAFFOLD" | "ESTIMATE" | "EXTRA";

// ---------------------------------------------------------------------------
// Tree node types (the pure, in-memory merge result)
// ---------------------------------------------------------------------------

/**
 * One pushed cost item — the leaf of the budget tree. Maps to a JobTread
 * CostItem. Money/quantity fields are the values we will write; the `*Id`
 * fields are the resolved JobTread references.
 */
export interface JTCostItem {
  /** CostItem name, e.g. "[FRM] Wall Framing - Material". */
  name: string;
  /** Pushed quantity. `TEMPLATE_SCAFFOLD` lines are always 0. */
  quantity: number;
  /** Unit abbreviation, e.g. "SF" / "LF" / "EA". */
  unit: string;
  /** Per-unit cost (target). Scaffold-only lines are typically 0. */
  unitCost: number;
  /** Per-unit client price (target). Scaffold-only lines are typically 0. */
  unitPrice: number;
  /** Human-readable cost code name, e.g. "Framing - Material" (null if unresolved). */
  costCodeName: string | null;
  /** Resolved JobTread costCode id (null if unresolved — push UI must verify). */
  costCodeId: string | null;
  /** Human-readable cost type name, e.g. "Materials" / "Labor" (null if unresolved). */
  costTypeName: string | null;
  /** Resolved JobTread costType id (null if unresolved — push UI must verify). */
  costTypeId: string | null;
  /**
   * How the cost code was resolved (set during the resolve pass). The push
   * modal flags anything that isn't `template-exact` for per-line verify —
   * `fallback` (Misc-defaulted) / `fuzzy` / `unmatched` need a human choice.
   */
  costCodeMatchKind?: CostCodeMatchKind;
  /**
   * JobTread allowance type, set when the source estimate line had
   * `source === "ALLOWANCE"`. Null for normal lines.
   */
  allowanceType: string | null;
  /** Provenance of this line within the template-overlay merge. */
  lineSource: JTLineSource;
  /**
   * `RoomTemplateItem.id` this line came from / was overlaid onto.
   * Present for `TEMPLATE_SCAFFOLD` and `ESTIMATE`; absent for `EXTRA`.
   */
  templateItemId?: string;
  /**
   * `EstimateLineItem.id` that supplied the quantity/pricing.
   * Present for `ESTIMATE` and `EXTRA`; absent for pure `TEMPLATE_SCAFFOLD`.
   */
  estimateLineItemId?: string;
  /**
   * JobTread org-catalog cost item id (`RoomTemplateItem.jobtreadItemId` /
   * `PricingCatalogItem.jobtreadId`) used to link the pushed item back to the
   * catalog via `organizationCostItemId`/`sourceCostItemId`. Null when the
   * line has no catalog ancestry (most `EXTRA` lines).
   */
  jobtreadItemId?: string | null;
  /** Stable display/sort order within the trade group. */
  sortOrder: number;
}

/**
 * One trade group within a room. Maps to a child JobTread CostGroup.
 */
export interface JTTradeGroup {
  /** Trade name, e.g. "Framing" — becomes the child CostGroup name. */
  tradeName: string;
  /**
   * `RoomTemplateTradeGroup.jobtreadGroupId` when this trade came from the
   * template scaffold; null for trades that exist only in the estimate
   * (an all-`EXTRA` trade group).
   */
  jobtreadGroupId: string | null;
  /** Cost items in this trade, scaffold + overlaid + extras, in sort order. */
  items: JTCostItem[];
  /** Stable display/sort order within the room. */
  sortOrder: number;
}

/**
 * One room. Maps to a top-level JobTread CostGroup (parentCostGroup = null),
 * named `roomName`.
 */
export interface JTRoomGroup {
  /** `Room.id`. */
  roomId: string;
  /** `Room.name` — becomes the top-level CostGroup name. */
  roomName: string;
  /**
   * `Room.sectionType.category` (SectionCategory: INTERIOR / EXTERIOR /
   * ADDITION / …). Drives interior-vs-exterior handling. Null when the room
   * has no section type.
   */
  sectionCategory: string | null;
  /**
   * True when the room has an assigned `RoomTemplate` and a scaffold was
   * built. False = estimate-only fallback (e.g. an exterior room before the
   * Template Builder authors exterior templates) — surfaced in the push summary.
   */
  hasTemplate: boolean;
  /** `Room.isProjectOverhead` — COPE rooms render last / separated. */
  isProjectOverhead: boolean;
  /** Trade groups in this room, in sort order. */
  trades: JTTradeGroup[];
}

/**
 * The full merge result for a project — the pure, in-memory budget tree that
 * the Pave payload builders consume. No JobTread job/account/location is
 * referenced here; linkage is supplied later via the payload-builder opts.
 */
export interface JobTreadBudgetTree {
  /** `Project.id`. */
  projectId: string;
  /** Rooms with pushable content, COPE rooms last. */
  rooms: JTRoomGroup[];
  /**
   * Names of rooms that have an estimate but no usable `RoomTemplate`
   * scaffold (estimate-only fallback). For the push summary.
   */
  roomsWithoutTemplate: string[];
  /**
   * Names of rooms skipped entirely because they had no `AIEstimate`
   * (matches `assembleProjectBudget()` exclusion). For the push summary.
   */
  roomsWithoutEstimate: string[];
}

// ---------------------------------------------------------------------------
// Cost-code resolution
// ---------------------------------------------------------------------------

/**
 * How a cost code / cost type was resolved for a line.
 *
 * - `template-exact` — the line carried an authoritative template cost code
 *   (`RoomTemplateItem.costCode` / `.costType`) that matched a live JobTread
 *   costCode/costType by name. Highest confidence.
 * - `fuzzy` — no template code (an `EXTRA` line); resolved by fuzzy-matching
 *   the trade name + Material/Install/Sub hint against the live costCode list.
 *   The push UI shows these for per-line verify/override.
 * - `fallback` — nothing matched, so defaulted to the "Misc" cost code (by cost
 *   type) so the line is still pushable; the push UI flags these for review.
 * - `unmatched` — not even a Misc fallback was available; ids are null and the
 *   push UI must require a manual selection before sending.
 */
export type CostCodeMatchKind = "template-exact" | "fuzzy" | "fallback" | "unmatched";

/**
 * Resolved JobTread cost code + cost type for a single line.
 */
export interface CostCodeResolution {
  /** Resolved JobTread costCode id, or null if unmatched. */
  costCodeId: string | null;
  /** Resolved JobTread costCode name, e.g. "Framing - Material", or null. */
  costCodeName: string | null;
  /** Resolved JobTread costType id, e.g. Materials = 22P3uKbGc5bR, or null. */
  costTypeId: string | null;
  /** Resolved JobTread costType name, e.g. "Materials", or null. */
  costTypeName: string | null;
  /** Match confidence in [0, 1]. 1 = exact; lower for fuzzy; 0 = unmatched. */
  confidence: number;
  /** How the match was produced. */
  matchKind: CostCodeMatchKind;
}

/**
 * A reusable resolver over the live JobTread costCode/costType catalog.
 * Built once (the catalog fetch is the expensive part) and then queried
 * synchronously per line.
 */
export interface CostCodeResolver {
  /**
   * Resolve a cost code + cost type for one line.
   *
   * @param tradeName             Trade label, e.g. "Framing".
   * @param costTypeHint          Whether the line is Material / Install (labor) /
   *                              Sub, derived from the " - Material"/" - Install"
   *                              name suffix or the structured costType. Null
   *                              when unknown.
   * @param templateCostCodeName  Authoritative `RoomTemplateItem.costCode` when
   *                              present — preferred over fuzzy matching.
   * @param templateCostTypeName  Authoritative `RoomTemplateItem.costType` when
   *                              present.
   */
  resolve(
    tradeName: string,
    costTypeHint: CostTypeHint,
    templateCostCodeName?: string | null,
    templateCostTypeName?: string | null,
  ): CostCodeResolution;
}

/** The Material vs Install (labor) vs Sub distinction for a line. */
export type CostTypeHint = "Material" | "Install" | "Sub" | null;

// ---------------------------------------------------------------------------
// Pave payload types
// ---------------------------------------------------------------------------

/**
 * An opaque Pave query object — the INNER object passed to `jobTreadRequest`,
 * i.e. WITHOUT the outer `{ query: { $: { grantKey }, ... } }` wrapper that
 * the client adds. A write op is just a named node (e.g. `createJob`) with
 * inputs under `$` and requested return fields as siblings.
 *
 * Kept loose on purpose: the builders compose nested create ops whose exact
 * shape varies; `jobTreadRequest(query)` accepts an arbitrary query object.
 */
export type PaveQuery = Record<string, unknown>;

/** Options for building a `createJob` payload (new job + full budget in one call). */
export interface BuildCreateJobOptions {
  /** REQUIRED JobTread location id the new job hangs off. */
  locationId: string;
  /** Job name (JobTread max 30 chars — caller is responsible for truncation). */
  name: string;
  /** Job number (natural upsert key). Optional. */
  number?: string;
  /**
   * Value for the "Job Stage" custom field (id 22P5KyX5Me24), e.g.
   * "Design Contract" / "Build". Optional; omitted = JobTread default.
   */
  jobStageValue?: string;
  /** Resolver used to fill costCodeId/costTypeId on every line. */
  resolver: CostCodeResolver;
}

/** Options for building cost-item writes targeting an EXISTING job's budget. */
export interface BuildExistingJobOptions {
  /** The existing JobTread job id to push the budget into. */
  jobId: string;
  /** Resolver used to fill costCodeId/costTypeId on every line. */
  resolver: CostCodeResolver;
}

// ---------------------------------------------------------------------------
// Implemented-elsewhere function signatures (import these to implement against)
// ---------------------------------------------------------------------------

/**
 * Implemented in `merge.ts`. Builds the template-overlay budget tree for a
 * project: loads each room's `RoomTemplate` scaffold, overlays the latest
 * `AIEstimate` line items, appends extras, and orders COPE last.
 */
export type BuildJobTreadBudgetTreeFn = (
  projectId: string,
) => Promise<JobTreadBudgetTree>;

/**
 * Implemented in `cost-code-resolver.ts`. Fetches the live JobTread
 * costCode/costType catalog once and returns a synchronous resolver.
 */
export type CreateCostCodeResolverFn = () => Promise<CostCodeResolver>;

/**
 * Implemented in `pave-payload.ts`. Builds the inner Pave query for a
 * `createJob` op that creates a new job under `opts.locationId` and writes the
 * entire Room > Trade > Item budget via nested `lineItems` in one call.
 * Returns the inner object (no `{query:{$:{grantKey}}}` wrapper).
 */
export type BuildCreateJobPayloadFn = (
  tree: JobTreadBudgetTree,
  opts: BuildCreateJobOptions,
) => PaveQuery;

/**
 * Implemented in `pave-payload.ts`. Builds the inner Pave query that writes
 * the budget into an EXISTING job (`createCostGroup` + `createCostItem`
 * batches targeting `opts.jobId`). Returns the inner object (no wrapper).
 */
export type BuildExistingJobCostItemsFn = (
  tree: JobTreadBudgetTree,
  opts: BuildExistingJobOptions,
) => PaveQuery;

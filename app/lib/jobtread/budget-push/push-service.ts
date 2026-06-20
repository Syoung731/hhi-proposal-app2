/**
 * JobTread budget-push WRITE service (Phase 2).
 *
 * ⚠️ This module ISSUES JobTread writes. Per CLAUDE.md, JobTread is read-only by
 * default — these run only from the explicit, admin-gated push flow.
 *
 * Write shapes were verified live (throwaway-job test, 2026-06-18):
 *   - create-op responses nest the return under the op name: `raw[op][createdX]`.
 *   - createJob accepts `customFieldValues: { [fieldId]: value }` (Job Stage).
 *   - `createJob.lineItems` (one-call budget) could NOT be cracked, so budgets
 *     are built via the proven two-step path: createCostGroup → createCostItem.
 */
import "server-only";

import { prisma } from "@/app/lib/prisma";
import { jobTreadRequest } from "@/app/lib/jobtread/client";
import { getOrgId } from "@/app/lib/jobtread/catalog-api";
import { mapWithConcurrency } from "@/app/lib/async-pool";
import { JOBTREAD_INTERNAL_NOTES_FIELD_ID, type JobTreadBudgetTree } from "./types";

/** "Job Stage" custom-field id (confirmed live). */
export const JOB_STAGE_FIELD_ID = "22P5KyX5Me24";
/** Valid Job Stage option values (confirmed live). */
export const JOB_STAGE_OPTIONS = [
  "Design Contract", "Design", "Build", "FAST", "Punch",
  "Work Complete", "Warranty", "Warranty Issue", "Build Lost", "Legal", "Archived",
] as const;

/**
 * Cost-item creation MUST be serial. JobTread rejects concurrent `createCostItem`
 * calls under the same cost group with HTTP 400 (auto-sortOrder / row-lock
 * collision) — verified live: concurrency 4 failed ~60% of items on a 153-line
 * push, concurrency 1 succeeded 100%. Do NOT raise this without re-verifying.
 */
const ITEM_CONCURRENCY = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Response helpers ─────────────────────────────────────────────────────────

/** Create-op return is nested under the op name: `{ createX: { createdX: {...} } }`. */
function createdId(raw: any, op: string, ret: string): string {
  const node = (raw?.data ?? raw)?.[op]?.[ret];
  const id = node?.id;
  if (typeof id !== "string" || !id) {
    throw new Error(`JobTread ${op}: no id returned (${JSON.stringify(raw).slice(0, 200)})`);
  }
  return id;
}
/** Read-op result is the field at the top level: `{ job: {...} }`. */
function readField(raw: any, name: string): any {
  return (raw?.data ?? raw)?.[name];
}
function str(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ── Write primitives ─────────────────────────────────────────────────────────

export async function jtCreateAccount(name: string): Promise<string> {
  const orgId = await getOrgId();
  const raw = await jobTreadRequest(
    { createAccount: { $: { organizationId: orgId, name, type: "customer", suffixIfNecessary: true }, createdAccount: { id: {} } } },
    { step: "createAccount" },
  );
  return createdId(raw, "createAccount", "createdAccount");
}

export async function jtCreateLocation(
  accountId: string,
  opts: { name?: string | null; address?: string | null },
): Promise<string> {
  const $: Record<string, unknown> = { accountId };
  if (opts.name?.trim()) $.name = opts.name.trim();
  if (opts.address?.trim()) $.address = opts.address.trim();
  const raw = await jobTreadRequest(
    { createLocation: { $, createdLocation: { id: {} } } },
    { step: "createLocation" },
  );
  return createdId(raw, "createLocation", "createdLocation");
}

export async function jtCreateJob(opts: {
  locationId: string;
  name: string;
  number?: string | null;
  jobStage?: string | null;
}): Promise<{ id: string; number: string | null }> {
  const $: Record<string, unknown> = {
    locationId: opts.locationId,
    name: opts.name.slice(0, 30), // JobTread caps job name at 30 chars
  };
  if (opts.number?.trim()) $.number = opts.number.trim();
  if (opts.jobStage?.trim()) $.customFieldValues = { [JOB_STAGE_FIELD_ID]: opts.jobStage.trim() };
  const raw = await jobTreadRequest(
    { createJob: { $, createdJob: { id: {}, number: {} } } },
    { step: "createJob" },
  );
  const node = (raw as any)?.data?.createJob?.createdJob ?? (raw as any)?.createJob?.createdJob;
  const id = node?.id;
  if (typeof id !== "string" || !id) throw new Error("createJob: no id returned");
  return { id, number: str(node?.number) };
}

export async function jtCreateCostGroup(opts: {
  jobId: string;
  name: string;
  parentCostGroupId?: string | null;
}): Promise<string> {
  const $: Record<string, unknown> = { jobId: opts.jobId, name: opts.name.slice(0, 250) };
  if (opts.parentCostGroupId) $.parentCostGroupId = opts.parentCostGroupId;
  const raw = await jobTreadRequest(
    { createCostGroup: { $, createdCostGroup: { id: {} } } },
    { step: "createCostGroup" },
  );
  return createdId(raw, "createCostGroup", "createdCostGroup");
}

export async function jtCreateCostItem(opts: {
  costGroupId: string;
  name: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  costCodeId?: string | null;
  costTypeId?: string | null;
  description?: string | null;
  /** AI estimator notes → JobTread cost-item "Internal Notes" custom field. */
  notes?: string | null;
  /** JobTread allowance type ("costAndFee"/"price") for ALLOWANCE lines; null = normal. */
  allowanceType?: string | null;
}): Promise<string> {
  const $: Record<string, unknown> = {
    costGroupId: opts.costGroupId,
    name: opts.name.slice(0, 250),
    quantity: opts.quantity,
    unitCost: opts.unitCost,
    unitPrice: opts.unitPrice,
  };
  if (opts.costCodeId) $.costCodeId = opts.costCodeId;
  if (opts.costTypeId) $.costTypeId = opts.costTypeId;
  if (opts.allowanceType?.trim()) $.allowanceType = opts.allowanceType.trim();
  if (opts.description?.trim()) $.description = opts.description.trim();
  // Write the AI notes into the "Internal Notes" custom field (confirmed live:
  // createCostItem accepts customFieldValues keyed by field id).
  if (opts.notes?.trim()) {
    $.customFieldValues = { [JOBTREAD_INTERNAL_NOTES_FIELD_ID]: opts.notes.trim() };
  }
  const raw = await jobTreadRequest(
    { createCostItem: { $, createdCostItem: { id: {} } } },
    { step: "createCostItem" },
  );
  return createdId(raw, "createCostItem", "createdCostItem");
}

export async function jtDeleteJob(id: string): Promise<void> {
  await jobTreadRequest({ deleteJob: { $: { id } } }, { step: "deleteJob" });
}
export async function jtDeleteLocation(id: string): Promise<void> {
  await jobTreadRequest({ deleteLocation: { $: { id } } }, { step: "deleteLocation" });
}
export async function jtDeleteAccount(id: string): Promise<void> {
  await jobTreadRequest({ deleteAccount: { $: { id } } }, { step: "deleteAccount" });
}
export async function jtDeleteCostGroup(id: string): Promise<void> {
  await jobTreadRequest({ deleteCostGroup: { $: { id } } }, { step: "deleteCostGroup" });
}
export async function jtDeleteCostItem(id: string): Promise<void> {
  await jobTreadRequest({ deleteCostItem: { $: { id } } }, { step: "deleteCostItem" });
}

// ── Lookups (read) — for the push modal ──────────────────────────────────────

export interface JTJobLite { id: string; name: string; number: string | null; closedOn: string | null; }
export interface JTLocationLite { id: string; name: string | null; jobs: JTJobLite[]; }
export interface JTCustomerLite { id: string; name: string; }

/**
 * Customer accounts that are NOT archived AND have at least one OPEN job
 * (a job with `closedOn == null`) — mirrors JobTread's "Archived At does not
 * exist" + "Open Jobs > 0" filter. id + name, paginated, name-sorted.
 */
export async function listCustomers(): Promise<JTCustomerLite[]> {
  const orgId = await getOrgId();
  const out: JTCustomerLite[] = [];
  let page: string | null = null;
  let guard = 0;
  do {
    const raw: any = await jobTreadRequest(
      {
        organization: {
          $: { id: orgId },
          accounts: {
            $: { size: 100, where: ["type", "customer"], ...(page ? { page } : {}) },
            nextPage: {},
            nodes: {
              id: {},
              name: {},
              archivedAt: {},
              // open-job count for this account (jobs with no closedOn)
              openJobs: { _: "jobs", $: { where: ["closedOn", null] }, count: {} },
            },
          },
        },
      },
      { step: "listCustomers" },
    );
    const acc = readField(raw, "organization")?.accounts;
    for (const n of acc?.nodes ?? []) {
      const id = str(n?.id), name = str(n?.name);
      const openJobs = Number(n?.openJobs?.count ?? 0);
      // Active (not archived) AND has at least one open job.
      if (id && name && !str(n?.archivedAt) && openJobs > 0) out.push({ id, name });
    }
    page = str(acc?.nextPage);
    guard += 1;
  } while (page && guard < 40);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A customer's locations + their jobs. */
export async function listCustomerJobs(accountId: string): Promise<JTLocationLite[]> {
  const raw: any = await jobTreadRequest(
    { organization: { $: { id: await getOrgId() }, accounts: { $: { size: 1, where: ["id", accountId] }, nodes: { locations: { nodes: { id: {}, name: {}, jobs: { nodes: { id: {}, name: {}, number: {}, closedOn: {} } } } } } } } },
    { step: "listCustomerJobs" },
  );
  const node = readField(raw, "organization")?.accounts?.nodes?.[0];
  const locs: JTLocationLite[] = [];
  for (const l of node?.locations?.nodes ?? []) {
    const id = str(l?.id);
    if (!id) continue;
    locs.push({
      id,
      name: str(l?.name),
      jobs: (l?.jobs?.nodes ?? [])
        .map((j: any) => ({ id: str(j?.id), name: str(j?.name) ?? "(unnamed)", number: str(j?.number), closedOn: str(j?.closedOn) }))
        // Active jobs only — a closed (completed) job has closedOn set.
        .filter((j: JTJobLite) => j.id && !j.closedOn),
    });
  }
  return locs;
}

// ── Push linkage / re-push helpers ───────────────────────────────────────────

export interface ProjectPushLinkage {
  /** The JobTread job this project's budget was pushed to (null = never pushed). */
  jobtreadJobId: string | null;
  jobtreadJobNumber: string | null;
  jobtreadAccountId: string | null;
  jobtreadLocationId: string | null;
  /** When the budget was last pushed/locked (ISO), or null. */
  lockedAt: string | null;
  /** How many cost groups / items WE created (tracked in JobTreadPushedItem). */
  pushedGroupCount: number;
  pushedItemCount: number;
}

/** Current JobTread push linkage + counts of what we created. Read-only. */
export async function getProjectPushLinkage(
  projectId: string,
): Promise<ProjectPushLinkage> {
  const [project, grouped] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        jobtreadJobId: true,
        jobtreadJobNumber: true,
        jobtreadAccountId: true,
        jobtreadLocationId: true,
        jobtreadBudgetLockedAt: true,
      },
    }),
    prisma.jobTreadPushedItem.groupBy({
      by: ["kind"],
      where: { projectId },
      _count: { _all: true },
    }),
  ]);
  const countOf = (k: string) =>
    grouped.find((g) => g.kind === k)?._count._all ?? 0;
  return {
    jobtreadJobId: project?.jobtreadJobId ?? null,
    jobtreadJobNumber: project?.jobtreadJobNumber ?? null,
    jobtreadAccountId: project?.jobtreadAccountId ?? null,
    jobtreadLocationId: project?.jobtreadLocationId ?? null,
    lockedAt: project?.jobtreadBudgetLockedAt
      ? project.jobtreadBudgetLockedAt.toISOString()
      : null,
    pushedGroupCount: countOf("COST_GROUP"),
    pushedItemCount: countOf("COST_ITEM"),
  };
}

/**
 * Delete every JobTread cost group we previously created for this project, then
 * clear our local JobTreadPushedItem records. Deleting a parent (room) cost
 * group cascades to its child trade groups + items (verified live), so deleting
 * the tracked groups removes our whole budget; per-id errors are ignored (a
 * child already removed by an ancestor's cascade returns a 404). Manual JobTread
 * additions are left untouched. Used by the Overwrite re-push path.
 */
export async function deletePushedEntities(
  projectId: string,
): Promise<{ deletedGroups: number }> {
  const groups = await prisma.jobTreadPushedItem.findMany({
    where: { projectId, kind: "COST_GROUP" },
    select: { jobtreadId: true },
  });
  for (const g of groups) {
    await jtDeleteCostGroup(g.jobtreadId).catch(() => {}); // ignore cascade 404s
  }
  await prisma.jobTreadPushedItem.deleteMany({ where: { projectId } });
  return { deletedGroups: groups.length };
}

/**
 * Clear our local push linkage + records WITHOUT touching JobTread. For "start
 * over" when the JobTread job was deleted outside the app — there's nothing left
 * to delete there, we just forget the stale link so the project can push fresh.
 */
export async function clearProjectPushLinkage(projectId: string): Promise<void> {
  await prisma.$transaction([
    prisma.jobTreadPushedItem.deleteMany({ where: { projectId } }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        jobtreadJobId: null,
        jobtreadJobNumber: null,
        jobtreadAccountId: null,
        jobtreadLocationId: null,
        jobtreadBudgetLockedAt: null,
      },
    }),
  ]);
}

// ── Budget push (two-step: cost groups → cost items) ─────────────────────────

export interface PushBudgetResult {
  jobId: string;
  groupCount: number;
  itemCount: number;
}

/**
 * Create the full Room > Trade > Item budget on an existing JobTread job, then
 * record what we created (for re-push Overwrite) and set the project's push lock.
 * The tree's costCodeId/costTypeId must already be resolved by the caller.
 *
 * Rollback: if any create OR the final DB record throws, every JobTread entity
 * created during this run is deleted before re-throwing, so a failed push never
 * orphans a partial budget on the job.
 *
 * Re-push modes (`opts.overwrite`):
 *   - false/undefined → first push OR Append (just creates + records; existing
 *     JobTreadPushedItem rows from a prior push are kept so a later Overwrite
 *     removes both).
 *   - true → Overwrite: delete the groups/items WE previously created (cascade,
 *     keeping manual JobTread edits) before re-creating from the current tree.
 */
export async function pushBudgetToJob(
  projectId: string,
  jobId: string,
  tree: JobTreadBudgetTree,
  linkage: { accountId?: string | null; locationId?: string | null; jobNumber?: string | null },
  opts?: {
    overwrite?: boolean;
    /** Progress callback fired after each trade's items are created (cumulative counts). */
    onProgress?: (p: { groups: number; items: number }) => void | Promise<void>;
  },
): Promise<PushBudgetResult> {
  // Overwrite: remove our prior cost groups/items (and their records) first.
  if (opts?.overwrite) {
    await deletePushedEntities(projectId);
  }

  const createdGroupIds: string[] = [];
  const createdItemIds: string[] = [];

  try {
    for (const room of tree.rooms) {
      const roomGroupId = await jtCreateCostGroup({ jobId, name: room.roomName });
      createdGroupIds.push(roomGroupId);

      for (const trade of room.trades) {
        const tradeGroupId = await jtCreateCostGroup({ jobId, name: trade.tradeName, parentCostGroupId: roomGroupId });
        createdGroupIds.push(tradeGroupId);

        const ids = await mapWithConcurrency(trade.items, ITEM_CONCURRENCY, (item) =>
          jtCreateCostItem({
            costGroupId: tradeGroupId,
            name: item.name,
            quantity: item.quantity,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            costCodeId: item.costCodeId,
            costTypeId: item.costTypeId,
            description: item.unit ? `Unit: ${item.unit}` : null,
            notes: item.notes,
            allowanceType: item.allowanceType,
          }),
        );
        createdItemIds.push(...ids);

        if (opts?.onProgress) {
          await opts.onProgress({
            groups: createdGroupIds.length,
            items: createdItemIds.length,
          });
        }
      }
    }

    // Record created entities + set the linkage/lock atomically.
    await prisma.$transaction([
      prisma.jobTreadPushedItem.createMany({
        data: [
          ...createdGroupIds.map((id) => ({ projectId, jobtreadId: id, kind: "COST_GROUP" })),
          ...createdItemIds.map((id) => ({ projectId, jobtreadId: id, kind: "COST_ITEM" })),
        ],
      }),
      prisma.project.update({
        where: { id: projectId },
        data: {
          jobtreadJobId: jobId,
          jobtreadJobNumber: linkage.jobNumber ?? undefined,
          jobtreadAccountId: linkage.accountId ?? undefined,
          jobtreadLocationId: linkage.locationId ?? undefined,
          jobtreadBudgetLockedAt: new Date(),
        },
      }),
    ]);
  } catch (err) {
    // Roll back THIS run's JobTread writes so a failed push (or a failed DB
    // record after the writes landed) leaves no orphaned job budget. Every
    // created item lives under a group in createdGroupIds, so deleting those
    // groups cascades the items too (cascade verified live). Best-effort: ignore
    // delete errors so we never mask the original failure (a child already
    // removed by an ancestor's cascade returns 404).
    for (const groupId of createdGroupIds) {
      await jtDeleteCostGroup(groupId).catch(() => {});
    }
    throw err;
  }

  return { jobId, groupCount: createdGroupIds.length, itemCount: createdItemIds.length };
}

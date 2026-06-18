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
import type { JobTreadBudgetTree } from "./types";

/** "Job Stage" custom-field id (confirmed live). */
export const JOB_STAGE_FIELD_ID = "22P5KyX5Me24";
/** Valid Job Stage option values (confirmed live). */
export const JOB_STAGE_OPTIONS = [
  "Design Contract", "Design", "Build", "FAST", "Punch",
  "Work Complete", "Warranty", "Warranty Issue", "Build Lost", "Legal", "Archived",
] as const;

/** Bounded concurrency for cost-item creation (JobTread rate limits unpublished). */
const ITEM_CONCURRENCY = 4;

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
  if (opts.description?.trim()) $.description = opts.description.trim();
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

// ── Budget push (two-step: cost groups → cost items) ─────────────────────────

export interface PushBudgetResult {
  jobId: string;
  groupCount: number;
  itemCount: number;
}

/**
 * Create the full Room > Trade > Item budget on an existing JobTread job, then
 * record what we created (for Phase-3 Overwrite) and set the project's push lock.
 * The tree's costCodeId/costTypeId must already be resolved by the caller.
 */
export async function pushBudgetToJob(
  projectId: string,
  jobId: string,
  tree: JobTreadBudgetTree,
  linkage: { accountId?: string | null; locationId?: string | null; jobNumber?: string | null },
): Promise<PushBudgetResult> {
  const createdGroupIds: string[] = [];
  const createdItemIds: string[] = [];

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
        }),
      );
      createdItemIds.push(...ids);
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

  return { jobId, groupCount: createdGroupIds.length, itemCount: createdItemIds.length };
}

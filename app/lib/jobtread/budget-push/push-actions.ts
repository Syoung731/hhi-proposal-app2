"use server";

/**
 * Server actions for the "Push to JobTread" modal.
 *
 * ⚠️ These actions ISSUE JobTread writes (create account/location/job + push
 * budget). Per CLAUDE.md, JobTread is read-only by default — every action here
 * is admin-gated (`await requireAdmin()` first) and runs only from the explicit,
 * human-driven push flow in `PushToJobTreadModal`.
 *
 * This module is a THIN orchestration layer over the existing building blocks
 * under `app/lib/jobtread/budget-push/`:
 *   - `buildJobTreadBudgetTree()` (merge.ts)        — the template-overlay tree
 *   - `createCostCodeResolver()`  (cost-code-resolver.ts) — live catalog resolver
 *   - `getCostCodeCatalog()`      (cost-code-resolver.ts) — UI pickers
 *   - `costTypeHintFromName()`    (dry-run.ts)       — Material/Install/Sub hint
 *   - push-service.ts            — the actual JobTread create/list/push writes
 *
 * It does NOT reimplement any of that math — it wires it together, resolves
 * every line's cost code/type up front (so the modal can flag the ones that
 * aren't `template-exact`), and surfaces project-derived defaults for the form.
 */

import type { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

import { buildJobTreadBudgetTree } from "./merge";
import { publishPushWorkerMessage, runPushJobInline } from "./push-job";
import {
  createCostCodeResolver,
  getCostCodeCatalog,
} from "./cost-code-resolver";
import { costTypeHintFromName } from "./dry-run";
import {
  JOB_STAGE_OPTIONS,
  jtCreateAccount,
  jtCreateJob,
  jtCreateLocation,
  listCustomers,
  listCustomerJobs,
  getProjectPushLinkage,
  clearProjectPushLinkage,
} from "./push-service";

import type { JobTreadBudgetTree } from "./types";
import type {
  JTCustomerLite,
  JTLocationLite,
  ProjectPushLinkage,
} from "./push-service";

// ---------------------------------------------------------------------------
// Public types (the modal imports these via `import type`)
// ---------------------------------------------------------------------------

/** A single id/name option for the Cost Code / Cost Type pickers. */
export interface CodeOption {
  id: string;
  name: string;
}

/**
 * Everything the push modal needs on mount: the resolved budget tree (every
 * line has a cost code/type + a `costCodeMatchKind`), the live picker catalogs,
 * the existing customer list, the project-derived form defaults, and summary
 * stats. One server round-trip.
 */
export interface PreparedPush {
  projectId: string;
  projectTitle: string;
  /** Formatted client name ("First Last" [& "First2 Last2"]), else the title. */
  defaultCustomerName: string;
  /** Pre-filled new-job name: "<addressLine1 || title> - Design", ≤ 30 chars. */
  defaultJobName: string;
  /** Pre-filled new-location address: "<addressLine1>, <city>, <state> <zip>". */
  defaultAddress: string;
  /** Valid Job Stage option values (push-service `JOB_STAGE_OPTIONS`). */
  jobStageOptions: string[];
  /** Live JobTread cost-code picker options. */
  costCodeOptions: CodeOption[];
  /** Live JobTread cost-type picker options. */
  costTypeOptions: CodeOption[];
  /**
   * The template-overlay budget tree with EVERY line resolved: each item has
   * `costCodeId`/`costCodeName`/`costTypeId`/`costTypeName` and a
   * `costCodeMatchKind` set. The modal flags anything not `template-exact`.
   */
  tree: JobTreadBudgetTree;
  /** Existing JobTread customer accounts (id + name), name-sorted. */
  customers: JTCustomerLite[];
  /**
   * Existing push linkage. When `linkage.jobtreadJobId` is set, this project was
   * already pushed — the modal opens to the "already pushed" gate (re-push
   * Overwrite/Append, or start over) instead of the customer step.
   */
  linkage: ProjectPushLinkage;
  /** Summary counters for the modal header. */
  stats: {
    roomCount: number;
    lineItemCount: number;
    /** Lines whose `costCodeMatchKind !== "template-exact"` (need verify). */
    flaggedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Project-derived form defaults
// ---------------------------------------------------------------------------

/**
 * Format the client name from the project's client fields:
 *   "First Last" + " & First2 Last2" when a second client is present.
 * Falls back to the project title when no client name is on file.
 */
function formatCustomerName(project: {
  title: string;
  client1First: string | null;
  client1Last: string | null;
  client2First: string | null;
  client2Last: string | null;
}): string {
  const join = (first: string | null, last: string | null): string =>
    [first?.trim(), last?.trim()].filter(Boolean).join(" ").trim();

  const c1 = join(project.client1First, project.client1Last);
  const c2 = join(project.client2First, project.client2Last);

  const name = [c1, c2].filter(Boolean).join(" & ").trim();
  return name || project.title;
}

/** Build "<addressLine1 || title> - Design", truncated to JobTread's 30-char cap. */
function formatJobName(project: {
  title: string;
  addressLine1: string | null;
}): string {
  const base = project.addressLine1?.trim() || project.title;
  return `${base} - Design`.slice(0, 30);
}

/** Build "<addressLine1>, <city>, <state> <zip>", skipping any blank parts. */
function formatAddress(project: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  const line1 = project.addressLine1?.trim() || "";
  const city = project.city?.trim() || "";
  const state = project.state?.trim() || "";
  const zip = project.zip?.trim() || "";

  // "<state> <zip>" as one trailing chunk so a blank state/zip collapses cleanly.
  const stateZip = [state, zip].filter(Boolean).join(" ").trim();
  return [line1, city, stateZip].filter(Boolean).join(", ").trim();
}

// ---------------------------------------------------------------------------
// preparePush — one round-trip to seed the modal
// ---------------------------------------------------------------------------

/**
 * Assemble everything the push modal needs:
 *   1. Build the template-overlay budget tree.
 *   2. Resolve a JobTread cost code/type for every line IN PLACE, recording
 *      each line's `costCodeMatchKind` so the modal can flag non-exact lines.
 *   3. Load the existing customers + the live picker catalogs.
 *   4. Compute project-derived form defaults + summary stats.
 *
 * Read-only — no JobTread writes happen here.
 */
export async function preparePush(projectId: string): Promise<PreparedPush> {
  await requireAdmin();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      addressLine1: true,
      city: true,
      state: true,
      zip: true,
      client1First: true,
      client1Last: true,
      client2First: true,
      client2Last: true,
    },
  });
  if (!project) {
    throw new Error(`Project ${projectId} not found.`);
  }

  // 1. Build the tree, then 2. resolve every line in place. The catalog fetch
  // inside createCostCodeResolver() is the expensive part — done once.
  const [tree, resolver, customers, catalog, linkage] = await Promise.all([
    buildJobTreadBudgetTree(projectId),
    createCostCodeResolver(),
    listCustomers(),
    getCostCodeCatalog(),
    getProjectPushLinkage(projectId),
  ]);

  let roomCount = 0;
  let lineItemCount = 0;
  let flaggedCount = 0;

  for (const room of tree.rooms) {
    roomCount += 1;
    for (const trade of room.trades) {
      for (const item of trade.items) {
        const resolution = resolver.resolve(
          trade.tradeName,
          costTypeHintFromName(item.name),
          item.costCodeName,
          item.costTypeName,
        );
        item.costCodeId = resolution.costCodeId;
        item.costCodeName = resolution.costCodeName;
        item.costTypeId = resolution.costTypeId;
        item.costTypeName = resolution.costTypeName;
        item.costCodeMatchKind = resolution.matchKind;

        lineItemCount += 1;
        if (resolution.matchKind !== "template-exact") flaggedCount += 1;
      }
    }
  }

  return {
    projectId,
    projectTitle: project.title,
    defaultCustomerName: formatCustomerName(project),
    defaultJobName: formatJobName(project),
    defaultAddress: formatAddress(project),
    jobStageOptions: [...JOB_STAGE_OPTIONS],
    costCodeOptions: catalog.costCodes,
    costTypeOptions: catalog.costTypes,
    tree,
    customers,
    linkage,
    stats: { roomCount, lineItemCount, flaggedCount },
  };
}

// ---------------------------------------------------------------------------
// Step 2 — existing customer's locations + jobs
// ---------------------------------------------------------------------------

/** A customer's locations + their jobs (for picking an existing job target). */
export async function listCustomerLocationsJobs(
  accountId: string,
): Promise<JTLocationLite[]> {
  await requireAdmin();
  return listCustomerJobs(accountId);
}

// ---------------------------------------------------------------------------
// Create ops (new customer / location / job)
// ---------------------------------------------------------------------------

/** Create a new JobTread customer account; returns its accountId. */
export async function createCustomerAction(
  name: string,
): Promise<{ accountId: string }> {
  await requireAdmin();
  const accountId = await jtCreateAccount(name);
  return { accountId };
}

/** Create a location under a customer account; returns its locationId. */
export async function createLocationAction(
  accountId: string,
  name: string,
  address: string,
): Promise<{ locationId: string }> {
  await requireAdmin();
  const locationId = await jtCreateLocation(accountId, { name, address });
  return { locationId };
}

/** Create a job under a location with a Job Stage; returns id + number. */
export async function createJobAction(
  locationId: string,
  name: string,
  jobStage: string,
): Promise<{ jobId: string; jobNumber: string | null }> {
  await requireAdmin();
  const { id, number } = await jtCreateJob({ locationId, name, jobStage });
  return { jobId: id, jobNumber: number };
}

/**
 * Forget a stale push link WITHOUT touching JobTread — for "start over" when the
 * JobTread job was deleted outside the app. Clears the project's linkage/lock and
 * our JobTreadPushedItem records so the project can push fresh.
 */
export async function clearPushLinkageAction(projectId: string): Promise<void> {
  await requireAdmin();
  await clearProjectPushLinkage(projectId);
}

// ---------------------------------------------------------------------------
// Background push job — start + poll
// ---------------------------------------------------------------------------

export type PushJobMode = "create" | "overwrite" | "append";

export interface PushJobStatus {
  status: string; // JobStatus: QUEUED | RUNNING | COMPLETED | FAILED | PARTIAL
  mode: string;
  totalGroups: number;
  totalItems: number;
  createdGroups: number;
  createdItems: number;
  jobtreadJobId: string;
  jobtreadJobNumber: string | null;
  error: string | null;
}

/**
 * Enqueue a BACKGROUND budget push: validate the tree, persist a JobTreadPushJob
 * (verified tree + target job/linkage + mode), then hand off to the QStash
 * worker so large budgets don't hit the request timeout. On localhost (no QStash
 * proxy) a publish failure falls back to running the push in-process. Returns the
 * push job id for the modal to poll via `getPushJobStatus`.
 */
export async function startPushJobAction(
  projectId: string,
  jobId: string,
  tree: JobTreadBudgetTree,
  linkage: {
    accountId?: string | null;
    locationId?: string | null;
    jobNumber?: string | null;
  },
  mode: PushJobMode = "create",
): Promise<{ pushJobId: string }> {
  await requireAdmin();

  // Validate + count up front (same cost-code guard as the synchronous path).
  let totalGroups = 0;
  let totalItems = 0;
  for (const room of tree.rooms) {
    totalGroups += 1; // room group
    for (const trade of room.trades) {
      totalGroups += 1; // trade group
      for (const item of trade.items) {
        totalItems += 1;
        if (item.costCodeId == null) {
          throw new Error("Every line must have a cost code before pushing.");
        }
      }
    }
  }

  const job = await prisma.jobTreadPushJob.create({
    data: {
      projectId,
      jobtreadJobId: jobId,
      jobtreadJobNumber: linkage.jobNumber ?? null,
      jobtreadAccountId: linkage.accountId ?? null,
      jobtreadLocationId: linkage.locationId ?? null,
      mode,
      tree: tree as unknown as Prisma.InputJsonValue,
      totalGroups,
      totalItems,
    },
    select: { id: true },
  });

  try {
    await publishPushWorkerMessage(job.id);
  } catch (err) {
    // Local-dev fallback: run inline when QStash isn't reachable. Never in prod
    // (a publish failure there is a real error to surface, not silently inline).
    if (process.env.NODE_ENV !== "production") {
      void runPushJobInline(job.id).catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[jobtread push] inline dev fallback error:", e);
      });
    } else {
      throw err;
    }
  }

  return { pushJobId: job.id };
}

/** Poll a background push job's progress/status. Returns null if not found. */
export async function getPushJobStatus(
  pushJobId: string,
): Promise<PushJobStatus | null> {
  await requireAdmin();
  const job = await prisma.jobTreadPushJob.findUnique({ where: { id: pushJobId } });
  if (!job) return null;
  return {
    status: job.status,
    mode: job.mode,
    totalGroups: job.totalGroups,
    totalItems: job.totalItems,
    createdGroups: job.createdGroups,
    createdItems: job.createdItems,
    jobtreadJobId: job.jobtreadJobId,
    jobtreadJobNumber: job.jobtreadJobNumber,
    error: job.error,
  };
}

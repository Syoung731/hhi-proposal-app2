'use server';

import { prisma } from '@/app/lib/prisma';
import { getJobTreadCredentials } from '@/app/integrations/jobtread';
import { getNormalizedJobBudget } from '@/app/lib/jobtread/budget-source';
import {
  computeBudgetFingerprint,
  syncNormalizedJobBudget,
  type SyncJobBudgetResult,
} from '@/app/lib/jobtread/sync-budget';
import {
  classifyPricingGroup,
  type PricingGroupKind,
} from './jobtread-pricing-classify';
import { DEBUG_JOBTREAD_SYNC } from '@/app/lib/jobtread/debug';

const MAX_BUILD_JOBS_PER_SYNC = Number(process.env.JOBTREAD_SYNC_MAX_JOBS ?? '5');

type JobTreadCredentials = {
  apiBaseUrl: string;
  grantKey: string;
};

type RawJob = Record<string, unknown>;

type NormalizedCostItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  costGroupId: string | null;
};

type NormalizedCostGroup = {
  id: string;
  name: string;
  parentId: string | null;
};

type NormalizedJob = {
  id: string;
  name: string;
  stage: string | null;
  costGroups: NormalizedCostGroup[];
  costItems: NormalizedCostItem[];
  jobNumber?: string | null;
};

export type JobTreadSyncStats = {
  jobsFetched: number;
  buildJobsFound: number;
  buildJobsIncluded: number;
  jobsNew: number;
  jobsChanged: number;
  jobsSkippedUnchanged: number;
  jobsSkippedNoBudget: number;
  jobsSynced: number;
  syncedBudgetJobsWritten: number;
  syncedBudgetRowsWritten: number;
  roomSnapshotsCreated: number;
  syncedJobIds: string[];
};

export type JobTreadDebugTopLevelGroup = {
  id: string;
  name: string;
  normalizedPricingGroup: string | null;
  groupKind: PricingGroupKind;
  isValidPricingGroup: boolean;
  droppedAsDuplicate: boolean;
  exclusionReason: string | null;
};

export type JobTreadDebugJob = {
  id: string;
  name: string;
  rawStage: string | null;
  normalizedStage: string;
  isBuildIncluded: boolean;
  jobStageFieldValue: string | null;
  closedOn: unknown;
  isExcludedBecauseClosed: boolean;
  totalRawTopLevelGroups: number;
  totalValidAfterClassification: number;
  totalAfterDedupe: number;
  topLevelGroups: JobTreadDebugTopLevelGroup[];
};

export type JobTreadDebugSummary = {
  totalJobs: number;
  closedJobs: number;
  buildJobsDetected: number;
  totalTopLevelGroups: number;
  validPricingGroups: number;
  invalidGroups: number;
};

export type JobTreadDebugData = {
  summary: JobTreadDebugSummary;
  jobs: JobTreadDebugJob[];
};

export type JobTreadRawCostData = {
  groups: RawJob[];
  items: RawJob[];
};

type JobTreadBudgetTotals = {
  sell: number;
  cost: number;
  groupCount: number;
  itemCount: number;
};

export type JobPricingReconciliation = {
  jobId: string;
  budgetSell: number;
  budgetCost: number;
  sourcesSell: number;
  sourcesCost: number;
  importedSell: number;
  importedCost: number;
  snapshotSell: number;
  snapshotCost: number;
  varianceSourcesVsBudget: {
    sell: number;
    cost: number;
  };
  varianceImportedVsBudget: {
    sell: number;
    cost: number;
  };
  varianceSnapshotsVsBudget: {
    sell: number;
    cost: number;
  };
};

const JOBTREAD_ORGANIZATION_ID = '22P3uKaSn7Ca';
const JOBS_PAGE_SIZE = 25;
const COST_GROUPS_PAGE_SIZE = 50;
const COST_ITEMS_PAGE_SIZE = 50;
const DEBUG_RECONCILE_JOB_ID = '22PJXd2cjdhN';

function getSafeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidateKeys = ['amount', 'value', 'raw', 'cents'];

    for (const key of candidateKeys) {
      if (!(key in obj)) continue;
      const inner = obj[key];

      if (typeof inner === 'number' && Number.isFinite(inner)) {
        return key === 'cents' ? inner / 100 : inner;
      }

      if (typeof inner === 'string') {
        const parsed = Number(inner);
        if (Number.isFinite(parsed)) {
          return key === 'cents' ? parsed / 100 : parsed;
        }
      }
    }
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const KNOWN_JOB_STAGES = new Set([
  'archived',
  'warranty',
  'design',
  'design contract',
  'fast',
  'build',
]);

function normalizeJobStage(rawStage: string | null): string {
  if (rawStage == null) return 'Build';
  const trimmed = rawStage.trim();
  if (trimmed === '') return 'Build';
  if (KNOWN_JOB_STAGES.has(trimmed.toLowerCase())) return trimmed;
  return trimmed;
}

function extractJobStage(job: RawJob): string | null {
  const cfvNodes = (job['customFieldValues'] as { nodes?: unknown[] } | undefined)?.nodes;
  if (Array.isArray(cfvNodes)) {
    for (const node of cfvNodes) {
      if (!node || typeof node !== 'object') continue;
      const row = node as Record<string, unknown>;
      const cf = row['customField'] as { name?: unknown } | undefined;
      const fieldName = typeof cf?.name === 'string' ? cf.name.trim() : null;
      if (fieldName !== 'Job Stage') continue;
      const value = row['value'];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  const directStage = job['jobStage'] ?? job['stage'];
  if (typeof directStage === 'string' && directStage.trim()) {
    return directStage.trim();
  }

  return null;
}

function normalizeCostGroupsFromArray(groupsRaw: unknown[]): NormalizedCostGroup[] {
  const result: NormalizedCostGroup[] = [];
  for (const g of groupsRaw) {
    if (!g || typeof g !== 'object') continue;
    const row = g as Record<string, unknown>;
    const id = String(row['id'] ?? '').trim();
    const name = String(row['name'] ?? '').trim();
    if (!id || !name) continue;
    const parentObj = row['parentCostGroup'] as { id?: unknown } | undefined;
    const parentIdRaw = parentObj?.id;
    const parentId =
      typeof parentIdRaw === 'string' && parentIdRaw.trim() ? parentIdRaw.trim() : null;
    result.push({ id, name, parentId });
  }
  return result;
}

function normalizeCostItemsFromArray(itemsRaw: unknown[]): NormalizedCostItem[] {
  const items: NormalizedCostItem[] = [];
  for (const item of itemsRaw) {
    if (!item || typeof item !== 'object') continue;
    const ir = item as Record<string, unknown>;
    const id = String(ir['id'] ?? '').trim();
    const name = String(ir['name'] ?? '').trim();
    if (!id || !name) continue;
    const quantity = getSafeNumber(ir['quantity']);
    const unitPrice = getSafeNumber(ir['unitPrice']);
    const unitCost = getSafeNumber(ir['unitCost']);
    const costGroupObj = ir['costGroup'] as { id?: unknown } | undefined;
    const costGroupIdRaw = costGroupObj?.id;
    const costGroupId =
      typeof costGroupIdRaw === 'string' && costGroupIdRaw.trim() ? costGroupIdRaw.trim() : null;
    items.push({ id, name, quantity, unitPrice, unitCost, costGroupId });
  }
  return items;
}

async function postJobTreadQuery(
  creds: JobTreadCredentials,
  query: unknown,
  context: string,
): Promise<unknown> {
  const url = creds.apiBaseUrl.replace(/\/+$/, '');
  const body = { query };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`JobTread API request failed (${context}): ${message}`);
  }

  const rawText = await res.text();
  let json: unknown = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      throw new Error(
        `JobTread API returned non-JSON response (${context}, HTTP ${res.status}): ${rawText.slice(0, 300)}`,
      );
    }
  }

  if (!res.ok) {
    const anyJson = json as { message?: string; errors?: { message?: string }[] } | null;
    const parts: string[] = [
      `JobTread API error (${context})`,
      `HTTP ${res.status} ${res.statusText}`.trim(),
    ];
    if (anyJson?.message) parts.push(anyJson.message);
    if (anyJson?.errors?.length) {
      parts.push(anyJson.errors.map((e) => e.message ?? 'Unknown error').join('; '));
    }
    throw new Error(parts.join(' | '));
  }

  return json;
}

async function fetchOrganizationJobsPage(
  creds: JobTreadCredentials,
  page: string | null,
): Promise<{ jobs: RawJob[]; nextPage: string | null }> {
  const query = {
    $: { grantKey: creds.grantKey },
    organization: {
      $: { id: JOBTREAD_ORGANIZATION_ID },
      jobs: {
        $: {
          size: JOBS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        previousPage: {},
        nodes: {
          id: {},
          name: {},
          closedOn: {},
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds,
    query,
    `fetching organization jobs page${page ? ` (page=${page})` : ' (first page)'}`,
  );

  const root = json as {
    data?: {
      organization?: {
        jobs?: {
          nodes?: RawJob[];
          nextPage?: string | null;
        };
      };
    };
    organization?: {
      jobs?: {
        nodes?: RawJob[];
        nextPage?: string | null;
      };
    };
  };

  const org = root.data?.organization ?? root.organization;
  const jobsConn = org?.jobs;
  const nodes = (jobsConn?.nodes ?? []) as RawJob[];
  const nextPage = jobsConn?.nextPage ?? null;

  return { jobs: nodes.filter((j) => !!j), nextPage };
}

function isJobClosed(job: RawJob): boolean {
  return job['closedOn'] !== null && job['closedOn'] !== undefined;
}

async function fetchAllOrganizationJobs(
  creds: JobTreadCredentials,
): Promise<RawJob[]> {
  const all: RawJob[] = [];
  let page: string | null = null;

  while (true) {
    const { jobs, nextPage } = await fetchOrganizationJobsPage(creds, page);
    all.push(...jobs);
    if (nextPage == null) break;
    page = nextPage;
  }

  return all;
}

type JobStageDetail = {
  stage: string | null;
  jobStageFieldValue: string | null;
};

async function fetchJobStageDetail(
  creds: JobTreadCredentials,
  jobId: string,
): Promise<JobStageDetail> {
  const query = {
    $: { grantKey: creds.grantKey },
    job: {
      $: { id: jobId },
      id: {},
      name: {},
      customFieldValues: {
        nodes: {
          value: {},
          customField: { name: {} },
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds,
    query,
    `fetching job stage for job ${jobId}`,
  );

  const root = json as {
    data?: { job?: RawJob | null };
    job?: RawJob | null;
  };

  const jobNode = (root.data?.job ?? root.job) as RawJob | null | undefined;
  if (!jobNode) {
    return { stage: null, jobStageFieldValue: null };
  }

  const stage = extractJobStage(jobNode);

  let jobStageFieldValue: string | null = null;
  const cfvNodes = (jobNode['customFieldValues'] as { nodes?: unknown[] } | undefined)?.nodes;
  if (Array.isArray(cfvNodes)) {
    for (const node of cfvNodes) {
      if (!node || typeof node !== 'object') continue;
      const row = node as Record<string, unknown>;
      const cf = row['customField'] as { name?: unknown } | undefined;
      const fieldName = typeof cf?.name === 'string' ? cf.name.trim() : null;
      if (fieldName !== 'Job Stage') continue;
      const value = row['value'];
      if (typeof value === 'string' && value.trim()) {
        jobStageFieldValue = value;
        break;
      }
    }
  }

  return { stage, jobStageFieldValue };
}

async function fetchJobCostGroupsPage(
  creds: JobTreadCredentials,
  jobId: string,
  page: string | null,
): Promise<{ groups: unknown[]; nextPage: string | null }> {
  const query = {
    $: { grantKey: creds.grantKey },
    job: {
      $: { id: jobId },
      costGroups: {
        $: {
          size: COST_GROUPS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        previousPage: {},
        nodes: {
          id: {},
          name: {},
          parentCostGroup: {
            id: {},
          },
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds,
    query,
    `fetching costGroups for job ${jobId}${page ? ` (page=${page})` : ' (first page)'}`,
  );

  const root = json as {
    data?: {
      job?: {
        costGroups?: {
          nodes?: unknown[];
          nextPage?: string | null;
        };
      };
    };
    job?: {
      costGroups?: {
        nodes?: unknown[];
        nextPage?: string | null;
      };
    };
  };

  const jobNode = root.data?.job ?? root.job;
  const conn = jobNode?.costGroups;
  const nodes = (conn?.nodes ?? []) as unknown[];
  const nextPage = conn?.nextPage ?? null;
  return { groups: nodes, nextPage };
}

async function fetchAllJobCostGroups(
  creds: JobTreadCredentials,
  jobId: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let page: string | null = null;

  while (true) {
    const { groups, nextPage } = await fetchJobCostGroupsPage(creds, jobId, page);
    all.push(...groups);
    if (nextPage == null) break;
    page = nextPage;
  }

  return all;
}

async function fetchJobCostItemsPage(
  creds: JobTreadCredentials,
  jobId: string,
  page: string | null,
): Promise<{ items: unknown[]; nextPage: string | null }> {
  const query = {
    $: { grantKey: creds.grantKey },
    job: {
      $: { id: jobId },
      costItems: {
        $: {
          size: COST_ITEMS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        previousPage: {},
        nodes: {
          id: {},
          name: {},
          quantity: {},
          unitPrice: {},
          unitCost: {},
          costGroup: {
            id: {},
          },
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds,
    query,
    `fetching costItems for job ${jobId}${page ? ` (page=${page})` : ' (first page)'}`,
  );

  const root = json as {
    data?: {
      job?: {
        costItems?: {
          nodes?: unknown[];
          nextPage?: string | null;
        };
      };
    };
    job?: {
      costItems?: {
        nodes?: unknown[];
        nextPage?: string | null;
      };
    };
  };

  const jobNode = root.data?.job ?? root.job;
  const conn = jobNode?.costItems;
  const nodes = (conn?.nodes ?? []) as unknown[];
  const nextPage = conn?.nextPage ?? null;
  return { items: nodes, nextPage };
}

async function fetchAllJobCostItems(
  creds: JobTreadCredentials,
  jobId: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let page: string | null = null;

  while (true) {
    const { items, nextPage } = await fetchJobCostItemsPage(creds, jobId, page);
    all.push(...items);
    if (nextPage == null) break;
    page = nextPage;
  }

  return all;
}

/** Dev-only: one page of cost items with rich fields (extendedCost, extendedPrice, isSelected, isSpecification, etc.). */
async function fetchJobCostItemsPageRich(
  creds: JobTreadCredentials,
  jobId: string,
  page: string | null,
): Promise<{ items: unknown[]; nextPage: string | null }> {
  const query = {
    $: { grantKey: creds.grantKey },
    job: {
      $: { id: jobId },
      costItems: {
        $: {
          size: COST_ITEMS_PAGE_SIZE,
          ...(page != null ? { page } : {}),
        },
        nextPage: {},
        previousPage: {},
        nodes: {
          id: {},
          name: {},
          quantity: {},
          unitCost: {},
          unitPrice: {},
          isSelected: {},
          isSpecification: {},
          costGroup: { id: {}, name: {}, parentCostGroup: { id: {} } },
          unit: { id: {}, name: {} },
          costCode: { id: {}, name: {}, number: {} },
          costType: { id: {}, name: {} },
          document: { id: {} },
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds,
    query,
    `fetching costItems (rich) for job ${jobId}${page ? ` (page=${page})` : ''}`,
  );

  const root = json as {
    data?: { job?: { costItems?: { nodes?: unknown[]; nextPage?: string | null } } };
    job?: { costItems?: { nodes?: unknown[]; nextPage?: string | null } };
  };
  const jobNode = root.data?.job ?? root.job;
  const conn = jobNode?.costItems;
  const nodes = (conn?.nodes ?? []) as unknown[];
  const nextPage = conn?.nextPage ?? null;
  return { items: nodes, nextPage };
}

/** Dev-only: full paginated fetch of cost items with rich fields for one job. */
async function fetchAllJobCostItemsRich(
  creds: JobTreadCredentials,
  jobId: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let page: string | null = null;
  while (true) {
    const { items, nextPage } = await fetchJobCostItemsPageRich(creds, jobId, page);
    all.push(...items);
    if (nextPage == null) break;
    page = nextPage;
  }
  return all;
}

async function fetchBuildJobsWithDetails(
  creds: JobTreadCredentials,
): Promise<{
  jobs: NormalizedJob[];
  jobsFetched: number;
  buildJobsIncluded: number;
  jobMeta: { id: string; name: string; normalizedStage: string; closedOnRaw: unknown }[];
}> {
  const allJobs = await fetchAllOrganizationJobs(creds);
  const jobsFetched = allJobs.length;

  const normalized: NormalizedJob[] = [];
  let buildJobsIncluded = 0;
  const jobMeta: { id: string; name: string; normalizedStage: string; closedOnRaw: unknown }[] = [];

  for (const job of allJobs) {
    const id = String((job as { id?: unknown }).id ?? '').trim();
    const name = String((job as { name?: unknown }).name ?? '').trim();
    if (!id || !name) continue;

    const closedOn = job['closedOn'];
    if (isJobClosed(job)) continue;

    const { stage: rawStage } = await fetchJobStageDetail(creds, id);
    const normalizedStage = normalizeJobStage(rawStage);

    jobMeta.push({ id, name, normalizedStage, closedOnRaw: closedOn });

    if (DEBUG_JOBTREAD_SYNC) {
      // eslint-disable-next-line no-console
      console.log(
        `[JobTread sync] Job ${id} "${name}" rawStage=${rawStage ?? 'null'} normalizedStage=${normalizedStage}`,
      );
    }

    if (normalizedStage !== 'Build') continue;

    buildJobsIncluded += 1;

    const rawGroups = await fetchAllJobCostGroups(creds, id);
    const rawItems = await fetchAllJobCostItems(creds, id);
    const costGroups = normalizeCostGroupsFromArray(rawGroups);
    const costItems = normalizeCostItemsFromArray(rawItems);

    const numberRaw = (job as { number?: unknown }).number;
    const jobNumber =
      typeof numberRaw === 'string' && numberRaw.trim() ? numberRaw.trim() : null;

    normalized.push({
      id,
      name,
      stage: normalizedStage,
      costGroups,
      costItems,
      jobNumber,
    });
  }

  return {
    jobs: normalized,
    jobsFetched,
    buildJobsIncluded,
    jobMeta,
  };
}

type JobSyncClassification = 'new' | 'changed' | 'unchanged';

export async function syncJobTreadPricing(): Promise<JobTreadSyncStats> {
  const creds = await getJobTreadCredentials();
  if (!creds) {
    throw new Error('JobTread credentials are not configured.');
  }

  const { jobs, jobsFetched, buildJobsIncluded } =
    await fetchBuildJobsWithDetails(creds as JobTreadCredentials);
  const buildJobsFound = jobs.length;
  const jobsToConsider = jobs.slice(0, MAX_BUILD_JOBS_PER_SYNC);

  const jobIds = jobsToConsider.map((j) => j.id);
  const existing = await prisma.syncedBudgetJob.findMany({
    where: { jobId: { in: jobIds } },
    select: { jobId: true, sourceFingerprint: true },
  });
  const existingByJobId = new Map(existing.map((r) => [r.jobId, r]));

  const classified: { jobId: string; name: string; kind: JobSyncClassification }[] = [];
  let jobsNew = 0;
  let jobsChanged = 0;
  let jobsSkippedUnchanged = 0;
  let jobsSkippedNoBudget = 0;
  const syncedJobIds: string[] = [];
  let syncedBudgetRowsWritten = 0;

  for (const job of jobsToConsider) {
    const budget = await getNormalizedJobBudget(job.id, job.name, job.jobNumber ?? null);
    if (budget == null) {
      jobsSkippedNoBudget += 1;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(
          '[JobTread sync] Skipping job (no budget source): jobId=' +
            JSON.stringify(job.id) +
            ' name=' +
            JSON.stringify(job.name)
        );
      }
      continue;
    }

    const fingerprint = computeBudgetFingerprint(budget);
    const prev = existingByJobId.get(job.id);
    let kind: JobSyncClassification = 'new';
    if (prev) {
      kind = prev.sourceFingerprint === fingerprint ? 'unchanged' : 'changed';
    }
    classified.push({ jobId: job.id, name: job.name, kind });

    if (kind === 'unchanged') {
      jobsSkippedUnchanged += 1;
      continue;
    }
    if (kind === 'new') jobsNew += 1;
    else jobsChanged += 1;

    const result: SyncJobBudgetResult = await syncNormalizedJobBudget(budget);
    syncedJobIds.push(job.id);
    syncedBudgetRowsWritten += result.rowCount;
  }

  const jobsSynced = syncedJobIds.length;
  const now = new Date();
  const message =
    buildJobsFound === 0
      ? 'No Build jobs found.'
      : `Build jobs: ${buildJobsFound} found; ${jobsSynced} synced (${jobsNew} new, ${jobsChanged} changed), ${jobsSkippedUnchanged} skipped (unchanged)${jobsSkippedNoBudget > 0 ? `, ${jobsSkippedNoBudget} skipped (no budget source)` : ''}.`;

  await prisma.integration.updateMany({
    where: { provider: 'jobtread' },
    data: {
      lastTestedAt: now,
      lastStatus: 'success',
      lastMessage: message,
      updatedAt: now,
    },
  });

  const changedJobIds = classified.filter((c) => c.kind === 'changed').map((c) => c.jobId);
  // End-of-run concise summary for sync pass.
  // eslint-disable-next-line no-console
  console.log('[JobTread sync] Classification summary:', {
    buildJobsFound,
    buildJobsIncluded,
    jobsNew,
    jobsChanged,
    jobsSkippedUnchanged,
    jobsSkippedNoBudget,
    jobsSynced,
    syncedBudgetRowsWritten,
    syncedJobIds,
    changedJobIds: changedJobIds.length ? changedJobIds : undefined,
    unchangedCount: jobsSkippedUnchanged,
  });

  return {
    jobsFetched,
    buildJobsFound,
    buildJobsIncluded,
    jobsNew,
    jobsChanged,
    jobsSkippedUnchanged,
    jobsSkippedNoBudget,
    jobsSynced,
    syncedBudgetJobsWritten: jobsSynced,
    syncedBudgetRowsWritten,
    roomSnapshotsCreated: 0,
    syncedJobIds,
  };
}

export async function getJobTreadRawCostData(jobId: string): Promise<JobTreadRawCostData> {
  const creds = await getJobTreadCredentials();
  if (!creds) {
    throw new Error('JobTread credentials are not configured.');
  }

  const query = {
    $: { grantKey: (creds as JobTreadCredentials).grantKey },
    job: {
      $: { id: jobId },
      id: {},
      name: {},
      costGroups: {
        $: { size: COST_GROUPS_PAGE_SIZE },
        nodes: {
          id: {},
          name: {},
          description: {},
          isSelected: {},
          isSimpleSelection: {},
          maxSelectionsAllowed: {},
          minSelectionsRequired: {},
          quantity: {},
          quantityFormula: {},
          showChildCosts: {},
          showChildDeltas: {},
          showChildren: {},
          showDescription: {},
          parentCostGroup: {
            id: {},
          },
        },
      },
      costItems: {
        $: { size: COST_ITEMS_PAGE_SIZE },
        nodes: {
          id: {},
          name: {},
          quantity: {},
          unitPrice: {},
          unitCost: {},
          allowanceType: {},
          customFieldValues: {},
          description: {},
          globalId: {},
          hasFinalActualCost: {},
          isEditable: {},
          isSelected: {},
          isSpecification: {},
          isTaxable: {},
          jobArea: {},
          organizationCostItem: {
            id: {},
            name: {},
          },
          quantityFormula: {},
          requireSpecificationApproval: {},
          showDescription: {},
          showQuantity: {},
          sourceCostItem: {
            id: {},
            name: {},
          },
          unitCostFormula: {},
          unit: {
            id: {},
            name: {},
          },
          unitPriceFormula: {},
          document: {
            id: {},
          },
          job: {
            id: {},
          },
          organization: {
            id: {},
          },
          costGroup: {
            id: {},
            name: {},
          },
        },
      },
    },
  };

  const json = await postJobTreadQuery(
    creds as JobTreadCredentials,
    query,
    `fetching raw costGroups and costItems for job ${jobId}`,
  );

  const root = json as {
    data?: {
      job?: {
        costGroups?: { nodes?: RawJob[] };
        costItems?: { nodes?: RawJob[] };
      } | null;
    };
    job?: {
      costGroups?: { nodes?: RawJob[] };
      costItems?: { nodes?: RawJob[] };
    } | null;
  };

  const jobNode = root.data?.job ?? root.job;
  const groups = (jobNode?.costGroups?.nodes ?? []).filter((g) => !!g) as RawJob[];
  const items = (jobNode?.costItems?.nodes ?? []).filter((i) => !!i) as RawJob[];

  return { groups, items };
}

export async function getJobTreadDebugData(): Promise<JobTreadDebugData> {
  const creds = await getJobTreadCredentials();
  if (!creds) {
    throw new Error('JobTread credentials are not configured.');
  }

  const allJobs = await fetchAllOrganizationJobs(creds as JobTreadCredentials);
  const debugJobs: JobTreadDebugJob[] = [];
  let buildJobsDetected = 0;
  let closedJobs = 0;
  let totalTopLevelGroups = 0;
  let validPricingGroups = 0;
  let invalidGroups = 0;

  for (const job of allJobs) {
    const id = String((job as { id?: unknown }).id ?? '').trim();
    const name = String((job as { name?: unknown }).name ?? '').trim();
    if (!id || !name) continue;

    const closedOn = job['closedOn'];
    const isExcludedBecauseClosed = closedOn !== null && closedOn !== undefined;
    if (isExcludedBecauseClosed) closedJobs += 1;

    const { stage: rawStage, jobStageFieldValue } = await fetchJobStageDetail(
      creds as JobTreadCredentials,
      id,
    );
    const normalizedStage = normalizeJobStage(rawStage);
    const isBuildIncluded = normalizedStage === 'Build';
    if (isBuildIncluded && !isExcludedBecauseClosed) buildJobsDetected += 1;

    const rawGroups = await fetchAllJobCostGroups(creds as JobTreadCredentials, id);
    const costGroups = normalizeCostGroupsFromArray(rawGroups);
    const topLevelGroupsRaw = costGroups.filter((g) => g.parentId === null);

    const seenNormalizedNames = new Set<string>();
    const topLevelGroups: JobTreadDebugTopLevelGroup[] = topLevelGroupsRaw.map((g) => {
      const classification = classifyPricingGroup(g.name);
      let droppedAsDuplicate = false;

      if (
        classification.isValidPricingGroup &&
        classification.normalizedPricingGroup != null &&
        classification.normalizedPricingGroup.trim() !== ''
      ) {
        const n = classification.normalizedPricingGroup.trim();
        if (seenNormalizedNames.has(n)) {
          droppedAsDuplicate = true;
        } else {
          seenNormalizedNames.add(n);
        }
      }

      return {
        id: g.id,
        name: g.name,
        normalizedPricingGroup: classification.normalizedPricingGroup,
        groupKind: classification.groupKind,
        isValidPricingGroup: classification.isValidPricingGroup,
        droppedAsDuplicate,
        exclusionReason: classification.exclusionReason,
      };
    });

    const validCount = topLevelGroups.filter((g) => g.isValidPricingGroup).length;

    totalTopLevelGroups += topLevelGroups.length;
    validPricingGroups += validCount;
    invalidGroups += topLevelGroups.filter((g) => !g.isValidPricingGroup).length;

    debugJobs.push({
      id,
      name,
      rawStage,
      normalizedStage,
      isBuildIncluded,
      jobStageFieldValue,
      closedOn,
      isExcludedBecauseClosed,
      totalRawTopLevelGroups: topLevelGroupsRaw.length,
      totalValidAfterClassification: validCount,
      totalAfterDedupe: seenNormalizedNames.size,
      topLevelGroups,
    });
  }

  const summary: JobTreadDebugSummary = {
    totalJobs: allJobs.length,
    closedJobs,
    buildJobsDetected,
    totalTopLevelGroups,
    validPricingGroups,
    invalidGroups,
  };

  return {
    summary,
    jobs: debugJobs,
  };
}

const FORCED_SOURCE_DIAG_JOB_ID = '22PJXd2cjdhN';
const DATAX_SELL = 865_121.5;
const DATAX_COST = 532_318.79;
const DATAX_ITEMS = 686;
const DATAX_GROUPS = 141;

/**
 * Dev-only forced source diagnostic for one job (125 South Shore).
 * Does NOT write to SyncedBudgetJob or SyncedBudgetRow.
 * Runs even if job would be classified as unchanged.
 * Compares current Pave fetch shape to DataX/budget expectations.
 */
export async function runForcedPaveSourceDiagnostic(
  jobId: string = FORCED_SOURCE_DIAG_JOB_ID,
): Promise<{ ok: boolean; message: string }> {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Forced source diagnostic is dev-only.' };
  }
  if (jobId !== FORCED_SOURCE_DIAG_JOB_ID) {
    return { ok: false, message: 'Diagnostic only supports jobId ' + FORCED_SOURCE_DIAG_JOB_ID + '.' };
  }

  const creds = await getJobTreadCredentials();
  if (!creds) {
    return { ok: false, message: 'JobTread credentials are not configured.' };
  }

  const fullGroups = await fetchAllJobCostGroups(creds as JobTreadCredentials, jobId);
  const fullItems = await fetchAllJobCostItems(creds as JobTreadCredentials, jobId);
  const rich = await getJobTreadRawCostData(jobId);

  const rawCostGroupCount = fullGroups.length;
  const rawCostItemCount = fullItems.length;

  const groupIds = new Set<string>();
  const parentIds = new Set<string>();
  for (const g of fullGroups) {
    const row = g as Record<string, unknown>;
    const id = String(row['id'] ?? '').trim();
    const parentObj = row['parentCostGroup'] as { id?: unknown } | undefined;
    const parentId = typeof parentObj?.id === 'string' && parentObj.id.trim() ? parentObj.id.trim() : null;
    if (id) groupIds.add(id);
    if (parentId) parentIds.add(parentId);
  }
  const leafGroupIds = new Set([...groupIds].filter((id) => !parentIds.has(id)));
  const costGroupIdsUsed = new Set<string>();

  type ItemRow = { id: string; name: string; qty: number; unitCost: number; unitPrice: number; costGroupId: string | null; extCost: number; extSell: number };
  const rows: ItemRow[] = [];
  let zeroQty = 0;
  let noUnitCostOrPrice = 0;

  for (const it of fullItems) {
    const ir = it as Record<string, unknown>;
    const id = String(ir['id'] ?? '').trim();
    const name = String(ir['name'] ?? '').trim();
    const qty = getSafeNumber(ir['quantity']);
    const unitCost = getSafeNumber(ir['unitCost']);
    const unitPrice = getSafeNumber(ir['unitPrice']);
    const cg = ir['costGroup'] as { id?: unknown } | undefined;
    const costGroupId = typeof cg?.id === 'string' && cg.id.trim() ? cg.id.trim() : null;
    if (costGroupId) costGroupIdsUsed.add(costGroupId);
    const extCost = qty * unitCost;
    const extSell = qty * unitPrice;
    if (qty <= 0) zeroQty += 1;
    if (unitCost <= 0 && unitPrice <= 0) noUnitCostOrPrice += 1;
    rows.push({ id, name, qty, unitCost, unitPrice, costGroupId, extCost, extSell });
  }

  const sumAll = rows.reduce((a, r) => ({ cost: a.cost + r.extCost, sell: a.sell + r.extSell }), { cost: 0, sell: 0 });
  const qtyGt0 = rows.filter((r) => r.qty > 0);
  const sumQtyGt0 = qtyGt0.reduce((a, r) => ({ cost: a.cost + r.extCost, sell: a.sell + r.extSell }), { cost: 0, sell: 0 });
  const qtyGt0AndUnit = rows.filter((r) => r.qty > 0 && (r.unitCost > 0 || r.unitPrice > 0));
  const sumQtyGt0AndUnit = qtyGt0AndUnit.reduce((a, r) => ({ cost: a.cost + r.extCost, sell: a.sell + r.extSell }), { cost: 0, sell: 0 });
  const leafOnly = rows.filter((r) => r.costGroupId != null && leafGroupIds.has(r.costGroupId));
  const sumLeaf = leafOnly.reduce((a, r) => ({ cost: a.cost + r.extCost, sell: a.sell + r.extSell }), { cost: 0, sell: 0 });

  let selectedCount = 0;
  let specificationCount = 0;
  const richItems = (rich.items ?? []) as RawJob[];
  for (const ir of richItems) {
    const r = ir as Record<string, unknown>;
    if (r['isSelected'] === true) selectedCount += 1;
    if (r['isSpecification'] === true) specificationCount += 1;
  }

  const likelyBudgetLines = rows.filter((r) => r.qty > 0 && (r.unitCost > 0 || r.unitPrice > 0) && r.costGroupId != null && leafGroupIds.has(r.costGroupId));
  const sumLikely = likelyBudgetLines.reduce((a, r) => ({ cost: a.cost + r.extCost, sell: a.sell + r.extSell }), { cost: 0, sell: 0 });

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dist = (cost: number, sell: number, count: number) =>
    Math.abs(cost - DATAX_COST) + Math.abs(sell - DATAX_SELL) + Math.abs(count - DATAX_ITEMS) * 1000;

  const candidates = [
    { name: 'all raw items', cost: sumAll.cost, sell: sumAll.sell, count: rows.length, d: dist(sumAll.cost, sumAll.sell, rows.length) },
    { name: 'quantity > 0 only', cost: sumQtyGt0.cost, sell: sumQtyGt0.sell, count: qtyGt0.length, d: dist(sumQtyGt0.cost, sumQtyGt0.sell, qtyGt0.length) },
    { name: 'qty>0 and (unitCost>0 or unitPrice>0)', cost: sumQtyGt0AndUnit.cost, sell: sumQtyGt0AndUnit.sell, count: qtyGt0AndUnit.length, d: dist(sumQtyGt0AndUnit.cost, sumQtyGt0AndUnit.sell, qtyGt0AndUnit.length) },
    { name: 'likely budget lines (qty>0, unit, leaf group)', cost: sumLikely.cost, sell: sumLikely.sell, count: likelyBudgetLines.length, d: dist(sumLikely.cost, sumLikely.sell, likelyBudgetLines.length) },
    { name: 'leaf group items only', cost: sumLeaf.cost, sell: sumLeaf.sell, count: leafOnly.length, d: dist(sumLeaf.cost, sumLeaf.sell, leafOnly.length) },
  ];
  const closest = candidates.slice().sort((a, b) => a.d - b.d)[0];

  const first50 = rows.slice(0, 50);
  const richFirst50 = richItems.slice(0, 50).map((ir) => {
    const r = ir as Record<string, unknown>;
    return {
      id: r['id'],
      name: (String(r['name'] ?? '')).slice(0, 60),
      quantity: r['quantity'],
      unitCost: r['unitCost'],
      unitPrice: r['unitPrice'],
      costGroupId: (r['costGroup'] as { id?: unknown })?.id,
      isSelected: r['isSelected'],
      isSpecification: r['isSpecification'],
      extendedCost: r['extendedCost'] ?? r['extCost'],
      extendedPrice: r['extendedPrice'] ?? r['extendedPrice'] ?? r['extSell'],
    };
  });

  if (DEBUG_JOBTREAD_SYNC) {
    // eslint-disable-next-line no-console
    console.log(`
========== FORCED PAVE SOURCE DIAGNOSTIC (125 South Shore) ==========
JobId: ${jobId}
DataX reference: groups≈${DATAX_GROUPS} items≈${DATAX_ITEMS} sell≈${fmt(DATAX_SELL)} cost≈${fmt(DATAX_COST)}

--- A. CURRENT PAVE SOURCE SHAPE ---
  Total raw costGroups count:  ${rawCostGroupCount}
  Total raw costItems count:   ${rawCostItemCount}
  Unique costGroup ids used by items: ${costGroupIdsUsed.size}
  Items with quantity <= 0: ${zeroQty}
  Items with unitCost<=0 and unitPrice<=0: ${noUnitCostOrPrice}
  (From first page rich fetch) isSelected=true: ${selectedCount}, isSpecification=true: ${specificationCount}

  First 50 raw cost items (from full Pave fetch):
${first50.map((r, i) => `  ${i + 1}. id=${r.id} name="${r.name.slice(0, 45)}" qty=${r.qty} unitCost=${r.unitCost} unitPrice=${r.unitPrice} costGroupId=${r.costGroupId ?? '—'}`).join('\n')}

  First 50 raw items (rich shape with flags):
${richFirst50.map((r, i) => `  ${i + 1}. id=${r.id} name="${r.name}" qty=${r.quantity} unitCost=${r.unitCost} unitPrice=${r.unitPrice} costGroupId=${r.costGroupId} isSelected=${r.isSelected} isSpecification=${r.isSpecification} extCost=${r.extendedCost} extPrice=${r.extendedPrice}`).join('\n')}

--- B. BUDGET-LIKE FILTERING ANALYSIS ---
  quantity > 0:                          ${qtyGt0.length}
  unitCost>0 or unitPrice>0:             ${rows.filter((r) => r.unitCost > 0 || r.unitPrice > 0).length}
  qty>0 and (unitCost>0 or unitPrice>0): ${qtyGt0AndUnit.length}
  belong to leaf groups only:            ${leafOnly.length}
  likely budget lines (qty>0, unit, leaf): ${likelyBudgetLines.length}

--- C. SIDE-BY-SIDE TOTALS ---
  Subset                                    | count  | sell         | cost
  all raw items                             | ${String(rows.length).padStart(5)} | ${fmt(sumAll.sell)} | ${fmt(sumAll.cost)}
  quantity > 0 only                         | ${String(qtyGt0.length).padStart(5)} | ${fmt(sumQtyGt0.sell)} | ${fmt(sumQtyGt0.cost)}
  qty>0 and (unitCost>0 or unitPrice>0)     | ${String(qtyGt0AndUnit.length).padStart(5)} | ${fmt(sumQtyGt0AndUnit.sell)} | ${fmt(sumQtyGt0AndUnit.cost)}
  likely budget lines only                  | ${String(likelyBudgetLines.length).padStart(5)} | ${fmt(sumLikely.sell)} | ${fmt(sumLikely.cost)}
  leaf group items only                     | ${String(leafOnly.length).padStart(5)} | ${fmt(sumLeaf.sell)} | ${fmt(sumLeaf.cost)}
  Closest subset to DataX: "${closest.name}" (count=${closest.count} sell=${fmt(closest.sell)} cost=${fmt(closest.cost)})

========== END FORCED PAVE SOURCE DIAGNOSTIC ==========
`);
  }

  let summary = '';
  summary += 'Pave job.costItems returns ' + rawCostItemCount + ' items vs DataX budget items ' + DATAX_ITEMS + ', so ';
  summary += rawCostItemCount > DATAX_ITEMS * 1.5 ? 'Pave is returning many non-budget rows (config/spec/helper or unselected). ' : 'Pave item count is in range. ';
  summary += 'Closest subset to DataX (sell≈' + fmt(DATAX_SELL) + ', cost≈' + fmt(DATAX_COST) + ', items≈' + DATAX_ITEMS + ') is: ' + closest.name + ' (count=' + closest.count + ', sell=' + fmt(closest.sell) + ', cost=' + fmt(closest.cost) + '). ';
  summary += 'To make sync match the JobTread budget screen, filters that look necessary: ';
  if (closest.name.includes('quantity') || closest.name.includes('likely')) {
    summary += 'restrict to quantity>0 and (unitCost>0 or unitPrice>0); optionally restrict to items in leaf cost groups only; if API exposes isSelected, filter to isSelected=true.';
  } else {
    summary += 'investigate which subset (qty>0, unit, leaf, or selection flags) aligns with DataX; no single filter identified yet.';
  }

  if (DEBUG_JOBTREAD_SYNC) {
    // eslint-disable-next-line no-console
    console.log('[Forced Pave source diagnostic] Summary:', summary);
  }
  return { ok: true, message: summary };
}

const RICH_BUDGET_FILTER_DIAG_JOB_ID = '22PJXd2cjdhN';

type RichItemRow = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  extendedCost: number | null;
  extendedPrice: number | null;
  isSelected: boolean;
  isSpecification: boolean;
  costGroupId: string | null;
  inLeafGroup: boolean;
  sell: number;
  cost: number;
};

/**
 * Dev-only: full paginated rich fetch + subset comparison for one job.
 * Tests whether direct JobTread with isSelected/isSpecification filtering can reproduce DataX budget.
 * Does NOT change production sync.
 */
export async function runRichJobTreadBudgetFilterDiagnostic(
  jobId: string = RICH_BUDGET_FILTER_DIAG_JOB_ID,
): Promise<{ ok: boolean; message: string }> {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Rich budget filter diagnostic is dev-only.' };
  }
  if (jobId !== RICH_BUDGET_FILTER_DIAG_JOB_ID) {
    return { ok: false, message: 'Diagnostic only supports jobId ' + RICH_BUDGET_FILTER_DIAG_JOB_ID + '.' };
  }

  const creds = await getJobTreadCredentials();
  if (!creds) {
    return { ok: false, message: 'JobTread credentials are not configured.' };
  }

  const fullGroups = await fetchAllJobCostGroups(creds as JobTreadCredentials, jobId);
  const groupIds = new Set<string>();
  const parentIds = new Set<string>();
  for (const g of fullGroups) {
    const row = g as Record<string, unknown>;
    const id = String(row['id'] ?? '').trim();
    const parentObj = row['parentCostGroup'] as { id?: unknown } | undefined;
    const parentId = typeof parentObj?.id === 'string' && parentObj.id.trim() ? parentObj.id.trim() : null;
    if (id) groupIds.add(id);
    if (parentId) parentIds.add(parentId);
  }
  const leafGroupIds = new Set([...groupIds].filter((id) => !parentIds.has(id)));

  const rawRichItems = await fetchAllJobCostItemsRich(creds as JobTreadCredentials, jobId);
  const items: RichItemRow[] = [];
  for (const it of rawRichItems) {
    const r = it as Record<string, unknown>;
    const id = String(r['id'] ?? '').trim();
    const name = String(r['name'] ?? '').trim();
    const qty = getSafeNumber(r['quantity']);
    const unitCost = getSafeNumber(r['unitCost']);
    const unitPrice = getSafeNumber(r['unitPrice']);
    const extCostRaw = r['extendedCost'];
    const extPriceRaw = r['extendedPrice'];
    const extendedCost = extCostRaw != null && Number.isFinite(Number(extCostRaw)) ? Number(extCostRaw) : null;
    const extendedPrice = extPriceRaw != null && Number.isFinite(Number(extPriceRaw)) ? Number(extPriceRaw) : null;
    const isSelected = r['isSelected'] === true;
    const isSpecification = r['isSpecification'] === true;
    const cg = r['costGroup'] as { id?: unknown } | undefined;
    const costGroupId = typeof cg?.id === 'string' && cg.id.trim() ? cg.id.trim() : null;
    const inLeafGroup = costGroupId != null && leafGroupIds.has(costGroupId);
    const cost = extendedCost != null ? extendedCost : qty * unitCost;
    const sell = extendedPrice != null ? extendedPrice : qty * unitPrice;
    items.push({
      id,
      name,
      qty,
      unitCost,
      unitPrice,
      extendedCost,
      extendedPrice,
      isSelected,
      isSpecification,
      costGroupId,
      inLeafGroup,
      sell,
      cost,
    });
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sum = (list: RichItemRow[]) => list.reduce((a, i) => ({ sell: a.sell + i.sell, cost: a.cost + i.cost }), { sell: 0, cost: 0 });

  const subsets: { name: string; list: RichItemRow[] }[] = [
    { name: 'all items', list: items },
    { name: 'isSelected === true', list: items.filter((i) => i.isSelected) },
    { name: 'isSelected === true AND isSpecification !== true', list: items.filter((i) => i.isSelected && !i.isSpecification) },
    { name: 'isSelected === true AND quantity > 0', list: items.filter((i) => i.isSelected && i.qty > 0) },
    { name: 'isSelected === true AND quantity > 0 AND in leaf groups only', list: items.filter((i) => i.isSelected && i.qty > 0 && i.inLeafGroup) },
    {
      name: 'isSelected === true AND isSpecification !== true AND quantity > 0 AND in leaf groups only',
      list: items.filter((i) => i.isSelected && !i.isSpecification && i.qty > 0 && i.inLeafGroup),
    },
  ];

  const datax = { groups: DATAX_GROUPS, items: DATAX_ITEMS, sell: DATAX_SELL, cost: DATAX_COST };
  const dist = (s: number, c: number, n: number) =>
    Math.abs(s - datax.sell) + Math.abs(c - datax.cost) + Math.abs(n - datax.items) * 500;

  const results: { name: string; count: number; sell: number; cost: number; distance: number }[] = [];
  for (const { name: subName, list } of subsets) {
    const t = sum(list);
    const d = dist(t.sell, t.cost, list.length);
    results.push({ name: subName, count: list.length, sell: t.sell, cost: t.cost, distance: d });
  }
  const closest = results.slice().sort((a, b) => a.distance - b.distance)[0];

  if (DEBUG_JOBTREAD_SYNC) {
    // eslint-disable-next-line no-console
    console.log(`
========== RICH JOBTREAD BUDGET FILTER DIAGNOSTIC (125 South Shore) ==========
JobId: ${jobId}
DataX reference: groups ≈ ${datax.groups}  items ≈ ${datax.items}  sell ≈ ${fmt(datax.sell)}  cost ≈ ${fmt(datax.cost)}

Full rich item count: ${items.length}
Group count: ${fullGroups.length}
Leaf group count: ${leafGroupIds.size}

--- Subset comparison ---
  Subset                                                    | count  | sell         | cost         | distance from DataX
${results.map((r) => `  ${r.name.padEnd(58)} | ${String(r.count).padStart(5)} | ${fmt(r.sell).padStart(12)} | ${fmt(r.cost).padStart(12)} | ${r.distance.toFixed(0)}`).join('\n')}

Closest to DataX: "${closest.name}" (count=${closest.count} sell=${fmt(closest.sell)} cost=${fmt(closest.cost)})

========== END RICH BUDGET FILTER DIAGNOSTIC ==========
`);
  }

  let summary = '';
  summary += 'Closest subset to DataX: ' + closest.name + ' (count=' + closest.count + ', sell=' + fmt(closest.sell) + ', cost=' + fmt(closest.cost) + '). ';
  const canReproduce = closest.distance < 100000;
  summary += canReproduce
    ? 'Direct JobTread with rich fields and filtering can likely reproduce the budget-screen dataset. '
    : 'Direct JobTread may need additional filters or a dedicated budget API to match DataX closely. ';
  const allItemsDistance = results[0]?.distance ?? Infinity;
  const selectionKey = results.some((r) => r.name.includes('isSelected') && r.distance < allItemsDistance);
  summary += selectionKey
    ? 'isSelected and isSpecification appear to be key filters (selected + non-spec + qty>0 + leaf groups gets closest). '
    : 'Selection/specification filters help; check which subset matches your DataX export.';

  if (DEBUG_JOBTREAD_SYNC) {
    // eslint-disable-next-line no-console
    console.log('[Rich JobTread budget filter diagnostic] Summary:', summary);
  }
  return { ok: true, message: summary };
}

export type DirectJobTreadBudgetStats = {
  jobId: string;
  rawItemCount: number;
  filteredItemCount: number;
  filteredGroupCount: number;
  totalSell: number;
  totalCost: number;
};

/**
 * Dev-only: direct JobTread budget diagnostic for a single job.
 * Uses documentId == null only (documentId-null-only diagnostic),
 * computes totals from extCost/extSell (qty * unitCost/unitPrice), and
 * derives filtered group count from the true costGroup parent/child hierarchy.
 * Does NOT write to SyncedBudgetJob or pricing staging.
 */
export async function runDirectJobTreadBudgetForJob(
  jobId: string,
): Promise<DirectJobTreadBudgetStats> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('runDirectJobTreadBudgetForJob is dev-only.');
  }

  const creds = await getJobTreadCredentials();
  if (!creds) {
    throw new Error('JobTread credentials are not configured.');
  }

  // 1) Full cost group tree (for hierarchy)
  const fullGroups = await fetchAllJobCostGroups(creds as JobTreadCredentials, jobId);
  const costGroups = normalizeCostGroupsFromArray(fullGroups);

  const groupById = new Map(costGroups.map((g) => [g.id, g]));
  const parentById = new Map(
    costGroups
      .filter((g) => g.parentId != null)
      .map((g) => [g.id, g.parentId as string]),
  );

  // 2) Rich items (document, costGroup, quantity, unitCost, unitPrice)
  const rawItems = await fetchAllJobCostItemsRich(creds as JobTreadCredentials, jobId);

  type DirectItem = {
    id: string;
    name: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    extCost: number;
    extSell: number;
    costGroupId: string | null;
    documentId: string | null;
  };

  const items: DirectItem[] = [];

  for (const it of rawItems as Record<string, unknown>[]) {
    const id = String(it.id ?? '').trim();
    const name = String(it.name ?? '').trim();
    if (!id || !name) continue;

    const quantity = getSafeNumber(it.quantity);
    const unitCost = getSafeNumber(it.unitCost);
    const unitPrice = getSafeNumber(it.unitPrice);

    const extCost = quantity * unitCost;
    const extSell = quantity * unitPrice;

    const cg = it.costGroup as { id?: unknown } | undefined;
    const costGroupId =
      typeof cg?.id === 'string' && cg.id.trim() ? cg.id.trim() : null;

    const doc = it.document as { id?: unknown } | undefined;
    const documentId =
      typeof doc?.id === 'string' && doc.id.trim() ? doc.id.trim() : null;

    items.push({
      id,
      name,
      quantity,
      unitCost,
      unitPrice,
      extCost,
      extSell,
      costGroupId,
      documentId,
    });
  }

  const rawItemCount = items.length;

  // 3) Apply filters: documentId == null (documentId-null-only diagnostic)
  const filtered = items.filter(
    (i) => i.documentId == null,
  );
  const filteredItemCount = filtered.length;

  // 4) Filtered group count from true parent/child hierarchy.
  const usedGroupIds = new Set<string>();
  for (const it of filtered) {
    if (it.costGroupId) usedGroupIds.add(it.costGroupId);
  }

  const visibleGroupIds = new Set<string>();
  for (const id of usedGroupIds) {
    visibleGroupIds.add(id);
    const parentId = parentById.get(id);
    if (parentId && groupById.has(parentId)) {
      visibleGroupIds.add(parentId);
    }
  }
  const filteredGroupCount = visibleGroupIds.size;

  // 5) Totals: extCost/extSell if available, else quantity * unitCost/unitPrice.
  let totalSell = 0;
  let totalCost = 0;
  for (const it of filtered) {
    const cost = Number.isFinite(it.extCost) ? it.extCost : it.quantity * it.unitCost;
    const sell = Number.isFinite(it.extSell) ? it.extSell : it.quantity * it.unitPrice;
    totalCost += cost;
    totalSell += sell;
  }

  // 6) Focused dev logging for 10 Oak Park (22PG3RyGrDnQ) — documentId-null-only diagnostic
  const TEN_OAK_PARK_ID = '22PG3RyGrDnQ';
  const TEN_OAK_PARK_UI_SELL = 249_488.81;
  const TEN_OAK_PARK_UI_COST = 135_708.06;

  if (jobId === TEN_OAK_PARK_ID && process.env.NODE_ENV !== 'production') {
    if (DEBUG_JOBTREAD_SYNC) {
      // eslint-disable-next-line no-console
      console.log(
        '[JobTread direct budget][10 Oak Park][documentId-null-only diagnostic]',
        {
          jobId,
          rawItemCount,
          filteredItemCount,
          filteredGroupCount,
          totalSell,
          totalCost,
          uiSell: TEN_OAK_PARK_UI_SELL,
          uiCost: TEN_OAK_PARK_UI_COST,
          deltaSell: totalSell - TEN_OAK_PARK_UI_SELL,
          deltaCost: totalCost - TEN_OAK_PARK_UI_COST,
        },
      );
    }
  }

  return {
    jobId,
    rawItemCount,
    filteredItemCount,
    filteredGroupCount,
    totalSell,
    totalCost,
  };
}

// Backwards-compatible wrappers / placeholders so older imports compile cleanly
// while the canonical sync pipeline is being stabilized.

export async function PricingGroupClassification(rawName: string) {
  return classifyPricingGroup(rawName);
}

export async function PricingGroupKind(): Promise<PricingGroupKind> {
  // Legacy debug export shim: return a dummy group kind.
  return 'ROOM' as PricingGroupKind;
}

export async function runBudgetTextDiffForJob(): Promise<void> {
  // Temporarily disabled during canonical sync refactor.
}

export async function getOfficialMatchedTotals(): Promise<null> {
  // Temporarily disabled during canonical sync refactor.
  return null;
}

export async function getLiveJobTreadBudgetTotals(jobId: string): Promise<JobTreadBudgetTotals> {
  if (jobId !== DEBUG_RECONCILE_JOB_ID) {
    throw new Error(
      `getLiveJobTreadBudgetTotals currently only supports jobId=${DEBUG_RECONCILE_JOB_ID}.`,
    );
  }

  return {
    sell: 865_121.5,
    cost: 532_318.79,
    groupCount: 141,
    itemCount: 686,
  };
}

export async function reconcileJobPricing(): Promise<JobPricingReconciliation | null> {
  // Temporarily disabled during canonical sync refactor.
  return null;
}
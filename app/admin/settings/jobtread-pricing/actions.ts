'use server';

import { requireAdmin } from '@/app/lib/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { rebuildPricingStaging } from '@/app/lib/jobtread/pricing-staging';
import { runPricingStagingDiagnostic, runDuplicationDiagnostic } from '@/app/lib/jobtread/pricing-staging-diagnostic';
import { runForcedPaveSourceDiagnostic, runRichJobTreadBudgetFilterDiagnostic, runDirectJobTreadBudgetForJob, type DirectJobTreadBudgetStats } from '@/app/integrations/jobtread-pricing';
import type { SectionCategory, PricingBasis, MeasurementMode, EstimateUnit } from '@/app/generated/prisma';
import { logDevError, logDevSyncRun, updateDevSyncRun } from '@/src/lib/dev-context';

export async function rebuildPricingStagingAction(): Promise<{
  ok: boolean;
  jobsCount: number;
  roomsCount: number;
  tradesCount: number;
}> {
  await requireAdmin();
  const route = '/admin/settings/jobtread-pricing';
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'local';
  const syncRunId = await logDevSyncRun({
    // batch-oriented rebuild path (not a single job sync)
    jobId: null,
    status: 'running',
    route,
    summary: 'pricing staging rebuild batch run started',
  });

  try {
    const result = await rebuildPricingStaging();
    if (syncRunId != null) {
      const c = result.classificationSummary;
      await updateDevSyncRun(syncRunId, {
        status: 'success',
        route,
        summary:
          `pricing staging rebuild batch run success; ` +
          `buildJobsFound=${c.buildJobsFound}, ` +
          `buildJobsIncluded=${c.buildJobsIncluded}, ` +
          `jobsSynced=${c.jobsSynced}, ` +
          `syncedBudgetRowsWritten=${c.syncedBudgetRowsWritten}, ` +
          `unchangedCount=${c.unchangedCount}`,
      });
    }
    revalidatePath('/admin/settings/jobtread-pricing');
    return { ok: true, ...result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (syncRunId != null) {
      await updateDevSyncRun(syncRunId, {
        status: 'failed',
        route,
        errorMessage: message,
        summary: 'pricing staging rebuild batch run failed',
      });
    }
    await logDevError({
      source: 'server',
      severity: 'error',
      message,
      route,
      component: 'rebuildPricingStagingAction',
      env,
      stack: e instanceof Error ? e.stack ?? null : null,
    });
    throw e;
  }
}

/** Dev-only: run one-job staging diagnostic (22PG3RyGrDnQ). Output is server log only. */
export async function runStagingDiagnosticAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Diagnostic is dev-only.' };
  }
  await runPricingStagingDiagnostic('22PG3RyGrDnQ');
  return { ok: true, message: 'Diagnostic run for 10 Oak Park (22PG3RyGrDnQ). Check server logs.' };
}

/** Dev-only: run duplication diagnostic for 125 South Shore #1302 (22PJXd2cjdhN). Logs to server; returns summary. */
export async function runDuplicationDiagnosticAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Duplication diagnostic is dev-only.' };
  }
  const summary = await runDuplicationDiagnostic('22PJXd2cjdhN');
  return { ok: true, message: summary };
}

/** Dev-only: forced Pave source diagnostic for 125 South Shore. Does NOT write to DB; runs even if job unchanged. */
export async function runForcedPaveSourceDiagnosticAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  return runForcedPaveSourceDiagnostic('22PJXd2cjdhN');
}

/** Dev-only: rich JobTread budget filter diagnostic for 125 South Shore. Full paginated rich fetch + subset comparison. */
export async function runRichJobTreadBudgetFilterDiagnosticAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  return runRichJobTreadBudgetFilterDiagnostic('22PJXd2cjdhN');
}

/** Dev-only: direct JobTread budget diagnostic for 10 Oak Park (22PG3RyGrDnQ). */
export async function runDirectBudgetDiagnosticForTenOakParkAction(): Promise<{ ok: boolean; stats?: DirectJobTreadBudgetStats; message?: string }> {
  await requireAdmin();
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Direct budget diagnostic is dev-only.' };
  }
  const stats = await runDirectJobTreadBudgetForJob('22PG3RyGrDnQ');
  return { ok: true, stats };
}

export async function setJobIncludeInPricingAction(
  jobId: string,
  include: boolean,
): Promise<void> {
  await requireAdmin();
  await prisma.pricingSourceJob.update({
    where: { jobId },
    data: { includeInPricing: include },
  });
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function setRoomIncludeInPricingAction(
  roomId: string,
  include: boolean,
): Promise<void> {
  await requireAdmin();
  await prisma.pricingSourceRoom.update({
    where: { id: roomId },
    data: { includeInPricing: include },
  });
  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function updateRoomManualSqFtOverrideAction(
  roomId: string,
  manualOverride: number | null,
): Promise<void> {
  await requireAdmin();

  const room = await prisma.pricingSourceRoom.findUnique({
    where: { id: roomId },
    select: {
      autoDetectedSqFt: true,
      totalCost: true,
      totalSell: true,
      sqFtSource: true,
    },
  });
  if (!room) return;

  const manual =
    manualOverride != null && Number.isFinite(manualOverride) && manualOverride > 0
      ? manualOverride
      : null;

  let effectiveSqFt: number | null = null;
  let sqFtSource: string | null = null;

  if (manual != null) {
    effectiveSqFt = manual;
    sqFtSource = 'manual';
  } else if (room.autoDetectedSqFt != null) {
    const auto = Number(room.autoDetectedSqFt);
    if (Number.isFinite(auto) && auto > 0) {
      effectiveSqFt = auto;
      sqFtSource = room.sqFtSource ?? null;
    }
  }

  const hasValidSqFt = effectiveSqFt != null && effectiveSqFt > 0;

  let costPerSqFt: number | null = null;
  let sellPerSqFt: number | null = null;
  if (hasValidSqFt) {
    const totalCost = Number(room.totalCost);
    const totalSell = Number(room.totalSell);
    if (Number.isFinite(totalCost)) {
      costPerSqFt = totalCost / effectiveSqFt!;
    }
    if (Number.isFinite(totalSell)) {
      sellPerSqFt = totalSell / effectiveSqFt!;
    }
  }

  await prisma.pricingSourceRoom.update({
    where: { id: roomId },
    data: {
      manualSqFtOverride: manual,
      hasValidSqFt,
      sqFtSource,
      costPerSqFt,
      sellPerSqFt,
    },
  });

  revalidatePath('/admin/settings/jobtread-pricing');
}

export async function updateRoomSectionTypeAction(
  roomId: string,
  sectionTypeId: string | null,
): Promise<void> {
  await requireAdmin();

  if (!sectionTypeId) {
    await prisma.pricingSourceRoom.update({
      where: { id: roomId },
      data: {
        sectionTypeId: null,
        normalizedRoomName: null,
        sectionTypeSource: null,
      },
    });
    revalidatePath('/admin/settings/jobtread-pricing');
    return;
  }

  const sectionType = await prisma.sectionType.findUnique({
    where: { id: sectionTypeId },
    select: { id: true, name: true },
  });
  if (!sectionType) return;

  await prisma.pricingSourceRoom.update({
    where: { id: roomId },
    data: {
      sectionTypeId: sectionType.id,
      normalizedRoomName: sectionType.name,
      sectionTypeSource: 'manual',
    },
  });

  revalidatePath('/admin/settings/jobtread-pricing');
}

type CreateSectionTypeForRoomInput = {
  name: string;
  category: SectionCategory;
  pricingBasis: PricingBasis;
};

export async function createSectionTypeForPricingRoomAction(
  roomId: string,
  input: CreateSectionTypeForRoomInput,
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = (input.name ?? '').trim();
  if (!name) {
    return { error: 'Name is required' };
  }

  const existingByName = await prisma.sectionType.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existingByName) {
    await prisma.pricingSourceRoom.update({
      where: { id: roomId },
      data: {
        sectionTypeId: existingByName.id,
        normalizedRoomName: name,
        sectionTypeSource: 'manual',
      },
    });
    revalidatePath('/admin/settings/jobtread-pricing');
    return {};
  }

  const pricingBasis = input.pricingBasis;
  let defaultMeasurementMode: MeasurementMode = 'NONE';
  let defaultEstimateUnit: EstimateUnit = 'CUSTOM';
  let customUnitLabel: string | null = null;

  if (pricingBasis === 'PER_SF') {
    defaultMeasurementMode = 'AREA';
    defaultEstimateUnit = 'SF';
  } else if (pricingBasis === 'PER_EACH') {
    defaultMeasurementMode = 'COUNT';
    defaultEstimateUnit = 'EA';
  } else if (pricingBasis === 'PER_JOB') {
    defaultMeasurementMode = 'NONE';
    defaultEstimateUnit = 'CUSTOM';
    customUnitLabel = 'Job';
  }

  const created = await prisma.sectionType.create({
    data: {
      name,
      category: input.category,
      defaultMeasurementMode,
      defaultEstimateUnit,
      customUnitLabel,
      pricingBasis,
    },
  });

  await prisma.pricingSourceRoom.update({
    where: { id: roomId },
    data: {
      sectionTypeId: created.id,
      normalizedRoomName: created.name,
      sectionTypeSource: 'manual',
    },
  });

  revalidatePath('/admin/settings/jobtread-pricing');
  return {};
}


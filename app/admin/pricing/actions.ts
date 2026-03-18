'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/app/lib/auth';
import { syncJobTreadPricing } from '@/app/integrations/jobtread-pricing';
import { rebuildPricingStaging } from '@/app/lib/jobtread/pricing-staging';

export async function syncJobTreadPricingAction(): Promise<{
  ok: boolean;
  error?: string;
  stats?: {
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
    stagingRebuild?: { jobsCount: number; roomsCount: number; tradesCount: number; scope: string };
  };
}> {
  await requireAdmin();

  try {
    const stats = await syncJobTreadPricing();
    let stagingRebuild: { jobsCount: number; roomsCount: number; tradesCount: number; scope: string } | undefined;
    if (stats.syncedJobIds?.length) {
      const rebuild = await rebuildPricingStaging({ jobIds: stats.syncedJobIds });
      stagingRebuild = {
        jobsCount: rebuild.jobsCount,
        roomsCount: rebuild.roomsCount,
        tradesCount: rebuild.tradesCount,
        scope: rebuild.scope,
      };
    }
    revalidatePath('/admin/pricing');
    revalidatePath('/admin/settings/jobtread-pricing');
    revalidatePath('/admin/settings/integrations');
    revalidatePath('/admin/settings');
    return { ok: true, stats: { ...stats, stagingRebuild } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}


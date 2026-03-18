import { requireAdmin } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import {
  getJobTreadDebugData,
  type JobTreadDebugData,
  getJobTreadRawCostData,
  type JobTreadRawCostData,
} from '@/app/integrations/jobtread-pricing';
import { JobTreadDebugExport } from '../JobTreadDebugExport';
import {
  getPricingImportReconciliationForJob,
  getDuplicateScopeAnalysisForJob,
  getPricingDedupeMetrics,
  getDedupedAppRowsForJob,
  getBenchmarkDiagnostic,
  getSourceSnapshotBudgetReconciliation,
} from '../sources/actions';
import { AppVsBudgetReconciliation } from './AppVsBudgetReconciliation';
import { BudgetTextDiffRunner } from './BudgetTextDiffRunner';

export const dynamic = 'force-dynamic';

function formatBoolean(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function JobSummary({ data }: { data: JobTreadDebugData }) {
  const { summary } = data;
  return (
    <div className="mb-6 grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Total jobs fetched
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.totalJobs}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Closed jobs (excluded)
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.closedJobs}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Jobs detected as Build
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.buildJobsDetected}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Top-level groups
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.totalTopLevelGroups}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Valid pricing groups
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.validPricingGroups}
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Invalid groups
        </div>
        <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {summary.invalidGroups}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function JobTreadPricingDebugPage() {
  await requireAdmin();
  const debugData = await getJobTreadDebugData();
  const snapshots: any[] = [];
  const reconciliation = await getPricingImportReconciliationForJob('22PJXd2cjdhN');
  const duplicateScope = await getDuplicateScopeAnalysisForJob('22PJXd2cjdhN');
  const dedupeMetrics = await getPricingDedupeMetrics();
  const rawCostData: JobTreadRawCostData = await getJobTreadRawCostData('22PJXd2cjdhN');
  const dedupedAppData = await getDedupedAppRowsForJob('22PJXd2cjdhN');
  const benchmarkDiagnostic = await getBenchmarkDiagnostic();
  const sourceSnapshotRec = await getSourceSnapshotBudgetReconciliation('22PJXd2cjdhN');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            JobTread Pricing Debug
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Inspect raw JobTread jobs and top-level cost groups used for pricing benchmarks. This
            view is for debugging only and does not change sync behavior.
          </p>
        </div>
      </header>

      <JobSummary data={debugData} />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Path-aware dedupe (sources / snapshots / benchmarks)
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Same logical line (path + name + qty + unit price/cost) counted once; duplicate rows removed in rollups only.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Deduped rows removed
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {dedupeMetrics.rowsRemoved}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Deduped sell removed
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(dedupeMetrics.sellRemoved)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Deduped cost removed
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(dedupeMetrics.costRemoved)}
            </div>
          </div>
        </div>
      </section>

      <JobTreadDebugExport debugData={debugData} />

      {dedupedAppData && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Live JobTread budget as source-of-truth (125 South Shore #1302)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              DataX / jobtread_get_job_budget: totalPrice, totalCost, groups=141, items=686.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Live budget (sell)</div>
                <div className="mt-1 font-semibold text-green-700 dark:text-green-400">
                  {formatCurrency(865121.4959172342)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Live budget (cost)</div>
                <div className="mt-1 font-semibold text-green-700 dark:text-green-400">
                  {formatCurrency(532318.7892911092)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">App deduped (sell)</div>
                <div className="mt-1 font-semibold">{formatCurrency(dedupedAppData.appSellTotal)}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">App deduped (cost)</div>
                <div className="mt-1 font-semibold">{formatCurrency(dedupedAppData.appCostTotal)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Sell overage:</span>{' '}
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {formatCurrency(dedupedAppData.appSellTotal - 865121.4959172342)}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Cost overage:</span>{' '}
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {formatCurrency(dedupedAppData.appCostTotal - 532318.7892911092)}
                </span>
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Deduped app rows (125 South Shore #1302)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Rows used in app totals after path-aware dedupe; includeInPricing only.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Rows:</span>{' '}
                <span className="font-semibold">{dedupedAppData.rows.length}</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Sell total:</span>{' '}
                <span className="font-semibold">{formatCurrency(dedupedAppData.appSellTotal)}</span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Cost total:</span>{' '}
                <span className="font-semibold">{formatCurrency(dedupedAppData.appCostTotal)}</span>
              </div>
            </div>
          </section>
        </>
      )}

      <AppVsBudgetReconciliation />

      <BudgetTextDiffRunner />

      {sourceSnapshotRec && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Source vs snapshot sum vs budget (125 South Shore #1302)
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Sources totals include all deduped includeInPricing items. Snapshots only include items under valid room
            groups (classifyPricingGroup). Items under non-room or invalid groups are in source but not in any snapshot.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Source (deduped) sell/cost</div>
              <div className="mt-1 font-semibold">
                {formatCurrency(sourceSnapshotRec.sourceSell)} / {formatCurrency(sourceSnapshotRec.sourceCost)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Snapshot sum sell/cost</div>
              <div className="mt-1 font-semibold">
                {formatCurrency(sourceSnapshotRec.snapshotSumSell)} / {formatCurrency(sourceSnapshotRec.snapshotSumCost)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Budget sell/cost</div>
              <div className="mt-1 font-semibold text-green-700 dark:text-green-400">
                {formatCurrency(sourceSnapshotRec.budgetSell)} / {formatCurrency(sourceSnapshotRec.budgetCost)}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
              Rows in source totals but not in any snapshot (non-room / invalid groups or ungrouped)
            </div>
            <div className="mt-1 font-semibold text-amber-700 dark:text-amber-400">
              {sourceSnapshotRec.itemsInSourceNotInSnapshot.length} rows · Sell{' '}
              {formatCurrency(sourceSnapshotRec.sellInSourceNotInSnapshot)} · Cost{' '}
              {formatCurrency(sourceSnapshotRec.costInSourceNotInSnapshot)}
            </div>
            {sourceSnapshotRec.itemsInSourceNotInSnapshot.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 text-xs dark:border-zinc-800">
                <table className="min-w-full">
                  <thead className="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Name</th>
                      <th className="px-2 py-1.5 text-left">Group path</th>
                      <th className="px-2 py-1.5 text-right">Sell</th>
                      <th className="px-2 py-1.5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {sourceSnapshotRec.itemsInSourceNotInSnapshot.slice(0, 30).map((row) => (
                      <tr key={row.id}>
                        <td className="px-2 py-1.5">{row.name}</td>
                        <td className="px-2 py-1.5">{row.groupPath}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(row.extendedSell)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(row.extendedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
            <strong>Recommendation:</strong> Sources totals and benchmark inputs should be computed from the same
            filtered set: only items under valid room groups (same as snapshots). That aligns project totals with
            snapshot sum and avoids counting non-room / cost-code buckets. Long-term, consider using JobTread budget
            (jobtread_get_job_budget) as the source of truth for project totals to match DataX exactly.
          </div>
        </section>
      )}

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">
          Benchmark enablement (current blocker)
        </h2>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
          The benchmark problem right now is not dedupe logic. It is that <strong>zero projects are enabled for pricing</strong>.
        </p>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-amber-900 dark:text-amber-100">
          <li>
            <strong>Where to enable:</strong> Go to{' '}
            <a
              href="/admin/settings/jobtread-pricing/sources"
              className="underline focus:outline focus:ring-2 focus:ring-amber-500"
            >
              JobTread Pricing → Sources
            </a>
            . Each project row has an <strong>Include</strong> checkbox; the data model is{' '}
            <code className="rounded bg-amber-200/50 px-1 dark:bg-amber-900/50">PricingImportProject.includeInPricing</code>.
          </li>
          <li>
            <strong>Enabling 125 South Shore #1302 is enough</strong> for snapshot creation: sync builds snapshots only for
            projects with <code className="rounded bg-amber-200/50 px-1 dark:bg-amber-900/50">includeInPricing=true</code>.
          </li>
          <li>
            <strong>After enabling:</strong> Check the project’s Include box on Sources, then run{' '}
            <strong>Sync JobTread Data</strong>. Re-check the diagnostic below: snapshots created? snapshots with
            flooringSf &gt; 0? benchmarks &gt; 0? If benchmarks are still zero, the diagnostic will show the next blocker
            (e.g. no room with flooring SF).
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Benchmark diagnostic (why benchmarks may be zero)
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Projects total
            </div>
            <div className="mt-1 font-semibold">{benchmarkDiagnostic.projectsTotal}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Projects includeInPricing
            </div>
            <div className="mt-1 font-semibold">{benchmarkDiagnostic.projectsWithIncludeInPricing}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Snapshots created?
            </div>
            <div className="mt-1 font-semibold">
              {benchmarkDiagnostic.snapshotCount > 0 ? `Yes (${benchmarkDiagnostic.snapshotCount})` : 'No'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Snapshots w/ flooring SF &gt; 0?
            </div>
            <div className="mt-1 font-semibold">
              {benchmarkDiagnostic.snapshotsWithFlooringSf > 0
                ? `Yes (${benchmarkDiagnostic.snapshotsWithFlooringSf})`
                : 'No'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Benchmarks
            </div>
            <div className="mt-1 font-semibold">{benchmarkDiagnostic.benchmarkCount}</div>
          </div>
        </div>
        {benchmarkDiagnostic.snapshotRoomNames.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Normalized room mappings present ({benchmarkDiagnostic.snapshotRoomNames.length} rooms)
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {benchmarkDiagnostic.snapshotRoomNames.join(', ')}
            </div>
          </div>
        )}
        {benchmarkDiagnostic.exactReasonBenchmarksZero && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Exact reason benchmarks are not generating:</strong>{' '}
            {benchmarkDiagnostic.exactReasonBenchmarksZero}
          </div>
        )}
        {benchmarkDiagnostic.reasons.length > 0 && !benchmarkDiagnostic.exactReasonBenchmarksZero && (
          <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {benchmarkDiagnostic.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      {duplicateScope && duplicateScope.crossRoomSets.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Repeated Items Across Different Rooms/Groups – 125 South Shore #1302
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Items with the same name and pricing that appear under different room or group paths.
                These are often normal (e.g., drywall, paint, electrical in multiple rooms).
              </p>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <div>
                <span className="font-medium">Repeated item patterns:</span>{' '}
                {duplicateScope.crossRoomSets.length}
              </div>
            </div>
          </header>

          <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-100 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Normalized name</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Unit cost</th>
                  <th className="px-3 py-2 text-left">Room / group paths</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                {duplicateScope.crossRoomSets.map((set) => {
                  const normalizedName = set.normalizedName;
                  return (
                    <tr key={set.coreKey}>
                      <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                        {normalizedName}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {set.quantity.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(set.unitPrice)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(set.unitCost)}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                        <div className="space-y-1">
                          {set.paths.map((path) => (
                            <div
                              key={path.pathKey}
                              className="border-b border-dotted border-zinc-200 pb-1 last:border-0 last:pb-0 dark:border-zinc-700"
                            >
                              <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                                Room:{' '}
                                {path.roomKey ?? '—'} · Group path: {path.groupPath}
                              </div>
                              <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                Items: {path.items.length} · Sell:{' '}
                                {formatCurrency(path.pathSellTotal)} · Cost:{' '}
                                {formatCurrency(path.pathCostTotal)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {duplicateScope && duplicateScope.suspiciousSets.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Suspicious Repeats Within Same Room/Group Path – 125 South Shore #1302
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Items with identical name, quantity, unit price, and unit cost that appear more than
                once within the same room/group path. These are the primary candidates for duplicate
                scope that inflates totals.
              </p>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <div>
                <span className="font-medium">Suspicious sell subtotal:</span>{' '}
                {formatCurrency(duplicateScope.suspiciousSellSubtotal)}
              </div>
              <div>
                <span className="font-medium">Suspicious cost subtotal:</span>{' '}
                {formatCurrency(duplicateScope.suspiciousCostSubtotal)}
              </div>
              <div>
                <span className="font-medium">Items with no room/group path:</span>{' '}
                {duplicateScope.itemsWithNoRoomOrGroupPath}
              </div>
            </div>
          </header>

          <div className="space-y-4 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                <thead className="bg-zinc-100 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Item name</th>
                    <th className="px-3 py-2 text-left">Room / group path</th>
                    <th className="px-3 py-2 text-left">JobTread item IDs</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    <th className="px-3 py-2 text-right">Sell total</th>
                    <th className="px-3 py-2 text-right">Cost total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                  {duplicateScope.suspiciousSets.map((set) =>
                    set.suspiciousPaths.map((path) => (
                      <tr key={`${set.coreKey}::${path.pathKey}`}>
                        <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                          {set.normalizedName}
                        </td>
                        <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                          Room:{' '}
                          {path.roomKey ?? '—'}
                          <br />
                          Path: {path.groupPath}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          {path.items.map((item) => item.jobtreadItemId).join(', ')}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {set.quantity.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(set.unitPrice)}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(set.unitCost)}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(path.pathSellTotal)}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(path.pathCostTotal)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Suspicious repeat subtotals above represent the portion of project sell/cost that is
              most likely double-counted within the same room/group path. We are not excluding
              anything yet; this section is for investigation only.
            </p>
          </div>
        </section>
      )}

      {duplicateScope && duplicateScope.suspiciousSets.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Raw JobTread Metadata Analysis – 125 South Shore #1302
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Shows raw costGroup and costItem objects from JobTread for a sample of suspicious
                duplicate-scope items so we can inspect any metadata differences.
              </p>
            </div>
          </header>

          <div className="space-y-4 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="grid gap-4 md:grid-cols-2">
              {duplicateScope.suspiciousSets.slice(0, 3).map((set) => {
                const normalizedName = set.normalizedName;

                return (
                  <div
                    key={set.coreKey}
                    className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Suspicious set: {normalizedName}
                    </div>
                    {set.suspiciousPaths.flatMap((path) =>
                      path.items.map((item) => {
                        const rawItem =
                          rawCostData.items.find(
                            (ri) =>
                              String((ri as { id?: unknown }).id ?? '') === item.jobtreadItemId,
                          ) ?? null;
                        const rawGroup =
                          item.groupJobtreadId &&
                          rawCostData.groups.find(
                            (rg) =>
                              String((rg as { id?: unknown }).id ?? '') === item.groupJobtreadId,
                          );

                        return (
                          <div
                            key={item.id}
                            className="space-y-1 rounded-md border border-dashed border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-1">
                              <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                                Item {item.jobtreadItemId}
                              </span>
                              <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                                Group: {item.groupName ?? '—'}
                              </span>
                            </div>

                            <div className="mt-1 grid gap-2 md:grid-cols-2">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Raw costItem
                                </div>
                                <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-zinc-900 p-1 text-[10px] text-zinc-100 dark:bg-black">
                                  {rawItem
                                    ? JSON.stringify(rawItem, null, 2)
                                    : '// Not found in raw costItems payload'}
                                </pre>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Raw costGroup
                                </div>
                                <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-zinc-900 p-1 text-[10px] text-zinc-100 dark:bg-black">
                                  {rawGroup
                                    ? JSON.stringify(rawGroup, null, 2)
                                    : '// Not found in raw costGroups payload'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        );
                      }),
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              To derive inclusion rules, compare metadata fields across the items in each suspicious
              set and note which fields (if any) consistently distinguish the scope that appears on
              the JobTread contract from prior/alternate/allowance scope.
            </p>
          </div>
        </section>
      )}

      {duplicateScope && duplicateScope.suspiciousSets.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Ground Truth Item Metadata Comparison – Living Room Electrical Romex
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Focused comparison of the two imported items that represent the visible JobTread
                line &quot;[ELE] Run 110 - Residential Romex Wiring&quot; under Living Room &gt; Electrical.
              </p>
            </div>
          </header>

          <div className="space-y-4 text-xs text-zinc-700 dark:text-zinc-300">
            {(() => {
              const matchSet = duplicateScope.suspiciousSets.find((set) =>
                set.normalizedName.includes('run 110 - residential romex wiring'),
              );
              const matchPath =
                matchSet &&
                matchSet.suspiciousPaths.find(
                  (path) =>
                    (path.roomKey ?? '').toLowerCase().includes('living room') &&
                    path.groupPath.toLowerCase().includes('electrical'),
                );
              const items = matchPath?.items ?? [];
              if (!matchSet || !matchPath || items.length < 2) {
                return (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Could not locate at least two suspicious items for the Living Room &gt; Electrical
                    Romex line in the current import. Verify that the latest sync has run and that the
                    item name and path have not changed.
                  </p>
                );
              }

              const [itemA, itemB] = items.slice(0, 2);

              const rawItemA =
                rawCostData.items.find(
                  (ri) => String((ri as { id?: unknown }).id ?? '') === itemA.jobtreadItemId,
                ) ?? null;
              const rawItemB =
                rawCostData.items.find(
                  (ri) => String((ri as { id?: unknown }).id ?? '') === itemB.jobtreadItemId,
                ) ?? null;

              const rawGroupA =
                itemA.groupJobtreadId &&
                rawCostData.groups.find(
                  (rg) =>
                    String((rg as { id?: unknown }).id ?? '') === itemA.groupJobtreadId,
                );
              const rawGroupB =
                itemB.groupJobtreadId &&
                rawCostData.groups.find(
                  (rg) =>
                    String((rg as { id?: unknown }).id ?? '') === itemB.groupJobtreadId,
                );

              function diffObjects(
                a: Record<string, unknown> | null,
                b: Record<string, unknown> | null,
              ): { key: string; a: unknown; b: unknown }[] {
                if (!a || !b) return [];
                const keys = new Set<string>([
                  ...Object.keys(a),
                  ...Object.keys(b),
                ]);
                const diffs: { key: string; a: unknown; b: unknown }[] = [];
                for (const key of keys) {
                  const av = a[key];
                  const bv = b[key];
                  const aJson = JSON.stringify(av);
                  const bJson = JSON.stringify(bv);
                  if (aJson !== bJson) {
                    diffs.push({ key, a: av, b: bv });
                  }
                }
                return diffs;
              }

              const itemDiffs = diffObjects(
                (rawItemA ?? null) as Record<string, unknown> | null,
                (rawItemB ?? null) as Record<string, unknown> | null,
              );
              const groupDiffs = diffObjects(
                (rawGroupA ?? null) as Record<string, unknown> | null,
                (rawGroupB ?? null) as Record<string, unknown> | null,
              );

              return (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Imported items (DB rows)
                      </div>
                      <div className="space-y-1">
                        <div>
                          <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            A: {itemA.jobtreadItemId} (row {itemA.id})
                          </div>
                          <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                            Qty {itemA.quantity.toFixed(2)} · Unit price {formatCurrency(
                              itemA.unitPrice,
                            )}{' '}
                            · Unit cost {formatCurrency(itemA.unitCost)}
                          </div>
                          <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                            Group: {itemA.groupName ?? '—'} (JobTread group ID:{' '}
                            {itemA.groupJobtreadId ?? '—'})
                          </div>
                        </div>
                        <div>
                          <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            B: {itemB.jobtreadItemId} (row {itemB.id})
                          </div>
                          <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                            Qty {itemB.quantity.toFixed(2)} · Unit price {formatCurrency(
                              itemB.unitPrice,
                            )}{' '}
                            · Unit cost {formatCurrency(itemB.unitCost)}
                          </div>
                          <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                            Group: {itemB.groupName ?? '—'} (JobTread group ID:{' '}
                            {itemB.groupJobtreadId ?? '—'})
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Suspicious path
                      </div>
                      <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                        Room: {matchPath.roomKey ?? '—'}
                        <br />
                        Path: {matchPath.groupPath}
                        <br />
                        Items in path: {items.length}
                        <br />
                        Path sell total: {formatCurrency(matchPath.pathSellTotal)}
                        <br />
                        Path cost total: {formatCurrency(matchPath.pathCostTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Raw costItem A vs B (diff)
                      </div>
                      {itemDiffs.length === 0 ? (
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          No differing fields detected between the two raw costItem objects. They
                          may be structurally identical in the payload.
                        </p>
                      ) : (
                        <div className="mt-1 max-h-48 overflow-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                          <table className="min-w-full divide-y divide-zinc-200 text-[11px] dark:divide-zinc-800">
                            <thead className="bg-zinc-100 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                              <tr>
                                <th className="px-2 py-1 text-left">Field</th>
                                <th className="px-2 py-1 text-left">A</th>
                                <th className="px-2 py-1 text-left">B</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                              {itemDiffs.map((d) => (
                                <tr key={d.key}>
                                  <td className="px-2 py-1 align-top font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                                    {d.key}
                                  </td>
                                  <td className="px-2 py-1 align-top text-[10px] text-zinc-900 dark:text-zinc-100">
                                    {JSON.stringify(d.a)}
                                  </td>
                                  <td className="px-2 py-1 align-top text-[10px] text-zinc-900 dark:text-zinc-100">
                                    {JSON.stringify(d.b)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Raw costGroup A vs B (diff)
                      </div>
                      {groupDiffs.length === 0 ? (
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          No differing fields detected between the two raw costGroup objects. They
                          may point to the same effective group.
                        </p>
                      ) : (
                        <div className="mt-1 max-h-48 overflow-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                          <table className="min-w-full divide-y divide-zinc-200 text-[11px] dark:divide-zinc-800">
                            <thead className="bg-zinc-100 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                              <tr>
                                <th className="px-2 py-1 text-left">Field</th>
                                <th className="px-2 py-1 text-left">A</th>
                                <th className="px-2 py-1 text-left">B</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                              {groupDiffs.map((d) => (
                                <tr key={d.key}>
                                  <td className="px-2 py-1 align-top font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                                    {d.key}
                                  </td>
                                  <td className="px-2 py-1 align-top text-[10px] text-zinc-900 dark:text-zinc-100">
                                    {JSON.stringify(d.a)}
                                  </td>
                                  <td className="px-2 py-1 align-top text-[10px] text-zinc-900 dark:text-zinc-100">
                                    {JSON.stringify(d.b)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Candidate fields for filtering should appear in the diff tables above. Look for
                    fields related to selection state, document linkage, alternates/options, or
                    version/source on either the costItem or costGroup objects that consistently
                    differ between the two entries.
                  </p>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {reconciliation && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Reconciliation – 125 South Shore #1302
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Compares imported JobTread items for this project against known JobTread totals to
                identify overage sources before benchmark generation.
              </p>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <div>
                <span className="font-medium">Expected sell:</span>{' '}
                {formatCurrency(reconciliation.expectedSellTotal)}
              </div>
              <div>
                <span className="font-medium">Expected cost:</span>{' '}
                {formatCurrency(reconciliation.expectedCostTotal)}
              </div>
            </div>
          </header>

          <div className="grid gap-4 text-xs md:grid-cols-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                App totals (included items)
              </div>
              <div className="mt-1 space-y-0.5 text-zinc-900 dark:text-zinc-100">
                <div>
                  Sell: {formatCurrency(reconciliation.appSellTotalIncluded)}
                </div>
                <div>
                  Cost: {formatCurrency(reconciliation.appCostTotalIncluded)}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                App totals (all items)
              </div>
              <div className="mt-1 space-y-0.5 text-zinc-900 dark:text-zinc-100">
                <div>
                  Sell: {formatCurrency(reconciliation.appSellTotalAll)}
                </div>
                <div>
                  Cost: {formatCurrency(reconciliation.appCostTotalAll)}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Variance (included vs expected)
              </div>
              <div className="mt-1 space-y-0.5 text-zinc-900 dark:text-zinc-100">
                <div>
                  Sell variance:{' '}
                  {formatCurrency(reconciliation.sellVarianceIncluded)}
                </div>
                <div>
                  Cost variance:{' '}
                  {formatCurrency(reconciliation.costVarianceIncluded)}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Data quality
              </div>
              <div className="mt-1 space-y-0.5 text-zinc-900 dark:text-zinc-100">
                <div>
                  Total imported items:{' '}
                  {reconciliation.rows.length}
                </div>
                <div>
                  Duplicate JobTread item IDs:{' '}
                  {reconciliation.duplicateJobtreadItemIds.length}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Top 25 contributors to sell overage (included items)
            </h3>
            <div className="max-h-80 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
              <table className="min-w-full divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
                <thead className="bg-zinc-100 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Item name</th>
                    <th className="px-3 py-2 text-left">JobTread item ID</th>
                    <th className="px-3 py-2 text-left">Group</th>
                    <th className="px-3 py-2 text-left">Pricing group</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    <th className="px-3 py-2 text-right">Sell total</th>
                    <th className="px-3 py-2 text-right">Cost total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                  {reconciliation.topOverageContributors.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                        {row.name}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {row.jobtreadItemId}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                        {row.groupName ?? '—'}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">
                        {row.normalizedPricingGroup ?? '—'}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {row.quantity.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(row.unitPrice)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(row.unitCost)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(row.extendedSell)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(row.extendedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-4">
        {debugData.jobs.map((job) => (
          <section
            key={job.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {job.name}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Job ID: <span className="font-mono text-[11px]">{job.id}</span>
                </p>
              </div>
              <div className="text-right text-xs text-zinc-600 dark:text-zinc-400">
                <div>
                  <span className="font-medium">Raw stage (from API):</span>{' '}
                  <span className="font-mono text-[11px]">
                    {job.rawStage ?? '—'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Normalized stage (used by app):</span>{' '}
                  <span className="font-mono text-[11px]">{job.normalizedStage}</span>
                </div>
                <div>
                  <span className="font-medium">Closed on:</span>{' '}
                  <span className="font-mono text-[11px]">
                    {job.closedOn !== null && job.closedOn !== undefined
                      ? String(job.closedOn)
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Included as Build:</span>{' '}
                  {formatBoolean(job.isBuildIncluded)}
                </div>
                <div>
                  <span className="font-medium">Excluded because closed:</span>{' '}
                  {formatBoolean(job.isExcludedBecauseClosed)}
                </div>
                <div className="mt-1 border-t border-zinc-200 pt-1 dark:border-zinc-700">
                  <span className="font-medium">Raw top-level groups:</span>{' '}
                  {job.totalRawTopLevelGroups}
                  {' · '}
                  <span className="font-medium">Valid after classification:</span>{' '}
                  {job.totalValidAfterClassification}
                  {' · '}
                  <span className="font-medium">After dedupe:</span>{' '}
                  {job.totalAfterDedupe}
                </div>
              </div>
            </header>

            <div className="mt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Top-level cost groups (parent costGroup only; not costCode/costType)
              </h3>
              {job.topLevelGroups.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No top-level cost groups found for this job.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <table className="min-w-full divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
                    <thead className="bg-zinc-100 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Raw group name</th>
                        <th className="px-3 py-2 text-left">Normalized pricing group</th>
                        <th className="px-3 py-2 text-left">Kind</th>
                        <th className="px-3 py-2 text-center">Valid</th>
                        <th className="px-3 py-2 text-center">Dropped as duplicate</th>
                        <th className="px-3 py-2 text-left">Exclusion reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                      {job.topLevelGroups.map((g) => (
                        <tr key={g.id}>
                          <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                            {g.name}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            {g.normalizedPricingGroup ?? '—'}
                          </td>
                          <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
                            {g.groupKind}
                          </td>
                          <td className="px-3 py-2 align-top text-center text-zinc-900 dark:text-zinc-100">
                            {formatBoolean(g.isValidPricingGroup)}
                          </td>
                          <td className="px-3 py-2 align-top text-center text-zinc-900 dark:text-zinc-100">
                            {formatBoolean(g.droppedAsDuplicate)}
                          </td>
                          <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
                            {g.exclusionReason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Current Pricing Snapshots (DB)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Raw rows from <code className="font-mono text-[11px]">PricingRoomSnapshot</code>{' '}
              after the latest sync. Use this to confirm which rooms are actually contributing to
              benchmarks.
            </p>
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Total snapshots:</span> {snapshots.length}
          </div>
        </header>

        {snapshots.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No pricing snapshots are currently stored.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
                <thead className="bg-zinc-100 text-[11px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Room name</th>
                    <th className="px-3 py-2 text-left">Job name</th>
                    <th className="px-3 py-2 text-left">Job ID</th>
                    <th className="px-3 py-2 text-right">Flooring SF</th>
                    <th className="px-3 py-2 text-right">Sell total</th>
                    <th className="px-3 py-2 text-right">Cost total</th>
                    <th className="px-3 py-2 text-right">Sell $/SF</th>
                    <th className="px-3 py-2 text-right">Cost $/SF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                  {snapshots.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                        {s.roomName}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-100">
                        {s.jobName}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {s.jobId}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {s.flooringSf.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {s.sellTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {s.costTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {s.sellPerSf.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
                        {s.costPerSf.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


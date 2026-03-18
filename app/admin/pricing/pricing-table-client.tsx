'use client';

import { useTransition, useState } from 'react';
import { syncJobTreadPricingAction } from './actions';

export type BenchmarkRow = {
  roomName: string;
  avgSellPerSf: number;
  avgCostPerSf: number;
  minSellPerSf: number;
  maxSellPerSf: number;
  jobsIncluded: number;
};

function formatMoneyPerSf(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString()}/SF`;
}

function formatPlainMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString()}`;
}

type Props = {
  benchmarks: BenchmarkRow[];
};

export function PricingTableClient({ benchmarks }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            JobTread Room Pricing
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Benchmarks computed from active JobTread Build jobs by room type.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccessMessage(null);
              startTransition(async () => {
                const result = await syncJobTreadPricingAction();
                if (!result.ok) {
                  setError(result.error ?? 'Failed to sync JobTread data.');
                } else {
                  const stats = result.stats;
                  setSuccessMessage(
                    stats
                      ? stats.buildJobsFound === 0
                        ? 'No Build jobs found.'
                        : `${stats.buildJobsFound} Build jobs found; ${stats.jobsSynced} synced (${stats.jobsNew} new, ${stats.jobsChanged} changed), ${stats.jobsSkippedUnchanged} skipped (unchanged).`
                      : 'Sync completed.',
                  );
                }
              });
            }}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? 'Syncing…' : 'Sync JobTread Data'}
          </button>
          {successMessage && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {successMessage}
            </span>
          )}
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Room
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Avg $/SF
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Avg Cost $/SF
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Jobs Used
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Min
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Max
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white text-sm dark:divide-zinc-800 dark:bg-zinc-900">
            {benchmarks.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No pricing benchmarks yet. Run a sync to pull JobTread data.
                </td>
              </tr>
            ) : (
              benchmarks.map((row) => (
                <tr key={row.roomName}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {row.roomName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100">
                    {formatMoneyPerSf(row.avgSellPerSf)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100">
                    {formatMoneyPerSf(row.avgCostPerSf)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100">
                    {row.jobsIncluded}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100">
                    {formatPlainMoney(row.minSellPerSf)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100">
                    {formatPlainMoney(row.maxSellPerSf)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


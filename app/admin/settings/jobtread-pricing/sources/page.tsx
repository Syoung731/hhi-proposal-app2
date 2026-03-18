import { requireAdmin } from '@/app/lib/auth';
import { getPricingImportSources } from './actions';
import { JobTreadSourcesClient } from './JobTreadSourcesClient';

export const dynamic = 'force-dynamic';

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

export default async function JobTreadPricingSourcesPage() {
  await requireAdmin();
  const projects = await getPricingImportSources();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="min-h-[400px] w-full rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 lg:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            JobTread Pricing Sources
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Review imported JobTread projects, groups, and line items. Use the include toggles to
            control which records feed pricing benchmarks.
          </p>
        </header>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No JobTread pricing data has been imported yet. Run a JobTread sync from the main
            JobTread Pricing page.
          </p>
        ) : (
          <JobTreadSourcesClient projects={projects} />
        )}
      </div>
    </div>
  );
}


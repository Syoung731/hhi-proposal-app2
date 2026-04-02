import { TemplatesTab } from "../templates-tab";

export default function AIPricingTemplatesPage() {
  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          AI Pricing
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Room Templates
        </p>
      </header>
      <TemplatesTab />
    </div>
  );
}

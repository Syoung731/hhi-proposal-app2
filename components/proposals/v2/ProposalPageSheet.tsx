import type { ProposalPage } from "./page-model";
import { tokens } from "./tokens";

export type ProposalPageSheetProps = {
  page: ProposalPage;
  children: React.ReactNode;
};

/**
 * Wraps a single proposal page as a "presentation sheet": label above, then a centered
 * white page surface with rounded corners, border, and soft shadow.
 */
export function ProposalPageSheet({ page, children }: ProposalPageSheetProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-full max-w-4xl px-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between"
        aria-hidden
      >
        <span>
          {page.type} · {page.layoutKey}
        </span>
        <span>#{page.order + 1}</span>
      </div>
      <div
        className={`w-full max-w-4xl rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 overflow-hidden ${tokens.section.inner} py-10 md:py-14`}
      >
        {children}
      </div>
    </div>
  );
}

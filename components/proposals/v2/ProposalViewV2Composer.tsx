"use client";

import type { ProposalPageConfig } from "./page-model";
import type { ProposalV2SectionProps } from "./mock-data-adapter";
import { useProposalPageConfigState } from "./useProposalPageConfigState";
import { ProposalPageBuilderPanel } from "./ProposalPageBuilderPanel";
import { ProposalPageSheet } from "./ProposalPageSheet";
import { ProposalPageRenderer } from "./ProposalPageRenderer";

export type ProposalViewV2ComposerProps = {
  initialPages: ProposalPageConfig;
  sectionProps: ProposalV2SectionProps;
};

const sorted = (pages: ProposalPageConfig) =>
  [...pages].sort((a, b) => a.order - b.order);

/**
 * DEV-ONLY: Client-side page composer for view-v2. Renders builder panel + preview.
 * Preview shows only enabled pages as presentation sheets; panel shows all pages.
 */
export function ProposalViewV2Composer({
  initialPages,
  sectionProps,
}: ProposalViewV2ComposerProps) {
  const [pages, actions] = useProposalPageConfigState(initialPages);
  const ordered = sorted(pages);
  const enabled = ordered.filter((p) => p.isEnabled);

  return (
    <div className="flex min-h-screen">
      <ProposalPageBuilderPanel pages={pages} actions={actions} />

      <main className="flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950 py-10 md:py-14">
        <div className="mx-auto max-w-4xl px-4 flex flex-col gap-12 md:gap-16">
          {enabled.map((page) => (
            <ProposalPageSheet key={page.id} page={page}>
              <ProposalPageRenderer
                page={page}
                sectionProps={sectionProps}
              />
            </ProposalPageSheet>
          ))}
          {enabled.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 p-8 text-center text-zinc-500 dark:text-zinc-400 text-sm">
              No pages enabled. Enable pages in the panel or add a new page.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

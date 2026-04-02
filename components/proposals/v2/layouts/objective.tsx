import { ProposalObjective } from "../ProposalObjective";
import type { ProposalLayoutProps } from "./types";

/** objective.statement-left — headline and statement with bullets (default). */
export function ObjectiveStatementLeft({ page, sectionProps }: ProposalLayoutProps) {
  const o = sectionProps.objective;
  return (
    <ProposalObjective
      headline={page.title ?? o.headline}
      objective={o.objective}
      bullets={o.bullets}
    />
  );
}

/** objective.image-right — statement left, placeholder/image right. */
export function ObjectiveImageRight({ page, sectionProps }: ProposalLayoutProps) {
  const o = sectionProps.objective;
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
      <div>
        <ProposalObjective
          headline={page.title ?? o.headline}
          objective={o.objective}
          bullets={o.bullets}
        />
      </div>
      <div className="min-h-[200px] rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm">
        Image
      </div>
    </section>
  );
}

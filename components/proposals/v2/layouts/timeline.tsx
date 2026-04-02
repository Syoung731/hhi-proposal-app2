import { ProposalTimeline } from "../ProposalTimeline";
import { tokens } from "../tokens";
import type { ProposalLayoutProps } from "./types";

/** timeline.horizontal-steps — horizontal timeline (desktop) / stacked (mobile). */
export function TimelineHorizontalSteps({ page, sectionProps }: ProposalLayoutProps) {
  const t = sectionProps.timeline;
  return (
    <ProposalTimeline
      title={page.title ?? t.title}
      phases={t.phases}
    />
  );
}

/** timeline.process-cards — each phase as a card. */
export function TimelineProcessCards({ page, sectionProps }: ProposalLayoutProps) {
  const t = sectionProps.timeline;
  if (!t.phases.length) return null;
  const title = page.title ?? t.title;
  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {t.phases.map((phase) => (
          <div key={phase.id} className={tokens.card}>
            <p className={`font-medium ${tokens.accent.text}`}>{phase.title}</p>
            <p className={`text-sm ${tokens.muted} mt-1`}>{phase.duration}</p>
            {phase.description && (
              <p className={`text-sm ${tokens.mutedStrong} mt-2`}>{phase.description}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

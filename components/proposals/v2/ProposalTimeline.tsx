import { tokens } from "./tokens";

export type TimelinePhase = {
  id: string;
  title: string;
  duration: string;
  description?: string | null;
};

export type ProposalTimelineProps = {
  title?: string;
  phases: readonly TimelinePhase[];
};

export function ProposalTimeline({
  title = "Timeline",
  phases,
}: ProposalTimelineProps) {
  if (!phases.length) return null;

  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      {/* Desktop: horizontal timeline with connector */}
      <div className="mt-8 hidden md:block">
        <div className="flex">
          {phases.map((phase, i) => (
            <div key={phase.id} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {i > 0 && (
                  <div
                    className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700 -mr-[1px]"
                    aria-hidden
                  />
                )}
                <div
                  className={`shrink-0 w-3 h-3 rounded-full border-2 ${tokens.accent.border} bg-white dark:bg-zinc-900`}
                  aria-hidden
                />
                {i < phases.length - 1 && (
                  <div
                    className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700 -ml-[1px]"
                    aria-hidden
                  />
                )}
              </div>
              <div className="mt-4 w-full px-2 text-center">
                <p className={`font-medium text-sm ${tokens.accent.text}`}>
                  {phase.title}
                </p>
                <p className={`text-xs ${tokens.muted} mt-0.5`}>
                  {phase.duration}
                </p>
                {phase.description && (
                  <p className={`text-xs ${tokens.mutedStrong} mt-2 max-w-[140px] mx-auto`}>
                    {phase.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Mobile: stacked */}
      <ul className="mt-8 space-y-4 md:hidden">
        {phases.map((phase) => (
          <li
            key={phase.id}
            className={`${tokens.cardSoft} border-l-4 ${tokens.accent.border} pl-5`}
          >
            <p className={`font-medium ${tokens.accent.text}`}>
              {phase.title}
            </p>
            <p className={`text-sm ${tokens.muted} mt-0.5`}>
              {phase.duration}
            </p>
            {phase.description && (
              <p className={`text-sm ${tokens.mutedStrong} mt-2`}>
                {phase.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

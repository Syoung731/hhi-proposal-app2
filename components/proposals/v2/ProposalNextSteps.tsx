import { tokens } from "./tokens";

export type NextStepItem = {
  id: string;
  stepNumber: number;
  title: string;
  description?: string | null;
};

export type ProposalNextStepsProps = {
  title?: string;
  steps: readonly NextStepItem[];
};

export function ProposalNextSteps({
  title = "Next Steps",
  steps,
}: ProposalNextStepsProps) {
  if (!steps.length) return null;

  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className="mt-8 space-y-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`${tokens.cardSoft} flex gap-4 md:gap-6`}
          >
            <div
              className={`shrink-0 w-10 h-10 rounded-full ${tokens.accent.bg} border ${tokens.accent.border} flex items-center justify-center text-sm font-medium text-zinc-700 dark:text-zinc-300`}
              aria-hidden
            >
              {step.stepNumber}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={tokens.heading.h4}>{step.title}</h3>
              {step.description && (
                <p className={`mt-1 text-sm ${tokens.mutedStrong}`}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

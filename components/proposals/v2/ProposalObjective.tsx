import { tokens } from "./tokens";

export type ProposalObjectiveProps = {
  headline?: string | null;
  objective?: string | null;
  /** 3 compact trust/value bullets */
  bullets?: readonly string[];
};

export function ProposalObjective({
  headline = "Objective",
  objective,
  bullets = [],
}: ProposalObjectiveProps) {
  return (
    <section>
      <h2 className={tokens.heading.h2}>{headline}</h2>
      <div className={`mt-6 ${tokens.section.block}`}>
        {objective && (
          <p className={`text-lg ${tokens.mutedStrong} leading-relaxed max-w-2xl`}>
            {objective}
          </p>
        )}
        {bullets.length > 0 && (
          <ul className="mt-6 space-y-2 max-w-2xl">
            {bullets.slice(0, 3).map((text, i) => (
              <li
                key={i}
                className={`flex gap-3 text-sm ${tokens.mutedStrong}`}
              >
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5">
                  —
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

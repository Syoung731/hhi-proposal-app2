import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { EditorialSectionHeading } from "@/components/public/blocks";

function formatPhaseLabel(phase: string): string {
  return phase
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const { timelinePhases } = data.snapshot;

  return (
    <article className="space-y-10 pt-8 sm:pt-12">
      <EditorialSectionHeading kicker="Schedule" title="Timeline" />
      {timelinePhases.length > 0 ? (
        <ul className="space-y-4 border-l-2 border-zinc-200 pl-6 dark:border-zinc-700">
          {timelinePhases.map((phase) => (
            <li key={phase.id} className="relative -left-[1.625rem]">
              <span
                className="absolute left-0 h-3 w-3 rounded-full bg-zinc-400 dark:bg-zinc-500"
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatPhaseLabel(phase.phase)}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {phase.durationText || "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-2xl text-zinc-500 dark:text-zinc-500">
          No timeline phases defined.
        </p>
      )}
    </article>
  );
}

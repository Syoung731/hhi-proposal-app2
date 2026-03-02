import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { EditorialSectionHeading } from "@/components/public/blocks";

export default async function NextStepsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  return (
    <article className="space-y-10 pt-8 sm:pt-12">
      <EditorialSectionHeading kicker="What's next" title="Next Steps" />
      <p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        [Contact and next-step placeholders – to be configured.]
      </p>
    </article>
  );
}

import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { EditorialSectionHeading } from "@/components/public/blocks";

export default async function ClosingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const { project } = data.snapshot;

  return (
    <article className="space-y-10 pt-8 sm:pt-12">
      <EditorialSectionHeading title="Thank you" />
      <p className="max-w-2xl text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
        We look forward to bringing {project.title} to life with you.
      </p>
    </article>
  );
}

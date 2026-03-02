import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { getLayoutConfig } from "@/app/lib/layout-config";
import { isBadPlaceholderUrl } from "@/app/lib/media";
import {
  EditorialSectionHeading,
  EditorialTwoCol,
  EditorialGallery,
  type EditorialGalleryImage,
} from "@/components/public/blocks";

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const cfg = getLayoutConfig(data.publicLayoutConfig);
  const { snapshot } = data;
  const { project, media } = snapshot;
  const galleryImages: EditorialGalleryImage[] = media
    .filter((m) => m.url && !isBadPlaceholderUrl(m.url))
    .slice(0, 4)
    .map((m) => ({ id: m.id, url: m.url, caption: m.caption }));

  const pillars = ["Quality", "Clarity", "Execution"];
  const variant = cfg.pages.objective.variant;

  if (variant === "fullBleedQuote") {
    return (
      <article className="space-y-14 pt-8 sm:pt-12">
        <EditorialSectionHeading
          kicker="Overview"
          title="Project Objective"
          accentRule
        />
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/80 py-16 dark:border-zinc-700/80 dark:bg-zinc-800/30 sm:py-20 md:py-24">
          <blockquote className="mx-auto max-w-[720px] px-8 text-center sm:px-12">
            <p className="whitespace-pre-wrap text-xl leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-2xl md:text-[1.6rem]">
              {project.objective ?? "No objective provided."}
            </p>
          </blockquote>
          {pillars.length > 0 && (
            <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-1">
              {pillars.map((label) => (
                <span
                  key={label}
                  className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-14 pt-8 sm:pt-12">
      <EditorialSectionHeading
        kicker="Overview"
        title="Project Objective"
        accentRule
      />
      <EditorialTwoCol
        className="mt-6"
        left={
          <div className="max-w-[520px] space-y-6">
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
              {project.objective ?? "No objective provided."}
            </p>
            {pillars.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {pillars.map((label) => (
                  <span
                    key={label}
                    className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        }
        right={
          galleryImages.length > 0 ? (
            <EditorialGallery
              images={galleryImages}
              variant="one-large-two-small"
              aspect="4/3"
            />
          ) : (
            <div className="aspect-[4/3] rounded-2xl border border-zinc-200/80 bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-800/50" />
          )
        }
      />
    </article>
  );
}

"use client";

import type { ObjectivePageConfig } from "@/app/lib/layout-config";
import {
  EditorialSectionHeading,
  EditorialTwoCol,
  type EditorialGalleryImage,
} from "@/components/public/blocks";
import { isBadPlaceholderUrl } from "@/app/lib/media";

export type ObjectiveMediaItem = {
  id: string;
  url: string;
  caption?: string | null;
};

type ObjectiveRendererProps = {
  /** Merged objective config (variant, title, objectiveText, commitments, photoSlots). */
  config: ObjectivePageConfig;
  /** Media items keyed by id; used to resolve photoSlots[].libraryMediaId to URLs. */
  media: ObjectiveMediaItem[];
  /** When true, render for fixed-height preview frame (no vh-based spacing). */
  preview?: boolean;
};

function resolveGalleryImages(
  photoSlots: ObjectivePageConfig["photoSlots"],
  media: ObjectiveMediaItem[]
): EditorialGalleryImage[] {
  const slots = (photoSlots ?? []).slice(0, 3);
  return (
    slots
    .map((slot) => {
      const id = slot?.libraryMediaId ?? null;
      if (!id) return null;
      const item = media.find((m) => m.id === id);
      const url = item?.url?.trim() ? item.url : null;
      return { id, url, caption: item?.caption ?? null };
    })
    .filter((x) => x != null && x.url != null)
  ) as EditorialGalleryImage[];
}

const checkIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function ObjectiveRenderer({
  config,
  media,
  preview = false,
}: ObjectiveRendererProps) {
  const variant = config.variant ?? "twoColGallery";
  const title = (config.title ?? "Project Objective").trim() || "Project Objective";
  const objectiveText = config.objectiveText ?? "";
  const commitments = (config.commitments ?? []).slice(0, 3);
  const galleryImages = resolveGalleryImages(config.photoSlots, media);

  if (variant === "fullBleedQuote") {
    return (
      <article className={preview ? "space-y-6" : "space-y-14 pt-8 sm:pt-12"}>
        <EditorialSectionHeading
          kicker="Overview"
          title={title}
          accentRule
        />
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/80 py-16 dark:border-zinc-700/80 dark:bg-zinc-800/30 sm:py-20 md:py-24">
          <blockquote className="mx-auto max-w-[720px] px-8 text-center sm:px-12">
            <p className="whitespace-pre-wrap text-xl leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-2xl md:text-[1.6rem]">
              {objectiveText || "No objective provided."}
            </p>
          </blockquote>
          {commitments.some((c) => (c ?? "").trim()) && (
            <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-1">
              {commitments.filter((c) => (c ?? "").trim()).map((label, idx) => (
                <span
                  key={idx}
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

  // Template A (NotebookLM-style): serif headline, Key Commitments with check icons, 1+2 collage
  const imageWrap = "relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)]";

  const renderCommitment = (c: string, idx: number) => {
    const text = (c ?? "").trim();
    if (!text) return null;
    const colonIdx = text.indexOf(":");
    const hasLabel = colonIdx > 0 && colonIdx < text.length - 1;
    const label = hasLabel ? text.slice(0, colonIdx).trim() : "";
    const body = hasLabel ? text.slice(colonIdx + 1).trim() : text;
    return (
      <div key={idx} className="flex items-start gap-3">
        <span className="mt-[0.35em] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/90 text-white" aria-hidden>
          {checkIcon}
        </span>
        <p className="min-w-0 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {hasLabel && label ? (
            <>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{label}:</span>{" "}
              {body}
            </>
          ) : (
            text
          )}
        </p>
      </div>
    );
  };

  const rightCollage =
    galleryImages.length > 0 ? (
      <div className="grid gap-3 sm:gap-4">
        {galleryImages[0] && (
          <div className={`${imageWrap} aspect-[16/10]`}>
            {galleryImages[0].url && !isBadPlaceholderUrl(galleryImages[0].url) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={galleryImages[0].url}
                alt={galleryImages[0].caption ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                No image
              </div>
            )}
          </div>
        )}
        {galleryImages.length > 1 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {galleryImages.slice(1, 3).map((img) => (
              <div key={img.id} className={`${imageWrap} aspect-[4/3]`}>
                {img.url && !isBadPlaceholderUrl(img.url) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={img.url}
                    alt={img.caption ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                    No image
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ) : (
      <div className="aspect-[4/3] rounded-2xl border border-zinc-200/80 bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-800/50" />
    );

  return (
    <article className={preview ? "space-y-4" : "space-y-14 pt-8 sm:pt-12"}>
      <EditorialTwoCol
        className={preview ? "mt-0" : "mt-6"}
        left={
          <div className="max-w-[520px] space-y-4">
            <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
              {title}
            </h1>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-lg">
              {objectiveText || "No objective provided."}
            </p>
            {commitments.some((c) => (c ?? "").trim()) ? (
              <div className="mt-5 space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 sm:text-lg">
                  Key Commitments
                </h2>
                <div className="space-y-2.5">
                  {commitments.filter((c) => (c ?? "").trim()).map((c, idx) => renderCommitment(c, idx))}
                </div>
              </div>
            ) : null}
          </div>
        }
        right={rightCollage}
      />
    </article>
  );
}

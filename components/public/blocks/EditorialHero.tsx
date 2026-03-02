"use client";

import { isBadPlaceholderUrl } from "@/app/lib/media";

const imageWrapperClass =
  "relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)]";

type EditorialHeroProps = {
  /** Hero image URL; omit or use bad placeholder to show placeholder block */
  imageUrl?: string | null;
  /** Optional badge line above title (e.g. "Project Investment & Design Concept") */
  badge?: string | null;
  /** Main title */
  title: React.ReactNode;
  /** Optional subtitle below title */
  subtitle?: React.ReactNode | null;
  /** Optional lines below (e.g. address, prepared for) */
  children?: React.ReactNode;
  /** Image aspect ratio (default 16/10 for editorial hero) */
  imageAspect?: "16/10" | "4/3" | "3/2";
  /** When true, use fixed height for live preview (no vh) */
  preview?: boolean;
};

export function EditorialHero({
  imageUrl,
  badge,
  title,
  subtitle,
  children,
  imageAspect = "16/10",
  preview = false,
}: EditorialHeroProps) {
  const aspectClass =
    imageAspect === "4/3"
      ? "aspect-[4/3]"
      : imageAspect === "3/2"
        ? "aspect-[3/2]"
        : "aspect-[16/10]";

  const hasImage =
    imageUrl != null &&
    imageUrl !== "" &&
    !isBadPlaceholderUrl(imageUrl);

  if (hasImage) {
    return (
      <article className={preview ? "pt-0" : "pt-2 sm:pt-4"}>
        <section className="relative">
          <div
            className={`${imageWrapperClass} relative ${preview ? "h-[450px] min-h-0" : "min-h-[70vh]"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Subtle bottom gradient for text legibility */}
            <div
              className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 via-black/20 to-transparent"
              aria-hidden
            />
            <div
              className={`absolute inset-x-0 bottom-0 text-left ${preview ? "p-3" : "p-8 sm:p-10 md:p-12"}`}
            >
              <div className={`space-y-2 ${preview ? "max-w-full" : "max-w-[900px]"}`}>
                {badge && (
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/90">
                    {badge}
                  </p>
                )}
                <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl md:text-5xl">
                  {title}
                </h1>
                <div className="h-px w-16 bg-white/60" aria-hidden />
                {subtitle != null && subtitle !== "" && (
                  <p className="text-lg text-white/95 sm:text-xl">
                    {subtitle}
                  </p>
                )}
                {children && (
                  <div className="space-y-0.5 pt-2 text-[11px] font-medium uppercase tracking-widest text-white/70">
                    {children}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </article>
    );
  }

  return (
    <article className="space-y-8 pt-8 sm:pt-12">
      <section className="text-center">
        {imageUrl != null && imageUrl !== "" && (
          <div className={`${imageWrapperClass} ${aspectClass} mb-8`}>
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              No image
            </div>
          </div>
        )}
        {badge && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {badge}
          </p>
        )}
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
          {title}
        </h1>
        {subtitle != null && subtitle !== "" && (
          <p className="mt-4 text-xl text-zinc-600 dark:text-zinc-400">
            {subtitle}
          </p>
        )}
        {children && (
          <div className="mt-4 space-y-1 text-zinc-500 dark:text-zinc-500">
            {children}
          </div>
        )}
      </section>
    </article>
  );
}

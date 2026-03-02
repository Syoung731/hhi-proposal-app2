"use client";

import { isBadPlaceholderUrl } from "@/app/lib/media";

const imageWrapperClass =
  "relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)]";

type SplitCoverProps = {
  imageUrl?: string | null;
  badge?: string | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode | null;
  children?: React.ReactNode;
  /** When true, use fixed height for live preview (no vh) */
  preview?: boolean;
};

export function SplitCover({
  imageUrl,
  badge,
  title,
  subtitle,
  children,
  preview = false,
}: SplitCoverProps) {
  const hasImage =
    imageUrl != null &&
    imageUrl !== "" &&
    !isBadPlaceholderUrl(imageUrl);

  return (
    <article className={preview ? "pt-0" : "pt-2 sm:pt-4"}>
      <section
        className={`grid gap-0 md:grid-cols-[1fr_1fr] md:gap-16 lg:gap-20 ${preview ? "min-h-0 h-[450px]" : "min-h-[70vh]"}`}
      >
        <div
          className={`relative ${preview ? "min-h-0 h-full" : "min-h-[50vh] md:min-h-0"} ${imageWrapperClass}`}
        >
          {hasImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              No image
            </div>
          )}
        </div>
        <div
          className={`flex flex-col justify-center md:pl-0 ${preview ? "px-3 py-4" : "px-2 py-12 md:py-16"}`}
        >
          <div className={`space-y-5 ${preview ? "max-w-full space-y-1" : "max-w-[520px]"}`}>
            {badge && (
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                {badge}
              </p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl md:text-[2.5rem]">
              {title}
            </h1>
            <div className="h-px w-16 bg-zinc-300 dark:bg-zinc-600" aria-hidden />
            {subtitle != null && subtitle !== "" && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                {subtitle}
              </p>
            )}
            {children && (
              <div className="space-y-0.5 pt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {children}
              </div>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}

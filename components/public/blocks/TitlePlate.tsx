"use client";

import { isBadPlaceholderUrl } from "@/app/lib/media";

const imageWrapperClass =
  "relative w-full overflow-hidden rounded-t-2xl border border-b-0 border-zinc-200/80 bg-zinc-50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)]";

type TitlePlateProps = {
  imageUrl?: string | null;
  badge?: string | null;
  title: React.ReactNode;
  subtitle?: React.ReactNode | null;
  children?: React.ReactNode;
  /** When true, use fixed height for live preview (no vh) */
  preview?: boolean;
};

export function TitlePlate({
  imageUrl,
  badge,
  title,
  subtitle,
  children,
  preview = false,
}: TitlePlateProps) {
  const hasImage =
    imageUrl != null &&
    imageUrl !== "" &&
    !isBadPlaceholderUrl(imageUrl);

  return (
    <article className={preview ? "pt-0" : "pt-2 sm:pt-4"}>
      <section
        className={`overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)] ${preview ? "flex flex-col h-[450px]" : ""}`}
      >
        <div
          className={`relative ${preview ? "min-h-0 flex-1" : "min-h-[60vh]"} ${imageWrapperClass}`}
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
          className={`border-t border-zinc-200/80 bg-zinc-50/90 backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/90 ${preview ? "flex-shrink-0 px-4 py-3" : "px-8 py-8 sm:px-12 sm:py-10 md:px-14 md:py-12"}`}
        >
          <div className="mx-auto max-w-[900px] space-y-2">
            {badge && (
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                {badge}
              </p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl md:text-5xl">
              {title}
            </h1>
            <div className="h-px w-16 bg-zinc-300 dark:bg-zinc-600" aria-hidden />
            {subtitle != null && subtitle !== "" && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">
                {subtitle}
              </p>
            )}
            {children && (
              <div className="space-y-0.5 pt-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {children}
              </div>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}

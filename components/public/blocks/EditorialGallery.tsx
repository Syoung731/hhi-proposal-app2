"use client";

import { isBadPlaceholderUrl } from "@/app/lib/media";

const imageWrapperClass =
  "relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)]";

export type EditorialGalleryImage = {
  id: string;
  url: string | null;
  caption?: string | null;
};

type EditorialGalleryProps = {
  images: EditorialGalleryImage[];
  /** Layout variant: grid (default), one-large-two-small (A), two-by-two-featured (B) */
  variant?: "grid" | "one-large-two-small" | "two-by-two-featured";
  /** Aspect ratio for images (default 4/3 for editorial) */
  aspect?: "square" | "4/3" | "3/2";
  /** Grid columns when variant is "grid" */
  columns?: 1 | 2 | 3;
  className?: string;
};

function ImageCell({
  img,
  aspectClass,
  className = "",
}: {
  img: EditorialGalleryImage;
  aspectClass: string;
  className?: string;
}) {
  return (
    <figure className={`group ${className}`}>
      <div className={`${imageWrapperClass} ${aspectClass}`}>
        {!img.url || isBadPlaceholderUrl(img.url) ? (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
            No image
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={img.url}
            alt={img.caption ?? ""}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {img.caption && (
        <figcaption className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {img.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function EditorialGallery({
  images,
  variant = "grid",
  aspect = "4/3",
  columns = 3,
  className = "",
}: EditorialGalleryProps) {
  if (images.length === 0) return null;

  const aspectClass =
    aspect === "4/3" ? "aspect-[4/3]" : aspect === "3/2" ? "aspect-[3/2]" : "aspect-square";

  if (variant === "one-large-two-small") {
    const [large, ...rest] = images;
    const small = rest.slice(0, 2);
    return (
      <div className={`grid gap-4 sm:gap-5 sm:grid-cols-[1.35fr_1fr] ${className}`}>
        <ImageCell img={large} aspectClass={aspectClass} />
        <div className="grid gap-4 sm:gap-5">
          {small.map((img) => (
            <ImageCell key={img.id} img={img} aspectClass={aspectClass} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "two-by-two-featured") {
    const [featured, ...rest] = images;
    const others = rest.slice(0, 3);
    return (
      <div className={`grid gap-4 grid-cols-2 sm:gap-5 ${className}`}>
        <div className="col-span-2">
          <ImageCell img={featured} aspectClass="aspect-[16/10]" />
        </div>
        {others.map((img) => (
          <ImageCell key={img.id} img={img} aspectClass={aspectClass} />
        ))}
      </div>
    );
  }

  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid gap-4 sm:gap-6 ${gridCols} ${className}`}>
      {images.map((img) => (
        <ImageCell key={img.id} img={img} aspectClass={aspectClass} />
      ))}
    </div>
  );
}

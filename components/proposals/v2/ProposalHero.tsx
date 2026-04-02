import Image from "next/image";
import { tokens } from "./tokens";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

export type ProposalHeroProps = {
  coverImageUrl?: string | null;
  coverImageAlt?: string;
  propertyName?: string | null;
  proposalTitle?: string | null;
  preparedFor?: string | null;
  date?: string | null;
  /** Optional: label for HHI branding lockup (e.g. "HHI Builders") */
  branding?: string | null;
};

export function ProposalHero({
  coverImageUrl,
  coverImageAlt = "Cover",
  propertyName,
  proposalTitle,
  preparedFor,
  date,
  branding,
}: ProposalHeroProps) {
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header className="relative">
      {/* Cover image */}
      <div
        className={`relative w-full overflow-hidden ${tokens.radius.image} bg-zinc-100 dark:bg-zinc-800`}
        style={{ aspectRatio: "21/9" }}
      >
        {showCover ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 1024px"
            priority
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm"
            aria-hidden
          >
            {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
              ? "Image unavailable"
              : "No cover image"}
          </div>
        )}
      </div>

      <div className={`mt-8 md:mt-10 ${tokens.section.block}`}>
        {propertyName && (
          <p className={`text-sm uppercase tracking-widest ${tokens.muted}`}>
            {propertyName}
          </p>
        )}
        {proposalTitle && (
          <h1 className={tokens.heading.h1}>{proposalTitle}</h1>
        )}
        {(preparedFor || date) && (
          <div className={`flex flex-wrap gap-x-6 gap-y-1 text-sm ${tokens.muted}`}>
            {preparedFor && <span>Prepared for {preparedFor}</span>}
            {date && <span>{date}</span>}
          </div>
        )}
        {branding && (
          <div className="pt-6 border-t border-zinc-200/80 dark:border-zinc-700/80 mt-8">
            <span className="text-sm tracking-widest uppercase text-zinc-500 dark:text-zinc-400">
              {branding}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

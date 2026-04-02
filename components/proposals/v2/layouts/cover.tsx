import Image from "next/image";
import { Cormorant_Garamond, Inter, Playfair_Display } from "next/font/google";
import { ProposalHero } from "../ProposalHero";
import { tokens } from "../tokens";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";
import type { ProposalLayoutProps } from "./types";

const serifHeadline = Cormorant_Garamond({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-editorial-serif",
});

const sansMeta = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-editorial-sans",
});

const serifGlass = Playfair_Display({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

/** cover.hero-image — full-width hero with image, title, meta. */
export function CoverHeroImage({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  return (
    <ProposalHero
      coverImageUrl={h.coverImageUrl}
      coverImageAlt={h.coverImageAlt}
      propertyName={h.propertyName}
      proposalTitle={h.proposalTitle}
      preparedFor={h.preparedFor}
      date={h.date}
      branding={h.brandingLabel}
    />
  );
}

/** cover.split-editorial — premium flagship: image-led split, strong title, refined metadata. */
export function CoverSplitEditorial({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  const coverImageUrl = h.coverImageUrl;
  const coverImageAlt = h.coverImageAlt ?? "Cover";
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header className="grid grid-cols-1 md:grid-cols-[7fr_10fr] min-h-[360px] md:min-h-[440px]">
      {/* Text panel — left on desktop, balanced width */}
      <div className="flex flex-col justify-center px-6 py-10 md:py-12 md:pl-10 md:pr-12 order-2 md:order-1">
        {h.propertyName && (
          <p className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {h.propertyName}
          </p>
        )}
        {h.proposalTitle && (
          <h1 className="mt-3 md:mt-4 text-2xl md:text-3xl lg:text-[2rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
            {h.proposalTitle}
          </h1>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Investment & Design Concept
        </p>
        {(h.preparedFor || h.date) && (
          <div className="mt-8 pt-6 border-t border-zinc-200/80 dark:border-zinc-700/80 space-y-1">
            {h.preparedFor && (
              <p className="text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Prepared for
              </p>
            )}
            {h.preparedFor && (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {h.preparedFor}
              </p>
            )}
            {h.date && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {h.date}
              </p>
            )}
          </div>
        )}
        {h.brandingLabel && (
          <p className="mt-8 text-[10px] uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-500">
            {h.brandingLabel}
          </p>
        )}
      </div>
      {/* Image — right on desktop, more visually dominant */}
      <div className="relative min-h-[220px] md:min-h-full order-1 md:order-2 md:rounded-r-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {showCover ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 58vw"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm">
            {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
              ? "Image unavailable"
              : "No cover image"}
          </div>
        )}
      </div>
    </header>
  );
}

/** cover.editorial-split — left dark text panel (~40%), right full-height image. Luxury editorial. */
export function CoverEditorialSplit({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  // Same normalized hero contract and image logic as CoverHeroImage / ProposalHero
  const coverImageUrl = h.coverImageUrl;
  const coverImageAlt = h.coverImageAlt ?? "Cover";
  const propertyName = h.propertyName;
  const proposalTitle = h.proposalTitle;
  const preparedFor = h.preparedFor;
  const date = h.date;
  const branding = h.brandingLabel;
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header className="grid grid-cols-1 md:grid-cols-[2fr_3fr] min-h-[420px] md:min-h-[520px]">
      {/* Left: dark text panel — order-2 on mobile so image shows first */}
      <div
        className="relative flex flex-col justify-between bg-[#1a2023] px-8 py-10 md:py-14 order-2 md:order-1"
        style={{ borderLeft: "3px solid rgba(255,255,255,0.15)" }}
      >
        <div>
          {branding && (
            <p className="text-xs font-medium tracking-[0.2em] text-white/90 uppercase">
              {branding}
            </p>
          )}
          <div className="mt-8 md:mt-12 space-y-3">
            {proposalTitle && (
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-semibold text-white tracking-tight leading-tight">
                {proposalTitle}
              </h1>
            )}
            {propertyName && (
              <p className="text-sm text-white/70">{propertyName}</p>
            )}
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-white/10">
          {(preparedFor || date) && (
            <>
              <p className="text-xs text-white/50 uppercase tracking-wider">Prepared for</p>
              {preparedFor && (
                <p className="mt-1 text-sm font-semibold text-white uppercase tracking-wide">
                  {preparedFor}
                </p>
              )}
              {date && (
                <p className="mt-2 text-xs text-white/50">{date}</p>
              )}
            </>
          )}
        </div>
      </div>
      {/* Right: full-height image — order-1 on mobile so it stacks first */}
      <div className="relative min-h-[280px] md:min-h-full order-1 md:order-2">
        {showCover ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 60vw"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 text-sm">
            {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
              ? "Image unavailable"
              : "No cover image"}
          </div>
        )}
      </div>
    </header>
  );
}

/** cover.editorial-dark-split — flagship: 16:9 presentation, dark editorial left panel (42%), hero image right (58%). Refined serif/sans hierarchy. */
export function CoverEditorialDarkSplit({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  const coverImageUrl = h.coverImageUrl;
  const coverImageAlt = h.coverImageAlt ?? "Cover";
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header
      className="relative w-full overflow-hidden rounded-lg"
      style={{ aspectRatio: "16/9" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[42fr_58fr] absolute inset-0">
        {/* Left: dark editorial panel — 42% */}
        <div
          className="relative flex flex-col justify-between order-2 md:order-1 pl-6 md:pl-10 pr-6 md:pr-12 py-8 md:py-12"
          style={{
            background: "linear-gradient(165deg, #0f1419 0%, #1a2332 45%, #151c26 100%)",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            {h.brandingLabel && (
              <p
                className={`text-[10px] md:text-[11px] uppercase tracking-[0.22em] text-white/70 ${sansMeta.className}`}
              >
                {h.brandingLabel}
              </p>
            )}
            <div className="mt-6 md:mt-10 max-w-[85%]">
              {h.proposalTitle && (
                <h1
                  className={`text-2xl md:text-3xl lg:text-[2.25rem] font-semibold text-white tracking-tight leading-[1.15] ${serifHeadline.className}`}
                >
                  {h.proposalTitle}
                </h1>
              )}
              <p
                className={`mt-2 md:mt-3 text-xs md:text-sm text-white/60 ${sansMeta.className}`}
              >
                A Bespoke Transformation Proposal
              </p>
            </div>
          </div>
          <div className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-white/10">
            {(h.preparedFor || h.date) && (
              <div className="space-y-1">
                {h.preparedFor && (
                  <p
                    className={`text-[10px] uppercase tracking-wider text-white/50 ${sansMeta.className}`}
                  >
                    Prepared for
                  </p>
                )}
                {h.preparedFor && (
                  <p
                    className={`text-sm text-white/85 ${sansMeta.className}`}
                  >
                    {h.preparedFor}
                  </p>
                )}
                {h.date && (
                  <p
                    className={`text-[11px] text-white/45 mt-1 ${sansMeta.className}`}
                  >
                    {h.date}
                  </p>
                )}
              </div>
            )}
          </div>
          {h.brandingLabel && (
            <p
              className={`mt-6 text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-white/40 ${sansMeta.className}`}
            >
              {h.brandingLabel}
            </p>
          )}
        </div>
        {/* Right: full-height hero image — 58% */}
        <div className="relative min-h-[200px] md:min-h-full order-1 md:order-2 bg-zinc-900">
          {showCover ? (
            <Image
              src={coverImageUrl}
              alt={coverImageAlt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 58vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
              {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
                ? "Image unavailable"
                : "No cover image"}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** cover.hero-glass-overlay — full-bleed hero, dark gradient, frosted glass panel lower-left. Cinematic, premium. */
export function CoverHeroGlassOverlay({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  const coverImageUrl = h.coverImageUrl;
  const coverImageAlt = h.coverImageAlt ?? "Cover";
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header
      className="relative w-full overflow-hidden rounded-lg"
      style={{ aspectRatio: "16/9" }}
    >
      {/* Full-bleed background image — same validation/fallback as hero-image cover */}
      <div className="absolute inset-0 bg-zinc-900">
        {showCover ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
            {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
              ? "Image unavailable"
              : "No cover image"}
          </div>
        )}
      </div>
      {/* Dark gradient: lower-left significantly darker, fade toward upper-right — calm behind panel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 35%, rgba(0,0,0,0.15) 65%, transparent 100%)",
        }}
      />
      {/* Subtle vignette — edges fall off (top-left to bottom-right) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 30% 25%, transparent 0%, transparent 50%, rgba(0,0,0,0.08) 100%)",
        }}
      />
      {/* Top-left brand lockup */}
      {h.brandingLabel && (
        <div className="absolute top-5 left-5 md:top-6 md:left-6 z-10">
          <p
            className={`text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/90 ${sansMeta.className}`}
          >
            {h.brandingLabel}
          </p>
        </div>
      )}
      {/* Frosted glass panel — anchored bottom-left quadrant, substantial and readable */}
      <div
        className={`absolute left-4 right-4 md:left-6 md:right-auto md:w-[52%] max-w-lg bottom-4 md:bottom-6 z-10 rounded-xl border border-white/30 bg-white/[0.18] backdrop-blur-xl px-10 py-10 md:px-14 md:py-14 ${sansMeta.className}`}
        style={{
          boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.12), inset 0 -1px 1px 0 rgba(0,0,0,0.06)",
        }}
      >
        <p className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-white/55">
          Luxury Transformation Proposal
        </p>
        {h.proposalTitle && (
          <h1
            className={`mt-5 md:mt-6 mb-4 md:mb-5 text-4xl md:text-5xl lg:text-[3.5rem] font-semibold text-white tracking-tight leading-[1.12] max-w-[14ch] ${serifGlass.className}`}
          >
            {h.proposalTitle}
          </h1>
        )}
        {h.propertyName && (
          <p className="mt-2 text-sm text-white/70">
            {h.propertyName}
          </p>
        )}
        <div className="mt-8 md:mt-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            {h.preparedFor && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-white/50">
                  Prepared for
                </p>
                <p className="text-sm text-white/75 mt-0.5">{h.preparedFor}</p>
              </>
            )}
          </div>
          {h.date && (
            <p className="text-[10px] text-white/50">{h.date}</p>
          )}
        </div>
      </div>
      {/* Bottom-center caption */}
      <p
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[9px] md:text-[10px] uppercase tracking-[0.18em] text-white/40 ${sansMeta.className}`}
      >
        The Immersive Vision
      </p>
      {/* Subtle accent bottom-right */}
      <div
        className="absolute bottom-4 right-4 md:bottom-5 md:right-5 z-10 w-1.5 h-1.5 rounded-full bg-white/30"
        aria-hidden
      />
    </header>
  );
}

/** cover.immersive-overlay — full-bleed hero with glass overlay card. Cinematic, high-end. */
export function CoverImmersiveOverlay({ sectionProps }: ProposalLayoutProps) {
  const h = sectionProps.hero;
  // Same normalized hero contract and image logic as CoverHeroImage / ProposalHero
  const coverImageUrl = h.coverImageUrl;
  const coverImageAlt = h.coverImageAlt ?? "Cover";
  const propertyName = h.propertyName;
  const proposalTitle = h.proposalTitle;
  const preparedFor = h.preparedFor;
  const date = h.date;
  const branding = h.brandingLabel;
  const showCover =
    coverImageUrl &&
    !isBadPlaceholderUrl(coverImageUrl) &&
    (coverImageUrl.startsWith("/") || isAllowedHostForNextImage(coverImageUrl));

  return (
    <header className="relative w-full min-h-[480px] md:min-h-[560px] overflow-hidden rounded-lg">
      {/* Background image — same fallback as ProposalHero */}
      <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-800">
        {showCover ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm">
            {coverImageUrl && isBadPlaceholderUrl(coverImageUrl)
              ? "Image unavailable"
              : "No cover image"}
          </div>
        )}
      </div>
      {/* Top-left branding */}
      {branding && (
        <div className="absolute top-6 left-6 z-10">
          <p className="text-sm font-medium tracking-widest text-white/95">
            {branding}
          </p>
        </div>
      )}
      {/* Glass overlay card — bottom third */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-10 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md shadow-xl px-6 py-6 md:px-8 md:py-8"
      >
        {propertyName && (
          <p className="text-xs font-medium tracking-[0.2em] text-white/90 uppercase">
            {propertyName}
          </p>
        )}
        {proposalTitle && (
          <h1 className="mt-2 text-2xl md:text-3xl lg:text-4xl font-serif font-semibold text-white tracking-tight">
            {proposalTitle}
          </h1>
        )}
        {preparedFor && (
          <p className="mt-2 text-sm text-white/80">{preparedFor}</p>
        )}
        <div className="mt-4 flex justify-end">
          {date && (
            <p className="text-xs text-white/60">{date}</p>
          )}
        </div>
      </div>
    </header>
  );
}

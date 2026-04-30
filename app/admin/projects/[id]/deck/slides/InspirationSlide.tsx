"use client";

import type { ProposalSlide, DeckBranding, InspirationContent } from "@/app/lib/deck/types";
import { VISUAL_INSPIRATION_DEFAULTS } from "@/app/lib/visual-inspiration-defaults";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, HEADLINE_SCALE, BODY_SCALE, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const LINEN = "#F5F0E8";
const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Outline shadow helper ─────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

// ─── Photo cell helper ──────────────────────────────────────────────────────

function PhotoCell({ url, style }: { url: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        ...style,
      }}
    />
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function InspirationSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as InspirationContent;
  const layoutKey = slide.layoutKey as string;
  const headline = slide.headline ?? VISUAL_INSPIRATION_DEFAULTS.headline;
  const subtitle = c.subtitle ?? VISUAL_INSPIRATION_DEFAULTS.subtitle;
  const caption = c.caption ?? "";
  const heroPhoto = c.heroPhoto ?? null;
  const photos = c.photos ?? [];
  // Render the slide background transparent when EITHER an AI background or a
  // brand background is selected so the SlideCard parent's background layer
  // shows through. Previously only hasAiBackground was checked, which made the
  // "Change background" picker appear inert on this slide type.
  const hasBg = !!hasAiBackground || slide.backgroundId != null;

  switch (layoutKey) {
    case "hero-plus-stacked":
      return (
        <HeroPlusStackedLayout
          headline={headline}
          subtitle={subtitle}
          heroPhoto={heroPhoto}
          photos={photos}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "masonry-grid":
      return (
        <MasonryGridLayout
          caption={caption}
          photos={photos}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "side-by-side-bleed":
      return (
        <SideBySideBleedLayout
          headline={headline}
          caption={caption}
          photos={photos}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    default:
      return (
        <HeroPlusStackedLayout
          headline={headline}
          subtitle={subtitle}
          heroPhoto={heroPhoto}
          photos={photos}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Layout A: Hero + Stacked ───────────────────────────────────────────────

function HeroPlusStackedLayout({
  headline,
  subtitle,
  heroPhoto,
  photos,
  hasBg,
  content,
  branding,
}: {
  headline: string;
  subtitle: string;
  heroPhoto: string | null;
  photos: string[];
  hasBg?: boolean;
  content: InspirationContent;
  branding: DeckBranding;
}) {
  const stackedPhotos = photos.slice(0, 2);

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex" }}>
        {/* Left: hero photo ~65% */}
        <div style={{ width: "65%", height: "100%", position: "relative" }}>
          {heroPhoto ? (
            <PhotoCell url={heroPhoto} style={{ width: "100%", height: "100%" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.5em", color: "#9CA3AF" }}>No hero photo selected</span>
            </div>
          )}

          {/* Text overlay with gradient */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "5% 6%",
              background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)",
            }}
          >
            <div
              style={{
                fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
                fontSize: `${(content.headlineSize ?? 2.0) * 0.65}em`,
                fontWeight: (content.headlineBold !== false) ? 600 : 400,
                fontStyle: content.headlineItalic ? "italic" : "normal",
                textDecoration: content.headlineUnderline ? "underline" : "none",
                color: content.headlineColor ?? "#FFFFFF",
                lineHeight: 1.2,
                marginBottom: "0.2em",
                textShadow: makeOutlineShadow(content.headlineOutline),
              }}
            >
              {headline}
            </div>
            {subtitle && (
              <div
                style={{
                  fontFamily: content.subtitleFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${(content.subtitleSize ?? 1.0) * 0.5}em`,
                  fontWeight: content.subtitleBold ? 700 : 400,
                  fontStyle: content.subtitleItalic ? "italic" : "normal",
                  textDecoration: content.subtitleUnderline ? "underline" : "none",
                  color: content.subtitleColor ?? "rgba(255,255,255,0.85)",
                  lineHeight: 1.4,
                  textShadow: makeOutlineShadow(content.subtitleOutline),
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* Right: 2 stacked photos ~35% */}
        <div style={{ width: "35%", height: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
          {stackedPhotos.length > 0 ? (
            stackedPhotos.map((url, i) => (
              <PhotoCell key={i} url={url} style={{ flex: 1 }} />
            ))
          ) : (
            <>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.4em", color: "#D1D5DB" }}>Photo 1</span>
              </div>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.4em", color: "#D1D5DB" }}>Photo 2</span>
              </div>
            </>
          )}
          {/* Fill remaining slots if only 1 photo */}
          {stackedPhotos.length === 1 && (
            <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.4em", color: "#D1D5DB" }}>Photo 2</span>
            </div>
          )}
        </div>
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: Masonry Grid ─────────────────────────────────────────────────

/**
 * CSS grid masonry with varied spans based on photo index.
 * Pattern: photo 0 = 2col×2row, photo 1 = 1col×1row, photo 2 = 1col×1row,
 *          photo 3 = 1col×2row, photo 4 = 2col×1row, repeating pattern for 5+
 */
function MasonryGridLayout({
  caption,
  photos,
  hasBg,
  content,
  branding,
}: {
  caption: string;
  photos: string[];
  hasBg?: boolean;
  content: InspirationContent;
  branding: DeckBranding;
}) {
  // Span assignments for natural masonry feel
  const spanMap: { col: number; row: number }[] = [
    { col: 2, row: 2 },
    { col: 1, row: 1 },
    { col: 1, row: 1 },
    { col: 1, row: 2 },
    { col: 2, row: 1 },
    { col: 1, row: 1 },
    { col: 1, row: 1 },
    { col: 1, row: 1 },
  ];

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 2,
        }}
      >
        {photos.length > 0 ? (
          photos.slice(0, 8).map((url, i) => {
            const span = spanMap[i] ?? { col: 1, row: 1 };
            return (
              <PhotoCell
                key={i}
                url={url}
                style={{
                  gridColumn: `span ${span.col}`,
                  gridRow: `span ${span.row}`,
                }}
              />
            );
          })
        ) : (
          <div
            style={{
              gridColumn: "span 4",
              gridRow: "span 3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.03)",
            }}
          >
            <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.5em", color: "#9CA3AF" }}>
              Select photos from the library
            </span>
          </div>
        )}
      </div>

      {/* Caption overlay */}
      {caption && photos.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "3%",
            left: "4%",
            zIndex: 3,
            fontFamily: content.captionFont ?? SLIDE_FONTS.defaults.body,
            fontSize: `${(content.captionSize ?? 1.0) * 0.42}em`,
            fontWeight: content.captionBold ? 700 : 400,
            fontStyle: content.captionItalic ? "italic" : "normal",
            textDecoration: content.captionUnderline ? "underline" : "none",
            color: content.captionColor ?? "#FFFFFF",
            background: "rgba(0,0,0,0.5)",
            padding: "0.3em 0.6em",
            borderRadius: 3,
            textShadow: makeOutlineShadow(content.captionOutline),
          }}
        >
          {caption}
        </div>
      )}
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout C: Side by Side Bleed ───────────────────────────────────────────

function SideBySideBleedLayout({
  headline,
  caption,
  photos,
  hasBg,
  content,
  branding,
}: {
  headline: string;
  caption: string;
  photos: string[];
  hasBg?: boolean;
  content: InspirationContent;
  branding: DeckBranding;
}) {
  const leftPhoto = photos[0] ?? null;
  const rightPhoto = photos[1] ?? null;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Headline */}
        {headline && (
          <div
            style={{
              padding: "3% 5% 2%",
              fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${(content.headlineSize ?? 2.0) * 0.55}em`,
              fontWeight: (content.headlineBold !== false) ? 600 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: content.headlineColor ?? branding.textColor,
              textAlign: "center",
              lineHeight: 1.2,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </div>
        )}

        {/* Two photos side by side */}
        <div style={{ flex: 1, display: "flex", gap: 2 }}>
          {leftPhoto ? (
            <PhotoCell url={leftPhoto} style={{ flex: 1 }} />
          ) : (
            <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.45em", color: "#D1D5DB" }}>Photo 1</span>
            </div>
          )}
          {rightPhoto ? (
            <PhotoCell url={rightPhoto} style={{ flex: 1 }} />
          ) : (
            <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "0.45em", color: "#D1D5DB" }}>Photo 2</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {caption && (
          <div
            style={{
              padding: "1.5% 5% 2.5%",
              fontFamily: content.captionFont ?? SLIDE_FONTS.defaults.body,
              fontSize: `${(content.captionSize ?? 1.0) * 0.45}em`,
              fontWeight: content.captionBold ? 700 : 400,
              fontStyle: content.captionItalic ? "italic" : "normal",
              textDecoration: content.captionUnderline ? "underline" : "none",
              color: content.captionColor ?? MUTED_NAVY,
              textAlign: "center",
              lineHeight: 1.5,
              textShadow: makeOutlineShadow(content.captionOutline),
            }}
          >
            {caption}
          </div>
        )}
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

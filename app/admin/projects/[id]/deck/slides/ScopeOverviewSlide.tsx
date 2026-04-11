"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeOverviewContent,
  ScopeOverviewSelectedPhoto,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── Empty-state placeholder for image slots ─────────────────────────────────

function ImagePlaceholder({ label }: { label?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#E8E6E3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4em",
      }}
    >
      {/* Simple camera outline icon */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BDBAB5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {label && (
        <p style={{ fontSize: "0.6em", color: "#C4C0BB", letterSpacing: "0.06em" }}>
          {label}
        </p>
      )}
    </div>
  );
}

// ─── Positioned photo renderer ──────────────────────────────────────────────

function PositionedPhoto({ photo }: { photo: ScopeOverviewSelectedPhoto }) {
  const scalePct = photo.scale ?? 100;
  const px = photo.positionX ?? 50;
  const py = photo.positionY ?? 50;

  // Uses background-image instead of <img> so we can control exactly how much
  // of the source photo is visible — true camera-style zoom.
  //
  // background-size controls zoom:
  //   100% → "cover" equivalent: photo fills container, edges cropped
  //   200% → zoom IN: photo is 2× the container, tighter crop (see less)
  //    50% → zoom OUT: photo is half the container, reveals more of the image
  //
  // background-position controls pan (which part of the photo is centered).

  return (
    <div
      role="img"
      style={{
        width: "100%",
        height: "100%",
        backgroundImage: `url(${photo.url})`,
        backgroundSize: `${scalePct}%`,
        backgroundPosition: `${px}% ${py}%`,
        backgroundRepeat: "no-repeat",
        backgroundColor: "#1A1A1A",
      }}
    />
  );
}

// ─── Layout 1: split-panel ───────────────────────────────────────────────────
// Left 42 %: label + large serif title + accent rule + description
// Right 58 %: 1 or 2 images stacked with a 2 px gap

function SplitPanelLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const photos = (content.selectedPhotos ?? []).filter((p) => p.url).slice(0, 2);
  const title = slide.headline ?? "Scope Overview";
  const description = content.description ?? "";
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const photoPanelPct = content.panelSplitRatio ?? 50;
  const textPanelPct = 100 - photoPanelPct;

  // Per-field: Title
  const titleFontFamily = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const titleSize  = content.titleSize  ?? 2.0;
  const titleColor = content.titleColor ?? branding.textColor;
  const titleShadow = makeOutlineShadow(content.titleOutline);
  const titleX     = content.titleX     ?? 0.06;
  const titleY     = content.titleY     ?? 0.35;

  // Per-field: Description (with deprecated copySize/copyColor fallbacks)
  const descFontFamily = content.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const descSize   = content.descriptionSize ?? content.copySize ?? 1.0;
  const descColor  = content.descriptionColor ?? content.copyColor ?? "#4B5563";
  const descShadow = makeOutlineShadow(content.descriptionOutline);
  const copyX      = content.copyX      ?? 0.06;
  const copyY      = content.copyY      ?? 0.66;

  const titleStyle: React.CSSProperties = {
    fontSize: `${2.4 * titleSize}em`,
    fontFamily: titleFontFamily,
    fontWeight: (content.titleBold ?? true) ? 800 : 400,
    fontStyle: content.titleItalic ? "italic" : undefined,
    textDecoration: content.titleUnderline ? "underline" : undefined,
    color: titleColor,
    lineHeight: 1.15,
    marginBottom: "0.5em",
    textShadow: titleShadow,
  };

  const descStyle: React.CSSProperties = {
    fontSize: `${0.73 * descSize}em`,
    fontFamily: descFontFamily,
    fontWeight: content.descriptionBold ? 700 : 400,
    fontStyle: content.descriptionItalic ? "italic" : undefined,
    textDecoration: content.descriptionUnderline ? "underline" : undefined,
    color: descColor,
    lineHeight: 1.85,
    textShadow: descShadow,
  };

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Left panel border */}
      <div style={{ position: "absolute", left: 0, top: 0, width: `${textPanelPct}%`, height: "100%", borderRight: "1px solid #E5E3DF", pointerEvents: "none" }} />

      {/* ── Right: image(s) ──────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${textPanelPct}%`, top: 0, right: 0, bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "hidden",
        }}
      >
        {photos.length === 0 ? (
          <ImagePlaceholder label="Add images in the inspector" />
        ) : (
          photos.map((photo, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}>
              <PositionedPhoto photo={photo} />
            </div>
          ))
        )}
      </div>

      {/* ── Title cluster (absolutely positioned) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${titleX * 100}%`,
          top: `${titleY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: `${Math.max(textPanelPct - 8, 20)}%`,
          zIndex: 2,
        }}
      >
        {(content.showSectionLabel ?? true) && (
          <p style={{ fontSize: SECTION_LABEL_SIZE, fontFamily: SLIDE_FONTS.defaults.label, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, marginBottom: "0.8em" }}>
            Project Scope
          </p>
        )}
        <h2 style={titleStyle}>
          {title}
        </h2>
        <TitleAccentRule accentColor={accent} marginTop="0" />
      </div>

      {/* ── Description (absolutely positioned) ───────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${copyX * 100}%`,
          top: `${copyY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: `${Math.max(textPanelPct - 8, 20)}%`,
          zIndex: 2,
        }}
      >
        {description ? (
          <p style={descStyle}>
            {description}
          </p>
        ) : (
          <p style={{ fontSize: "0.68em", color: "#C4C0BB", fontStyle: "italic" }}>
            Add a description in the inspector.
          </p>
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

// ─── Layout 2: image-row ─────────────────────────────────────────────────────
// Top 38 %: eyebrow + title + accent rule + description (left-aligned)
// Bottom 62 %: 3–4 images in a full-bleed horizontal row

function ImageRowLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const photos = (content.selectedPhotos ?? []).filter((p) => p.url).slice(0, 4);
  const title = slide.headline ?? "Scope Overview";
  const description = content.description ?? "";
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  // Per-field: Title
  const titleFontFamily = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const titleSize  = content.titleSize  ?? 2.0;
  const titleColor = content.titleColor ?? branding.textColor;
  const titleShadow = makeOutlineShadow(content.titleOutline);
  const titleX     = content.titleX     ?? 0.06;
  const titleY     = content.titleY     ?? 0.16;

  // Per-field: Description (with deprecated copySize/copyColor fallbacks)
  const descFontFamily = content.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const descSize   = content.descriptionSize ?? content.copySize ?? 1.0;
  const descColor  = content.descriptionColor ?? content.copyColor ?? "#4B5563";
  const descShadow = makeOutlineShadow(content.descriptionOutline);
  const copyX      = content.copyX      ?? 0.06;
  const copyY      = content.copyY      ?? 0.33;

  const titleStyle: React.CSSProperties = {
    fontSize: `${2.2 * titleSize}em`,
    fontFamily: titleFontFamily,
    fontWeight: (content.titleBold ?? true) ? 800 : 400,
    fontStyle: content.titleItalic ? "italic" : undefined,
    textDecoration: content.titleUnderline ? "underline" : undefined,
    color: titleColor,
    lineHeight: 1.15,
    marginBottom: "0.5em",
    textShadow: titleShadow,
  };

  const descStyle: React.CSSProperties = {
    fontSize: `${0.72 * descSize}em`,
    fontFamily: descFontFamily,
    fontWeight: content.descriptionBold ? 700 : 400,
    fontStyle: content.descriptionItalic ? "italic" : undefined,
    textDecoration: content.descriptionUnderline ? "underline" : undefined,
    color: descColor,
    lineHeight: 1.8,
    textShadow: descShadow,
  };

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* ── Bottom: image row (occupies lower 60%) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0, right: 0,
          top: "40%", bottom: 0,
          display: "flex",
          gap: 2,
          overflow: "hidden",
        }}
      >
        {photos.length === 0 ? (
          <ImagePlaceholder label="Add images in the inspector" />
        ) : (
          photos.map((photo, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}>
              <PositionedPhoto photo={photo} />
            </div>
          ))
        )}
      </div>

      {/* ── Title cluster (absolutely positioned) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${titleX * 100}%`,
          top: `${titleY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "70%",
          zIndex: 2,
        }}
      >
        {(content.showSectionLabel ?? true) && (
          <p style={{ fontSize: SECTION_LABEL_SIZE, fontFamily: SLIDE_FONTS.defaults.label, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: accent, marginBottom: "0.8em" }}>
            Project Scope
          </p>
        )}
        <h2 style={titleStyle}>
          {title}
        </h2>
        <TitleAccentRule accentColor={accent} marginTop="0" />
      </div>

      {/* ── Description (absolutely positioned) ───────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${copyX * 100}%`,
          top: `${copyY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "70%",
          zIndex: 2,
        }}
      >
        {description ? (
          <p style={descStyle}>
            {description}
          </p>
        ) : (
          <p style={{ fontSize: "0.65em", color: "#C4C0BB", fontStyle: "italic" }}>
            Add a description in the inspector.
          </p>
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

// ─── Router ──────────────────────────────────────────────────────────────────

export function ScopeOverviewSlide({ slide, branding, hasAiBackground }: LayoutProps) {
  switch (slide.layoutKey) {
    case "image-row":
      return <ImageRowLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "split-panel":
    default:
      return <SplitPanelLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

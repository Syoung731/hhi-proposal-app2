"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeOverviewContent,
  ScopeOverviewSelectedPhoto,
  ScopeItem,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { ScopeIcon } from "./shared/ScopeIcons";
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

// ─── Structured-item helpers ──────────────────────────────────────────────────

const DARK_PANEL = "#27323B"; // slate used by the editorial-split dark column

/**
 * Returns the structured scope items for the rich layouts. Prefers
 * `content.scopeItems`; if absent, gracefully derives detail-only items by
 * splitting the legacy `description` paragraph into sentences (capped at 6) so
 * the new layouts still render something sensible before the composer runs.
 */
function deriveScopeItems(content: ScopeOverviewContent, cap = 6): ScopeItem[] {
  const items = (content.scopeItems ?? []).filter((it) => it && (it.title || it.detail));
  if (items.length > 0) return items.slice(0, cap);

  const desc = (content.description ?? "").trim();
  if (!desc) return [];
  return desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, cap)
    .map((sentence) => ({ title: "", detail: sentence }));
}

/** Full-bleed photo for a slot, with a graceful placeholder when empty. */
function PhotoOrPlaceholder({ photo }: { photo?: ScopeOverviewSelectedPhoto }) {
  if (!photo?.url) return <ImagePlaceholder label="Add a photo in the inspector" />;
  return <PositionedPhoto photo={photo} />;
}

function Eyebrow({ accent, color }: { accent: string; color?: string }) {
  return (
    <p
      style={{
        fontSize: SECTION_LABEL_SIZE,
        fontFamily: SLIDE_FONTS.defaults.label,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color ?? accent,
        marginBottom: "0.9em",
      }}
    >
      Project Scope
    </p>
  );
}

// ─── Layout 1: split-panel ───────────────────────────────────────────────────
// Left 42 %: label + large serif title + accent rule + description
// Right 58 %: 1 or 2 images stacked with a 2 px gap

function SplitPanelLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
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
  const resolvedAccent = content.accentColor ?? branding.accentColor;
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

// ─── Layout 3: editorial-split ───────────────────────────────────────────────
// Dark slate left column (eyebrow + large serif title + hairline-divided item
// list) and a framed full-bleed photo on the right, with an optional floating
// white caption card. The premium "Editorial" hero layout.

function EditorialSplitLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const items = deriveScopeItems(content, 6);
  const photo = (content.selectedPhotos ?? []).find((p) => p.url);
  const title = slide.headline ?? "The Scope";
  const intro = (content.intro ?? "").trim();
  const itemScale = content.scopeItemsSize ?? 1;
  const titleFont = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const panelPct = 40;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: "#FAFAF8" }}>
      {/* Left dark column */}
      <div
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: `${panelPct}%`,
          background: DARK_PANEL,
          padding: "7% 6%",
          display: "flex", flexDirection: "column", justifyContent: "center",
          zIndex: 2,
        }}
      >
        <Eyebrow accent={accent} color={accent} />
        <h2
          style={{
            fontSize: `${3.0 * (content.titleSize ?? 1)}em`,
            fontFamily: titleFont,
            fontWeight: 300,
            color: "#FFFFFF",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {title}
        </h2>
        <div style={{ width: "2.6em", height: 2, background: accent, marginTop: "0.9em", marginBottom: "1.4em" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                padding: "0.7em 0",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.13)",
              }}
            >
              {it.title && (
                <p style={{ fontSize: `${0.8 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, fontWeight: 600, color: "#FFFFFF", margin: 0, lineHeight: 1.3 }}>
                  {it.title}
                </p>
              )}
              {it.detail && (
                <p style={{ fontSize: `${0.72 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, color: "rgba(255,255,255,0.74)", margin: it.title ? "0.15em 0 0" : 0, lineHeight: 1.4 }}>
                  {it.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right framed photo */}
      <div style={{ position: "absolute", left: `${panelPct}%`, top: 0, right: 0, bottom: 0, padding: "3.5%", zIndex: 1 }}>
        <div style={{ width: "100%", height: "100%", overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.18)", background: "#FFFFFF", padding: 6 }}>
          <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <PhotoOrPlaceholder photo={photo} />
          </div>
        </div>
      </div>

      {/* Optional floating caption card */}
      {intro && (
        <div
          style={{
            position: "absolute", right: "5%", bottom: "7%", maxWidth: "34%",
            background: "#FFFFFF", padding: "1.1em 1.3em",
            boxShadow: "0 10px 30px rgba(0,0,0,0.20)", zIndex: 3,
          }}
        >
          <p style={{ fontSize: "1.05em", fontFamily: titleFont, fontWeight: 500, color: branding.textColor, margin: 0, lineHeight: 1.15 }}>
            The Vision
          </p>
          <p style={{ fontSize: "0.72em", fontFamily: SLIDE_FONTS.defaults.body, color: "#4B5563", margin: "0.4em 0 0", lineHeight: 1.5 }}>
            {intro}
          </p>
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

// ─── Layout 4: photo-numbered ────────────────────────────────────────────────
// Left full-bleed photo, right white column with eyebrow + title + accent rule
// then numbered rows (orange square chips).

function PhotoNumberedLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const items = deriveScopeItems(content, 6);
  const photo = (content.selectedPhotos ?? []).find((p) => p.url);
  const title = slide.headline ?? "Scope of Work";
  const itemScale = content.scopeItemsSize ?? 1;
  const titleFont = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const photoPct = 48;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${photoPct}%`, overflow: "hidden" }}>
        <PhotoOrPlaceholder photo={photo} />
      </div>

      <div
        style={{
          position: "absolute", left: `${photoPct}%`, right: 0, top: 0, bottom: 0,
          padding: "6% 5%", display: "flex", flexDirection: "column", justifyContent: "center",
        }}
      >
        {(content.showSectionLabel ?? true) && <Eyebrow accent={accent} />}
        <h2 style={{ fontSize: `${2.0 * (content.titleSize ?? 1)}em`, fontFamily: titleFont, fontWeight: 700, color: content.titleColor ?? branding.textColor, lineHeight: 1.12, margin: 0 }}>
          {title}
        </h2>
        <div style={{ width: "2.6em", height: 2, background: accent, margin: "0.8em 0 1.3em" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                display: "flex", gap: "0.9em", alignItems: "flex-start",
                padding: "0.6em 0",
                borderTop: i === 0 ? "none" : "1px solid #ECE9E3",
              }}
            >
              <div style={{ flex: "0 0 auto", width: "1.8em", height: "1.8em", background: accent, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SLIDE_FONTS.defaults.body, fontWeight: 700, fontSize: "0.8em" }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                {it.title && (
                  <p style={{ fontSize: `${0.82 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, fontWeight: 700, color: branding.textColor, margin: 0, lineHeight: 1.3 }}>{it.title}</p>
                )}
                {it.detail && (
                  <p style={{ fontSize: `${0.74 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, color: "#4B5563", margin: it.title ? "0.15em 0 0" : 0, lineHeight: 1.45 }}>{it.detail}</p>
                )}
              </div>
            </div>
          ))}
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

// ─── Layout 5: photo-checklist ───────────────────────────────────────────────
// Left white column with title + accent check rows, right full-bleed photo.

function PhotoChecklistLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const items = deriveScopeItems(content, 6);
  const photo = (content.selectedPhotos ?? []).find((p) => p.url);
  const title = slide.headline ?? "Scope Alignment";
  const itemScale = content.scopeItemsSize ?? 1;
  const titleFont = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const textPct = 58;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: "#FFFFFF" }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: `${textPct}%`,
          padding: "6% 4.5%", display: "flex", flexDirection: "column", justifyContent: "center",
        }}
      >
        {(content.showSectionLabel ?? true) && <Eyebrow accent={accent} />}
        <h2 style={{ fontSize: `${2.1 * (content.titleSize ?? 1)}em`, fontFamily: titleFont, fontWeight: 700, color: content.titleColor ?? branding.textColor, lineHeight: 1.1, margin: 0 }}>
          {title}
        </h2>
        <div style={{ width: "2.6em", height: 2, background: accent, margin: "0.8em 0 1.3em" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9em" }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: "0.7em", alignItems: "flex-start" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", marginTop: "0.15em" }} aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p style={{ fontSize: `${0.78 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, color: "#374151", margin: 0, lineHeight: 1.45 }}>
                {it.title && <span style={{ fontWeight: 700, color: branding.textColor }}>{it.title}{it.detail ? ": " : ""}</span>}
                {it.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", left: `${textPct}%`, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
        <PhotoOrPlaceholder photo={photo} />
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

// ─── Layout 6: gallery-grid ──────────────────────────────────────────────────
// Compact title bar, a row of up to 3 photos, then a 2×2 grid of titled item
// groups divided by a center rule.

function GalleryGridLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const items = deriveScopeItems(content, 4);
  const photos = (content.selectedPhotos ?? []).filter((p) => p.url).slice(0, 3);
  const title = slide.headline ?? "Scope Alignment";
  const itemScale = content.scopeItemsSize ?? 1;
  const titleFont = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: "#FFFFFF", padding: "4% 4.5%", display: "flex", flexDirection: "column" }}>
      {/* Title bar */}
      <div style={{ flex: "0 0 auto", marginBottom: "0.9em" }}>
        {(content.showSectionLabel ?? true) && <Eyebrow accent={accent} />}
        <h2 style={{ fontSize: `${1.9 * (content.titleSize ?? 1)}em`, fontFamily: titleFont, fontWeight: 700, color: content.titleColor ?? branding.textColor, lineHeight: 1.05, margin: 0 }}>
          {title}
        </h2>
        <div style={{ width: "2.6em", height: 2, background: accent, marginTop: "0.6em" }} />
      </div>

      {/* Photo row */}
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", gap: 6, marginBottom: "1em" }}>
        {photos.length === 0 ? (
          <ImagePlaceholder label="Add up to 3 photos" />
        ) : (
          photos.map((p, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}>
              <PositionedPhoto photo={p} />
            </div>
          ))
        )}
      </div>

      {/* 2×2 item grid */}
      <div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto auto", columnGap: "2.2em", rowGap: "0.8em", borderTop: "1px solid #ECE9E3", paddingTop: "1em" }}>
        {items.map((it, i) => (
          <div key={i} style={{ paddingLeft: i % 2 === 1 ? "2.2em" : 0, borderLeft: i % 2 === 1 ? "1px solid #ECE9E3" : "none" }}>
            {it.title && (
              <p style={{ fontSize: `${0.86 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase", color: branding.textColor, margin: 0, lineHeight: 1.2 }}>
                {it.title}
              </p>
            )}
            {it.detail && (
              <p style={{ fontSize: `${0.74 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, color: "#4B5563", margin: it.title ? "0.2em 0 0" : 0, lineHeight: 1.4 }}>
                {it.detail}
              </p>
            )}
          </div>
        ))}
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

// ─── Layout 7: blueprint-icons ───────────────────────────────────────────────
// Left full-bleed photo, right "drafting" panel: graph-paper grid, corner
// dimension brackets, a bold title, an accent stat subtitle, and icon rows.
// Matches the Poolside reference.

function BlueprintIconsLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const ink = content.titleColor ?? branding.textColor ?? "#1A2332";
  const items = deriveScopeItems(content, 5);
  const photo = (content.selectedPhotos ?? []).find((p) => p.url);
  const title = slide.headline ?? "Scope of Work";
  const stat = (content.stat ?? "").trim();
  const itemScale = content.scopeItemsSize ?? 1;
  const iconScale = content.scopeIconSize ?? 1;
  const titleFont = content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const showGrid = (content.backgroundSkin ?? "blueprint") !== "none";
  const photoPct = 46;
  const gridLine = "rgba(26,35,50,0.07)";
  const markColor = "rgba(26,35,50,0.28)";

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: "#FFFFFF" }}>
      {/* Left photo */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${photoPct}%`, overflow: "hidden" }}>
        <PhotoOrPlaceholder photo={photo} />
      </div>

      {/* Right drafting panel */}
      <div style={{ position: "absolute", left: `${photoPct}%`, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
        {/* Graph-paper grid */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
              backgroundSize: "26px 26px",
            }}
          />
        )}

        {/* Corner dimension brackets */}
        {showGrid && (
          <>
            <svg className="absolute pointer-events-none" style={{ top: "7%", right: "6%" }} width="64" height="20" viewBox="0 0 64 20" fill="none" stroke={markColor} strokeWidth="1" aria-hidden>
              <path d="M2 2v6M62 2v6M2 5h60" />
            </svg>
            <svg className="absolute pointer-events-none" style={{ bottom: "7%", right: "6%" }} width="64" height="20" viewBox="0 0 64 20" fill="none" stroke={markColor} strokeWidth="1" aria-hidden>
              <path d="M2 18v-6M62 18v-6M2 15h60" />
            </svg>
          </>
        )}

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "7% 7%" }}>
          {(content.showSectionLabel ?? false) && <Eyebrow accent={accent} />}
          <h2 style={{ fontSize: `${1.95 * (content.titleSize ?? 1)}em`, fontFamily: titleFont, fontWeight: 700, color: ink, lineHeight: 1.08, margin: 0 }}>
            {title}
          </h2>
          {stat && (
            <p style={{ fontSize: "0.95em", fontFamily: SLIDE_FONTS.defaults.body, fontWeight: 700, color: accent, margin: "0.5em 0 0", lineHeight: 1.25 }}>
              {stat}
            </p>
          )}

          {/* Icon rows with a left measurement guide */}
          <div style={{ marginTop: "1.6em", paddingLeft: "1.4em", borderLeft: `1px solid ${markColor}`, display: "flex", flexDirection: "column", gap: "1.15em" }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: "1.1em", alignItems: "flex-start", position: "relative" }}>
                {/* tick on the guide */}
                <span style={{ position: "absolute", left: "calc(-1.4em - 1px)", top: "0.9em", width: "0.7em", height: 1, background: markColor }} />
                <div style={{ flex: "0 0 auto", width: `${2.2 * iconScale}em`, height: `${2.2 * iconScale}em`, display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {it.iconImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.iconImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <ScopeIcon name={it.icon} size={Math.round(32 * iconScale)} color={ink} strokeWidth={1.5} />
                  )}
                </div>
                <p style={{ fontSize: `${0.82 * itemScale}em`, fontFamily: SLIDE_FONTS.defaults.body, color: "#374151", margin: 0, lineHeight: 1.4, paddingTop: "0.15em" }}>
                  {it.title && <span style={{ fontWeight: 700, color: ink }}>{it.title}{it.detail ? ": " : ""}</span>}
                  {it.detail}
                </p>
              </div>
            ))}
          </div>
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

// ─── Router ──────────────────────────────────────────────────────────────────

export function ScopeOverviewSlide({ slide, branding, hasAiBackground }: LayoutProps) {
  switch (slide.layoutKey) {
    case "blueprint-icons":
      return <BlueprintIconsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "editorial-split":
      return <EditorialSplitLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "photo-numbered":
      return <PhotoNumberedLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "photo-checklist":
      return <PhotoChecklistLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "gallery-grid":
      return <GalleryGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "image-row":
      return <ImageRowLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "split-panel":
      return <SplitPanelLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    default:
      return <EditorialSplitLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

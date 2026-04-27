"use client";

import type {
  ProposalSlide,
  DeckBranding,
  BeforeAfterContent,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SLIDE_FONTS } from "@/app/lib/slide-constants";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

/** Small pill label: "BEFORE" or "AFTER" */
function Label({
  text,
  accent,
  dark = false,
  font,
  size,
  bold,
  italic,
  underline,
  color,
  outline,
}: {
  text: string;
  accent: string;
  dark?: boolean;
  font?: string | null;
  size?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  color?: string | null;
  outline?: string | null;
}) {
  return (
    <span
      className="uppercase tracking-widest"
      style={{
        fontFamily: font ?? "'Jost', sans-serif",
        fontSize: `${(size ?? 1.0) * 0.52}em`,
        fontWeight: (bold !== false) ? 600 : 400,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
        letterSpacing: "0.16em",
        color: color ?? (dark ? "rgba(255,255,255,0.75)" : accent),
        background: dark ? "rgba(0,0,0,0.35)" : `${accent}14`,
        padding: "0.25em 0.7em",
        borderRadius: 2,
        display: "inline-block",
        textShadow: makeOutlineShadow(outline),
      }}
    >
      {text}
    </span>
  );
}

/** Gray placeholder panel shown when no image URL is provided. */
function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2"
      style={{ background: "#E8E6E2" }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BDBAB4"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      <span style={{ fontSize: "0.6em", color: "#B0ADA7", fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

// ─── Layout 1: side-by-side ───────────────────────────────────────────────────
// Left: before image. Right: after image. Room name at top, caption at bottom.

function SideBySideLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const accent = resolvedAccent;
  const roomName = content.roomName ?? slide.headline ?? "Room Overview";
  const caption = content.caption ?? null;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const resolvedTitleColor   = content.headlineColor ?? content.headingColor ?? branding.textColor;
  const resolvedCaptionColor = content.captionColor ?? "#9CA3AF";
  const accentLineColor = hasBg ? `${resolvedTitleColor}55` : `${accent}30`;
  const headingEm   = `${content.headingFontSize ?? 2.5}em`;
  const captionEmSz = `${content.captionFontSize ?? 1.5}em`;

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Header bar */}
      <div
        style={{
          flexShrink: 0,
          padding: SLIDE_PADDING.photo,
          display: "flex",
          alignItems: "baseline",
          gap: "1.2em",
        }}
      >
        <h2
          style={{
            fontFamily: headlineFont,
            fontSize: `${(content.headlineSize ?? content.headingFontSize ?? 2.0) * 1.25}em`,
            fontWeight: (content.headlineBold !== false) ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : "normal",
            textDecoration: content.headlineUnderline ? "underline" : "none",
            color: content.headlineColor ?? content.headingColor ?? branding.textColor,
            lineHeight: 1.15,
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {roomName}
        </h2>
        <div
          style={{
            height: 2,
            flex: 1,
            background: accentLineColor,
            marginBottom: "0.3em",
          }}
        />
      </div>

      {/* Image columns */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: "1.5%",
          padding: "0 5%",
          minHeight: 0,
        }}
      >
        {/* Before */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2.5%",
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
            {content.beforeImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.beforeImageUrl}
                alt="Before"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <ImagePlaceholder label="No before photo" />
            )}
            {/* Label overlay at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "8% 5% 5%",
                background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <Label text={content.beforeLabel ?? "Before"} accent={accent} dark
                font={content.beforeLabelFont} size={content.beforeLabelSize ?? 2.5}
                bold={content.beforeLabelBold} italic={content.beforeLabelItalic}
                underline={content.beforeLabelUnderline} color={content.beforeLabelColor}
                outline={content.beforeLabelOutline} />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "#D8D5D0", flexShrink: 0, alignSelf: "stretch" }} />

        {/* After */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2.5%",
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
            {content.afterImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.afterImageUrl}
                alt="After"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <ImagePlaceholder label="No render / after photo" />
            )}
            {/* Accent corner tab */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "8% 5% 5%",
                background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <Label text={content.afterLabel ?? "After"} accent={accent} dark
                font={content.afterLabelFont} size={content.afterLabelSize ?? 2.5}
                bold={content.afterLabelBold} italic={content.afterLabelItalic}
                underline={content.afterLabelUnderline} color={content.afterLabelColor}
                outline={content.afterLabelOutline} />
            </div>
          </div>
        </div>
      </div>

      {/* Phase 8C: bullet strip replaces the single-line caption when present.
          Falls back to the existing italic caption when bullets are absent. */}
      {Array.isArray(content.bullets) && content.bullets.length > 0 ? (
        <div
          style={{
            flexShrink: 0,
            padding: "2% 5% 3%",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5em 2em",
            rowGap: "0.4em",
          }}
        >
          {content.bullets.map((b, i) => (
            <span
              key={i}
              style={{
                fontFamily: bodyFont,
                fontSize: `${(content.captionSize ?? content.captionFontSize ?? 2.0) * 0.6}em`,
                color: content.captionColor ?? resolvedCaptionColor,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45em",
              }}
            >
              <span style={{ color: accent, fontSize: "1.1em", lineHeight: 1 }}>•</span>
              {b.text}
            </span>
          ))}
        </div>
      ) : (
        <div
          style={{
            flexShrink: 0,
            padding: "2% 5% 3%",
          }}
        >
          <p
            style={{
              fontFamily: content.captionFont ?? bodyFont,
              fontSize: `${(content.captionSize ?? content.captionFontSize ?? 2.0) * 1.0}em`,
              fontWeight: content.captionBold ? 700 : 400,
              fontStyle: content.captionItalic ?? (caption ? true : false) ? "italic" : "normal",
              textDecoration: content.captionUnderline ? "underline" : "none",
              color: content.captionColor ?? resolvedCaptionColor,
              textShadow: makeOutlineShadow(content.captionOutline),
            }}
          >
            {caption ?? ""}
          </p>
        </div>
      )}

      {/* Logo overlay */}
      <LogoOverlay
        show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)}
        variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"}
        xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85}
        yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88}
        scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout 2: after-emphasis ─────────────────────────────────────────────────
// Hero after image fills the right 65%. Left editorial panel with room name.
// Before image shown as a small inset within the left panel.

function AfterEmphasisLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const accent = resolvedAccent;
  const roomName = content.roomName ?? slide.headline ?? "Room Overview";
  const caption = content.caption ?? null;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const headingEm   = `${content.headingFontSize ?? 2.5}em`;
  const captionEmSz = `${content.captionFontSize ?? 1.5}em`;
  const resolvedTitleColor   = content.headingColor ?? "#F8F7F4";
  const resolvedCaptionColor = content.captionColor ?? "rgba(255,255,255,0.55)";

  return (
    <div
      className="relative w-full h-full flex"
      style={{ background: hasBg ? "transparent" : "#111827", overflow: "hidden" }}
    >
      {/* ── Left panel ────────────────────────────────────────────────── */}
      <div
        style={{
          width: `${content.leftPanelWidth ?? 35}%`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "6% 6% 5%",
          background: hasBg ? "rgba(15,22,36,0.82)" : "#1A2332",
          zIndex: 2,
        }}
      >
        {/* Top block — room name + accent */}
        <div>
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${(content.headlineSize ?? content.headingFontSize ?? 2.0) * 1.25}em`,
              fontWeight: (content.headlineBold !== false) ? 800 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: content.headlineColor ?? content.headingColor ?? resolvedTitleColor,
              lineHeight: 1.2,
              marginBottom: "0.4em",
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {roomName}
          </h2>
          <TitleAccentRule accentColor={accent} marginBottom={caption || (content.bullets?.length ?? 0) > 0 ? "0.8em" : "0"} />
          {/* Phase 8C: vertical bullet strip replaces the caption in the left
              panel when bullets exist. Falls back to the italic caption when
              absent. */}
          {Array.isArray(content.bullets) && content.bullets.length > 0 ? (
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.35em", listStyle: "none", padding: 0, margin: 0 }}>
              {content.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "0.5em",
                    fontFamily: content.captionFont ?? bodyFont,
                    fontSize: `${(content.captionSize ?? content.captionFontSize ?? 2.0) * 0.6}em`,
                    color: content.captionColor ?? resolvedCaptionColor,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: accent, flexShrink: 0 }}>•</span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>
          ) : caption ? (
            <p
              style={{
                fontFamily: content.captionFont ?? bodyFont,
                fontSize: `${(content.captionSize ?? content.captionFontSize ?? 2.0) * 1.0}em`,
                fontWeight: content.captionBold ? 700 : 400,
                fontStyle: content.captionItalic !== false ? "italic" : "normal",
                textDecoration: content.captionUnderline ? "underline" : "none",
                color: content.captionColor ?? resolvedCaptionColor,
                lineHeight: 1.65,
                textShadow: makeOutlineShadow(content.captionOutline),
              }}
            >
              {caption}
            </p>
          ) : null}
        </div>

        {/* Before thumbnail — bottom of left panel */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5em",
              marginBottom: "0.7em",
            }}
          >
            <span
              className="uppercase tracking-widest"
              style={{
                fontFamily: content.beforeLabelFont ?? "'Jost', sans-serif",
                fontSize: `${(content.beforeLabelSize ?? 2.5) * 0.45}em`,
                fontWeight: (content.beforeLabelBold !== false) ? 600 : 400,
                fontStyle: content.beforeLabelItalic ? "italic" : "normal",
                color: content.beforeLabelColor ?? "rgba(255,255,255,0.4)",
                letterSpacing: "0.14em",
                textShadow: makeOutlineShadow(content.beforeLabelOutline),
              }}
            >
              {content.beforeLabel ?? "Before"}
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          </div>
          <div
            style={{
              width: `${content.beforePhotoScale ?? 100}%`,
              aspectRatio: "4/3",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {content.beforeImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.beforeImageUrl}
                alt="Before"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: "#242E3D" }}
              >
                <span style={{ fontSize: "0.5em", color: "rgba(255,255,255,0.3)" }}>
                  No before photo
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Right panel — hero after image ────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        {content.afterImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={content.afterImageUrl}
            alt="After"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-3"
            style={{ background: "#2A3545" }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span style={{ fontSize: "0.65em", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
              No render selected
            </span>
          </div>
        )}

        {/* "After" label overlay — bottom-left near dividing line */}
        <div
          style={{
            position: "absolute",
            bottom: "4%",
            left: "4%",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: "0.5em",
          }}
        >
          <div
            style={{
              width: "1.2em",
              height: 2,
              background: accent,
              flexShrink: 0,
            }}
          />
          <span
            className="uppercase tracking-widest"
            style={{
              fontFamily: content.afterLabelFont ?? "'Jost', sans-serif",
              fontSize: `${(content.afterLabelSize ?? 2.5) * 0.5}em`,
              fontWeight: (content.afterLabelBold !== false) ? 600 : 400,
              fontStyle: content.afterLabelItalic ? "italic" : "normal",
              color: content.afterLabelColor ?? "rgba(255,255,255,0.85)",
              letterSpacing: "0.14em",
              textShadow: makeOutlineShadow(content.afterLabelOutline) ?? "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            {content.afterLabel ?? "After"}
          </span>
        </div>

        {/* Thin accent left edge over the photo */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            bottom: 0,
            background: accent,
            opacity: 0.85,
          }}
        />
      </div>

      {/* Logo overlay */}
      <LogoOverlay
        show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)}
        variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"}
        xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85}
        yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88}
        scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function BeforeAfterSlide({ slide, branding, hasAiBackground }: LayoutProps) {
  switch (slide.layoutKey) {
    case "after-emphasis":
      return <AfterEmphasisLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "side-by-side":
    default:
      return <SideBySideLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

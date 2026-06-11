"use client";

import { useRef, useState } from "react";
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
        <StatChip text={(content.transformationStat ?? "").trim() || null} accent={accent} />
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
          {(content.transformationStat ?? "").trim() && (
            <div style={{ marginBottom: "0.8em" }}>
              <StatChip text={(content.transformationStat ?? "").trim()} accent={accent} />
            </div>
          )}
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

// ─── Shared bits for the new layouts ──────────────────────────────────────────

/** Resolve the fields the newer layouts share. */
function baCommon(content: BeforeAfterContent, branding: DeckBranding) {
  return {
    accent: content.accentColor ?? branding.accentColor,
    roomName: content.roomName ?? "Room Overview",
    caption: (content.caption ?? "").trim() || null,
    stat: (content.transformationStat ?? "").trim() || null,
    headlineFont: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
    bodyFont: content.bodyFont ?? SLIDE_FONTS.defaults.body,
    titleColor: content.headlineColor ?? content.headingColor ?? branding.textColor,
    navy: branding.textColor ?? "#1A2332",
  };
}

/** Accent pill showing the transformation metric. */
function StatChip({ text, accent }: { text: string | null; accent: string }) {
  if (!text) return null;
  return (
    <span
      style={{
        display: "inline-block",
        background: accent,
        color: "#FFFFFF",
        fontFamily: "'Jost', sans-serif",
        fontWeight: 700,
        fontSize: "0.62em",
        letterSpacing: "0.04em",
        padding: "0.35em 0.85em",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/**
 * Compact change-list shown beneath the photos. Prefers the auto-generated
 * `bullets` (a tight, wrapped row of short changes) so the imagery dominates;
 * falls back to a 2-line-clamped caption when there are no bullets.
 */
function ChangeList({
  content,
  accent,
  bodyFont,
  color,
  align = "left",
}: {
  content: BeforeAfterContent;
  accent: string;
  bodyFont: string;
  color: string;
  align?: "left" | "center";
}) {
  // Scale by the "Caption text size" slider so it controls the bullets too.
  // Normalised to the 2.0 default so the compact base size is preserved at 1×.
  const sizeFactor = (content.captionSize ?? content.captionFontSize ?? 2.0) / 2.0;
  const bullets = (content.bullets ?? []).filter((b) => (b?.text ?? "").trim());
  if (bullets.length > 0) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35em 1.6em", justifyContent: align === "center" ? "center" : "flex-start" }}>
        {bullets.map((b, i) => (
          <span key={i} style={{ fontFamily: bodyFont, fontSize: `${0.62 * sizeFactor}em`, color, display: "inline-flex", alignItems: "center", gap: "0.4em", lineHeight: 1.4 }}>
            <span style={{ color: accent, fontSize: "1.1em", lineHeight: 1 }}>•</span>
            {b.text}
          </span>
        ))}
      </div>
    );
  }
  const caption = (content.caption ?? "").trim();
  if (!caption) return null;
  return (
    <p
      style={{
        fontFamily: content.captionFont ?? bodyFont,
        fontSize: `${0.66 * sizeFactor}em`,
        fontStyle: content.captionItalic !== false ? "italic" : "normal",
        color: content.captionColor ?? color,
        margin: 0,
        textAlign: align,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        lineHeight: 1.5,
      }}
    >
      {caption}
    </p>
  );
}

/** A standard title row (room name + accent rule + optional stat chip). */
function TitleRow({
  roomName,
  font,
  color,
  accent,
  stat,
}: {
  roomName: string;
  font: string;
  color: string;
  accent: string;
  stat: string | null;
}) {
  return (
    <div style={{ flexShrink: 0, padding: "5% 5% 0", display: "flex", alignItems: "center", gap: "1em" }}>
      <h2 style={{ fontFamily: font, fontSize: "2.3em", fontWeight: 700, color, lineHeight: 1.15, margin: 0 }}>
        {roomName}
      </h2>
      <div style={{ height: 2, flex: 1, background: `${accent}40` }} />
      <StatChip text={stat} accent={accent} />
    </div>
  );
}

// ─── Interactive reveal slider ────────────────────────────────────────────────
// Before is the base; After is clipped from the left and revealed by dragging the
// handle right. On-screen it's interactive; in a static export it renders at the
// stored sliderPosition. touchAction:none keeps drags from scrolling the page.

function RevealSlider({
  before,
  after,
  initial,
  accent,
  beforeLabel,
  afterLabel,
  radius = 0,
}: {
  before?: string | null;
  after?: string | null;
  initial: number;
  accent: string;
  beforeLabel: React.ReactNode;
  afterLabel: React.ReactNode;
  radius?: number;
}) {
  const [pos, setPos] = useState(Math.max(0, Math.min(100, initial)));
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  function update(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
        update(e.clientX);
      }}
      onPointerMove={(e) => { if (dragging.current) update(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", cursor: "ew-resize", userSelect: "none", touchAction: "none", borderRadius: radius, background: "#E8E6E2" }}
    >
      {before ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={before} alt="Before" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImagePlaceholder label="No before photo" />
      )}
      {after && (
        /* Before is the base (left of the handle); After is revealed to the RIGHT
           of the handle by clipping off everything left of `pos`. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={after} alt="After" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", clipPath: `inset(0 0 0 ${pos}%)` }} />
      )}
      {/* Each label fades out as its side is wiped away (Before at the far-left
          edge, After at the far-right edge). */}
      <div style={{ position: "absolute", top: "4%", left: "4%", zIndex: 3, opacity: Math.min(1, pos / 10), transition: "opacity 0.15s ease" }}>{beforeLabel}</div>
      <div style={{ position: "absolute", top: "4%", right: "4%", zIndex: 3, opacity: Math.min(1, (100 - pos) / 10), transition: "opacity 0.15s ease" }}>{afterLabel}</div>
      {/* Handle */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 2, background: "#FFFFFF", boxShadow: "0 0 6px rgba(0,0,0,0.45)", transform: "translateX(-1px)", zIndex: 4 }}>
        <div
          style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: "2.4em", height: "2.4em", borderRadius: "50%", background: "#FFFFFF",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
            color: accent, fontSize: "0.8em", fontWeight: 700,
          }}
        >
          ⟺
        </div>
      </div>
    </div>
  );
}

// ─── Layout 3: reveal-slider ──────────────────────────────────────────────────

function RevealSliderLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const c = baCommon(content, branding);
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      <TitleRow roomName={content.roomName ?? slide.headline ?? "Room Overview"} font={c.headlineFont} color={c.titleColor} accent={c.accent} stat={c.stat} />
      <div style={{ flex: 1, minHeight: 0, padding: "2.5% 5% 2%" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", boxShadow: "0 10px 32px rgba(0,0,0,0.18)" }}>
          <RevealSlider
            before={content.beforeImageUrl}
            after={content.afterImageUrl}
            initial={content.sliderPosition ?? 50}
            accent={c.accent}
            radius={8}
            beforeLabel={<Label text={content.beforeLabel ?? "Before"} accent={c.accent} dark size={content.beforeLabelSize ?? 2.5} font={content.beforeLabelFont} bold={content.beforeLabelBold} italic={content.beforeLabelItalic} color={content.beforeLabelColor} outline={content.beforeLabelOutline} />}
            afterLabel={<Label text={content.afterLabel ?? "After"} accent={c.accent} dark size={content.afterLabelSize ?? 2.5} font={content.afterLabelFont} bold={content.afterLabelBold} italic={content.afterLabelItalic} color={content.afterLabelColor} outline={content.afterLabelOutline} />}
          />
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: "0 5% 3.5%" }}>
        <ChangeList content={content} accent={c.accent} bodyFont={c.bodyFont} color="#4B5563" />
      </div>
      <LogoOverlay show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)} variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"} xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85} yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88} scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0} branding={branding} />
    </div>
  );
}

// ─── Layout 4: cards ──────────────────────────────────────────────────────────
// Two large rounded photo cards filling the slide, with BEFORE / AFTER pills
// overlaid on each image and a compact change-list beneath.

function CardImage({ url, placeholder, label, labelColor }: { url?: string | null; placeholder: string; label: React.ReactNode; labelColor: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative", borderRadius: 12, overflow: "hidden", boxShadow: "0 14px 34px rgba(0,0,0,0.16)", border: "3px solid #fff", background: "#fff" }}>
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImagePlaceholder label={placeholder} />
      )}
      {/* Pill overlaid top-left */}
      <span
        className="uppercase tracking-widest"
        style={{
          position: "absolute", top: "5%", left: "5%", zIndex: 2,
          fontFamily: "'Jost', sans-serif", fontSize: "0.58em", fontWeight: 700, letterSpacing: "0.16em",
          color: "#fff", background: labelColor, padding: "0.4em 1.1em", borderRadius: 999,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function CardsLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const c = baCommon(content, branding);
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      <TitleRow roomName={content.roomName ?? slide.headline ?? "Room Overview"} font={c.headlineFont} color={c.titleColor} accent={c.accent} stat={c.stat} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "3%", padding: "2.5% 5% 2%" }}>
        <CardImage url={content.beforeImageUrl} placeholder="No before photo" label={content.beforeLabel ?? "Before"} labelColor={c.navy} />
        <CardImage url={content.afterImageUrl} placeholder="No render / after photo" label={content.afterLabel ?? "After"} labelColor={c.accent} />
      </div>
      <div style={{ flexShrink: 0, padding: "0 5% 3.5%" }}>
        <ChangeList content={content} accent={c.accent} bodyFont={c.bodyFont} color="#4B5563" />
      </div>
      <LogoOverlay show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)} variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"} xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85} yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88} scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0} branding={branding} />
    </div>
  );
}

// ─── Layout 5: offset ─────────────────────────────────────────────────────────
// Before card sits behind/lower-left; After card overlaps in front, raised-right.

function OffsetLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const c = baCommon(content, branding);
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      <TitleRow roomName={content.roomName ?? slide.headline ?? "Room Overview"} font={c.headlineFont} color={c.titleColor} accent={c.accent} stat={c.stat} />
      <div style={{ flex: 1, minHeight: 0, position: "relative", margin: "2% 5% 1.5%" }}>
        {/* Before — back card, lower-left */}
        <div style={{ position: "absolute", left: 0, bottom: 0, width: "60%", height: "84%", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 22px rgba(0,0,0,0.14)", border: "1px solid #E5E3DF" }}>
          {content.beforeImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={content.beforeImageUrl} alt="Before" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : <ImagePlaceholder label="No before photo" />}
          <div style={{ position: "absolute", bottom: "5%", left: "5%" }}>
            <Label text={content.beforeLabel ?? "Before"} accent={c.accent} dark size={content.beforeLabelSize ?? 2.5} font={content.beforeLabelFont} color={content.beforeLabelColor} />
          </div>
        </div>
        {/* After — front card, upper-right, overlapping */}
        <div style={{ position: "absolute", right: 0, top: 0, width: "66%", height: "90%", borderRadius: 8, overflow: "hidden", boxShadow: "0 18px 40px rgba(0,0,0,0.3)", border: "4px solid #fff" }}>
          {content.afterImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={content.afterImageUrl} alt="After" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : <ImagePlaceholder label="No render / after photo" />}
          <div style={{ position: "absolute", top: "5%", right: "5%" }}>
            <Label text={content.afterLabel ?? "After"} accent={c.accent} dark size={content.afterLabelSize ?? 2.5} font={content.afterLabelFont} color={content.afterLabelColor} />
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: "0 5% 3.5%" }}>
        <ChangeList content={content} accent={c.accent} bodyFont={c.bodyFont} color="#4B5563" />
      </div>
      <LogoOverlay show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)} variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"} xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85} yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88} scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0} branding={branding} />
    </div>
  );
}

// ─── Layout 6: diagonal ───────────────────────────────────────────────────────
// Two angled panels (accent ╱ navy), each holding an angled photo card + ribbon
// label. Brand-styled, softer than the stock template.

function DiagonalLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const c = baCommon(content, branding);
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const ribbon = (text: string, color: string): React.CSSProperties => ({
    position: "absolute", fontFamily: "'Jost', sans-serif", fontWeight: 700, fontSize: "0.7em", letterSpacing: "0.16em",
    color: "#fff", background: color, padding: "0.4em 1.4em", borderRadius: 3, textTransform: "uppercase",
  });
  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : "#FAFAF8" }}>
      {/* Angled background panels */}
      <div style={{ position: "absolute", inset: 0, background: `${c.accent}1A`, clipPath: "polygon(0 0, 56% 0, 44% 100%, 0 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: `${c.navy}12`, clipPath: "polygon(56% 0, 100% 0, 100% 100%, 44% 100%)" }} />

      {/* Title */}
      <div style={{ position: "absolute", top: "5%", left: 0, right: 0, textAlign: "center", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5em" }}>
        <h2 style={{ fontFamily: c.headlineFont, fontSize: "2.0em", fontWeight: 700, color: c.titleColor, margin: 0 }}>
          {content.roomName ?? slide.headline ?? "Room Overview"}
        </h2>
        <StatChip text={c.stat} accent={c.accent} />
      </div>

      {/* Before card — left, tilted */}
      <div style={{ position: "absolute", left: "6%", top: "22%", width: "40%", height: "50%", transform: "rotate(-4deg)", borderRadius: 8, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,0.22)", border: "3px solid #fff" }}>
        {content.beforeImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={content.beforeImageUrl} alt="Before" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : <ImagePlaceholder label="No before photo" />}
      </div>
      <span style={{ ...ribbon(content.beforeLabel ?? "Before", c.accent), left: "10%", top: "20%", zIndex: 6 }}>{content.beforeLabel ?? "Before"}</span>

      {/* After card — right, tilted opposite */}
      <div style={{ position: "absolute", right: "6%", top: "25%", width: "42%", height: "52%", transform: "rotate(4deg)", borderRadius: 8, overflow: "hidden", boxShadow: "0 16px 38px rgba(0,0,0,0.3)", border: "3px solid #fff" }}>
        {content.afterImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={content.afterImageUrl} alt="After" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : <ImagePlaceholder label="No render / after photo" />}
      </div>
      <span style={{ ...ribbon(content.afterLabel ?? "After", c.navy), right: "10%", top: "23%", zIndex: 6 }}>{content.afterLabel ?? "After"}</span>

      {/* Change-list across the bottom (the "describing words") */}
      <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "5%", zIndex: 6 }}>
        <ChangeList content={content} accent={c.accent} bodyFont={c.bodyFont} color="#4B5563" align="center" />
      </div>

      <LogoOverlay show={content.showLogo ?? !!(branding.logoLightUrl || branding.logoDarkUrl)} variant={(content.logoVariant ?? "light") === "dark" ? "dark" : "light"} xPercent={content.logoX != null ? (content.logoX <= 1 ? content.logoX * 100 : content.logoX) : 85} yPercent={content.logoY != null ? (content.logoY <= 1 ? content.logoY * 100 : content.logoY) : 88} scale={content.logoSize != null ? Math.min(content.logoSize, 4.0) : 1.0} branding={branding} />
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function BeforeAfterSlide({ slide, branding, hasAiBackground }: LayoutProps) {
  switch (slide.layoutKey) {
    case "reveal-slider":
      return <RevealSliderLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "cards":
      return <CardsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "offset":
      return <OffsetLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "diagonal":
      return <DiagonalLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "after-emphasis":
      return <AfterEmphasisLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "side-by-side":
    default:
      return <SideBySideLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

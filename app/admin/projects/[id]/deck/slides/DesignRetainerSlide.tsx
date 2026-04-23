"use client";

import type { ProposalSlide, DeckBranding, DesignRetainerContent, DesignRetainerBenefit } from "@/app/lib/deck/types";
import { DEFAULT_DESIGN_RETAINER_BENEFITS } from "@/app/lib/design-retainer-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

/** Compact money formatter for the three-band layout — no decimals. */
function fmtDollars(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Range formatter for Band 2 / Band 3. Handles missing / equal-value edge cases. */
function fmtRange(low: number | null | undefined, high: number | null | undefined): string {
  const lo = low ?? 0;
  const hi = high ?? 0;
  if (lo === 0 && hi === 0) return "—";
  if (lo === hi) return fmtDollars(lo);
  if (lo === 0) return fmtDollars(hi);
  if (hi === 0) return fmtDollars(lo);
  return `${fmtDollars(lo)} – ${fmtDollars(hi)}`;
}

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

/** Normalize a benefit item — supports legacy string[] and new object[]. */
function normalizeBenefit(b: string | DesignRetainerBenefit): DesignRetainerBenefit {
  return typeof b === "string" ? { text: b } : b;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const LINEN = "#F5F0E8";
const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Gold checkmark SVG ─────────────────────────────────────────────────────

function GoldCheck({ color = GOLD, size = "1.1em" }: { color?: string; size?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Architectural watermark (top-right) ────────────────────────────────────

function ArchitecturalWatermark({ color = NAVY, opacity = 0.04 }: { color?: string; opacity?: number }) {
  return (
    <svg
      width="220"
      height="220"
      viewBox="0 0 220 220"
      fill="none"
      stroke={color}
      strokeWidth={0.7}
      style={{
        position: "absolute",
        top: "3%",
        right: "3%",
        opacity,
        pointerEvents: "none",
      }}
    >
      <circle cx="110" cy="110" r="100" />
      <circle cx="110" cy="110" r="70" />
      <line x1="110" y1="10" x2="110" y2="210" />
      <line x1="10" y1="110" x2="210" y2="110" />
      <line x1="39" y1="39" x2="181" y2="181" />
      <line x1="181" y1="39" x2="39" y2="181" />
      <circle cx="110" cy="110" r="8" fill={color} fillOpacity={opacity * 3} stroke="none" />
    </svg>
  );
}

// ─── Main slide component ────────────────────────────────────────────────────

export function DesignRetainerSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as DesignRetainerContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "DESIGN RETAINER";
  const headline = slide.headline ?? "Your Design Retainer";
  const tagline = c.tagline ?? "Your investment in certainty before construction begins.";
  const retainerAmount = c.retainerAmount ?? "$22,000";
  const rawBenefits = c.benefits && c.benefits.length > 0 ? c.benefits : DEFAULT_DESIGN_RETAINER_BENEFITS;
  const benefits = rawBenefits.map(normalizeBenefit);
  const description = c.description ?? "";
  const noteText = c.noteText ?? "";
  const backgroundImage = c.backgroundImage ?? null;

  switch (layoutKey) {
    case "three-band-summary":
      return (
        <ThreeBandSummaryLayout
          slide={slide}
          content={c}
          branding={branding}
          hasAiBackground={hasAiBackground}
          benefits={benefits}
        />
      );
    case "centered-hero":
      return (
        <CenteredHeroLayout
          sectionLabel={sectionLabel}
          headline={headline}
          tagline={tagline}
          retainerAmount={retainerAmount}
          benefits={benefits}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
    case "framed-card":
      return (
        <FramedCardLayout
          sectionLabel={sectionLabel}
          retainerAmount={retainerAmount}
          description={description}
          noteText={noteText}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
    case "dark-overlay-modal":
      return (
        <DarkOverlayModalLayout
          headline={headline}
          retainerAmount={retainerAmount}
          benefits={benefits}
          noteText={noteText}
          backgroundImage={backgroundImage}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
    default:
      return (
        <CenteredHeroLayout
          sectionLabel={sectionLabel}
          headline={headline}
          tagline={tagline}
          retainerAmount={retainerAmount}
          benefits={benefits}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Layout A: Centered Hero ────────────────────────────────────────────────

function CenteredHeroLayout({
  sectionLabel,
  headline,
  tagline,
  retainerAmount,
  benefits,
  hasAiBackground,
  content,
  branding,
}: {
  sectionLabel: string;
  headline: string;
  tagline: string;
  retainerAmount: string;
  benefits: DesignRetainerBenefit[];
  hasAiBackground?: boolean;
  content: DesignRetainerContent;
  branding: DeckBranding;
}) {
  const accent = content.accentColor ?? GOLD;

  // Per-field styles
  const sectionLabelFont = content.sectionLabelFont ?? SLIDE_FONTS.defaults.label;
  const sectionLabelColor = content.sectionLabelColor ?? accent;

  const headlineFont = content.headlineFont2 ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.3;
  const headlineColor = content.headlineColor2 ?? NAVY;

  const amountFont = content.amountFont ?? SLIDE_FONTS.defaults.headline;
  const amountSize = content.amountSize ?? 3.0;
  const amountColor = content.amountColor ?? NAVY;

  const taglineFont = content.taglineFont ?? SLIDE_FONTS.defaults.headline;
  const taglineSize = content.taglineSize ?? 0.75;
  const taglineColor = content.taglineColor ?? MUTED_NAVY;

  return (
    <div
      className="relative w-full h-full"
      style={{
        overflow: "hidden",
        background: hasAiBackground ? "transparent" : LINEN,
      }}
    >
      <ArchitecturalWatermark />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Section label — top-left */}
        {(content.showSectionLabel ?? true) && (
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "6%",
            fontFamily: sectionLabelFont,
            fontSize: SECTION_LABEL_SIZE,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: sectionLabelColor,
          }}
        >
          {sectionLabel}
        </div>
        )}

        {/* Headline */}
        <div
          style={{
            fontFamily: headlineFont,
            fontSize: `${headlineSize}em`,
            fontWeight: (content.headlineBold ?? true) ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: headlineColor,
            textAlign: "center",
            lineHeight: 1.2,
            marginBottom: "0.2em",
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {headline}
        </div>

        <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0.6em" />

        {/* Large retainer amount */}
        <div
          style={{
            fontFamily: amountFont,
            fontSize: `${amountSize}em`,
            fontWeight: (content.amountBold ?? true) ? 700 : 400,
            fontStyle: content.amountItalic ? "italic" : undefined,
            textDecoration: content.amountUnderline ? "underline" : undefined,
            color: amountColor,
            textAlign: "center",
            lineHeight: 1,
            marginBottom: "0.15em",
            textShadow: makeOutlineShadow(content.amountOutline),
          }}
        >
          {retainerAmount}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: taglineFont,
            fontSize: `${taglineSize}em`,
            fontWeight: content.taglineBold ? 700 : 400,
            fontStyle: (content.taglineItalic ?? true) ? "italic" : undefined,
            textDecoration: content.taglineUnderline ? "underline" : undefined,
            color: taglineColor,
            textAlign: "center",
            lineHeight: 1.5,
            marginBottom: "1.2em",
            maxWidth: "70%",
            textShadow: makeOutlineShadow(content.taglineOutline),
          }}
        >
          {tagline}
        </div>

        {/* Benefits */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.45em",
            alignItems: "flex-start",
          }}
        >
          {benefits.map((b, i) => {
            const textFont = b.textFont ?? SLIDE_FONTS.defaults.body;
            const textSize = b.textSize ?? 0.58;
            const textColor = b.textColor ?? NAVY;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5em",
                }}
              >
                <GoldCheck color={accent} />
                <span
                  style={{
                    fontFamily: textFont,
                    fontSize: `${textSize}em`,
                    fontWeight: b.textBold ? 700 : 400,
                    fontStyle: b.textItalic ? "italic" : undefined,
                    textDecoration: b.textUnderline ? "underline" : undefined,
                    color: textColor,
                    lineHeight: 1.4,
                    textShadow: makeOutlineShadow(b.textOutline),
                  }}
                >
                  {b.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: Framed Card ──────────────────────────────────────────────────

function FramedCardLayout({
  sectionLabel,
  retainerAmount,
  description,
  noteText,
  hasAiBackground,
  content,
  branding,
}: {
  sectionLabel: string;
  retainerAmount: string;
  description: string;
  noteText: string;
  hasAiBackground?: boolean;
  content: DesignRetainerContent;
  branding: DeckBranding;
}) {
  const accent = content.accentColor ?? GOLD;

  // Per-field styles
  const sectionLabelFont = content.sectionLabelFont ?? SLIDE_FONTS.defaults.label;
  const sectionLabelColor = content.sectionLabelColor ?? accent;

  const headlineFont = content.headlineFont2 ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.1;
  const headlineColor = content.headlineColor2 ?? NAVY;

  const amountFont = content.amountFont ?? SLIDE_FONTS.defaults.headline;
  const amountSize = content.amountSize ?? 1.6;
  const amountColor = content.amountColor ?? NAVY;

  const descFont = content.descriptionFont ?? SLIDE_FONTS.defaults.body;
  const descSize = content.descriptionSize ?? 0.6;
  const descColor = content.descriptionColor ?? MUTED_NAVY;

  const noteFont = content.noteFont ?? SLIDE_FONTS.defaults.body;
  const noteSize = content.noteSize ?? 0.5;
  const noteColor = content.noteColor ?? MUTED_NAVY;

  return (
    <div
      className="relative w-full h-full"
      style={{
        overflow: "hidden",
        background: hasAiBackground ? "transparent" : LINEN,
      }}
    >
      <ArchitecturalWatermark opacity={0.03} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Framed card */}
        <div
          style={{
            width: "100%",
            maxWidth: "80%",
            borderLeft: `3px solid ${accent}`,
            background: "rgba(255,255,255,0.6)",
            padding: "1.4em 1.8em",
          }}
        >
          {/* Top row: label + amount */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "0.4em",
            }}
          >
            <div
              style={{
                fontFamily: sectionLabelFont,
                fontSize: `${headlineSize}em`,
                fontWeight: (content.headlineBold ?? true) ? 700 : 400,
                fontStyle: content.headlineItalic ? "italic" : undefined,
                textDecoration: content.headlineUnderline ? "underline" : undefined,
                color: sectionLabelColor,
                textShadow: makeOutlineShadow(content.headlineOutline),
              }}
            >
              {sectionLabel}
            </div>
            <div
              style={{
                fontFamily: amountFont,
                fontSize: `${amountSize}em`,
                fontWeight: (content.amountBold ?? true) ? 700 : 400,
                fontStyle: content.amountItalic ? "italic" : undefined,
                textDecoration: content.amountUnderline ? "underline" : undefined,
                color: amountColor,
                textShadow: makeOutlineShadow(content.amountOutline),
              }}
            >
              {retainerAmount}
            </div>
          </div>

          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.narrow} marginTop="0" marginBottom="0.5em" />

          {/* Description */}
          {description && (
            <div
              style={{
                fontFamily: descFont,
                fontSize: `${descSize}em`,
                fontWeight: content.descriptionBold ? 700 : 400,
                fontStyle: content.descriptionItalic ? "italic" : undefined,
                textDecoration: content.descriptionUnderline ? "underline" : undefined,
                color: descColor,
                lineHeight: 1.6,
                marginBottom: noteText ? "0.5em" : 0,
                textShadow: makeOutlineShadow(content.descriptionOutline),
              }}
            >
              {description}
            </div>
          )}

          {/* Note */}
          {(content.showFooterNote ?? true) && noteText && (
            <div
              style={{
                fontFamily: noteFont,
                fontSize: `${noteSize}em`,
                fontWeight: content.noteBold ? 700 : 400,
                fontStyle: (content.noteItalic ?? true) ? "italic" : undefined,
                textDecoration: content.noteUnderline ? "underline" : undefined,
                color: noteColor,
                lineHeight: 1.5,
                opacity: 0.8,
                textShadow: makeOutlineShadow(content.noteOutline),
              }}
            >
              {noteText}
            </div>
          )}
        </div>
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout C: Dark Overlay Modal ───────────────────────────────────────────

function DarkOverlayModalLayout({
  headline,
  retainerAmount,
  benefits,
  noteText,
  backgroundImage,
  hasAiBackground,
  content,
  branding,
}: {
  headline: string;
  retainerAmount: string;
  benefits: DesignRetainerBenefit[];
  noteText: string;
  backgroundImage: string | null;
  hasAiBackground?: boolean;
  content: DesignRetainerContent;
  branding: DeckBranding;
}) {
  const accent = content.accentColor ?? GOLD;
  const hasBg = !!backgroundImage;

  // Per-field styles
  const headlineFont = content.headlineFont2 ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.15;
  const headlineColor = content.headlineColor2 ?? NAVY;

  const amountFont = content.amountFont ?? SLIDE_FONTS.defaults.headline;
  const amountSize = content.amountSize ?? 2.6;
  const amountColor = content.amountColor ?? accent;

  const noteFont = content.noteFont ?? SLIDE_FONTS.defaults.body;
  const noteSize = content.noteSize ?? 0.42;
  const noteColor = content.noteColor ?? MUTED_NAVY;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden" }}
    >
      {/* Background image or solid navy */}
      {hasBg ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : null}

      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasBg
            ? "rgba(0,0,0,0.6)"
            : hasAiBackground
              ? "rgba(0,0,0,0.45)"
              : NAVY,
        }}
      />

      {/* Centered white card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5%",
        }}
      >
        <div
          style={{
            width: "60%",
            background: "rgba(255,255,255,0.95)",
            borderRadius: "4px",
            padding: "2em 2.5em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Headline */}
          <div
            style={{
              fontFamily: headlineFont,
              fontSize: `${headlineSize}em`,
              fontWeight: (content.headlineBold ?? true) ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : undefined,
              textDecoration: content.headlineUnderline ? "underline" : undefined,
              color: headlineColor,
              textAlign: "center",
              lineHeight: 1.2,
              marginBottom: "0.2em",
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </div>

          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.narrow} marginTop="0.3em" marginBottom="0.6em" />

          {/* Retainer amount */}
          <div
            style={{
              fontFamily: amountFont,
              fontSize: `${amountSize}em`,
              fontWeight: (content.amountBold ?? true) ? 700 : 400,
              fontStyle: content.amountItalic ? "italic" : undefined,
              textDecoration: content.amountUnderline ? "underline" : undefined,
              color: amountColor,
              textAlign: "center",
              lineHeight: 1,
              marginBottom: "0.6em",
              textShadow: makeOutlineShadow(content.amountOutline),
            }}
          >
            {retainerAmount}
          </div>

          {/* Benefits */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4em",
              alignItems: "flex-start",
              marginBottom: noteText ? "0.8em" : 0,
              width: "100%",
              paddingLeft: "8%",
            }}
          >
            {benefits.map((b, i) => {
              const textFont = b.textFont ?? SLIDE_FONTS.defaults.body;
              const textSize = b.textSize ?? 0.52;
              const textColor = b.textColor ?? NAVY;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5em",
                  }}
                >
                  <GoldCheck size="0.95em" color={accent} />
                  <span
                    style={{
                      fontFamily: textFont,
                      fontSize: `${textSize}em`,
                      fontWeight: b.textBold ? 700 : 400,
                      fontStyle: b.textItalic ? "italic" : undefined,
                      textDecoration: b.textUnderline ? "underline" : undefined,
                      color: textColor,
                      lineHeight: 1.4,
                      textShadow: makeOutlineShadow(b.textOutline),
                    }}
                  >
                    {b.text}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Note */}
          {(content.showFooterNote ?? true) && noteText && (
            <div
              style={{
                fontFamily: noteFont,
                fontSize: `${noteSize}em`,
                fontWeight: content.noteBold ? 700 : 400,
                fontStyle: (content.noteItalic ?? true) ? "italic" : undefined,
                textDecoration: content.noteUnderline ? "underline" : undefined,
                color: noteColor,
                textAlign: "center",
                lineHeight: 1.5,
                borderTop: `1px solid rgba(0,0,0,0.08)`,
                paddingTop: "0.6em",
                width: "90%",
                textShadow: makeOutlineShadow(content.noteOutline),
              }}
            >
              {noteText}
            </div>
          )}
        </div>
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout D: Three-Band Summary (Phase 8C) ────────────────────────────────
// Renders the full investment story on one slide:
//   Band 1 — Design / Feasibility Retainer + bullets
//   Band 2 — Projected Construction Investment (range)
//   Band 3 — TOTAL PROJECT INVESTMENT (retainer + construction, accent color)
//
// When Project.retainerEnabled === false, Band 1 and Band 3 hide; Band 2
// takes over the emotional-landing treatment (centered, large, accent color).

function ThreeBandSummaryLayout({
  slide,
  content,
  branding,
  hasAiBackground,
  benefits,
}: {
  slide: ProposalSlide;
  content: DesignRetainerContent;
  branding: DeckBranding;
  hasAiBackground?: boolean;
  benefits: DesignRetainerBenefit[];
}) {
  const accent = content.accentColor ?? branding.accentColor ?? GOLD;
  const retainerEnabled = content.retainerEnabled !== false; // default true when field absent
  const retainerAmountStr = content.retainerAmount ?? null;
  const retainerAmountNum = content.retainerAmountNumber ?? null;
  const constructionLow = content.constructionLow ?? null;
  const constructionHigh = content.constructionHigh ?? null;
  const hourlyRate = content.designHourlyRate ?? null;

  // Total range — retainer (flat) + construction range. Null when we can't
  // compute (missing construction or disabled retainer handled per-band).
  const totalLow =
    retainerEnabled && retainerAmountNum != null && constructionLow != null
      ? retainerAmountNum + constructionLow
      : null;
  const totalHigh =
    retainerEnabled && retainerAmountNum != null && constructionHigh != null
      ? retainerAmountNum + constructionHigh
      : null;

  const headline = slide.headline ?? "Your Investment";

  return (
    <div
      className="relative w-full h-full"
      style={{
        overflow: "hidden",
        background: hasAiBackground ? "transparent" : LINEN,
      }}
    >
      <ArchitecturalWatermark opacity={0.035} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* Slide headline */}
        <div style={{ flexShrink: 0, marginBottom: "2%" }}>
          <h2
            style={{
              fontFamily: SLIDE_FONTS.defaults.headline,
              fontSize: "1.5em",
              fontWeight: 700,
              color: NAVY,
              lineHeight: 1.15,
              marginBottom: "0.1em",
            }}
          >
            {headline}
          </h2>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.25em" marginBottom="0" />
        </div>

        {/* Body: three bands vertically with small gaps */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 0,
          }}
        >
          {/* ── Band 1: Retainer ───────────────────────────────────── */}
          {retainerEnabled && (
            <div
              style={{
                paddingTop: "1.2%",
                paddingBottom: "1.5%",
                borderBottom: `1px solid ${NAVY}1A`,
              }}
            >
              {/* Row 1: label + amount */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.35em" }}>
                <span
                  style={{
                    fontFamily: SLIDE_FONTS.defaults.headline,
                    fontSize: "0.85em",
                    fontWeight: 700,
                    color: NAVY,
                    letterSpacing: "0.01em",
                  }}
                >
                  Design / Feasibility Retainer
                </span>
                <span
                  style={{
                    fontFamily: SLIDE_FONTS.defaults.headline,
                    fontSize: "1.35em",
                    fontWeight: 700,
                    color: NAVY,
                    lineHeight: 1,
                  }}
                >
                  {retainerAmountStr ?? "—"}
                </span>
              </div>

              {/* Row 2: hourly rate + third-party services sentences. The
                  hourly-rate sentence is omitted entirely when designHourlyRate
                  is null (tenant hasn't published one). */}
              <p
                style={{
                  fontFamily: SLIDE_FONTS.defaults.body,
                  fontSize: "0.55em",
                  color: MUTED_NAVY,
                  lineHeight: 1.55,
                  marginBottom: "0.6em",
                  maxWidth: "88%",
                }}
              >
                {hourlyRate != null && (
                  <>Design work billed at our published rate of ${hourlyRate}/hour. </>
                )}
                Third-party services (surveys, engineering, 3D scanning) are included.
              </p>

              {/* Row 3: bullets (2-column grid) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3em 1.8em" }}>
                {benefits.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5em" }}>
                    <GoldCheck color={accent} size="0.85em" />
                    <span
                      style={{
                        fontFamily: SLIDE_FONTS.defaults.body,
                        fontSize: "0.56em",
                        color: NAVY,
                        lineHeight: 1.4,
                      }}
                    >
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Band 2: Construction ──────────────────────────────────
              When retainer is disabled, this band inherits Band 3's emotional
              landing treatment (large, centered, accent color). */}
          <div
            style={{
              paddingTop: "1.5%",
              paddingBottom: "1.5%",
              borderBottom: retainerEnabled ? `1px solid ${NAVY}1A` : undefined,
              display: "flex",
              flexDirection: retainerEnabled ? "row" : "column",
              alignItems: retainerEnabled ? "baseline" : "center",
              justifyContent: retainerEnabled ? "space-between" : "center",
              textAlign: retainerEnabled ? undefined : "center",
              flex: retainerEnabled ? undefined : 1,
              gap: retainerEnabled ? undefined : "0.3em",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: SLIDE_FONTS.defaults.headline,
                  fontSize: retainerEnabled ? "0.85em" : "0.95em",
                  fontWeight: 700,
                  color: retainerEnabled ? NAVY : accent,
                  letterSpacing: retainerEnabled ? "0.01em" : "0.08em",
                  textTransform: retainerEnabled ? "none" : "uppercase",
                  marginBottom: retainerEnabled ? "0.2em" : "0.3em",
                }}
              >
                {retainerEnabled ? "Projected Construction Investment" : "Total Project Investment"}
              </div>
              {retainerEnabled && (
                <p
                  style={{
                    fontFamily: SLIDE_FONTS.defaults.body,
                    fontSize: "0.5em",
                    fontStyle: "italic",
                    color: MUTED_NAVY,
                    lineHeight: 1.4,
                  }}
                >
                  (Per the detail on the previous slide)
                </p>
              )}
            </div>
            <div
              style={{
                fontFamily: SLIDE_FONTS.defaults.headline,
                fontSize: retainerEnabled ? "1.35em" : "3.2em",
                fontWeight: 700,
                color: retainerEnabled ? NAVY : accent,
                lineHeight: 1,
              }}
            >
              {fmtRange(constructionLow, constructionHigh)}
            </div>
          </div>

          {/* ── Band 3: Total (only when retainer enabled) ───────────── */}
          {retainerEnabled && (
            <div
              style={{
                paddingTop: "2%",
                paddingBottom: "1%",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "1em",
              }}
            >
              <span
                style={{
                  fontFamily: SLIDE_FONTS.defaults.headline,
                  fontSize: "0.95em",
                  fontWeight: 700,
                  color: accent,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Total Project Investment
              </span>
              <span
                style={{
                  fontFamily: SLIDE_FONTS.defaults.headline,
                  fontSize: "2.1em",
                  fontWeight: 700,
                  color: accent,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtRange(totalLow, totalHigh)}
              </span>
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

"use client";

import type { ProposalSlide, DeckBranding, DesignRetainerContent, DesignRetainerBenefit } from "@/app/lib/deck/types";
import { DEFAULT_DESIGN_RETAINER_BENEFITS } from "@/app/lib/design-retainer-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

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

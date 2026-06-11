"use client";

import type { ProposalSlide, DeckBranding, NextStepsContent, NextStep } from "@/app/lib/deck/types";
import { HHI_DEFAULT_NEXT_STEPS } from "@/app/lib/next-steps-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";
import { useDeckTheme } from "@/app/lib/deck/theme-context";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Outline shadow helper ──────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

// Contact info is deliberately NOT rendered on this slide — it lives on the
// Closing slide (the next slide), which pulls email/phone from branding.

// ─── Main slide component ────────────────────────────────────────────────────

export function NextStepsSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as NextStepsContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "WHAT HAPPENS NEXT";
  const headline = slide.headline ?? "Your Path Forward";
  const steps = c.steps && c.steps.length > 0 ? c.steps : HHI_DEFAULT_NEXT_STEPS;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  const common = {
    sectionLabel,
    headline,
    steps,
    rightPhoto: c.rightPhoto,
    hasBg,
    content: c,
    branding,
  };

  switch (layoutKey) {
    case "numbered-photo":
      return <NumberedPhotoLayout {...common} />;
    case "staircase-cards":
      return <StaircaseCardsLayout {...common} />;
    case "column-grid-photos":
      return <ColumnGridPhotosLayout {...common} />;
    case "two-by-two-grid":
      return <TwoByTwoGridLayout {...common} />;
    case "large-number-hero":
      return <LargeNumberHeroLayout {...common} />;
    default:
      return <NumberedPhotoLayout {...common} />;
  }
}

// ─── Shared types ───────────────────────────────────────────────────────────

interface LayoutProps {
  sectionLabel: string;
  headline: string;
  steps: NextStep[];
  rightPhoto?: string | null;
  hasBg?: boolean;
  content: NextStepsContent;
  branding: DeckBranding;
}

// ─── Layout A: Numbered List + Photo ────────────────────────────────────────

function NumberedPhotoLayout({
  sectionLabel,
  headline,
  steps,
  rightPhoto,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const navy = theme.color.panel;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}
    >
      {theme.surface.grid && !hasBg && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(26,35,50,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,35,50,0.04) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "2.2%" }}>
          {(content.showSectionLabel ?? true) && (
            <div
              style={{
                fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
                fontSize: SECTION_LABEL_SIZE,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: content.sectionLabelColor ?? accent,
                marginBottom: "0.4em",
              }}
            >
              {sectionLabel}
            </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline,
              fontSize: `${1.8 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? navy,
              lineHeight: 1.1,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.35em" marginBottom="0" />
        </div>

        {/* Body — photo LEFT, numbered list RIGHT (reference composition) */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "4%" }}>
          {rightPhoto && (
            <div
              style={{
                width: "40%",
                flexShrink: 0,
                borderRadius: 2,
                backgroundImage: `url(${rightPhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.6em", maxWidth: rightPhoto ? undefined : "78%", marginInline: rightPhoto ? undefined : "auto" }}>
            {steps.map((step) => (
              <div key={step.id} style={{ display: "flex", gap: "0.9em", alignItems: "flex-start" }}>
                {/* Big serif numeral — "01" style */}
                <div
                  style={{
                    fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                    fontSize: `${(step.numberSize ?? 3.0) * 0.85}em`,
                    fontWeight: (step.numberBold !== false) ? 600 : 400,
                    fontStyle: step.numberItalic ? "italic" : "normal",
                    textDecoration: step.numberUnderline ? "underline" : "none",
                    color: step.numberColor ?? navy,
                    lineHeight: 0.95,
                    minWidth: "1.55em",
                    flexShrink: 0,
                    textShadow: makeOutlineShadow(step.numberOutline),
                  }}
                >
                  {String(step.number).padStart(2, "0")}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: step.titleFont ?? SLIDE_FONTS.defaults.headline,
                      fontSize: `${1.1 * (step.titleSize ?? 1.0)}em`,
                      fontWeight: (step.titleBold ?? true) ? 700 : 400,
                      fontStyle: step.titleItalic ? "italic" : "normal",
                      textDecoration: step.titleUnderline ? "underline" : "none",
                      color: step.titleColor ?? navy,
                      lineHeight: 1.2,
                      marginBottom: "0.2em",
                      textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                      fontSize: `${0.72 * (step.descriptionSize ?? 1.0)}em`,
                      fontWeight: step.descriptionBold ? 600 : 400,
                      fontStyle: step.descriptionItalic ? "italic" : "normal",
                      textDecoration: step.descriptionUnderline ? "underline" : "none",
                      color: step.descriptionColor ?? theme.color.muted,
                      lineHeight: 1.5,
                      textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                    }}
                  >
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
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

// ─── Layout: Staircase Cards ─────────────────────────────────────────────────
// 3D slate cards stepping up left→right (serif numerals + titles, hard offset
// shadows) over a hairline architectural frame, with a navy footer band:
// serif tagline left, contact info right.

function StaircaseCardsLayout({ steps, hasBg, content, branding }: LayoutProps) {
  const theme = useDeckTheme();
  const navy = theme.color.panel;
  const n = Math.max(steps.length, 1);
  // Card width % — slider-scaled. Cards always spread edge-to-edge, so a
  // narrower card directly shrinks the horizontal overlap (~0.8× with 4
  // steps removes it entirely).
  const CW = Math.min((n >= 4 ? 31 : 35) * (content.stairCardWidth ?? 1.0), 92);
  const span = n > 1 ? (100 - CW) / (n - 1) : 0;
  // % climb per step — slider-scaled total rise (1.0 = 50%).
  const rise = n > 1 ? (50 * (content.stairClimb ?? 1.0)) / (n - 1) : 0;
  // Stacking: classic staircase puts each higher card IN FRONT; flipping it
  // keeps every card's text visible regardless of overlap.
  const frontFirst = content.stairFrontFirst ?? false;
  const tagline = content.footerTagline ?? "Let’s build your vision.";

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface, display: "flex", flexDirection: "column" }}
    >
      {theme.surface.grid && !hasBg && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(26,35,50,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,35,50,0.04) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
      )}
      {/* Hairline architectural frame above the footer band */}
      {!hasBg && (
        <div aria-hidden style={{ position: "absolute", top: "1.1em", left: "1.1em", right: "1.1em", bottom: "4.6em", border: "1px solid rgba(26,35,50,0.14)", pointerEvents: "none" }} />
      )}

      {/* The staircase */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, margin: "4% 5% 2%" }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{
              position: "absolute",
              left: `${i * span}%`,
              bottom: `${i * rise}%`,
              width: `${CW}%`,
              zIndex: frontFirst ? n - i : i + 1,
              background: "#ECF0F3",
              boxShadow: "0.55em 0.7em 0 rgba(26,35,50,0.22)",
              padding: "1.25em 1.4em",
            }}
          >
            <div
              style={{
                fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                fontSize: `${(step.numberSize ?? 3.0) * 0.88}em`,
                fontWeight: (step.numberBold !== false) ? 600 : 400,
                fontStyle: step.numberItalic ? "italic" : "normal",
                textDecoration: step.numberUnderline ? "underline" : "none",
                color: step.numberColor ?? theme.color.ink,
                lineHeight: 1,
                marginBottom: "0.22em",
                textShadow: makeOutlineShadow(step.numberOutline),
              }}
            >
              {String(step.number).padStart(2, "0")}
            </div>
            <div
              style={{
                fontFamily: step.titleFont ?? SLIDE_FONTS.defaults.headline,
                fontSize: `${1.08 * (step.titleSize ?? 1.0)}em`,
                fontWeight: (step.titleBold ?? true) ? 700 : 400,
                fontStyle: step.titleItalic ? "italic" : "normal",
                textDecoration: step.titleUnderline ? "underline" : "none",
                color: step.titleColor ?? theme.color.ink,
                lineHeight: 1.2,
                marginBottom: "0.35em",
                textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
              }}
            >
              {step.title}
            </div>
            <div
              style={{
                fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                fontSize: `${0.68 * (step.descriptionSize ?? 1.0)}em`,
                fontWeight: step.descriptionBold ? 600 : 400,
                fontStyle: step.descriptionItalic ? "italic" : "normal",
                textDecoration: step.descriptionUnderline ? "underline" : "none",
                color: step.descriptionColor ?? theme.color.muted,
                lineHeight: 1.5,
                textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
              }}
            >
              {step.description}
            </div>
          </div>
        ))}
      </div>

      {/* Navy footer band */}
      <div style={{ flexShrink: 0, position: "relative", zIndex: 6, background: navy, padding: "0.85em 2.2em", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2em" }}>
        <span style={{ fontFamily: SLIDE_FONTS.defaults.headline, fontSize: "1.3em", color: "#FFFFFF", lineHeight: 1.2 }}>
          {tagline}
        </span>
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? 88}
        yPercent={content.logoY ?? 8}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: 4-Column Grid with Photos ────────────────────────────────────

function ColumnGridPhotosLayout({
  sectionLabel,
  headline,
  steps,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}
    >
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "0.8em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline,
              fontSize: `${1.7 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
          </div>
        </div>

        {/* 4-column grid — vertically centered so the slide fills */}
        <div style={{ display: "flex", gap: "4%", flex: 1, alignItems: "center" }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Large number */}
              <div
                style={{
                  fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                  fontSize: `${(step.numberSize ?? 3.0) * 1.0}em`,
                  fontWeight: (step.numberBold !== false) ? 700 : 400,
                  fontStyle: step.numberItalic ? "italic" : "normal",
                  textDecoration: step.numberUnderline ? "underline" : "none",
                  color: step.numberColor ?? accent,
                  lineHeight: 1,
                  marginBottom: "0.2em",
                  textShadow: makeOutlineShadow(step.numberOutline),
                }}
              >
                {String(step.number).padStart(2, "0")}
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: step.titleFont ?? SLIDE_FONTS.defaults.headline,
                  fontSize: `${0.82 * (step.titleSize ?? 1.0)}em`,
                  fontWeight: (step.titleBold ?? true) ? 700 : 400,
                  fontStyle: step.titleItalic ? "italic" : "normal",
                  textDecoration: step.titleUnderline ? "underline" : "none",
                  color: step.titleColor ?? branding.textColor,
                  textAlign: "center",
                  lineHeight: 1.3,
                  marginBottom: "0.3em",
                  textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                }}
              >
                {step.title}
              </div>

              {/* Photo */}
              {step.photo && (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    backgroundImage: `url(${step.photo})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: 3,
                    marginBottom: "0.3em",
                    flexShrink: 0,
                  }}
                />
              )}

              {/* Description */}
              <div
                style={{
                  fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${0.62 * (step.descriptionSize ?? 1.0)}em`,
                  fontWeight: step.descriptionBold ? 600 : 400,
                  fontStyle: step.descriptionItalic ? "italic" : "normal",
                  textDecoration: step.descriptionUnderline ? "underline" : "none",
                  color: step.descriptionColor ?? MUTED_NAVY,
                  textAlign: "center",
                  lineHeight: 1.5,
                  textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                }}
              >
                {step.description}
              </div>
            </div>
          ))}
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

// ─── Layout C: 2x2 Grid ─────────────────────────────────────────────────────

function TwoByTwoGridLayout({
  sectionLabel,
  headline,
  steps,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}
    >
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "0.8em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline,
              fontSize: `${1.7 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
          </div>
        </div>

        {/* 2x2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: "1em",
            flex: 1,
          }}
        >
          {steps.slice(0, 4).map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                gap: "1em",
                alignItems: "center",
                padding: "1.1em 1.3em",
                background: "#FFFFFF",
                border: "1px solid rgba(26,35,50,0.08)",
                borderRadius: 6,
                boxShadow: "0 6px 18px rgba(26,35,50,0.07)",
              }}
            >
              {/* Number circle */}
              <div
                style={{
                  width: "2.2em",
                  height: "2.2em",
                  borderRadius: "50%",
                  background: accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                  fontSize: "0.95em",
                  fontWeight: (step.numberBold !== false) ? 700 : 400,
                  fontStyle: step.numberItalic ? "italic" : "normal",
                  color: "#FFFFFF",
                  flexShrink: 0,
                  textShadow: makeOutlineShadow(step.numberOutline),
                }}
              >
                {step.number}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: step.titleFont ?? SLIDE_FONTS.defaults.headline,
                    fontSize: `${0.88 * (step.titleSize ?? 1.0)}em`,
                    fontWeight: (step.titleBold ?? true) ? 700 : 400,
                    fontStyle: step.titleItalic ? "italic" : "normal",
                    textDecoration: step.titleUnderline ? "underline" : "none",
                    color: step.titleColor ?? branding.textColor,
                    lineHeight: 1.3,
                    marginBottom: "0.15em",
                    textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                    fontSize: `${0.64 * (step.descriptionSize ?? 1.0)}em`,
                    fontWeight: step.descriptionBold ? 600 : 400,
                    fontStyle: step.descriptionItalic ? "italic" : "normal",
                    textDecoration: step.descriptionUnderline ? "underline" : "none",
                    color: step.descriptionColor ?? MUTED_NAVY,
                    lineHeight: 1.5,
                    textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                  }}
                >
                  {step.description}
                </div>
              </div>
            </div>
          ))}
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

// ─── Layout D: Large Number Hero ────────────────────────────────────────────

function LargeNumberHeroLayout({
  sectionLabel,
  headline,
  steps,
  rightPhoto,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const hasPhoto = !!rightPhoto;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}
    >
      {theme.surface.grid && !hasBg && !hasPhoto && <BlueprintUnderlay />}
      {/* Optional right photo with overlay */}
      {hasPhoto && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "45%",
              height: "100%",
              backgroundImage: `url(${rightPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "45%",
              height: "100%",
              background: "linear-gradient(to right, rgba(245,240,232,1) 0%, rgba(245,240,232,0.7) 30%, rgba(245,240,232,0.3) 100%)",
            }}
          />
        </>
      )}

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
        {/* Header */}
        <div style={{ marginBottom: "0.6em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline,
              fontSize: `${1.7 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
        </div>

        {/* Ghost-numeral columns — giant pale 01–04 with the step copy
            OVERLAPPING the lower half of each numeral ("Path Forward"
            reference). Per-step Number Color overrides the ghost. */}
        <div style={{ display: "flex", gap: "4%", flex: 1, alignItems: "center", maxWidth: hasPhoto ? "62%" : undefined }}>
          {steps.map((step) => {
            const ghostEm = (step.numberSize ?? 3.0) * 3.8;
            return (
            <div key={step.id} style={{ flex: 1, position: "relative", minWidth: 0, paddingTop: `${ghostEm * 0.5}em` }}>
              {/* Ghost numeral */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: "-0.06em",
                  fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.label,
                  fontSize: `${ghostEm}em`,
                  fontWeight: (step.numberBold !== false) ? 700 : 400,
                  fontStyle: step.numberItalic ? "italic" : "normal",
                  color: step.numberColor ?? "rgba(26,35,50,0.095)",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  textShadow: makeOutlineShadow(step.numberOutline),
                }}
              >
                {String(step.number).padStart(2, "0")}
              </div>
              {/* Step copy over the numeral's lower half */}
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontFamily: step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                    fontSize: `${0.88 * (step.titleSize ?? 1.0)}em`,
                    fontWeight: (step.titleBold ?? true) ? 600 : 400,
                    fontStyle: step.titleItalic ? "italic" : "normal",
                    textDecoration: step.titleUnderline ? "underline" : "none",
                    color: step.titleColor ?? branding.textColor,
                    lineHeight: 1.25,
                    marginBottom: "0.45em",
                    textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                    fontSize: `${0.66 * (step.descriptionSize ?? 1.0)}em`,
                    fontWeight: step.descriptionBold ? 600 : 400,
                    fontStyle: step.descriptionItalic ? "italic" : "normal",
                    textDecoration: step.descriptionUnderline ? "underline" : "none",
                    color: step.descriptionColor ?? MUTED_NAVY,
                    lineHeight: 1.55,
                    textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                  }}
                >
                  {step.description}
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Footer — slogan line anchors the bottom. Contact info lives on the
            Closing slide. Whitespace-only tagline hides the line. */}
        {(() => {
          const tagline = content.footerTagline == null ? "Turning Ideas into Ideal Spaces. Design - Build - Remodel." : content.footerTagline.trim();
          if (!tagline) return null;
          return (
            <div
              style={{
                flexShrink: 0,
                marginTop: "auto",
                borderTop: "1px solid rgba(0,0,0,0.08)",
                paddingTop: "0.6em",
                textAlign: "center",
              }}
            >
              <p style={{ fontFamily: SLIDE_FONTS.defaults.body, fontSize: "0.45em", color: MUTED_NAVY, margin: 0, lineHeight: 1.5 }}>
                {tagline}
              </p>
            </div>
          );
        })()}
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

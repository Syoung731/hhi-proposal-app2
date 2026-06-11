"use client";

import type { ProposalSlide, DeckBranding, OverallInvestmentContent, DesignRetainerBenefit } from "@/app/lib/deck/types";
import { DEFAULT_DESIGN_RETAINER_BENEFITS } from "@/app/lib/design-retainer-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";
import { useDeckTheme } from "@/app/lib/deck/theme-context";

/** Compact money formatter for the three-band layout — no decimals. */
function fmtDollars(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Round a value to the nearest step (e.g. 1000 = nearest $1k). null/<=1 = no rounding. */
function applyRound(n: number | null | undefined, step: number | null | undefined): number | null {
  if (n == null) return null;
  if (!step || step <= 1) return n;
  return Math.round(n / step) * step;
}

/** Single-value formatter that respects rounding. */
function fmtAmount(n: number | null | undefined, step: number | null | undefined): string {
  const rounded = applyRound(n, step);
  if (rounded == null) return "—";
  return fmtDollars(rounded);
}

/** Range formatter that respects rounding. Collapses equal values to a single number. */
function fmtRange(
  low: number | null | undefined,
  high: number | null | undefined,
  step: number | null | undefined,
): string {
  const lo = applyRound(low, step) ?? 0;
  const hi = applyRound(high, step) ?? 0;
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

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

function normalizeBenefit(b: string | DesignRetainerBenefit): DesignRetainerBenefit {
  return typeof b === "string" ? { text: b } : b;
}

const MUTED_NAVY = "#4A5568";

function GoldCheck({ color, size = "1.1em" }: { color: string; size?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
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

export function OverallInvestmentSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey) {
    case "insurance-policy":
      return <InsurancePolicyLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "retainer-cta":
      return <RetainerCtaLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "three-band-summary":
    default:
      return <ThreeBandLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

function ThreeBandLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as OverallInvestmentContent;
  const rawBenefits = content.benefits && content.benefits.length > 0 ? content.benefits : DEFAULT_DESIGN_RETAINER_BENEFITS;
  const benefits = rawBenefits.map(normalizeBenefit);

  const accent = content.accentColor ?? branding.accentColor;
  const retainerEnabled = content.retainerEnabled !== false;
  const retainerAmount = content.retainerAmount ?? null;
  const retainerRounding = content.retainerRounding ?? null;
  const constructionLow = content.constructionLow ?? null;
  const constructionHigh = content.constructionHigh ?? null;
  const constructionRounding = content.constructionRounding ?? null;

  // Sum the *already-rounded* retainer and construction values so the total
  // visibly matches the displayed inputs (no separate total rounding setting).
  const roundedRetainer = applyRound(retainerAmount, retainerRounding);
  const roundedConstructionLow = applyRound(constructionLow, constructionRounding);
  const roundedConstructionHigh = applyRound(constructionHigh, constructionRounding);
  const totalLow =
    retainerEnabled && roundedRetainer != null && roundedConstructionLow != null
      ? roundedRetainer + roundedConstructionLow
      : null;
  const totalHigh =
    retainerEnabled && roundedRetainer != null && roundedConstructionHigh != null
      ? roundedRetainer + roundedConstructionHigh
      : null;

  // ─── Resolved text + style for every editable element ─────────────────────

  const sectionLabelText = content.sectionLabel ?? "YOUR INVESTMENT";
  const showSectionLabel = content.showSectionLabel !== false;
  const sectionLabelFont = content.sectionLabelFont ?? SLIDE_FONTS.defaults.label;
  const sectionLabelColor = content.sectionLabelColor ?? accent;

  const headlineText = slide.headline ?? "Your investment";
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? theme.fonts.headline;
  const headlineSize = content.headlineSize ?? 2.7;
  const headlineBold = content.headlineBold !== false;
  const headlineItalic = content.headlineItalic ?? false;
  const headlineUnderline = content.headlineUnderline ?? false;
  const headlineColor = content.headlineColor2 ?? content.headlineColor ?? branding.textColor;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);

  const taglineText = content.tagline ?? "";
  const taglineFont = content.taglineFont ?? SLIDE_FONTS.defaults.body;
  const taglineSize = content.taglineSize ?? 0.80;
  const taglineBold = content.taglineBold ?? false;
  const taglineItalic = content.taglineItalic !== false;
  const taglineUnderline = content.taglineUnderline ?? false;
  const taglineColor = content.taglineColor ?? MUTED_NAVY;
  const taglineShadow = makeOutlineShadow(content.taglineOutline);

  const retainerLabelText = content.retainerLabelText ?? "Design & Feasibility Retainer";
  const retainerLabelFont = content.retainerLabelFont ?? theme.fonts.headline;
  const retainerLabelSize = content.retainerLabelSize ?? 2.00;
  const retainerLabelBold = content.retainerLabelBold !== false;
  const retainerLabelItalic = content.retainerLabelItalic ?? false;
  const retainerLabelUnderline = content.retainerLabelUnderline ?? false;
  const retainerLabelColor = content.retainerLabelColor ?? branding.textColor;
  const retainerLabelShadow = makeOutlineShadow(content.retainerLabelOutline);

  const amountText = fmtAmount(retainerAmount, retainerRounding);
  const amountFont = content.amountFont ?? theme.fonts.numeral;
  const amountSize = content.amountSize ?? 2.50;
  const amountBold = content.amountBold !== false;
  const amountItalic = content.amountItalic ?? false;
  const amountUnderline = content.amountUnderline ?? false;
  const amountColor = content.amountColor ?? branding.textColor;
  const amountShadow = makeOutlineShadow(content.amountOutline);

  const retainerDescText =
    content.retainerDescText ??
    "Design work billed at our published rate of $200.00 per hour. 3rd Party Services (Survey, Engineering, Architect, etc...) included within the design retainer.";
  const retainerDescFont = content.retainerDescFont ?? SLIDE_FONTS.defaults.body;
  const retainerDescSize = content.retainerDescSize ?? 0.90;
  const retainerDescBold = content.retainerDescBold ?? false;
  const retainerDescItalic = content.retainerDescItalic ?? false;
  const retainerDescUnderline = content.retainerDescUnderline ?? false;
  const retainerDescColor = content.retainerDescColor ?? branding.textColor;
  const retainerDescShadow = makeOutlineShadow(content.retainerDescOutline);

  const constructionLabelText =
    content.constructionLabelText ??
    (retainerEnabled ? "Projected Construction Investment" : "Total Project Investment");
  const constructionLabelFont = content.constructionLabelFont ?? theme.fonts.headline;
  const constructionLabelSize = content.constructionLabelSize ?? (retainerEnabled ? 1.60 : 0.95);
  const constructionLabelBold = content.constructionLabelBold !== false;
  const constructionLabelItalic = content.constructionLabelItalic ?? false;
  const constructionLabelUnderline = content.constructionLabelUnderline ?? false;
  const constructionLabelColor = content.constructionLabelColor ?? (retainerEnabled ? branding.textColor : accent);
  const constructionLabelShadow = makeOutlineShadow(content.constructionLabelOutline);

  const constructionAmountText = fmtRange(constructionLow, constructionHigh, constructionRounding);
  const constructionAmountFont = content.constructionAmountFont ?? theme.fonts.numeral;
  const constructionAmountSize = content.constructionAmountSize ?? (retainerEnabled ? 1.60 : 3.2);
  const constructionAmountBold = content.constructionAmountBold !== false;
  const constructionAmountItalic = content.constructionAmountItalic ?? false;
  const constructionAmountUnderline = content.constructionAmountUnderline ?? false;
  const constructionAmountColor = content.constructionAmountColor ?? (retainerEnabled ? branding.textColor : accent);
  const constructionAmountShadow = makeOutlineShadow(content.constructionAmountOutline);

  const totalLabelText = content.totalLabelText ?? "Total Project Investment";
  const totalLabelFont = content.totalLabelFont ?? theme.fonts.headline;
  const totalLabelSize = content.totalLabelSize ?? 1.40;
  const totalLabelBold = content.totalLabelBold !== false;
  const totalLabelItalic = content.totalLabelItalic ?? false;
  const totalLabelUnderline = content.totalLabelUnderline ?? false;
  const totalLabelColor = content.totalLabelColor ?? accent;
  const totalLabelShadow = makeOutlineShadow(content.totalLabelOutline);

  const totalAmountText = fmtRange(totalLow, totalHigh, null);
  const totalAmountFont = content.totalAmountFont ?? theme.fonts.numeral;
  const totalAmountSize = content.totalAmountSize ?? 2.1;
  const totalAmountBold = content.totalAmountBold !== false;
  const totalAmountItalic = content.totalAmountItalic ?? false;
  const totalAmountUnderline = content.totalAmountUnderline ?? false;
  const totalAmountColor = content.totalAmountColor ?? accent;
  const totalAmountShadow = makeOutlineShadow(content.totalAmountOutline);

  const dividerColor = `${branding.textColor}1A`;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasAiBackground ? "transparent" : theme.color.surface }}
    >
      {theme.surface.grid && !hasAiBackground && <BlueprintUnderlay />}
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
        {/* Section label + headline + tagline */}
        <div style={{ flexShrink: 0, marginBottom: "2%" }}>
          {showSectionLabel && sectionLabelText ? (
            <p
              style={{
                fontFamily: sectionLabelFont,
                fontSize: SECTION_LABEL_SIZE,
                fontWeight: 600,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: sectionLabelColor,
                marginBottom: "0.35em",
              }}
            >
              {sectionLabelText}
            </p>
          ) : null}
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${headlineSize}em`,
              fontWeight: headlineBold ? 700 : 400,
              fontStyle: headlineItalic ? "italic" : "normal",
              textDecoration: headlineUnderline ? "underline" : "none",
              color: headlineColor,
              lineHeight: 1.15,
              marginBottom: "0.1em",
              textShadow: headlineShadow,
            }}
          >
            {headlineText}
          </h2>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.25em" marginBottom="0" />
          {taglineText ? (
            <p
              style={{
                fontFamily: taglineFont,
                fontSize: `${taglineSize}em`,
                fontWeight: taglineBold ? 700 : 400,
                fontStyle: taglineItalic ? "italic" : "normal",
                textDecoration: taglineUnderline ? "underline" : "none",
                color: taglineColor,
                marginTop: "0.5em",
                lineHeight: 1.4,
                textShadow: taglineShadow,
              }}
            >
              {taglineText}
            </p>
          ) : null}
        </div>

        {/* Three bands */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 0,
          }}
        >
          {/* ── Band 1: Retainer ─────────────────────────────────── */}
          {retainerEnabled && (
            <div
              style={{
                paddingTop: "1.2%",
                paddingBottom: "1.5%",
                borderBottom: `1px solid ${dividerColor}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.35em" }}>
                <span
                  style={{
                    fontFamily: retainerLabelFont,
                    fontSize: `${retainerLabelSize}em`,
                    fontWeight: retainerLabelBold ? 700 : 400,
                    fontStyle: retainerLabelItalic ? "italic" : "normal",
                    textDecoration: retainerLabelUnderline ? "underline" : "none",
                    color: retainerLabelColor,
                    letterSpacing: "0.01em",
                    textShadow: retainerLabelShadow,
                  }}
                >
                  {retainerLabelText}
                </span>
                <span
                  style={{
                    fontFamily: amountFont,
                    fontSize: `${amountSize}em`,
                    fontWeight: amountBold ? 700 : 400,
                    fontStyle: amountItalic ? "italic" : "normal",
                    textDecoration: amountUnderline ? "underline" : "none",
                    color: amountColor,
                    lineHeight: 1,
                    textShadow: amountShadow,
                  }}
                >
                  {amountText}
                </span>
              </div>

              {retainerDescText ? (
                <p
                  style={{
                    fontFamily: retainerDescFont,
                    fontSize: `${retainerDescSize}em`,
                    fontWeight: retainerDescBold ? 700 : 400,
                    fontStyle: retainerDescItalic ? "italic" : "normal",
                    textDecoration: retainerDescUnderline ? "underline" : "none",
                    color: retainerDescColor,
                    lineHeight: 1.55,
                    marginBottom: "0.6em",
                    maxWidth: "88%",
                    textShadow: retainerDescShadow,
                  }}
                >
                  {retainerDescText}
                </p>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3em 1.8em" }}>
                {benefits.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5em" }}>
                    <GoldCheck color={accent} size="0.85em" />
                    <span
                      style={{
                        fontFamily: b.textFont ?? SLIDE_FONTS.defaults.body,
                        fontSize: `${b.textSize ?? 1.3}em`,
                        fontWeight: b.textBold ? 700 : 400,
                        fontStyle: b.textItalic ? "italic" : "normal",
                        textDecoration: b.textUnderline ? "underline" : "none",
                        color: b.textColor ?? branding.textColor,
                        lineHeight: 1.4,
                        textShadow: makeOutlineShadow(b.textOutline),
                      }}
                    >
                      {b.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Band 2: Construction ─────────────────────────────── */}
          <div
            style={{
              paddingTop: "1.5%",
              paddingBottom: "1.5%",
              borderBottom: retainerEnabled ? `1px solid ${dividerColor}` : undefined,
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
                  fontFamily: constructionLabelFont,
                  fontSize: `${constructionLabelSize}em`,
                  fontWeight: constructionLabelBold ? 700 : 400,
                  fontStyle: constructionLabelItalic ? "italic" : "normal",
                  textDecoration: constructionLabelUnderline ? "underline" : "none",
                  color: constructionLabelColor,
                  letterSpacing: retainerEnabled ? "0.01em" : "0.08em",
                  textTransform: retainerEnabled ? "none" : "uppercase",
                  marginBottom: retainerEnabled ? "0.2em" : "0.3em",
                  textShadow: constructionLabelShadow,
                }}
              >
                {constructionLabelText}
              </div>
            </div>
            <div
              style={{
                fontFamily: constructionAmountFont,
                fontSize: `${constructionAmountSize}em`,
                fontWeight: constructionAmountBold ? 700 : 400,
                fontStyle: constructionAmountItalic ? "italic" : "normal",
                textDecoration: constructionAmountUnderline ? "underline" : "none",
                color: constructionAmountColor,
                lineHeight: 1,
                textShadow: constructionAmountShadow,
              }}
            >
              {constructionAmountText}
            </div>
          </div>

          {/* ── Band 3: Total (only when retainer enabled) ───────── */}
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
                  fontFamily: totalLabelFont,
                  fontSize: `${totalLabelSize}em`,
                  fontWeight: totalLabelBold ? 700 : 400,
                  fontStyle: totalLabelItalic ? "italic" : "normal",
                  textDecoration: totalLabelUnderline ? "underline" : "none",
                  color: totalLabelColor,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textShadow: totalLabelShadow,
                }}
              >
                {totalLabelText}
              </span>
              <span
                style={{
                  fontFamily: totalAmountFont,
                  fontSize: `${totalAmountSize}em`,
                  fontWeight: totalAmountBold ? 700 : 400,
                  fontStyle: totalAmountItalic ? "italic" : "normal",
                  textDecoration: totalAmountUnderline ? "underline" : "none",
                  color: totalAmountColor,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  textShadow: totalAmountShadow,
                }}
              >
                {totalAmountText}
              </span>
            </div>
          )}
        </div>
      </div>

      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? 81}
        yPercent={content.logoY ?? 3}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Shared blueprint decorations (new layouts) ───────────────────────────────

function OiGridUnderlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(rgba(26,35,50,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,35,50,0.04) 1px, transparent 1px)",
        backgroundSize: "34px 34px",
      }}
    />
  );
}

/** Resolve retainer + construction + totals with the slide's rounding settings. */
function useOiMoney(content: OverallInvestmentContent) {
  const retainerEnabled = content.retainerEnabled !== false;
  const roundedRetainer = applyRound(content.retainerAmount ?? null, content.retainerRounding ?? null);
  const roundedLow = applyRound(content.constructionLow ?? null, content.constructionRounding ?? null);
  const roundedHigh = applyRound(content.constructionHigh ?? null, content.constructionRounding ?? null);
  const totalLow = retainerEnabled && roundedRetainer != null && roundedLow != null ? roundedRetainer + roundedLow : roundedLow;
  const totalHigh = retainerEnabled && roundedRetainer != null && roundedHigh != null ? roundedRetainer + roundedHigh : roundedHigh;
  return { retainerEnabled, roundedRetainer, roundedLow, roundedHigh, totalLow, totalHigh };
}

// ─── insurance-policy layout ─────────────────────────────────────────────────
// "The Design Retainer as an Insurance Policy": big statement left, shield +
// umbrella + blueprint illustration center, orange-bullet benefits right —
// blueprint sheet framing.

function InsurancePolicyLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as OverallInvestmentContent;
  const rawBenefits = content.benefits && content.benefits.length > 0 ? content.benefits : DEFAULT_DESIGN_RETAINER_BENEFITS;
  const benefits = rawBenefits.map(normalizeBenefit);
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const { roundedRetainer } = useOiMoney(content);
  const amountText = roundedRetainer != null ? fmtDollars(roundedRetainer) : "—";
  const shieldText = roundedRetainer != null ? `$${Math.round(roundedRetainer / 1000)}k` : "—";
  const statementScale = content.insuranceStatementSize ?? 1;
  const bulletScale = content.insuranceBulletSize ?? 1;
  const graphicScale = content.insuranceGraphicSize ?? 1;

  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? theme.fonts.headline;
  const headlineColor = content.headlineColor2 ?? content.headlineColor ?? ink;

  const bracketStyle = (pos: React.CSSProperties, borders: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: "2.2em",
    height: "2.2em",
    pointerEvents: "none",
    ...pos,
    ...borders,
  });
  const bLine = "2px solid rgba(26,35,50,0.3)";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <OiGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      {!hasBg && (
        <>
          <div aria-hidden style={bracketStyle({ top: "3%", left: "2%" }, { borderTop: bLine, borderLeft: bLine })} />
          <div aria-hidden style={bracketStyle({ top: "3%", right: "2%" }, { borderTop: bLine, borderRight: bLine })} />
          <div aria-hidden style={bracketStyle({ bottom: "4%", left: "2%" }, { borderBottom: bLine, borderLeft: bLine })} />
          <div aria-hidden style={bracketStyle({ bottom: "4%", right: "2%" }, { borderBottom: bLine, borderRight: bLine })} />
          {/* Registration crosshair (bottom-left) + compass rose (bottom-right) */}
          <svg aria-hidden viewBox="0 0 40 40" style={{ position: "absolute", left: "6%", bottom: "9%", width: "2.6em", height: "2.6em", pointerEvents: "none" }} fill="none" stroke="rgba(26,35,50,0.3)" strokeWidth={1.5}>
            <circle cx="20" cy="20" r="9" />
            <path d="M20 4 V14 M20 26 V36 M4 20 H14 M26 20 H36" />
          </svg>
          <svg aria-hidden viewBox="0 0 100 100" style={{ position: "absolute", right: "4%", bottom: "9%", width: "5em", height: "5em", pointerEvents: "none" }} fill="none" stroke="rgba(26,35,50,0.25)" strokeWidth={1.5}>
            <path d="M50 8 L55 45 L92 50 L55 55 L50 92 L45 55 L8 50 L45 45 Z" />
            <path d="M73 27 L57 43 M73 73 L57 57 M27 73 L43 57 M27 27 L43 43" />
          </svg>
        </>
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "2%" }}>
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${content.headlineSize ?? 2.3}em`,
              fontWeight: content.headlineBold !== false ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: headlineColor,
              lineHeight: 1.08,
              margin: 0,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {slide.headline ?? "The Design Retainer as an Insurance Policy"}
          </h2>
          <TitleAccentRule accentColor={accent} marginTop="0.4em" marginBottom="0" />
        </div>

        {/* Body — statement | graphic | bullets */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", gap: "4%" }}>
          {/* Statement — big, fills the left third like the reference */}
          <div style={{ width: "28%", flexShrink: 0 }}>
            <p
              style={{
                fontFamily: theme.fonts.headline,
                fontWeight: 700,
                fontSize: `${1.9 * statementScale}em`,
                color: ink,
                lineHeight: 1.32,
                margin: 0,
              }}
            >
              {content.insuranceStatement ? (
                content.insuranceStatement
              ) : (
                <>
                  The <span style={{ color: accent }}>{amountText}</span> design investment is the exact mechanism that unlocks our{" "}
                  <span style={{ color: accent }}>Zero Change Order Guarantee</span>.
                </>
              )}
            </p>
          </div>

          {/* Shield + umbrella + blueprint illustration — the umbrella dominates */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
            <svg viewBox="0 0 260 310" aria-hidden style={{ width: `${16 * graphicScale}em`, height: "auto", maxHeight: "100%" }}>
              {/* Wide umbrella canopy sweeping over the blueprint */}
              <path
                d="M8 150 Q130 28 252 150 Q221.5 130 191 150 Q160.5 130 130 150 Q99.5 130 69 150 Q38.5 130 8 150 Z"
                fill={`${accent}73`}
                stroke={accent}
                strokeWidth={3}
                strokeLinejoin="round"
              />
              {/* Canopy seams */}
              <path d="M69 150 Q105 62 130 40 M191 150 Q155 62 130 40" stroke={accent} strokeWidth={1.5} opacity={0.4} fill="none" />
              {/* Pole down to the blueprint */}
              <line x1={130} y1={150} x2={130} y2={208} stroke={accent} strokeWidth={3} />
              {/* Shield perched on the canopy apex */}
              <path
                d="M130 14 C147 24 166 29 176 30 L176 64 C176 94 157 114 130 127 C103 114 84 94 84 64 L84 30 C94 29 113 24 130 14 Z"
                fill={accent}
                stroke="#B85510"
                strokeWidth={3}
                strokeLinejoin="round"
              />
              <path
                d="M130 22 C144 30 160 34 168 35 L168 63 C168 88 152 105 130 116 C108 105 92 88 92 63 L92 35 C100 34 116 30 130 22 Z"
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              <text x={130} y={74} textAnchor="middle" fill="#FFFFFF" fontWeight={700} fontSize={27} fontFamily="var(--font-jost), sans-serif">
                {shieldText}
              </text>
              <text x={130} y={96} textAnchor="middle" fill="#FFFFFF" fontWeight={600} fontSize={14} fontFamily="var(--font-jost), sans-serif">
                Retainer
              </text>
              {/* Blueprint scroll — curled edges + detailed floor plan */}
              <rect x={60} y={206} width={10} height={92} rx={4} fill="#23272C" />
              <rect x={190} y={206} width={10} height={92} rx={4} fill="#23272C" />
              <rect x={68} y={210} width={124} height={84} rx={3} fill="#343A43" />
              <g stroke="#FFFFFF" strokeWidth={1.4} opacity={0.95} fill="none">
                <rect x={82} y={222} width={74} height={60} />
                <path d="M114 222 V250 M82 250 H114 M114 264 V282" />
                <path d="M114 250 a9 9 0 0 1 9 9" strokeWidth={1.1} />
                <rect x={138} y={266} width={11} height={11} strokeWidth={1.1} />
                <path d="M164 268 h20 M164 274 h20 M164 280 h20" strokeWidth={1.1} opacity={0.8} />
              </g>
              {/* Dimension ticks around the plan */}
              <path d="M52 212 V292 M48 212 h8 M48 252 h8 M48 292 h8" stroke="rgba(26,35,50,0.4)" strokeWidth={1.3} fill="none" />
              <path d="M82 304 H156 M82 301 v6 M156 301 v6" stroke="rgba(26,35,50,0.4)" strokeWidth={1.3} fill="none" />
            </svg>
          </div>

          {/* Benefit bullets — big orange dots, reference-weight text */}
          <div style={{ width: "29%", flexShrink: 0, display: "flex", flexDirection: "column", gap: "1.7em" }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: "0.9em", alignItems: "flex-start" }}>
                <span aria-hidden style={{ flexShrink: 0, width: "1.05em", height: "1.05em", borderRadius: "50%", background: accent, marginTop: "0.15em" }} />
                <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.95 * bulletScale}em`, fontWeight: 600, color: ink, lineHeight: 1.45 }}>
                  {b.text}
                </span>
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

// ─── retainer-cta layout ─────────────────────────────────────────────────────
// "The Next Step" closing card: deliverable bullets, the retainer amount in a
// framed box with the credited-toward-total note, and the sign-today call to
// action — a white card with an orange top stripe over the slide background.

function RetainerCtaLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as OverallInvestmentContent;
  const rawBenefits = content.benefits && content.benefits.length > 0 ? content.benefits : DEFAULT_DESIGN_RETAINER_BENEFITS;
  const benefits = rawBenefits.map(normalizeBenefit);
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const navy = theme.color.panel;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const { roundedRetainer, totalLow, totalHigh } = useOiMoney(content);
  const z = content.ctaTextSize ?? 1;

  const subtitle = content.ctaSubtitle ?? "Initiate the Design & Feasibility Phase";
  const totalRange = fmtRange(totalLow, totalHigh, null);
  // Empty string explicitly hides the note; undefined composes the default.
  const note =
    content.ctaRetainerNote === ""
      ? ""
      : content.ctaRetainerNote ?? (totalRange !== "—" ? `(Credited as part of your total project investment of ${totalRange})` : "");
  const ctaLine = content.ctaLine ?? "Sign the Initial Contract today to launch the Architectural Design phase.";
  const thanks = content.ctaThanks ?? "Thank you for choosing HHI Builders. We look forward to transforming your home.";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <OiGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "4% 6%" }}>
        <div
          style={{
            width: "84%",
            maxHeight: "100%",
            background: "#FFFFFF",
            borderTop: `0.45em solid ${accent}`,
            boxShadow: "0 18px 48px rgba(26,35,50,0.24)",
            padding: "2.4em 3em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: content.headlineFont2 ?? content.headlineFont ?? theme.fonts.headline,
              fontSize: `${1.5 * z}em`,
              fontWeight: 700,
              color: content.headlineColor2 ?? content.headlineColor ?? navy,
              lineHeight: 1.2,
              margin: 0,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {slide.headline ?? "The Next Step"}
          </h2>
          <p style={{ fontFamily: theme.fonts.headline, fontSize: `${1.05 * z}em`, fontWeight: 700, color: accent, margin: 0, marginTop: "0.3em" }}>
            {subtitle}
          </p>

          {/* Deliverables — 2-column grid with orange square markers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "2.4em", rowGap: "0.85em", marginTop: "1.4em", textAlign: "left" }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: "0.7em", alignItems: "flex-start" }}>
                <span aria-hidden style={{ flexShrink: 0, width: "0.7em", height: "0.7em", background: accent, marginTop: "0.3em" }} />
                <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.85 * z}em`, fontWeight: 600, color: ink, lineHeight: 1.4 }}>
                  {b.text}
                </span>
              </div>
            ))}
          </div>

          {/* Retainer box */}
          <div
            style={{
              marginTop: "1.5em",
              border: `2px solid ${navy}`,
              borderRadius: 8,
              background: "#EEF2F6",
              padding: "0.8em 1.8em",
              maxWidth: "84%",
            }}
          >
            <p style={{ fontFamily: theme.fonts.headline, fontSize: `${1.1 * z}em`, fontWeight: 800, color: navy, margin: 0, lineHeight: 1.3 }}>
              Design Retainer: {roundedRetainer != null ? fmtDollars(roundedRetainer) : "—"}
            </p>
            {note && (
              <p style={{ fontFamily: theme.fonts.body, fontSize: `${0.72 * z}em`, fontStyle: "italic", color: navy, margin: 0, marginTop: "0.25em", lineHeight: 1.4 }}>
                {note}
              </p>
            )}
          </div>

          <p style={{ fontFamily: theme.fonts.body, fontSize: `${0.92 * z}em`, fontWeight: 700, color: ink, margin: 0, marginTop: "1.3em", lineHeight: 1.45 }}>
            {ctaLine}
          </p>
          <p style={{ fontFamily: SLIDE_FONTS.defaults.headline, fontSize: `${0.88 * z}em`, color: ink, margin: 0, marginTop: "0.6em", lineHeight: 1.45 }}>
            {thanks}
          </p>
        </div>
      </div>
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? 50}
        yPercent={content.logoY ?? 91}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

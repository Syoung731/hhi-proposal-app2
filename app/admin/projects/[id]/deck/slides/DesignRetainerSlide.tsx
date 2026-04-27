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

const LINEN = "#F5F0E8";
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

export function DesignRetainerSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as DesignRetainerContent;
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
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 2.0;
  const headlineBold = content.headlineBold !== false;
  const headlineItalic = content.headlineItalic ?? false;
  const headlineUnderline = content.headlineUnderline ?? false;
  const headlineColor = content.headlineColor2 ?? content.headlineColor ?? branding.textColor;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);

  const taglineText = content.tagline ?? "";
  const taglineFont = content.taglineFont ?? SLIDE_FONTS.defaults.body;
  const taglineSize = content.taglineSize ?? 0.75;
  const taglineBold = content.taglineBold ?? false;
  const taglineItalic = content.taglineItalic !== false;
  const taglineUnderline = content.taglineUnderline ?? false;
  const taglineColor = content.taglineColor ?? MUTED_NAVY;
  const taglineShadow = makeOutlineShadow(content.taglineOutline);

  const retainerLabelText = content.retainerLabelText ?? "";
  const retainerLabelFont = content.retainerLabelFont ?? SLIDE_FONTS.defaults.headline;
  const retainerLabelSize = content.retainerLabelSize ?? 2.10;
  const retainerLabelBold = content.retainerLabelBold !== false;
  const retainerLabelItalic = content.retainerLabelItalic ?? false;
  const retainerLabelUnderline = content.retainerLabelUnderline ?? false;
  const retainerLabelColor = content.retainerLabelColor ?? branding.textColor;
  const retainerLabelShadow = makeOutlineShadow(content.retainerLabelOutline);

  const amountText = fmtAmount(retainerAmount, retainerRounding);
  const amountFont = content.amountFont ?? SLIDE_FONTS.defaults.headline;
  const amountSize = content.amountSize ?? 2.50;
  const amountBold = content.amountBold !== false;
  const amountItalic = content.amountItalic ?? false;
  const amountUnderline = content.amountUnderline ?? false;
  const amountColor = content.amountColor ?? branding.textColor;
  const amountShadow = makeOutlineShadow(content.amountOutline);

  const retainerDescText = content.retainerDescText ?? "";
  const retainerDescFont = content.retainerDescFont ?? SLIDE_FONTS.defaults.body;
  const retainerDescSize = content.retainerDescSize ?? 0.55;
  const retainerDescBold = content.retainerDescBold ?? false;
  const retainerDescItalic = content.retainerDescItalic ?? false;
  const retainerDescUnderline = content.retainerDescUnderline ?? false;
  const retainerDescColor = content.retainerDescColor ?? branding.textColor;
  const retainerDescShadow = makeOutlineShadow(content.retainerDescOutline);

  const constructionLabelText =
    content.constructionLabelText ??
    (retainerEnabled ? "Projected Construction Investment" : "Total Project Investment");
  const constructionLabelFont = content.constructionLabelFont ?? SLIDE_FONTS.defaults.headline;
  const constructionLabelSize = content.constructionLabelSize ?? (retainerEnabled ? 0.85 : 0.95);
  const constructionLabelBold = content.constructionLabelBold !== false;
  const constructionLabelItalic = content.constructionLabelItalic ?? false;
  const constructionLabelUnderline = content.constructionLabelUnderline ?? false;
  const constructionLabelColor = content.constructionLabelColor ?? (retainerEnabled ? branding.textColor : accent);
  const constructionLabelShadow = makeOutlineShadow(content.constructionLabelOutline);

  const constructionAmountText = fmtRange(constructionLow, constructionHigh, constructionRounding);
  const constructionAmountFont = content.constructionAmountFont ?? SLIDE_FONTS.defaults.headline;
  const constructionAmountSize = content.constructionAmountSize ?? (retainerEnabled ? 1.35 : 3.2);
  const constructionAmountBold = content.constructionAmountBold !== false;
  const constructionAmountItalic = content.constructionAmountItalic ?? false;
  const constructionAmountUnderline = content.constructionAmountUnderline ?? false;
  const constructionAmountColor = content.constructionAmountColor ?? (retainerEnabled ? branding.textColor : accent);
  const constructionAmountShadow = makeOutlineShadow(content.constructionAmountOutline);

  const totalLabelText = content.totalLabelText ?? "Total Project Investment";
  const totalLabelFont = content.totalLabelFont ?? SLIDE_FONTS.defaults.headline;
  const totalLabelSize = content.totalLabelSize ?? 0.95;
  const totalLabelBold = content.totalLabelBold !== false;
  const totalLabelItalic = content.totalLabelItalic ?? false;
  const totalLabelUnderline = content.totalLabelUnderline ?? false;
  const totalLabelColor = content.totalLabelColor ?? accent;
  const totalLabelShadow = makeOutlineShadow(content.totalLabelOutline);

  const totalAmountText = fmtRange(totalLow, totalHigh, null);
  const totalAmountFont = content.totalAmountFont ?? SLIDE_FONTS.defaults.headline;
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
      style={{ overflow: "hidden", background: hasAiBackground ? "transparent" : LINEN }}
    >
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
                        fontSize: `${b.textSize ?? 0.56}em`,
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

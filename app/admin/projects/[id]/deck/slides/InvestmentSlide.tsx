"use client";

import type {
  ProposalSlide,
  DeckBranding,
  InvestmentContent,
  InvestmentLineItem,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, HEADLINE_SCALE, BODY_SCALE, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

function formatRange(low?: number | null, high?: number | null): string {
  if (!low && !high) return "—";
  const fmt = (n: number) =>
    "$" +
    (n >= 1000
      ? (n / 1000).toFixed(0) + "k"
      : n.toLocaleString());
  if (low && high && low !== high) return `${fmt(low)} – ${fmt(high)}`;
  if (low) return fmt(low);
  if (high) return fmt(high);
  return "—";
}

/** Returns the display-ready low value: uses override when isOverride=true. */
function effectiveLow(item: InvestmentLineItem): number | null {
  return item.isOverride ? (item.overrideLow ?? null) : (item.rangeLow ?? null);
}

/** Returns the display-ready high value: uses override when isOverride=true. */
function effectiveHigh(item: InvestmentLineItem): number | null {
  return item.isOverride ? (item.overrideHigh ?? null) : (item.rangeHigh ?? null);
}

function sumRange(
  items: InvestmentLineItem[],
  which: "low" | "high"
): number {
  return items.reduce((acc, item) => {
    const v = which === "low" ? effectiveLow(item) : effectiveHigh(item);
    return acc + (v ?? 0);
  }, 0);
}

// ─── table-callout layout ────────────────────────────────────────────────────
// Matches the Tierra Schaffer / Oyster Bay "Projected Investment" slides:
// White/off-white bg, serif title + orange underline, bordered table,
// retainer callout box, large bold total line in accent color, footer.
function TableCalloutLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as InvestmentContent;
  const GOLD = "#B8860B";
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const items = content.lineItems ?? [];
  const totalLow = sumRange(items, "low");
  const totalHigh = sumRange(items, "high");
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const tableHeaderBg = content.tableHeaderBgColor ?? "#1B2A4A";
  const lineItemPadding = content.lineItemSizePreset === "compact" ? "0.35em 0.9em" : content.lineItemSizePreset === "spacious" ? "0.65em 0.9em" : "0.5em 0.9em";
  const retainerAccent = content.retainerAccentColor ?? GOLD;

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{
        background: hasAiBackground ? "transparent" : "#FAFAF8",
        padding: SLIDE_PADDING.content,
      }}
    >
      {/* Heading */}
      <div className="flex-shrink-0" style={{ marginBottom: "3%" }}>
        {(content.showSectionLabel ?? true) && slide.subheadline && (
          <p
            className="uppercase tracking-widest"
            style={{
              fontFamily: SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 600,
              letterSpacing: "0.13em",
              color: resolvedAccent,
              marginBottom: "0.35em",
            }}
          >
            {slide.subheadline}
          </p>
        )}
        <h1
          style={{
            fontFamily: headlineFont,
            fontSize: `${(content.headlineSize ?? 2.0) * headlineScale}em`,
            fontWeight: (content.headlineBold !== false) ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : "normal",
            textDecoration: content.headlineUnderline ? "underline" : "none",
            color: content.headlineColor ?? branding.textColor,
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {slide.headline || "Projected Investment"}
        </h1>
        <TitleAccentRule accentColor={resolvedAccent} />
      </div>

      {/* Empty state placeholder */}
      {items.length === 0 && (
        <div
          className="flex-shrink-0"
          style={{
            border: "1px dashed #D1D5DB",
            borderRadius: 4,
            padding: "4% 5%",
            textAlign: "center",
            marginBottom: "3%",
          }}
        >
          <p style={{ fontSize: "0.72em", color: "#9CA3AF", fontStyle: "italic", lineHeight: 1.5 }}>
            Add investment line items in the Investment tab to populate this slide.
          </p>
        </div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div
          className="flex-shrink-0"
          style={{
            border: "1px solid #D1D5DB",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: "3%",
          }}
        >
          {/* Table header */}
          <div
            className="flex"
            style={{
              background: tableHeaderBg,
              padding: "0.55em 0.9em",
            }}
          >
            <span
              className="flex-1"
              style={{
                fontFamily: content.tableHeaderFont ?? bodyFont,
                fontSize: `${(content.tableHeaderSize ?? 0.72) * bodyScale}em`,
                fontWeight: (content.tableHeaderBold !== false) ? 700 : 400,
                fontStyle: content.tableHeaderItalic ? "italic" : "normal",
                textDecoration: content.tableHeaderUnderline ? "underline" : "none",
                color: "#fff",
                letterSpacing: "0.03em",
                textShadow: makeOutlineShadow(content.tableHeaderOutline),
              }}
            >
              Space to Renovate
            </span>
            <span
              style={{
                fontFamily: content.tableHeaderFont ?? bodyFont,
                fontSize: `${(content.tableHeaderSize ?? 0.72) * bodyScale}em`,
                fontWeight: (content.tableHeaderBold !== false) ? 700 : 400,
                fontStyle: content.tableHeaderItalic ? "italic" : "normal",
                textDecoration: content.tableHeaderUnderline ? "underline" : "none",
                color: "#fff",
                letterSpacing: "0.03em",
                minWidth: "30%",
                textAlign: "right",
                textShadow: makeOutlineShadow(content.tableHeaderOutline),
              }}
            >
              Range
            </span>
          </div>

          {/* Table rows */}
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex"
              style={{
                padding: lineItemPadding,
                background: i % 2 === 0 ? "#fff" : "#F9FAFB",
                borderTop: "1px solid #E5E7EB",
              }}
            >
              <span
                className="flex-1"
                style={{ fontFamily: bodyFont, fontSize: `${0.78 * bodyScale}em`, color: content.bodyColor ?? branding.textColor }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontFamily: bodyFont,
                  fontSize: `${0.78 * bodyScale}em`,
                  color: content.bodyColor ?? branding.textColor,
                  minWidth: "30%",
                  textAlign: "right",
                }}
              >
                {formatRange(effectiveLow(item), effectiveHigh(item))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Retainer callout box */}
      {(content.showRetainerSection ?? true) && content.retainerLabel && content.retainerAmount != null && (
        <div
          className="flex-shrink-0"
          style={{
            border: `1px solid ${retainerAccent}`,
            borderRadius: 2,
            padding: "0.6em 0.9em",
            marginBottom: "2.5%",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4em", flexWrap: "wrap" }}>
            <span style={{
              fontFamily: content.retainerLabelFont ?? bodyFont,
              fontSize: `${(content.retainerLabelSize ?? 0.75) * bodyScale}em`,
              fontWeight: (content.retainerLabelBold !== false) ? 700 : 400,
              fontStyle: content.retainerLabelItalic ? "italic" : "normal",
              textDecoration: content.retainerLabelUnderline ? "underline" : "none",
              color: content.retainerLabelColor ?? branding.textColor,
              textShadow: makeOutlineShadow(content.retainerLabelOutline),
            }}>
              {content.retainerLabel}:
            </span>
            <span style={{
              fontFamily: content.retainerAmountFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${(content.retainerAmountSize ?? 2.5) * bodyScale * 0.3}em`,
              fontWeight: (content.retainerAmountBold !== false) ? 700 : 400,
              fontStyle: content.retainerAmountItalic ? "italic" : "normal",
              textDecoration: content.retainerAmountUnderline ? "underline" : "none",
              color: content.retainerAmountColor ?? branding.textColor,
              textShadow: makeOutlineShadow(content.retainerAmountOutline),
            }}>
              {formatRange(content.retainerAmount, null).replace("–", "")}
            </span>
          </div>
          {(content.retainerDescription || content.disclaimer) && (
            <p style={{
              fontFamily: content.retainerDescFont ?? bodyFont,
              fontSize: `${(content.retainerDescSize ?? 0.62) * bodyScale}em`,
              fontWeight: content.retainerDescBold ? 700 : 400,
              fontStyle: content.retainerDescItalic ? "italic" : "normal",
              textDecoration: content.retainerDescUnderline ? "underline" : "none",
              color: content.retainerDescColor ?? "#6B7280",
              marginTop: "0.3em",
              textShadow: makeOutlineShadow(content.retainerDescOutline),
            }}>
              {content.retainerDescription || content.disclaimer}
            </p>
          )}
        </div>
      )}

      {/* Total line */}
      {items.length > 0 && (
        <div className="flex-shrink-0" style={{ marginBottom: "1.5%" }}>
          <p
            style={{ fontFamily: headlineFont, fontSize: `${1.35 * headlineScale}em`, fontWeight: 700, color: content.headlineColor ?? branding.textColor }}
          >
            Total Cost of Project Execution Range:{" "}
            <span style={{ color: resolvedAccent }}>
              {formatRange(totalLow, totalHigh)}
            </span>
          </p>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div
        className="flex-shrink-0 flex items-center justify-between"
        style={{
          borderTop: `1px solid #E5E7EB`,
          paddingTop: "1.5%",
        }}
      >
        <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>
          {content.address ?? branding.address ?? ""}
        </span>
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

export function InvestmentSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey) {
    case "table-callout":
    default:
      return <TableCalloutLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

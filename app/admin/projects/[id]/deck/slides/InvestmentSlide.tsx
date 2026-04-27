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

// Phase 8C.2: sumRange() removed — only consumer was the slide-bottom total
// line that's now handled on the next slide (Your Investment, Band 3).

// ─── table-callout layout ────────────────────────────────────────────────────
// Matches the Tierra Schaffer / Oyster Bay "Projected Investment" slides:
// White/off-white bg, serif title + orange underline, bordered table.
// Phase 8C T2 removed the mid-slide retainer callout. Phase 8C.2 removed
// the bottom total line (the per-space total label was misleading; the
// real project total now renders on the next slide).
function TableCalloutLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as InvestmentContent;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const items = content.lineItems ?? [];
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = content.bodyTextScale ?? BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const tableHeaderBg = content.tableHeaderBgColor ?? "#1B2A4A";
  const lineItemPaddingY = content.lineItemPaddingY ??
    (content.lineItemSizePreset === "compact" ? 0.32 : content.lineItemSizePreset === "spacious" ? 0.65 : 0.42);
  const lineItemPadding = `${lineItemPaddingY}em 0.9em`;
  const includesFont = content.includesTextFont ?? bodyFont;
  const includesScale = content.includesTextScale ?? 0.6;
  const includesColor = content.includesTextColor ?? "#6B7280";

  const hasBg = hasAiBackground || slide.backgroundId != null;

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{
        background: hasBg ? "transparent" : "#FAFAF8",
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
          {slide.headline || "Investment by Space"}
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
                fontSize: `${content.tableHeaderSize ?? 0.72}em`,
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
                fontSize: `${content.tableHeaderSize ?? 0.72}em`,
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

          {/* Table rows — skip rows with no range at all so empty Alternates /
              Allowances buckets don't render as "—". Phase 8A.1: rows are
              typically grouped (one per display-group) and may carry an
              `includesText` descriptor shown beneath the label. */}
          {items
            .filter((item) => {
              const low = effectiveLow(item);
              const high = effectiveHigh(item);
              return (low ?? 0) > 0 || (high ?? 0) > 0;
            })
            .map((item, i) => (
              <div
                key={item.id}
                className="flex items-start"
                style={{
                  padding: lineItemPadding,
                  // Phase 8C: warmer linen stripe (was #F9FAFB) reads visibly at
                  // presentation scale and matches the NotebookLM palette.
                  background: i % 2 === 0 ? "#fff" : "#F3F0EA",
                  borderTop: "1px solid #E5E7EB",
                }}
              >
                <span
                  className="flex-1 flex flex-col"
                  style={{ fontFamily: bodyFont, color: content.bodyColor ?? "#4A5568" }}
                >
                  <span style={{ fontSize: `${0.78 * bodyScale}em` }}>{item.label}</span>
                  {item.includesText && (
                    <span
                      style={{
                        fontFamily: includesFont,
                        fontSize: `${includesScale * bodyScale}em`,
                        color: includesColor,
                        marginTop: "0.15em",
                        lineHeight: 1.3,
                      }}
                    >
                      {item.includesText}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontFamily: bodyFont,
                    fontSize: `${0.78 * bodyScale}em`,
                    color: content.bodyColor ?? "#4A5568",
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

      {/* Retainer callout intentionally omitted on the Investment slide.
          Phase 8C: the retainer story lives on Slide 10 ("Your Investment"),
          where Band 1 renders the retainer amount, hourly-rate sentence, and
          bullets. Duplicating that here adds noise. The retainerAmount /
          retainerLabel fields on InvestmentContent remain — still written by
          syncRetainerFromProject — for legacy decks and for the Investment
          layout's future needs. Just not rendered on this layout. */}

      {/* Phase 8C.2: total line removed. The total now lives on the next
          slide ("Your Investment", Band 3) which sums retainer + construction
          and labels it correctly as "TOTAL PROJECT INVESTMENT". The label
          here ("Total Cost of Project Execution Range") was misleading — it
          summed the per-space rows, not the actual project total. */}

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

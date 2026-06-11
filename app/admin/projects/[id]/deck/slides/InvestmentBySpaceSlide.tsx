"use client";

import type {
  ProposalSlide,
  DeckBranding,
  InvestmentBySpaceContent,
  InvestmentLineItem,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, HEADLINE_SCALE, BODY_SCALE, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import { formatRetainerAmount } from "@/app/lib/retainer";

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
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as InvestmentBySpaceContent;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const items = content.lineItems ?? [];
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = content.bodyTextScale ?? BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? theme.fonts.headline;
  const bodyFont = content.bodyFont ?? theme.fonts.body;
  const tableHeaderBg = content.tableHeaderBgColor ?? theme.color.panel;
  const lineItemPaddingY = content.lineItemPaddingY ??
    (content.lineItemSizePreset === "compact" ? 0.32 : content.lineItemSizePreset === "spacious" ? 0.65 : 0.42);
  const lineItemPadding = `${lineItemPaddingY}em 0.9em`;
  const includesFont = content.includesTextFont ?? bodyFont;
  const includesScale = content.includesTextScale ?? 0.6;
  const includesColor = content.includesTextColor ?? theme.color.muted;

  const hasBg = hasAiBackground || slide.backgroundId != null;

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{
        background: hasBg ? "transparent" : theme.color.surface,
        padding: SLIDE_PADDING.content,
      }}
    >
      {/* Heading */}
      <div className="flex-shrink-0" style={{ marginBottom: "3%" }}>
        {(content.showSectionLabel ?? true) && slide.subheadline && (
          <p
            className="uppercase tracking-widest"
            style={{
              fontFamily: theme.fonts.label,
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
            color: content.headlineColor ?? theme.color.ink,
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
            border: `1px dashed ${theme.color.line}`,
            borderRadius: 4,
            padding: "4% 5%",
            textAlign: "center",
            marginBottom: "3%",
          }}
        >
          <p style={{ fontSize: "0.72em", color: theme.color.muted, fontStyle: "italic", lineHeight: 1.5 }}>
            Add investment line items in the Investment tab to populate this slide.
          </p>
        </div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div
          className="flex-shrink-0"
          style={{
            border: `1px solid ${theme.color.line}`,
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
                color: theme.color.panelInk,
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
                color: theme.color.panelInk,
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
                  borderTop: `1px solid ${theme.color.line}`,
                }}
              >
                <span
                  className="flex-1 flex flex-col"
                  style={{ fontFamily: bodyFont, color: content.bodyColor ?? theme.color.muted }}
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
                    color: content.bodyColor ?? theme.color.muted,
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
          retainerLabel fields on InvestmentBySpaceContent remain — still written by
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
          borderTop: `1px solid ${theme.color.line}`,
          paddingTop: "1.5%",
        }}
      >
        <span style={{ fontSize: "0.6em", color: theme.color.muted }}>
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

// ─── Shared helpers for the visual layouts ───────────────────────────────────

/** Faint graph-paper underlay (Blueprint theme only). */
function IbsGridUnderlay({ show }: { show: boolean }) {
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

/** Header (eyebrow + headline + accent rule) honoring the existing inspector controls. */
function IbsHeader({
  slide,
  content,
  accent,
}: {
  slide: ProposalSlide;
  content: InvestmentBySpaceContent;
  accent: string;
}) {
  const theme = useDeckTheme();
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? theme.fonts.headline;
  return (
    <div className="flex-shrink-0" style={{ marginBottom: "2.5%" }}>
      {(content.showSectionLabel ?? true) && slide.subheadline && (
        <p
          className="uppercase tracking-widest"
          style={{
            fontFamily: theme.fonts.label,
            fontSize: SECTION_LABEL_SIZE,
            fontWeight: 600,
            letterSpacing: "0.13em",
            color: accent,
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
          fontWeight: content.headlineBold !== false ? 700 : 400,
          fontStyle: content.headlineItalic ? "italic" : "normal",
          textDecoration: content.headlineUnderline ? "underline" : "none",
          color: content.headlineColor ?? theme.color.ink,
          textShadow: makeOutlineShadow(content.headlineOutline),
          margin: 0,
        }}
      >
        {slide.headline || "Investment by Space"}
      </h1>
      <TitleAccentRule accentColor={accent} />
    </div>
  );
}

function IbsLogo({ content, branding }: { content: InvestmentBySpaceContent; branding: DeckBranding }) {
  return (
    <LogoOverlay
      show={content.showLogo ?? false}
      variant={content.logoVariant ?? "light"}
      xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
      yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
      scale={content.logoSize ?? 1.0}
      branding={branding}
    />
  );
}

function IbsEmptyState() {
  const theme = useDeckTheme();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px dashed ${theme.color.line}`,
        borderRadius: 4,
      }}
    >
      <p style={{ fontSize: "0.72em", color: theme.color.muted, fontStyle: "italic" }}>
        Add investment line items in the Investment tab to populate this slide.
      </p>
    </div>
  );
}

/** Line items with a usable range (drops empty Alternates/Allowances rows). */
function visibleItems(content: InvestmentBySpaceContent): InvestmentLineItem[] {
  return (content.lineItems ?? []).filter((item) => {
    const low = effectiveLow(item);
    const high = effectiveHigh(item);
    return (low ?? 0) > 0 || (high ?? 0) > 0;
  });
}

function isCopeItem(item: InvestmentLineItem): boolean {
  return item.isCope === true || /\bcope\b|cost of project execution/i.test(item.label ?? "");
}

function fmtFull(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

function fmtFullRange(low: number | null, high: number | null): string {
  if (low && high && low !== high) return `${fmtFull(low)} – ${fmtFull(high)}`;
  const v = low ?? high;
  return v ? fmtFull(v) : "—";
}

const CONSTRUCTION_TOTAL_DEFAULT_LABEL = "Projected Construction Investment";

/** Sum of every DISPLAYED line item (rooms + COPE). Never includes the
 *  retainer — the true Total Project Investment lives on the next slide. */
function constructionSubtotal(items: InvestmentLineItem[]): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (const it of items) {
    low += effectiveLow(it) ?? effectiveHigh(it) ?? 0;
    high += effectiveHigh(it) ?? effectiveLow(it) ?? 0;
  }
  return { low, high };
}

// ─── range-bars layout ───────────────────────────────────────────────────────
// NotebookLM "Financial Clarity": chunky navy bars (solid to the low end, a
// lighter-navy extension to the high end) over continuous faint gridlines,
// big bold range text, optional bottom note band + circular guarantee badge.
// Rooms sort largest-first with COPE last (the reference reading order).
// No totals — those live on the next slide.

/** Mix a hex color toward white by `amt` (0–1). */
function lightenHex(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const f = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

const RANGE_BARS_DEFAULT_NOTE =
  "COPE covers permits, inspections, waste handling, site protection, and on-site supervision.";

function RangeBarsLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as InvestmentBySpaceContent;
  const accent = content.accentColor ?? branding.accentColor;
  const navy = theme.color.panel;
  const barBase = content.barColor ?? navy;
  const barTail = lightenHex(barBase, 0.3);
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const scale = content.bodyTextScale ?? BODY_SCALE[content.bodySizeScale ?? "medium"];

  // Reference reading order: rooms largest-first, COPE last.
  const all = visibleItems(content);
  const items = [
    ...all
      .filter((it) => !isCopeItem(it))
      .sort((a, b) => (effectiveHigh(b) ?? effectiveLow(b) ?? 0) - (effectiveHigh(a) ?? effectiveLow(a) ?? 0)),
    ...all.filter(isCopeItem),
  ];
  const maxHigh = Math.max(...items.map((it) => effectiveHigh(it) ?? effectiveLow(it) ?? 0), 1);
  const showBadge = content.showGuaranteeBadge ?? true;
  const badgeText = content.guaranteeBadgeText ?? "Includes Zero Mark-up on Materials Guarantee";
  // Empty string explicitly hides the note; undefined falls back to the default.
  const note = content.footnoteText === "" ? "" : (content.footnoteText ?? RANGE_BARS_DEFAULT_NOTE);
  const labelScale = content.barLabelSize ?? 1;
  const valueScale = content.barValueSize ?? 1;
  const noteScale = content.barNoteSize ?? 1;
  const badgeScale = content.badgeSize ?? 1;
  const showTotal = content.showConstructionTotal ?? true;
  const totalLabel = content.constructionTotalLabel ?? CONSTRUCTION_TOTAL_DEFAULT_LABEL;
  const subtotal = constructionSubtotal(items);
  const subtotalLowPct = subtotal.high > 0 ? (subtotal.low / subtotal.high) * 100 : 100;

  const LABEL_W = 23; // % — label column
  const GAP = 2.5; // % — gap between label and bar track

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <IbsGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <IbsHeader slide={slide} content={content} accent={accent} />

        {items.length === 0 ? (
          <IbsEmptyState />
        ) : (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "1em",
                padding: "2% 0",
              }}
            >
              {/* Continuous vertical gridlines across the bar track */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${LABEL_W + GAP}%`,
                  right: 0,
                  backgroundImage: `linear-gradient(90deg, rgba(26,35,50,0.13) 1.5px, transparent 1.5px)`,
                  backgroundSize: "25% 100%",
                  borderRight: "1.5px solid rgba(26,35,50,0.13)",
                  pointerEvents: "none",
                }}
              />

              {items.map((it) => {
                const low = effectiveLow(it) ?? effectiveHigh(it) ?? 0;
                const high = effectiveHigh(it) ?? low;
                const barPct = Math.max((high / maxHigh) * 100, 4);
                const lowPct = high > 0 ? (low / high) * 100 : 100;
                const textInside = barPct > 42;
                const rangeText = fmtFullRange(low, high);
                return (
                  <div
                    key={it.id}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: `${GAP}%`,
                      flex: "1 1 0",
                      maxHeight: "5.6em",
                      minHeight: "3.2em",
                    }}
                  >
                    <span
                      style={{
                        width: `${LABEL_W}%`,
                        flexShrink: 0,
                        textAlign: "right",
                        fontFamily: theme.fonts.body,
                        fontSize: `${0.92 * scale * labelScale}em`,
                        fontWeight: 500,
                        color: theme.color.muted,
                        lineHeight: 1.25,
                      }}
                    >
                      {it.label}
                    </span>
                    <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
                      <div
                        style={{
                          width: `${barPct}%`,
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          background: `linear-gradient(to right, ${barBase} ${lowPct}%, ${barTail} ${lowPct}%)`,
                        }}
                      >
                        {textInside && (
                          <span
                            style={{
                              fontFamily: theme.fonts.body,
                              fontWeight: 700,
                              fontSize: `${0.95 * scale * valueScale}em`,
                              color: "#FFFFFF",
                              paddingLeft: "1.1em",
                              whiteSpace: "nowrap",
                              letterSpacing: "0.01em",
                            }}
                          >
                            {rangeText}
                          </span>
                        )}
                      </div>
                      {!textInside && (
                        <span
                          style={{
                            marginLeft: "0.9em",
                            fontFamily: theme.fonts.body,
                            fontWeight: 700,
                            fontSize: `${0.95 * scale * valueScale}em`,
                            color: barBase,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rangeText}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Construction-subtotal anchor — full-width accent bar */}
              {showTotal && (
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: `${GAP}%`,
                    flex: "1 1 0",
                    maxHeight: "5.6em",
                    minHeight: "3.2em",
                    marginTop: "0.5em",
                  }}
                >
                  <span
                    style={{
                      width: `${LABEL_W}%`,
                      flexShrink: 0,
                      textAlign: "right",
                      fontFamily: theme.fonts.body,
                      fontSize: `${0.9 * scale * labelScale}em`,
                      fontWeight: 800,
                      color: accent,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      lineHeight: 1.2,
                    }}
                  >
                    {totalLabel}
                  </span>
                  <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        background: `linear-gradient(to right, ${accent} ${subtotalLowPct}%, ${lightenHex(accent, 0.3)} ${subtotalLowPct}%)`,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: theme.fonts.body,
                          fontWeight: 700,
                          fontSize: `${1.05 * scale * valueScale}em`,
                          color: "#FFFFFF",
                          paddingLeft: "1.1em",
                          whiteSpace: "nowrap",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {fmtFullRange(subtotal.low, subtotal.high)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom note band — hairline rules above and below */}
            {note && (
              <div
                style={{
                  flexShrink: 0,
                  borderTop: "1.5px solid rgba(26,35,50,0.18)",
                  borderBottom: "1.5px solid rgba(26,35,50,0.18)",
                  padding: "1.1% 0",
                  marginTop: "1%",
                }}
              >
                <p
                  style={{
                    textAlign: "center",
                    fontFamily: theme.fonts.body,
                    fontSize: `${0.78 * scale * noteScale}em`,
                    color: theme.color.muted,
                    margin: 0,
                  }}
                >
                  {note}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {showBadge && items.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: "3.5%",
            bottom: note ? "12%" : "8%",
            zIndex: 2,
            width: `${10 * badgeScale}em`,
            height: `${10 * badgeScale}em`,
            borderRadius: "50%",
            background: accent,
            border: `${0.28 * badgeScale}em solid #FFFFFF`,
            boxShadow: `0 0 0 ${0.3 * badgeScale}em ${navy}, 0 12px 30px rgba(26,35,50,0.28)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: `${1.2 * badgeScale}em`,
          }}
        >
          <span style={{ fontFamily: theme.fonts.label, fontWeight: 700, fontSize: `${0.72 * badgeScale}em`, color: "#FFFFFF", lineHeight: 1.35 }}>
            {badgeText}
          </span>
        </div>
      )}
      <IbsLogo content={content} branding={branding} />
    </div>
  );
}

// ─── stacked-blocks layout ───────────────────────────────────────────────────
// Isometric tower: one block per space (largest at the base, ascending upward),
// COPE as the orange cap. Soft sqrt scaling keeps small rooms readable. The
// retainer "foundation" and brace totals from the reference live on the next
// slide, not here.

function StackedBlocksLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as InvestmentBySpaceContent;
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const scale = content.bodyTextScale ?? BODY_SCALE[content.bodySizeScale ?? "medium"];
  const items = visibleItems(content);
  const cope = items.filter(isCopeItem);
  const rooms = items
    .filter((it) => !isCopeItem(it))
    .slice()
    .sort((a, b) => (effectiveHigh(a) ?? effectiveLow(a) ?? 0) - (effectiveHigh(b) ?? effectiveLow(b) ?? 0));
  const stack = [...cope, ...rooms]; // top → bottom: COPE cap, then ascending sizes
  const maxHigh = Math.max(...stack.map((it) => effectiveHigh(it) ?? effectiveLow(it) ?? 0), 1);
  const showTotal = content.showConstructionTotal ?? true;
  const subtotal = constructionSubtotal(items);

  // Retainer foundation — shown when enabled on the project and not hidden.
  const retainerOn = (content.showRetainer ?? true) && content.retainerEnabled === true && (content.retainerAmount ?? 0) > 0;
  const retainerNum = retainerOn ? (content.retainerAmount ?? 0) : 0;
  const rate = content.designHourlyRate;
  const retainerCaption =
    content.retainerCaption ??
    `(Includes architectural design, engineering, ARB management, and material specs.${rate ? ` Billed at $${rate}/hr.` : ""})`;

  // Anchor: construction subtotal + retainer when the foundation is shown.
  const totalLabel = content.constructionTotalLabel ?? (retainerOn ? "Total Projected Investment" : CONSTRUCTION_TOTAL_DEFAULT_LABEL);
  const anchorLow = subtotal.low + retainerNum;
  const anchorHigh = subtotal.high + retainerNum;

  const blockScale = content.blockTextSize ?? 1;
  const towerW = content.towerWidth ?? 1;
  const anchorScale = content.anchorTextSize ?? 1;
  const retScale = content.retainerTextSize ?? 1;
  const braceX = content.braceOffsetX ?? 0;
  const braceY = content.braceOffsetY ?? 0;

  // Flat, reference-style proportions: tallest block ≈ 2.2× the shortest, with
  // a smaller base unit when the project has many rooms.
  const unit = stack.length > 6 ? 1.6 : 2.1;
  const blockHeight = (it: InvestmentLineItem) =>
    unit + unit * 1.2 * ((effectiveHigh(it) ?? effectiveLow(it) ?? 0) / maxHigh);

  const EDGE = "1.05em"; // isometric depth (top + side faces)

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <IbsGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <IbsHeader slide={slide} content={content} accent={accent} />

        {stack.length === 0 ? (
          <IbsEmptyState />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: "1.6em", maxWidth: "94%" }}>
              {/* The tower */}
              <div style={{ width: `${(showTotal ? 32 : 36) * towerW}em`, maxWidth: "60vw", display: "flex", flexDirection: "column", paddingTop: EDGE, paddingRight: EDGE }}>
                {stack.map((it, i) => {
                  const isCope = isCopeItem(it);
                  const face = isCope ? accent : "#E8E6E1";
                  const side = isCope ? "#C25C0B" : "#C6C3BC";
                  const topF = isCope ? "#F69A52" : "#F4F2EE";
                  return (
                    <div
                      key={it.id}
                      style={{
                        position: "relative",
                        height: `${blockHeight(it)}em`,
                        marginBottom: i === stack.length - 1 ? 0 : 2,
                        background: face,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 1em",
                      }}
                    >
                      {/* Masonry face lines (gray blocks only) */}
                      {!isCope && (
                        <>
                          <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: "25%", width: 1, background: "rgba(26,35,50,0.1)" }} />
                          <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: "75%", width: 1, background: "rgba(26,35,50,0.1)" }} />
                        </>
                      )}
                      {/* Top face — topmost block only */}
                      {i === 0 && (
                        <div aria-hidden style={{ position: "absolute", top: `-${EDGE}`, left: 0, width: "100%", height: EDGE, background: topF, transform: "skewX(-45deg)", transformOrigin: "bottom left" }} />
                      )}
                      {/* Right side face */}
                      <div aria-hidden style={{ position: "absolute", top: 0, right: `-${EDGE}`, width: EDGE, height: i === stack.length - 1 ? "100%" : "calc(100% + 2px)", background: side, transform: "skewY(-45deg)", transformOrigin: "top left" }} />
                      <span
                        style={{
                          position: "relative",
                          fontFamily: theme.fonts.body,
                          fontWeight: isCope ? 700 : 600,
                          fontSize: `${0.78 * scale * blockScale}em`,
                          color: isCope ? "#FFFFFF" : ink,
                          textAlign: "center",
                          lineHeight: 1.25,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.label}: {formatRange(effectiveLow(it), effectiveHigh(it))}
                      </span>
                    </div>
                  );
                })}

                {/* Retainer foundation — wider dark plinth under the tower */}
                {retainerOn && (
                  <div
                    style={{
                      position: "relative",
                      width: "112%",
                      marginLeft: "-6%",
                      marginTop: 2,
                      background: "#3A3F45",
                      padding: "0.6em 1em",
                      textAlign: "center",
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 0,
                        right: `-${EDGE}`,
                        width: EDGE,
                        height: "100%",
                        background: "#23272C",
                        transform: "skewY(-45deg)",
                        transformOrigin: "top left",
                      }}
                    />
                    <p
                      style={{
                        position: "relative",
                        fontFamily: theme.fonts.body,
                        fontWeight: 700,
                        fontSize: `${0.74 * scale * retScale}em`,
                        color: "#FFFFFF",
                        lineHeight: 1.3,
                        margin: 0,
                      }}
                    >
                      Design &amp; Feasibility Retainer: {formatRetainerAmount(retainerNum)}
                    </p>
                    <p
                      style={{
                        position: "relative",
                        fontFamily: theme.fonts.body,
                        fontSize: `${0.56 * scale * retScale}em`,
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.35,
                        margin: 0,
                        marginTop: "0.15em",
                      }}
                    >
                      {retainerCaption}
                    </p>
                  </div>
                )}
              </div>

              {/* Curly brace + construction subtotal — nudgeable as one unit */}
              {showTotal && (
                <div style={{ display: "flex", alignItems: "stretch", gap: "1.4em", marginTop: EDGE, transform: `translate(${braceX}em, ${braceY}em)` }}>
                  <svg
                    viewBox="0 0 100 1000"
                    preserveAspectRatio="none"
                    aria-hidden
                    style={{ width: "2.1em", height: "auto", alignSelf: "stretch" }}
                  >
                    <path
                      d="M 20 0 C 60 0, 60 30, 60 60 L 60 440 C 60 480, 70 490, 95 500 C 70 510, 60 520, 60 560 L 60 940 C 60 970, 60 1000, 20 1000"
                      fill="none"
                      stroke={theme.color.muted}
                      strokeWidth={7}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: "16em" }}>
                    <p style={{ fontFamily: theme.fonts.body, fontWeight: 600, fontSize: `${0.92 * scale * anchorScale}em`, color: theme.color.muted, lineHeight: 1.35, margin: 0 }}>
                      {totalLabel}:
                    </p>
                    <p style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: `${1.25 * scale * anchorScale}em`, color: ink, lineHeight: 1.25, marginTop: "0.2em", marginBottom: 0 }}>
                      {fmtFullRange(anchorLow, anchorHigh)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <IbsLogo content={content} branding={branding} />
    </div>
  );
}

// ─── blueprint-breakdown layout ──────────────────────────────────────────────
// One segmented bar (proportional by space, greyscale ramp) with dimension
// ticks, plus a "Build Zones" list table — blueprint corner brackets + grid.
// Labels live in the list, so sliver segments stay honest and readable.

const BP_SHADES = ["#2B3442", "#48525F", "#67707D", "#88919D", "#A9B0BA", "#CBD0D7"];

/** Blueprint dimension line with arrowheads + end ticks. Fills a relative row. */
function DimArrow({ left = 0, right = 0 }: { left?: number; right?: number }) {
  const col = "rgba(26,35,50,0.45)";
  return (
    <div aria-hidden style={{ position: "absolute", left: `${left}%`, right: `${right}%`, top: 0, bottom: 0 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1.5, background: col, transform: "translateY(-50%)" }} />
      <div style={{ position: "absolute", left: 0, top: "10%", bottom: "10%", width: 1.5, background: col }} />
      <div style={{ position: "absolute", right: 0, top: "10%", bottom: "10%", width: 1.5, background: col }} />
      <span style={{ position: "absolute", left: 1, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "0.3em solid transparent", borderBottom: "0.3em solid transparent", borderLeft: `0.55em solid ${col}`, rotate: "180deg" }} />
      <span style={{ position: "absolute", right: 1, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "0.3em solid transparent", borderBottom: "0.3em solid transparent", borderLeft: `0.55em solid ${col}` }} />
    </div>
  );
}

/** Faint blueprint compass-rose decoration. */
function CompassRose({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      style={{ position: "absolute", width: "5.5em", height: "5.5em", pointerEvents: "none", ...style }}
      fill="none"
      stroke="rgba(26,35,50,0.22)"
      strokeWidth={1.5}
    >
      <circle cx="50" cy="50" r="30" />
      <circle cx="50" cy="50" r="3.5" />
      <path d="M50 8 L55 45 L92 50 L55 55 L50 92 L45 55 L8 50 L45 45 Z" />
      <path d="M73 27 L57 43 M73 73 L57 57 M27 73 L43 57 M27 27 L43 43" />
    </svg>
  );
}

function BlueprintBreakdownLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as InvestmentBySpaceContent;
  const accent = content.accentColor ?? branding.accentColor;
  const navy = theme.color.panel;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const scale = content.bodyTextScale ?? BODY_SCALE[content.bodySizeScale ?? "medium"];
  const items = visibleItems(content)
    .slice()
    .sort((a, b) => (effectiveHigh(b) ?? effectiveLow(b) ?? 0) - (effectiveHigh(a) ?? effectiveLow(a) ?? 0));
  const totalHigh = Math.max(
    items.reduce((sum, it) => sum + (effectiveHigh(it) ?? effectiveLow(it) ?? 0), 0),
    1,
  );
  const showTotal = content.showConstructionTotal ?? true;
  const subtotal = constructionSubtotal(items);
  const zoneScale = content.zoneTextSize ?? 1;
  const anchorScale = content.anchorTextSize ?? 1;
  const retScale = content.retainerTextSize ?? 1;

  // Retainer — the orange "Immediate Step" segment at the front of the bar.
  const retainerOn = (content.showRetainer ?? true) && content.retainerEnabled === true && (content.retainerAmount ?? 0) > 0;
  const retainerNum = retainerOn ? (content.retainerAmount ?? 0) : 0;
  const totalLabel = content.constructionTotalLabel ?? (retainerOn ? "Total Projected Investment" : CONSTRUCTION_TOTAL_DEFAULT_LABEL);

  // Bar split: retainer segment proportional to the grand total, but never so
  // thin its callout stem looks detached; construction shares the remainder.
  const grand = retainerNum + totalHigh;
  const retPct = retainerOn ? Math.max((retainerNum / grand) * 100, 12) : 0;
  const span = 100 - retPct;

  // Cumulative boundaries (in % of the bar) for the construction ticks.
  const boundaries: number[] = [retPct];
  {
    let acc = 0;
    for (const it of items) {
      acc += effectiveHigh(it) ?? effectiveLow(it) ?? 0;
      boundaries.push(retPct + (acc / totalHigh) * span);
    }
  }

  const bracket = (pos: React.CSSProperties, borders: React.CSSProperties) => (
    <div aria-hidden style={{ position: "absolute", width: "2.2em", height: "2.2em", pointerEvents: "none", ...pos, ...borders }} />
  );
  const bLine = `2px solid rgba(26,35,50,0.3)`;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <IbsGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      {/* Blueprint corner brackets + compass roses */}
      {!hasBg && (
        <>
          {bracket({ top: "3%", left: "2%" }, { borderTop: bLine, borderLeft: bLine })}
          {bracket({ top: "3%", right: "2%" }, { borderTop: bLine, borderRight: bLine })}
          {bracket({ bottom: "4%", left: "2%" }, { borderBottom: bLine, borderLeft: bLine })}
          {bracket({ bottom: "4%", right: "2%" }, { borderBottom: bLine, borderRight: bLine })}
          <CompassRose style={{ top: "8%", right: "4%" }} />
          <CompassRose style={{ bottom: "12%", left: "3.5%" }} />
        </>
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <IbsHeader slide={slide} content={content} accent={accent} />

        {items.length === 0 ? (
          <IbsEmptyState />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Overall dimension arrow — full bar (retainer + construction) */}
            <div style={{ position: "relative", height: "1.1em", marginBottom: "0.45em", flexShrink: 0 }}>
              <DimArrow />
            </div>

            {/* Segmented bar — orange retainer lead segment + greyscale construction */}
            <div style={{ display: "flex", gap: 2, height: "3.1em", flexShrink: 0 }}>
              {retainerOn && <div style={{ width: `${retPct}%`, background: accent }} />}
              {items.map((it, i) => {
                const high = effectiveHigh(it) ?? effectiveLow(it) ?? 0;
                return (
                  <div
                    key={it.id}
                    style={{
                      width: `${(high / totalHigh) * span}%`,
                      minWidth: "1.2%",
                      background: BP_SHADES[Math.min(i, BP_SHADES.length - 1)],
                    }}
                  />
                );
              })}
            </div>

            {/* Construction-only dimension arrow + segment boundary ticks */}
            <div style={{ position: "relative", height: "1.1em", marginTop: "0.45em", flexShrink: 0 }}>
              <DimArrow left={retPct} />
              {boundaries.slice(1, -1).map((x, i) => (
                <div key={i} aria-hidden style={{ position: "absolute", left: `${x}%`, top: "10%", bottom: "10%", width: 1.5, background: "rgba(26,35,50,0.4)", transform: "translateX(-50%)" }} />
              ))}
            </div>

            {/* Construction-subtotal anchor — framed navy box, bottom-right */}
            {showTotal && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "2%",
                  zIndex: 2,
                  background: "#FFFFFF",
                  border: `2px solid ${navy}`,
                  padding: 4,
                  boxShadow: "0 10px 26px rgba(26,35,50,0.18)",
                }}
              >
                <div style={{ background: navy, padding: "0.7em 1.2em" }}>
                  {retainerOn && (
                    <p style={{ fontFamily: theme.fonts.body, fontWeight: 500, fontSize: `${0.74 * scale * anchorScale}em`, color: "rgba(255,255,255,0.92)", margin: 0, lineHeight: 1.45 }}>
                      Projected Construction Investment: {fmtFullRange(subtotal.low, subtotal.high)}
                    </p>
                  )}
                  <p style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: `${0.78 * scale * anchorScale}em`, color: retainerOn ? accent : "#FFFFFF", margin: 0, lineHeight: 1.45, letterSpacing: "0.01em" }}>
                    {totalLabel}: {fmtFullRange(subtotal.low + retainerNum, subtotal.high + retainerNum)}
                  </p>
                </div>
              </div>
            )}

            {/* Body — retainer callout (left) + build zones list */}
            <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
              {retainerOn && (
                <>
                  {/* Orange stem from the retainer segment down to the callout */}
                  <div
                    aria-hidden
                    style={{ position: "absolute", left: `${retPct / 2}%`, top: "-1.1em", height: "2.6em", width: 2.5, background: accent, transform: "translateX(-50%)" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "1.5em",
                      width: "26%",
                      background: "#FFFFFF",
                      border: "1px solid rgba(26,35,50,0.35)",
                      borderLeft: `0.45em solid ${accent}`,
                      padding: "0.75em 0.95em",
                      boxShadow: "0 10px 26px rgba(26,35,50,0.12)",
                    }}
                  >
                    <p style={{ fontFamily: theme.fonts.body, fontWeight: 800, fontSize: `${0.72 * scale * retScale}em`, color: theme.color.ink, lineHeight: 1.3, margin: 0 }}>
                      The Immediate Step:
                    </p>
                    <p style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: `${0.72 * scale * retScale}em`, color: theme.color.ink, lineHeight: 1.3, margin: 0, marginTop: "0.2em" }}>
                      Design &amp; Feasibility Retainer: {formatRetainerAmount(retainerNum)}
                    </p>
                  </div>
                </>
              )}

              <div
                style={{
                  position: "absolute",
                  left: retainerOn ? "30%" : "14%",
                  top: "8%",
                  width: retainerOn ? "46%" : "54%",
                  border: `1px solid rgba(26,35,50,0.3)`,
                  background: "#FFFFFF",
                  boxShadow: "0 10px 26px rgba(26,35,50,0.10)",
                }}
              >
                <div style={{ background: navy, padding: "0.55em 1em" }}>
                  <span style={{ fontFamily: theme.fonts.label, fontWeight: 700, fontSize: `${0.7 * scale * zoneScale}em`, color: "#FFFFFF" }}>
                    The Build Zones (Estimated Range):
                  </span>
                </div>
                {items.map((it, i) => (
                  <div key={it.id} style={{ padding: "0.5em 1em", borderTop: i === 0 ? "none" : `1px solid rgba(26,35,50,0.15)` }}>
                    <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.68 * scale * zoneScale}em`, color: theme.color.ink }}>
                      <span aria-hidden style={{ display: "inline-block", width: "0.7em", height: "0.7em", background: BP_SHADES[Math.min(i, BP_SHADES.length - 1)], marginRight: "0.6em", verticalAlign: "baseline" }} />
                      {it.label}: {formatRange(effectiveLow(it), effectiveHigh(it))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <IbsLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function InvestmentBySpaceSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey) {
    case "range-bars":
      return <RangeBarsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "stacked-blocks":
      return <StackedBlocksLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "blueprint-breakdown":
      return <BlueprintBreakdownLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "table-callout":
    default:
      return <TableCalloutLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

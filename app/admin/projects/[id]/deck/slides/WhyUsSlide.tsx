"use client";

import type {
  ProposalSlide,
  DeckBranding,
  WhyUsContent,
  WhyUsPillarItem,
  WhyUsTestimonial,
  WhyUsLayoutKey,
  WhyUsComparisonRow,
} from "@/app/lib/deck/types";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import type { DeckTheme } from "@/app/lib/deck/themes";
import { WHY_US_COMPARISON_DEFAULTS, DEFAULT_WHY_US_COMPARISON_ROWS } from "@/app/lib/deck/why-us-comparison-defaults";
import { whyUsDefaultIcon } from "@/app/lib/deck/why-us-default-icons";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { StarRating } from "./shared/StarRating";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

function getVisiblePillars(content: WhyUsContent): WhyUsPillarItem[] {
  const all = content.pillars ?? [];
  if ((content.selectedPillarIds?.length ?? 0) > 0) {
    return all.filter((p) => content.selectedPillarIds!.includes(p.id));
  }
  return all;
}

function getSectionTitle(content: WhyUsContent, slide: ProposalSlide): string {
  return content.sectionTitle || slide.headline || "The HHI Difference";
}

function NoPillars() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5em",
      }}
    >
      <p style={{ fontSize: "0.8em", color: "#9CA3AF" }}>No pillars to display.</p>
      <p style={{ fontSize: "0.65em", color: "#C4C4BF" }}>
        Go to Settings → Value Pillars to add them.
      </p>
    </div>
  );
}

// ─── Layout: guarantee-grid (dark 2×2, isometric orange icons) ──────────────────

/** First word in the accent color, the rest white — the NotebookLM guarantee look. */
function FirstWordAccent({ text, accent }: { text: string; accent: string }) {
  const trimmed = (text ?? "").trim();
  const sp = trimmed.indexOf(" ");
  if (sp < 0) return <span style={{ color: accent }}>{trimmed}</span>;
  return (
    <>
      <span style={{ color: accent }}>{trimmed.slice(0, sp)}</span>
      <span style={{ color: "#FFFFFF" }}>{trimmed.slice(sp)}</span>
    </>
  );
}

function GuaranteeGridLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as WhyUsContent;
  const accent = content.accentColor ?? branding.accentColor;
  const pillars = getVisiblePillars(content).slice(0, 4);
  const sectionTitle = getSectionTitle(content, slide);
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const headFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const titleSize = content.sectionTitleSize ?? 2.9;
  const iconScale = content.gridIconSize ?? 1;
  const titleScale = content.gridTitleSize ?? 1;
  const bodyScale = content.gridBodySize ?? 1;
  const crossPx = 1.5 * (content.gridDividerSize ?? 1);
  const DARK = "#262524"; // warm charcoal

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : DARK }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "5.5% 6%" }}>
        <h2
          style={{
            fontFamily: headFont,
            fontSize: `${titleSize}em`,
            fontWeight: (content.sectionTitleBold ?? true) ? 700 : 400,
            fontStyle: content.sectionTitleItalic ? "italic" : undefined,
            color: content.sectionTitleColor ?? "#FFFFFF",
            lineHeight: 1.1,
            margin: 0,
            marginBottom: "4%",
          }}
        >
          {sectionTitle}
        </h2>

        {pillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", columnGap: "5%" }}>
            {/* Continuous orange cross divider (full width × full height, meeting at center) */}
            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: crossPx, transform: "translateY(-50%)", background: accent }} />
            <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: crossPx, transform: "translateX(-50%)", background: accent }} />
            {pillars.map((p) => {
              const iconBox = `${4.6 * iconScale}em`;
              // Committed default icon (matched by title) when none was generated.
              const iconImg = p.iconImageUrl ?? whyUsDefaultIcon(p.title);
              return (
                <div key={p.id} style={{ display: "flex", gap: "1.4em", alignItems: "flex-start", padding: "1.7em 1.9em" }}>
                  {iconImg ? (
                    // Multi-tone isometric icon (orange + grey/cream) — render as-is.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={iconImg} alt="" aria-hidden style={{ flexShrink: 0, width: iconBox, height: iconBox, objectFit: "contain" }} />
                  ) : p.iconUrl ? (
                    // Legacy single-colour pillar icon — mask-tint to the accent so it shows on dark.
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: iconBox,
                        height: iconBox,
                        background: accent,
                        WebkitMaskImage: `url("${p.iconUrl}")`,
                        maskImage: `url("${p.iconUrl}")`,
                        WebkitMaskRepeat: "no-repeat",
                        maskRepeat: "no-repeat",
                        WebkitMaskSize: "contain",
                        maskSize: "contain",
                        WebkitMaskPosition: "center",
                        maskPosition: "center",
                      }}
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: headFont, fontWeight: 700, fontSize: `${1.55 * titleScale}em`, lineHeight: 1.18, margin: 0, marginBottom: "0.45em" }}>
                      <FirstWordAccent text={p.title} accent={accent} />
                    </p>
                    <p style={{ fontFamily: theme.fonts.body, fontSize: `${0.82 * bodyScale}em`, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, margin: 0 }}>
                      {p.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CmpLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout: advantage-grid (2×2 over a photo, dark navy scrim) ─────────────────

function AdvantageGridLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as WhyUsContent;
  const accent = content.accentColor ?? branding.accentColor;
  const pillars = getVisiblePillars(content).slice(0, 4);
  const sectionTitle = getSectionTitle(content, slide);
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const headFont = content.sectionTitleFont ?? theme.fonts.label; // bold sans by default
  const titleSize = content.sectionTitleSize ?? 2.5;
  const titleScale = content.gridTitleSize ?? 1;
  const bodyScale = content.gridBodySize ?? 1;
  const crossPx = 1.5 * (content.gridDividerSize ?? 1);

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : "#16223C" }}>
      {/* Dark navy scrim over the slide's background photo so text stays legible */}
      {hasBg && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(16,26,46,0.78), rgba(16,26,46,0.82))" }} />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "5.5% 6%" }}>
        <h2
          style={{
            fontFamily: headFont,
            fontSize: `${titleSize}em`,
            fontWeight: 800,
            fontStyle: content.sectionTitleItalic ? "italic" : undefined,
            color: content.sectionTitleColor ?? "#FFFFFF",
            lineHeight: 1.12,
            margin: 0,
            marginBottom: "4%",
          }}
        >
          {sectionTitle}
        </h2>

        {pillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div style={{ flex: 1, minHeight: 0, position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", columnGap: "6%" }}>
            {/* Continuous orange cross divider */}
            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: crossPx, transform: "translateY(-50%)", background: accent }} />
            <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: crossPx, transform: "translateX(-50%)", background: accent }} />
            {pillars.map((p) => (
              <div key={p.id} style={{ padding: "1.7em 1.9em" }}>
                <p style={{ fontFamily: headFont, fontWeight: 800, fontSize: `${1.2 * titleScale}em`, color: accent, lineHeight: 1.15, margin: 0, marginBottom: "0.45em" }}>
                  {p.title}
                </p>
                <p style={{ fontFamily: theme.fonts.body, fontSize: `${0.74 * bodyScale}em`, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, margin: 0 }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <CmpLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout 4: testimonials-split ─────────────────────────────────────────────
// Two-column. Left: client quote cards. Right: dark panel with pillar highlights.
// Uses content.testimonials when wired; falls back to empty state.
// NOTE: Testimonial styling is NOT changed per task spec.

function TestimonialsSplitLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const accent = resolvedAccent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Per-field: section title
  const stFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const stSize = content.sectionTitleSize ?? 3.0;
  const stColor = content.sectionTitleColor ?? branding.textColor;

  const displayedTestimonials = (content.testimonials ?? []).slice(0, 3);
  const displayedPillars = visiblePillars.slice(0, 4);
  const testimonialTextScale = content.testimonialTextSize ?? 1.0;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dark right-column panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "40%",
          background: branding.textColor,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 0",
        }}
      >
        {/* Full-width headline */}
        <div style={{ padding: "0 6%", marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: `${stSize / 3.0 * 3.0}em`,
              fontFamily: stFont,
              fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
              fontStyle: content.sectionTitleItalic ? "italic" : undefined,
              textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
              color: stColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.sectionTitleOutline),
            }}
          >
            {sectionTitle}
          </h2>
          <TitleAccentRule accentColor={accent} />
        </div>

        {/* Two-column body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT — testimonial quote cards (60%) — NOT CHANGED */}
          <div
            style={{
              width: "60%",
              padding: "0 3% 0 6%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "3%",
            }}
          >
            {displayedTestimonials.length === 0 ? (
              <div style={{ flex: 1 }} />
            ) : (
              displayedTestimonials.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#EEECEA",
                    borderRadius: 4,
                    padding: "3% 4%",
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <p
                    className="font-serif"
                    style={{
                      fontSize: `${0.63 * testimonialTextScale}em`,
                      fontStyle: "italic",
                      color: branding.textColor,
                      lineHeight: 1.7,
                      marginBottom: "0.5em",
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  {t.rating != null && t.rating > 0 && (
                    <div style={{ marginBottom: "0.4em" }}>
                      <StarRating rating={t.rating} size="sm" />
                    </div>
                  )}
                  <p
                    style={{
                      fontSize: `${0.54 * testimonialTextScale}em`,
                      color: "#6B7280",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                    }}
                  >
                    — {t.author}
                    {t.location ? (
                      <span style={{ fontWeight: 400 }}>, {t.location}</span>
                    ) : null}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* RIGHT — pillar highlights on dark panel (40%) */}
          <div
            style={{
              width: "40%",
              padding: "0 6% 0 5%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "6%",
            }}
          >
            {/* Column label */}
            <p
              style={{
                fontSize: "0.54em",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: accent,
              }}
            >
              Why Clients Choose Us
            </p>

            {displayedPillars.length === 0 ? (
              <p style={{ fontSize: "0.65em", color: "rgba(255,255,255,0.4)" }}>
                No pillars selected.
              </p>
            ) : (
              displayedPillars.map((pillar) => {
                const tFont = pillar.titleFont ?? SLIDE_FONTS.defaults.headline;
                const tSize = pillar.titleSize ?? 0.82;
                const tColor = pillar.titleColor ?? "#FFFFFF";
                const dFont = pillar.descriptionFont ?? SLIDE_FONTS.defaults.body;
                const dSize = pillar.descriptionSize ?? 0.6;
                const dColor = pillar.descriptionColor ?? "rgba(255,255,255,0.6)";
                return (
                  <div
                    key={pillar.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: "1em" }}
                  >
                    {/* Icon — inverted for dark background */}
                    {pillar.iconUrl ? (
                      <img
                        src={pillar.iconUrl}
                        alt={pillar.title}
                        style={{
                          width: "2.4em",
                          height: "2.4em",
                          objectFit: "contain",
                          flexShrink: 0,
                          filter: "brightness(0) invert(1)",
                          opacity: 0.8,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          flexShrink: 0,
                          width: "2.2em",
                          height: "2.2em",
                          borderRadius: "50%",
                          border: `1.5px solid ${accent}`,
                        }}
                      />
                    )}

                    {/* Title + body */}
                    <div>
                      <p
                        className="font-serif"
                        style={{
                          fontSize: `${tSize}em`,
                          fontWeight: (pillar.titleBold ?? true) ? 700 : 400,
                          fontStyle: pillar.titleItalic ? "italic" : undefined,
                          textDecoration: pillar.titleUnderline ? "underline" : undefined,
                          fontFamily: tFont,
                          color: tColor,
                          lineHeight: 1.25,
                          marginBottom: "0.3em",
                          textShadow: makeOutlineShadow(pillar.titleOutline),
                        }}
                      >
                        {pillar.title}
                      </p>
                      <p
                        style={{
                          fontSize: `${dSize}em`,
                          fontFamily: dFont,
                          fontWeight: pillar.descriptionBold ? 700 : 400,
                          fontStyle: pillar.descriptionItalic ? "italic" : undefined,
                          textDecoration: pillar.descriptionUnderline ? "underline" : undefined,
                          color: dColor,
                          lineHeight: 1.65,
                          textShadow: makeOutlineShadow(pillar.descriptionOutline),
                        }}
                      >
                        {pillar.body}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
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

// ─── Main export — layout dispatcher ──────────────────────────────────────────

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

export function WhyUsSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey as WhyUsLayoutKey) {
    case "advantage-grid":
      return <AdvantageGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "testimonials-split":
      return <TestimonialsSplitLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "comparison-table":
      return <ComparisonTableLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "comparison-columns":
      return <ComparisonColumnsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "comparison-cards":
      return <ComparisonCardsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "guarantee-grid":
    default:
      return <GuaranteeGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

// ─── Comparison layouts (Traditional vs HHI) ────────────────────────────────────

function useComparison(slide: ProposalSlide) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const rows = content.comparisonRows && content.comparisonRows.length > 0
    ? content.comparisonRows
    : DEFAULT_WHY_US_COMPARISON_ROWS;
  const leftHeader = content.comparisonLeftHeader ?? WHY_US_COMPARISON_DEFAULTS.leftHeader;
  const rightHeader = content.comparisonRightHeader ?? WHY_US_COMPARISON_DEFAULTS.rightHeader;
  // Empty string explicitly hides the closing line; undefined falls back to the default promise.
  const bottom = content.comparisonBottom === ""
    ? ""
    : (content.comparisonBottom ?? WHY_US_COMPARISON_DEFAULTS.bottom);
  return { content, rows, leftHeader, rightHeader, bottom };
}

/** Solid orange ✓ in a filled circle — the HHI "win" mark. Sized in em. */
function CmpCheck({ accent, size = "1.6em" }: { accent: string; size?: string }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: accent,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 3px 9px ${accent}66`,
      }}
    >
      <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/** Muted ✗ in a soft gray circle — the Traditional "pain" mark. Sized in em. */
function CmpCross({ color, size = "1.35em" }: { color: string; size?: string }) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(26,35,50,0.08)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="52%" height="52%" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </span>
  );
}

/** Faint graph-paper underlay (Blueprint theme only). */
function CmpGridUnderlay({ show }: { show: boolean }) {
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

function CmpHeader({
  slide,
  content,
  accent,
  ink,
  theme,
}: {
  slide: ProposalSlide;
  content: WhyUsContent;
  accent: string;
  ink: string;
  theme: DeckTheme;
}) {
  const title = getSectionTitle(content, slide);
  const label = slide.subheadline;
  const showLabel = content.showSectionLabel ?? true;
  const font = content.sectionTitleFont ?? theme.fonts.headline;
  const size = content.sectionTitleSize ?? 2.4;
  const color = content.sectionTitleColor ?? ink;
  return (
    <div style={{ flexShrink: 0, marginBottom: "2.2%" }}>
      {showLabel && label && (
        <p
          style={{
            fontFamily: theme.fonts.label,
            fontSize: SECTION_LABEL_SIZE,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: "0.5em",
          }}
        >
          {label}
        </p>
      )}
      <h2
        style={{
          fontFamily: font,
          fontSize: `${size}em`,
          fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
          fontStyle: content.sectionTitleItalic ? "italic" : undefined,
          textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
          color,
          lineHeight: 1.05,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <TitleAccentRule accentColor={accent} marginTop="0.4em" marginBottom="0" />
    </div>
  );
}

/** Closing promise line, centered between two accent ticks. */
function CmpBottom({ text, accent, ink, theme }: { text: string; accent: string; ink: string; theme: DeckTheme }) {
  return (
    <div style={{ flexShrink: 0, marginTop: "3%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.85em" }}>
      <span style={{ width: "2.2em", height: 3, background: accent, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontFamily: theme.fonts.headline, fontSize: "0.98em", fontWeight: 600, fontStyle: "italic", color: ink, textAlign: "center", lineHeight: 1.35 }}>
        {text}
      </span>
      <span style={{ width: "2.2em", height: 3, background: accent, borderRadius: 2, flexShrink: 0 }} />
    </div>
  );
}

/** #1 — Matrix table: floating row labels · gray Traditional cell · white HHI cell with a big ✓.
 *  The data columns form one crisp bordered box; the row-label column floats free (no blank
 *  top-left cell). All row text scales via the Header / Title / Body size multipliers. */
function ComparisonTableLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const theme = useDeckTheme();
  const { content, rows, leftHeader, rightHeader, bottom } = useComparison(slide);
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const showLabels = content.showRowLabels ?? true;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const headerScale = content.comparisonHeaderSize ?? 1;
  const titleScale = content.comparisonTitleSize ?? 1;
  const bodyScale = content.comparisonBodySize ?? 1;
  const headGray = "#D2CFC9"; // solid Traditional header bar
  const cellGray = "#EDECE8"; // Traditional body cells
  const B = "1px solid rgba(26,35,50,0.15)"; // crisp grid border
  const cols = showLabels ? "0.75fr 1.05fr 1.5fr" : "1fr 1.45fr";
  const cellPad = "1.25em 1.15em";
  const last = rows.length - 1;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <CmpGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CmpHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols }}>
            {/* Header row — empty label cell (no box), then two raised header tabs over the data columns */}
            {showLabels && <div aria-hidden />}
            <div style={{ background: headGray, padding: "0.95em 1.1em", textAlign: "center", borderTop: B, borderLeft: B }}>
              <span style={{ fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${1.15 * headerScale}em`, color: ink, letterSpacing: "0.01em" }}>{leftHeader}</span>
            </div>
            <div style={{ background: theme.color.surface, padding: "0.95em 1.1em", textAlign: "center", borderTop: `4px solid ${accent}`, borderLeft: B, borderRight: B }}>
              <span style={{ fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${1.15 * headerScale}em`, color: ink, letterSpacing: "0.01em" }}>{rightHeader}</span>
            </div>
            {/* Body rows — all three columns bordered (label column included) */}
            {rows.map((r, i) => {
              const lastRow = i === last ? { borderBottom: B } : {};
              return (
                <CmpFragment key={r.id}>
                  {showLabels && (
                    <div style={{ background: theme.color.surface, padding: cellPad, display: "flex", alignItems: "center", borderTop: B, borderLeft: B, ...lastRow }}>
                      <span style={{ fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${0.95 * titleScale}em`, color: ink, lineHeight: 1.2 }}>{r.label}</span>
                    </div>
                  )}
                  <div style={{ background: cellGray, padding: cellPad, display: "flex", alignItems: "center", borderTop: B, borderLeft: B, ...lastRow }}>
                    <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.82 * bodyScale}em`, color: muted, lineHeight: 1.45 }}>{r.traditional}</span>
                  </div>
                  <div style={{ background: theme.color.surface, padding: cellPad, display: "flex", alignItems: "center", gap: "0.9em", borderTop: B, borderLeft: B, borderRight: B, ...lastRow }}>
                    <span style={{ flex: 1, lineHeight: 1.45 }}>
                      {r.hhiTitle && <span style={{ fontFamily: theme.fonts.body, fontWeight: 800, color: ink, fontSize: `${0.82 * titleScale}em` }}>{r.hhiTitle}. </span>}
                      <span style={{ fontFamily: theme.fonts.body, color: ink, fontSize: `${0.82 * bodyScale}em` }}>{r.hhi}</span>
                    </span>
                    <svg width={`${2 * titleScale}em`} height={`${2 * titleScale}em`} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M4 12.5l5 5L20 6" />
                    </svg>
                  </div>
                </CmpFragment>
              );
            })}
          </div>
          {bottom && <CmpBottom text={bottom} accent={accent} ink={ink} theme={theme} />}
        </div>
      </div>
      <CmpLogo content={content} branding={branding} />
    </div>
  );
}

/** #2 — Full-bleed split: gray "Traditional" half vs white "HHI" half, divided by a navy
 *  center rule; each row is a double-framed card (NotebookLM "Chaos vs Certainty"). */
function ComparisonColumnsLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const theme = useDeckTheme();
  const { content, rows, leftHeader, rightHeader } = useComparison(slide);
  const ink = theme.color.ink;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const headerScale = content.comparisonHeaderSize ?? 1;
  const titleScale = content.comparisonTitleSize ?? 1;
  const bodyScale = content.comparisonBodySize ?? 1;
  const headFont = content.sectionTitleFont ?? theme.fonts.headline;

  const navy = ink; // brand navy — center rule, HHI frame + header
  const grayPanel = "#E4E8ED"; // left half background
  const grayCard = "#ECEEF2"; // left card fill (reads slightly raised)
  const grayOuter = "#C4CAD3"; // left card outer frame
  const grayInner = "#D7DCE3"; // left card inner frame
  const navyInner = "rgba(26,35,50,0.35)"; // HHI card inner frame
  const tradText = "#6B7280"; // left card text
  const descText = "#39414E"; // HHI description text
  const leftHeadColor = "#8A929E"; // left header (muted)

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}>
      {/* Full-bleed background halves */}
      {!hasBg && <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "50%", background: grayPanel }} />}
      {!hasBg && <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", right: 0, background: theme.color.surface }} />}
      {/* Navy center rule */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 2, background: navy, transform: "translateX(-1px)", zIndex: 1 }} />

      {/* Foreground grid — aligned header + card rows */}
      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "7%", rowGap: "0.85em", alignContent: "center", padding: "5.5% 5.5%" }}>
        {/* Headers */}
        <div style={{ textAlign: "center", paddingBottom: "0.7em" }}>
          <span style={{ fontFamily: headFont, fontSize: `${1.7 * headerScale}em`, fontWeight: 500, color: leftHeadColor, lineHeight: 1.1 }}>{leftHeader}</span>
        </div>
        <div style={{ textAlign: "center", paddingBottom: "0.7em" }}>
          <span style={{ fontFamily: headFont, fontSize: `${1.7 * headerScale}em`, fontWeight: 700, color: navy, lineHeight: 1.1 }}>{rightHeader}</span>
        </div>
        {/* Card pairs */}
        {rows.map((r) => (
          <CmpFragment key={r.id}>
            {/* Left — gray recessed card */}
            <div style={{ background: grayCard, border: `1px solid ${grayOuter}`, padding: 3, display: "flex" }}>
              <div style={{ flex: 1, border: `1px solid ${grayInner}`, padding: "1.05em 1.2em", display: "flex", alignItems: "center" }}>
                <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.8 * bodyScale}em`, color: tradText, lineHeight: 1.5 }}>{r.traditional}</span>
              </div>
            </div>
            {/* Right — white navy-framed card */}
            <div style={{ background: "#FFFFFF", border: `2px solid ${navy}`, padding: 3, display: "flex" }}>
              <div style={{ flex: 1, border: `1px solid ${navyInner}`, padding: "1.05em 1.2em", display: "flex", alignItems: "center" }}>
                <span style={{ lineHeight: 1.5 }}>
                  {r.hhiTitle && <span style={{ fontFamily: theme.fonts.body, fontWeight: 800, color: navy, fontSize: `${0.8 * titleScale}em` }}>{r.hhiTitle}: </span>}
                  <span style={{ fontFamily: theme.fonts.body, color: descText, fontSize: `${0.8 * bodyScale}em` }}>{r.hhi}</span>
                </span>
              </div>
            </div>
          </CmpFragment>
        ))}
      </div>
      <CmpLogo content={content} branding={branding} />
    </div>
  );
}

/** #4 — Paired cards per row: muted gray Traditional vs lifted white/orange HHI. */
function ComparisonCardsLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const theme = useDeckTheme();
  const { content, rows, leftHeader, rightHeader, bottom } = useComparison(slide);
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const navy = theme.color.panel;
  const line = theme.color.line;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const headerScale = content.comparisonHeaderSize ?? 1;
  const titleScale = content.comparisonTitleSize ?? 1;
  const bodyScale = content.comparisonBodySize ?? 1;
  const slateHead = "#D8D5CE";
  const slateCard = "#ECEAE4";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <CmpGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CmpHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.6% 3.5%", alignContent: "center" }}>
            {/* Column header bars */}
            <div style={{ background: slateHead, borderRadius: 10, padding: "0.7em 1em", textAlign: "center" }}>
              <span style={{ fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${1.05 * headerScale}em`, color: ink, textTransform: "uppercase", letterSpacing: "0.04em" }}>{leftHeader}</span>
            </div>
            <div style={{ background: navy, borderRadius: 10, padding: "0.7em 1em", textAlign: "center", borderTop: `4px solid ${accent}` }}>
              <span style={{ fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${1.05 * headerScale}em`, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.04em" }}>{rightHeader}</span>
            </div>
            {/* Rows of paired cards */}
            {rows.map((r) => (
              <CmpFragment key={r.id}>
                <div style={{ background: slateCard, border: `1px solid ${line}`, borderRadius: 10, padding: "1.05em 1.2em", display: "flex", gap: "0.7em", alignItems: "flex-start" }}>
                  <CmpCross color={muted} size="1.4em" />
                  <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.73 * bodyScale}em`, color: muted, lineHeight: 1.5 }}>{r.traditional}</span>
                </div>
                <div style={{ background: "#FFFFFF", border: `1px solid ${line}`, borderLeft: `5px solid ${accent}`, borderRadius: 10, padding: "1.05em 1.2em", display: "flex", gap: "0.75em", alignItems: "flex-start", boxShadow: "0 14px 32px rgba(26,35,50,0.16)" }}>
                  <CmpCheck accent={accent} size="1.5em" />
                  <span style={{ flex: 1 }}>
                    {r.hhiTitle && <span style={{ display: "block", fontFamily: theme.fonts.headline, fontWeight: 800, fontSize: `${0.84 * titleScale}em`, color: ink, marginBottom: "0.22em", lineHeight: 1.2 }}>{r.hhiTitle}</span>}
                    <span style={{ fontFamily: theme.fonts.body, fontSize: `${0.73 * bodyScale}em`, color: muted, lineHeight: 1.5 }}>{r.hhi}</span>
                  </span>
                </div>
              </CmpFragment>
            ))}
          </div>
          {bottom && <CmpBottom text={bottom} accent={accent} ink={ink} theme={theme} />}
        </div>
      </div>
      <CmpLogo content={content} branding={branding} />
    </div>
  );
}

function CmpFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function CmpLogo({ content, branding }: { content: WhyUsContent; branding: DeckBranding }) {
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

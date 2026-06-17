"use client";

/**
 * Floor Plan ("Project Footprint") slide — the client's actual floor plan
 * with renovation zones pinned, highlighted, and tied to SF callout cards.
 * Modeled on 94-coggins p03 ("Mapping the Project Footprint") and
 * song-sparrow p02 (zone plan with beige SF callout cards on leader lines).
 *
 * Layouts:
 *  - callout-map (default): plan center, callout cards in left/right columns,
 *    leader lines from card to numbered pin.
 *  - side-ledger: plan left, numbered ledger cards stacked right (no lines —
 *    the shared numerals do the tying), total band at the bottom.
 */

import type { ProposalSlide, DeckBranding, FloorPlanContent, FloorPlanZone } from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { LeaderOverlay, NumberPin } from "./shared/LeaderAnnotations";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

const DEFAULT_PLAN_IMAGE = "/deck-art/closing-blueprint.png";

function fmtSqft(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} SF`;
}

export function FloorPlanSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as FloorPlanContent;
  const layoutKey = slide.layoutKey as string;
  const zones = (content.zones ?? []).slice(0, 8);

  const common = { slide, branding, hasAiBackground, content, zones };
  switch (layoutKey) {
    case "side-ledger":
      return <SideLedgerLayout {...common} />;
    case "callout-map":
    default:
      return <CalloutMapLayout {...common} />;
  }
}

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
  content: FloorPlanContent;
  zones: FloorPlanZone[];
}

function FpHeader({ slide, content, accent, ink, theme }: { slide: ProposalSlide; content: FloorPlanContent; accent: string; ink: string; theme: ReturnType<typeof useDeckTheme> }) {
  return (
    <div style={{ flexShrink: 0, marginBottom: "1.2%" }}>
      {(content.showSectionLabel ?? true) && (
        <p
          style={{
            fontFamily: content.sectionLabelFont ?? theme.fonts.label,
            fontSize: SECTION_LABEL_SIZE,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: content.sectionLabelColor ?? accent,
            marginBottom: "0.4em",
          }}
        >
          {content.sectionLabel ?? "PROJECT FOOTPRINT"}
        </p>
      )}
      <h2
        style={{
          fontFamily: content.headlineFont ?? theme.fonts.headline,
          fontSize: `${(content.headlineSize ?? 1.0) * 1.55}em`,
          fontWeight: (content.headlineBold !== false) ? 700 : 400,
          fontStyle: content.headlineItalic ? "italic" : undefined,
          textDecoration: content.headlineUnderline ? "underline" : undefined,
          color: content.headlineColor ?? ink,
          lineHeight: 1.12,
        }}
      >
        {slide.headline ?? "Mapping the Project Footprint"}
      </h2>
      <TitleAccentRule accentColor={accent} marginTop="0.3em" marginBottom="0" />
      {content.introText && (
        <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: "0.66em", color: theme.color.muted, marginTop: "0.6em", lineHeight: 1.5, maxWidth: "70%" }}>
          {content.introText}
        </p>
      )}
    </div>
  );
}

/** Zone highlight boxes + numbered pins, absolutely positioned over the plan.
 *  The crop is non-destructive CSS: a zoom-box scaled so the crop window
 *  fills the plan area. Pins/boxes are placed against the cropped view. */
function PlanArt({ content, zones, highlight, pinScale }: { content: FloorPlanContent; zones: FloorPlanZone[]; highlight: string; pinScale: number }) {
  const cx = content.planCropX ?? 0;
  const cy = content.planCropY ?? 0;
  const cw = Math.max(content.planCropW ?? 100, 5);
  const ch = Math.max(content.planCropH ?? 100, 5);
  // Uniform scale so the crop window fills the plan area WITHOUT distortion:
  // the whole frame scales by s and is offset so the window lands centered.
  const s = Math.min(100 / cw, 100 / ch);
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: `${(100 - cw * s) / 2 - cx * s}%`,
            top: `${(100 - ch * s) / 2 - cy * s}%`,
            width: `${100 * s}%`,
            height: `${100 * s}%`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.planImageUrl ?? DEFAULT_PLAN_IMAGE}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: "grayscale(1)", opacity: 0.92 }}
          />
        </div>
      </div>
      {zones.map((z) =>
        z.boxX != null && z.boxY != null && z.boxW != null && z.boxH != null ? (
          <div
            key={`box-${z.id}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `${z.boxX}%`,
              top: `${z.boxY}%`,
              width: `${z.boxW}%`,
              height: `${z.boxH}%`,
              background: `${highlight}38`,
              border: `1px solid ${highlight}`,
              zIndex: 2,
            }}
          />
        ) : null
      )}
      {zones.map((z) =>
        z.pinX != null && z.pinY != null ? (
          <NumberPin key={`pin-${z.id}`} x={z.pinX} y={z.pinY} number={z.number} color={highlight} scale={pinScale} />
        ) : null
      )}
    </>
  );
}

// ─── Layout A: Callout Map ───────────────────────────────────────────────────
// Plan centered; cards in left/right columns; leader lines card → pin.

const CARD_COL_W = 22; // % of the map area each card column occupies
const PLAN_LEFT = CARD_COL_W + 2;
const PLAN_W = 100 - 2 * (CARD_COL_W + 2);

function CalloutMapLayout({ slide, branding, hasAiBackground, content, zones }: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const highlight = content.highlightColor ?? accent;
  const ink = theme.color.ink;
  const zScale = content.zoneTextSize ?? 1.0;
  const pinScale = content.pinSize ?? 1.0;
  const hasBg = !!hasAiBackground;

  // Distribute cards: explicit side wins, otherwise alternate left/right.
  const placed = zones.map((z, i) => ({ z, side: z.side ?? (i % 2 === 0 ? "left" : "right") as "left" | "right" }));
  const leftCards = placed.filter((p) => p.side === "left");
  const rightCards = placed.filter((p) => p.side === "right");

  // Vertical slot centers (%) for a column of n cards.
  const slotY = (i: number, n: number) => (n <= 1 ? 50 : 12 + (i * 76) / (n - 1));

  // Leader lines: from card inner edge to pin (only when the pin is placed).
  // Pin coords are % of the PLAN area; convert to map-area coords.
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const col of [leftCards, rightCards]) {
    col.forEach((p, i) => {
      if (p.z.pinX == null || p.z.pinY == null) return;
      const cardX = p.side === "left" ? CARD_COL_W : 100 - CARD_COL_W;
      lines.push({
        x1: cardX,
        y1: slotY(i, col.length),
        x2: PLAN_LEFT + (p.z.pinX / 100) * PLAN_W,
        y2: p.z.pinY,
      });
    });
  }

  const totalSqft = zones.reduce((s, z) => s + (z.sqft ?? 0), 0);

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <FpHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        {/* Map area: cards | plan | cards */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", marginTop: "0.5%" }}>
          {/* Plan */}
          <div style={{ position: "absolute", left: `${PLAN_LEFT}%`, top: 0, width: `${PLAN_W}%`, height: totalSqft > 0 && (content.showTotal ?? true) ? "88%" : "100%" }}>
            <PlanArt content={content} zones={zones} highlight={highlight} pinScale={pinScale} />
          </div>

          {/* Leader lines (map-area coordinate space) */}
          <LeaderOverlay lines={lines} color={highlight} />

          {/* Card columns */}
          {[
            { col: leftCards, left: 0 },
            { col: rightCards, left: 100 - CARD_COL_W },
          ].map(({ col, left }) =>
            col.map((p, i) => (
              <div
                key={p.z.id}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: `${slotY(i, col.length)}%`,
                  transform: "translateY(-50%)",
                  width: `${CARD_COL_W}%`,
                  background: theme.key === "blueprint" ? "#FFFFFF" : "#F4EFE5",
                  // Use longhand sides (not the `border` shorthand) so the orange
                  // left stripe via borderLeft doesn't mix shorthand+longhand,
                  // which React warns about and can mis-render.
                  borderTop: `1px solid ${theme.color.line}`,
                  borderRight: `1px solid ${theme.color.line}`,
                  borderBottom: `1px solid ${theme.color.line}`,
                  borderLeft: `0.28em solid ${highlight}`,
                  padding: "0.55em 0.7em",
                  zIndex: 4,
                }}
              >
                <div style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.62 * zScale}em`, fontWeight: 700, color: ink, lineHeight: 1.3 }}>
                  {p.z.label}
                </div>
                {(content.showSqft ?? true) && p.z.sqft != null && (
                  <div style={{ fontFamily: theme.fonts.numeral, fontSize: `${0.8 * zScale}em`, fontWeight: 700, color: highlight, lineHeight: 1.3, marginTop: "0.1em" }}>
                    {fmtSqft(p.z.sqft)}
                  </div>
                )}
                {p.z.description && (
                  <div style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.5 * zScale}em`, color: theme.color.muted, lineHeight: 1.45, marginTop: "0.25em", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}>
                    {p.z.description}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Total footprint band */}
          {totalSqft > 0 && (content.showTotal ?? true) && (
            <div
              style={{
                position: "absolute",
                left: `${PLAN_LEFT}%`,
                bottom: 0,
                width: `${PLAN_W}%`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.6em",
                background: theme.color.panel,
                color: theme.color.panelInk,
                padding: "0.45em 1em",
              }}
            >
              <span style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: "0.6em", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {content.totalLabel ?? "Total renovation footprint"}
              </span>
              <span style={{ fontFamily: theme.fonts.numeral, fontSize: "0.85em", fontWeight: 700, color: highlight }}>
                {fmtSqft(totalSqft)}
              </span>
              <span style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: "0.6em", color: theme.color.panelMuted }}>
                across {zones.length} zone{zones.length === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {zones.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ fontSize: "0.7em", color: theme.color.muted }}>Add zones in the inspector (or pull them from the project rooms).</p>
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

// ─── Layout B: Side Ledger ───────────────────────────────────────────────────
// Plan left (framed), numbered ledger cards stacked right, total band below.

function SideLedgerLayout({ slide, branding, hasAiBackground, content, zones }: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const highlight = content.highlightColor ?? accent;
  const ink = theme.color.ink;
  const zScale = content.zoneTextSize ?? 1.0;
  const pinScale = content.pinSize ?? 1.0;
  const hasBg = !!hasAiBackground;
  const totalSqft = zones.reduce((s, z) => s + (z.sqft ?? 0), 0);

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <FpHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "2.5%", marginTop: "0.5%" }}>
          {/* Plan, framed */}
          <div style={{ position: "relative", width: "58%", border: `1px solid ${theme.color.line}`, background: "#FFFFFF" }}>
            <PlanArt content={content} zones={zones} highlight={highlight} pinScale={pinScale} />
          </div>

          {/* Ledger */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.55em", minHeight: 0 }}>
            {zones.map((z) => (
              <div
                key={z.id}
                style={{
                  display: "flex",
                  gap: "0.6em",
                  alignItems: "flex-start",
                  background: theme.key === "blueprint" ? "#FFFFFF" : "#F4EFE5",
                  border: `1px solid ${theme.color.line}`,
                  padding: "0.55em 0.7em",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: `${1.4 * pinScale}em`,
                    height: `${1.4 * pinScale}em`,
                    borderRadius: "50%",
                    background: highlight,
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: `${0.65 * pinScale}em`,
                    fontWeight: 700,
                  }}
                >
                  {z.number}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5em", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.64 * zScale}em`, fontWeight: 700, color: ink, lineHeight: 1.3 }}>
                      {z.label}
                    </span>
                    {(content.showSqft ?? true) && z.sqft != null && (
                      <span style={{ fontFamily: theme.fonts.numeral, fontSize: `${0.66 * zScale}em`, fontWeight: 700, color: highlight }}>
                        {fmtSqft(z.sqft)}
                      </span>
                    )}
                  </div>
                  {z.description && (
                    <div style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.52 * zScale}em`, color: theme.color.muted, lineHeight: 1.45, marginTop: "0.2em", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}>
                      {z.description}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {zones.length === 0 && (
              <p style={{ fontSize: "0.7em", color: theme.color.muted, margin: "auto" }}>
                Add zones in the inspector (or pull them from the project rooms).
              </p>
            )}

            <div style={{ flex: 1 }} />

            {totalSqft > 0 && (content.showTotal ?? true) && (
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.6em", background: theme.color.panel, color: theme.color.panelInk, padding: "0.55em 0.8em" }}>
                <span style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: "0.58em", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {content.totalLabel ?? "Total renovation footprint"}
                </span>
                <span style={{ fontFamily: theme.fonts.numeral, fontSize: "0.95em", fontWeight: 700, color: highlight }}>
                  {fmtSqft(totalSqft)}
                </span>
              </div>
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

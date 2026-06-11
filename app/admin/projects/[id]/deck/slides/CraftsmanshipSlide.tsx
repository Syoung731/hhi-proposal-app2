"use client";

/**
 * Craftsmanship ("Materials & Assembly Standards") slide — proof of build
 * quality instead of claims. Modeled on 60-leamington p07 ("Built to Last":
 * standards columns + macro-photo collage) and 19-oyster p05 (annotated
 * craftsmanship collage with leader-line callouts).
 *
 * Layouts:
 *  - standards-grid (default): two titled standards columns + up to 6 macro
 *    detail photos in a collage. Works instantly with the default copy.
 *  - annotated-photo: one hero photo with leader-line callout cards pinned
 *    to the exact details (dovetails, seams, reveals).
 */

import type { ProposalSlide, DeckBranding, CraftsmanshipContent, CraftsmanshipItem } from "@/app/lib/deck/types";
import { HHI_DEFAULT_CRAFTSMANSHIP_ITEMS, CRAFTSMANSHIP_DEFAULTS } from "@/app/lib/craftsmanship-defaults";
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

export function CraftsmanshipSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as CraftsmanshipContent;
  const layoutKey = slide.layoutKey as string;
  const items = (content.items && content.items.length > 0 ? content.items : HHI_DEFAULT_CRAFTSMANSHIP_ITEMS).slice(0, 8);

  const common = { slide, branding, hasAiBackground, content, items };
  switch (layoutKey) {
    case "annotated-photo":
      return <AnnotatedPhotoLayout {...common} />;
    case "standards-grid":
    default:
      return <StandardsGridLayout {...common} />;
  }
}

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
  content: CraftsmanshipContent;
  items: CraftsmanshipItem[];
}

function CsHeader({ slide, content, accent, ink, theme }: { slide: ProposalSlide; content: CraftsmanshipContent; accent: string; ink: string; theme: ReturnType<typeof useDeckTheme> }) {
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
          {content.sectionLabel ?? CRAFTSMANSHIP_DEFAULTS.sectionLabel}
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
        {slide.headline ?? CRAFTSMANSHIP_DEFAULTS.headline}
      </h2>
      <TitleAccentRule accentColor={accent} marginTop="0.3em" marginBottom="0" />
      {content.introText !== null && (content.introText ?? CRAFTSMANSHIP_DEFAULTS.introText) && (
        <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: "0.66em", color: theme.color.muted, marginTop: "0.6em", lineHeight: 1.5, maxWidth: "75%" }}>
          {content.introText ?? CRAFTSMANSHIP_DEFAULTS.introText}
        </p>
      )}
    </div>
  );
}

// ─── Layout A: Standards Grid ────────────────────────────────────────────────

function StandardsGridLayout({ slide, branding, hasAiBackground, content, items }: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const scale = content.itemTextSize ?? 1.0;
  const hasBg = !!hasAiBackground;

  // Split items into the two titled columns: explicit column wins, else half/half.
  const explicitA = items.filter((it) => it.column === "a");
  const explicitB = items.filter((it) => it.column === "b");
  const unassigned = items.filter((it) => it.column !== "a" && it.column !== "b");
  const half = Math.ceil((explicitA.length + explicitB.length + unassigned.length) / 2);
  const colA = [...explicitA];
  const colB = [...explicitB];
  for (const it of unassigned) (colA.length < half ? colA : colB).push(it);

  const photos = (content.collagePhotos ?? []).filter(Boolean).slice(0, 6);

  const renderColumn = (title: string, col: CraftsmanshipItem[]) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontFamily: theme.fonts.headline, fontSize: `${0.95 * scale}em`, fontWeight: 700, color: ink, lineHeight: 1.2 }}>{title}</p>
      <div aria-hidden style={{ width: "1.8em", height: "0.14em", background: accent, margin: "0.35em 0 0.75em" }} />
      {col.map((it, i) => (
        <div key={it.id} style={{ borderTop: i > 0 ? `1px solid ${theme.color.line}` : undefined, padding: i > 0 ? "0.7em 0" : "0 0 0.7em" }}>
          <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.72 * scale}em`, fontWeight: 700, color: ink, lineHeight: 1.35 }}>{it.title}</p>
          <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.6 * scale}em`, color: theme.color.muted, lineHeight: 1.55, marginTop: "0.25em" }}>{it.description}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CsHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "3%", marginTop: "1%" }}>
          {/* Standards columns — without photos, rein the width in so the
              slide doesn't read as abandoned white space */}
          <div style={{ width: photos.length > 0 ? "55%" : "78%", display: "flex", gap: "4%" }}>
            {renderColumn(content.columnATitle ?? CRAFTSMANSHIP_DEFAULTS.columnATitle, colA)}
            {renderColumn(content.columnBTitle ?? CRAFTSMANSHIP_DEFAULTS.columnBTitle, colB)}
          </div>

          {/* Macro photo collage */}
          {photos.length > 0 && (
            <div
              style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: photos.length === 1 ? "1fr" : "1fr 1fr",
                gridAutoRows: "1fr",
                gap: "0.45em",
                minHeight: 0,
              }}
            >
              {photos.map((url, i) => (
                <div key={i} style={{ position: "relative", overflow: "hidden", border: `1px solid ${theme.color.line}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
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

// ─── Layout B: Annotated Photo ───────────────────────────────────────────────
// Hero photo with leader-line callout cards pinned to exact details.

const CS_CARD_W = 24; // % card column width
const CS_PHOTO_LEFT = CS_CARD_W + 2;
const CS_PHOTO_W = 100 - 2 * (CS_CARD_W + 2);

function AnnotatedPhotoLayout({ slide, branding, hasAiBackground, content, items }: LayoutProps) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const ink = theme.color.ink;
  const scale = content.itemTextSize ?? 1.0;
  const pinScale = content.pinSize ?? 1.0;
  const hasBg = !!hasAiBackground;

  const shown = items.slice(0, 6);
  const placed = shown.map((it, i) => ({ it, side: it.side ?? ((i % 2 === 0 ? "left" : "right") as "left" | "right") }));
  const leftCards = placed.filter((p) => p.side === "left");
  const rightCards = placed.filter((p) => p.side === "right");
  const slotY = (i: number, n: number) => (n <= 1 ? 50 : 14 + (i * 72) / (n - 1));

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const col of [leftCards, rightCards]) {
    col.forEach((p, i) => {
      if (p.it.pinX == null || p.it.pinY == null) return;
      const cardX = p.side === "left" ? CS_CARD_W : 100 - CS_CARD_W;
      lines.push({
        x1: cardX,
        y1: slotY(i, col.length),
        x2: CS_PHOTO_LEFT + (p.it.pinX / 100) * CS_PHOTO_W,
        y2: p.it.pinY,
      });
    });
  }

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasBg ? "transparent" : theme.color.surface }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CsHeader slide={slide} content={content} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, position: "relative", marginTop: "0.5%" }}>
          {/* Hero photo */}
          <div style={{ position: "absolute", left: `${CS_PHOTO_LEFT}%`, top: 0, width: `${CS_PHOTO_W}%`, height: "100%", overflow: "hidden", border: `1px solid ${theme.color.line}`, background: theme.color.panel }}>
            {content.heroPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={content.heroPhoto} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: "0.65em", color: theme.color.panelMuted, textAlign: "center", maxWidth: "70%" }}>
                  Pick a finished-detail photo in the inspector, then place a pin for each standard.
                </p>
              </div>
            )}
            {placed.map((p, idx) =>
              p.it.pinX != null && p.it.pinY != null ? (
                <NumberPin key={p.it.id} x={p.it.pinX} y={p.it.pinY} number={idx + 1} color={accent} scale={pinScale} />
              ) : null
            )}
          </div>

          <LeaderOverlay lines={lines} color={accent} />

          {/* Callout cards */}
          {[
            { col: leftCards, left: 0 },
            { col: rightCards, left: 100 - CS_CARD_W },
          ].map(({ col, left }) =>
            col.map((p, i) => (
              <div
                key={p.it.id}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: `${slotY(i, col.length)}%`,
                  transform: "translateY(-50%)",
                  width: `${CS_CARD_W}%`,
                  background: "#FFFFFF",
                  border: `1px solid ${theme.color.line}`,
                  boxShadow: "0 2px 8px rgba(26,35,50,0.10)",
                  padding: "0.55em 0.7em",
                  zIndex: 4,
                }}
              >
                <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.58 * scale}em`, fontWeight: 700, color: ink, lineHeight: 1.35 }}>{p.it.title}</p>
                <p style={{ fontFamily: content.bodyFont ?? theme.fonts.body, fontSize: `${0.5 * scale}em`, color: theme.color.muted, lineHeight: 1.45, marginTop: "0.2em" }}>{p.it.description}</p>
              </div>
            ))
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

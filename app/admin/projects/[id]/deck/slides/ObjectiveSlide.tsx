"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ObjectiveContent,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

/** Convert a hex color + 0-100 opacity into a CSS rgba string. */
function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

/** Build inline style for B/I/U fields */
function biuStyle(
  bold?: boolean | null,
  italic?: boolean | null,
  underline?: boolean | null,
  defaultBold?: boolean,
): React.CSSProperties {
  return {
    fontWeight: (bold ?? defaultBold) ? 700 : undefined,
    fontStyle: italic ? "italic" : undefined,
    textDecoration: underline ? "underline" : undefined,
  };
}

// ─── Shared text-block content renderer ───────────────────────────────────────

function TextContent({
  slide, branding, content,
  headlineColor, headlineShadow, headlineEm,
  statementColor, statementShadow, statementEm,
  supportingColor, supportingEm,
  bulletColor,
  showStatement = true,
  showSupporting = true,
  showBullets = true,
  bulletLayout = "list",
  headlineStyle = "large",
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  content: ObjectiveContent;
  headlineColor: string;
  headlineShadow: string | undefined;
  headlineEm: number;
  statementColor: string;
  statementShadow: string | undefined;
  statementEm: number;
  supportingColor: string;
  supportingEm: number;
  bulletColor: string;
  showStatement?: boolean;
  showSupporting?: boolean;
  showBullets?: boolean;
  bulletLayout?: "list" | "row" | "row3";
  headlineStyle?: "large" | "uppercase";
}) {
  const accent = content.accentColor ?? branding.accentColor;
  const bullets = (content.bullets ?? []).filter(Boolean);

  const supportingTextFont = content.supportingTextFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const bulletsFont = content.bulletsFont ?? supportingTextFont;
  const bulletsEm = content.bulletsSize ?? supportingEm;
  const bulletIconClr = content.bulletIconColor ?? accent;
  const statementFont = content.statementFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;

  return (
    <>
      {/* Headline */}
      {headlineStyle === "uppercase" ? (
        <p
          className="uppercase tracking-widest"
          style={{
            fontSize: `${0.65 * headlineEm}em`, fontWeight: (content.headlineBold ?? true) ? 700 : 600,
            fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
            color: headlineColor, letterSpacing: "0.18em",
            marginBottom: "3%", textShadow: headlineShadow,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
          }}
        >
          {slide.headline || "Project Objective"}
        </p>
      ) : (
        <>
          <h1
            className="font-serif"
            style={{
              fontSize: `${3.2 * headlineEm}em`,
              fontWeight: (content.headlineBold ?? true) ? 800 : 400,
              fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              color: headlineColor, lineHeight: 1.1,
              marginBottom: "2%", textShadow: headlineShadow,
              fontStyle: content.headlineItalic ? "italic" : undefined,
              textDecoration: content.headlineUnderline ? "underline" : undefined,
            }}
          >
            {slide.headline || "Project Objective"}
          </h1>
        </>
      )}

      {/* Accent rule */}
      <TitleAccentRule accentColor={accent} marginBottom="3%" />

      {/* Statement */}
      {showStatement && content.statementText && (
        <p
          className="font-serif"
          style={{
            fontSize: `${statementEm}em`,
            fontWeight: (content.statementBold ?? true) ? 600 : 400,
            fontFamily: statementFont,
            color: statementColor, lineHeight: 1.45,
            marginBottom: "3%", textShadow: statementShadow,
            fontStyle: content.statementItalic ? "italic" : undefined,
            textDecoration: content.statementUnderline ? "underline" : undefined,
          }}
        >
          {content.statementText}
        </p>
      )}

      {/* Supporting */}
      {showSupporting && content.supportingText && (
        <p style={{
          fontSize: `${supportingEm}em`,
          fontFamily: supportingTextFont,
          color: supportingColor, lineHeight: 1.65, marginBottom: "3%",
          textShadow: makeOutlineShadow(content.supportingOutline),
          ...biuStyle(content.supportingBold, content.supportingItalic, content.supportingUnderline),
        }}>
          {content.supportingText}
        </p>
      )}

      {/* Bullets */}
      {showBullets && bullets.length > 0 && (
        bulletLayout === "list" ? (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5em" }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.6em" }}>
                <span style={{ flexShrink: 0, width: "0.5em", height: "0.5em", background: bulletIconClr, borderRadius: "50%", marginTop: "0.45em", display: "block" }} />
                <span style={{
                  fontSize: `${bulletsEm}em`,
                  fontFamily: bulletsFont,
                  color: bulletColor, lineHeight: 1.5,
                  textShadow: makeOutlineShadow(content.bulletsOutline),
                  ...biuStyle(content.bulletsBold, content.bulletsItalic, content.bulletsUnderline),
                }}>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ display: "flex", gap: "5%" }}>
            {bullets.slice(0, 3).map((b, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ borderTop: `2px solid ${accent}`, paddingTop: "0.55em", marginBottom: "0.4em" }} />
                <p style={{
                  fontSize: `${bulletsEm * 0.88}em`,
                  fontFamily: bulletsFont,
                  color: bulletColor, lineHeight: 1.5,
                  textShadow: makeOutlineShadow(content.bulletsOutline),
                  ...biuStyle(content.bulletsBold, content.bulletsItalic, content.bulletsUnderline),
                }}>{b}</p>
              </div>
            ))}
          </div>
        )
      )}
    </>
  );
}

// ─── Shared: build positioned text block with optional card ───────────────────
function positionedBlock(
  textX: number, textY: number,
  maxWidth: string,
  showCard: boolean,
  cardBg: string,
  children: React.ReactNode,
): React.ReactNode {
  return (
    <div
      style={{
        position: "absolute",
        left: `${textX * 100}%`,
        top: `${textY * 100}%`,
        width: maxWidth,
        zIndex: 2,
      }}
    >
      <div
        style={{
          background: showCard ? cardBg : "transparent",
          borderRadius: showCard ? 10 : 0,
          padding: showCard ? "5% 6%" : 0,
          backdropFilter: showCard ? "none" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── 1. Light Statement (renamed from Statement Left) ────────────────────────
function LightStatementLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? "#B8860B";
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  const headlineEm    = content.headlineSize    ?? 1.0;
  // Layout-aware default: Light Statement → navy
  const headlineColor = content.headlineColor   ?? "#1B2A4A";
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const statementEm   = content.statementSize   ?? 1.05;
  const statementColor = content.statementColor ?? branding.textColor;
  const statementShadow = makeOutlineShadow(content.statementOutline);
  const supportingEm  = content.supportingSize  ?? 0.82;
  const supportingColor = content.supportingColor ?? "#4B5563";
  const bulletColor   = content.bulletColor     ?? "#374151";
  const textX         = content.textX           ?? 0.06;
  const textY         = content.textY           ?? 0.08;
  const textWidth     = content.textWidth       ?? 42;
  const showCard      = content.showCard        ?? false;
  const cardBg        = hexToRgba(content.cardColor ?? "#000000", content.cardOpacity ?? 60);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: hasBg ? "transparent" : "#FAFAF8",
        backgroundImage: hasBg ? undefined : `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg stroke='%23CBD5E1' stroke-width='0.4' opacity='0.5'%3E%3Cpath d='M0 0h60v60H0z' stroke-dasharray='2,6'/%3E%3Cpath d='M0 30h60M30 0v60' stroke-dasharray='2,6'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      {positionedBlock(textX, textY, `${textWidth}%`, showCard, cardBg,
        <TextContent
          slide={slide} branding={branding} content={content}
          headlineColor={headlineColor} headlineShadow={headlineShadow} headlineEm={headlineEm}
          statementColor={statementColor} statementShadow={statementShadow} statementEm={statementEm}
          supportingColor={supportingColor} supportingEm={supportingEm}
          bulletColor={bulletColor}
          bulletLayout="list"
          headlineStyle="large"
        />
      )}

      {/* Footer rule — only when no background */}
      {!hasBg && (
        <div style={{ position: "absolute", bottom: "3%", left: "6%", right: "6%", borderTop: `1px solid ${accent}40`, paddingTop: "1%" }}>
          <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>{branding.address ?? ""}</span>
        </div>
      )}

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

// ─── 2. Dark Statement ───────────────────────────────────────────────────────
function DarkStatementLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? "#B8860B";
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const proofPoints = (content.bullets ?? []).filter(Boolean);

  const headlineEm    = content.headlineSize    ?? 1.0;
  // Layout-aware default: Dark Statement → white
  const headlineColor = content.headlineColor   ?? "#FFFFFF";
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const statementEm   = content.statementSize   ?? 1.55;
  const statementColor = content.statementColor ?? "#FFFFFF";
  const statementShadow = makeOutlineShadow(content.statementOutline);
  const supportingEm  = content.supportingSize  ?? 0.70;
  const supportingColor = content.supportingColor ?? "#CBD5E1";
  const bulletColor   = content.bulletColor     ?? "#CBD5E1";
  const textX         = content.textX           ?? 0.06;
  const textY         = content.textY           ?? 0.08;
  const textWidth     = content.textWidth       ?? 88;
  const showCard      = content.showCard        ?? false;
  const cardBg        = hexToRgba(content.cardColor ?? "#000000", content.cardOpacity ?? 60);

  const supportingTextFont = content.supportingTextFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const bulletsFont = content.bulletsFont ?? supportingTextFont;
  const bulletsEm = content.bulletsSize ?? supportingEm;
  const bulletIconClr = content.bulletIconColor ?? accent;
  const statementFont = content.statementFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: hasBg ? "transparent" : "#152B45" }}
    >
      {positionedBlock(textX, textY, `${textWidth}%`, showCard, cardBg,
        <>
          {/* Small uppercase headline */}
          <p
            className="uppercase tracking-widest"
            style={{
              fontSize: `${0.65 * headlineEm}em`,
              fontWeight: (content.headlineBold ?? true) ? 700 : 600,
              fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              color: headlineColor, letterSpacing: "0.18em",
              marginBottom: "4%", textShadow: headlineShadow,
              fontStyle: content.headlineItalic ? "italic" : undefined,
              textDecoration: content.headlineUnderline ? "underline" : undefined,
            }}
          >
            {slide.headline || "Project Objective"}
          </p>

          {/* Corner-bracketed statement */}
          <div style={{ position: "relative", padding: "6% 5%" }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: "2em", height: "2em", borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
            <div style={{ position: "absolute", top: 0, right: 0, width: "2em", height: "2em", borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, width: "2em", height: "2em", borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}` }} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: "2em", height: "2em", borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}` }} />

            <p
              className="font-serif"
              style={{
                fontSize: `${statementEm}em`, color: statementColor,
                fontFamily: statementFont,
                lineHeight: 1.4, textAlign: "center",
                fontWeight: (content.statementBold ?? false) ? 700 : 400,
                textShadow: statementShadow,
                fontStyle: content.statementItalic ? "italic" : undefined,
                textDecoration: content.statementUnderline ? "underline" : undefined,
              }}
            >
              {content.statementText || "Our objective is to deliver exceptional results for your project."}
            </p>
          </div>

          {/* Proof points */}
          {proofPoints.length > 0 && (
            <>
              <div style={{ height: 1, background: `${accent}50`, margin: "4% 0 3%" }} />
              <div style={{ display: "flex", gap: "5%" }}>
                {proofPoints.slice(0, 3).map((pt, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: "0.6em" }}>
                    <span style={{ flexShrink: 0, width: "0.5em", height: "0.5em", minWidth: "0.5em", background: bulletIconClr, marginTop: "0.38em", display: "block" }} />
                    <p style={{
                      fontSize: `${bulletsEm}em`,
                      fontFamily: bulletsFont,
                      color: bulletColor, lineHeight: 1.45,
                      textShadow: makeOutlineShadow(content.bulletsOutline),
                      ...biuStyle(content.bulletsBold, content.bulletsItalic, content.bulletsUnderline),
                    }}>{pt}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── 3. Pillar Layout (new Phase 8A structured objective) ─────────────────────

function PillarLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? branding.accentColor;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  // Fall back to statementText when `objective` is absent (lets legacy data
  // benefit from the pillar layout once pillars are set).
  const objective = (content.objective ?? content.statementText ?? "").trim();
  const pillars = (content.pillars ?? []).slice(0, 3);

  const headlineColor = content.headlineColor ?? "#1B2A4A";
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const objectiveColor = content.statementColor ?? "#1A2332";
  const pillarTitleColor = content.headlineColor ?? "#1B2A4A";
  const pillarBodyColor = content.supportingColor ?? "#374151";

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: hasBg ? "transparent" : "#FAFAF8",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "6%",
          top: "8%",
          right: "6%",
          bottom: "8%",
          display: "flex",
          flexDirection: "column",
          zIndex: 2,
        }}
      >
        {/* Headline */}
        <h1
          className="font-serif"
          style={{
            fontSize: "2.4em",
            fontWeight: (content.headlineBold ?? true) ? 700 : 400,
            fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
            color: headlineColor,
            lineHeight: 1.1,
            marginBottom: "1.8%",
            textShadow: headlineShadow,
            fontStyle: content.headlineItalic ? "italic" : undefined,
          }}
        >
          {slide.headline || "Project Objective"}
        </h1>

        <TitleAccentRule accentColor={accent} marginBottom="3%" />

        {/* Short objective paragraph */}
        {objective && (
          <p
            className="font-serif"
            style={{
              fontSize: "1.1em",
              color: objectiveColor,
              lineHeight: 1.55,
              marginBottom: "5%",
              maxWidth: "82%",
              fontWeight: 400,
            }}
          >
            {objective}
          </p>
        )}

        {/* 3-column pillar grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "4%",
            marginTop: "auto",
          }}
        >
          {pillars.map((pillar, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  borderTop: `3px solid ${accent}`,
                  paddingTop: "0.8em",
                  marginBottom: "0.6em",
                }}
              />
              <h3
                className="font-serif"
                style={{
                  fontSize: "1.15em",
                  fontWeight: 700,
                  color: pillarTitleColor,
                  lineHeight: 1.2,
                  marginBottom: "0.5em",
                  fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
                }}
              >
                {pillar.title}
              </h3>
              <p
                style={{
                  fontSize: "0.78em",
                  color: pillarBodyColor,
                  lineHeight: 1.55,
                  fontFamily: content.supportingTextFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                }}
              >
                {pillar.body}
              </p>
            </div>
          ))}
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

// ─── Router ───────────────────────────────────────────────────────────────────

export function ObjectiveSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;

  // New structured layout: if exactly 3 valid pillars are present, render the
  // Pillar layout regardless of the stored layoutKey. This makes the upgrade
  // implicit — once pillars arrive on the slide, the user sees the new UI.
  const pillars = content.pillars ?? [];
  if (
    pillars.length === 3 &&
    pillars.every((p) => p?.title?.trim() && p?.body?.trim())
  ) {
    return <PillarLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }

  // Migration fallbacks: map removed/renamed layouts to their replacements
  const layout = slide.layoutKey;
  const effectiveLayout =
    layout === "statement-left"     ? "light-statement" :
    layout === "executive-summary"  ? "light-statement" :
    layout === "blueprint-overlay"  ? "light-statement" :
    layout;

  switch (effectiveLayout) {
    case "dark-statement":
      return <DarkStatementLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "light-statement":
    default:
      return <LightStatementLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

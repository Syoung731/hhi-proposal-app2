"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ObjectiveContent,
  ObjectivePillar,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { ScopeIcon } from "./shared/ScopeIcons";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";
import { useDeckTheme } from "@/app/lib/deck/theme-context";

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

// LEGACY: pre-pillar Objective layout. Only routed to when no valid pillars exist; superseded by PillarLayout. Remove with the Statement mode toggle in cleanup pass.
// ─── 1. Light Statement (renamed from Statement Left) ────────────────────────
function LightStatementLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? branding.accentColor;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  const headlineEm    = content.headlineSize    ?? 1.0;
  // Layout-aware default: Light Statement → navy
  const headlineColor = content.headlineColor   ?? branding.textColor;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const statementEm   = content.statementSize   ?? 1.05;
  const statementColor = content.statementColor ?? branding.textColor;
  const statementShadow = makeOutlineShadow(content.statementOutline);
  const supportingEm  = content.supportingSize  ?? 0.82;
  const supportingColor = content.supportingColor ?? "#4B5563";
  const bulletColor   = content.bulletColor     ?? "#374151";
  const textX         = content.textX           ?? 0.06;
  const textY         = content.textY           ?? 0.08;
  // Default 88% matches DarkStatementLayout. The previous 42% default was
  // designed around a hero image on the right half of the slide, but that
  // pattern is rarely used for Objective slides, so a full-width default
  // fills the slide instead of leaving the right half empty.
  const textWidth     = content.textWidth       ?? 88;
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

// LEGACY: pre-pillar Objective layout. Only routed to when slide.layoutKey === "dark-statement"; superseded by PillarLayout. Remove with the Statement mode toggle in cleanup pass.
// ─── 2. Dark Statement ───────────────────────────────────────────────────────
function DarkStatementLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? branding.accentColor;
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
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? branding.accentColor;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  // Fall back to statementText when `objective` is absent (lets legacy data
  // benefit from the pillar layout once pillars are set).
  const objective = (content.objective ?? content.statementText ?? "").trim();
  const pillars = (content.pillars ?? []).slice(0, 5);
  // Highlight bullets fill the middle of the slide between the opener and
  // the 3 pillars. Sourced from Project.bullets via the deck hydration in
  // app/admin/projects/[id]/deck/page.tsx.
  const bullets = (content.bullets ?? []).filter(Boolean).slice(0, 6);

  const headlineColor = content.headlineColor ?? theme.color.ink;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);

  // Objective opener typography
  const objectiveFont = content.objectiveFont ?? content.headlineFont ?? theme.fonts.headline;
  const objectiveColor = content.objectiveColor ?? content.statementColor ?? theme.color.ink;
  const objectiveEm = (content.objectiveSize ?? 1.0) * 1.1;

  // Pillar title + body typography
  const pillarTitleFont = content.pillarTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const pillarTitleColor = content.pillarTitleColor ?? content.headlineColor ?? theme.color.ink;
  const pillarTitleEm = (content.pillarTitleSize ?? 1.0) * 1.15;
  const pillarBodyFont = content.pillarBodyFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const pillarBodyColor = content.pillarBodyColor ?? content.supportingColor ?? theme.color.muted;
  const pillarBodyEm = (content.pillarBodySize ?? 1.0) * 0.78;

  // Bullets typography (already wired in earlier task)
  const bulletBodyFont = content.bulletsFont ?? content.supportingTextFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const bulletTextColor = content.bulletColor ?? pillarBodyColor;
  const bulletIconClr = content.bulletIconColor ?? accent;
  const bulletsEm = (content.bulletsSize ?? 1.0) * 0.95;

  // Text Position + Card controls from the inspector. Defaults match the
  // legacy hardcoded box so existing slides render identically until the
  // user actually drags a slider.
  const textX = content.textX ?? 0.06;
  const textY = content.textY ?? 0.08;
  const textWidth = content.textWidth ?? 88;
  const showCard = content.showCard ?? false;
  const cardBg = hexToRgba(content.cardColor ?? "#000000", content.cardOpacity ?? 60);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        background: hasBg ? "transparent" : theme.color.surface,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${textX * 100}%`,
          top: `${textY * 100}%`,
          width: `${textWidth}%`,
          bottom: "8%",
          zIndex: 2,
        }}
      ><div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: showCard ? cardBg : "transparent",
          borderRadius: showCard ? 10 : 0,
          padding: showCard ? "4% 5%" : 0,
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: "2.4em",
            fontWeight: (content.headlineBold ?? true) ? 700 : 400,
            fontFamily: content.headlineFont ?? theme.fonts.headline,
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
            style={{
              fontSize: `${objectiveEm}em`,
              color: objectiveColor,
              lineHeight: 1.55,
              marginBottom: bullets.length > 0 ? "3%" : "5%",
              maxWidth: "82%",
              fontFamily: objectiveFont,
              textShadow: makeOutlineShadow(content.objectiveOutline),
              ...biuStyle(content.objectiveBold, content.objectiveItalic, content.objectiveUnderline),
            }}
          >
            {renderEmphasis(objective)}
          </p>
        )}

        {/* Project highlight bullets — fill the middle of the slide. */}
        {bullets.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              marginBottom: "4%",
              display: "flex",
              flexDirection: "column",
              gap: "0.55em",
              maxWidth: "88%",
            }}
          >
            {bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.7em" }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: "0.45em",
                    height: "0.45em",
                    background: bulletIconClr,
                    borderRadius: "50%",
                    marginTop: "0.55em",
                    display: "block",
                  }}
                />
                <span
                  style={{
                    fontSize: `${bulletsEm}em`,
                    color: bulletTextColor,
                    lineHeight: 1.55,
                    fontFamily: bulletBodyFont,
                    textShadow: makeOutlineShadow(content.bulletsOutline),
                    ...biuStyle(content.bulletsBold, content.bulletsItalic, content.bulletsUnderline),
                  }}
                >
                  {b}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 3-column pillar grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(Math.max(pillars.length, 1), 4)}, 1fr)`,
            gap: "4%",
            marginTop: "auto",
          }}
        >
          {pillars.map((pillar, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column" }}>
              {pillar.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pillar.imageUrl} alt="" style={{ width: "100%", maxWidth: "9em", height: "5em", objectFit: "contain", objectPosition: "left", marginBottom: "0.5em" }} />
              ) : pillar.icon ? (
                <ScopeIcon name={pillar.icon} size={30} color={accent} strokeWidth={1.6} style={{ marginBottom: "0.5em" }} />
              ) : null}
              <div
                style={{
                  borderTop: `3px solid ${accent}`,
                  paddingTop: "0.8em",
                  marginBottom: "0.6em",
                }}
              />
              <h3
                style={{
                  fontSize: `${pillarTitleEm}em`,
                  color: pillarTitleColor,
                  lineHeight: 1.2,
                  marginBottom: "0.5em",
                  fontFamily: pillarTitleFont,
                  fontWeight: (content.pillarTitleBold ?? true) ? 700 : 400,
                  fontStyle: content.pillarTitleItalic ? "italic" : undefined,
                  textDecoration: content.pillarTitleUnderline ? "underline" : undefined,
                  textShadow: makeOutlineShadow(content.pillarTitleOutline),
                }}
              >
                {pillar.title}
              </h3>
              <p
                style={{
                  fontSize: `${pillarBodyEm}em`,
                  color: pillarBodyColor,
                  lineHeight: 1.55,
                  fontFamily: pillarBodyFont,
                  textShadow: makeOutlineShadow(content.pillarBodyOutline),
                  ...biuStyle(content.pillarBodyBold, content.pillarBodyItalic, content.pillarBodyUnderline),
                }}
              >
                {pillar.body}
              </p>
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

// ─── Hub-and-Spoke layout (94 Coggins style) ──────────────────────────────────
// Center subject icon with accent arrows radiating to three "zone" clusters
// (left, right, bottom). Reuses the 3 pillars as the zones.

/** Render text with **bold** spans (lightweight inline emphasis). */
function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function HubZone({
  pillar,
  accent,
  ink,
  muted,
  bodyFont,
  align,
  scale = 1,
}: {
  pillar: ObjectivePillar;
  accent: string;
  ink: string;
  muted: string;
  bodyFont: string;
  align: "left" | "right" | "center";
  scale?: number;
}) {
  const alignItems = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  return (
    <div style={{ textAlign: align, display: "flex", flexDirection: "column", alignItems }}>
      {pillar.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pillar.imageUrl} alt="" style={{ width: "100%", maxWidth: `${12 * scale}em`, height: `${6.6 * scale}em`, objectFit: "contain", objectPosition: align === "right" ? "right" : align === "center" ? "center" : "left", marginBottom: "0.6em" }} />
      ) : pillar.icon ? (
        <ScopeIcon name={pillar.icon} size={Math.round(44 * scale)} color={ink} strokeWidth={1.5} style={{ marginBottom: "0.5em" }} />
      ) : null}
      <p style={{ fontSize: `${0.82 * scale}em`, fontFamily: bodyFont, fontWeight: 700, color: accent, margin: 0, lineHeight: 1.2 }}>
        {pillar.title}
      </p>
      <p style={{ fontSize: `${0.7 * scale}em`, fontFamily: bodyFont, color: muted, margin: "0.25em 0 0", lineHeight: 1.45, maxWidth: "15em" }}>
        {pillar.body}
      </p>
    </div>
  );
}

function HubSpokeLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ObjectiveContent;
  const accent = content.accentColor ?? branding.accentColor;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;
  const ink = content.headlineColor ?? theme.color.ink;
  const muted = theme.color.muted;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const headlineFont = content.headlineFont ?? theme.fonts.headline;
  const objective = (content.objective ?? content.statementText ?? "").trim();
  const pillars = (content.pillars ?? []).slice(0, 6);
  const gridLine = "rgba(26,35,50,0.06)";

  // Tunable geometry (inspector sliders).
  const hubSizeM = content.hubSize ?? 1;
  const zoneScale = content.zoneTextSize ?? 1;
  const hubYpct = content.hubY ?? 0.52;
  const hubTop = `${hubYpct * 100}%`;
  const hasHubImg = !!content.hubImageUrl;

  // Dynamic radial placement: fan the N zones across the lower arc (left →
  // bottom → right) so the layout scales from 2 to ~5 zones around the hub.
  const N = pillars.length;
  const CX = 50;
  const CY = hubYpct * 100;
  const RX = 34; // horizontal card-placement radius (%)
  const RY = 27; // vertical card-placement radius (%)
  function zoneGeom(i: number) {
    const deg = N <= 1 ? 270 : 180 + (180 * i) / (N - 1);
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad); // screen y is down
    const align: "left" | "right" | "center" =
      dx < -0.25 ? "right" : dx > 0.25 ? "left" : "center";
    return { dx, dy, align, x: CX + RX * dx, y: CY + RY * dy };
  }
  const hubVB = { x: 80, y: (CY / 100) * 90 };

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: hasBg ? "transparent" : theme.color.surface }}>
      {/* graph-paper grid (blueprint theme) */}
      {theme.surface.grid && !hasBg && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
            backgroundSize: "26px 26px",
          }}
        />
      )}

      {/* Header */}
      <div style={{ position: "absolute", left: "6%", right: "6%", top: "6%", zIndex: 3 }}>
        <h1 style={{ fontSize: "2.0em", fontWeight: (content.headlineBold ?? true) ? 700 : 400, fontFamily: headlineFont, color: ink, lineHeight: 1.1, margin: 0 }}>
          {slide.headline || "Project Objective"}
        </h1>
        {objective && (
          <p style={{ fontSize: "0.92em", fontFamily: bodyFont, color: muted, lineHeight: 1.5, margin: "0.6em 0 0", maxWidth: "82%" }}>
            {renderEmphasis(objective)}
          </p>
        )}
      </div>

      {/* Arrows (16:9 viewBox → uniform scale, no distortion) */}
      <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 160 90" preserveAspectRatio="none" style={{ zIndex: 1 }} aria-hidden>
        <defs>
          <marker id="hubArrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <path d="M0 0 L4 2 L0 4 z" fill={accent} />
          </marker>
        </defs>
        {pillars.map((_, i) => {
          const g = zoneGeom(i);
          const cardVB = { x: ((CX + RX * g.dx) / 100) * 160, y: ((CY + RY * g.dy) / 100) * 90 };
          const sx = hubVB.x + 0.2 * (cardVB.x - hubVB.x);
          const sy = hubVB.y + 0.2 * (cardVB.y - hubVB.y);
          const ex = hubVB.x + 0.6 * (cardVB.x - hubVB.x);
          const ey = hubVB.y + 0.6 * (cardVB.y - hubVB.y);
          return <line key={i} x1={sx} y1={sy} x2={ex} y2={ey} stroke={accent} strokeWidth="0.9" markerEnd="url(#hubArrow)" />;
        })}
      </svg>

      {/* Central hub */}
      {hasHubImg ? (
        <div style={{ position: "absolute", left: "50%", top: hubTop, transform: "translate(-50%, -50%)", width: `${11 * hubSizeM}em`, height: `${7.5 * hubSizeM}em`, zIndex: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={content.hubImageUrl ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
      ) : (
        <div
          style={{
            position: "absolute", left: "50%", top: hubTop, transform: "translate(-50%, -50%)",
            width: `${6.4 * hubSizeM}em`, height: `${6.4 * hubSizeM}em`, borderRadius: "50%",
            background: theme.color.panel, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
          }}
        >
          <ScopeIcon name={content.hubIcon ?? "house"} size={Math.round(52 * hubSizeM)} color={theme.color.panelInk} strokeWidth={1.4} />
        </div>
      )}

      {/* Zones — fanned around the hub */}
      {pillars.map((p, i) => {
        const g = zoneGeom(i);
        return (
          <div key={i} style={{ position: "absolute", left: `${g.x}%`, top: `${g.y}%`, transform: "translate(-50%, -50%)", width: "26%", zIndex: 2 }}>
            <HubZone pillar={p} accent={accent} ink={ink} muted={muted} bodyFont={bodyFont} align={g.align} scale={zoneScale} />
          </div>
        );
      })}

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

export function resolveObjectiveLayoutMode(
  content: ObjectiveContent,
): "pillars" | "statement" | "hub-spoke" {
  if (
    content.layout === "pillars" ||
    content.layout === "statement" ||
    content.layout === "hub-spoke"
  ) {
    return content.layout;
  }
  const pillars = content.pillars ?? [];
  const pillarsValid =
    pillars.length >= 2 &&
    pillars.length <= 6 &&
    pillars.every((p) => p?.title?.trim() && p?.body?.trim());
  // Default to the hub-spoke "standard" when we have valid pillars.
  return pillarsValid ? "hub-spoke" : "statement";
}

export function ObjectiveSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const mode = resolveObjectiveLayoutMode(content);

  if (mode === "hub-spoke") {
    return <HubSpokeLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
  if (mode === "pillars") {
    return <PillarLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }

  // LEGACY: statement-mode fallback. Once Light/DarkStatementLayout are removed in the cleanup pass, this whole branch + resolveObjectiveLayoutMode collapse to "always render PillarLayout".
  if (slide.layoutKey === "dark-statement") {
    return <DarkStatementLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
  return <LightStatementLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
}

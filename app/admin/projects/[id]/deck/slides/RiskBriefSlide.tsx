"use client";

import React from "react";
import type {
  ProposalSlide,
  DeckBranding,
  RiskBriefContent,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Shared defaults ──────────────────────────────────────────────────────────

const DEFAULT_LEFT_BULLETS = [
  "Too many separate contractors means no single person is accountable.",
  "Designs get approved before anyone confirms they fit the budget.",
  "Hidden problems get discovered mid-construction, stalling everything.",
];

const DEFAULT_RIGHT_BULLETS = [
  "One team handles design and construction from start to finish.",
  "Your budget is set before a single detail is finalized.",
  "We identify and resolve potential issues before work ever begins.",
];

// ─── Two-column layout ────────────────────────────────────────────────────────

function TwoColumnLayout({
  title,
  eyebrow,
  leftHeader,
  rightHeader,
  leftBullets,
  rightBullets,
  bottomStatement,
  branding,
  hasBg,
  titleFont, titleSize, titleBold, titleItalic, titleUnderline, titleColor, titleTextOutline,
  headerFont, headerSize, headerBold, headerItalic, headerUnderline, headerTextColor, headerTextOutline,
  crossColor, checkColor, iconSize, iconOutline,
  bodySize, bodyBold, bodyItalic, bodyUnderline, bodyTextColor, bodyTextOutline,
  bottomFont, bottomSize, bottomBold, bottomItalic, bottomUnderline, bottomColor, bottomTextOutline,
  leftBoxColor,
  rightBoxColor,
  content,
}: {
  title: string;
  eyebrow?: string | null;
  leftHeader: string;
  rightHeader: string;
  leftBullets: string[];
  rightBullets: string[];
  bottomStatement: string;
  branding: DeckBranding;
  hasBg: boolean;
  titleFont: string; titleSize: number; titleBold: boolean; titleItalic: boolean; titleUnderline: boolean; titleColor: string; titleTextOutline: string | null;
  headerFont: string; headerSize: number; headerBold: boolean; headerItalic: boolean; headerUnderline: boolean; headerTextColor: string | null; headerTextOutline: string | null;
  crossColor: string | null; checkColor: string | null; iconSize: number; iconOutline: string | null;
  bodySize: number; bodyBold: boolean; bodyItalic: boolean; bodyUnderline: boolean; bodyTextColor: string | null; bodyTextOutline: string | null;
  bottomFont: string; bottomSize: number; bottomBold: boolean; bottomItalic: boolean; bottomUnderline: boolean; bottomColor: string; bottomTextOutline: string | null;
  leftBoxColor: string;
  rightBoxColor: string;
  content: RiskBriefContent;
}) {
  const titleShadow   = makeOutlineShadow(titleTextOutline);
  const headerShadow  = makeOutlineShadow(headerTextOutline);
  const iconShadow    = makeOutlineShadow(iconOutline);
  const outlineShadow = makeOutlineShadow(bodyTextOutline);
  const bottomShadow  = makeOutlineShadow(bottomTextOutline);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dot-grid watermark */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.022 }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="rb-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={branding.textColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rb-dots)" />
      </svg>

      <div
        style={{
          position: "relative", zIndex: 1, height: "100%",
          display: "flex", flexDirection: "column", padding: "5.5% 6% 5%",
        }}
      >
        {/* Title */}
        <div style={{ flexShrink: 0, marginBottom: "4%" }}>
          {(eyebrow) && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: branding.accentColor,
                marginBottom: "0.35em",
              }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            style={{
              fontSize: `${2.3 * titleSize}em`,
              fontFamily: titleFont,
              fontWeight: titleBold ? 800 : 400,
              fontStyle: titleItalic ? "italic" : undefined,
              textDecoration: titleUnderline ? "underline" : undefined,
              color: titleColor,
              lineHeight: 1.1,
              maxWidth: "75%",
              textShadow: titleShadow,
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={branding.accentColor} />
        </div>

        {/* Two-column body */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: hasBg ? "1fr 1fr" : "1fr 2px 1fr",
            gap: hasBg ? "0 3%" : "0 3%",
            overflow: "hidden",
            marginBottom: "4%",
          }}
        >
          {/* Left — problems */}
          <div
            style={{
              display: "flex", flexDirection: "column", gap: "1.2em",
              ...(hasBg ? {
                background: leftBoxColor,
                borderRadius: 8,
                padding: "5% 6%",
              } : {}),
            }}
          >
            <p
              style={{
                fontFamily: headerFont,
                fontSize: `${0.82 * headerSize}em`,
                fontWeight: headerBold ? 700 : 400,
                fontStyle: headerItalic ? "italic" : undefined,
                textDecoration: headerUnderline ? "underline" : undefined,
                color: headerTextColor ?? (hasBg ? "rgba(255,255,255,0.75)" : "#6B7280"),
                letterSpacing: "0.01em", textTransform: "uppercase",
                textShadow: headerShadow,
              }}
            >
              {leftHeader}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1em" }}>
              {leftBullets.map((bullet, i) => (
                <div key={i} style={{ display: "flex", gap: "0.75em", alignItems: "flex-start" }}>
                  <span style={{
                    flexShrink: 0, fontSize: `${0.65 * iconSize}em`, fontWeight: 700,
                    color: crossColor ?? (hasBg ? "rgba(255,255,255,0.45)" : "#9CA3AF"),
                    lineHeight: 1, marginTop: "0.3em", width: "1.1em", textAlign: "center",
                    textShadow: iconShadow,
                  }}>
                    ✕
                  </span>
                  <p style={{
                    fontSize: `${0.72 * bodySize}em`,
                    fontWeight: bodyBold ? 700 : 400,
                    fontStyle: bodyItalic ? "italic" : undefined,
                    textDecoration: bodyUnderline ? "underline" : undefined,
                    color: bodyTextColor ?? (hasBg ? "rgba(255,255,255,0.88)" : "#4B5563"),
                    lineHeight: 1.65,
                    textShadow: outlineShadow,
                  }}>{bullet}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vertical divider — only shown when no background */}
          {!hasBg && (
            <div style={{ background: `${branding.accentColor}33`, width: 2, borderRadius: 2, alignSelf: "stretch" }} />
          )}

          {/* Right — solutions */}
          <div
            style={{
              display: "flex", flexDirection: "column", gap: "1.2em",
              ...(hasBg ? {
                background: rightBoxColor,
                borderRadius: 8,
                padding: "5% 6%",
              } : {}),
            }}
          >
            <p
              style={{
                fontFamily: headerFont,
                fontSize: `${0.82 * headerSize}em`,
                fontWeight: headerBold ? 700 : 400,
                fontStyle: headerItalic ? "italic" : undefined,
                textDecoration: headerUnderline ? "underline" : undefined,
                color: headerTextColor ?? (hasBg ? "#FFFFFF" : branding.accentColor),
                letterSpacing: "0.01em", textTransform: "uppercase",
                textShadow: headerShadow,
              }}
            >
              {rightHeader}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1em" }}>
              {rightBullets.map((bullet, i) => (
                <div key={i} style={{ display: "flex", gap: "0.75em", alignItems: "flex-start" }}>
                  <span style={{
                    flexShrink: 0, fontSize: `${0.65 * iconSize}em`, fontWeight: 700,
                    color: checkColor ?? (hasBg ? "rgba(255,255,255,0.8)" : branding.accentColor),
                    lineHeight: 1, marginTop: "0.3em", width: "1.1em", textAlign: "center",
                    textShadow: iconShadow,
                  }}>
                    ✓
                  </span>
                  <p style={{
                    fontSize: `${0.72 * bodySize}em`,
                    fontWeight: bodyBold ? 700 : 500,
                    fontStyle: bodyItalic ? "italic" : undefined,
                    textDecoration: bodyUnderline ? "underline" : undefined,
                    color: bodyTextColor ?? (hasBg ? "#FFFFFF" : branding.textColor),
                    lineHeight: 1.65,
                    textShadow: outlineShadow,
                  }}>{bullet}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom statement */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${branding.accentColor}33`, paddingTop: "3%" }}>
          <p
            style={{
              fontFamily: bottomFont,
              fontSize: `${0.82 * bottomSize}em`,
              fontWeight: bottomBold ? 700 : 400,
              fontStyle: bottomItalic ? "italic" : undefined,
              textDecoration: bottomUnderline ? "underline" : undefined,
              color: bottomColor,
              lineHeight: 1.5,
              textAlign: "center",
              textShadow: bottomShadow,
            }}
          >
            {bottomStatement}
          </p>
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

// ─── Comparison-table layout ──────────────────────────────────────────────────

function ComparisonTableLayout({
  title,
  eyebrow,
  leftColHeader,
  rightColHeader,
  leftBullets,
  rightBullets,
  rowLabels,
  bottomStatement,
  branding,
  hasBg,
  titleFont, titleSize, titleBold, titleItalic, titleUnderline, titleColor, titleTextOutline,
  headerFont, headerSize, headerBold, headerItalic, headerUnderline, headerTextColor, headerTextOutline,
  crossColor, checkColor, iconSize, iconOutline,
  bodySize, bodyBold, bodyItalic, bodyUnderline, bodyTextColor, bodyTextOutline,
  bottomFont, bottomSize, bottomBold, bottomItalic, bottomUnderline, bottomColor, bottomTextOutline,
  leftBoxColor,
  rightBoxColor,
  content,
}: {
  title: string;
  eyebrow?: string | null;
  leftColHeader: string;
  rightColHeader: string;
  leftBullets: string[];
  rightBullets: string[];
  rowLabels: string[];
  bottomStatement: string;
  branding: DeckBranding;
  hasBg: boolean;
  titleFont: string; titleSize: number; titleBold: boolean; titleItalic: boolean; titleUnderline: boolean; titleColor: string; titleTextOutline: string | null;
  headerFont: string; headerSize: number; headerBold: boolean; headerItalic: boolean; headerUnderline: boolean; headerTextColor: string | null; headerTextOutline: string | null;
  crossColor: string | null; checkColor: string | null; iconSize: number; iconOutline: string | null;
  bodySize: number; bodyBold: boolean; bodyItalic: boolean; bodyUnderline: boolean; bodyTextColor: string | null; bodyTextOutline: string | null;
  bottomFont: string; bottomSize: number; bottomBold: boolean; bottomItalic: boolean; bottomUnderline: boolean; bottomColor: string; bottomTextOutline: string | null;
  leftBoxColor: string;
  rightBoxColor: string;
  content: RiskBriefContent;
}) {
  const numRows = Math.max(leftBullets.length, rightBullets.length);
  const hasLabels = rowLabels.length > 0;

  const titleShadow   = makeOutlineShadow(titleTextOutline);
  const headerShadow  = makeOutlineShadow(headerTextOutline);
  const iconShadow    = makeOutlineShadow(iconOutline);
  const outlineShadow = makeOutlineShadow(bodyTextOutline);
  const bottomShadow  = makeOutlineShadow(bottomTextOutline);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : branding.textColor, overflow: "hidden" }}
    >
      {/* Subtle white grid watermark */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="rb-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rb-grid)" />
      </svg>

      {/* Accent glow — top-right corner */}
      <div
        style={{
          position: "absolute", top: "-10%", right: "-5%",
          width: "40%", height: "55%",
          background: `radial-gradient(ellipse at top right, ${branding.accentColor}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative", zIndex: 1, height: "100%",
          display: "flex", flexDirection: "column", padding: "5% 5.5% 4%",
        }}
      >
        {/* Title */}
        <div style={{ flexShrink: 0, marginBottom: "3.5%" }}>
          {(eyebrow) && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: branding.accentColor,
                marginBottom: "0.35em",
              }}
            >
              {eyebrow}
            </p>
          )}
          <h2
            style={{
              fontSize: `${2.3 * titleSize}em`,
              fontFamily: titleFont,
              fontWeight: titleBold ? 800 : 400,
              fontStyle: titleItalic ? "italic" : undefined,
              textDecoration: titleUnderline ? "underline" : undefined,
              color: titleColor,
              lineHeight: 1.2,
              maxWidth: "80%",
              textShadow: titleShadow,
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={branding.accentColor} />
        </div>

        {/* Comparison table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: hasLabels ? "19% 1fr 1fr" : "1fr 1fr",
              gridTemplateRows: `auto repeat(${numRows}, 1fr)`,
              borderRadius: 8,
              overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* ── Header row ── */}
            {hasLabels && (
              <div style={{
                background: hasBg ? leftBoxColor : "rgba(255,255,255,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                borderRight: "1px solid rgba(255,255,255,0.1)",
              }} />
            )}

            {/* Traditional column header */}
            <div
              style={{
                background: hasBg ? leftBoxColor : "rgba(255,255,255,0.06)",
                padding: "4% 5%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                borderRight: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span
                style={{
                  fontFamily: headerFont,
                  fontSize: `${0.74 * headerSize}em`,
                  fontWeight: headerBold ? 700 : 400,
                  fontStyle: headerItalic ? "italic" : undefined,
                  textDecoration: headerUnderline ? "underline" : undefined,
                  color: headerTextColor ?? "rgba(255,255,255,0.65)",
                  textAlign: "center", letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  textShadow: headerShadow,
                }}
              >
                {leftColHeader}
              </span>
            </div>

            {/* HHI column header */}
            <div
              style={{
                background: branding.accentColor,
                padding: "4% 5%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderBottom: `1px solid ${branding.accentColor}`,
              }}
            >
              <span
                style={{
                  fontFamily: headerFont,
                  fontSize: `${0.74 * headerSize}em`,
                  fontWeight: headerBold ? 800 : 400,
                  fontStyle: headerItalic ? "italic" : undefined,
                  textDecoration: headerUnderline ? "underline" : undefined,
                  color: headerTextColor ?? "#FFFFFF",
                  textAlign: "center", letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  textShadow: headerShadow,
                }}
              >
                {rightColHeader}
              </span>
            </div>

            {/* ── Data rows ── */}
            {Array.from({ length: numRows }).map((_, i) => {
              const isLast = i === numRows - 1;
              const rowBorder = isLast ? "none" : "1px solid rgba(255,255,255,0.07)";
              const rightRowBorder = isLast ? "none" : `1px solid ${branding.accentColor}30`;

              return (
                <React.Fragment key={i}>
                  {/* Row label */}
                  {hasLabels && (
                    <div
                      style={{
                        background: hasBg ? leftBoxColor : "rgba(255,255,255,0.04)",
                        padding: "3.5% 4% 3.5% 5%",
                        display: "flex",
                        alignItems: "center",
                        borderBottom: rowBorder,
                        borderRight: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <span
                        className="font-serif"
                        style={{ fontSize: `${0.66 * bodySize}em`, fontWeight: 800, color: "rgba(255,255,255,0.75)", lineHeight: 1.2, letterSpacing: "0.02em", textTransform: "uppercase" }}
                      >
                        {rowLabels[i] ?? ""}
                        <span style={{ color: branding.accentColor }}>.</span>
                      </span>
                    </div>
                  )}

                  {/* Traditional (left) cell */}
                  <div
                    style={{
                      background: hasBg ? leftBoxColor : "rgba(255,255,255,0.03)",
                      padding: "3.5% 5%",
                      display: "flex",
                      alignItems: "center",
                      gap: "4%",
                      borderBottom: rowBorder,
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: `${0.6 * iconSize}em`, color: crossColor ?? "rgba(255,255,255,0.35)", lineHeight: 1, marginTop: "0.1em", textShadow: iconShadow }}>✕</span>
                    <span
                      style={{
                        fontSize: `${0.65 * bodySize}em`,
                        fontWeight: bodyBold ? 700 : 400,
                        fontStyle: bodyItalic ? "italic" : "italic",
                        textDecoration: bodyUnderline ? "underline" : undefined,
                        color: bodyTextColor ?? "rgba(255,255,255,0.55)",
                        lineHeight: 1.6,
                        textShadow: outlineShadow,
                      }}
                    >
                      {leftBullets[i] ?? ""}
                    </span>
                  </div>

                  {/* HHI (right) cell */}
                  <div
                    style={{
                      background: hasBg ? rightBoxColor : `${branding.accentColor}18`,
                      padding: "3.5% 5%",
                      display: "flex",
                      alignItems: "center",
                      gap: "4%",
                      borderBottom: rightRowBorder,
                      borderLeft: `2px solid ${branding.accentColor}55`,
                    }}
                  >
                    {/* Accent checkmark circle */}
                    <div style={{ flexShrink: 0, width: `${iconSize * 1.1}em`, height: `${iconSize * 1.1}em`, minWidth: 12, minHeight: 12 }}>
                      <svg width="100%" height="100%" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r={iconOutline ? 7.5 : 9}
                          fill={checkColor ?? branding.accentColor}
                          stroke={iconOutline ?? "none"}
                          strokeWidth={iconOutline ? 2 : 0}
                        />
                        <path
                          d="M5 9.2l2.8 2.8 5.2-5.5"
                          stroke="white"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <span style={{
                      fontSize: `${0.68 * bodySize}em`,
                      fontWeight: bodyBold ? 700 : 700,
                      fontStyle: bodyItalic ? "italic" : undefined,
                      textDecoration: bodyUnderline ? "underline" : undefined,
                      color: bodyTextColor ?? "#FFFFFF",
                      lineHeight: 1.45,
                      textShadow: outlineShadow,
                    }}>
                      {rightBullets[i] ?? ""}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Bottom statement */}
        {bottomStatement && (
          <div style={{ flexShrink: 0, paddingTop: "3%", textAlign: "center" }}>
            <p
              style={{
                fontFamily: bottomFont,
                fontSize: `${0.73 * bottomSize}em`,
                fontWeight: bottomBold ? 700 : 400,
                fontStyle: bottomItalic ? "italic" : undefined,
                textDecoration: bottomUnderline ? "underline" : undefined,
                color: bottomColor,
                lineHeight: 1.5,
                textShadow: bottomShadow,
              }}
            >
              {bottomStatement}
            </p>
          </div>
        )}
      </div>

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

// ─── Main component — routes by layoutKey ─────────────────────────────────────

/** Converts a hex outline color to a 6-direction text-shadow string, or undefined if null. */
function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

export function RiskBriefSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as RiskBriefContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const layoutKey = slide.layoutKey as string;
  const hasBg = !!slide.backgroundId || !!hasAiBackground;

  // Per-field: Title
  const titleFont        = content.titleFont        ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const titleSize        = content.titleSize        ?? 1.5;
  const titleBold        = content.titleBold        ?? true;
  const titleItalic      = content.titleItalic      ?? false;
  const titleUnderline   = content.titleUnderline   ?? false;
  const titleColor       = content.titleColor       ?? (layoutKey === "comparison-table" ? "#FFFFFF" : branding.textColor);
  const titleTextOutline = content.titleTextOutline ?? null;

  // Per-field: Column headers
  const headerFont       = content.headerFont       ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headerSize       = content.headerSize       ?? 1.5;
  const headerBold       = content.headerBold       ?? true;
  const headerItalic     = content.headerItalic     ?? false;
  const headerUnderline  = content.headerUnderline  ?? false;
  const headerTextColor  = content.headerTextColor  ?? null;
  const headerTextOutline = content.headerTextOutline ?? null;

  // Per-field: Body / bullets
  const bodySize         = content.bodySize         ?? 1.5;
  const bodyBold         = content.bodyBold         ?? false;
  const bodyItalic       = content.bodyItalic       ?? false;
  const bodyUnderline    = content.bodyUnderline    ?? false;
  const bodyTextColor    = content.bodyTextColor    ?? null;
  const bodyTextOutline  = content.bodyTextOutline  ?? null;

  // Per-field: Bottom statement
  const bottomFont       = content.bottomFont       ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bottomSize       = content.bottomSize       ?? 1.5;
  const bottomBold       = content.bottomBold       ?? true;
  const bottomItalic     = content.bottomItalic     ?? true;
  const bottomUnderline  = content.bottomUnderline  ?? false;
  const bottomColor      = content.bottomColor      ?? branding.accentColor;
  const bottomTextOutline = content.bottomTextOutline ?? null;

  // Icons & colors
  const crossColor       = content.crossColor       ?? null;
  const checkColor       = content.checkColor       ?? null;
  const iconSize         = content.iconSize         ?? 1.5;
  const iconOutline      = content.iconOutline      ?? null;
  const leftBoxColor     = content.leftBoxColor     ?? "#0D1B2A";
  const rightBoxColor    = content.rightBoxColor    ?? branding.accentColor;
  const showRowLabels    = content.showRowLabels    ?? false;

  const title =
    slide.headline ||
    (layoutKey === "comparison-table"
      ? "Diagnostic Matrix: The Traditional Model vs. HHI"
      : "The Stress-Free Remodel: How We Eliminate Common Risks");

  const leftBullets  = (content.leftBullets  ?? []).length > 0 ? content.leftBullets!  : DEFAULT_LEFT_BULLETS;
  const rightBullets = (content.rightBullets ?? []).length > 0 ? content.rightBullets! : DEFAULT_RIGHT_BULLETS;
  const bottomStatement =
    content.bottomStatement ??
    "You'll know exactly what's being built, what it costs, and what to expect — before construction starts.";

  const effectiveBranding = accent !== branding.accentColor ? { ...branding, accentColor: accent } : branding;

  const sharedProps = {
    branding: effectiveBranding, hasBg,
    titleFont, titleSize, titleBold, titleItalic, titleUnderline, titleColor, titleTextOutline,
    headerFont, headerSize, headerBold, headerItalic, headerUnderline, headerTextColor, headerTextOutline,
    crossColor, checkColor, iconSize, iconOutline,
    bodySize, bodyBold, bodyItalic, bodyUnderline, bodyTextColor, bodyTextOutline,
    bottomFont, bottomSize, bottomBold, bottomItalic, bottomUnderline, bottomColor, bottomTextOutline,
    leftBoxColor, rightBoxColor,
    leftBullets, rightBullets, bottomStatement,
    content,
  };

  if (layoutKey === "comparison-table") {
    const rowLabels = showRowLabels ? (content.rowLabels ?? []) : [];
    return (
      <ComparisonTableLayout
        {...sharedProps}
        title={title}
        eyebrow={(content.showSectionLabel ?? true) ? slide.subheadline : null}
        leftColHeader={content.leftHeader || "Traditional Contracting"}
        rightColHeader={content.rightHeader || "HHI Design-Build"}
        rowLabels={rowLabels}
      />
    );
  }

  return (
    <TwoColumnLayout
      {...sharedProps}
      title={title}
      eyebrow={(content.showSectionLabel ?? true) ? slide.subheadline : null}
      leftHeader={content.leftHeader || "Why Remodels Go Wrong"}
      rightHeader={content.rightHeader || "How We Prevent That"}
    />
  );
}

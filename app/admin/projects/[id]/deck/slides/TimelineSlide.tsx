"use client";

import type { ProposalSlide, DeckBranding, TimelineContent, ProjectPhase } from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, HEADLINE_SCALE, BODY_SCALE, LINE_SPACING, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";
import { buildProjectPhases } from "@/app/lib/timeline-phases";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Default phases ──────────────────────────────────────────────────────────
// Sourced from the canonical HHI timeline. Milestones (no duration) render
// without a duration label; only the 3 editable phases carry duration text
// pulled from the Timeline tab.

export const DEFAULT_TIMELINE_PHASES: ProjectPhase[] = buildProjectPhases([]);

// ─── Design tokens ───────────────────────────────────────────────────────────

const LINEN = "#F5F0E8";
const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED = "#4A5568";

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

// ─── Main slide component ────────────────────────────────────────────────────

export function TimelineSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as TimelineContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "YOUR PROJECT";
  const headline = slide.headline ?? "Projected Timeline";
  const phases = c.phases && c.phases.length > 0 ? c.phases : DEFAULT_TIMELINE_PHASES;
  const accent = c.accentColor ?? branding.accentColor;
  const footnote = c.footnoteText ?? null;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  switch (layoutKey) {
    case "vertical-alternating":
      return (
        <AlternatingLayout
          sectionLabel={sectionLabel}
          headline={headline}
          phases={phases}
          accent={accent}
          footnote={footnote}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "stepped-hierarchy":
      return (
        <SteppedLayout
          sectionLabel={sectionLabel}
          headline={headline}
          phases={phases}
          accent={accent}
          footnote={footnote}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    default: // "vertical-dot"
      return (
        <VerticalDotLayout
          sectionLabel={sectionLabel}
          headline={headline}
          phases={phases}
          accent={accent}
          footnote={footnote}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Shared types ────────────────────────────────────────────────────────────

interface LayoutProps {
  sectionLabel: string;
  headline: string;
  phases: ProjectPhase[];
  accent: string;
  footnote: string | null;
  hasBg?: boolean;
  content: TimelineContent;
  branding: DeckBranding;
}

// ─── Layout A: Vertical Dot Timeline ─────────────────────────────────────────
// Left-aligned vertical line with filled navy dots. Phase name + gold duration
// right of dot, description below.

function VerticalDotLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const resolvedLineSpacing = LINE_SPACING[content.lineSpacing ?? "normal"];
  const textAlign = content.textAlignment ?? "left";
  const dotScale = content.dotSize ?? 1.0;
  const dotDiameterEm = 0.55 * dotScale;
  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : LINEN, overflow: "hidden" }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && (
          <p
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: content.sectionLabelColor ?? resolvedAccent,
              marginBottom: "0.4em",
            }}
          >
            {sectionLabel}
          </p>
          )}
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${(content.headlineSize ?? 2.0) * headlineScale}em`,
              fontWeight: (content.headlineBold !== false) ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: content.headlineColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </h2>
          <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, position: "relative", paddingLeft: "3.5%", minHeight: 0 }}>
          {/* Vertical line */}
          <div
            style={{
              position: "absolute",
              left: "1.2%",
              top: "0.5em",
              bottom: footnote ? "2em" : "0.5em",
              width: 2,
              background: `${resolvedAccent}40`,
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "4%", height: "100%" }}>
            {phases.map((phase) => (
              <div key={phase.id} style={{ position: "relative", display: "flex", gap: "3%" }}>
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    left: "-2.8%",
                    top: "0.15em",
                    width: `${dotDiameterEm}em`,
                    height: `${dotDiameterEm}em`,
                    borderRadius: "50%",
                    background: NAVY,
                    border: `2px solid ${resolvedAccent}`,
                    flexShrink: 0,
                    zIndex: 2,
                  }}
                />

                {/* Content */}
                <div style={{ flex: 1, textAlign: textAlign as React.CSSProperties["textAlign"] }}>
                  {/* Phase name + duration */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: "3%", marginBottom: "2%" }}>
                    <span
                      style={{
                        fontFamily: phase.nameFont ?? bodyFont,
                        fontSize: `${(phase.nameSize ?? 1.2) * 0.68 * bodyScale}em`,
                        fontWeight: (phase.nameBold !== false) ? 700 : 400,
                        fontStyle: phase.nameItalic ? "italic" : "normal",
                        textDecoration: phase.nameUnderline ? "underline" : "none",
                        color: phase.nameColor ?? branding.textColor,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textShadow: makeOutlineShadow(phase.nameOutline),
                      }}
                    >
                      {phase.name}
                    </span>
                    {phase.duration ? (
                      <span
                        style={{
                          fontFamily: phase.durationFont ?? bodyFont,
                          fontSize: `${(phase.durationSize ?? 0.9) * 0.55 * bodyScale}em`,
                          fontWeight: phase.durationBold ? 700 : 400,
                          fontStyle: phase.durationItalic !== false ? "italic" : "normal",
                          textDecoration: phase.durationUnderline ? "underline" : "none",
                          color: phase.durationColor ?? resolvedAccent,
                          textShadow: makeOutlineShadow(phase.durationOutline),
                        }}
                      >
                        {phase.duration}
                      </span>
                    ) : null}
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      fontFamily: phase.descriptionFont ?? bodyFont,
                      fontSize: `${(phase.descriptionSize ?? 0.9) * 0.52 * bodyScale}em`,
                      fontWeight: phase.descriptionBold ? 700 : 400,
                      fontStyle: phase.descriptionItalic ? "italic" : "normal",
                      textDecoration: phase.descriptionUnderline ? "underline" : "none",
                      color: phase.descriptionColor ?? (content.bodyColor ?? branding.textColor),
                      lineHeight: resolvedLineSpacing,
                      opacity: 0.8,
                      textShadow: makeOutlineShadow(phase.descriptionOutline),
                    }}
                  >
                    {phase.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footnote */}
        {footnote && (
          <p
            style={{
              flexShrink: 0,
              marginTop: "2%",
              fontFamily: content.footnoteFont ?? "'Jost', sans-serif",
              fontSize: `${(content.footnoteSize ?? 0.7) * 0.6}em`,
              fontWeight: content.footnoteBold ? 700 : 400,
              fontStyle: content.footnoteItalic !== false ? "italic" : "normal",
              textDecoration: content.footnoteUnderline ? "underline" : "none",
              color: content.footnoteColor ?? MUTED,
              lineHeight: 1.5,
              textShadow: makeOutlineShadow(content.footnoteOutline),
            }}
          >
            {footnote}
          </p>
        )}
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

// ─── Layout B: Vertical Alternating ──────────────────────────────────────────
// Center vertical line, phases alternate left/right.

function AlternatingLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const dotScale = content.dotSize ?? 1.0;
  const dotDiameterEm = 0.5 * dotScale;
  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : LINEN, overflow: "hidden" }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* Header — centered */}
        <div style={{ flexShrink: 0, marginBottom: "3%", textAlign: "center" }}>
          {(content.showSectionLabel ?? true) && (
          <p
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: content.sectionLabelColor ?? resolvedAccent,
              marginBottom: "0.4em",
            }}
          >
            {sectionLabel}
          </p>
          )}
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${(content.headlineSize ?? 2.0) * headlineScale}em`,
              fontWeight: (content.headlineBold !== false) ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: content.headlineColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </h2>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />
          </div>
        </div>

        {/* Alternating timeline */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {/* Center line */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: footnote ? "1em" : 0,
              width: 2,
              background: `${resolvedAccent}40`,
              transform: "translateX(-1px)",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "3%", height: "100%" }}>
            {phases.map((phase, i) => {
              const isLeft = i % 2 === 0;
              return (
                <div
                  key={phase.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Left content */}
                  <div
                    style={{
                      width: "46%",
                      textAlign: isLeft ? "right" : "left",
                      paddingRight: isLeft ? "4%" : 0,
                      paddingLeft: isLeft ? 0 : "4%",
                    }}
                  >
                    {isLeft && (
                      <PhaseBlock phase={phase} accent={accent} align="right" fallbackTextColor={branding.textColor} />
                    )}
                  </div>

                  {/* Center dot */}
                  <div
                    style={{
                      width: "8%",
                      display: "flex",
                      justifyContent: "center",
                      paddingTop: "0.1em",
                    }}
                  >
                    <div
                      style={{
                        width: `${dotDiameterEm}em`,
                        height: `${dotDiameterEm}em`,
                        borderRadius: "50%",
                        background: accent,
                        border: `2px solid ${NAVY}`,
                        zIndex: 2,
                      }}
                    />
                  </div>

                  {/* Right content */}
                  <div
                    style={{
                      width: "46%",
                      textAlign: !isLeft ? "left" : "left",
                      paddingLeft: !isLeft ? "0" : "4%",
                      paddingRight: !isLeft ? "4%" : 0,
                    }}
                  >
                    {!isLeft && (
                      <PhaseBlock phase={phase} accent={accent} align="left" fallbackTextColor={branding.textColor} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footnote */}
        {footnote && (
          <p
            style={{
              flexShrink: 0,
              marginTop: "2%",
              textAlign: "center",
              fontFamily: content.footnoteFont ?? "'Jost', sans-serif",
              fontSize: `${(content.footnoteSize ?? 0.7) * 0.6}em`,
              fontWeight: content.footnoteBold ? 700 : 400,
              fontStyle: content.footnoteItalic !== false ? "italic" : "normal",
              textDecoration: content.footnoteUnderline ? "underline" : "none",
              color: content.footnoteColor ?? MUTED,
              lineHeight: 1.5,
              textShadow: makeOutlineShadow(content.footnoteOutline),
            }}
          >
            {footnote}
          </p>
        )}
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

function PhaseBlock({ phase, accent, align, fallbackTextColor }: { phase: ProjectPhase; accent: string; align: "left" | "right"; fallbackTextColor: string }) {
  return (
    <>
      <p
        style={{
          fontFamily: phase.nameFont ?? SLIDE_FONTS.defaults.body,
          fontSize: `${(phase.nameSize ?? 1.2) * 0.62 * 0.83}em`,
          fontWeight: (phase.nameBold !== false) ? 700 : 400,
          fontStyle: phase.nameItalic ? "italic" : "normal",
          textDecoration: phase.nameUnderline ? "underline" : "none",
          color: phase.nameColor ?? fallbackTextColor,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: align,
          marginBottom: "2%",
          textShadow: makeOutlineShadow(phase.nameOutline),
        }}
      >
        {phase.name}
      </p>
      {phase.duration ? (
        <p
          style={{
            fontFamily: phase.durationFont ?? SLIDE_FONTS.defaults.body,
            fontSize: `${(phase.durationSize ?? 0.9) * 0.5 * 1.1}em`,
            fontWeight: phase.durationBold ? 700 : 400,
            fontStyle: phase.durationItalic !== false ? "italic" : "normal",
            textDecoration: phase.durationUnderline ? "underline" : "none",
            color: phase.durationColor ?? accent,
            textAlign: align,
            marginBottom: "3%",
            textShadow: makeOutlineShadow(phase.durationOutline),
          }}
        >
          {phase.duration}
        </p>
      ) : null}
      <p
        style={{
          fontFamily: phase.descriptionFont ?? SLIDE_FONTS.defaults.body,
          fontSize: `${(phase.descriptionSize ?? 0.9) * 0.48 * 1.1}em`,
          fontWeight: phase.descriptionBold ? 700 : 400,
          fontStyle: phase.descriptionItalic ? "italic" : "normal",
          textDecoration: phase.descriptionUnderline ? "underline" : "none",
          color: phase.descriptionColor ?? fallbackTextColor,
          lineHeight: 1.65,
          opacity: 0.8,
          textAlign: align,
          textShadow: makeOutlineShadow(phase.descriptionOutline),
        }}
      >
        {phase.description}
      </p>
    </>
  );
}

// ─── Layout C: Stepped / Indented Hierarchy ──────────────────────────────────
// Each phase indented progressively further right. Minimal, text-heavy.

function SteppedLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const resolvedLineSpacing = LINE_SPACING[content.lineSpacing ?? "normal"];
  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : LINEN, overflow: "hidden" }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && (
          <p
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: content.sectionLabelColor ?? resolvedAccent,
              marginBottom: "0.4em",
            }}
          >
            {sectionLabel}
          </p>
          )}
          <h2
            style={{
              fontFamily: headlineFont,
              fontSize: `${(content.headlineSize ?? 2.0) * headlineScale}em`,
              fontWeight: (content.headlineBold !== false) ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : "normal",
              textDecoration: content.headlineUnderline ? "underline" : "none",
              color: content.headlineColor ?? branding.textColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </h2>
          <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />
        </div>

        {/* Stepped phases */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4%", minHeight: 0 }}>
          {phases.map((phase, i) => {
            const indent = i * 6; // progressive indent in %
            return (
              <div
                key={phase.id}
                style={{
                  marginLeft: `${indent}%`,
                  borderLeft: `3px solid ${resolvedAccent}`,
                  paddingLeft: "2.5%",
                }}
              >
                {/* Phase name + duration */}
                <p
                  style={{
                    fontFamily: phase.nameFont ?? bodyFont,
                    fontSize: `${(phase.nameSize ?? 1.2) * 0.65 * bodyScale * 0.83}em`,
                    fontWeight: (phase.nameBold !== false) ? 700 : 400,
                    fontStyle: phase.nameItalic ? "italic" : "normal",
                    textDecoration: phase.nameUnderline ? "underline" : "none",
                    color: phase.nameColor ?? branding.textColor,
                    lineHeight: 1.3,
                    marginBottom: "1.5%",
                    textShadow: makeOutlineShadow(phase.nameOutline),
                  }}
                >
                  {phase.name}
                  {phase.duration ? (
                    <>
                      {" "}
                      <span
                        style={{
                          fontFamily: phase.durationFont ?? bodyFont,
                          fontWeight: phase.durationBold ? 700 : 400,
                          fontStyle: phase.durationItalic !== false ? "italic" : "normal",
                          textDecoration: phase.durationUnderline ? "underline" : "none",
                          color: phase.durationColor ?? resolvedAccent,
                          fontSize: "0.85em",
                          textShadow: makeOutlineShadow(phase.durationOutline),
                        }}
                      >
                        ({phase.duration})
                      </span>
                    </>
                  ) : null}
                </p>

                {/* Description */}
                <p
                  style={{
                    fontFamily: phase.descriptionFont ?? bodyFont,
                    fontSize: `${(phase.descriptionSize ?? 0.9) * 0.5 * bodyScale * 1.1}em`,
                    fontWeight: phase.descriptionBold ? 700 : 400,
                    fontStyle: phase.descriptionItalic ? "italic" : "normal",
                    textDecoration: phase.descriptionUnderline ? "underline" : "none",
                    color: phase.descriptionColor ?? (content.bodyColor ?? branding.textColor),
                    lineHeight: resolvedLineSpacing,
                    opacity: 0.8,
                    textShadow: makeOutlineShadow(phase.descriptionOutline),
                  }}
                >
                  {phase.description}
                </p>

                {/* Note (optional) */}
                {phase.note && (
                  <p
                    style={{
                      fontFamily: phase.noteFont ?? bodyFont,
                      fontSize: `${(phase.noteSize ?? 0.8) * 0.43 * bodyScale * 1.25}em`,
                      fontWeight: phase.noteBold ? 700 : 400,
                      fontStyle: phase.noteItalic !== false ? "italic" : "normal",
                      textDecoration: phase.noteUnderline ? "underline" : "none",
                      color: phase.noteColor ?? MUTED,
                      lineHeight: 1.55,
                      marginTop: "1.5%",
                      paddingLeft: "2%",
                      textShadow: makeOutlineShadow(phase.noteOutline),
                    }}
                  >
                    {phase.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        {footnote && (
          <p
            style={{
              flexShrink: 0,
              marginTop: "2%",
              fontFamily: content.footnoteFont ?? "'Jost', sans-serif",
              fontSize: `${(content.footnoteSize ?? 0.7) * 0.6}em`,
              fontWeight: content.footnoteBold ? 700 : 400,
              fontStyle: content.footnoteItalic !== false ? "italic" : "normal",
              textDecoration: content.footnoteUnderline ? "underline" : "none",
              color: content.footnoteColor ?? MUTED,
              lineHeight: 1.5,
              textShadow: makeOutlineShadow(content.footnoteOutline),
            }}
          >
            {footnote}
          </p>
        )}
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

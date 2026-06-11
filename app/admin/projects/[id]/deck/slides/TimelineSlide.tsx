"use client";

import type { ProposalSlide, DeckBranding, TimelineContent, ProjectPhase } from "@/app/lib/deck/types";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import type { DeckTheme } from "@/app/lib/deck/themes";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, HEADLINE_SCALE, BODY_SCALE, LINE_SPACING, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";
import { buildProjectPhases, parseWeeksRange } from "@/app/lib/timeline-phases";

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

const NAVY = "#1B2A4A";
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

  const layoutProps = {
    sectionLabel,
    headline,
    phases,
    accent,
    footnote,
    hasBg,
    content: c,
    branding,
  };

  switch (layoutKey) {
    case "week-axis":
      return <WeekAxisLayout {...layoutProps} />;
    case "chevron-phases":
      return <ChevronPhasesLayout {...layoutProps} />;
    case "horizon-wave":
      return <HorizonWaveLayout {...layoutProps} />;
    case "roadmap-cards":
      return <RoadmapCardsLayout {...layoutProps} />;
    default: // "vertical-dot"
      return <VerticalDotLayout {...layoutProps} />;
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
  const theme = useDeckTheme();
  const resolvedAccent = content.accentColor ?? branding.accentColor;
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  const bodyScale = BODY_SCALE[content.bodySizeScale ?? "medium"];
  const headlineFont = content.headlineFont ?? theme.fonts.headline;
  const bodyFont = content.bodyFont ?? theme.fonts.body;
  const resolvedLineSpacing = LINE_SPACING[content.lineSpacing ?? "normal"];
  const textAlign = content.textAlignment ?? "left";
  const dotScale = content.dotSize ?? 1.0;
  const dotDiameterEm = 0.55 * dotScale;
  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}
    >
      <TLGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
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

// ─── Shared helpers for the horizontal layouts ───────────────────────────────

/** Faint graph-paper underlay (Blueprint theme only). */
function TLGridUnderlay({ show }: { show: boolean }) {
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

/** Header (section label + headline + accent rule) honoring the existing inspector controls. */
function TLHeader({
  sectionLabel,
  headline,
  content,
  theme,
  accent,
  centered = false,
}: {
  sectionLabel: string;
  headline: string;
  content: TimelineContent;
  theme: DeckTheme;
  accent: string;
  centered?: boolean;
}) {
  const headlineScale = HEADLINE_SCALE[content.headlineSizeScale ?? "medium"];
  return (
    <div style={{ flexShrink: 0, marginBottom: "2.5%", textAlign: centered ? "center" : "left" }}>
      {(content.showSectionLabel ?? true) && (
        <p
          style={{
            fontFamily: content.sectionLabelFont ?? theme.fonts.label,
            fontSize: SECTION_LABEL_SIZE,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: content.sectionLabelColor ?? accent,
            marginBottom: "0.45em",
          }}
        >
          {sectionLabel}
        </p>
      )}
      <h2
        style={{
          fontFamily: content.headlineFont ?? theme.fonts.headline,
          fontSize: `${(content.headlineSize ?? 2.2) * headlineScale}em`,
          fontWeight: content.headlineBold !== false ? 700 : 400,
          fontStyle: content.headlineItalic ? "italic" : "normal",
          textDecoration: content.headlineUnderline ? "underline" : "none",
          color: content.headlineColor ?? theme.color.ink,
          lineHeight: 1.1,
          margin: 0,
          textShadow: makeOutlineShadow(content.headlineOutline),
        }}
      >
        {headline}
      </h2>
      <div style={centered ? { display: "flex", justifyContent: "center" } : undefined}>
        <TitleAccentRule accentColor={accent} marginTop="0.4em" marginBottom="0" />
      </div>
    </div>
  );
}

function TLFootnote({ footnote, content, centered = false }: { footnote: string | null; content: TimelineContent; centered?: boolean }) {
  if (!footnote) return null;
  return (
    <p
      style={{
        flexShrink: 0,
        marginTop: "1.5%",
        textAlign: centered ? "center" : "left",
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
  );
}

function TLLogo({ content, branding }: { content: TimelineContent; branding: DeckBranding }) {
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

/** Only phases that carry a duration — the horizontal phase layouts skip the kickoff milestones. */
function durationPhases(phases: ProjectPhase[]): ProjectPhase[] {
  return phases.filter((p) => (p.duration ?? "").trim().length > 0);
}

/** Resolve an entry's side of the timeline: explicit override or the alternating default. */
function sideAbove(p: ProjectPhase, defaultAbove: boolean): boolean {
  return p.side === "above" ? true : p.side === "below" ? false : defaultAbove;
}

// ─── Layout: Week Axis ───────────────────────────────────────────────────────
// One horizontal axis totaling the project weeks (upper bound of each phase's
// range). Proportional phase segments sit on the axis; phase boxes alternate
// above/below with the description under each box. Kickoff milestones (no
// duration) are not drawn — durations flow from the Timeline tab.

function WeekAxisLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const theme = useDeckTheme();
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const navy = theme.color.panel;
  const durPhases = durationPhases(phases);
  const milestones = phases.filter((p) => !(p.duration ?? "").trim());
  const ranges = durPhases.map((p) => parseWeeksRange(p.duration));
  const allParsed = ranges.length > 0 && ranges.every((r) => r !== null);
  const weights = allParsed ? ranges.map((r) => (r as { high: number }).high) : durPhases.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  // Milestones (no duration) are spaced through a dashed lead-in zone at the
  // front of the axis; the measured week span occupies the rest.
  const LEAD = milestones.length === 0 ? 0 : milestones.length === 1 ? 10 : 18;
  const span = 100 - LEAD;
  const marks = milestones.map((p, j) => ({
    phase: p,
    x: (LEAD * (j + 1)) / (milestones.length + 1),
    above: sideAbove(p, j % 2 === 0),
  }));

  // Segment geometry + cumulative week boundaries for the tick labels.
  let cum = 0;
  const segs = durPhases.map((p, i) => {
    const left = LEAD + (cum / total) * span;
    const width = (weights[i] / total) * span;
    cum += weights[i];
    return {
      phase: p,
      left,
      width,
      center: left + width / 2,
      above: sideAbove(p, (milestones.length + i) % 2 === 0),
      color: i % 2 === 0 ? accent : navy,
    };
  });
  const bounds: number[] = [0];
  {
    let acc = 0;
    for (const w of weights) {
      acc += w;
      bounds.push(acc);
    }
  }

  const BOX_W = milestones.length > 0 ? 19 : 27; // % width of each box column

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <TLGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <TLHeader sectionLabel={sectionLabel} headline={headline} content={content} theme={theme} accent={accent} />

        <div style={{ flex: 1, position: "relative", minHeight: 0, margin: "0 1%" }}>
          {/* Axis — dashed through the milestone lead-in, solid across the measured span */}
          {LEAD > 0 && (
            <div style={{ position: "absolute", left: 0, width: `${LEAD}%`, top: "50%", borderTop: "2px dashed rgba(26,35,50,0.3)", transform: "translateY(-50%)" }} />
          )}
          <div style={{ position: "absolute", left: `${LEAD}%`, right: 0, top: "50%", height: 2, background: "rgba(26,35,50,0.25)", transform: "translateY(-50%)" }} />

          {/* Phase segments on the axis */}
          {segs.map((s) => (
            <div
              key={`seg-${s.phase.id}`}
              style={{
                position: "absolute",
                left: `calc(${s.left}% + 2px)`,
                width: `calc(${s.width}% - 4px)`,
                top: "50%",
                height: "0.5em",
                transform: "translateY(-50%)",
                background: s.color,
                borderRadius: 3,
              }}
            />
          ))}

          {/* Week ticks at segment boundaries */}
          {allParsed &&
            bounds.map((w, i) => {
              const x = LEAD + (w / total) * span;
              return (
                <div key={`tick-${i}`} aria-hidden>
                  <div style={{ position: "absolute", left: `${x}%`, top: "calc(50% - 0.6em)", height: "1.2em", width: 1.5, background: "rgba(26,35,50,0.45)", transform: "translateX(-50%)" }} />
                  <span
                    style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: "calc(50% + 0.8em)",
                      transform: "translateX(-50%)",
                      fontFamily: theme.fonts.label,
                      fontSize: "0.5em",
                      fontWeight: 600,
                      color: muted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {i === bounds.length - 1 ? `${w} wks` : w}
                  </span>
                </div>
              );
            })}

          {/* Milestone markers — diamonds in the lead-in zone, boxed like the phases */}
          {marks.map((m) => {
            const p = m.phase;
            // Clamp only the BASE position; the nudge then moves 1:1 in both
            // directions (into the slide padding if the user wants) so it never
            // gets swallowed by an edge clamp. The slide clips at its boundary.
            const base = Math.min(Math.max(m.x - BOX_W / 2, 0), 100 - BOX_W);
            const left = base + (p.offsetX ?? 0);
            return (
              <div key={`mark-${p.id}`}>
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${m.x}%`,
                    top: "50%",
                    width: "0.8em",
                    height: "0.8em",
                    background: "#FFFFFF",
                    border: `3px solid ${navy}`,
                    transform: "translate(-50%, -50%) rotate(45deg)",
                    zIndex: 2,
                  }}
                />
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${m.x}%`,
                    width: 1.5,
                    background: "rgba(26,35,50,0.3)",
                    transform: "translateX(-50%)",
                    ...(m.above
                      ? { bottom: "calc(50% + 0.6em)", height: "1.65em" }
                      : { top: "calc(50% + 0.6em)", height: "1.65em" }),
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${BOX_W}%`,
                    ...(m.above ? { bottom: "calc(50% + 2.35em)" } : { top: "calc(50% + 2.35em)" }),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "1px solid rgba(26,35,50,0.18)",
                      borderTop: `4px solid ${navy}`,
                      borderRadius: 6,
                      boxShadow: "0 8px 20px rgba(26,35,50,0.08)",
                      padding: "0.8em 0.9em",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: p.nameFont ?? theme.fonts.headline,
                        fontSize: `${(p.nameSize ?? 1.2) * 0.62}em`,
                        fontWeight: p.nameBold !== false ? 700 : 400,
                        fontStyle: p.nameItalic ? "italic" : "normal",
                        textDecoration: p.nameUnderline ? "underline" : "none",
                        color: p.nameColor ?? ink,
                        lineHeight: 1.2,
                        margin: 0,
                        textShadow: makeOutlineShadow(p.nameOutline),
                      }}
                    >
                      {p.name}
                    </p>
                  </div>
                  <p
                    style={{
                      fontFamily: p.descriptionFont ?? theme.fonts.body,
                      fontSize: `${(p.descriptionSize ?? 0.9) * 0.5}em`,
                      fontWeight: p.descriptionBold ? 700 : 400,
                      fontStyle: p.descriptionItalic ? "italic" : "normal",
                      textDecoration: p.descriptionUnderline ? "underline" : "none",
                      color: p.descriptionColor ?? muted,
                      lineHeight: 1.5,
                      marginTop: "0.7em",
                      textShadow: makeOutlineShadow(p.descriptionOutline),
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Phase boxes — alternating above / below, stems to the segment center */}
          {segs.map((s) => {
            const p = s.phase;
            const base = Math.min(Math.max(s.center - BOX_W / 2, 0), 100 - BOX_W);
            const left = base + (p.offsetX ?? 0);
            return (
              <div key={`box-${p.id}`}>
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${s.center}%`,
                    width: 1.5,
                    background: "rgba(26,35,50,0.3)",
                    transform: "translateX(-50%)",
                    ...(s.above
                      ? { bottom: "calc(50% + 0.35em)", height: "1.9em" }
                      : { top: "calc(50% + 0.35em)", height: "1.9em" }),
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${BOX_W}%`,
                    ...(s.above ? { bottom: "calc(50% + 2.35em)" } : { top: "calc(50% + 2.35em)" }),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "1px solid rgba(26,35,50,0.18)",
                      borderTop: `4px solid ${s.color}`,
                      borderRadius: 6,
                      boxShadow: "0 8px 20px rgba(26,35,50,0.08)",
                      padding: "0.8em 0.9em",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: p.nameFont ?? theme.fonts.headline,
                        fontSize: `${(p.nameSize ?? 1.2) * 0.62}em`,
                        fontWeight: p.nameBold !== false ? 700 : 400,
                        fontStyle: p.nameItalic ? "italic" : "normal",
                        textDecoration: p.nameUnderline ? "underline" : "none",
                        color: p.nameColor ?? ink,
                        lineHeight: 1.2,
                        margin: 0,
                        textShadow: makeOutlineShadow(p.nameOutline),
                      }}
                    >
                      {p.name}
                    </p>
                    <p
                      style={{
                        fontFamily: p.durationFont ?? theme.fonts.label,
                        fontSize: `${(p.durationSize ?? 0.9) * 0.58}em`,
                        fontWeight: p.durationBold ? 700 : 600,
                        fontStyle: p.durationItalic !== false ? "italic" : "normal",
                        textDecoration: p.durationUnderline ? "underline" : "none",
                        color: p.durationColor ?? accent,
                        marginTop: "0.3em",
                        marginBottom: 0,
                        textShadow: makeOutlineShadow(p.durationOutline),
                      }}
                    >
                      {p.duration}
                    </p>
                  </div>
                  <p
                    style={{
                      fontFamily: p.descriptionFont ?? theme.fonts.body,
                      fontSize: `${(p.descriptionSize ?? 0.9) * 0.5}em`,
                      fontWeight: p.descriptionBold ? 700 : 400,
                      fontStyle: p.descriptionItalic ? "italic" : "normal",
                      textDecoration: p.descriptionUnderline ? "underline" : "none",
                      color: p.descriptionColor ?? muted,
                      lineHeight: 1.5,
                      marginTop: "0.7em",
                      textShadow: makeOutlineShadow(p.descriptionOutline),
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <TLFootnote footnote={footnote} content={content} centered />
      </div>
      <TLLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout: Chevron Phases ──────────────────────────────────────────────────
// A row of bold chevron arrows (accent, accent, …, navy last) with the phase
// name + duration inside and the description below each arrow. Phases with
// durations only.

function ChevronPhasesLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const theme = useDeckTheme();
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const navy = theme.color.panel;
  const durPhases = durationPhases(phases);
  const milestones = phases.filter((p) => !(p.duration ?? "").trim());
  const n = durPhases.length;
  // Milestones lead the row as slimmer, lighter chevrons; phases get full width.
  const cols = [...milestones.map(() => "0.68fr"), ...durPhases.map(() => "1fr")].join(" ") || "1fr";
  const CLIP_FIRST = "polygon(0% 0%, calc(100% - 1.7em) 0%, 100% 50%, calc(100% - 1.7em) 100%, 0% 100%)";
  const CLIP_REST = "polygon(0% 0%, calc(100% - 1.7em) 0%, 100% 50%, calc(100% - 1.7em) 100%, 0% 100%, 1.7em 50%)";
  const MILESTONE_FILL = "#E7E4DC";

  const descStyle = (p: ProjectPhase): React.CSSProperties => ({
    fontFamily: p.descriptionFont ?? theme.fonts.body,
    fontSize: `${(p.descriptionSize ?? 0.9) * 0.54}em`,
    fontWeight: p.descriptionBold ? 700 : 400,
    fontStyle: p.descriptionItalic ? "italic" : "normal",
    textDecoration: p.descriptionUnderline ? "underline" : "none",
    color: p.descriptionColor ?? muted,
    lineHeight: 1.55,
    textAlign: "center",
    padding: "0 6%",
    margin: 0,
    textShadow: makeOutlineShadow(p.descriptionOutline),
  });

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <TLGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <TLHeader sectionLabel={sectionLabel} headline={headline} content={content} theme={theme} accent={accent} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, columnGap: "0.45em", rowGap: "1.3em" }}>
            {/* Milestone lead-in chevrons — lighter fill, name only */}
            {milestones.map((p, j) => (
              <div
                key={p.id}
                style={{
                  clipPath: j === 0 ? CLIP_FIRST : CLIP_REST,
                  background: MILESTONE_FILL,
                  minHeight: "6.4em",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: j === 0 ? "1em 2.5em 1em 1.2em" : "1em 2.5em",
                }}
              >
                <p
                  style={{
                    fontFamily: p.nameFont ?? theme.fonts.headline,
                    fontSize: `${(p.nameSize ?? 1.2) * 0.56}em`,
                    fontWeight: p.nameBold !== false ? 700 : 400,
                    fontStyle: p.nameItalic ? "italic" : "normal",
                    textDecoration: p.nameUnderline ? "underline" : "none",
                    color: p.nameColor ?? ink,
                    lineHeight: 1.25,
                    margin: 0,
                    textShadow: makeOutlineShadow(p.nameOutline),
                  }}
                >
                  {p.name}
                </p>
              </div>
            ))}
            {/* Phase chevrons */}
            {durPhases.map((p, i) => {
              const isFirstOverall = milestones.length === 0 && i === 0;
              const fill = i === n - 1 ? navy : accent;
              return (
                <div
                  key={p.id}
                  style={{
                    clipPath: isFirstOverall ? CLIP_FIRST : CLIP_REST,
                    background: fill,
                    minHeight: "6.4em",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: isFirstOverall ? "1em 2.5em 1em 1.2em" : "1em 2.5em",
                  }}
                >
                  <p
                    style={{
                      fontFamily: p.nameFont ?? theme.fonts.headline,
                      fontSize: `${(p.nameSize ?? 1.2) * 0.6}em`,
                      fontWeight: p.nameBold !== false ? 700 : 400,
                      fontStyle: p.nameItalic ? "italic" : "normal",
                      textDecoration: p.nameUnderline ? "underline" : "none",
                      color: p.nameColor ?? "#FFFFFF",
                      lineHeight: 1.25,
                      margin: 0,
                      textShadow: makeOutlineShadow(p.nameOutline),
                    }}
                  >
                    {p.name}
                  </p>
                  <p
                    style={{
                      fontFamily: p.durationFont ?? theme.fonts.label,
                      fontSize: `${(p.durationSize ?? 0.9) * 0.56}em`,
                      fontWeight: p.durationBold ? 700 : 600,
                      fontStyle: p.durationItalic !== false ? "italic" : "normal",
                      textDecoration: p.durationUnderline ? "underline" : "none",
                      color: p.durationColor ?? "rgba(255,255,255,0.92)",
                      marginTop: "0.35em",
                      marginBottom: 0,
                      textShadow: makeOutlineShadow(p.durationOutline),
                    }}
                  >
                    ({p.duration})
                  </p>
                </div>
              );
            })}
            {/* Description row — same column order as the chevrons */}
            {milestones.map((p) => (
              <p key={`desc-${p.id}`} style={descStyle(p)}>
                {p.description}
              </p>
            ))}
            {durPhases.map((p) => (
              <p key={`desc-${p.id}`} style={descStyle(p)}>
                {p.description}
              </p>
            ))}
          </div>
        </div>

        <TLFootnote footnote={footnote} content={content} centered />
      </div>
      <TLLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout: Horizon Wave ────────────────────────────────────────────────────
// A smooth dark wave flowing edge-to-edge with an accent dot per phase; labels
// alternate above/below the wave. Shows ALL phases (milestones included).

function HorizonWaveLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const theme = useDeckTheme();
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const navy = theme.color.panel;
  const n = phases.length;
  const dotScale = content.dotSize ?? 1.0;

  // Evenly spaced x positions; y alternates crest/trough (% of the diagram).
  // The label side follows the per-phase override; the wave shape itself
  // keeps alternating so the line stays a smooth S-curve.
  const pts = phases.map((p, i) => ({
    phase: p,
    x: n === 1 ? 50 : 7 + (i * 86) / (n - 1),
    y: i % 2 === 0 ? 42 : 62,
    above: sideAbove(p, i % 2 === 0),
  }));

  // Smooth cubic path through the dots, extended past both slide edges.
  const svgPts = [
    { x: -80, y: pts[0]?.y ?? 50 },
    ...pts.map((p) => ({ x: p.x * 10, y: p.y })),
    { x: 1080, y: pts[n - 1]?.y ?? 50 },
  ];
  let d = `M ${svgPts[0].x} ${svgPts[0].y}`;
  for (let i = 1; i < svgPts.length; i++) {
    const a = svgPts[i - 1];
    const b = svgPts[i];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }

  const LABEL_W = 19; // % width of each label block

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <TLGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <TLHeader sectionLabel={sectionLabel} headline={headline} content={content} theme={theme} accent={accent} />

        <div style={{ flex: 1, position: "relative", minHeight: 0, margin: "0 -2%" }}>
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
            <path d={d} fill="none" stroke={navy} strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          </svg>

          {pts.map((pt) => {
            const p = pt.phase;
            // Clamp only the BASE position; the nudge then moves 1:1 in both
            // directions so edge labels (first/last) never swallow it.
            const base = Math.min(Math.max(pt.x - LABEL_W / 2, 0.5), 100 - LABEL_W - 0.5);
            const left = base + (p.offsetX ?? 0);
            return (
              <div key={p.id}>
                {/* Dot on the wave */}
                <div
                  style={{
                    position: "absolute",
                    left: `${pt.x}%`,
                    top: `${pt.y}%`,
                    width: `${1.15 * dotScale}em`,
                    height: `${1.15 * dotScale}em`,
                    borderRadius: "50%",
                    background: accent,
                    transform: "translate(-50%, -50%)",
                    zIndex: 2,
                  }}
                />
                {/* Stem from dot to label block */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: `${pt.x}%`,
                    width: 1.5,
                    background: "rgba(26,35,50,0.3)",
                    transform: "translateX(-50%)",
                    ...(pt.above
                      ? { bottom: `${100 - pt.y + 2}%`, height: "5%" }
                      : { top: `${pt.y + 2}%`, height: "5%" }),
                  }}
                />
                {/* Label block */}
                <div
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${LABEL_W}%`,
                    ...(pt.above ? { bottom: `${100 - pt.y + 8}%` } : { top: `${pt.y + 8}%` }),
                    textAlign: "left",
                  }}
                >
                  <p
                    style={{
                      fontFamily: p.nameFont ?? theme.fonts.headline,
                      fontSize: `${(p.nameSize ?? 1.2) * 0.56}em`,
                      fontWeight: p.nameBold !== false ? 700 : 400,
                      fontStyle: p.nameItalic ? "italic" : "normal",
                      textDecoration: p.nameUnderline ? "underline" : "none",
                      color: p.nameColor ?? ink,
                      lineHeight: 1.25,
                      margin: 0,
                      textShadow: makeOutlineShadow(p.nameOutline),
                    }}
                  >
                    {p.name}
                  </p>
                  {p.duration ? (
                    <p
                      style={{
                        fontFamily: p.durationFont ?? theme.fonts.label,
                        fontSize: `${(p.durationSize ?? 0.9) * 0.52}em`,
                        fontWeight: p.durationBold ? 700 : 600,
                        fontStyle: p.durationItalic !== false ? "italic" : "normal",
                        textDecoration: p.durationUnderline ? "underline" : "none",
                        color: p.durationColor ?? accent,
                        marginTop: "0.25em",
                        marginBottom: 0,
                        textShadow: makeOutlineShadow(p.durationOutline),
                      }}
                    >
                      ({p.duration})
                    </p>
                  ) : null}
                  <p
                    style={{
                      fontFamily: p.descriptionFont ?? theme.fonts.body,
                      fontSize: `${(p.descriptionSize ?? 0.9) * 0.47}em`,
                      fontWeight: p.descriptionBold ? 700 : 400,
                      fontStyle: p.descriptionItalic ? "italic" : "normal",
                      textDecoration: p.descriptionUnderline ? "underline" : "none",
                      color: p.descriptionColor ?? muted,
                      lineHeight: 1.5,
                      marginTop: "0.45em",
                      marginBottom: 0,
                      textShadow: makeOutlineShadow(p.descriptionOutline),
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <TLFootnote footnote={footnote} content={content} />
      </div>
      <TLLogo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout: Roadmap Cards ───────────────────────────────────────────────────
// Bold navy line across the top with a dot + stem per phase, white cards
// hanging below with a line icon, "Phase N" title, duration, and description.
// Phases with durations only.

function RoadmapIcon({ phaseId, color }: { phaseId: string; color: string }) {
  const common = {
    width: "3em",
    height: "3em",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (phaseId) {
    case "sign-contract": // pen signing
      return (
        <svg {...common}>
          <path d="M4.5 19.5l1.2-4.2L16.5 4.5a2.05 2.05 0 0 1 2.9 2.9L8.7 18.3 4.5 19.5z" />
          <path d="M14 7l2.9 2.9" />
          <path d="M4 22h16" />
        </svg>
      );
    case "start-design": // home (on-site measure / kickoff)
      return (
        <svg {...common}>
          <path d="M3.5 11 12 4l8.5 7" />
          <path d="M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "design": // drafting compass
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="1.6" />
          <path d="M11.2 6.5 6 19.5M12.8 6.5 18 19.5" />
          <path d="M7.7 15.2a8.6 8.6 0 0 0 8.6 0" />
        </svg>
      );
    case "precon": // spec sheet
      return (
        <svg {...common}>
          <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
          <path d="M8 8.5h8M8 12.5h8M8 16.5h4.5" />
        </svg>
      );
    case "construction": // hard hat
      return (
        <svg {...common}>
          <path d="M5 16.5a7 7 0 0 1 14 0" />
          <path d="M3.5 16.5h17v2h-17z" />
          <path d="M10 10V7.5a2 2 0 0 1 4 0V10" />
        </svg>
      );
    default: // flag
      return (
        <svg {...common}>
          <path d="M6 21V4" />
          <path d="M6 4h11l-2.5 3.5L17 11H6" />
        </svg>
      );
  }
}

function RoadmapCardsLayout({ sectionLabel, headline, phases, accent, footnote, hasBg, content, branding }: LayoutProps) {
  const theme = useDeckTheme();
  const ink = theme.color.ink;
  const muted = theme.color.muted;
  const navy = theme.color.panel;
  const durPhases = durationPhases(phases);
  const milestones = phases.filter((p) => !(p.duration ?? "").trim());
  // Milestones lead the roadmap as slimmer cards; phases get full width.
  const cols = [...milestones.map(() => "0.72fr"), ...durPhases.map(() => "1fr")].join(" ") || "1fr";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <TLGridUnderlay show={!!(theme.surface.grid && !hasBg)} />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <TLHeader sectionLabel={sectionLabel} headline={headline} content={content} theme={theme} accent={accent} />

        <div style={{ flex: 1, minHeight: 0, position: "relative", marginTop: "1%" }}>
          {/* Roadmap line — bleeds past both edges */}
          <div style={{ position: "absolute", top: "0.55em", left: "-8%", right: "-8%", height: "0.45em", background: navy }} />

          <div style={{ position: "relative", height: "100%", display: "grid", gridTemplateColumns: cols, columnGap: "4%" }}>
            {/* Milestone lead-in cards — name + description, no phase number */}
            {milestones.map((p) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0 }}>
                <div style={{ width: "1.5em", height: "1.5em", borderRadius: "50%", background: navy, flexShrink: 0 }} />
                <div style={{ width: 3, height: "1.6em", background: navy, flexShrink: 0 }} />
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    minHeight: 0,
                    background: "#FFFFFF",
                    border: "1px solid rgba(26,35,50,0.14)",
                    borderRadius: 4,
                    boxShadow: "0 10px 26px rgba(26,35,50,0.10)",
                    padding: "1.5em 1.1em",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <RoadmapIcon phaseId={p.id} color="#7C8794" />
                  <p
                    style={{
                      marginTop: "0.9em",
                      marginBottom: 0,
                      fontFamily: p.nameFont ?? theme.fonts.headline,
                      fontSize: `${(p.nameSize ?? 1.2) * 0.58}em`,
                      fontWeight: p.nameBold !== false ? 700 : 400,
                      fontStyle: p.nameItalic ? "italic" : "normal",
                      textDecoration: p.nameUnderline ? "underline" : "none",
                      color: p.nameColor ?? ink,
                      lineHeight: 1.3,
                      textShadow: makeOutlineShadow(p.nameOutline),
                    }}
                  >
                    {p.name}
                  </p>
                  <p
                    style={{
                      fontFamily: p.descriptionFont ?? theme.fonts.body,
                      fontSize: `${(p.descriptionSize ?? 0.9) * 0.5}em`,
                      fontWeight: p.descriptionBold ? 700 : 400,
                      fontStyle: p.descriptionItalic ? "italic" : "normal",
                      textDecoration: p.descriptionUnderline ? "underline" : "none",
                      color: p.descriptionColor ?? muted,
                      lineHeight: 1.55,
                      marginTop: "0.8em",
                      marginBottom: 0,
                      textShadow: makeOutlineShadow(p.descriptionOutline),
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            ))}
            {/* Phase cards */}
            {durPhases.map((p, i) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0 }}>
                <div style={{ width: "1.5em", height: "1.5em", borderRadius: "50%", background: navy, flexShrink: 0 }} />
                <div style={{ width: 3, height: "1.6em", background: navy, flexShrink: 0 }} />
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    minHeight: 0,
                    background: "#FFFFFF",
                    border: "1px solid rgba(26,35,50,0.14)",
                    borderRadius: 4,
                    boxShadow: "0 10px 26px rgba(26,35,50,0.10)",
                    padding: "1.5em 1.1em",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <RoadmapIcon phaseId={p.id} color="#7C8794" />
                  <p
                    style={{
                      marginTop: "0.9em",
                      marginBottom: 0,
                      fontFamily: p.nameFont ?? theme.fonts.headline,
                      fontSize: `${(p.nameSize ?? 1.2) * 0.62}em`,
                      fontWeight: p.nameBold !== false ? 700 : 400,
                      fontStyle: p.nameItalic ? "italic" : "normal",
                      textDecoration: p.nameUnderline ? "underline" : "none",
                      color: p.nameColor ?? ink,
                      lineHeight: 1.3,
                      textShadow: makeOutlineShadow(p.nameOutline),
                    }}
                  >
                    Phase {i + 1}:
                    <br />
                    {p.name}
                  </p>
                  <p
                    style={{
                      fontFamily: p.durationFont ?? theme.fonts.label,
                      fontSize: `${(p.durationSize ?? 0.9) * 0.55}em`,
                      fontWeight: p.durationBold ? 700 : 500,
                      fontStyle: p.durationItalic !== false ? "italic" : "normal",
                      textDecoration: p.durationUnderline ? "underline" : "none",
                      color: p.durationColor ?? muted,
                      marginTop: "0.35em",
                      marginBottom: 0,
                      textShadow: makeOutlineShadow(p.durationOutline),
                    }}
                  >
                    ({p.duration})
                  </p>
                  <p
                    style={{
                      fontFamily: p.descriptionFont ?? theme.fonts.body,
                      fontSize: `${(p.descriptionSize ?? 0.9) * 0.52}em`,
                      fontWeight: p.descriptionBold ? 700 : 400,
                      fontStyle: p.descriptionItalic ? "italic" : "normal",
                      textDecoration: p.descriptionUnderline ? "underline" : "none",
                      color: p.descriptionColor ?? muted,
                      lineHeight: 1.6,
                      marginTop: "0.9em",
                      marginBottom: 0,
                      textShadow: makeOutlineShadow(p.descriptionOutline),
                    }}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TLFootnote footnote={footnote} content={content} centered />
      </div>
      <TLLogo content={content} branding={branding} />
    </div>
  );
}


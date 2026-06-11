"use client";

import type {
  ProposalSlide,
  DeckBranding,
  DesignExperienceContent,
  DesignExperienceStage,
} from "@/app/lib/deck/types";
import {
  DESIGN_EXPERIENCE_DEFAULTS,
  DEFAULT_DESIGN_EXPERIENCE_STAGES,
} from "@/app/lib/deck/design-experience-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { DuotoneIcon } from "./shared/DuotoneIcons";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import type { DeckTheme } from "@/app/lib/deck/themes";
import {
  SLIDE_PADDING,
  SECTION_LABEL_SIZE,
  LOGO_POSITION_DEFAULTS,
} from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const NAVY = "#1B2A4A"; // photo-placeholder gradient tint
const DARK_BG = "#202A33"; // ladder-photo background
const DARK_INK = "#F8F4EE";
const DARK_MUTED = "rgba(248,244,238,0.72)";

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── Per-stage icon glyph (AI PNG → brand image → built-in vector) ────────────

function StageGlyph({ stage, ink, accent, size }: { stage: DesignExperienceStage; ink: string; accent: string; size: string }) {
  // Brand-library (iconUrl) and AI (iconImageUrl) icons render UN-masked so their
  // own colour survives. Otherwise use the hand-authored duotone vector set —
  // crisp at any size and consistent (the default).
  const src = stage.iconImageUrl ?? stage.iconUrl;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={stage.title} style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  return <DuotoneIcon name={stage.icon} ink={ink} accent={accent} size={size} />;
}

// ─── Resolved per-stage style helpers ─────────────────────────────────────────

function stageTitleStyle(stage: DesignExperienceStage, content: DesignExperienceContent, fallbackFont: string, defColor: string, em: number): React.CSSProperties {
  return {
    fontFamily: stage.titleFont ?? content.headlineFont ?? fallbackFont,
    fontSize: `${em * (stage.titleSize ?? 1)}em`,
    fontWeight: (stage.titleBold ?? true) ? 700 : 400,
    fontStyle: stage.titleItalic ? "italic" : undefined,
    textDecoration: stage.titleUnderline ? "underline" : undefined,
    color: stage.titleColor ?? defColor,
    lineHeight: 1.2,
    textShadow: makeOutlineShadow(stage.titleOutline),
  };
}

function stageDescStyle(stage: DesignExperienceStage, content: DesignExperienceContent, fallbackFont: string, defColor: string, em: number): React.CSSProperties {
  return {
    fontFamily: stage.descriptionFont ?? content.bodyFont ?? fallbackFont,
    fontSize: `${em * (stage.descriptionSize ?? 1)}em`,
    fontWeight: stage.descriptionBold ? 700 : 400,
    fontStyle: stage.descriptionItalic ? "italic" : undefined,
    textDecoration: stage.descriptionUnderline ? "underline" : undefined,
    color: stage.descriptionColor ?? defColor,
    lineHeight: 1.5,
    textShadow: makeOutlineShadow(stage.descriptionOutline),
  };
}

// ─── Shared header ────────────────────────────────────────────────────────────

function DXHeader({
  sectionLabel, headline, content, branding, accent, ink, theme, center = false, onDark = false,
}: {
  sectionLabel: string | null; headline: string; content: DesignExperienceContent;
  branding: DeckBranding; accent: string; ink: string; theme: DeckTheme; center?: boolean; onDark?: boolean;
}) {
  const titleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  return (
    <div style={{ flexShrink: 0, textAlign: center ? "center" : "left" }}>
      {(content.showSectionLabel ?? true) && sectionLabel && (
        <p style={{ fontFamily: content.sectionLabelFont ?? theme.fonts.label, fontSize: SECTION_LABEL_SIZE, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: content.sectionLabelColor ?? accent, marginBottom: "0.4em" }}>
          {sectionLabel}
        </p>
      )}
      <h2 style={{
        fontFamily: titleFont,
        fontSize: `${2.2 * (content.slideTitleSize ?? 1)}em`,
        fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
        fontStyle: content.slideTitleItalic ? "italic" : undefined,
        textDecoration: content.slideTitleUnderline ? "underline" : undefined,
        color: content.slideTitleColor ?? (onDark ? DARK_INK : ink),
        lineHeight: 1.12, margin: 0,
        textShadow: makeOutlineShadow(content.slideTitleOutline),
      }}>
        {headline}
      </h2>
      <div style={{ display: "flex", justifyContent: center ? "center" : "flex-start" }}>
        <TitleAccentRule accentColor={accent} marginTop="0.4em" marginBottom="0" />
      </div>
    </div>
  );
}

function SubLine({ content, theme, defColor, center = true }: { content: DesignExperienceContent; theme: DeckTheme; defColor: string; center?: boolean }) {
  if (!content.subheadline) return null;
  return (
    <p style={{
      fontFamily: content.subheadlineFont ?? content.bodyFont ?? theme.fonts.body,
      fontSize: `${0.7 * (content.subheadlineSize ?? 1)}em`,
      fontWeight: content.subheadlineBold ? 700 : 400,
      fontStyle: (content.subheadlineItalic ?? false) ? "italic" : undefined,
      textDecoration: content.subheadlineUnderline ? "underline" : undefined,
      color: content.subheadlineColor ?? defColor,
      textAlign: center ? "center" : "left",
      lineHeight: 1.5, margin: 0,
      maxWidth: center ? "80%" : undefined, marginLeft: center ? "auto" : 0, marginRight: center ? "auto" : 0,
      textShadow: makeOutlineShadow(content.subheadlineOutline),
    }}>
      {content.subheadline}
    </p>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DesignExperienceSlide({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as DesignExperienceContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = content.sectionLabel ?? DESIGN_EXPERIENCE_DEFAULTS.sectionLabel;
  const headline = slide.headline ?? DESIGN_EXPERIENCE_DEFAULTS.headline;
  const stages = content.stages && content.stages.length > 0 ? content.stages : DEFAULT_DESIGN_EXPERIENCE_STAGES;
  const stepWord = content.stepWord ?? DESIGN_EXPERIENCE_DEFAULTS.stepWord;
  const accent = content.accentColor ?? branding.accentColor;
  const ink = content.slideTitleColor ?? content.headlineColor ?? theme.color.ink;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  const common = { sectionLabel, headline, stages, stepWord, accent, ink, content, branding, hasBg, theme };

  switch (layoutKey) {
    case "chevron-flow":
      return <ChevronFlowLayout {...common} />;
    case "serpentine-cards":
      return <SerpentineCardsLayout {...common} />;
    case "vertical-photo-steps":
      return <VerticalPhotoStepsLayout {...common} />;
    case "ladder-photo":
      return <LadderPhotoLayout {...common} />;
    default: // "stepped-circles"
      return <SteppedCirclesLayout {...common} />;
  }
}

interface LayoutProps {
  sectionLabel: string | null; headline: string; stages: DesignExperienceStage[];
  stepWord: string; accent: string; ink: string;
  content: DesignExperienceContent; branding: DeckBranding; hasBg: boolean; theme: DeckTheme;
}

/**
 * Blueprint signature underlay — faint graph grid + four corner brackets,
 * shown only when the active theme uses the grid surface (Blueprint), matching
 * the NotebookLM reference. Editorial leaves the surface clean.
 */
function Logo({ content, branding, variant = "light" }: { content: DesignExperienceContent; branding: DeckBranding; variant?: "light" | "dark" }) {
  return (
    <LogoOverlay
      show={content.showLogo ?? false}
      variant={content.logoVariant ?? variant}
      xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
      yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
      scale={content.logoSize ?? 1.0}
      branding={branding}
    />
  );
}

// ─── Layout 1: Stepped Circles ────────────────────────────────────────────────

function SteppedCirclesLayout({ sectionLabel, headline, stages, stepWord, accent, ink, content, branding, hasBg, theme }: LayoutProps) {
  const steps = stages.slice(0, 6);
  const n = Math.max(steps.length, 1);
  const inset = `${50 / n}%`;
  // Single proportional scale for circle + ring + icon + connector.
  const z = Math.max(0.6, Math.min(1.5, content.circleSize ?? 1));
  const labelScale = Math.max(0.5, Math.min(1.8, content.stepLabelSize ?? 1));
  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <DXHeader sectionLabel={sectionLabel} headline={headline} content={content} branding={branding} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.5em" }}>
          {/* Titles row — "Stage N:" shares the title's ink color (no orange noise) */}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ flex: 1, textAlign: "center", padding: "0 3%" }}>
                <p style={{ ...stageTitleStyle(s, content, theme.fonts.headline, ink, 0.72) }}>
                  {stepWord && <span style={{ display: "block", fontWeight: 700, fontSize: `${labelScale}em` }}>{stepWord} {i + 1}:</span>}
                  {s.title}
                </p>
              </div>
            ))}
          </div>

          {/* Circles + connector (bar tucks behind the opaque circles) */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: inset, right: inset, top: "50%", height: `${1.2 * z}em`, background: accent, transform: "translateY(-50%)", borderRadius: 10, zIndex: 0 }} />
            {steps.map((s) => (
              <div key={s.id} style={{ flex: 1, display: "flex", justifyContent: "center", zIndex: 1 }}>
                <div style={{ width: `${6.4 * z}em`, height: `${6.4 * z}em`, borderRadius: "50%", background: "#FFFFFF", border: `${0.62 * z}em solid ${accent}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(26,35,50,0.12)" }}>
                  <StageGlyph stage={s} ink={ink} accent={accent} size={`${3.95 * z}em`} />
                </div>
              </div>
            ))}
          </div>

          {/* Descriptions row */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {steps.map((s) => (
              <div key={s.id} style={{ flex: 1, textAlign: "center", padding: "0 6%" }}>
                {s.description && <p style={{ ...stageDescStyle(s, content, theme.fonts.body, theme.color.muted, 0.62) }}>{s.description}</p>}
              </div>
            ))}
          </div>

          <SubLine content={content} theme={theme} defColor={theme.color.muted} />
        </div>
      </div>
      <Logo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout 2: Chevron Flow ───────────────────────────────────────────────────

function ChevronFlowLayout({ sectionLabel, headline, stages, stepWord, accent, ink, content, branding, hasBg, theme }: LayoutProps) {
  const steps = stages.slice(0, 6);
  const clip = "polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%, 14% 50%)";
  const z = Math.max(0.7, Math.min(1.4, content.circleSize ?? 1)); // shared "Stage Size" knob
  const labelScale = Math.max(0.5, Math.min(1.8, content.stepLabelSize ?? 1));
  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <DXHeader sectionLabel={sectionLabel} headline={headline} content={content} branding={branding} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.6em" }}>
          <div style={{ display: "flex", alignItems: "stretch", height: `${9 * z}em`, maxHeight: "62%" }}>
            {steps.map((s, i) => (
              <div
                key={s.id}
                style={{
                  flex: 1, minWidth: 0, background: accent, clipPath: clip,
                  marginRight: i < steps.length - 1 ? "-2.2%" : 0,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  textAlign: "center", padding: "0 9% 0 12%",
                }}
              >
                <span style={{ fontFamily: content.bodyFont ?? theme.fonts.label, fontSize: `${0.5 * z * labelScale}em`, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.92)", marginBottom: "0.3em" }}>
                  {stepWord} {i + 1}:
                </span>
                <span style={{ ...stageTitleStyle(s, content, theme.fonts.headline, "#FFFFFF", 0.6 * z), color: s.titleColor ?? "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
          <SubLine content={content} theme={theme} defColor={theme.color.muted} />
        </div>
      </div>
      <Logo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout 3: Serpentine Cards ───────────────────────────────────────────────

function SerpentineCardsLayout({ sectionLabel, headline, stages, stepWord, accent, ink, content, branding, hasBg, theme }: LayoutProps) {
  const steps = stages.slice(0, 5);
  const labelScale = Math.max(0.5, Math.min(1.8, content.stepLabelSize ?? 1));
  const z = Math.max(0.7, Math.min(1.4, content.circleSize ?? 1)); // "Card Size" knob
  const N = Math.max(steps.length, 1);
  const slot = 100 / N;
  const cx = (i: number) => (i + 0.5) * slot;
  // Card vertical band (% of the diagram area) + the serpentine loop reach.
  const half = Math.min(36, 26 * z);
  const topY = 50 - half;
  const botY = 50 + half;
  const amp = 17; // how far each loop reaches past the cards
  const arcs = [] as { d: string; ax: number; ay: number; over: boolean }[];
  for (let g = 0; g < N - 1; g++) {
    const xL = cx(g), xR = cx(g + 1), over = g % 2 === 0;
    const y = over ? topY : botY;
    const peak = over ? topY - amp : botY + amp;
    arcs.push({ d: `M ${xL} ${y} C ${xL} ${peak} ${xR} ${peak} ${xR} ${y}`, ax: xR, ay: y, over });
  }

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <DXHeader sectionLabel={sectionLabel} headline={headline} content={content} branding={branding} accent={accent} ink={ink} theme={theme} />

        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {/* Serpentine arcs (behind the cards) + arrowheads */}
          <div style={{ position: "absolute", inset: 0, zIndex: 0 }} aria-hidden>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              {arcs.map((a, i) => (
                <path key={i} d={a.d} fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {arcs.map((a, i) => (
              <span key={i} style={{ position: "absolute", left: `${a.ax}%`, top: `${a.ay}%`, transform: "translate(-50%,-50%)", color: accent, fontSize: "0.8em", lineHeight: 1 }}>
                {a.over ? "▼" : "▲"}
              </span>
            ))}
          </div>

          {/* Cards (centered content) */}
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "2.4%", height: `${botY - topY}%` }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ flex: 1, minWidth: 0, height: "100%", background: "#FFFFFF", borderRadius: 14, padding: "3% 3.2%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", boxShadow: "0 8px 22px rgba(26,35,50,0.12)", border: "1px solid rgba(26,35,50,0.06)" }}>
                <span style={{ fontFamily: content.bodyFont ?? theme.fonts.label, fontSize: `${0.5 * labelScale}em`, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, marginBottom: "0.6em" }}>
                  {stepWord} {i + 1}
                </span>
                <p style={{ ...stageTitleStyle(s, content, theme.fonts.headline, ink, 0.74), marginBottom: "0.5em" }}>{s.title}</p>
                {s.description && <p style={{ ...stageDescStyle(s, content, theme.fonts.body, theme.color.muted, 0.56) }}>{s.description}</p>}
              </div>
            ))}
          </div>
        </div>

        <SubLine content={content} theme={theme} defColor={theme.color.muted} />
      </div>
      <Logo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout 4: Vertical Steps + Photo ─────────────────────────────────────────

function VerticalPhotoStepsLayout({ sectionLabel, headline, stages, stepWord, accent, ink, content, branding, hasBg, theme }: LayoutProps) {
  const steps = stages.slice(0, 5);
  const labelScale = Math.max(0.5, Math.min(1.8, content.stepLabelSize ?? 1));
  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex" }}>
        {/* Left: photo */}
        <div style={{ width: "37%", position: "relative", flexShrink: 0 }}>
          {content.heroImageUrl ? (
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${content.heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${NAVY}18 0%, ${accent}12 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: theme.fonts.label, fontSize: "0.6em", letterSpacing: "0.1em", textTransform: "uppercase", color: theme.color.muted, opacity: 0.6 }}>Project Photo</span>
            </div>
          )}
        </div>

        {/* Right: header + step cards */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
          <DXHeader sectionLabel={sectionLabel} headline={headline} content={content} branding={branding} accent={accent} ink={ink} theme={theme} />
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.5em", marginTop: "0.6em" }}>
            {steps.map((s, i) => (
              <div key={s.id}>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.7)", borderLeft: `5px solid ${accent}`, padding: "2.5% 3.5%", borderRadius: "0 6px 6px 0", boxShadow: "0 3px 10px rgba(26,35,50,0.06)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...stageTitleStyle(s, content, theme.fonts.headline, ink, 0.74), marginBottom: "0.25em" }}>
                      <span style={{ color: accent, fontSize: `${labelScale}em` }}>{stepWord} {i + 1} · </span>{s.title}
                    </p>
                    {s.description && <p style={{ ...stageDescStyle(s, content, theme.fonts.body, theme.color.muted, 0.55) }}>{s.description}</p>}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: "1.4%" }}>
                    <span style={{ color: accent, fontSize: "0.9em", lineHeight: 1 }}>▾</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Logo content={content} branding={branding} />
    </div>
  );
}

// ─── Layout 5: Ladder + Photo (dark) ──────────────────────────────────────────

function LadderPhotoLayout({ sectionLabel, headline, stages, stepWord, accent, content, branding, hasBg, theme }: LayoutProps) {
  const steps = stages.slice(0, 5);
  const labelScale = Math.max(0.5, Math.min(1.8, content.stepLabelSize ?? 1));
  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : DARK_BG, overflow: "hidden" }}>
      {/* faint graph grid */}
      {!hasBg && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <DXHeader sectionLabel={sectionLabel} headline={headline} content={content} branding={branding} accent={accent} ink={DARK_INK} theme={theme} onDark />

        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "4%", marginTop: "0.6em" }}>
          {/* Left: numbered steps */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "1em" }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.7em" }}>
                <span style={{ fontFamily: content.headlineFont ?? theme.fonts.headline, fontSize: "1.9em", fontWeight: 800, color: accent, lineHeight: 1, flexShrink: 0, minWidth: "1.6em" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${accent}`, paddingLeft: "0.7em" }}>
                  <p style={{ ...stageTitleStyle(s, content, theme.fonts.headline, DARK_INK, 0.7), marginBottom: "0.2em" }}>
                    <span style={{ color: accent, fontWeight: 700, fontSize: `${labelScale}em` }}>{stepWord} {i + 1}: </span>{s.title}
                  </p>
                  {s.description && <p style={{ ...stageDescStyle(s, content, theme.fonts.body, DARK_MUTED, 0.54) }}>{s.description}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Right: framed photo */}
          <div style={{ width: "40%", flexShrink: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%", aspectRatio: "4 / 3", border: `1px solid ${accent}`, padding: 6, position: "relative" }}>
              {content.heroImageUrl ? (
                <div style={{ position: "absolute", inset: 6, backgroundImage: `url(${content.heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
              ) : (
                <div style={{ position: "absolute", inset: 6, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: theme.fonts.label, fontSize: "0.55em", letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_MUTED }}>Project Photo</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Logo content={content} branding={branding} variant="dark" />
    </div>
  );
}

"use client";

import type { ProposalSlide, DeckBranding, ProcessContent, ProcessStage } from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SECTION_LABEL_SIZE, CARD_SHADOWS, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── Default content ──────────────────────────────────────────────────────────

const DEFAULT_STAGES: ProcessStage[] = [
  {
    name: "Discovery & Design",
    bullets: [
      "We learn your goals, priorities, and how you use your space.",
      "Scope and early budget direction are established upfront.",
      "Potential issues are identified before they become surprises.",
    ],
  },
  {
    name: "Plan & Select",
    bullets: [
      "Layouts, materials, and finishes are finalized to match your vision.",
      "Every selection is reviewed against your target investment.",
      "A complete, build-ready plan is approved before construction begins.",
    ],
  },
  {
    name: "Build & Deliver",
    bullets: [
      "A dedicated project team executes the work from start to finish.",
      "You receive regular updates so you always know what's happening.",
      "Your home is returned clean, complete, and ready to enjoy.",
    ],
  },
];

const DEFAULT_BOTTOM =
  "Every detail is planned before we break ground—so the build stays on schedule, on budget, and free of surprises.";

// ─── Three-stages layout ──────────────────────────────────────────────────────

export function ProcessSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as ProcessContent;
  const resolvedAccent = c.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const stages = c.stages && c.stages.length > 0 ? c.stages : DEFAULT_STAGES;
  const bottomStatement = c.bottomStatement ?? DEFAULT_BOTTOM;
  const title = slide.headline ?? "Our Process: From Vision to Finished Home";

  // Per-field: Slide title
  const slideTitleFont = c.slideTitleFont ?? c.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = c.slideTitleSize ?? 1.0;
  const slideTitleColor = c.slideTitleColor ?? c.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(c.slideTitleOutline);

  // Per-field: Footer
  const footerFont = c.footerFont ?? c.bodyFont ?? SLIDE_FONTS.defaults.body;
  const footerSize = c.footerSize ?? 1.0;
  const footerColor = c.footerColor ?? c.bodyColor ?? branding.textColor;
  const footerShadow = makeOutlineShadow(c.footerOutline);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasAiBackground ? "transparent" : "#F5F4F0", overflow: "hidden" }}
    >
      {/* Dot grid watermark */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="proc-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={accent} opacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#proc-dots)" />
      </svg>

      {/* Accent side bar */}
      <div
        style={{
          position: "absolute",
          left: 0, top: 0, bottom: 0,
          width: "0.4%",
          background: accent,
        }}
      />

      <div
        style={{
          position: "relative", zIndex: 1, height: "100%",
          display: "flex", flexDirection: "column",
          padding: "5% 5.5% 4% 6%",
        }}
      >
        {/* Title row */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(c.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE,
                fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em",
                color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            style={{
              fontSize: `${2.4 * slideTitleSize}em`,
              fontWeight: (c.slideTitleBold ?? true) ? 800 : 400,
              fontFamily: slideTitleFont,
              fontStyle: c.slideTitleItalic ? "italic" : undefined,
              textDecoration: c.slideTitleUnderline ? "underline" : undefined,
              color: slideTitleColor,
              lineHeight: 1.1,
              textShadow: slideTitleShadow,
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
        </div>

        {/* Stage columns */}
        <div
          style={{
            flex: 1, display: "flex", gap: "2.5%", minHeight: 0, alignItems: "stretch",
          }}
        >
          {stages.map((stage, i) => (
            <StageCard
              key={i}
              index={i}
              stage={stage}
              isLast={i === stages.length - 1}
              branding={branding}
              accent={accent}
              fallbackHeadlineFont={c.headlineFont ?? SLIDE_FONTS.defaults.headline}
              fallbackBodyFont={c.bodyFont ?? SLIDE_FONTS.defaults.body}
            />
          ))}
        </div>

        {/* Bottom statement */}
        {bottomStatement && (
          <div
            style={{
              flexShrink: 0, marginTop: "3%",
              borderTop: `1px solid ${accent}40`,
              paddingTop: "2%",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: `${0.73 * footerSize}em`,
                fontWeight: (c.footerBold ?? false) ? 700 : 600,
                fontFamily: footerFont,
                fontStyle: c.footerItalic !== false ? "italic" : undefined,
                textDecoration: c.footerUnderline ? "underline" : undefined,
                color: footerColor,
                lineHeight: 1.5,
                opacity: 0.75,
                textShadow: footerShadow,
              }}
            >
              {bottomStatement}
            </p>
          </div>
        )}
      </div>

      <LogoOverlay
        show={c.showLogo ?? false}
        variant={c.logoVariant ?? "light"}
        xPercent={c.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={c.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={c.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

function StageCard({
  index,
  stage,
  isLast,
  branding,
  accent,
  fallbackHeadlineFont,
  fallbackBodyFont,
}: {
  index: number;
  stage: ProcessStage;
  isLast: boolean;
  branding: DeckBranding;
  accent: string;
  fallbackHeadlineFont: string;
  fallbackBodyFont: string;
}) {
  const num = String(index + 1).padStart(2, "0");

  // Per-item: stage name
  const nameFont = stage.nameFont ?? fallbackHeadlineFont;
  const nameSize = stage.nameSize ?? 1.0;
  const nameColor = stage.nameColor ?? branding.textColor;
  const nameShadow = makeOutlineShadow(stage.nameOutline);

  // Per-item: bullets
  const bulletsFont = stage.bulletsFont ?? fallbackBodyFont;
  const bulletsSize = stage.bulletsSize ?? 1.0;
  const bulletsColor = stage.bulletsColor ?? branding.textColor;
  const bulletsShadow = makeOutlineShadow(stage.bulletsOutline);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Card */}
      <div
        style={{
          flex: 1,
          background: "#FFFFFF",
          borderRadius: 8,
          padding: "7% 8% 6%",
          display: "flex",
          flexDirection: "column",
          boxShadow: CARD_SHADOWS.elevated,
          border: `1px solid rgba(0,0,0,0.06)`,
        }}
      >
        {/* Step number */}
        <div
          style={{
            fontSize: "2.4em",
            fontWeight: 900,
            lineHeight: 1,
            color: accent,
            marginBottom: "6%",
            fontFamily: "serif",
            opacity: 0.9,
          }}
        >
          {num}
        </div>

        {/* Stage name */}
        <h3
          style={{
            fontSize: `${0.82 * nameSize}em`,
            fontWeight: (stage.nameBold ?? true) ? 800 : 400,
            fontFamily: nameFont,
            fontStyle: stage.nameItalic ? "italic" : undefined,
            textDecoration: stage.nameUnderline ? "underline" : undefined,
            color: nameColor,
            lineHeight: 1.2,
            marginBottom: "6%",
            textShadow: nameShadow,
          }}
        >
          {stage.name}
        </h3>

        {/* Accent rule */}
        <div
          style={{
            height: 2,
            width: "2.5em",
            background: accent,
            borderRadius: 1,
            marginBottom: "8%",
          }}
        />

        {/* Bullets */}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
          {stage.bullets.map((b, bi) => (
            <li
              key={bi}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "6%",
                marginBottom: bi < stage.bullets.length - 1 ? "5%" : 0,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: accent,
                  marginTop: "0.45em",
                }}
              />
              <span
                style={{
                  fontSize: `${0.64 * bulletsSize}em`,
                  fontFamily: bulletsFont,
                  fontWeight: stage.bulletsBold ? 700 : 400,
                  fontStyle: stage.bulletsItalic ? "italic" : undefined,
                  textDecoration: stage.bulletsUnderline ? "underline" : undefined,
                  color: bulletsColor,
                  lineHeight: 1.65,
                  opacity: 0.78,
                  textShadow: bulletsShadow,
                }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Arrow connector (between cards, not after last) */}
      {!isLast && (
        <div
          style={{
            position: "absolute",
            right: "-14%",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10h12M12 5l5 5-5 5"
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

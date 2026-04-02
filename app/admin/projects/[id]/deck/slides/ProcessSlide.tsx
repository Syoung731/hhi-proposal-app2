"use client";

import type { ProposalSlide, DeckBranding, ProcessContent, ProcessStage } from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
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
  const stages = c.stages && c.stages.length > 0 ? c.stages : DEFAULT_STAGES;
  const bottomStatement = c.bottomStatement ?? DEFAULT_BOTTOM;
  const title = slide.headline ?? "Our Process: From Vision to Finished Home";

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
            <circle cx="1" cy="1" r="1" fill={branding.accentColor} opacity="0.12" />
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
          background: branding.accentColor,
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
          {slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: "0.65em",
                fontWeight: 600,
                letterSpacing: "0.13em",
                color: branding.accentColor,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: "2.4em", fontWeight: 800,
              color: branding.textColor, lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={branding.accentColor} />
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
            />
          ))}
        </div>

        {/* Bottom statement */}
        {bottomStatement && (
          <div
            style={{
              flexShrink: 0, marginTop: "3%",
              borderTop: `1px solid ${branding.accentColor}40`,
              paddingTop: "2%",
              textAlign: "center",
            }}
          >
            <p
              className="font-serif"
              style={{
                fontSize: "0.73em", fontWeight: 600,
                color: branding.textColor, lineHeight: 1.5,
                fontStyle: "italic", opacity: 0.75,
              }}
            >
              {bottomStatement}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

function StageCard({
  index,
  stage,
  isLast,
  branding,
}: {
  index: number;
  stage: ProcessStage;
  isLast: boolean;
  branding: DeckBranding;
}) {
  const num = String(index + 1).padStart(2, "0");

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
          boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
          border: `1px solid rgba(0,0,0,0.06)`,
        }}
      >
        {/* Step number */}
        <div
          style={{
            fontSize: "2.4em",
            fontWeight: 900,
            lineHeight: 1,
            color: branding.accentColor,
            marginBottom: "6%",
            fontFamily: "serif",
            opacity: 0.9,
          }}
        >
          {num}
        </div>

        {/* Stage name */}
        <h3
          className="font-serif"
          style={{
            fontSize: "0.82em",
            fontWeight: 800,
            color: branding.textColor,
            lineHeight: 1.2,
            marginBottom: "6%",
          }}
        >
          {stage.name}
        </h3>

        {/* Accent rule */}
        <div
          style={{
            height: 2,
            width: "2.5em",
            background: branding.accentColor,
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
                  background: branding.accentColor,
                  marginTop: "0.45em",
                }}
              />
              <span
                style={{
                  fontSize: "0.64em",
                  color: branding.textColor,
                  lineHeight: 1.65,
                  opacity: 0.78,
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
              stroke={branding.accentColor}
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

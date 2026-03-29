"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ObjectiveContent,
} from "@/app/lib/deck/types";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
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

// ─── Shared SVG: architectural floor-plan sketch ──────────────────────────────
function FloorPlanSvg({ color = "#334155" }: { color?: string }) {
  return (
    <svg viewBox="0 0 320 420" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <path d="M24 24 L296 24 L296 262 L220 262 L220 396 L24 396 Z" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="148" y1="24"  x2="148" y2="170" stroke={color} strokeWidth="2" />
      <line x1="24"  y1="170" x2="296" y2="170" stroke={color} strokeWidth="2" />
      <line x1="148" y1="270" x2="220" y2="270" stroke={color} strokeWidth="2" />
      <line x1="24"  y1="270" x2="108" y2="270" stroke={color} strokeWidth="2" />
      <path d="M148 90 A32 32 0 0 0 116 90" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M78 170 A28 28 0 0 1 78 198" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x="153" y="29"  width="138" height="20" stroke={color} strokeWidth="1.5" />
      <rect x="269" y="29"  width="22"  height="64" stroke={color} strokeWidth="1.5" />
      <circle cx="224" cy="50" r="6" stroke={color} strokeWidth="1" />
      <circle cx="244" cy="50" r="6" stroke={color} strokeWidth="1" />
      <rect x="168" y="110" width="80" height="48" rx="3" stroke={color} strokeWidth="1" strokeDasharray="4 3" />
      <rect x="30"  y="182" width="54" height="36" rx="4" stroke={color} strokeWidth="1.5" />
      <ellipse cx="57" cy="234" rx="20" ry="16" stroke={color} strokeWidth="1.5" />
      <rect x="30"  y="284" width="68" height="58" stroke={color} strokeWidth="1.5" />
      <rect x="30"  y="350" width="42" height="38" stroke={color} strokeWidth="1" />
      <line x1="30"  y1="350" x2="72"  y2="388" stroke={color} strokeWidth="0.75" strokeDasharray="3 3" />
      <line x1="72"  y1="350" x2="30"  y2="388" stroke={color} strokeWidth="0.75" strokeDasharray="3 3" />
      <line x1="24"  y1="14" x2="148" y2="14" stroke={color} strokeWidth="0.75" />
      <line x1="24"  y1="10" x2="24"  y2="18" stroke={color} strokeWidth="0.75" />
      <line x1="148" y1="10" x2="148" y2="18" stroke={color} strokeWidth="0.75" />
      <line x1="148" y1="14" x2="296" y2="14" stroke={color} strokeWidth="0.75" />
      <line x1="296" y1="10" x2="296" y2="18" stroke={color} strokeWidth="0.75" />
      <circle cx="284" cy="380" r="18" stroke={color} strokeWidth="1" />
      <path d="M284 365 L279 381 L284 377 L289 381 Z" fill={color} />
      <line x1="284" y1="365" x2="284" y2="396" stroke={color} strokeWidth="0.75" />
    </svg>
  );
}

function BlueprintPatternSvg() {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <g stroke="#1E3A5F" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 40 L700 40 L700 340 L540 340 L540 460 L60 460 Z" strokeWidth="3" />
        <line x1="310" y1="40"  x2="310" y2="210" strokeWidth="2" />
        <line x1="60"  y1="210" x2="700" y2="210" strokeWidth="2" />
        <line x1="310" y1="320" x2="540" y2="320" strokeWidth="2" />
        <line x1="60"  y1="320" x2="210" y2="320" strokeWidth="2" />
        <line x1="430" y1="210" x2="430" y2="340" strokeWidth="2" />
        <path d="M310 118 A62 62 0 0 0 248 118" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M168 210 A56 56 0 0 1 168 266" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M430 268 A52 52 0 0 0 378 268" strokeWidth="1.5" strokeDasharray="3 4" />
        <rect x="320" y="50"  width="290" height="30" strokeWidth="1.5" />
        <rect x="575" y="50"  width="32"  height="94" strokeWidth="1.5" />
        <circle cx="468" cy="74" r="9" strokeWidth="1" />
        <circle cx="492" cy="74" r="9" strokeWidth="1" />
        <rect x="380" y="138" width="110" height="64" rx="4" strokeWidth="1" strokeDasharray="4 3" />
        <ellipse cx="148" cy="262" rx="36" ry="28" strokeWidth="1.5" />
        <rect x="78"  y="224" width="82"  height="52" rx="5" strokeWidth="1.5" />
        <rect x="82"  y="338" width="108" height="90" strokeWidth="1.5" />
        <rect x="82"  y="430" width="48"  height="26" strokeWidth="1" />
        <rect x="140" y="430" width="48"  height="26" strokeWidth="1" />
        <line x1="60"  y1="22" x2="310" y2="22" strokeWidth="0.75" />
        <line x1="60"  y1="16" x2="60"  y2="28" strokeWidth="0.75" />
        <line x1="310" y1="16" x2="310" y2="28" strokeWidth="0.75" />
        <line x1="310" y1="22" x2="700" y2="22" strokeWidth="0.75" />
        <line x1="700" y1="16" x2="700" y2="28" strokeWidth="0.75" />
        <line x1="620" y1="440" x2="720" y2="440" strokeWidth="1" />
        <line x1="620" y1="435" x2="620" y2="445" strokeWidth="1" />
        <line x1="670" y1="435" x2="670" y2="445" strokeWidth="1" />
        <line x1="720" y1="435" x2="720" y2="445" strokeWidth="1" />
        <circle cx="752" cy="82" r="22" strokeWidth="1" />
        <path d="M752 63 L746 82 L752 77 L758 82 Z" fill="#1E3A5F" />
        <line x1="752" y1="63" x2="752" y2="102" strokeWidth="0.75" />
      </g>
    </svg>
  );
}

// ─── Shared text-block content renderer ───────────────────────────────────────
// Used by every layout — renders headline, statement, supporting, bullets
// with all the user-controlled sizes, colors and outlines.

function TextContent({
  slide, branding, content,
  headlineColor, headlineShadow, headlineEm,
  statementColor, statementShadow, statementEm,
  supportingColor, supportingEm,
  bulletColor,
  showStatement = true,
  showSupporting = true,
  showBullets = true,
  bulletLayout = "list",   // "list" | "row" | "row3"
  headlineStyle = "large", // "large" | "uppercase"
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
  const bullets = (content.bullets ?? []).filter(Boolean);
  return (
    <>
      {/* Headline */}
      {headlineStyle === "uppercase" ? (
        <p
          className="uppercase tracking-widest"
          style={{
            fontSize: `${0.65 * headlineEm}em`, fontWeight: 600,
            color: headlineColor, letterSpacing: "0.18em",
            marginBottom: "3%", textShadow: headlineShadow,
          }}
        >
          {slide.headline || "Project Objective"}
          {slide.subheadline && (
            <span style={{ display: "block", fontSize: "0.9em", opacity: 0.75, marginTop: "0.3em", letterSpacing: "0.06em", textTransform: "none" }}>
              {slide.subheadline}
            </span>
          )}
        </p>
      ) : (
        <h1
          className="font-serif"
          style={{
            fontSize: `${2.4 * headlineEm}em`, fontWeight: 800,
            color: headlineColor, lineHeight: 1.1,
            marginBottom: "2%", textShadow: headlineShadow,
          }}
        >
          {slide.headline || "Project Objective"}
          {slide.subheadline && <span style={{ display: "block" }}>{slide.subheadline}</span>}
        </h1>
      )}

      {/* Accent rule */}
      <div style={{ height: 2, width: "4em", background: branding.accentColor, marginBottom: "3%", flexShrink: 0 }} />

      {/* Statement */}
      {showStatement && content.statementText && (
        <p
          className="font-serif"
          style={{
            fontSize: `${statementEm}em`, fontWeight: 600,
            color: statementColor, lineHeight: 1.45,
            marginBottom: "3%", textShadow: statementShadow,
          }}
        >
          {content.statementText}
        </p>
      )}

      {/* Supporting */}
      {showSupporting && content.supportingText && (
        <p style={{ fontSize: `${supportingEm}em`, color: supportingColor, lineHeight: 1.65, marginBottom: "3%" }}>
          {content.supportingText}
        </p>
      )}

      {/* Bullets */}
      {showBullets && bullets.length > 0 && (
        bulletLayout === "list" ? (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5em" }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.6em" }}>
                <span style={{ flexShrink: 0, width: "0.5em", height: "0.5em", background: bulletColor, borderRadius: "50%", marginTop: "0.45em", display: "block" }} />
                <span style={{ fontSize: `${supportingEm}em`, color: bulletColor, lineHeight: 1.5 }}>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ display: "flex", gap: "5%" }}>
            {bullets.slice(0, 3).map((b, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ borderTop: `2px solid ${branding.accentColor}`, paddingTop: "0.55em", marginBottom: "0.4em" }} />
                <p style={{ fontSize: `${supportingEm * 0.88}em`, color: bulletColor, lineHeight: 1.5 }}>{b}</p>
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
  extraStyle?: React.CSSProperties,
): React.ReactNode {
  return (
    <div
      style={{
        position: "absolute",
        left: `${textX * 100}%`,
        top: `${textY * 100}%`,
        width: maxWidth,
        zIndex: 2,
        ...extraStyle,
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

// ─── 1. Statement-Left ────────────────────────────────────────────────────────
function StatementLeftLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const hasBg = !!slide.backgroundId;

  const headlineEm    = content.headlineSize    ?? 1.0;
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
        <div style={{ position: "absolute", bottom: "3%", left: "6%", right: "6%", borderTop: `1px solid ${branding.accentColor}40`, paddingTop: "1%" }}>
          <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>{branding.address ?? ""}</span>
        </div>
      )}
    </div>
  );
}

// ─── 2. Dark-Statement ────────────────────────────────────────────────────────
function DarkStatementLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const hasBg = !!slide.backgroundId;
  const proofPoints = (content.bullets ?? []).filter(Boolean);

  const headlineEm    = content.headlineSize    ?? 1.0;
  const headlineColor = content.headlineColor   ?? branding.accentColor;
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

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: hasBg ? "transparent" : "#152B45" }}
    >
      {/* Entire content block — headline (uppercase) + bracketed statement + proof points */}
      {positionedBlock(textX, textY, `${textWidth}%`, showCard, cardBg,
        <>
          {/* Small uppercase headline */}
          <p
            className="uppercase tracking-widest"
            style={{
              fontSize: `${0.65 * headlineEm}em`, fontWeight: 600,
              color: headlineColor, letterSpacing: "0.18em",
              marginBottom: "4%", textShadow: headlineShadow,
            }}
          >
            {slide.headline || "Project Objective"}
            {slide.subheadline && (
              <span style={{ display: "block", fontSize: "0.9em", opacity: 0.75, marginTop: "0.3em", letterSpacing: "0.06em", textTransform: "none" }}>
                {slide.subheadline}
              </span>
            )}
          </p>

          {/* Corner-bracketed statement */}
          <div style={{ position: "relative", padding: "6% 5%" }}>
            {/* Top-left */}
            <div style={{ position: "absolute", top: 0, left: 0, width: "2em", height: "2em", borderTop: `2px solid ${branding.accentColor}`, borderLeft: `2px solid ${branding.accentColor}` }} />
            {/* Top-right */}
            <div style={{ position: "absolute", top: 0, right: 0, width: "2em", height: "2em", borderTop: `2px solid ${branding.accentColor}`, borderRight: `2px solid ${branding.accentColor}` }} />
            {/* Bottom-left */}
            <div style={{ position: "absolute", bottom: 0, left: 0, width: "2em", height: "2em", borderBottom: `2px solid ${branding.accentColor}`, borderLeft: `2px solid ${branding.accentColor}` }} />
            {/* Bottom-right */}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: "2em", height: "2em", borderBottom: `2px solid ${branding.accentColor}`, borderRight: `2px solid ${branding.accentColor}` }} />

            <p
              className="font-serif"
              style={{
                fontSize: `${statementEm}em`, color: statementColor,
                lineHeight: 1.4, textAlign: "center", fontWeight: 400,
                textShadow: statementShadow,
              }}
            >
              {content.statementText || "Our objective is to deliver exceptional results for your project."}
            </p>
          </div>

          {/* Proof points */}
          {proofPoints.length > 0 && (
            <>
              <div style={{ height: 1, background: `${branding.accentColor}50`, margin: "4% 0 3%" }} />
              <div style={{ display: "flex", gap: "5%" }}>
                {proofPoints.slice(0, 3).map((pt, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: "0.6em" }}>
                    <span style={{ flexShrink: 0, width: "0.5em", height: "0.5em", minWidth: "0.5em", background: branding.accentColor, marginTop: "0.38em", display: "block" }} />
                    <p style={{ fontSize: `${supportingEm}em`, color: bulletColor, lineHeight: 1.45 }}>{pt}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── 3. Executive-Summary ─────────────────────────────────────────────────────
function ExecutiveSummaryLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const hasBg = !!slide.backgroundId;

  const headlineEm    = content.headlineSize    ?? 1.0;
  const headlineColor = content.headlineColor   ?? branding.textColor;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const statementEm   = content.statementSize   ?? 0.82;
  const statementColor = content.statementColor ?? "#374151";
  const statementShadow = makeOutlineShadow(content.statementOutline);
  const supportingEm  = content.supportingSize  ?? 0.70;
  const supportingColor = content.supportingColor ?? "#4B5563";
  const bulletColor   = content.bulletColor     ?? "#4B5563";
  const textX         = content.textX           ?? 0.04;
  const textY         = content.textY           ?? 0.06;
  const textWidth     = content.textWidth       ?? 58;
  const showCard      = content.showCard        ?? false;
  const cardBg        = hexToRgba(content.cardColor ?? "#000000", content.cardOpacity ?? 60);

  const approachText = content.supportingText ?? null;
  const bullets      = (content.bullets ?? []).filter(Boolean);
  const outcomeText  = bullets.length > 0 ? bullets.join(" ") : null;
  const hasColumns   = !!(approachText || outcomeText);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: hasBg ? "transparent" : "#FAFAF8" }}
    >
      {/* Right floor-plan decoration */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "38%", height: "100%", opacity: 0.14, pointerEvents: "none" }}>
        <FloorPlanSvg color={branding.textColor} />
      </div>

      {/* Left text block */}
      {positionedBlock(textX, textY, `${textWidth}%`, showCard, cardBg,
        <>
          <h1
            className="font-serif"
            style={{
              fontSize: `${2.1 * headlineEm}em`, fontWeight: 800,
              color: headlineColor, lineHeight: 1.1,
              marginBottom: "2%", textShadow: headlineShadow,
            }}
          >
            {slide.headline || "Executive Summary"}
            {slide.subheadline && <span style={{ display: "block" }}>{slide.subheadline}</span>}
          </h1>

          <div style={{ height: 2, width: "4.5em", background: branding.accentColor, marginBottom: "3%", flexShrink: 0 }} />

          {content.statementText && (
            <div style={{ borderLeft: `3px solid ${branding.accentColor}`, paddingLeft: "1em", marginBottom: hasColumns ? "4%" : "3%" }}>
              <p style={{ fontSize: `${statementEm}em`, color: statementColor, lineHeight: 1.6, textShadow: statementShadow }}>
                {content.statementText}
              </p>
            </div>
          )}

          {hasColumns && (
            <div style={{ display: "flex", gap: "6%" }}>
              {approachText && (
                <div style={{ flex: 1 }}>
                  <div style={{ borderTop: `2px solid ${branding.accentColor}`, paddingTop: "0.55em", marginBottom: "0.5em" }}>
                    <p className="font-serif" style={{ fontSize: `${supportingEm}em`, fontWeight: 700, color: headlineColor }}>The Approach</p>
                  </div>
                  <p style={{ fontSize: `${supportingEm * 0.93}em`, color: supportingColor, lineHeight: 1.55 }}>{approachText}</p>
                </div>
              )}
              {outcomeText && (
                <div style={{ flex: 1 }}>
                  <div style={{ borderTop: `2px solid ${branding.accentColor}`, paddingTop: "0.55em", marginBottom: "0.5em" }}>
                    <p className="font-serif" style={{ fontSize: `${supportingEm}em`, fontWeight: 700, color: headlineColor }}>The Outcome</p>
                  </div>
                  <p style={{ fontSize: `${supportingEm * 0.93}em`, color: bulletColor, lineHeight: 1.55 }}>{outcomeText}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer — no background only */}
      {!hasBg && (
        <div style={{ position: "absolute", bottom: "3%", left: "6%", right: "6%", borderTop: "1px solid #E5E7EB", paddingTop: "1%" }}>
          <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>{branding.address ?? ""}</span>
        </div>
      )}
    </div>
  );
}

// ─── 4. Blueprint-Overlay ─────────────────────────────────────────────────────
function BlueprintOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as ObjectiveContent;
  const hasBg = !!slide.backgroundId;

  const headlineEm    = content.headlineSize    ?? 1.0;
  const headlineColor = content.headlineColor   ?? branding.textColor;
  const headlineShadow = makeOutlineShadow(content.headlineOutline);
  const statementEm   = content.statementSize   ?? 1.22;
  const statementColor = content.statementColor ?? branding.textColor;
  const statementShadow = makeOutlineShadow(content.statementOutline);
  const supportingEm  = content.supportingSize  ?? 0.80;
  const supportingColor = content.supportingColor ?? "#4B5563";
  const bulletColor   = content.bulletColor     ?? "#374151";
  const textX         = content.textX           ?? 0.06;
  const textY         = content.textY           ?? 0.06;
  const textWidth     = content.textWidth       ?? 84;
  const showCard      = content.showCard        ?? false;
  const cardBg        = hexToRgba(content.cardColor ?? "#000000", content.cardOpacity ?? 60);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: hasBg ? "transparent" : "#FAFAF8" }}
    >
      {/* Blueprint watermark */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.055, pointerEvents: "none" }}>
        <BlueprintPatternSvg />
      </div>

      {positionedBlock(textX, textY, `${textWidth}%`, showCard, cardBg,
        <>
          <h1
            className="font-serif"
            style={{
              fontSize: `${2.4 * headlineEm}em`, fontWeight: 800,
              color: headlineColor, lineHeight: 1.08,
              marginBottom: "1.5%", textShadow: headlineShadow,
            }}
          >
            {slide.headline || "Project Objective"}
            {slide.subheadline && <span style={{ display: "block" }}>{slide.subheadline}</span>}
          </h1>

          <div style={{ height: 2, background: branding.accentColor, width: "100%", marginBottom: "3%", flexShrink: 0 }} />

          {content.statementText && (
            <p
              className="font-serif"
              style={{
                fontSize: `${statementEm}em`, fontStyle: "italic",
                color: statementColor, lineHeight: 1.45, fontWeight: 400,
                marginBottom: "2.5%", maxWidth: "76%", textShadow: statementShadow,
              }}
            >
              {content.statementText}
            </p>
          )}

          {content.supportingText && (
            <p style={{ fontSize: `${supportingEm}em`, color: supportingColor, lineHeight: 1.65, maxWidth: "65%", marginBottom: "3%" }}>
              {content.supportingText}
            </p>
          )}

          {(content.bullets ?? []).filter(Boolean).length > 0 && (
            <div style={{ display: "flex", gap: "5%" }}>
              {(content.bullets ?? []).filter(Boolean).slice(0, 3).map((b, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{ borderTop: `2px solid ${branding.accentColor}`, paddingTop: "0.55em", marginBottom: "0.4em" }} />
                  <p style={{ fontSize: `${supportingEm * 0.9}em`, color: bulletColor, lineHeight: 1.5 }}>{b}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      {!hasBg && (
        <div style={{ position: "absolute", bottom: "3%", left: "7%", right: "7%", borderTop: `1px solid ${branding.accentColor}40`, paddingTop: "1%" }}>
          <span style={{ fontSize: "0.6em", color: "#9CA3AF" }}>{branding.address ?? ""}</span>
        </div>
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function ObjectiveSlide({ slide, branding }: Props) {
  switch (slide.layoutKey) {
    case "dark-statement":
      return <DarkStatementLayout slide={slide} branding={branding} />;
    case "executive-summary":
      return <ExecutiveSummaryLayout slide={slide} branding={branding} />;
    case "blueprint-overlay":
      return <BlueprintOverlayLayout slide={slide} branding={branding} />;
    case "statement-left":
    default:
      return <StatementLeftLayout slide={slide} branding={branding} />;
  }
}

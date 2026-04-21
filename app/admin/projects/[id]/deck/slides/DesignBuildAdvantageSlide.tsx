"use client";

import type {
  ProposalSlide,
  DeckBranding,
  DesignBuildAdvantageContent,
  DesignBuildPillar,
  DesignBuildGuarantee,
  DesignBuildDiagramNode,
  DesignBuildSupportColumn,
} from "@/app/lib/deck/types";
import {
  DEFAULT_PILLARS,
  DEFAULT_GUARANTEES,
  DEFAULT_DIAGRAM_NODES,
  DEFAULT_SUPPORT_COLUMNS,
} from "@/app/lib/design-build-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { PhotoOverlay } from "@/components/slides/shared/PhotoOverlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, ACCENT_RULE_WIDTH, SLIDE_FONTS, CARD_SHADOWS, CARD_PADDING, CARD_BORDER, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const LINEN = "#F5F0E8";
const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Lucide-style SVG icons ─────────────────────────────────────────────────

function IconSvg({ children, color, size = "1.3em" }: { children: React.ReactNode; color: string; size?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  Shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  Users: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </>
  ),
  DollarSign: (
    <>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </>
  ),
  PenTool: (
    <>
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </>
  ),
  Ruler: (
    <>
      <path d="M21.7 4.3L19.7 2.3a1 1 0 00-1.4 0l-16 16a1 1 0 000 1.4l2 2a1 1 0 001.4 0l16-16a1 1 0 000-1.4z" />
      <path d="M14.5 7.5l1 1M11.5 10.5l1 1M8.5 13.5l1 1M5.5 16.5l1 1" />
    </>
  ),
  Lightbulb: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
  Clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  CheckCircle: (
    <>
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
};

function renderIcon(name: string, color: string, size?: string) {
  return (
    <IconSvg color={color} size={size}>
      {ICON_PATHS[name] ?? ICON_PATHS.Shield}
    </IconSvg>
  );
}

// ─── Architectural watermark ────────────────────────────────────────────────

function ArchitecturalWatermark({ color = NAVY, opacity = 0.04 }: { color?: string; opacity?: number }) {
  return (
    <svg
      width="220" height="220" viewBox="0 0 220 220" fill="none" stroke={color} strokeWidth={0.7}
      style={{ position: "absolute", top: "3%", right: "3%", opacity, pointerEvents: "none", zIndex: 2 }}
    >
      <circle cx="110" cy="110" r="100" />
      <circle cx="110" cy="110" r="70" />
      <line x1="110" y1="10" x2="110" y2="210" />
      <line x1="10" y1="110" x2="210" y2="110" />
      <line x1="39" y1="39" x2="181" y2="181" />
      <line x1="181" y1="39" x2="39" y2="181" />
      <circle cx="110" cy="110" r="8" fill={color} fillOpacity={opacity * 3} stroke="none" />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function DesignBuildAdvantageSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as DesignBuildAdvantageContent;
  const layoutKey = slide.layoutKey as string;
  const headline = slide.headline ?? "The Design-Build Advantage";
  const subheadline = c.subheadline ?? null;
  const bgStyle = c.backgroundStyle ?? "dark";
  const bgPhoto = c.backgroundPhoto ?? null;
  const footerNote = c.footerNote ?? null;
  const accent = c.accentColor ?? GOLD;
  const pillars = c.pillars && c.pillars.length > 0 ? c.pillars : DEFAULT_PILLARS;
  const guarantees = c.guarantees && c.guarantees.length > 0 ? c.guarantees : DEFAULT_GUARANTEES;
  const nodes = c.diagramNodes && c.diagramNodes.length > 0 ? c.diagramNodes : DEFAULT_DIAGRAM_NODES;
  const columns = c.supportColumns && c.supportColumns.length > 0 ? c.supportColumns : DEFAULT_SUPPORT_COLUMNS;

  switch (layoutKey) {
    case "icon-cards":
      return <IconCardsLayout headline={headline} subheadline={subheadline} pillars={pillars} bgPhoto={bgPhoto} hasAiBackground={hasAiBackground} branding={branding} content={c} accent={accent} />;
    case "bold-guarantee":
      return <BoldGuaranteeLayout headline={headline} subheadline={subheadline} guarantees={guarantees} bgStyle={bgStyle} bgPhoto={bgPhoto} footerNote={footerNote} hasAiBackground={hasAiBackground} branding={branding} content={c} accent={accent} />;
    case "quad-grid":
      return <QuadGridLayout headline={headline} subheadline={subheadline} pillars={pillars} bgPhoto={bgPhoto} hasAiBackground={hasAiBackground} branding={branding} content={c} accent={accent} />;
    case "cycle-diagram":
      return <CycleDiagramLayout headline={headline} nodes={nodes} columns={columns} hasAiBackground={hasAiBackground} branding={branding} content={c} accent={accent} />;
    default:
      return <IconCardsLayout headline={headline} subheadline={subheadline} pillars={pillars} bgPhoto={bgPhoto} hasAiBackground={hasAiBackground} branding={branding} content={c} accent={accent} />;
  }
}

// ─── Layout A: Icon Cards ───────────────────────────────────────────────────

function IconCardsLayout({
  headline, subheadline, pillars, bgPhoto, hasAiBackground, branding, content, accent,
}: {
  headline: string; subheadline: string | null; pillars: DesignBuildPillar[];
  bgPhoto: string | null; hasAiBackground?: boolean; branding: DeckBranding;
  content: DesignBuildAdvantageContent; accent: string;
}) {
  const hasBg = !!bgPhoto;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? (hasBg ? "#FFFFFF" : NAVY);
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? (hasBg ? "rgba(255,255,255,0.7)" : MUTED_NAVY);
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Fallbacks for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const bodyColor = content.bodyColor ?? (hasBg ? "rgba(255,255,255,0.7)" : MUTED_NAVY);
  const textColor = slideTitleColor;

  const overlayOpacity = content.overlayOpacity ?? undefined;
  const cardShadowKey = content.cardShadow ?? "normal";
  const cardShadow = cardShadowKey === "none" ? "none" : (CARD_SHADOWS[cardShadowKey as keyof typeof CARD_SHADOWS] ?? CARD_SHADOWS.normal);
  const cardPad = CARD_PADDING[content.cardSpacing ?? "normal"] ?? CARD_PADDING.normal;
  const cardBorder = content.cardBorderStyle === "accent" ? `2px solid ${accent}` : content.cardBorderStyle === "subtle" ? CARD_BORDER.subtle : CARD_BORDER.none;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg && <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />}
      {hasBg && <PhotoOverlay opacity={overlayOpacity ?? 0.55} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: LINEN }} />}
      {!hasBg && <ArchitecturalWatermark />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content, alignItems: "center" }}>
        <div style={{
          fontFamily: slideTitleFont,
          fontSize: `${1.25 * slideTitleSize}em`,
          fontWeight: (content.slideTitleBold ?? true) ? 600 : 400,
          fontStyle: content.slideTitleItalic ? "italic" : undefined,
          textDecoration: content.slideTitleUnderline ? "underline" : undefined,
          color: textColor,
          textAlign: "center",
          lineHeight: 1.2,
          textShadow: slideTitleShadow,
        }}>
          {headline}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom={subheadline ? "0.3em" : "0.8em"} />
        </div>
        {subheadline && (
          <div style={{
            fontFamily: subFont,
            fontSize: `${0.5 * subSize}em`,
            fontWeight: content.subheadlineBold ? 700 : 400,
            fontStyle: content.subheadlineItalic ? "italic" : undefined,
            textDecoration: content.subheadlineUnderline ? "underline" : undefined,
            color: subColor,
            textAlign: "center",
            marginBottom: "0.8em",
            maxWidth: "70%",
            textShadow: subShadow,
          }}>
            {subheadline}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", gap: "1.2em", alignItems: "flex-start", width: "100%" }}>
          {pillars
            .filter((p) => {
              const title = (p.title ?? "").trim();
              const description = (p.description ?? "").trim();
              // Hide pillars with no content or only the legacy "New Pillar"
              // placeholder — keeps older decks clean without a data migration.
              if (!title && !description) return false;
              if (title === "New Pillar" && !description) return false;
              return true;
            })
            .map((p) => {
            const tFont = p.titleFont ?? fallbackBodyFont;
            const tSize = p.titleSize ?? 1.0;
            const tColor = p.titleColor ?? textColor;
            const dFont = p.descriptionFont ?? fallbackBodyFont;
            const dSize = p.descriptionSize ?? 1.0;
            const dColor = p.descriptionColor ?? bodyColor;

            return (
              <div key={p.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: cardPad, boxShadow: cardShadow, borderLeft: cardBorder !== "none" ? cardBorder : undefined, borderRadius: 4 }}>
                <div style={{ marginBottom: "0.4em" }}>
                  {p.iconUrl ? (
                    <img src={p.iconUrl} alt={p.title} style={{ width: "1.6em", height: "1.6em", objectFit: "contain" }} />
                  ) : (
                    renderIcon(p.icon, accent, "1.6em")
                  )}
                </div>
                <div style={{
                  fontFamily: tFont,
                  fontSize: `${0.55 * tSize}em`,
                  fontWeight: (p.titleBold ?? true) ? 600 : 400,
                  fontStyle: p.titleItalic ? "italic" : undefined,
                  textDecoration: p.titleUnderline ? "underline" : undefined,
                  color: tColor,
                  lineHeight: 1.3,
                  marginBottom: "0.25em",
                  textShadow: makeOutlineShadow(p.titleOutline),
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontFamily: dFont,
                  fontSize: `${0.42 * dSize}em`,
                  fontWeight: p.descriptionBold ? 700 : 400,
                  fontStyle: p.descriptionItalic ? "italic" : undefined,
                  textDecoration: p.descriptionUnderline ? "underline" : undefined,
                  color: dColor,
                  lineHeight: 1.55,
                  textShadow: makeOutlineShadow(p.descriptionOutline),
                }}>
                  {p.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={hasBg ? "dark" : "light"}
        xPercent={content.logoX ?? 85}
        yPercent={content.logoY ?? 88}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: Bold Guarantee ───────────────────────────────────────────────

function BoldGuaranteeLayout({
  headline, subheadline, guarantees, bgStyle, bgPhoto, footerNote, hasAiBackground, branding, content, accent,
}: {
  headline: string; subheadline: string | null; guarantees: DesignBuildGuarantee[];
  bgStyle: "light" | "dark"; bgPhoto: string | null; footerNote: string | null;
  hasAiBackground?: boolean; branding: DeckBranding; content: DesignBuildAdvantageContent; accent: string;
}) {
  const hasBg = !!bgPhoto;
  const isDark = bgStyle === "dark" || hasBg;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? (isDark ? "#FFFFFF" : NAVY);
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? (isDark ? "rgba(255,255,255,0.6)" : MUTED_NAVY);
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Per-field: Footer note
  const footerFont = content.footerNoteFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const footerSize = content.footerNoteSize ?? 1.0;
  const footerColor = content.footerNoteColor ?? content.bodyColor ?? (isDark ? "rgba(255,255,255,0.6)" : MUTED_NAVY);
  const footerShadow = makeOutlineShadow(content.footerNoteOutline);

  // Fallbacks for per-item
  const fallbackHeadlineFont = content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const textColor = slideTitleColor;
  const mutedColor = content.bodyColor ?? (isDark ? "rgba(255,255,255,0.6)" : MUTED_NAVY);

  const solidBg = bgStyle === "dark" ? NAVY : LINEN;
  const overlayOpacity = content.overlayOpacity ?? undefined;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg && <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />}
      {hasBg && <PhotoOverlay opacity={overlayOpacity ?? 0.6} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: solidBg }} />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.centered, alignItems: "center", justifyContent: "center" }}>
        <div style={{
          fontFamily: slideTitleFont,
          fontSize: `${1.3 * slideTitleSize}em`,
          fontWeight: (content.slideTitleBold ?? true) ? 600 : 400,
          fontStyle: content.slideTitleItalic ? "italic" : undefined,
          textDecoration: content.slideTitleUnderline ? "underline" : undefined,
          color: textColor,
          textAlign: "center",
          lineHeight: 1.2,
          textShadow: slideTitleShadow,
        }}>
          {headline}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom={subheadline ? "0.3em" : "1em"} />
        </div>
        {subheadline && (
          <div style={{
            fontFamily: subFont,
            fontSize: `${0.48 * subSize}em`,
            fontWeight: content.subheadlineBold ? 700 : 400,
            fontStyle: content.subheadlineItalic ? "italic" : undefined,
            textDecoration: content.subheadlineUnderline ? "underline" : undefined,
            color: subColor,
            textAlign: "center",
            marginBottom: "1em",
            textShadow: subShadow,
          }}>
            {subheadline}
          </div>
        )}

        <div style={{ display: "flex", gap: "5%", width: "100%", justifyContent: "center" }}>
          {guarantees.slice(0, 2).map((g) => {
            const tFont = g.titleFont ?? fallbackHeadlineFont;
            const tSize = g.titleSize ?? 1.0;
            const tColor = g.titleColor ?? textColor;
            const dFont = g.descriptionFont ?? fallbackBodyFont;
            const dSize = g.descriptionSize ?? 1.0;
            const dColor = g.descriptionColor ?? mutedColor;

            return (
              <div key={g.id} style={{ width: "45%" }}>
                <div style={{
                  fontFamily: tFont,
                  fontSize: `${1.1 * tSize}em`,
                  fontWeight: (g.titleBold ?? true) ? 700 : 400,
                  fontStyle: g.titleItalic ? "italic" : undefined,
                  textDecoration: g.titleUnderline ? "underline" : undefined,
                  color: tColor,
                  lineHeight: 1.2,
                  marginBottom: "0.3em",
                  textShadow: makeOutlineShadow(g.titleOutline),
                }}>
                  {g.title}
                </div>
                <div style={{
                  fontFamily: dFont,
                  fontSize: `${0.46 * dSize}em`,
                  fontWeight: g.descriptionBold ? 700 : 400,
                  fontStyle: g.descriptionItalic ? "italic" : undefined,
                  textDecoration: g.descriptionUnderline ? "underline" : undefined,
                  color: dColor,
                  lineHeight: 1.6,
                  textShadow: makeOutlineShadow(g.descriptionOutline),
                }}>
                  {g.description}
                </div>
              </div>
            );
          })}
        </div>

        {footerNote && (
          <div style={{
            position: "absolute",
            bottom: "4%",
            fontFamily: footerFont,
            fontSize: `${0.38 * footerSize}em`,
            fontWeight: content.footerNoteBold ? 700 : 400,
            fontStyle: (content.footerNoteItalic ?? true) ? "italic" : undefined,
            textDecoration: content.footerNoteUnderline ? "underline" : undefined,
            color: footerColor,
            textAlign: "center",
            textShadow: footerShadow,
          }}>
            {footerNote}
          </div>
        )}
      </div>

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={isDark ? "dark" : "light"}
        xPercent={content.logoX ?? 85}
        yPercent={content.logoY ?? 88}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout C: Quad Grid ────────────────────────────────────────────────────

function QuadGridLayout({
  headline, subheadline, pillars, bgPhoto, hasAiBackground, branding, content, accent,
}: {
  headline: string; subheadline: string | null; pillars: DesignBuildPillar[];
  bgPhoto: string | null; hasAiBackground?: boolean; branding: DeckBranding;
  content: DesignBuildAdvantageContent; accent: string;
}) {
  const hasBg = !!bgPhoto;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? (hasBg ? "#FFFFFF" : NAVY);
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? (hasBg ? "rgba(255,255,255,0.7)" : MUTED_NAVY);

  // Fallbacks
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const textColor = slideTitleColor;
  const mutedColor = content.bodyColor ?? (hasBg ? "rgba(255,255,255,0.7)" : MUTED_NAVY);

  const items = pillars.slice(0, 4);
  const threeOnly = items.length === 3;
  const overlayOpacity = content.overlayOpacity ?? undefined;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg && <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />}
      {hasBg && <PhotoOverlay opacity={overlayOpacity ?? 0.55} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: LINEN }} />}
      {!hasBg && <ArchitecturalWatermark />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <div style={{ textAlign: "center", marginBottom: "0.6em" }}>
          <div style={{
            fontFamily: slideTitleFont,
            fontSize: `${1.2 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 600 : 400,
            fontStyle: content.slideTitleItalic ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: textColor,
            lineHeight: 1.2,
            textShadow: slideTitleShadow,
          }}>{headline}</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom={subheadline ? "0.2em" : "0"} />
          </div>
          {subheadline && (
            <div style={{
              fontFamily: subFont,
              fontSize: `${0.45 * subSize}em`,
              fontWeight: content.subheadlineBold ? 700 : 400,
              fontStyle: content.subheadlineItalic ? "italic" : undefined,
              color: subColor,
            }}>{subheadline}</div>
          )}
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 0 }}>
          {items.map((p, i) => {
            const isRight = i % 2 === 1;
            const isBottom = i >= 2;
            const gridCol = threeOnly && i === 2 ? "1 / -1" : undefined;
            const tFont = p.titleFont ?? fallbackBodyFont;
            const tSize = p.titleSize ?? 1.0;
            const tColor = p.titleColor ?? textColor;
            const dFont = p.descriptionFont ?? fallbackBodyFont;
            const dSize = p.descriptionSize ?? 1.0;
            const dColor = p.descriptionColor ?? mutedColor;

            return (
              <div
                key={p.id}
                style={{
                  padding: "0.8em",
                  borderLeft: isRight && !hasBg ? `1px solid ${accent}30` : undefined,
                  borderTop: isBottom && !hasBg ? `1px solid ${accent}30` : undefined,
                  display: "flex",
                  flexDirection: "column",
                  ...(gridCol ? { gridColumn: gridCol, maxWidth: "50%", margin: "0 auto" } : {}),
                }}
              >
                <div style={{ marginBottom: "0.3em" }}>
                  {p.iconUrl ? (
                    <img src={p.iconUrl} alt={p.title} style={{ width: "1.3em", height: "1.3em", objectFit: "contain" }} />
                  ) : (
                    renderIcon(p.icon, accent, "1.3em")
                  )}
                </div>
                <div style={{
                  fontFamily: tFont,
                  fontSize: `${0.52 * tSize}em`,
                  fontWeight: (p.titleBold ?? true) ? 600 : 400,
                  fontStyle: p.titleItalic ? "italic" : undefined,
                  textDecoration: p.titleUnderline ? "underline" : undefined,
                  color: tColor,
                  lineHeight: 1.3,
                  marginBottom: "0.2em",
                  textShadow: makeOutlineShadow(p.titleOutline),
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontFamily: dFont,
                  fontSize: `${0.4 * dSize}em`,
                  fontWeight: p.descriptionBold ? 700 : 400,
                  fontStyle: p.descriptionItalic ? "italic" : undefined,
                  textDecoration: p.descriptionUnderline ? "underline" : undefined,
                  color: dColor,
                  lineHeight: 1.55,
                  textShadow: makeOutlineShadow(p.descriptionOutline),
                }}>
                  {p.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={hasBg ? "dark" : "light"}
        xPercent={content.logoX ?? 85}
        yPercent={content.logoY ?? 88}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout D: Cycle Diagram ────────────────────────────────────────────────

function CycleDiagramLayout({
  headline, nodes, columns, hasAiBackground, branding, content, accent,
}: {
  headline: string; nodes: DesignBuildDiagramNode[];
  columns: DesignBuildSupportColumn[]; hasAiBackground?: boolean;
  branding: DeckBranding; content: DesignBuildAdvantageContent; accent: string;
}) {
  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? NAVY;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden", background: hasAiBackground ? "transparent" : LINEN }}>
      <ArchitecturalWatermark />

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "0.4em" }}>
          <div style={{
            fontFamily: slideTitleFont,
            fontSize: `${1.15 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 600 : 400,
            fontStyle: content.slideTitleItalic ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.2,
            textShadow: slideTitleShadow,
          }}>{headline}</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.2em" marginBottom="0" />
          </div>
        </div>

        {/* Cycle diagram */}
        <div style={{ flex: "0 0 52%", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <CycleDiagramSVG nodes={nodes} />
        </div>

        {/* Support columns */}
        <div style={{ display: "flex", gap: "1.2em", flex: 1 }}>
          {columns.map((col) => {
            const tFont = col.titleFont ?? fallbackBodyFont;
            const tSize = col.titleSize ?? 1.0;
            const tColor = col.titleColor ?? NAVY;
            const dFont = col.descriptionFont ?? fallbackBodyFont;
            const dSize = col.descriptionSize ?? 1.0;
            const dColor = col.descriptionColor ?? MUTED_NAVY;

            return (
              <div key={col.id} style={{ flex: 1, borderTop: `2px solid ${accent}`, paddingTop: "0.4em" }}>
                <div style={{
                  fontFamily: tFont,
                  fontSize: `${0.5 * tSize}em`,
                  fontWeight: (col.titleBold ?? true) ? 600 : 400,
                  fontStyle: col.titleItalic ? "italic" : undefined,
                  textDecoration: col.titleUnderline ? "underline" : undefined,
                  color: tColor,
                  lineHeight: 1.3,
                  marginBottom: "0.2em",
                  textShadow: makeOutlineShadow(col.titleOutline),
                }}>
                  {col.title}
                </div>
                <div style={{
                  fontFamily: dFont,
                  fontSize: `${0.38 * dSize}em`,
                  fontWeight: col.descriptionBold ? 700 : 400,
                  fontStyle: col.descriptionItalic ? "italic" : undefined,
                  textDecoration: col.descriptionUnderline ? "underline" : undefined,
                  color: dColor,
                  lineHeight: 1.55,
                  textShadow: makeOutlineShadow(col.descriptionOutline),
                }}>
                  {col.description}
                </div>
              </div>
            );
          })}
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

// ─── Cycle Diagram SVG ──────────────────────────────────────────────────────

function CycleDiagramSVG({ nodes }: { nodes: DesignBuildDiagramNode[] }) {
  const cx = 150;
  const cy = 110;
  const r = 75;
  const nodeR = 28;
  const count = nodes.length;

  const positions = nodes.map((_, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  function arrowPath(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const startX = from.x + nx * (nodeR + 4);
    const startY = from.y + ny * (nodeR + 4);
    const endX = to.x - nx * (nodeR + 8);
    const endY = to.y - ny * (nodeR + 8);
    return `M${startX},${startY} L${endX},${endY}`;
  }

  return (
    <svg width="300" height="220" viewBox="0 0 300 220" style={{ maxWidth: "100%", height: "auto" }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={GOLD} />
        </marker>
      </defs>

      {positions.map((pos, i) => {
        const next = positions[(i + 1) % count];
        return (
          <path
            key={`arrow-${i}`}
            d={arrowPath(pos, next)}
            stroke={GOLD}
            strokeWidth={1.5}
            fill="none"
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      <text x={cx} y={cy - 4} textAnchor="middle" fill={NAVY} fontFamily={SLIDE_FONTS.defaults.headline} fontSize="11" fontWeight="600">
        HHI
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={NAVY} fontFamily={SLIDE_FONTS.defaults.headline} fontSize="9" fontWeight="400">
        Builders
      </text>

      {positions.map((pos, i) => (
        <g key={nodes[i].id}>
          <circle cx={pos.x} cy={pos.y} r={nodeR} fill={NAVY} />
          <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF" fontFamily={SLIDE_FONTS.defaults.body} fontSize="8" fontWeight="500">
            {nodes[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

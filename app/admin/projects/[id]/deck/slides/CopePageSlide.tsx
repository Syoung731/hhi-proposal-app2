"use client";

import type { ProposalSlide, DeckBranding, CopePageContent, CopeItem } from "@/app/lib/deck/types";
import { HHI_DEFAULT_COPE_ITEMS } from "@/app/lib/cope-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, CARD_SHADOWS, CARD_PADDING, CARD_BORDER, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

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
const MUTED = "#4A5568";

// ─── SVG icon paths (Lucide-style) ──────────────────────────────────────────

function IconSvg({ children, color, size = "1.5em" }: { children: React.ReactNode; color: string; size?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const COPE_ICON_PATHS: Record<string, React.ReactNode> = {
  FileCheck: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 15l2 2 4-4" />
    </>
  ),
  Shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  ClipboardList: (
    <>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 12h6M9 16h6M9 8h.01" />
    </>
  ),
  Zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  CheckCircle: (
    <>
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </>
  ),
};

function renderCopeIcon(name: string | null | undefined, color: string) {
  if (!name) return null;
  return (
    <IconSvg color={color}>
      {COPE_ICON_PATHS[name] ?? COPE_ICON_PATHS.FileCheck}
    </IconSvg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CopePageSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as CopePageContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "WHAT\u2019S INCLUDED";
  const headline = slide.headline ?? "The Cost of Project Execution";
  const subheadline = c.subheadline ?? null;
  const items = c.items && c.items.length > 0 ? c.items : HHI_DEFAULT_COPE_ITEMS;

  switch (layoutKey) {
    case "quad-photos":
      return (
        <QuadPhotosLayout
          sectionLabel={sectionLabel}
          headline={headline}
          subheadline={subheadline}
          items={items}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
    case "annotated-diagram":
      return (
        <AnnotatedDiagramLayout
          sectionLabel={sectionLabel}
          headline={headline}
          subheadline={subheadline}
          items={items}
          heroImageUrl={c.heroImageUrl}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
    default: // "icon-columns"
      return (
        <IconColumnsLayout
          sectionLabel={sectionLabel}
          headline={headline}
          subheadline={subheadline}
          items={items}
          hasAiBackground={hasAiBackground}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Layout A: Icon Columns ──────────────────────────────────────────────────

function IconColumnsLayout({
  sectionLabel, headline, subheadline, items, hasAiBackground, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; hasAiBackground?: boolean; content: CopePageContent; branding: DeckBranding;
}) {
  const resolvedAccent = content.accentColor ?? GOLD;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? NAVY;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? MUTED;
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ background: hasAiBackground ? "transparent" : LINEN, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "2.5%" }}>
          {(content.showSectionLabel ?? true) && (
          <p style={{ fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label, fontSize: SECTION_LABEL_SIZE, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.18em", color: content.sectionLabelColor ?? resolvedAccent, marginBottom: "0.4em" }}>
            {sectionLabel}
          </p>
          )}
          <h2 style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.2 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}>
            {headline}
          </h2>
          <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />
          {subheadline && (
            <p style={{
              fontFamily: subFont,
              fontSize: `${0.55 * subSize}em`,
              fontWeight: content.subheadlineBold ? 700 : 400,
              fontStyle: (content.subheadlineItalic ?? true) ? "italic" : undefined,
              textDecoration: content.subheadlineUnderline ? "underline" : undefined,
              color: subColor,
              marginTop: "0.5em",
              lineHeight: 1.5,
              textShadow: subShadow,
            }}>
              {subheadline}
            </p>
          )}
        </div>

        {/* 3-column grid */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5%", minHeight: 0, alignContent: "start" }}>
          {items.map((item) => {
            const titleFont = item.titleFont ?? fallbackBodyFont;
            const titleSize = item.titleSize ?? 1.0;
            const titleColor = item.titleColor ?? NAVY;
            const bulletsFont = item.bulletsFont ?? fallbackBodyFont;
            const bulletsSize = item.bulletsSize ?? 1.0;
            const bulletsColor = item.bulletsColor ?? content.bodyColor ?? NAVY;
            const descFont = item.descriptionFont ?? fallbackBodyFont;
            const descSize = item.descriptionSize ?? 1.0;
            const descColor = item.descriptionColor ?? content.bodyColor ?? NAVY;

            return (
              <div key={item.id} style={{ display: "flex", flexDirection: "column" }}>
                {/* Icon */}
                <div style={{ marginBottom: "5%", flexShrink: 0 }}>
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt={item.title} style={{ width: "1.5em", height: "1.5em", objectFit: "contain" }} />
                  ) : (
                    renderCopeIcon(item.icon, resolvedAccent)
                  )}
                </div>

                {/* Title */}
                <p style={{
                  fontFamily: titleFont,
                  fontSize: `${0.58 * titleSize}em`,
                  fontWeight: (item.titleBold ?? true) ? 700 : 400,
                  fontStyle: item.titleItalic ? "italic" : undefined,
                  textDecoration: item.titleUnderline ? "underline" : undefined,
                  color: titleColor,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4%",
                  lineHeight: 1.2,
                  textShadow: makeOutlineShadow(item.titleOutline),
                }}>
                  {item.title}
                </p>

                {/* Description — renders above bullets when set */}
                {item.description && (
                  <p style={{
                    fontFamily: descFont,
                    fontSize: `${0.46 * descSize}em`,
                    fontWeight: item.descriptionBold ? 700 : 400,
                    fontStyle: item.descriptionItalic ? "italic" : undefined,
                    textDecoration: item.descriptionUnderline ? "underline" : undefined,
                    color: descColor,
                    lineHeight: 1.6,
                    opacity: 0.8,
                    marginBottom: item.bullets && item.bullets.length > 0 ? "3.5%" : 0,
                    textShadow: makeOutlineShadow(item.descriptionOutline),
                  }}>
                    {item.description}
                  </p>
                )}

                {/* Bullets */}
                {item.bullets && item.bullets.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {item.bullets.map((b, bi) => (
                      <li key={bi} style={{ display: "flex", alignItems: "flex-start", gap: "4%", marginBottom: bi < item.bullets!.length - 1 ? "4%" : 0 }}>
                        <span style={{ flexShrink: 0, width: 4, height: 4, borderRadius: "50%", background: resolvedAccent, marginTop: "0.45em" }} />
                        <span style={{
                          fontFamily: bulletsFont,
                          fontSize: `${0.44 * bulletsSize}em`,
                          fontWeight: item.bulletsBold ? 700 : 400,
                          fontStyle: item.bulletsItalic ? "italic" : undefined,
                          textDecoration: item.bulletsUnderline ? "underline" : undefined,
                          color: bulletsColor,
                          lineHeight: 1.6,
                          opacity: 0.8,
                          textShadow: makeOutlineShadow(item.bulletsOutline),
                        }}>
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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

// ─── Layout B: Quad Photos ───────────────────────────────────────────────────

function QuadPhotosLayout({
  sectionLabel, headline, subheadline, items, hasAiBackground, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; hasAiBackground?: boolean; content: CopePageContent; branding: DeckBranding;
}) {
  const accent = content.accentColor ?? GOLD;
  const cells = items.slice(0, 4);

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? NAVY;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ background: hasAiBackground ? "transparent" : LINEN, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "2.5%" }}>
          {(content.showSectionLabel ?? true) && (
          <p style={{ fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label, fontSize: SECTION_LABEL_SIZE, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.18em", color: content.sectionLabelColor ?? accent, marginBottom: "0.4em" }}>
            {sectionLabel}
          </p>
          )}
          <h2 style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.0 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}>
            {headline}
          </h2>
          <TitleAccentRule accentColor={accent} marginTop="0.3em" marginBottom="0" />
        </div>

        {/* 2x2 grid */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "1.5%", minHeight: 0 }}>
          {[0, 1, 2, 3].map((idx) => {
            const item = cells[idx];
            if (!item) {
              return (
                <div key={idx} style={{ background: NAVY, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: "5%" }}>
                  <p style={{ fontFamily: slideTitleFont, fontSize: "0.8em", fontWeight: 600, fontStyle: "italic", color: "#F5F0E8", textAlign: "center", lineHeight: 1.4 }}>
                    {subheadline || "Built into every project."}
                  </p>
                </div>
              );
            }

            const titleFont = item.titleFont ?? fallbackBodyFont;
            const titleSize = item.titleSize ?? 1.0;
            const titleColor = item.titleColor ?? accent;
            const descFont = item.descriptionFont ?? fallbackBodyFont;
            const descSize = item.descriptionSize ?? 1.0;
            const descColor = item.descriptionColor ?? "rgba(245,240,232,0.9)";

            return (
              <div key={item.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
                {item.photo ? (
                  <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${item.photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: NAVY }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "rgba(26,35,50,0.72)" }} />
                <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "6% 7%" }}>
                  <p style={{
                    fontFamily: titleFont,
                    fontSize: `${0.6 * titleSize}em`,
                    fontWeight: (item.titleBold ?? true) ? 700 : 400,
                    fontStyle: item.titleItalic ? "italic" : undefined,
                    textDecoration: item.titleUnderline ? "underline" : undefined,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: titleColor,
                    marginBottom: "3%",
                    textShadow: makeOutlineShadow(item.titleOutline),
                  }}>
                    {item.title}
                  </p>
                  <p style={{
                    fontFamily: descFont,
                    fontSize: `${0.44 * descSize}em`,
                    fontWeight: item.descriptionBold ? 700 : 400,
                    fontStyle: item.descriptionItalic ? "italic" : undefined,
                    textDecoration: item.descriptionUnderline ? "underline" : undefined,
                    color: descColor,
                    lineHeight: 1.6,
                    textShadow: makeOutlineShadow(item.descriptionOutline),
                  }}>
                    {item.description}
                  </p>
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

// ─── Layout C: Annotated Diagram ─────────────────────────────────────────────

function AnnotatedDiagramLayout({
  sectionLabel, headline, subheadline, items, heroImageUrl, hasAiBackground, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; heroImageUrl?: string | null; hasAiBackground?: boolean; content: CopePageContent; branding: DeckBranding;
}) {
  const accent = content.accentColor ?? GOLD;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? NAVY;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? MUTED;
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ background: hasAiBackground ? "transparent" : LINEN, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex" }}>
        {/* Left panel */}
        <div style={{ width: "40%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ flexShrink: 0, marginBottom: "5%" }}>
            {(content.showSectionLabel ?? true) && (
            <p style={{ fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label, fontSize: SECTION_LABEL_SIZE, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.18em", color: content.sectionLabelColor ?? accent, marginBottom: "0.4em" }}>
              {sectionLabel}
            </p>
            )}
            <h2 style={{
              fontFamily: slideTitleFont,
              fontSize: `${1.8 * slideTitleSize}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
              textDecoration: content.slideTitleUnderline ? "underline" : undefined,
              color: slideTitleColor,
              lineHeight: 1.15,
              textShadow: slideTitleShadow,
            }}>
              {headline}
            </h2>
            <TitleAccentRule accentColor={accent} marginTop="0.35em" marginBottom="0" />
            {subheadline && (
              <p style={{
                fontFamily: subFont,
                fontSize: `${0.5 * subSize}em`,
                fontWeight: content.subheadlineBold ? 700 : 400,
                fontStyle: (content.subheadlineItalic ?? true) ? "italic" : undefined,
                textDecoration: content.subheadlineUnderline ? "underline" : undefined,
                color: subColor,
                marginTop: "0.5em",
                lineHeight: 1.5,
                textShadow: subShadow,
              }}>
                {subheadline}
              </p>
            )}
          </div>

          {/* Callout list */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
            {items.map((item, i) => {
              const titleFont = item.titleFont ?? fallbackBodyFont;
              const titleSize = item.titleSize ?? 1.0;
              const titleColor = item.titleColor ?? NAVY;
              const descFont = item.descriptionFont ?? fallbackBodyFont;
              const descSize = item.descriptionSize ?? 1.0;
              const descColor = item.descriptionColor ?? NAVY;

              return (
                <div key={item.id}>
                  {i > 0 && <div style={{ height: 1, background: `${accent}30`, margin: "3% 0" }} />}
                  <p style={{
                    fontFamily: titleFont,
                    fontSize: `${0.55 * titleSize}em`,
                    fontWeight: (item.titleBold ?? true) ? 700 : 400,
                    fontStyle: item.titleItalic ? "italic" : undefined,
                    textDecoration: item.titleUnderline ? "underline" : undefined,
                    color: titleColor,
                    lineHeight: 1.3,
                    marginBottom: "1.5%",
                    textShadow: makeOutlineShadow(item.titleOutline),
                  }}>
                    {item.calloutLabel || item.title}
                  </p>
                  <p style={{
                    fontFamily: descFont,
                    fontSize: `${0.44 * descSize}em`,
                    fontWeight: item.descriptionBold ? 700 : 400,
                    fontStyle: item.descriptionItalic ? "italic" : undefined,
                    textDecoration: item.descriptionUnderline ? "underline" : undefined,
                    color: descColor,
                    lineHeight: 1.55,
                    opacity: 0.8,
                    textShadow: makeOutlineShadow(item.descriptionOutline),
                  }}>
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — hero image */}
        <div style={{ width: "60%", position: "relative" }}>
          {heroImageUrl ? (
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${heroImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            // No hero image set — render a neutral gradient panel. The prior
            // "Add a hero image" hint text was visible in PDFs and published
            // decks; it's the inspector's job to surface that, not the slide.
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${NAVY}15 0%, ${accent}10 100%)` }} />
          )}
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

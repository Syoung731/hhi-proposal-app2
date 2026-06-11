"use client";

import type { ProposalSlide, DeckBranding, CopeContent, CopeItem } from "@/app/lib/deck/types";
import { HHI_DEFAULT_COPE_ITEMS } from "@/app/lib/cope-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, CARD_SHADOWS, CARD_PADDING, CARD_BORDER, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Theme: surfaces + headline fonts resolve from the deck theme; bespoke layout
// art (stone columns, honeycomb) keeps its own palette.
function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED = "#4A5568";

// Architectural stone palette for the Columns layout (a material choice, like
// GOLD — intentionally fixed rather than theme-driven).
const STONE_BEAM = "#7C7B76"; // entablature / beam gray
const STONE_CAP = "#E7E4DC"; // capital + base blocks
const STONE_SHAFT = "#F6F4EE"; // column shaft fill
const STONE_EDGE = "rgba(26,35,50,0.16)"; // shaft / block hairline borders
const STONE_FLUTE = "rgba(26,35,50,0.045)"; // faint vertical fluting

// ─── SVG icon paths (Lucide-style) ──────────────────────────────────────────

function IconSvg({ children, color, size = "1.5em" }: { children: React.ReactNode; color: string; size?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Built-in vector icon keys, in picker order — exported for the inspector. */
export const COPE_BUILTIN_ICONS: { key: string; label: string }[] = [
  { key: "FileCheck", label: "Permit" },
  { key: "Shield", label: "Shield" },
  { key: "ClipboardList", label: "Clipboard" },
  { key: "Zap", label: "Systems" },
  { key: "CheckCircle", label: "Check" },
];

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

export function renderCopeIcon(name: string | null | undefined, color: string) {
  if (!name) return null;
  return (
    <IconSvg color={color}>
      {COPE_ICON_PATHS[name] ?? COPE_ICON_PATHS.FileCheck}
    </IconSvg>
  );
}

/**
 * Render a COPE item's icon: bespoke AI PNG (mask-tinted to accent) when present,
 * else a library iconUrl image, else a built-in vector. `size` is an em string.
 */
function CopeGlyph({ item, color, size = "1.5em" }: { item: CopeItem; color: string; size?: string }) {
  if (item.iconImageUrl) {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-block", width: size, height: size, backgroundColor: color,
          WebkitMaskImage: `url(${item.iconImageUrl})`, maskImage: `url(${item.iconImageUrl})`,
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          WebkitMaskPosition: "center", maskPosition: "center",
          WebkitMaskSize: "contain", maskSize: "contain",
        }}
      />
    );
  }
  if (item.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.iconUrl} alt={item.title} style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  return renderCopeIcon(item.icon, color);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CopeSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as CopeContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "WHAT\u2019S INCLUDED";
  const headline = slide.headline ?? "The Cost of Project Execution";
  const subheadline = c.subheadline ?? null;
  const items = c.items && c.items.length > 0 ? c.items : HHI_DEFAULT_COPE_ITEMS;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  switch (layoutKey) {
    case "columns":
      return (
        <ColumnsLayout
          sectionLabel={sectionLabel}
          headline={headline}
          subheadline={subheadline}
          items={items}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "hexagon":
      return (
        <HexagonLayout
          sectionLabel={sectionLabel}
          headline={headline}
          subheadline={subheadline}
          items={items}
          hasBg={hasBg}
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
          hasBg={hasBg}
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
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Layout A: Icon Columns ──────────────────────────────────────────────────

function IconColumnsLayout({
  sectionLabel, headline, subheadline, items, hasBg, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; hasBg?: boolean; content: CopeContent; branding: DeckBranding;
}) {
  const resolvedAccent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const theme = useDeckTheme();
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? MUTED;
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
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
            const titleSize = item.titleSize ?? 1.6;
            const titleColor = item.titleColor ?? branding.textColor;
            const bulletsFont = item.bulletsFont ?? fallbackBodyFont;
            const bulletsSize = item.bulletsSize ?? 2.0;
            const bulletsColor = item.bulletsColor ?? content.bodyColor ?? branding.textColor;
            const descFont = item.descriptionFont ?? fallbackBodyFont;
            const descSize = item.descriptionSize ?? 2.5;
            const descColor = item.descriptionColor ?? content.bodyColor ?? branding.textColor;

            return (
              <div key={item.id} style={{ display: "flex", flexDirection: "column" }}>
                {/* Icon */}
                <div style={{ marginBottom: "5%", flexShrink: 0 }}>
                  <CopeGlyph item={item} color={resolvedAccent} size="1.5em" />
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
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}


// ─── Shared header for the newer COPE layouts ───────────────────────────────

function CopeHeader({
  sectionLabel, headline, subheadline, content, branding, accent, center = false,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  content: CopeContent; branding: DeckBranding; accent: string; center?: boolean;
}) {
  const theme = useDeckTheme();
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? MUTED;
  return (
    <div style={{ flexShrink: 0, marginBottom: "2.5%", textAlign: center ? "center" : "left" }}>
      {(content.showSectionLabel ?? true) && (
        <p style={{ fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label, fontSize: SECTION_LABEL_SIZE, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.18em", color: content.sectionLabelColor ?? accent, marginBottom: "0.4em" }}>
          {sectionLabel}
        </p>
      )}
      <h2 style={{ fontFamily: slideTitleFont, fontSize: `${2.1 * (content.slideTitleSize ?? 1)}em`, fontWeight: (content.slideTitleBold ?? true) ? 700 : 400, fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined, textDecoration: content.slideTitleUnderline ? "underline" : undefined, color: slideTitleColor, lineHeight: 1.15, margin: 0, textShadow: makeOutlineShadow(content.slideTitleOutline) }}>
        {headline}
      </h2>
      <div style={{ display: "flex", justifyContent: center ? "center" : "flex-start" }}>
        <TitleAccentRule accentColor={accent} marginTop="0.35em" marginBottom="0" />
      </div>
      {subheadline && (
        <p style={{ fontFamily: subFont, fontSize: `${0.55 * (content.subheadlineSize ?? 1)}em`, fontWeight: content.subheadlineBold ? 700 : 400, fontStyle: (content.subheadlineItalic ?? true) ? "italic" : undefined, color: subColor, marginTop: "0.5em", lineHeight: 1.5, maxWidth: center ? "72%" : "78%", marginLeft: center ? "auto" : 0, marginRight: center ? "auto" : 0, textShadow: makeOutlineShadow(content.subheadlineOutline) }}>
          {subheadline}
        </p>
      )}
    </div>
  );
}

// ─── Layout: Columns (classical architectural columns — "The Invisible Craft") ─

function ColumnsLayout({
  sectionLabel, headline, subheadline, items, hasBg, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; hasBg?: boolean; content: CopeContent; branding: DeckBranding;
}) {
  const theme = useDeckTheme();
  const accent = content.accentColor ?? branding.accentColor;
  const ink = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const cols = items.slice(0, 6);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CopeHeader sectionLabel={sectionLabel} headline={headline} subheadline={subheadline} content={content} branding={branding} accent={accent} center />

        {cols.length === 0 ? null : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingBottom: "1%" }}>
            {/* Entablature — one continuous beam spanning all columns, with a
                top highlight + bottom shadow for a carved-stone read. */}
            <div
              style={{
                flexShrink: 0, height: "4%", minHeight: 14, background: STONE_BEAM, borderRadius: 1,
                boxShadow: "inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -3px 0 rgba(0,0,0,0.14)",
              }}
            />

            {/* Columns row */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "1.6%", alignItems: "stretch", marginTop: "0.6%" }}>
              {cols.map((item) => {
                const titleFont = item.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
                const titleColor = item.titleColor ?? ink;
                // Columns shows bullets when present, else the description as a
                // single line. Style each line by its actual SOURCE so the
                // matching inspector control (Bullets Size vs Description Size)
                // always drives what's on screen.
                const usingBullets = !!(item.bullets && item.bullets.length > 0);
                const lines = usingBullets ? item.bullets! : (item.description ? [item.description] : []);
                const lineFont = usingBullets
                  ? (item.bulletsFont ?? fallbackBodyFont)
                  : (item.descriptionFont ?? fallbackBodyFont);
                const lineColor = usingBullets
                  ? (item.bulletsColor ?? content.bodyColor ?? MUTED)
                  : (item.descriptionColor ?? content.bodyColor ?? MUTED);
                const lineSize = usingBullets ? (item.bulletsSize ?? 2.0) : (item.descriptionSize ?? 2.5);
                const lineBold = usingBullets ? item.bulletsBold : item.descriptionBold;
                const lineItalic = usingBullets ? item.bulletsItalic : item.descriptionItalic;
                const lineUnderline = usingBullets ? item.bulletsUnderline : item.descriptionUnderline;
                return (
                  <div key={item.id} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    {/* Capital — full slot width (overhangs the narrower shaft) */}
                    <div style={{ width: "100%", flexShrink: 0, height: "3.4%", minHeight: 12, background: STONE_CAP, border: `1px solid ${STONE_EDGE}`, borderBottom: "none", borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
                    {/* Shaft — narrower than the capital/base, fluted stone */}
                    <div
                      style={{
                        width: "84%", flex: 1, minHeight: 0, padding: "11% 9% 6%",
                        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                        background: STONE_SHAFT,
                        borderLeft: `1px solid ${STONE_EDGE}`, borderRight: `1px solid ${STONE_EDGE}`,
                        backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 9px, ${STONE_FLUTE} 9px, ${STONE_FLUTE} 10px)`,
                        boxShadow: "0 6px 16px rgba(26,35,50,0.06)",
                      }}
                    >
                      <p style={{ fontFamily: titleFont, fontSize: `${0.62 * (item.titleSize ?? 1.6)}em`, fontWeight: (item.titleBold ?? true) ? 700 : 400, fontStyle: item.titleItalic ? "italic" : undefined, color: titleColor, lineHeight: 1.2, marginBottom: "0.55em", textShadow: makeOutlineShadow(item.titleOutline) }}>
                        {item.title}
                      </p>
                      <div style={{ width: "1.7em", height: 2, background: accent, marginBottom: "1em" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.9em" }}>
                        {lines.map((b, bi) => (
                          <p key={bi} style={{ fontFamily: lineFont, fontSize: `${0.46 * lineSize}em`, fontWeight: lineBold ? 700 : 400, fontStyle: lineItalic ? "italic" : undefined, textDecoration: lineUnderline ? "underline" : undefined, color: lineColor, lineHeight: 1.5, margin: 0 }}>
                            {b}
                          </p>
                        ))}
                      </div>
                    </div>
                    {/* Base — full slot width (overhangs the shaft) */}
                    <div style={{ width: "100%", flexShrink: 0, height: "4%", minHeight: 16, background: STONE_CAP, border: `1px solid ${STONE_EDGE}`, borderTop: "none", borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <LogoOverlay show={content.showLogo ?? true} variant={content.logoVariant ?? "light"} xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x} yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y} scale={content.logoSize ?? 1.0} branding={branding} />
    </div>
  );
}

// ─── Layout: Hexagon (honeycomb — "The Project Execution Framework") ─────────

/**
 * A single pointy-top hexagon that fills its (absolutely-positioned) wrapper.
 * Filled surface + ink border so neighbouring cells share crisp edges instead
 * of producing the overlapping-outline mess the old flat-top version had.
 */
function HexCell({ item, accent, ink, bodyFont }: { item: CopeItem; accent: string; ink: string; bodyFont: string }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Flattened pointy-top hexagon (W=100, H=80 → cap a=20, sides b=40).
          Wider-than-tall to match the NotebookLM proportions; nests cleanly
          because the honeycomb offsets below use H−a = 60. */}
      <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
        <polygon points="50,0 100,20 100,60 50,80 0,60 0,20" fill="#FFFFFF" stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 13%" }}>
        <div style={{ marginBottom: "0.45em", lineHeight: 0 }}>
          <CopeGlyph item={item} color={accent} size="2.3em" />
        </div>
        <p style={{ fontFamily: item.titleFont ?? bodyFont, fontSize: `${0.6 * (item.titleSize ?? 1.6)}em`, fontWeight: (item.titleBold ?? true) ? 700 : 400, color: item.titleColor ?? ink, lineHeight: 1.2, margin: "0 0 0.35em" }}>
          {item.title}
        </p>
        {item.description && (
          <p style={{ fontFamily: item.descriptionFont ?? bodyFont, fontSize: `${0.44 * (item.descriptionSize ?? 2.5)}em`, color: item.descriptionColor ?? MUTED, lineHeight: 1.45, margin: 0 }}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

function HexagonLayout({
  sectionLabel, headline, subheadline, items, hasBg, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; hasBg?: boolean; content: CopeContent; branding: DeckBranding;
}) {
  const accent = content.accentColor ?? branding.accentColor;
  const ink = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const theme = useDeckTheme();
  const bodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const hexes = items.slice(0, 5);

  // Honeycomb geometry — flattened pointy-top hexes (W=100, H=80, cap a=20),
  // 3 over 2, the bottom row nestled into the valleys of the top row. Exact
  // percentages of a fixed-aspect container so adjacent edges coincide:
  //   hex width  = 33.33% of container width   (3 across, centre spacing = W)
  //   hex height = 57.14% of container height  (= H / (Δ+H), Δ = H−a = 60)
  //   top row   left: 0 / 33.33 / 66.66 %, top: 0
  //   bottom row left: 16.66 / 50 %,        top: 42.86%  (= Δ / (Δ+H))
  //   container aspect (w/h) = 3W / (Δ+H) = 300 / 140 ≈ 2.1428 → wide like the ref.
  const HEX_W = "33.33%";
  const HEX_H = "57.14%";
  const positions: { left: string; top: string }[] = [
    { left: "0%", top: "0%" },
    { left: "33.33%", top: "0%" },
    { left: "66.66%", top: "0%" },
    { left: "16.66%", top: "42.86%" },
    { left: "50%", top: "42.86%" },
  ];

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {/* faint graph grid */}
      {!hasBg && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(26,35,50,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,35,50,0.04) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <CopeHeader sectionLabel={sectionLabel} headline={headline} subheadline={subheadline} content={content} branding={branding} accent={accent} center />

        {hexes.length === 0 ? null : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", height: "100%", aspectRatio: "2.1428", maxWidth: "100%" }}>
              {hexes.map((item, i) => (
                <div key={item.id} style={{ position: "absolute", width: HEX_W, height: HEX_H, left: positions[i].left, top: positions[i].top }}>
                  <HexCell item={item} accent={accent} ink={ink} bodyFont={bodyFont} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <LogoOverlay show={content.showLogo ?? true} variant={content.logoVariant ?? "light"} xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x} yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y} scale={content.logoSize ?? 1.0} branding={branding} />
    </div>
  );
}

// ─── Layout C: Annotated Diagram ─────────────────────────────────────────────

function AnnotatedDiagramLayout({
  sectionLabel, headline, subheadline, items, heroImageUrl, hasBg, content, branding,
}: {
  sectionLabel: string; headline: string; subheadline: string | null;
  items: CopeItem[]; heroImageUrl?: string | null; hasBg?: boolean; content: CopeContent; branding: DeckBranding;
}) {
  const accent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const theme = useDeckTheme();
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Per-field: Subheadline
  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 1.0;
  const subColor = content.subheadlineColor ?? content.bodyColor ?? MUTED;
  const subShadow = makeOutlineShadow(content.subheadlineOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
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
              const titleSize = item.titleSize ?? 1.6;
              const titleColor = item.titleColor ?? branding.textColor;
              const descFont = item.descriptionFont ?? fallbackBodyFont;
              const descSize = item.descriptionSize ?? 2.5;
              const descColor = item.descriptionColor ?? branding.textColor;

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
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

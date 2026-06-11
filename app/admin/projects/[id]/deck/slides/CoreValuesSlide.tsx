"use client";

import type { ProposalSlide, DeckBranding, CoreValuesContent, CoreValue } from "@/app/lib/deck/types";
import { HHI_DEFAULT_CORE_VALUES } from "@/app/lib/core-values-defaults";
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

// Re-export for backward compatibility
export const DEFAULT_CORE_VALUES = HHI_DEFAULT_CORE_VALUES;

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

// ─── SVG icon components (Lucide-style, no external dependency) ──────────────

function IconSvg({ children, color, size = "1.3em" }: { children: React.ReactNode; color: string; size?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  Shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  Scale: (
    <>
      <path d="M16 16l3-8 3 8c-1.5 1-4.5 1-6 0z" />
      <path d="M2 16l3-8 3 8c-1.5 1-4.5 1-6 0z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </>
  ),
  MessageSquare: (
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  ),
  Lightbulb: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
  Users: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
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

// ─── Design tokens ───────────────────────────────────────────────────────────

const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Main slide component ────────────────────────────────────────────────────

export function CoreValuesSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as CoreValuesContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "WHO WE ARE";
  const headline = slide.headline ?? "Built on a Foundation of Values";
  const values = c.values && c.values.length > 0 ? c.values : DEFAULT_CORE_VALUES;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  switch (layoutKey) {
    case "quad-grid":
      return (
        <QuadGridLayout
          sectionLabel={sectionLabel}
          headline={headline}
          values={values}
          backgroundImageUrl={c.backgroundImageUrl}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "labeled-list":
      return (
        <LabeledListLayout
          sectionLabel={sectionLabel}
          headline={headline}
          values={values}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    case "icon-cards":
      return (
        <IconCardsLayout
          sectionLabel={sectionLabel}
          headline={headline}
          values={values}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
    default: // "cards-row"
      return (
        <CardsRowLayout
          sectionLabel={sectionLabel}
          headline={headline}
          values={values}
          hasBg={hasBg}
          content={c}
          branding={branding}
        />
      );
  }
}

// ─── Layout A: Quad Grid ─────────────────────────────────────────────────────

function QuadGridLayout({
  sectionLabel,
  headline,
  values,
  backgroundImageUrl,
  hasBg,
  content,
  branding,
}: {
  sectionLabel: string;
  headline: string;
  values: CoreValue[];
  backgroundImageUrl?: string | null;
  hasBg?: boolean;
  content: CoreValuesContent;
  branding: DeckBranding;
}) {
  const theme = useDeckTheme();
  const resolvedAccent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? "#F5F0E8";
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {/* Background image */}
      {backgroundImageUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasBg && !backgroundImageUrl
            ? "transparent"
            : backgroundImageUrl
              ? "rgba(26,35,50,0.78)"
              : NAVY,
        }}
      />

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
        {/* Section label */}
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

        {/* Headline */}
        <h2
          style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.2 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}
        >
          {headline}
        </h2>
        <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />

        {/* 2x2 grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2%",
            marginTop: "3%",
            minHeight: 0,
          }}
        >
          {values.map((val) => {
            const nameFont = val.nameFont ?? fallbackBodyFont;
            const nameSize = val.nameSize ?? 1.0;
            const nameColor = val.nameColor ?? resolvedAccent;
            const descFont = val.descriptionFont ?? fallbackBodyFont;
            const descSize = val.descriptionSize ?? 1.0;
            const descColor = val.descriptionColor ?? content.bodyColor ?? "rgba(245,240,232,0.85)";

            return (
              <div
                key={val.id}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: content.cardBorderStyle === "subtle" ? CARD_BORDER.subtle : content.cardBorderStyle === "accent" ? `2px solid ${resolvedAccent}` : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: CARD_PADDING[content.cardSpacing ?? "normal"],
                  boxShadow: content.cardShadow && content.cardShadow !== "none" ? CARD_SHADOWS[content.cardShadow as keyof typeof CARD_SHADOWS] ?? CARD_SHADOWS.normal : content.cardShadow === "none" ? "none" : CARD_SHADOWS.normal,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: nameFont,
                    fontSize: `${0.72 * nameSize}em`,
                    fontWeight: (val.nameBold ?? true) ? 700 : 400,
                    fontStyle: val.nameItalic ? "italic" : undefined,
                    textDecoration: val.nameUnderline ? "underline" : undefined,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: nameColor,
                    lineHeight: 1.2,
                    marginBottom: "5%",
                    textShadow: makeOutlineShadow(val.nameOutline),
                  }}
                >
                  {val.name}
                </p>
                <p
                  style={{
                    fontFamily: descFont,
                    fontSize: `${0.5 * descSize}em`,
                    fontWeight: val.descriptionBold ? 700 : 400,
                    fontStyle: val.descriptionItalic ? "italic" : undefined,
                    textDecoration: val.descriptionUnderline ? "underline" : undefined,
                    color: descColor,
                    lineHeight: 1.65,
                    textShadow: makeOutlineShadow(val.descriptionOutline),
                  }}
                >
                  {val.description}
                </p>
              </div>
            );
          })}
        </div>
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

// ─── Layout B: Cards Row (original) ──────────────────────────────────────────

function CardsRowLayout({
  sectionLabel,
  headline,
  values,
  hasBg,
  content,
  branding,
}: {
  sectionLabel: string;
  headline: string;
  values: CoreValue[];
  hasBg?: boolean;
  content: CoreValuesContent;
  branding: DeckBranding;
}) {
  const theme = useDeckTheme();
  const resolvedAccent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}
    >
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}

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
        {/* Section label */}
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

        {/* Headline */}
        <h2
          style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.4 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}
        >
          {headline}
        </h2>
        <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />

        {/* Value cards row */}
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: "1.1%",
            minHeight: 0,
            alignItems: "stretch",
            marginTop: "3%",
          }}
        >
          {values.map((val) => (
            <CardsRowCard key={val.id} value={val} accent={resolvedAccent} cardShadow={content.cardShadow ?? undefined} cardBorderStyle={content.cardBorderStyle ?? undefined} cardSpacing={content.cardSpacing ?? undefined} fallbackBodyFont={fallbackBodyFont} fallbackBodyColor={content.bodyColor ?? undefined} fallbackTextColor={branding.textColor} />
          ))}
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

function CardsRowCard({ value, accent, cardShadow, cardBorderStyle, cardSpacing, fallbackBodyFont, fallbackBodyColor, fallbackTextColor }: {
  value: CoreValue; accent: string; cardShadow?: string; cardBorderStyle?: string; cardSpacing?: string;
  fallbackBodyFont: string; fallbackBodyColor?: string; fallbackTextColor: string;
}) {
  const nameFont = value.nameFont ?? fallbackBodyFont;
  const nameSize = value.nameSize ?? 1.0;
  const nameColor = value.nameColor ?? fallbackTextColor;
  const descriptorFont = value.descriptorFont ?? fallbackBodyFont;
  const descriptorSize = value.descriptorSize ?? 1.0;
  const descriptorColor = value.descriptorColor ?? MUTED_NAVY;
  const descFont = value.descriptionFont ?? fallbackBodyFont;
  const descSize = value.descriptionSize ?? 1.0;
  const descColor = value.descriptionColor ?? fallbackBodyColor ?? fallbackTextColor;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        borderRadius: 8,
        boxShadow: cardShadow ? CARD_SHADOWS[cardShadow as keyof typeof CARD_SHADOWS] : CARD_SHADOWS.normal,
        border: cardBorderStyle === "subtle" ? CARD_BORDER.subtle : cardBorderStyle === "accent" ? `2px solid ${accent}` : "none",
        borderLeft: !cardBorderStyle || cardBorderStyle === "none" ? `2px solid ${accent}` : undefined,
        padding: CARD_PADDING[cardSpacing as keyof typeof CARD_PADDING ?? "normal"],
        minWidth: 0,
      }}
    >
      {/* Icon */}
      <div style={{ marginBottom: "8%", flexShrink: 0 }}>
        {value.iconUrl ? (
          <img src={value.iconUrl} alt={value.name} style={{ width: "1.3em", height: "1.3em", objectFit: "contain" }} />
        ) : (
          renderIcon(value.icon, accent)
        )}
      </div>

      {/* Value name */}
      <p
        style={{
          fontFamily: nameFont,
          fontSize: `${0.62 * nameSize}em`,
          fontWeight: (value.nameBold ?? true) ? 600 : 400,
          fontStyle: value.nameItalic ? "italic" : undefined,
          textDecoration: value.nameUnderline ? "underline" : undefined,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: nameColor,
          lineHeight: 1.2,
          marginBottom: "5%",
          textShadow: makeOutlineShadow(value.nameOutline),
        }}
      >
        {value.name}
      </p>

      {/* Descriptor */}
      <p
        style={{
          fontFamily: descriptorFont,
          fontSize: `${0.52 * descriptorSize}em`,
          fontWeight: value.descriptorBold ? 700 : 400,
          fontStyle: (value.descriptorItalic ?? true) ? "italic" : undefined,
          textDecoration: value.descriptorUnderline ? "underline" : undefined,
          color: descriptorColor,
          lineHeight: 1.45,
          marginBottom: "6%",
          textShadow: makeOutlineShadow(value.descriptorOutline),
        }}
      >
        {value.descriptor}
      </p>

      {/* Description */}
      <p
        style={{
          fontFamily: descFont,
          fontSize: `${0.48 * descSize}em`,
          fontWeight: value.descriptionBold ? 700 : 400,
          fontStyle: value.descriptionItalic ? "italic" : undefined,
          textDecoration: value.descriptionUnderline ? "underline" : undefined,
          color: descColor,
          lineHeight: 1.6,
          opacity: 0.82,
          textShadow: makeOutlineShadow(value.descriptionOutline),
        }}
      >
        {value.description}
      </p>
    </div>
  );
}

// ─── Layout C: Labeled List with Dividers ────────────────────────────────────

function LabeledListLayout({
  sectionLabel,
  headline,
  values,
  hasBg,
  content,
  branding,
}: {
  sectionLabel: string;
  headline: string;
  values: CoreValue[];
  hasBg?: boolean;
  content: CoreValuesContent;
  branding: DeckBranding;
}) {
  const theme = useDeckTheme();
  const resolvedAccent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}
    >
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}

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
        {/* Section label */}
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

        {/* Headline */}
        <h2
          style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.4 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}
        >
          {headline}
        </h2>
        <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />

        {/* Value list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: "2%" }}>
          {values.map((val, i) => {
            const nameFont = val.nameFont ?? fallbackBodyFont;
            const nameSize = val.nameSize ?? 1.0;
            const nameColor = val.nameColor ?? branding.textColor;
            const descriptorFont = val.descriptorFont ?? fallbackBodyFont;
            const descriptorSize = val.descriptorSize ?? 1.0;
            const descriptorColor = val.descriptorColor ?? content.bodyColor ?? MUTED_NAVY;

            return (
              <div key={val.id}>
                {i > 0 && (
                  <div style={{ height: 1, background: `${resolvedAccent}30`, margin: "0" }} />
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "2.8% 1%",
                    gap: "4%",
                  }}
                >
                  {/* Name */}
                  <p
                    style={{
                      fontFamily: nameFont,
                      fontSize: `${0.72 * nameSize}em`,
                      fontWeight: (val.nameBold ?? true) ? 700 : 400,
                      fontStyle: val.nameItalic ? "italic" : undefined,
                      textDecoration: val.nameUnderline ? "underline" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: nameColor,
                      lineHeight: 1.2,
                      flexShrink: 0,
                      textShadow: makeOutlineShadow(val.nameOutline),
                    }}
                  >
                    {val.name}
                  </p>

                  {/* Dotted spacer */}
                  <div style={{ flex: 1, borderBottom: `1px dotted ${resolvedAccent}40`, marginBottom: "0.3em" }} />

                  {/* Descriptor */}
                  <p
                    style={{
                      fontFamily: descriptorFont,
                      fontSize: `${0.58 * descriptorSize}em`,
                      fontWeight: val.descriptorBold ? 700 : 400,
                      fontStyle: (val.descriptorItalic ?? true) ? "italic" : undefined,
                      textDecoration: val.descriptorUnderline ? "underline" : undefined,
                      color: descriptorColor,
                      lineHeight: 1.4,
                      flexShrink: 0,
                      textAlign: "right",
                      textShadow: makeOutlineShadow(val.descriptorOutline),
                    }}
                  >
                    {val.descriptor}
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

// ─── Layout D: 3-Column Icon Cards ───────────────────────────────────────────

function IconCardsLayout({
  sectionLabel,
  headline,
  values,
  hasBg,
  content,
  branding,
}: {
  sectionLabel: string;
  headline: string;
  values: CoreValue[];
  hasBg?: boolean;
  content: CoreValuesContent;
  branding: DeckBranding;
}) {
  const theme = useDeckTheme();
  const resolvedAccent = content.accentColor ?? branding.accentColor;

  // Per-field: Slide title
  const slideTitleFont = content.slideTitleFont ?? content.headlineFont ?? theme.fonts.headline;
  const slideTitleSize = content.slideTitleSize ?? 1.0;
  const slideTitleColor = content.slideTitleColor ?? content.headlineColor ?? branding.textColor;
  const slideTitleShadow = makeOutlineShadow(content.slideTitleOutline);

  // Fallback fonts for per-item
  const fallbackBodyFont = content.bodyFont ?? SLIDE_FONTS.defaults.body;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}
    >
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}

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
        {/* Section label */}
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

        {/* Headline */}
        <h2
          style={{
            fontFamily: slideTitleFont,
            fontSize: `${2.4 * slideTitleSize}em`,
            fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
            fontStyle: (content.slideTitleItalic ?? true) ? "italic" : undefined,
            textDecoration: content.slideTitleUnderline ? "underline" : undefined,
            color: slideTitleColor,
            lineHeight: 1.15,
            textShadow: slideTitleShadow,
          }}
        >
          {headline}
        </h2>
        <TitleAccentRule accentColor={resolvedAccent} marginTop="0.35em" marginBottom="0" />

        {/* 3-column grid */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "2%",
            marginTop: "3%",
            minHeight: 0,
            alignContent: "start",
          }}
        >
          {values.map((val) => {
            const nameFont = val.nameFont ?? fallbackBodyFont;
            const nameSize = val.nameSize ?? 1.0;
            const nameColor = val.nameColor ?? branding.textColor;
            const descFont = val.descriptionFont ?? fallbackBodyFont;
            const descSize = val.descriptionSize ?? 1.0;
            const descColor = val.descriptionColor ?? content.bodyColor ?? branding.textColor;

            return (
              <div
                key={val.id}
                style={{
                  background: "#FFFFFF",
                  borderRadius: 8,
                  boxShadow: content.cardShadow && content.cardShadow !== "none" ? CARD_SHADOWS[content.cardShadow as keyof typeof CARD_SHADOWS] ?? CARD_SHADOWS.normal : content.cardShadow === "none" ? "none" : CARD_SHADOWS.normal,
                  padding: CARD_PADDING[content.cardSpacing ?? "normal"],
                  border: content.cardBorderStyle === "subtle" ? CARD_BORDER.subtle : content.cardBorderStyle === "accent" ? `2px solid ${resolvedAccent}` : "none",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Icon + Name row */}
                <div style={{ display: "flex", alignItems: "center", gap: "6%", marginBottom: "6%" }}>
                  <div style={{ flexShrink: 0 }}>
                    {val.iconUrl ? (
                      <img src={val.iconUrl} alt={val.name} style={{ width: "1.15em", height: "1.15em", objectFit: "contain" }} />
                    ) : (
                      renderIcon(val.icon, resolvedAccent, "1.15em")
                    )}
                  </div>
                  <p
                    style={{
                      fontFamily: nameFont,
                      fontSize: `${0.58 * nameSize}em`,
                      fontWeight: (val.nameBold ?? true) ? 700 : 400,
                      fontStyle: val.nameItalic ? "italic" : undefined,
                      textDecoration: val.nameUnderline ? "underline" : undefined,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: nameColor,
                      lineHeight: 1.2,
                      textShadow: makeOutlineShadow(val.nameOutline),
                    }}
                  >
                    {val.name}
                  </p>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontFamily: descFont,
                    fontSize: `${0.46 * descSize}em`,
                    fontWeight: val.descriptionBold ? 700 : 400,
                    fontStyle: val.descriptionItalic ? "italic" : undefined,
                    textDecoration: val.descriptionUnderline ? "underline" : undefined,
                    color: descColor,
                    lineHeight: 1.65,
                    opacity: 0.82,
                    textShadow: makeOutlineShadow(val.descriptionOutline),
                  }}
                >
                  {val.description}
                </p>
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

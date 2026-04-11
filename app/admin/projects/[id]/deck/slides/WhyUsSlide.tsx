"use client";

import type {
  ProposalSlide,
  DeckBranding,
  WhyUsContent,
  WhyUsPillarItem,
  WhyUsTestimonial,
  WhyUsLayoutKey,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { StarRating } from "./shared/StarRating";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, SLIDE_FONTS, LOGO_POSITION_DEFAULTS, CARD_SHADOWS, CARD_PADDING, CARD_BORDER } from "@/app/lib/slide-constants";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

function getVisiblePillars(content: WhyUsContent): WhyUsPillarItem[] {
  const all = content.pillars ?? [];
  if ((content.selectedPillarIds?.length ?? 0) > 0) {
    return all.filter((p) => content.selectedPillarIds!.includes(p.id));
  }
  return all;
}

function getSectionTitle(content: WhyUsContent, slide: ProposalSlide): string {
  return content.sectionTitle || slide.headline || "The HHI Difference";
}

function NoPillars() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5em",
      }}
    >
      <p style={{ fontSize: "0.8em", color: "#9CA3AF" }}>No pillars to display.</p>
      <p style={{ fontSize: "0.65em", color: "#C4C4BF" }}>
        Go to Settings → Value Pillars to add them.
      </p>
    </div>
  );
}

// ─── Layout 1: pillars-grid ────────────────────────────────────────────────────

function PillarCard({
  pillar,
  branding,
  content,
}: {
  pillar: WhyUsPillarItem;
  branding: DeckBranding;
  content: WhyUsContent;
}) {
  const titleFont = pillar.titleFont ?? SLIDE_FONTS.defaults.headline;
  const titleSize = pillar.titleSize ?? 1.0;
  const titleColor = pillar.titleColor ?? branding.textColor;
  const descFont = pillar.descriptionFont ?? SLIDE_FONTS.defaults.body;
  const descSize = pillar.descriptionSize ?? 0.72;
  const descColor = pillar.descriptionColor ?? "#4B5563";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "0 4%",
      }}
    >
      {/* Icon */}
      <div
        style={{
          height: "5.5em",
          marginBottom: "1.0em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {pillar.iconUrl ? (
          <img
            src={pillar.iconUrl}
            alt={pillar.title}
            style={{ maxHeight: "100%", maxWidth: "5.5em", objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              width: "4em",
              height: "4em",
              borderRadius: "50%",
              border: `2px solid ${branding.accentColor}`,
              background: `${branding.accentColor}12`,
            }}
          />
        )}
      </div>

      <p
        className="font-serif"
        style={{
          fontSize: `${titleSize}em`,
          fontWeight: (pillar.titleBold ?? true) ? 700 : 400,
          fontStyle: pillar.titleItalic ? "italic" : undefined,
          textDecoration: pillar.titleUnderline ? "underline" : undefined,
          fontFamily: titleFont,
          color: titleColor,
          lineHeight: 1.25,
          marginBottom: "0.55em",
          textShadow: makeOutlineShadow(pillar.titleOutline),
        }}
      >
        {pillar.title}
      </p>

      <p style={{
        fontSize: `${descSize}em`,
        fontFamily: descFont,
        fontWeight: pillar.descriptionBold ? 700 : 400,
        fontStyle: pillar.descriptionItalic ? "italic" : undefined,
        textDecoration: pillar.descriptionUnderline ? "underline" : undefined,
        color: descColor,
        lineHeight: 1.7,
        textShadow: makeOutlineShadow(pillar.descriptionOutline),
      }}>
        {pillar.body}
      </p>
    </div>
  );
}

function PillarsGridLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Per-field: section title
  const stFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const stSize = content.sectionTitleSize ?? 3.6;
  const stColor = content.sectionTitleColor ?? branding.textColor;

  const pillarRow = visiblePillars.flatMap((pillar, i) => {
    const card = <PillarCard key={pillar.id} pillar={pillar} branding={branding} content={content} />;
    if (i === 0) return [card];
    return [
      <div
        key={`sep-${i}`}
        style={{
          flexShrink: 0,
          width: 1,
          alignSelf: "stretch",
          background: "rgba(0,0,0,0.10)",
        }}
      />,
      card,
    ];
  });

  return (
    <div className="relative w-full h-full" style={{ background: hasAiBackground ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      {/* Dashed grid watermark */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.04,
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="wug-pg-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={branding.textColor}
              strokeWidth="0.5"
              strokeDasharray="2 4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wug-pg-grid)" />
      </svg>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "6% 6% 4%",
        }}
      >
        {/* Header — left-aligned */}
        <div style={{ textAlign: "left", marginBottom: "4%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: `${stSize / 3.6 * 3.6}em`,
              fontFamily: stFont,
              fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
              fontStyle: content.sectionTitleItalic ? "italic" : undefined,
              textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
              color: stColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.sectionTitleOutline),
            }}
          >
            {sectionTitle}
          </h2>
          <TitleAccentRule accentColor={accent} />
        </div>

        {/* Pillar row */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start" }}>{pillarRow}</div>
          </div>
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

// ─── Layout 2: editorial-cards ─────────────────────────────────────────────────

function EditorialCardsLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const cardShadowKey = content.cardShadow ?? "normal";
  const cardShadow = cardShadowKey === "none" ? "none" : (CARD_SHADOWS[cardShadowKey as keyof typeof CARD_SHADOWS] ?? CARD_SHADOWS.normal);
  const cardPad = CARD_PADDING[content.cardSpacing ?? "normal"] ?? CARD_PADDING.normal;
  const cardBorder = content.cardBorderStyle === "accent"
    ? `2px solid ${accent}`
    : content.cardBorderStyle === "subtle"
    ? CARD_BORDER.subtle
    : CARD_BORDER.none;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Per-field: section title
  const stFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const stSize = content.sectionTitleSize ?? 3.2;
  const stColor = content.sectionTitleColor ?? branding.textColor;

  // Only show the testimonial band when real testimonials have been wired
  const testimonials = content.testimonials ?? [];
  const hasTestimonial = testimonials.length > 0;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasAiBackground ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dot-grid texture */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.025,
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern id="wug-ec-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={branding.textColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wug-ec-dots)" />
      </svg>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 7%",
        }}
      >
        {/* Centered headline */}
        <div style={{ textAlign: "center", marginBottom: hasTestimonial ? "3.5%" : "4.5%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: `${stSize / 3.2 * 3.2}em`,
              fontFamily: stFont,
              fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
              fontStyle: content.sectionTitleItalic ? "italic" : undefined,
              textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
              color: stColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.sectionTitleOutline),
            }}
          >
            {sectionTitle}
          </h2>
          <TitleAccentRule accentColor={accent} marginTop="0.6em" marginBottom="0" width={ACCENT_RULE_WIDTH.narrow} />
        </div>

        {/* Cards row */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-start",
              gap: "2%",
              marginBottom: hasTestimonial ? "3%" : 0,
            }}
          >
            {visiblePillars.map((pillar) => {
              const tFont = pillar.titleFont ?? SLIDE_FONTS.defaults.headline;
              const tSize = pillar.titleSize ?? 0.95;
              const tColor = pillar.titleColor ?? branding.textColor;
              const dFont = pillar.descriptionFont ?? SLIDE_FONTS.defaults.body;
              const dSize = pillar.descriptionSize ?? 0.68;
              const dColor = pillar.descriptionColor ?? "#4B5563";
              return (
                <div
                  key={pillar.id}
                  style={{
                    flex: 1,
                    background: "#EEECEA",
                    borderRadius: 6,
                    padding: cardPad,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: cardShadow,
                    border: cardBorder,
                  }}
                >
                  {/* Icon — centered at top of card */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "3.6em",
                      marginBottom: "1.4em",
                      flexShrink: 0,
                    }}
                  >
                    {pillar.iconUrl ? (
                      <img
                        src={pillar.iconUrl}
                        alt={pillar.title}
                        style={{ maxHeight: "3.4em", maxWidth: "3.4em", objectFit: "contain" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "3em",
                          height: "3em",
                          borderRadius: "50%",
                          border: `2px solid ${accent}`,
                          background: `${accent}12`,
                        }}
                      />
                    )}
                  </div>

                  {/* Accent rule */}
                  <div
                    style={{
                      width: "1.6em",
                      height: 2,
                      background: accent,
                      marginBottom: "0.8em",
                      flexShrink: 0,
                    }}
                  />
                  <p
                    className="font-serif"
                    style={{
                      fontSize: `${tSize}em`,
                      fontWeight: (pillar.titleBold ?? true) ? 700 : 400,
                      fontStyle: pillar.titleItalic ? "italic" : undefined,
                      textDecoration: pillar.titleUnderline ? "underline" : undefined,
                      fontFamily: tFont,
                      color: tColor,
                      lineHeight: 1.25,
                      marginBottom: "0.65em",
                      flexShrink: 0,
                      textShadow: makeOutlineShadow(pillar.titleOutline),
                    }}
                  >
                    {pillar.title}
                  </p>
                  <p
                    style={{
                      fontSize: `${dSize}em`,
                      fontFamily: dFont,
                      fontWeight: pillar.descriptionBold ? 700 : 400,
                      fontStyle: pillar.descriptionItalic ? "italic" : undefined,
                      textDecoration: pillar.descriptionUnderline ? "underline" : undefined,
                      color: dColor,
                      lineHeight: 1.75,
                      textShadow: makeOutlineShadow(pillar.descriptionOutline),
                    }}
                  >
                    {pillar.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Testimonial band — only renders when testimonials are wired */}
        {hasTestimonial && (
          <div
            style={{
              background: "#EEECEA",
              borderRadius: 4,
              padding: "2.5% 4%",
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <p
              className="font-serif"
              style={{
                fontSize: "0.72em",
                fontStyle: "italic",
                color: branding.textColor,
                lineHeight: 1.7,
                marginBottom: "0.4em",
              }}
            >
              &ldquo;{testimonials[0].quote}&rdquo;
            </p>
            <p style={{ fontSize: "0.6em", color: "#6B7280", fontWeight: 500 }}>
              — {testimonials[0].author}
              {testimonials[0].location ? `, ${testimonials[0].location}` : ""}
            </p>
          </div>
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

// ─── Layout 3: stacked-list ────────────────────────────────────────────────────

function StackedListLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Per-field: section title
  const stFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const stSize = content.sectionTitleSize ?? 3.2;
  const stColor = content.sectionTitleColor ?? branding.textColor;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasAiBackground ? "transparent" : "#FFFFFF", overflow: "hidden" }}
    >
      {/* Faint vertical accent guide */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "7.5%",
          width: 1,
          background: `${accent}18`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 8%",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "3.5%" }}>
          {(content.showSectionLabel ?? true) && (
            <p
              style={{
                fontSize: SECTION_LABEL_SIZE,
                fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: accent,
                marginBottom: "0.35em",
              }}
            >
              Why Choose Us
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: `${stSize / 3.2 * 3.2}em`,
              fontFamily: stFont,
              fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
              fontStyle: content.sectionTitleItalic ? "italic" : undefined,
              textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
              color: stColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.sectionTitleOutline),
            }}
          >
            {sectionTitle}
          </h2>
          <TitleAccentRule accentColor={accent} />
        </div>

        {/* Stacked rows */}
        {visiblePillars.length === 0 ? (
          <NoPillars />
        ) : (
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            {visiblePillars.map((pillar, i) => {
              const tFont = pillar.titleFont ?? SLIDE_FONTS.defaults.headline;
              const tSize = pillar.titleSize ?? 0.95;
              const tColor = pillar.titleColor ?? branding.textColor;
              const dFont = pillar.descriptionFont ?? SLIDE_FONTS.defaults.body;
              const dSize = pillar.descriptionSize ?? 0.78;
              const dColor = pillar.descriptionColor ?? "#374151";
              return (
                <div key={pillar.id}>
                  {/* Row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "4%",
                      paddingTop: i === 0 ? 0 : "2.6%",
                      paddingBottom: "2.6%",
                    }}
                  >
                    {/* Icon container */}
                    <div
                      style={{
                        flexShrink: 0,
                        width: "3.4em",
                        height: "3.4em",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {pillar.iconUrl ? (
                        <img
                          src={pillar.iconUrl}
                          alt={pillar.title}
                          style={{ maxWidth: "3.2em", maxHeight: "3.2em", objectFit: "contain" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "2.8em",
                            height: "2.8em",
                            borderRadius: "50%",
                            background: `${accent}14`,
                            border: `1.5px solid ${accent}50`,
                          }}
                        />
                      )}
                    </div>

                    {/* Title + body */}
                    <div style={{ flex: 1 }}>
                      <p
                        className="font-serif"
                        style={{
                          fontSize: `${tSize}em`,
                          fontWeight: (pillar.titleBold ?? true) ? 700 : 400,
                          fontStyle: pillar.titleItalic ? "italic" : undefined,
                          textDecoration: pillar.titleUnderline ? "underline" : undefined,
                          fontFamily: tFont,
                          color: tColor,
                          lineHeight: 1.25,
                          marginBottom: "0.4em",
                          textShadow: makeOutlineShadow(pillar.titleOutline),
                        }}
                      >
                        {pillar.title}
                      </p>
                      <p
                        style={{
                          fontSize: `${dSize}em`,
                          fontFamily: dFont,
                          fontWeight: pillar.descriptionBold ? 700 : 500,
                          fontStyle: pillar.descriptionItalic ? "italic" : undefined,
                          textDecoration: pillar.descriptionUnderline ? "underline" : undefined,
                          color: dColor,
                          lineHeight: 1.65,
                          textShadow: makeOutlineShadow(pillar.descriptionOutline),
                        }}
                      >
                        {pillar.body}
                      </p>
                    </div>
                  </div>

                  {/* Row divider */}
                  {i < visiblePillars.length - 1 && (
                    <div
                      style={{
                        height: 1,
                        background: "rgba(0,0,0,0.07)",
                        marginLeft: "calc(3.4em + 4%)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
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

// ─── Layout 4: testimonials-split ─────────────────────────────────────────────
// Two-column. Left: client quote cards. Right: dark panel with pillar highlights.
// Uses content.testimonials when wired; falls back to empty state.
// NOTE: Testimonial styling is NOT changed per task spec.

function TestimonialsSplitLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const visiblePillars = getVisiblePillars(content);
  const sectionTitle = getSectionTitle(content, slide);

  // Per-field: section title
  const stFont = content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline;
  const stSize = content.sectionTitleSize ?? 3.0;
  const stColor = content.sectionTitleColor ?? branding.textColor;

  const displayedTestimonials = (content.testimonials ?? []).slice(0, 3);
  const displayedPillars = visiblePillars.slice(0, 4);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasAiBackground ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Dark right-column panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "40%",
          background: branding.textColor,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "5% 0",
        }}
      >
        {/* Full-width headline */}
        <div style={{ padding: "0 6%", marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE, fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em", color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: `${stSize / 3.0 * 3.0}em`,
              fontFamily: stFont,
              fontWeight: (content.sectionTitleBold ?? true) ? 800 : 400,
              fontStyle: content.sectionTitleItalic ? "italic" : undefined,
              textDecoration: content.sectionTitleUnderline ? "underline" : undefined,
              color: stColor,
              lineHeight: 1.15,
              textShadow: makeOutlineShadow(content.sectionTitleOutline),
            }}
          >
            {sectionTitle}
          </h2>
          <TitleAccentRule accentColor={accent} />
        </div>

        {/* Two-column body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT — testimonial quote cards (60%) — NOT CHANGED */}
          <div
            style={{
              width: "60%",
              padding: "0 3% 0 6%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "3%",
            }}
          >
            {displayedTestimonials.length === 0 ? (
              <div style={{ flex: 1 }} />
            ) : (
              displayedTestimonials.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#EEECEA",
                    borderRadius: 4,
                    padding: "3% 4%",
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <p
                    className="font-serif"
                    style={{
                      fontSize: "0.63em",
                      fontStyle: "italic",
                      color: branding.textColor,
                      lineHeight: 1.7,
                      marginBottom: "0.5em",
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  {t.rating != null && t.rating > 0 && (
                    <div style={{ marginBottom: "0.4em" }}>
                      <StarRating rating={t.rating} size="sm" />
                    </div>
                  )}
                  <p
                    style={{
                      fontSize: "0.54em",
                      color: "#6B7280",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                    }}
                  >
                    — {t.author}
                    {t.location ? (
                      <span style={{ fontWeight: 400 }}>, {t.location}</span>
                    ) : null}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* RIGHT — pillar highlights on dark panel (40%) */}
          <div
            style={{
              width: "40%",
              padding: "0 6% 0 5%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "6%",
            }}
          >
            {/* Column label */}
            <p
              style={{
                fontSize: "0.54em",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: accent,
              }}
            >
              Why Clients Choose Us
            </p>

            {displayedPillars.length === 0 ? (
              <p style={{ fontSize: "0.65em", color: "rgba(255,255,255,0.4)" }}>
                No pillars selected.
              </p>
            ) : (
              displayedPillars.map((pillar) => {
                const tFont = pillar.titleFont ?? SLIDE_FONTS.defaults.headline;
                const tSize = pillar.titleSize ?? 0.82;
                const tColor = pillar.titleColor ?? "#FFFFFF";
                const dFont = pillar.descriptionFont ?? SLIDE_FONTS.defaults.body;
                const dSize = pillar.descriptionSize ?? 0.6;
                const dColor = pillar.descriptionColor ?? "rgba(255,255,255,0.6)";
                return (
                  <div
                    key={pillar.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: "1em" }}
                  >
                    {/* Icon — inverted for dark background */}
                    {pillar.iconUrl ? (
                      <img
                        src={pillar.iconUrl}
                        alt={pillar.title}
                        style={{
                          width: "2.4em",
                          height: "2.4em",
                          objectFit: "contain",
                          flexShrink: 0,
                          filter: "brightness(0) invert(1)",
                          opacity: 0.8,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          flexShrink: 0,
                          width: "2.2em",
                          height: "2.2em",
                          borderRadius: "50%",
                          border: `1.5px solid ${accent}`,
                        }}
                      />
                    )}

                    {/* Title + body */}
                    <div>
                      <p
                        className="font-serif"
                        style={{
                          fontSize: `${tSize}em`,
                          fontWeight: (pillar.titleBold ?? true) ? 700 : 400,
                          fontStyle: pillar.titleItalic ? "italic" : undefined,
                          textDecoration: pillar.titleUnderline ? "underline" : undefined,
                          fontFamily: tFont,
                          color: tColor,
                          lineHeight: 1.25,
                          marginBottom: "0.3em",
                          textShadow: makeOutlineShadow(pillar.titleOutline),
                        }}
                      >
                        {pillar.title}
                      </p>
                      <p
                        style={{
                          fontSize: `${dSize}em`,
                          fontFamily: dFont,
                          fontWeight: pillar.descriptionBold ? 700 : 400,
                          fontStyle: pillar.descriptionItalic ? "italic" : undefined,
                          textDecoration: pillar.descriptionUnderline ? "underline" : undefined,
                          color: dColor,
                          lineHeight: 1.65,
                          textShadow: makeOutlineShadow(pillar.descriptionOutline),
                        }}
                      >
                        {pillar.body}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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

// ─── Main export — layout dispatcher ──────────────────────────────────────────

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

export function WhyUsSlide({ slide, branding, hasAiBackground }: Props) {
  switch (slide.layoutKey as WhyUsLayoutKey) {
    case "editorial-cards":
      return <EditorialCardsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "stacked-list":
      return <StackedListLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "testimonials-split":
      return <TestimonialsSplitLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "pillars-grid":
    default:
      return <PillarsGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

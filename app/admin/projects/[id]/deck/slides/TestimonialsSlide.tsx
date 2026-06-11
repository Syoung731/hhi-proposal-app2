"use client";

import type { ProposalSlide, DeckBranding, TestimonialsContent, SlideTestimonial } from "@/app/lib/deck/types";
import { DEFAULT_TESTIMONIALS, TESTIMONIALS_SLIDE_DEFAULTS } from "@/app/lib/testimonial-defaults";
import { StarRating } from "./shared/StarRating";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import { PhotoOverlay } from "@/components/slides/shared/PhotoOverlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, ACCENT_RULE_WIDTH, CARD_SHADOWS, CARD_PADDING, CARD_BORDER, HEADLINE_SCALE, BODY_SCALE, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";
import { OVERLAY_PRESETS } from "@/components/slides/shared/PhotoOverlay";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

// ─── Decorative quote mark ──────────────────────────────────────────────────

function QuoteMark({ size = "72px", color = GOLD }: { size?: string; color?: string }) {
  return (
    <span
      style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: size,
        fontWeight: 700,
        color,
        lineHeight: 0.6,
        display: "block",
        marginBottom: "0.1em",
        opacity: 0.8,
        userSelect: "none",
      }}
    >
      {"\u201C"}
    </span>
  );
}

// ─── Testimonial card (shared by Layouts A and C) ───────────────────────────

function TestimonialCard({
  t,
  showStars,
  cardBg = "rgba(255,255,255,1)",
  backdrop = false,
  fallbackTextColor,
}: {
  t: SlideTestimonial;
  showStars: boolean;
  cardBg?: string;
  backdrop?: boolean;
  fallbackTextColor: string;
}) {
  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 8,
        padding: "1em 1.1em",
        boxShadow: CARD_SHADOWS.normal,
        display: "flex",
        flexDirection: "column",
        ...(backdrop ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } : {}),
      }}
    >
      <QuoteMark size="2em" />
      <div
        style={{
          fontFamily: t.quoteFont ?? SLIDE_FONTS.defaults.headline,
          fontSize: `${(t.quoteSize ?? 1.1) * 0.52}em`,
          fontWeight: t.quoteBold ? 700 : 400,
          fontStyle: t.quoteItalic !== false ? "italic" : "normal",
          textDecoration: t.quoteUnderline ? "underline" : "none",
          color: t.quoteColor ?? fallbackTextColor,
          textShadow: makeOutlineShadow(t.quoteOutline),
          lineHeight: 1.6,
          flex: 1,
          marginBottom: "0.5em",
        }}
      >
        {t.quote}
      </div>
      {/* Divider */}
      <div style={{ height: 1, background: GOLD, opacity: 0.3, marginBottom: "0.4em" }} />
      {showStars && (
        <div style={{ marginBottom: "0.3em" }}>
          <StarRating rating={t.rating ?? 5} size="sm" />
        </div>
      )}
      <div
        style={{
          fontFamily: t.clientNameFont ?? SLIDE_FONTS.defaults.body,
          fontSize: `${(t.clientNameSize ?? 0.9) * 0.46}em`,
          fontWeight: (t.clientNameBold !== false) ? 600 : 400,
          fontStyle: t.clientNameItalic ? "italic" : "normal",
          textDecoration: t.clientNameUnderline ? "underline" : "none",
          color: t.clientNameColor ?? fallbackTextColor,
          textShadow: makeOutlineShadow(t.clientNameOutline),
        }}
      >
        {t.clientName}
      </div>
      {t.projectName && (
        <div
          style={{
            fontFamily: t.projectNameFont ?? SLIDE_FONTS.defaults.body,
            fontSize: `${(t.projectNameSize ?? 0.8) * 0.38}em`,
            fontWeight: t.projectNameBold ? 700 : 400,
            fontStyle: t.projectNameItalic ? "italic" : "normal",
            textDecoration: t.projectNameUnderline ? "underline" : "none",
            color: t.projectNameColor ?? MUTED_NAVY,
            textShadow: makeOutlineShadow(t.projectNameOutline),
          }}
        >
          {t.projectName}
        </div>
      )}
    </div>
  );
}

// ─── Card grid helper ───────────────────────────────────────────────────────

function CardGrid({
  testimonials,
  showStars,
  cardBg,
  backdrop,
  fallbackTextColor,
}: {
  testimonials: SlideTestimonial[];
  showStars: boolean;
  cardBg?: string;
  backdrop?: boolean;
  fallbackTextColor: string;
}) {
  const count = testimonials.length;
  const cols = count <= 1 ? 1 : count <= 3 ? count : 2;
  const maxWidth = count === 1 ? "60%" : "100%";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "0.6em",
        maxWidth,
        margin: count === 1 ? "0 auto" : undefined,
        width: "100%",
      }}
    >
      {testimonials.map((t) => (
        <TestimonialCard key={t.id} t={t} showStars={showStars} cardBg={cardBg} backdrop={backdrop} fallbackTextColor={fallbackTextColor} />
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function TestimonialsSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as TestimonialsContent;
  const layoutKey = slide.layoutKey as string;
  const headline = slide.headline ?? TESTIMONIALS_SLIDE_DEFAULTS.headline;
  const subheadline = c.subheadline ?? null;
  const showStars = c.showStars ?? TESTIMONIALS_SLIDE_DEFAULTS.showStars;
  const bgPhoto = c.backgroundPhoto ?? null;
  const accent = c.accentColor ?? branding.accentColor;
  const testimonials = c.testimonials && c.testimonials.length > 0 ? c.testimonials : DEFAULT_TESTIMONIALS;

  switch (layoutKey) {
    case "quote-cards":
      return (
        <QuoteCardsLayout
          headline={headline}
          subheadline={subheadline}
          showStars={showStars}
          bgPhoto={bgPhoto}
          testimonials={testimonials}
          hasAiBackground={hasAiBackground}
          branding={branding}
          content={c}
          accent={accent}
        />
      );
    case "single-feature":
      return (
        <SingleFeatureLayout
          headline={headline}
          showStars={showStars}
          bgPhoto={bgPhoto}
          testimonials={testimonials}
          hasAiBackground={hasAiBackground}
          branding={branding}
          content={c}
          accent={accent}
        />
      );
    case "photo-overlay":
      return (
        <PhotoOverlayLayout
          headline={headline}
          subheadline={subheadline}
          showStars={showStars}
          bgPhoto={bgPhoto}
          testimonials={testimonials}
          hasAiBackground={hasAiBackground}
          branding={branding}
          content={c}
          accent={accent}
        />
      );
    default:
      return (
        <QuoteCardsLayout
          headline={headline}
          subheadline={subheadline}
          showStars={showStars}
          bgPhoto={bgPhoto}
          testimonials={testimonials}
          hasAiBackground={hasAiBackground}
          branding={branding}
          content={c}
          accent={accent}
        />
      );
  }
}

// ─── Layout A: Quote Cards ──────────────────────────────────────────────────

function QuoteCardsLayout({
  headline,
  subheadline,
  showStars,
  bgPhoto,
  testimonials,
  hasAiBackground,
  branding,
  content,
  accent,
}: {
  headline: string;
  subheadline: string | null;
  showStars: boolean;
  bgPhoto: string | null;
  testimonials: SlideTestimonial[];
  hasAiBackground?: boolean;
  branding: DeckBranding;
  content: TestimonialsContent;
  accent: string;
}) {
  const theme = useDeckTheme();
  const hasBg = !!bgPhoto;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg && (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      {hasBg && (content.showOverlay !== false) && <PhotoOverlay opacity={content.overlayOpacity ?? OVERLAY_PRESETS.medium} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: theme.color.surface }} />}
      {theme.surface.grid && !hasBg && !hasAiBackground && <BlueprintUnderlay />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content, alignItems: "center" }}>
        <div style={{ fontFamily: content.headlineFont ?? theme.fonts.headline, fontSize: `${(content.headlineSize ?? 2.0) * 0.6}em`, fontWeight: (content.headlineBold !== false) ? 600 : 400, fontStyle: content.headlineItalic ? "italic" : "normal", textDecoration: content.headlineUnderline ? "underline" : "none", color: content.headlineColor ?? (hasBg ? "#FFFFFF" : branding.textColor), textShadow: makeOutlineShadow(content.headlineOutline), textAlign: "center", lineHeight: 1.2 }}>
          {headline}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom={subheadline ? "0.3em" : "0.7em"} />
        </div>
        {subheadline && (
          <div style={{ fontFamily: content.subheadlineFont ?? SLIDE_FONTS.defaults.body, fontSize: `${(content.subheadlineSize ?? 1.0) * 0.48}em`, fontWeight: content.subheadlineBold ? 700 : 400, fontStyle: content.subheadlineItalic ? "italic" : "normal", textDecoration: content.subheadlineUnderline ? "underline" : "none", color: content.subheadlineColor ?? (hasBg ? "rgba(255,255,255,0.8)" : MUTED_NAVY), textShadow: makeOutlineShadow(content.subheadlineOutline), textAlign: "center", marginBottom: "0.7em" }}>
            {subheadline}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", alignItems: "center", width: "100%" }}>
          <CardGrid testimonials={testimonials.slice(0, 4)} showStars={showStars} fallbackTextColor={branding.textColor} />
        </div>
      </div>

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? (hasBg ? "dark" : "light")}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: Single Feature Quote ─────────────────────────────────────────

function SingleFeatureLayout({
  headline,
  showStars,
  bgPhoto,
  testimonials,
  hasAiBackground,
  branding,
  content,
  accent,
}: {
  headline: string;
  showStars: boolean;
  bgPhoto: string | null;
  testimonials: SlideTestimonial[];
  hasAiBackground?: boolean;
  branding: DeckBranding;
  content: TestimonialsContent;
  accent: string;
}) {
  const theme = useDeckTheme();
  const t = testimonials[0] ?? DEFAULT_TESTIMONIALS[0];
  const hasBg = !!bgPhoto;
  const textColor = hasBg ? "#FFFFFF" : branding.textColor;
  const mutedColor = hasBg ? "rgba(255,255,255,0.7)" : MUTED_NAVY;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg && (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      {hasBg && (content.showOverlay !== false) && <PhotoOverlay opacity={content.overlayOpacity ?? OVERLAY_PRESETS.medium} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: theme.color.surface }} />}
      {theme.surface.grid && !hasBg && !hasAiBackground && <BlueprintUnderlay />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: SLIDE_PADDING.centered, textAlign: "center" }}>
        <div style={{ fontFamily: content.headlineFont ?? theme.fonts.headline, fontSize: `${(content.headlineSize ?? 2.0) * 0.6}em`, fontWeight: (content.headlineBold !== false) ? 600 : 400, fontStyle: content.headlineItalic ? "italic" : "normal", textDecoration: content.headlineUnderline ? "underline" : "none", color: content.headlineColor ?? textColor, textShadow: makeOutlineShadow(content.headlineOutline), marginBottom: "0.3em" }}>
          {headline}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.2em" marginBottom="0.6em" />
        </div>
        <QuoteMark size="3.5em" />
        <div style={{ fontFamily: t.quoteFont ?? SLIDE_FONTS.defaults.headline, fontSize: `${(t.quoteSize ?? 1.1) * 0.8}em`, fontWeight: t.quoteBold ? 700 : 400, fontStyle: t.quoteItalic !== false ? "italic" : "normal", textDecoration: t.quoteUnderline ? "underline" : "none", color: t.quoteColor ?? textColor, textShadow: makeOutlineShadow(t.quoteOutline), lineHeight: 1.6, maxWidth: "65%", marginBottom: "0.6em" }}>
          {t.quote}
        </div>
        {showStars && (
          <div style={{ marginBottom: "0.4em" }}>
            <StarRating rating={t.rating ?? 5} size="md" />
          </div>
        )}
        <div style={{ fontFamily: t.clientNameFont ?? SLIDE_FONTS.defaults.body, fontSize: `${(t.clientNameSize ?? 0.9) * 0.52}em`, fontWeight: (t.clientNameBold !== false) ? 600 : 400, fontStyle: t.clientNameItalic ? "italic" : "normal", textDecoration: t.clientNameUnderline ? "underline" : "none", color: t.clientNameColor ?? textColor, textShadow: makeOutlineShadow(t.clientNameOutline) }}>
          {t.clientName}
        </div>
        {t.projectName && (
          <div style={{ fontFamily: t.projectNameFont ?? SLIDE_FONTS.defaults.body, fontSize: `${(t.projectNameSize ?? 0.8) * 0.42}em`, fontWeight: t.projectNameBold ? 700 : 400, fontStyle: t.projectNameItalic ? "italic" : "normal", textDecoration: t.projectNameUnderline ? "underline" : "none", color: t.projectNameColor ?? mutedColor, textShadow: makeOutlineShadow(t.projectNameOutline) }}>
            {t.projectName}
          </div>
        )}
      </div>

      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? (hasBg ? "dark" : "light")}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout C: Photo Overlay Cards ──────────────────────────────────────────

function PhotoOverlayLayout({
  headline,
  subheadline,
  showStars,
  bgPhoto,
  testimonials,
  hasAiBackground,
  branding,
  content,
  accent,
}: {
  headline: string;
  subheadline: string | null;
  showStars: boolean;
  bgPhoto: string | null;
  testimonials: SlideTestimonial[];
  hasAiBackground?: boolean;
  branding: DeckBranding;
  content: TestimonialsContent;
  accent: string;
}) {
  const theme = useDeckTheme();
  const hasBg = !!bgPhoto;

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {hasBg ? (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : null}

      {/* Overlay — conditional by background type */}
      {hasBg && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.7))" }} />}
      {!hasBg && hasAiBackground && (content.showOverlay !== false) && <PhotoOverlay opacity={content.overlayOpacity ?? OVERLAY_PRESETS.light} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: NAVY }} />}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content, alignItems: "center" }}>
        <div style={{ fontFamily: content.headlineFont ?? theme.fonts.headline, fontSize: `${(content.headlineSize ?? 2.0) * 0.6}em`, fontWeight: (content.headlineBold !== false) ? 600 : 400, fontStyle: content.headlineItalic ? "italic" : "normal", textDecoration: content.headlineUnderline ? "underline" : "none", color: content.headlineColor ?? "#FFFFFF", textShadow: makeOutlineShadow(content.headlineOutline), textAlign: "center", lineHeight: 1.2 }}>
          {headline}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom={subheadline ? "0.3em" : "0.7em"} />
        </div>
        {subheadline && (
          <div style={{ fontFamily: content.subheadlineFont ?? SLIDE_FONTS.defaults.body, fontSize: `${(content.subheadlineSize ?? 1.0) * 0.48}em`, fontWeight: content.subheadlineBold ? 700 : 400, fontStyle: content.subheadlineItalic ? "italic" : "normal", textDecoration: content.subheadlineUnderline ? "underline" : "none", color: content.subheadlineColor ?? "rgba(255,255,255,0.8)", textShadow: makeOutlineShadow(content.subheadlineOutline), textAlign: "center", marginBottom: "0.7em" }}>
            {subheadline}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", alignItems: "center", width: "100%" }}>
          <CardGrid
            testimonials={testimonials.slice(0, 4)}
            showStars={showStars}
            cardBg="rgba(255,255,255,0.9)"
            backdrop
            fallbackTextColor={branding.textColor}
          />
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

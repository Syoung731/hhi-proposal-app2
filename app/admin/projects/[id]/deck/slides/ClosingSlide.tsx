"use client";

import type { ProposalSlide, DeckBranding, ClosingContent } from "@/app/lib/deck/types";
import { CLOSING_SLIDE_DEFAULTS } from "@/app/lib/closing-slide-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { PhotoOverlay } from "@/components/slides/shared/PhotoOverlay";
import { SLIDE_PADDING, ACCENT_RULE_WIDTH, SLIDE_FONTS } from "@/app/lib/slide-constants";

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
const MUTED = "#8A9AB5";

// ─── Contact block ──────────────────────────────────────────────────────────

function ContactBlock({
  email,
  phone,
  address,
  color,
  size = "0.48em",
  fontFamily,
  bold,
  italic,
  underline,
  outline,
}: {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  color: string;
  size?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  outline?: string | null;
}) {
  const parts: string[] = [];
  if (email) parts.push(email);
  if (phone) parts.push(phone);
  if (address) parts.push(address);
  if (parts.length === 0) return null;

  return (
    <div
      style={{
        fontFamily: fontFamily ?? SLIDE_FONTS.defaults.body,
        fontSize: size,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : undefined,
        textDecoration: underline ? "underline" : undefined,
        color,
        textAlign: "center",
        lineHeight: 1.8,
        textShadow: makeOutlineShadow(outline),
      }}
    >
      {parts.map((p, i) => (
        <div key={i}>{p}</div>
      ))}
    </div>
  );
}

// ─── Main slide component ────────────────────────────────────────────────────

export function ClosingSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as ClosingContent;
  const layoutKey = slide.layoutKey as string;
  // Headline + tagline pull from CompanySettings via DeckBranding. Per-slide
  // overrides win; if both slide and settings are blank, render nothing.
  const headline = slide.headline ?? branding.closingHeadline ?? "";
  const tagline = c.tagline ?? branding.brandTagline ?? "";
  const subheadline = c.subheadline ?? null;
  const contactEmail = c.contactEmail || branding.email || null;
  const contactPhone = c.contactPhone || branding.phone || null;
  const address = c.address || branding.address || null;
  const validityNote = c.validityNote ?? CLOSING_SLIDE_DEFAULTS.validityNote;
  const bgColor = c.backgroundColor ?? CLOSING_SLIDE_DEFAULTS.backgroundColor;
  const bgPhoto = c.backgroundPhoto ?? null;
  const resolvedAccent = c.accentColor ?? branding.accentColor;
  const accent = resolvedAccent;
  const content = c;

  const common = {
    headline,
    tagline,
    subheadline,
    contactEmail,
    contactPhone,
    address,
    validityNote,
    bgColor,
    bgPhoto,
    branding,
    hasAiBackground,
    accent,
    content,
  };

  switch (layoutKey) {
    case "dark-centered":
      return <DarkCenteredLayout {...common} />;
    case "light-logo-centered":
      return <LightLogoCenteredLayout {...common} />;
    case "photo-white-card":
      return <PhotoWhiteCardLayout {...common} />;
    default:
      return <DarkCenteredLayout {...common} />;
  }
}

// ─── Shared types ───────────────────────────────────────────────────────────

interface LayoutProps {
  headline: string;
  tagline: string;
  subheadline: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  validityNote: string;
  bgColor: string;
  bgPhoto: string | null;
  branding: DeckBranding;
  hasAiBackground?: boolean;
  accent: string;
  content: ClosingContent;
}

// ─── Layout A: Dark Centered ────────────────────────────────────────────────

function DarkCenteredLayout({
  headline,
  tagline,
  subheadline,
  contactEmail,
  contactPhone,
  address,
  validityNote,
  bgColor,
  bgPhoto,
  branding,
  hasAiBackground,
  accent,
  content,
}: LayoutProps) {
  const hasBg = !!bgPhoto;
  const overlayOpacity = content.overlayOpacity ?? undefined;

  // Per-field styles — dark layout defaults
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.6;
  const headlineColor = content.headlineColor2 ?? "#FFFFFF";

  const taglineFont = content.taglineFont ?? headlineFont;
  const taglineSize = content.taglineSize ?? 1.4;
  const taglineColor = content.taglineColor ?? accent;

  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 0.5;
  const subColor = content.subheadlineColor ?? "rgba(255,255,255,0.7)";

  const contactFont = content.contactFont ?? SLIDE_FONTS.defaults.body;
  const contactSize = content.contactSize ?? 1.3;
  const contactColor = content.contactColor ?? "rgba(255,255,255,0.75)";

  const validityFont = content.validityFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const validitySize = content.validitySize ?? 2.0;
  const validityColor = content.validityColor ?? "#9CA3AF";

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {/* Background photo or solid color */}
      {hasBg ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgPhoto})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : null}

      {/* Overlay */}
      {hasBg && <PhotoOverlay opacity={overlayOpacity ?? 0.6} />}
      {!hasBg && hasAiBackground && <PhotoOverlay opacity={overlayOpacity ?? 0.45} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: bgColor }} />}

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: SLIDE_PADDING.centered,
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: "1.2em" }}>
          <LogoOverlay
            show={content.showLogo ?? true}
            variant="dark"
            xPercent={50}
            yPercent={50}
            scale={content.logoSize ?? 2.0}
            centered={true}
            branding={branding}
          />
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: headlineFont,
            fontSize: `${headlineSize}em`,
            fontWeight: content.headlineBold2 ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: headlineColor,
            lineHeight: 1.2,
            marginBottom: "0.15em",
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {headline}
        </div>

        <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0.5em" />

        {/* Tagline */}
        <div
          style={{
            fontFamily: taglineFont,
            fontSize: `${taglineSize}em`,
            fontWeight: content.taglineBold ? 700 : 400,
            fontStyle: content.taglineItalic ? "italic" : undefined,
            textDecoration: content.taglineUnderline ? "underline" : undefined,
            color: taglineColor,
            lineHeight: 1.5,
            marginBottom: subheadline ? "0.3em" : "1em",
            textShadow: makeOutlineShadow(content.taglineOutline),
          }}
        >
          {tagline}
        </div>

        {/* Subheadline */}
        {subheadline && (
          <div
            style={{
              fontFamily: subFont,
              fontSize: `${subSize}em`,
              fontWeight: content.subheadlineBold ? 700 : 400,
              fontStyle: content.subheadlineItalic ? "italic" : undefined,
              textDecoration: content.subheadlineUnderline ? "underline" : undefined,
              color: subColor,
              lineHeight: 1.5,
              marginBottom: "1em",
              maxWidth: "70%",
              textShadow: makeOutlineShadow(content.subheadlineOutline),
            }}
          >
            {subheadline}
          </div>
        )}

        {/* Contact info */}
        {(content.showContactInfo ?? true) && (
          <ContactBlock
            email={contactEmail}
            phone={contactPhone}
            address={address}
            color={contactColor}
            size={`${contactSize}em`}
            fontFamily={contactFont}
            bold={!!content.contactBold}
            italic={!!content.contactItalic}
            underline={!!content.contactUnderline}
            outline={content.contactOutline}
          />
        )}

        {/* Validity note */}
        {(content.showFooterNote ?? true) && validityNote && (
          <div
            style={{
              position: "absolute",
              bottom: "4%",
              fontFamily: validityFont,
              fontSize: `${validitySize}em`,
              fontWeight: content.validityBold ? 700 : 400,
              fontStyle: (content.validityItalic ?? true) ? "italic" : undefined,
              textDecoration: content.validityUnderline ? "underline" : undefined,
              color: validityColor,
              textShadow: makeOutlineShadow(content.validityOutline),
            }}
          >
            {validityNote}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Layout B: Light Logo Centered ──────────────────────────────────────────

function LightLogoCenteredLayout({
  headline,
  tagline,
  subheadline,
  contactEmail,
  contactPhone,
  address,
  validityNote,
  branding,
  hasAiBackground,
  accent,
  content,
}: LayoutProps) {
  // Per-field styles — light layout defaults (navy/dark text)
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.4;
  const headlineColor = content.headlineColor2 ?? branding.textColor;

  const taglineFont = content.taglineFont ?? headlineFont;
  const taglineSize = content.taglineSize ?? 0.7;
  const taglineColor = content.taglineColor ?? accent;

  const subFont = content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const subSize = content.subheadlineSize ?? 0.5;
  const subColor = content.subheadlineColor ?? "#6B7280";

  const contactFont = content.contactFont ?? SLIDE_FONTS.defaults.body;
  const contactSize = content.contactSize ?? 0.48;
  const contactColor = content.contactColor ?? "#4A5568";

  const validityFont = content.validityFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const validitySize = content.validitySize ?? 0.38;
  const validityColor = content.validityColor ?? "#9CA3AF";

  return (
    <div
      className="relative w-full h-full"
      style={{
        overflow: "hidden",
        background: hasAiBackground ? "transparent" : LINEN,
      }}
    >
      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: SLIDE_PADDING.centered,
          textAlign: "center",
        }}
      >
        {/* Logo — prominent */}
        <div style={{ marginBottom: "1.5em" }}>
          <LogoOverlay
            show={content.showLogo ?? true}
            variant="light"
            xPercent={50}
            yPercent={50}
            scale={content.logoSize ?? 2.0}
            centered={true}
            branding={branding}
          />
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: headlineFont,
            fontSize: `${headlineSize}em`,
            fontWeight: (content.headlineBold2 ?? true) ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: headlineColor,
            lineHeight: 1.2,
            marginBottom: "0.15em",
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {headline}
        </div>

        <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0.5em" />

        {/* Tagline */}
        <div
          style={{
            fontFamily: taglineFont,
            fontSize: `${taglineSize}em`,
            fontWeight: content.taglineBold ? 700 : 400,
            fontStyle: (content.taglineItalic ?? true) ? "italic" : undefined,
            textDecoration: content.taglineUnderline ? "underline" : undefined,
            color: taglineColor,
            lineHeight: 1.5,
            marginBottom: subheadline ? "0.3em" : "1.2em",
            textShadow: makeOutlineShadow(content.taglineOutline),
          }}
        >
          {tagline}
        </div>

        {/* Subheadline */}
        {subheadline && (
          <div
            style={{
              fontFamily: subFont,
              fontSize: `${subSize}em`,
              fontWeight: content.subheadlineBold ? 700 : 400,
              fontStyle: content.subheadlineItalic ? "italic" : undefined,
              textDecoration: content.subheadlineUnderline ? "underline" : undefined,
              color: subColor,
              lineHeight: 1.5,
              marginBottom: "1.2em",
              maxWidth: "65%",
              textShadow: makeOutlineShadow(content.subheadlineOutline),
            }}
          >
            {subheadline}
          </div>
        )}

        {/* Contact info */}
        {(content.showContactInfo ?? true) && (
          <ContactBlock
            email={contactEmail}
            phone={contactPhone}
            address={address}
            color={contactColor}
            size={`${contactSize}em`}
            fontFamily={contactFont}
            bold={!!content.contactBold}
            italic={!!content.contactItalic}
            underline={!!content.contactUnderline}
            outline={content.contactOutline}
          />
        )}

        {/* Validity note */}
        {(content.showFooterNote ?? true) && validityNote && (
          <div
            style={{
              position: "absolute",
              bottom: "4%",
              fontFamily: validityFont,
              fontSize: `${validitySize}em`,
              fontWeight: content.validityBold ? 700 : 400,
              fontStyle: (content.validityItalic ?? true) ? "italic" : undefined,
              textDecoration: content.validityUnderline ? "underline" : undefined,
              color: validityColor,
              textShadow: makeOutlineShadow(content.validityOutline),
            }}
          >
            {validityNote}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout C: Photo + White Card ───────────────────────────────────────────

function PhotoWhiteCardLayout({
  headline,
  tagline,
  contactEmail,
  contactPhone,
  validityNote,
  bgPhoto,
  branding,
  hasAiBackground,
  accent,
  content,
}: LayoutProps) {
  const hasBg = !!bgPhoto;
  const overlayOpacity = content.overlayOpacity ?? undefined;

  // Per-field styles — photo-white-card: card is light, so navy text
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 1.2;
  const headlineColor = content.headlineColor2 ?? branding.textColor;

  const taglineFont = content.taglineFont ?? headlineFont;
  const taglineSize = content.taglineSize ?? 0.65;
  const taglineColor = content.taglineColor ?? accent;

  const contactFont = content.contactFont ?? SLIDE_FONTS.defaults.body;
  const contactSize = content.contactSize ?? 0.45;
  const contactColor = content.contactColor ?? "#4A5568";

  const validityFont = content.validityFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const validitySize = content.validitySize ?? 0.36;
  const validityColor = content.validityColor ?? "#9CA3AF";

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {/* Background photo or solid navy */}
      {hasBg ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgPhoto})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : null}

      {/* Overlay */}
      {hasBg && <PhotoOverlay opacity={overlayOpacity ?? 0.35} />}
      {!hasBg && hasAiBackground && <PhotoOverlay opacity={overlayOpacity ?? 0.3} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: NAVY }} />}

      {/* Centered white card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5%",
        }}
      >
        <div
          style={{
            width: "55%",
            background: "rgba(255,255,255,0.95)",
            borderRadius: "4px",
            padding: "2.2em 2.5em",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Logo */}
          <div style={{ marginBottom: "0.8em" }}>
            <LogoOverlay
              show={content.showLogo ?? true}
              variant="light"
              xPercent={50}
              yPercent={50}
              scale={content.logoSize ?? 1.2}
              centered={true}
              branding={branding}
            />
          </div>

          {/* Headline */}
          <div
            style={{
              fontFamily: headlineFont,
              fontSize: `${headlineSize}em`,
              fontWeight: (content.headlineBold2 ?? true) ? 700 : 400,
              fontStyle: content.headlineItalic ? "italic" : undefined,
              textDecoration: content.headlineUnderline ? "underline" : undefined,
              color: headlineColor,
              lineHeight: 1.2,
              marginBottom: "0.15em",
              textShadow: makeOutlineShadow(content.headlineOutline),
            }}
          >
            {headline}
          </div>

          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.narrow} marginTop="0.3em" marginBottom="0.5em" />

          {/* Tagline */}
          <div
            style={{
              fontFamily: taglineFont,
              fontSize: `${taglineSize}em`,
              fontWeight: content.taglineBold ? 700 : 400,
              fontStyle: (content.taglineItalic ?? true) ? "italic" : undefined,
              textDecoration: content.taglineUnderline ? "underline" : undefined,
              color: taglineColor,
              lineHeight: 1.5,
              marginBottom: "0.8em",
              textShadow: makeOutlineShadow(content.taglineOutline),
            }}
          >
            {tagline}
          </div>

          {/* Contact */}
          {(content.showContactInfo ?? true) && (
            <ContactBlock
              email={contactEmail}
              phone={contactPhone}
              color={contactColor}
              size={`${contactSize}em`}
              fontFamily={contactFont}
              bold={!!content.contactBold}
              italic={!!content.contactItalic}
              underline={!!content.contactUnderline}
              outline={content.contactOutline}
            />
          )}

          {/* Validity note */}
          {(content.showFooterNote ?? true) && validityNote && (
            <div
              style={{
                fontFamily: validityFont,
                fontSize: `${validitySize}em`,
                fontWeight: content.validityBold ? 700 : 400,
                fontStyle: (content.validityItalic ?? true) ? "italic" : undefined,
                textDecoration: content.validityUnderline ? "underline" : undefined,
                color: validityColor,
                marginTop: "0.8em",
                borderTop: "1px solid rgba(0,0,0,0.06)",
                paddingTop: "0.5em",
                width: "85%",
                textShadow: makeOutlineShadow(content.validityOutline),
              }}
            >
              {validityNote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

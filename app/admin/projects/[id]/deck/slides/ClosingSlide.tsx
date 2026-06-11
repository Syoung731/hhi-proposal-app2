"use client";

import type { ProposalSlide, DeckBranding, ClosingContent } from "@/app/lib/deck/types";
import { CLOSING_SLIDE_DEFAULTS } from "@/app/lib/closing-slide-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
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
    case "blueprint-split":
      return <BlueprintSplitLayout {...common} />;
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

// ─── Layout: Blueprint Split ────────────────────────────────────────────────
// "Securing Your Project Schedule" reference: left half is a grayscale
// blueprint sheet with the full-color logo glowing over it; right half is
// white with a bold sans headline, CTA paragraph, validity line, and an
// orange-topped contact box (tagline + email | phone + address).

const SPLIT_SANS = "var(--font-jost), sans-serif";

function BlueprintSplitLayout({
  headline,
  contactEmail,
  contactPhone,
  address,
  validityNote,
  branding,
  accent,
  content,
}: LayoutProps) {
  const sheet = content.blueprintPhoto ?? CLOSING_SLIDE_DEFAULTS.blueprintImage;
  const cta = content.ctaParagraph ?? CLOSING_SLIDE_DEFAULTS.ctaParagraph;
  const boxTitle = content.contactBoxTitle ?? CLOSING_SLIDE_DEFAULTS.contactBoxTitle;

  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SPLIT_SANS;
  const headlineSize = content.headlineSize ?? 2.5;
  const headlineColor = content.headlineColor2 ?? "#3A3D42";

  const ctaSize = 1.0 * (content.ctaParagraphSize ?? 1.0);
  const validitySize = content.validitySize ?? 0.78;
  const validityColor = content.validityColor ?? "#3A3D42";
  const boxScale = content.contactBoxTextSize ?? 1.0;

  const contactLine = [contactEmail, contactPhone].filter(Boolean).join("  |  ");
  // Full-color logo for the light sheet; the dark-variant file is the fallback.
  const logoSrc = branding.logoLightUrl ?? branding.logoDarkUrl;
  // logoSize 2.0 (the shared slider default) → logo spans ~70% of the panel.
  const logoWidthPct = Math.min((content.logoSize ?? 2.0) * 35, 95);

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: "#FFFFFF", display: "flex" }}
    >
      {/* Left: blueprint sheet with glowing logo */}
      <div style={{ position: "relative", width: "50%", height: "100%", overflow: "hidden", background: "#FFFFFF" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sheet}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1)", opacity: 0.85 }}
        />
        {/* Light wash so the sheet reads as a watermark */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.3)", zIndex: 1 }} />
        {/* Radial glow behind the logo */}
        {(content.showLogo ?? true) && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${Math.min(logoWidthPct * 1.45, 100)}%`,
              aspectRatio: "1.5",
              borderRadius: "50%",
              zIndex: 2,
              background:
                "radial-gradient(closest-side, #FFFFFF 40%, rgba(255,255,255,0.85) 62%, rgba(255,255,255,0) 100%)",
            }}
          />
        )}
        {/* Full-color logo, dead-center over the glow */}
        {(content.showLogo ?? true) && logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={branding.companyName}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: `${logoWidthPct}%`,
              height: "auto",
              zIndex: 3,
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Right: white CTA panel */}
      <div
        style={{
          position: "relative",
          width: "50%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "2.8em 3.0em 2.0em 3.2em",
          background: "#FFFFFF",
          borderLeft: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        {/* Headline */}
        <div
          style={{
            fontFamily: headlineFont,
            fontSize: `${headlineSize}em`,
            fontWeight: (content.headlineBold2 ?? true) ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: headlineColor,
            lineHeight: 1.08,
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {headline}
        </div>
        <div style={{ width: "3em", height: "0.16em", background: accent, marginTop: "0.5em", flexShrink: 0 }} />

        {/* CTA paragraph */}
        <div
          style={{
            fontFamily: content.bodyFont ?? SPLIT_SANS,
            fontSize: `${ctaSize}em`,
            color: "#4A4D52",
            lineHeight: 1.55,
            marginTop: "1.0em",
          }}
        >
          {cta}
        </div>

        {/* Validity line */}
        {(content.showFooterNote ?? true) && validityNote && (
          <div
            style={{
              fontFamily: content.validityFont ?? content.bodyFont ?? SPLIT_SANS,
              fontSize: `${validitySize}em`,
              fontWeight: content.validityBold ? 700 : 400,
              fontStyle: content.validityItalic ? "italic" : undefined,
              textDecoration: content.validityUnderline ? "underline" : undefined,
              color: validityColor,
              marginTop: "1.4em",
              textShadow: makeOutlineShadow(content.validityOutline),
            }}
          >
            {validityNote}
          </div>
        )}

        <div style={{ flex: 1, minHeight: "0.8em" }} />

        {/* Orange-topped contact box */}
        {(content.showContactInfo ?? true) && (boxTitle || contactLine || address) && (
          <div
            style={{
              borderTop: `0.28em solid ${accent}`,
              borderRight: "1px solid #E4E2DE",
              borderBottom: "1px solid #E4E2DE",
              borderLeft: "1px solid #E4E2DE",
              background: "#FFFFFF",
              padding: "1.05em 1.3em",
              flexShrink: 0,
            }}
          >
            {boxTitle && (
              <div
                style={{
                  fontFamily: content.contactFont ?? SPLIT_SANS,
                  fontSize: `${0.92 * boxScale}em`,
                  fontWeight: 700,
                  color: "#2E3136",
                  lineHeight: 1.35,
                }}
              >
                {boxTitle}
              </div>
            )}
            {contactLine && (
              <div
                style={{
                  fontFamily: content.contactFont ?? SPLIT_SANS,
                  fontSize: `${0.8 * boxScale}em`,
                  fontWeight: content.contactBold ? 700 : 400,
                  fontStyle: content.contactItalic ? "italic" : undefined,
                  textDecoration: content.contactUnderline ? "underline" : undefined,
                  color: content.contactColor ?? "#4A4D52",
                  lineHeight: 1.55,
                  marginTop: "0.45em",
                  textShadow: makeOutlineShadow(content.contactOutline),
                }}
              >
                {contactLine}
              </div>
            )}
            {address && (
              <div
                style={{
                  fontFamily: content.contactFont ?? SPLIT_SANS,
                  fontSize: `${0.8 * boxScale}em`,
                  fontWeight: content.contactBold ? 700 : 400,
                  fontStyle: content.contactItalic ? "italic" : undefined,
                  color: content.contactColor ?? "#4A4D52",
                  lineHeight: 1.55,
                  marginTop: "0.25em",
                }}
              >
                {address}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

  // Per-field styles — dark layout defaults (sized to the reference deck:
  // big serif headline, serif subhead, then logo, contact lockup, fine print)
  const headlineFont = content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
  const headlineSize = content.headlineSize ?? 2.1;
  const headlineColor = content.headlineColor2 ?? "#FFFFFF";

  const taglineFont = content.taglineFont ?? headlineFont;
  const taglineSize = content.taglineSize ?? 0.8;
  const taglineColor = content.taglineColor ?? accent;

  const subFont = content.subheadlineFont ?? headlineFont;
  const subSize = content.subheadlineSize ?? 0.85;
  const subColor = content.subheadlineColor ?? "rgba(255,255,255,0.92)";

  const contactFont = content.contactFont ?? SLIDE_FONTS.defaults.body;
  const contactSize = content.contactSize ?? 0.55;
  const contactColor = content.contactColor ?? "rgba(255,255,255,0.8)";

  const validityFont = content.validityFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
  const validitySize = content.validitySize ?? 0.45;
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
      {hasBg && (content.showOverlay !== false) && <PhotoOverlay opacity={overlayOpacity ?? 0.6} />}
      {!hasBg && hasAiBackground && (content.showOverlay !== false) && <PhotoOverlay opacity={overlayOpacity ?? 0.45} />}
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
        {/* Headline */}
        <div
          style={{
            fontFamily: headlineFont,
            fontSize: `${headlineSize}em`,
            fontWeight: content.headlineBold2 ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: headlineColor,
            lineHeight: 1.15,
            marginBottom: "0.1em",
            textShadow: makeOutlineShadow(content.headlineOutline),
          }}
        >
          {headline}
        </div>

        <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0.55em" />

        {/* Tagline — hidden when blank (type a single space to hide it; the
            logo lockup already carries the slogan) */}
        {tagline.trim() !== "" && (
          <div
            style={{
              fontFamily: taglineFont,
              fontSize: `${taglineSize}em`,
              fontWeight: content.taglineBold ? 700 : 400,
              fontStyle: content.taglineItalic ? "italic" : undefined,
              textDecoration: content.taglineUnderline ? "underline" : undefined,
              color: taglineColor,
              lineHeight: 1.5,
              marginBottom: subheadline ? "0.3em" : "0.5em",
              textShadow: makeOutlineShadow(content.taglineOutline),
            }}
          >
            {tagline}
          </div>
        )}

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
              lineHeight: 1.45,
              marginBottom: "0.4em",
              maxWidth: "80%",
              textShadow: makeOutlineShadow(content.subheadlineOutline),
            }}
          >
            {subheadline}
          </div>
        )}

        {/* Logo — between the message and the contact lockup (reference order) */}
        <div style={{ margin: "0.8em 0 0.9em" }}>
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

        {/* Contact lockup: company / address / phone | email */}
        {(content.showContactInfo ?? true) && (contactEmail || contactPhone || address) && (
          <div
            style={{
              fontFamily: contactFont,
              fontSize: `${contactSize}em`,
              fontWeight: content.contactBold ? 700 : 400,
              fontStyle: content.contactItalic ? "italic" : undefined,
              textDecoration: content.contactUnderline ? "underline" : undefined,
              color: contactColor,
              lineHeight: 1.75,
              textAlign: "center",
              textShadow: makeOutlineShadow(content.contactOutline),
            }}
          >
            <div style={{ fontWeight: 700, color: "#FFFFFF" }}>{branding.companyName}</div>
            {address && <div>{address}</div>}
            {(contactPhone || contactEmail) && (
              <div>{[contactPhone, contactEmail].filter(Boolean).join(" | ")}</div>
            )}
          </div>
        )}

        {/* Validity note */}
        {(content.showFooterNote ?? true) && validityNote && (
          <div
            style={{
              position: "absolute",
              bottom: "4%",
              maxWidth: "64%",
              textAlign: "center",
              lineHeight: 1.5,
              fontFamily: validityFont,
              fontSize: `${validitySize}em`,
              fontWeight: content.validityBold ? 700 : 400,
              fontStyle: content.validityItalic ? "italic" : undefined,
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
  const theme = useDeckTheme();
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
        background: hasAiBackground ? "transparent" : theme.color.surface,
      }}
    >
      {theme.surface.grid && !hasAiBackground && <BlueprintUnderlay />}
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
  const theme = useDeckTheme();
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
      {hasBg && (content.showOverlay !== false) && <PhotoOverlay opacity={overlayOpacity ?? 0.35} />}
      {!hasBg && hasAiBackground && (content.showOverlay !== false) && <PhotoOverlay opacity={overlayOpacity ?? 0.3} />}
      {!hasBg && !hasAiBackground && <div style={{ position: "absolute", inset: 0, background: theme.color.panel }} />}

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

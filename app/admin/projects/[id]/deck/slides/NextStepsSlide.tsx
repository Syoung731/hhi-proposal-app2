"use client";

import type { ProposalSlide, DeckBranding, NextStepsContent, NextStep } from "@/app/lib/deck/types";
import { HHI_DEFAULT_NEXT_STEPS } from "@/app/lib/next-steps-defaults";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, ACCENT_RULE_WIDTH, LOGO_POSITION_DEFAULTS, SLIDE_FONTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const LINEN = "#F5F0E8";
const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const MUTED_NAVY = "#4A5568";

// ─── Outline shadow helper ──────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const d = 1;
  return [
    `${d}px 0 0 ${color}`, `${-d}px 0 0 ${color}`,
    `0 ${d}px 0 ${color}`, `0 ${-d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`, `${-d}px ${-d}px 0 ${color}`,
  ].join(", ");
}

// ─── Contact footer ─────────────────────────────────────────────────────────

function ContactFooter({
  email,
  phone,
  address,
  showAddress,
  content,
}: {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  showAddress?: boolean | null;
  content?: NextStepsContent;
}) {
  const parts: string[] = [];
  if (email) parts.push(email);
  if (phone) parts.push(phone);
  if (showAddress && address) parts.push(address);
  if (parts.length === 0) return null;

  return (
    <div
      style={{
        fontFamily: content?.contactFont ?? SLIDE_FONTS.defaults.body,
        fontSize: `${(content?.contactSize ?? 0.7) * 0.6}em`,
        fontWeight: content?.contactBold ? 700 : 400,
        fontStyle: content?.contactItalic ? "italic" : "normal",
        textDecoration: content?.contactUnderline ? "underline" : "none",
        color: content?.contactColor ?? MUTED_NAVY,
        textAlign: "center",
        borderTop: `1px solid rgba(0,0,0,0.08)`,
        paddingTop: "0.5em",
        marginTop: "auto",
        textShadow: makeOutlineShadow(content?.contactOutline),
      }}
    >
      {parts.join("  \u00b7  ")}
    </div>
  );
}

// ─── Main slide component ────────────────────────────────────────────────────

export function NextStepsSlide({ slide, branding, hasAiBackground }: Props) {
  const c = (slide.content ?? {}) as NextStepsContent;
  const layoutKey = slide.layoutKey as string;
  const sectionLabel = c.sectionLabel ?? "WHAT HAPPENS NEXT";
  const headline = slide.headline ?? "Your Path Forward";
  const steps = c.steps && c.steps.length > 0 ? c.steps : HHI_DEFAULT_NEXT_STEPS;
  const hasBg = hasAiBackground || slide.backgroundId != null;

  const common = {
    sectionLabel,
    headline,
    steps,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    showAddress: c.showAddress,
    address: branding.address,
    rightPhoto: c.rightPhoto,
    hasBg,
    content: c,
    branding,
  };

  switch (layoutKey) {
    case "numbered-photo":
      return <NumberedPhotoLayout {...common} />;
    case "column-grid-photos":
      return <ColumnGridPhotosLayout {...common} />;
    case "two-by-two-grid":
      return <TwoByTwoGridLayout {...common} />;
    case "large-number-hero":
      return <LargeNumberHeroLayout {...common} />;
    default:
      return <NumberedPhotoLayout {...common} />;
  }
}

// ─── Shared types ───────────────────────────────────────────────────────────

interface LayoutProps {
  sectionLabel: string;
  headline: string;
  steps: NextStep[];
  contactEmail?: string | null;
  contactPhone?: string | null;
  showAddress?: boolean | null;
  address?: string | null;
  rightPhoto?: string | null;
  hasBg?: boolean;
  content: NextStepsContent;
  branding: DeckBranding;
}

// ─── Layout A: Numbered List + Photo ────────────────────────────────────────

function NumberedPhotoLayout({
  sectionLabel,
  headline,
  steps,
  contactEmail,
  contactPhone,
  showAddress,
  address,
  rightPhoto,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const accent = content.accentColor ?? GOLD;
  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex" }}>
        {/* Left content ~60% */}
        <div
          style={{
            width: rightPhoto ? "60%" : "100%",
            padding: SLIDE_PADDING.content,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Section label */}
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.3em",
            }}
          >
            {sectionLabel}
          </div>
          )}

          {/* Headline */}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${1.35 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? NAVY,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>

          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0.8em" />

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65em", flex: 1 }}>
            {steps.map((step) => (
              <div key={step.id} style={{ display: "flex", gap: "0.6em", alignItems: "flex-start" }}>
                <div
                  style={{
                    fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                    fontSize: `${(step.numberSize ?? 3.0) * 0.5}em`,
                    fontWeight: (step.numberBold !== false) ? 700 : 400,
                    fontStyle: step.numberItalic ? "italic" : "normal",
                    textDecoration: step.numberUnderline ? "underline" : "none",
                    color: step.numberColor ?? accent,
                    lineHeight: 1,
                    minWidth: "0.9em",
                    flexShrink: 0,
                    textShadow: makeOutlineShadow(step.numberOutline),
                  }}
                >
                  {step.number}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                      fontSize: `${0.58 * (step.titleSize ?? 1.0)}em`,
                      fontWeight: (step.titleBold ?? true) ? 600 : 400,
                      fontStyle: step.titleItalic ? "italic" : "normal",
                      textDecoration: step.titleUnderline ? "underline" : "none",
                      color: step.titleColor ?? NAVY,
                      lineHeight: 1.3,
                      marginBottom: "0.15em",
                      textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                      fontSize: `${0.48 * (step.descriptionSize ?? 1.0)}em`,
                      fontWeight: step.descriptionBold ? 600 : 400,
                      fontStyle: step.descriptionItalic ? "italic" : "normal",
                      textDecoration: step.descriptionUnderline ? "underline" : "none",
                      color: step.descriptionColor ?? MUTED_NAVY,
                      lineHeight: 1.5,
                      textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                    }}
                  >
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(content.showContactInfo ?? true) && (
            <ContactFooter email={contactEmail} phone={contactPhone} address={address} showAddress={showAddress} content={content} />
          )}
        </div>

        {/* Right photo ~40% */}
        {rightPhoto && (
          <div
            style={{
              width: "40%",
              backgroundImage: `url(${rightPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout B: 4-Column Grid with Photos ────────────────────────────────────

function ColumnGridPhotosLayout({
  sectionLabel,
  headline,
  steps,
  contactEmail,
  contactPhone,
  showAddress,
  address,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const accent = content.accentColor ?? GOLD;
  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "0.8em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${1.3 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? NAVY,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
          </div>
        </div>

        {/* 4-column grid */}
        <div style={{ display: "flex", gap: "3%", flex: 1 }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Large number */}
              <div
                style={{
                  fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                  fontSize: `${(step.numberSize ?? 3.0) * 0.67}em`,
                  fontWeight: (step.numberBold !== false) ? 700 : 400,
                  fontStyle: step.numberItalic ? "italic" : "normal",
                  textDecoration: step.numberUnderline ? "underline" : "none",
                  color: step.numberColor ?? accent,
                  lineHeight: 1,
                  marginBottom: "0.2em",
                  textShadow: makeOutlineShadow(step.numberOutline),
                }}
              >
                {String(step.number).padStart(2, "0")}
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${0.52 * (step.titleSize ?? 1.0)}em`,
                  fontWeight: (step.titleBold ?? true) ? 600 : 400,
                  fontStyle: step.titleItalic ? "italic" : "normal",
                  textDecoration: step.titleUnderline ? "underline" : "none",
                  color: step.titleColor ?? NAVY,
                  textAlign: "center",
                  lineHeight: 1.3,
                  marginBottom: "0.3em",
                  textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                }}
              >
                {step.title}
              </div>

              {/* Photo */}
              {step.photo && (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    backgroundImage: `url(${step.photo})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: 3,
                    marginBottom: "0.3em",
                    flexShrink: 0,
                  }}
                />
              )}

              {/* Description */}
              <div
                style={{
                  fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${0.42 * (step.descriptionSize ?? 1.0)}em`,
                  fontWeight: step.descriptionBold ? 600 : 400,
                  fontStyle: step.descriptionItalic ? "italic" : "normal",
                  textDecoration: step.descriptionUnderline ? "underline" : "none",
                  color: step.descriptionColor ?? MUTED_NAVY,
                  textAlign: "center",
                  lineHeight: 1.5,
                  textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                }}
              >
                {step.description}
              </div>
            </div>
          ))}
        </div>

        <ContactFooter email={contactEmail} phone={contactPhone} address={address} showAddress={showAddress} content={content} />
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout C: 2x2 Grid ─────────────────────────────────────────────────────

function TwoByTwoGridLayout({
  sectionLabel,
  headline,
  steps,
  contactEmail,
  contactPhone,
  showAddress,
  address,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const accent = content.accentColor ?? GOLD;
  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.centered,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "0.8em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${1.3 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? NAVY,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
          </div>
        </div>

        {/* 2x2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: "0.7em",
            flex: 1,
          }}
        >
          {steps.slice(0, 4).map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                gap: "0.5em",
                alignItems: "flex-start",
                padding: "0.6em",
                background: "rgba(255,255,255,0.5)",
                borderRadius: 4,
              }}
            >
              {/* Number circle */}
              <div
                style={{
                  width: "1.6em",
                  height: "1.6em",
                  borderRadius: "50%",
                  background: accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                  fontSize: "0.7em",
                  fontWeight: (step.numberBold !== false) ? 700 : 400,
                  fontStyle: step.numberItalic ? "italic" : "normal",
                  color: "#FFFFFF",
                  flexShrink: 0,
                  textShadow: makeOutlineShadow(step.numberOutline),
                }}
              >
                {step.number}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                    fontSize: `${0.55 * (step.titleSize ?? 1.0)}em`,
                    fontWeight: (step.titleBold ?? true) ? 600 : 400,
                    fontStyle: step.titleItalic ? "italic" : "normal",
                    textDecoration: step.titleUnderline ? "underline" : "none",
                    color: step.titleColor ?? NAVY,
                    lineHeight: 1.3,
                    marginBottom: "0.15em",
                    textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                    fontSize: `${0.44 * (step.descriptionSize ?? 1.0)}em`,
                    fontWeight: step.descriptionBold ? 600 : 400,
                    fontStyle: step.descriptionItalic ? "italic" : "normal",
                    textDecoration: step.descriptionUnderline ? "underline" : "none",
                    color: step.descriptionColor ?? MUTED_NAVY,
                    lineHeight: 1.5,
                    textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                  }}
                >
                  {step.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        <ContactFooter email={contactEmail} phone={contactPhone} address={address} showAddress={showAddress} content={content} />
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

// ─── Layout D: Large Number Hero ────────────────────────────────────────────

function LargeNumberHeroLayout({
  sectionLabel,
  headline,
  steps,
  contactEmail,
  contactPhone,
  showAddress,
  address,
  rightPhoto,
  hasBg,
  content,
  branding,
}: LayoutProps) {
  const accent = content.accentColor ?? GOLD;
  const hasPhoto = !!rightPhoto;

  return (
    <div
      className="relative w-full h-full"
      style={{ overflow: "hidden", background: hasBg ? "transparent" : LINEN }}
    >
      {/* Optional right photo with overlay */}
      {hasPhoto && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "45%",
              height: "100%",
              backgroundImage: `url(${rightPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "45%",
              height: "100%",
              background: "linear-gradient(to right, rgba(245,240,232,1) 0%, rgba(245,240,232,0.7) 30%, rgba(245,240,232,0.3) 100%)",
            }}
          />
        </>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "0.6em" }}>
          {(content.showSectionLabel ?? true) && (
          <div
            style={{
              fontFamily: content.sectionLabelFont ?? SLIDE_FONTS.defaults.label,
              fontSize: SECTION_LABEL_SIZE,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: content.sectionLabelColor ?? accent,
              marginBottom: "0.2em",
            }}
          >
            {sectionLabel}
          </div>
          )}
          <div
            style={{
              fontFamily: content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontSize: `${1.3 * (content.slideTitleSize ?? 1.0)}em`,
              fontWeight: (content.slideTitleBold ?? true) ? 700 : 400,
              fontStyle: content.slideTitleItalic ? "italic" : "normal",
              textDecoration: content.slideTitleUnderline ? "underline" : "none",
              color: content.slideTitleColor ?? NAVY,
              lineHeight: 1.15,
              textShadow: content.slideTitleOutline ? makeOutlineShadow(content.slideTitleOutline) : undefined,
            }}
          >
            {headline}
          </div>
          <TitleAccentRule accentColor={accent} width={ACCENT_RULE_WIDTH.standard} marginTop="0.3em" marginBottom="0" />
        </div>

        {/* Stacked steps with dividers */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {steps.map((step, i) => (
            <div key={step.id}>
              {i > 0 && (
                <div style={{ height: 1, background: `rgba(27,42,74,0.08)`, margin: "0.3em 0" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "0.8em", padding: "0.3em 0" }}>
                {/* Giant number */}
                <div
                  style={{
                    fontFamily: step.numberFont ?? SLIDE_FONTS.defaults.headline,
                    fontSize: `${(step.numberSize ?? 3.0) * 0.93}em`,
                    fontWeight: (step.numberBold !== false) ? 700 : 300,
                    fontStyle: step.numberItalic ? "italic" : "normal",
                    textDecoration: step.numberUnderline ? "underline" : "none",
                    color: step.numberColor ?? accent,
                    lineHeight: 1,
                    minWidth: "1.6em",
                    textAlign: "right",
                    opacity: 0.7,
                    flexShrink: 0,
                    textShadow: makeOutlineShadow(step.numberOutline),
                  }}
                >
                  {String(step.number).padStart(2, "0")}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                      fontSize: `${0.6 * (step.titleSize ?? 1.0)}em`,
                      fontWeight: (step.titleBold ?? true) ? 600 : 400,
                      fontStyle: step.titleItalic ? "italic" : "normal",
                      textDecoration: step.titleUnderline ? "underline" : "none",
                      color: step.titleColor ?? NAVY,
                      lineHeight: 1.3,
                      marginBottom: "0.1em",
                      textShadow: step.titleOutline ? makeOutlineShadow(step.titleOutline) : undefined,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontFamily: step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                      fontSize: `${0.46 * (step.descriptionSize ?? 1.0)}em`,
                      fontWeight: step.descriptionBold ? 600 : 400,
                      fontStyle: step.descriptionItalic ? "italic" : "normal",
                      textDecoration: step.descriptionUnderline ? "underline" : "none",
                      color: step.descriptionColor ?? MUTED_NAVY,
                      lineHeight: 1.5,
                      maxWidth: hasPhoto ? "65%" : "80%",
                      textShadow: step.descriptionOutline ? makeOutlineShadow(step.descriptionOutline) : undefined,
                    }}
                  >
                    {step.description}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <ContactFooter email={contactEmail} phone={contactPhone} address={address} showAddress={showAddress} content={content} />
      </div>
      <LogoOverlay
        show={content.showLogo ?? false}
        variant={content.logoVariant ?? "light"}
        xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.cta.x}
        yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.cta.y}
        scale={content.logoSize ?? 1.0}
        branding={branding}
      />
    </div>
  );
}

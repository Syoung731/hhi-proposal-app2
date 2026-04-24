"use client";

import Image from "next/image";
import { PhotoOverlay } from "@/components/slides/shared/PhotoOverlay";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { ACCENT_RULE_WIDTH, SLIDE_FONTS } from "@/app/lib/slide-constants";
import type {
  ProposalSlide,
  DeckBranding,
  CoverContent,
  CoverLayoutKey,
  TextZoneSetting,
} from "@/app/lib/deck/types";
import { LOGO_DEFAULTS } from "@/app/lib/deck/types";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve default logo position per layout. Used as fallback when
 * content.logoX/logoY/logoSize are not set.
 */
function defaultLogoPos(
  layoutKey: CoverLayoutKey,
  cardPosition?: "bottom-left" | "bottom-right"
): { x: number; y: number; scale: number } {
  if (layoutKey === "bottom-card-overlay") {
    return { x: cardPosition === "bottom-right" ? 5 : 78, y: 5, scale: 1.0 };
  }
  return { ...LOGO_DEFAULTS[layoutKey] };
}

/** Simple photo placeholder when no heroImageUrl is set. */
function ImagePlaceholder() {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "#C8CDD4" }}
    >
      <span
        className="text-sm font-medium tracking-wider uppercase"
        style={{ color: "#9CA3AF" }}
      >
        Cover Photo
      </span>
    </div>
  );
}

/**
 * Resolve per-field text styles from CoverContent.
 *
 * Field mapping (matches inspector labels):
 *   "Headline"     = slide.subheadline → big serif heading
 *   "Project Name" = slide.headline    → small uppercase label
 *   "Prepared For" = content.preparedFor
 */
function headlineStyle(content: CoverContent) {
  return {
    fontSize: `${content.headlineSize ?? 2.0}em`,
    fontWeight: (content.headlineBold ?? true) ? 700 : 400,
    fontStyle: content.headlineItalic ? "italic" as const : "normal" as const,
    textDecoration: content.headlineUnderline ? "underline" : "none",
    fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
  };
}

function projectNameStyle(content: CoverContent) {
  return {
    fontSize: `${content.subheadlineSize ?? 0.6}em`,
    fontWeight: content.subheadlineBold ? 700 : 400,
    fontStyle: content.subheadlineItalic ? "italic" as const : "normal" as const,
    textDecoration: content.subheadlineUnderline ? "underline" : "none",
    fontFamily: content.projectNameFont ?? SLIDE_FONTS.defaults.label,
  };
}

function preparedForStyle(content: CoverContent) {
  return {
    fontSize: `${content.preparedForSize ?? 0.9}em`,
    fontWeight: content.preparedForBold ? 700 : 400,
    fontStyle: content.preparedForItalic ? "italic" as const : "normal" as const,
    textDecoration: content.preparedForUnderline ? "underline" : "none",
    fontFamily: content.preparedForFont ?? SLIDE_FONTS.defaults.body,
  };
}

/** Resolve address: per-slide override > branding fallback. */
function resolveAddress(content: CoverContent, branding: DeckBranding): string | null {
  if (content.address != null && content.address !== "") return content.address;
  return branding.address ?? null;
}

// ─── 1. split-editorial layout ────────────────────────────────────────────────
// Full-bleed photo + dark overlay + centered white text.
// Override logo rendered at slide root after all content — always on top.
// When slide.textZone is set, positions headline/body content within that zone.
function SplitEditorialLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const logoPos = defaultLogoPos(slide.layoutKey as CoverLayoutKey);
  const zone: TextZoneSetting | null = slide.textZone ?? null;
  const textColor = zone ? (zone.textColor === "light" ? "#FFFFFF" : branding.textColor) : "#FFFFFF";

  return (
    <div className="relative w-full h-full">
      {/* Background photo */}
      {content.heroImageUrl ? (
        <Image
          src={content.heroImageUrl}
          alt="Cover photo"
          fill
          className="object-cover"
          priority
        />
      ) : (
        <div className="w-full h-full" style={{ background: "#1E2D3A" }} />
      )}

      {/* Dark overlay — only when no textZone (textZone implies a clean background image) */}
      {!zone && <PhotoOverlay opacity={0.62} color="#0A121E" />}

      {/* Logo */}
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? logoPos.x}
        yPercent={content.logoY ?? logoPos.y}
        scale={content.logoSize ?? logoPos.scale}
        branding={branding}
      />

      {zone ? (
        /* Text zone positioned content */
        <div
          style={{
            position: "absolute",
            left:   `calc(${zone.x * 100}% + ${zone.padding * 100}%)`,
            top:    `calc(${zone.y * 100}% + ${zone.padding * 100}%)`,
            width:  `calc(${zone.width * 100}% - ${zone.padding * 200}%)`,
            height: `calc(${zone.height * 100}% - ${zone.padding * 200}%)`,
            color: textColor,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            textAlign: zone.textAlign,
          }}
        >
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              lineHeight: 1.1,
              marginBottom: "0.4em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {slide.headline && (
            <p
              style={{
                ...projectNameStyle(content),
                opacity: 0.9,
                marginBottom: "0.7em",
              }}
            >
              {slide.headline}
            </p>
          )}
          {content.preparedFor && (
            <p style={{ ...preparedForStyle(content), opacity: 0.7, marginTop: "0.5em" }}>
              Prepared for {content.preparedFor}
            </p>
          )}
        </div>
      ) : (
        /* Default: centered content */
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          style={{ padding: "8% 12%" }}
        >
          <h1
            className="font-serif text-white"
            style={{
              ...headlineStyle(content),
              lineHeight: 1.1,
              marginBottom: "0.4em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {slide.headline && (
            <p
              className="text-white"
              style={{
                ...projectNameStyle(content),
                opacity: 0.9,
                marginBottom: "0.7em",
              }}
            >
              {slide.headline}
            </p>
          )}
          {content.preparedFor && (
            <p
              className="text-white"
              style={{ ...preparedForStyle(content), opacity: 0.7, marginTop: "0.5em" }}
            >
              Prepared for {content.preparedFor} by {branding.companyName}.
            </p>
          )}
        </div>
      )}

    </div>
  );
}

// ─── 2. right-panel-overlay layout ───────────────────────────────────────────
// Full-bleed image with a translucent white panel (~36%) overlaid on one side.
// Override logo rendered at slide root, above both image and panel.
// When slide.textZone + slide.backgroundId: suppress the structural panel, render text in zone.
function RightPanelOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const panelSide = content.overlayPosition ?? "right";
  const year = new Date().getFullYear();
  const logoPos = defaultLogoPos(slide.layoutKey as CoverLayoutKey);
  const zone: TextZoneSetting | null =
    slide.textZone != null && slide.backgroundId != null ? slide.textZone : null;
  const zoneTextColor = zone
    ? (zone.textColor === "light" ? "#FFFFFF" : branding.textColor)
    : branding.textColor;

  return (
    <div className="relative w-full h-full">
      {/* Full-bleed background image */}
      {content.heroImageUrl ? (
        <Image
          src={content.heroImageUrl}
          alt="Cover photo"
          fill
          className="object-cover"
          priority
        />
      ) : (
        <ImagePlaceholder />
      )}

      {/* Photo overlay — between image and panel */}
      {(content.showOverlay ?? true) && (
        <PhotoOverlay opacity={content.overlayOpacity ?? 0.55} />
      )}

      {/* Overlaid panel — suppressed when zone is active */}
      {!zone && (
        <div
          className="absolute inset-y-0 flex flex-col justify-between overflow-hidden"
          style={{
            ...(panelSide === "left" ? { left: 0 } : { right: 0 }),
            width: "36%",
            background: "rgba(255,255,255,0.95)",
            padding: "6% 7%",
          }}
        >
          {/* visibility:hidden preserves justify-between layout height */}
          {(content.showLogo ?? true) && (
            <div
              className="flex items-start"
              style={{ visibility: "hidden" }}
            >
              {branding.logoLightUrl ? (
                <img
                  src={branding.logoLightUrl}
                  alt={branding.companyName}
                  className="object-contain"
                  style={{ maxHeight: 36, maxWidth: "75%" }}
                />
              ) : (
                <span
                  className="font-bold tracking-tight"
                  style={{ fontSize: "1.1em", color: branding.textColor }}
                >
                  {branding.companyName}
                </span>
              )}
            </div>
          )}

          {/* Title block */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45em" }}>
            {slide.headline && (
              <p
                className="uppercase tracking-widest"
                style={{
                  ...projectNameStyle(content),
                  color: "#6B7280",
                  letterSpacing: "0.15em",
                }}
              >
                {slide.headline}
              </p>
            )}
            <h1
              className="font-serif"
              style={{
                ...headlineStyle(content),
                color: branding.textColor,
                lineHeight: 1.15,
              }}
            >
              {slide.subheadline || "Project Proposal"}
            </h1>
            <div
              style={{
                height: 2,
                width: ACCENT_RULE_WIDTH.narrow,
                background: accent,
                marginTop: "0.3em",
                marginBottom: "0.35em",
              }}
            />
            {content.preparedFor && (
              <p style={{ ...preparedForStyle(content), color: "#374151" }}>
                Prepared for{" "}
                <strong style={{ color: branding.textColor }}>
                  {content.preparedFor}
                </strong>
              </p>
            )}
            {resolveAddress(content, branding) && (
              <p style={{ fontSize: "0.62em", color: "#6B7280", marginTop: "0.1em" }}>
                {resolveAddress(content, branding)}
              </p>
            )}
            {content.date && (
              <p style={{ fontSize: "0.58em", color: "#9CA3AF", marginTop: "0.15em" }}>
                {content.date}
              </p>
            )}
          </div>

          {/* Footer */}
          <p style={{ fontSize: "0.56em", color: "#9CA3AF" }}>
            {year} · {branding.companyName}
          </p>
        </div>
      )}

      {/* Zone-positioned text — only when textZone + backgroundId */}
      {zone && (
        <div
          style={{
            position: "absolute",
            left:   `calc(${zone.x * 100}% + ${zone.padding * 100}%)`,
            top:    `calc(${zone.y * 100}% + ${zone.padding * 100}%)`,
            width:  `calc(${zone.width * 100}% - ${zone.padding * 200}%)`,
            height: `calc(${zone.height * 100}% - ${zone.padding * 200}%)`,
            color: zoneTextColor,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            textAlign: zone.textAlign,
          }}
        >
          {slide.headline && (
            <p
              className="uppercase tracking-widest"
              style={{ ...projectNameStyle(content), opacity: 0.75, letterSpacing: "0.15em", marginBottom: "0.4em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              lineHeight: 1.15,
              marginBottom: "0.35em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ ...preparedForStyle(content), opacity: 0.8, marginTop: "0.3em" }}>
              Prepared for <strong>{content.preparedFor}</strong>
            </p>
          )}
        </div>
      )}

      {/* Logo — at slide root, above image AND panel */}
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? (zone ? "dark" : "light")}
        xPercent={content.logoX ?? logoPos.x}
        yPercent={content.logoY ?? logoPos.y}
        scale={content.logoSize ?? logoPos.scale}
        branding={branding}
      />
    </div>
  );
}

// ─── 3. split-dark-editorial layout ──────────────────────────────────────────
// Dark brand panel left (~44%) + full image right.
// Override logo rendered at slide root AFTER the photo div — always on top.
// When slide.textZone + slide.backgroundId: suppress the left dark panel, render text in zone.
function SplitDarkEditorialLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const logoPos = defaultLogoPos(slide.layoutKey as CoverLayoutKey);
  const zone: TextZoneSetting | null =
    slide.textZone != null && slide.backgroundId != null ? slide.textZone : null;
  const zoneTextColor = zone
    ? (zone.textColor === "light" ? "#FFFFFF" : branding.textColor)
    : "#FFFFFF";

  return (
    <div className="relative w-full h-full flex">
      {/* Left — dark brand panel: suppressed when zone is active */}
      {!zone && (
        <div
          className="relative flex flex-col justify-between flex-shrink-0 overflow-hidden"
          style={{
            width: "44%",
            background: branding.textColor,
            padding: "7% 8%",
          }}
        >
          {/* visibility:hidden preserves justify-between height */}
          {(content.showLogo ?? true) && (
            <div
              className="flex items-start"
              style={{ visibility: "hidden" }}
            >
              {branding.logoDarkUrl ? (
                <img
                  src={branding.logoDarkUrl}
                  alt={branding.companyName}
                  className="object-contain"
                  style={{ maxHeight: 36, maxWidth: "70%" }}
                />
              ) : (
                <span
                  className="font-bold tracking-tight"
                  style={{ fontSize: "1.1em", color: "#FFFFFF" }}
                >
                  {branding.companyName}
                </span>
              )}
            </div>
          )}

          {/* Vertically centered title block */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55em" }}>
            {slide.headline && (
              <p
                className="uppercase tracking-widest"
                style={{
                  ...projectNameStyle(content),
                  color: accent,
                  letterSpacing: "0.16em",
                }}
              >
                {slide.headline}
              </p>
            )}
            <h1
              className="font-serif"
              style={{
                ...headlineStyle(content),
                color: "#FFFFFF",
                lineHeight: 1.15,
              }}
            >
              {slide.subheadline || "Project Proposal"}
            </h1>
            <div
              style={{
                height: 1,
                width: ACCENT_RULE_WIDTH.standard,
                background: accent,
                marginTop: "0.2em",
                marginBottom: "0.25em",
              }}
            />
            {content.preparedFor && (
              <p style={{ ...preparedForStyle(content), color: "rgba(255,255,255,0.68)" }}>
                Prepared for {content.preparedFor}
              </p>
            )}
          </div>

          {/* Footer */}
          <p style={{ fontSize: "0.54em", color: "rgba(255,255,255,0.38)" }}>
            {branding.companyName}
            {content.date ? ` · ${content.date}` : ""}
          </p>
        </div>
      )}

      {/* Right — full image (flex-1 always; fills full width when zone suppresses the left panel) */}
      <div className="relative flex-1">
        {content.heroImageUrl ? (
          <Image
            src={content.heroImageUrl}
            alt="Cover photo"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "#D1D5DB" }}
          >
            <span
              className="text-sm font-medium tracking-wider uppercase"
              style={{ color: "#9CA3AF" }}
            >
              Cover Photo
            </span>
          </div>
        )}
      </div>

      {/* Zone-positioned text — only when textZone + backgroundId */}
      {zone && (
        <div
          style={{
            position: "absolute",
            left:   `calc(${zone.x * 100}% + ${zone.padding * 100}%)`,
            top:    `calc(${zone.y * 100}% + ${zone.padding * 100}%)`,
            width:  `calc(${zone.width * 100}% - ${zone.padding * 200}%)`,
            height: `calc(${zone.height * 100}% - ${zone.padding * 200}%)`,
            color: zoneTextColor,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            textAlign: zone.textAlign,
          }}
        >
          {slide.headline && (
            <p
              className="uppercase tracking-widest"
              style={{ ...projectNameStyle(content), opacity: 0.8, letterSpacing: "0.16em", marginBottom: "0.4em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              lineHeight: 1.15,
              marginBottom: "0.3em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ ...preparedForStyle(content), opacity: 0.75, marginTop: "0.25em" }}>
              Prepared for {content.preparedFor}
            </p>
          )}
        </div>
      )}

      {/* Logo — after the photo div so it's last in DOM, always on top */}
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? logoPos.x}
        yPercent={content.logoY ?? logoPos.y}
        scale={content.logoSize ?? logoPos.scale}
        branding={branding}
      />
    </div>
  );
}

// ─── 4. bottom-card-overlay layout ───────────────────────────────────────────
// Full-bleed image + floating white card at bottom corner.
// Override logo rendered at slide root after the card — always on top.
// When slide.textZone + slide.backgroundId: suppress the frosted card, render text in zone.
function BottomCardOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;
  const cardPos = content.cardPosition ?? "bottom-left";
  const logoPos = defaultLogoPos(slide.layoutKey as CoverLayoutKey, cardPos);
  const zone: TextZoneSetting | null =
    slide.textZone != null && slide.backgroundId != null ? slide.textZone : null;
  const zoneTextColor = zone
    ? (zone.textColor === "light" ? "#FFFFFF" : branding.textColor)
    : branding.textColor;

  return (
    <div className="relative w-full h-full">
      {/* Full-bleed background image */}
      {content.heroImageUrl ? (
        <Image
          src={content.heroImageUrl}
          alt="Cover photo"
          fill
          className="object-cover"
          priority
        />
      ) : (
        <ImagePlaceholder />
      )}

      {/* Photo overlay — between image and card */}
      {(content.showOverlay ?? true) && (
        <PhotoOverlay opacity={content.overlayOpacity ?? 0.55} />
      )}

      {/* Floating card — suppressed when zone is active */}
      {!zone && (
        <div
          style={{
            position: "absolute",
            bottom: "6%",
            ...(cardPos === "bottom-left" ? { left: "5%" } : { right: "5%" }),
            width: "42%",
            background: "rgba(255,255,255,0.97)",
            padding: "5% 6%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}
        >
          {slide.headline && (
            <p
              className="uppercase tracking-widest"
              style={{
                ...projectNameStyle(content),
                color: "#6B7280",
                letterSpacing: "0.14em",
                marginBottom: "0.5em",
              }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              color: branding.textColor,
              lineHeight: 1.15,
              marginBottom: "0.3em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          <div
            style={{
              height: 2,
              width: "2em",
              background: accent,
              marginBottom: "0.55em",
            }}
          />
          {content.preparedFor && (
            <p style={{ ...preparedForStyle(content), color: "#374151", marginBottom: "0.2em" }}>
              Prepared for{" "}
              <strong style={{ color: branding.textColor }}>{content.preparedFor}</strong>
            </p>
          )}
          {content.date && (
            <p style={{ fontSize: "0.58em", color: "#9CA3AF", marginTop: "0.15em" }}>
              {content.date}
            </p>
          )}
        </div>
      )}

      {/* Zone-positioned text — only when textZone + backgroundId */}
      {zone && (
        <div
          style={{
            position: "absolute",
            left:   `calc(${zone.x * 100}% + ${zone.padding * 100}%)`,
            top:    `calc(${zone.y * 100}% + ${zone.padding * 100}%)`,
            width:  `calc(${zone.width * 100}% - ${zone.padding * 200}%)`,
            height: `calc(${zone.height * 100}% - ${zone.padding * 200}%)`,
            color: zoneTextColor,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            textAlign: zone.textAlign,
          }}
        >
          {slide.headline && (
            <p
              className="uppercase tracking-widest"
              style={{ ...projectNameStyle(content), opacity: 0.75, letterSpacing: "0.14em", marginBottom: "0.5em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              lineHeight: 1.15,
              marginBottom: "0.3em",
            }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ ...preparedForStyle(content), opacity: 0.8, marginBottom: "0.2em" }}>
              Prepared for <strong>{content.preparedFor}</strong>
            </p>
          )}
          {content.date && (
            <p style={{ fontSize: "0.58em", opacity: 0.6, marginTop: "0.15em" }}>
              {content.date}
            </p>
          )}
        </div>
      )}

      {/* Logo — after the card, always on top of everything */}
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? logoPos.x}
        yPercent={content.logoY ?? logoPos.y}
        scale={content.logoSize ?? logoPos.scale}
        branding={branding}
      />
    </div>
  );
}

// ─── 5. cad-overlay layout ──────────────────────────────────────────────────
// Full-bleed CAD composite: left side realistic photo, right side fades to
// architectural CAD line drawings. Text overlays sit on top.
// When Gemini generation is unavailable, a CSS gradient + blueprint grid
// approximates the effect.

function taglineStyle(content: CoverContent) {
  return {
    fontSize: `${content.taglineSize ?? 1.05}em`,
    fontWeight: content.taglineBold ? 700 : 400,
    fontStyle: (content.taglineItalic ?? true) ? "italic" as const : "normal" as const,
    textDecoration: content.taglineUnderline ? "underline" : "none",
    fontFamily: content.taglineFont ?? SLIDE_FONTS.defaults.body,
  };
}

function CadOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const logoPos = defaultLogoPos(slide.layoutKey as CoverLayoutKey);
  const transitionPos = content.cadTransitionPosition ?? 45;
  const intensity = content.cadOverlayIntensity ?? 0.7; // 0–1
  const cadSide = content.cadSide ?? "right"; // which side gets the CAD effect
  const hasGenerated = content.cadGenerationStatus === "complete" && content.cadGeneratedImageUrl;
  const isGenerating = content.cadGenerationStatus === "generating";
  const hasSource = !!content.cadSourcePhotoUrl;

  // Scale CSS fallback opacity values by intensity
  const fadeWhiteAlpha = (0.5 + intensity * 0.45).toFixed(2);   // 0.50–0.95
  const fadeEndAlpha = (0.7 + intensity * 0.25).toFixed(2);     // 0.70–0.95
  const gridMajorAlpha = (0.06 + intensity * 0.18).toFixed(2);  // 0.06–0.24
  const gridMinorAlpha = (0.02 + intensity * 0.08).toFixed(2);  // 0.02–0.10

  // Gradient direction — "to right" puts CAD on right, "to left" puts CAD on left
  const gradDir = cadSide === "left" ? "to left" : "to right";

  return (
    <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
      {/* Background layer */}
      {hasGenerated ? (
        /* AI-generated composite — full bleed */
        <Image
          src={content.cadGeneratedImageUrl!}
          alt="CAD overlay composite"
          fill
          className="object-cover"
          priority
        />
      ) : hasSource ? (
        /* Source photo with CSS blueprint fallback */
        <>
          <Image
            src={content.cadSourcePhotoUrl!}
            alt="Source photo"
            fill
            className="object-cover"
            priority
          />
          {/* CSS gradient fade (intensity controls white opacity, gradDir controls direction) */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(${gradDir}, transparent ${transitionPos - 10}%, rgba(255,255,255,${fadeWhiteAlpha}) ${transitionPos}%, rgba(255,255,255,${fadeEndAlpha}) ${transitionPos + 15}%, rgba(255,255,255,0.97) ${transitionPos + 30}%)`,
            }}
          />
          {/* Blueprint grid pattern (intensity controls line opacity, masked to CAD side) */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(${gradDir}, transparent ${transitionPos}%, rgba(180,195,210,${gridMajorAlpha}) ${transitionPos + 5}%),
                repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(160,180,200,${gridMajorAlpha}) 19px, rgba(160,180,200,${gridMajorAlpha}) 20px),
                repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(160,180,200,${gridMajorAlpha}) 19px, rgba(160,180,200,${gridMajorAlpha}) 20px)
              `,
            }}
          />
          {/* Finer sub-grid */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(${gradDir}, transparent ${transitionPos + 5}%, rgba(140,160,180,${gridMinorAlpha}) ${transitionPos + 10}%),
                repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(160,180,200,${gridMinorAlpha}) 4px, rgba(160,180,200,${gridMinorAlpha}) 5px),
                repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(160,180,200,${gridMinorAlpha}) 4px, rgba(160,180,200,${gridMinorAlpha}) 5px)
              `,
            }}
          />
        </>
      ) : (
        /* No photo selected — placeholder */
        <div
          className="w-full h-full flex flex-col items-center justify-center"
          style={{ background: "#E8ECF0" }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
          <span
            className="text-sm font-medium tracking-wider uppercase mt-3"
            style={{ color: "#9CA3AF" }}
          >
            Select a photo to generate CAD overlay
          </span>
        </div>
      )}

      {/* Generating overlay */}
      {isGenerating && hasSource && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div className="flex flex-col items-center gap-2">
            <div
              className="animate-spin rounded-full border-2 border-white border-t-transparent"
              style={{ width: 28, height: 28 }}
            />
            <span className="text-white text-sm font-medium tracking-wide">
              Generating CAD overlay...
            </span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {content.cadGenerationStatus === "error" && hasSource && !isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="flex flex-col items-center gap-1 px-4 py-3 rounded" style={{ background: "rgba(255,255,255,0.95)" }}>
            <span className="text-xs font-medium" style={{ color: "#DC2626" }}>
              {content.cadGenerationError ?? "Generation failed"}
            </span>
            <span className="text-xs" style={{ color: "#6B7280" }}>
              Use the inspector to retry
            </span>
          </div>
        </div>
      )}

      {/* Logo — top left */}
      <LogoOverlay
        show={content.showLogo ?? true}
        variant={content.logoVariant ?? "dark"}
        xPercent={content.logoX ?? logoPos.x}
        yPercent={content.logoY ?? logoPos.y}
        scale={content.logoSize ?? logoPos.scale}
        branding={branding}
      />

      {/* Text overlay — on the photo side (opposite CAD) */}
      {(hasGenerated || hasSource) && (
        <div
          className="absolute"
          style={{
            ...(cadSide === "left" ? { right: "5%" } : { left: "5%" }),
            bottom: "12%",
            maxWidth: "55%",
            display: "flex",
            flexDirection: "column",
            gap: "0.3em",
            textAlign: cadSide === "left" ? "right" : "left",
          }}
        >
          <h1
            className="font-serif"
            style={{
              ...headlineStyle(content),
              color: "#1A2332",
              lineHeight: 1.1,
              textShadow: "0 1px 8px rgba(255,255,255,0.6)",
            }}
          >
            {slide.subheadline || "Project Investment\n& Design Concept"}
          </h1>
          {content.tagline && (
            <p
              style={{
                ...taglineStyle(content),
                color: "#374151",
                textShadow: "0 1px 6px rgba(255,255,255,0.5)",
              }}
            >
              {content.tagline}
            </p>
          )}
        </div>
      )}

      {/* Bottom bar */}
      {(hasGenerated || hasSource) && (
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between"
          style={{
            background: "rgba(26,35,50,0.72)",
            padding: "6px 5%",
            fontFamily: SLIDE_FONTS.defaults.body,
          }}
        >
          <span style={{ fontSize: "0.52em", color: "rgba(255,255,255,0.88)" }}>
            {content.preparedFor ? `Prepared exclusively for ${content.preparedFor}` : ""}
            {content.preparedFor && resolveAddress(content, branding) ? " | " : ""}
            {resolveAddress(content, branding) ?? ""}
          </span>
          <span style={{ fontSize: "0.52em", color: "rgba(255,255,255,0.72)" }}>
            {branding.companyName}
            {branding.address ? ` | ${branding.address}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function CoverSlide({ slide, branding }: Props) {
  // Migration fallback: hero-image was removed in favor of panel-overlay with right panel
  if (slide.layoutKey === "hero-image") {
    const migratedSlide: ProposalSlide = {
      ...slide,
      layoutKey: "right-panel-overlay" as const,
      content: { ...(slide.content as CoverContent), overlayPosition: "right" as const },
    };
    return <RightPanelOverlayLayout slide={migratedSlide} branding={branding} />;
  }

  switch (slide.layoutKey) {
    case "split-editorial":
      return <SplitEditorialLayout slide={slide} branding={branding} />;
    case "right-panel-overlay":
      return <RightPanelOverlayLayout slide={slide} branding={branding} />;
    case "split-dark-editorial":
      return <SplitDarkEditorialLayout slide={slide} branding={branding} />;
    case "bottom-card-overlay":
      return <BottomCardOverlayLayout slide={slide} branding={branding} />;
    case "cad-overlay":
      return <CadOverlayLayout slide={slide} branding={branding} />;
    default:
      return <RightPanelOverlayLayout slide={slide} branding={branding} />;
  }
}

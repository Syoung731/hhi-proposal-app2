"use client";

import Image from "next/image";
import type {
  ProposalSlide,
  DeckBranding,
  CoverContent,
  CoverLayoutKey,
  LogoOverride,
  TextZoneSetting,
} from "@/app/lib/deck/types";
import { LOGO_DEFAULTS } from "@/app/lib/deck/types";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Resolve final logo x/y/scale. Coordinates are SLIDE-WIDE percentages —
 * the logo is always rendered at the slide root so it stays above every layer.
 */
function resolveLogoPos(
  layoutKey: CoverLayoutKey,
  override: LogoOverride | null | undefined,
  cardPosition?: "bottom-left" | "bottom-right"
): { x: number; y: number; scale: number } {
  if (override) {
    return {
      x:     clamp(override.x,     0,   100),
      y:     clamp(override.y,     0,   100),
      scale: clamp(override.scale, 0.5, 5.0),
    };
  }
  // bottom-card-overlay: default x flips with card side
  if (layoutKey === "bottom-card-overlay") {
    return { x: cardPosition === "bottom-right" ? 5 : 78, y: 5, scale: 1.0 };
  }
  return { ...LOGO_DEFAULTS[layoutKey] };
}

/**
 * Logo image or company-name fallback text.
 * dark=true  → logoDarkUrl  (light-on-dark panel/photo)
 * dark=false → logoLightUrl (dark-on-white panel)
 */
function LogoEl({ branding, dark }: { branding: DeckBranding; dark: boolean }) {
  const src = dark ? branding.logoDarkUrl : branding.logoLightUrl;
  if (src) {
    return (
      <img
        src={src}
        alt={branding.companyName}
        className="object-contain"
        style={{ maxHeight: 36, maxWidth: 160, display: "block" }}
      />
    );
  }
  return (
    <span
      className="font-bold tracking-tight"
      style={{
        fontSize: "1.1em",
        color: dark ? "#FFFFFF" : branding.textColor,
        whiteSpace: "nowrap",
      }}
    >
      {branding.companyName}
    </span>
  );
}

/**
 * Logo rendered at an absolute position within the SLIDE ROOT.
 * zIndex: 50 ensures it floats above every panel, image, overlay, and card.
 * Coordinates (x, y) are % of the full slide dimensions.
 * transformOrigin: top left so scale grows rightward/downward.
 */
function AbsoluteLogo({
  branding,
  dark,
  x,
  y,
  scale,
}: {
  branding: DeckBranding;
  dark: boolean;
  x: number;
  y: number;
  scale: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transformOrigin: "top left",
        transform: `scale(${scale})`,
        maxWidth: "60%",
        zIndex: 100,
        pointerEvents: "none", // never blocks slide interaction
      }}
    >
      <LogoEl branding={branding} dark={dark} />
    </div>
  );
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

// ─── 1. hero-image layout ────────────────────────────────────────────────────
// Photo left 58%, solid white panel right 42%.
// Override logo rendered at slide root (after both panel and photo) — always on top.
// When slide.textZone + slide.backgroundId: suppress the right panel, render text in zone.
function HeroImageLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const year = new Date().getFullYear();
  const hasOverride = !!content.logoOverride;
  const logoPos = resolveLogoPos(slide.layoutKey as CoverLayoutKey, content.logoOverride);
  const zone: TextZoneSetting | null =
    slide.textZone != null && slide.backgroundId != null ? slide.textZone : null;
  const zoneTextColor = zone
    ? (zone.textColor === "light" ? "#FFFFFF" : branding.textColor)
    : branding.textColor;

  return (
    <div className="relative w-full h-full flex">
      {/* Left — photo (always full-width when zone is active; otherwise 58%) */}
      <div
        className="relative"
        style={{ flexBasis: zone ? "100%" : "58%", flexShrink: 0, position: "relative" }}
      >
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
      </div>

      {/* Right — editorial panel: suppressed when zone is active */}
      {!zone && (
        <div
          className="relative flex flex-col justify-between"
          style={{
            flexBasis: "42%",
            background: "rgba(255,255,255,0.96)",
            padding: "6% 7%",
          }}
        >
          {/* visibility:hidden preserves justify-between spacing when override is on */}
          <div
            className="flex items-start"
            style={{ visibility: hasOverride ? "hidden" : "visible" }}
          >
            {branding.logoLightUrl ? (
              <img
                src={branding.logoLightUrl}
                alt={branding.companyName}
                className="object-contain"
                style={{ maxHeight: "11%", maxWidth: "70%" }}
              />
            ) : (
              <span
                className="font-bold tracking-tight"
                style={{ fontSize: "1.4em", color: branding.textColor }}
              >
                {branding.companyName}
              </span>
            )}
          </div>

          {/* Title block */}
          <div className="flex flex-col gap-[0.5em]">
            <p
              className="uppercase tracking-widest font-medium"
              style={{ fontSize: "0.7em", color: "#6B7280", letterSpacing: "0.15em" }}
            >
              {slide.headline}
            </p>
            <h1
              className="font-serif leading-tight"
              style={{
                fontSize: "2.8em",
                fontWeight: 700,
                color: branding.textColor,
                lineHeight: 1.15,
              }}
            >
              {slide.subheadline || "Project Investment\n& Design Concept"}
            </h1>
            <div
              style={{
                height: 2,
                width: "3em",
                background: branding.accentColor,
                marginTop: "0.4em",
                marginBottom: "0.4em",
              }}
            />
            {content.preparedFor && (
              <p style={{ fontSize: "0.78em", color: "#374151" }}>
                Prepared for{" "}
                <strong style={{ color: branding.textColor }}>
                  {content.preparedFor}
                </strong>
              </p>
            )}
          </div>

          {/* Footer */}
          <div>
            <p style={{ fontSize: "0.62em", color: "#9CA3AF" }}>
              {year} Initial Proposal | {branding.companyName}
            </p>
          </div>
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
          <p
            className="uppercase tracking-widest font-medium"
            style={{ fontSize: "0.7em", opacity: 0.75, letterSpacing: "0.15em", marginBottom: "0.4em" }}
          >
            {slide.headline}
          </p>
          <h1
            className="font-serif leading-tight"
            style={{ fontSize: "2.8em", fontWeight: 700, lineHeight: 1.15, marginBottom: "0.35em" }}
          >
            {slide.subheadline || "Project Investment\n& Design Concept"}
          </h1>
          {content.preparedFor && (
            <p style={{ fontSize: "0.78em", opacity: 0.8, marginTop: "0.3em" }}>
              Prepared for <strong>{content.preparedFor}</strong>
            </p>
          )}
        </div>
      )}

      {/* Override logo — at slide root, above photo AND panel */}
      {hasOverride && (
        <AbsoluteLogo
          branding={branding}
          dark={zone ? true : false}
          x={logoPos.x}
          y={logoPos.y}
          scale={logoPos.scale}
        />
      )}
    </div>
  );
}

// ─── 2. split-editorial layout ────────────────────────────────────────────────
// Full-bleed photo + dark overlay + centered white text.
// Override logo rendered at slide root after all content — always on top.
// When slide.textZone is set, positions headline/body content within that zone.
function SplitEditorialLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const hasOverride = !!content.logoOverride;
  const logoPos = resolveLogoPos(slide.layoutKey as CoverLayoutKey, content.logoOverride);
  // If a textZone is set, position content absolutely within it.
  // Otherwise fall through to existing centered layout behavior.
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
      {!zone && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(10,18,30,0.62)" }}
        />
      )}

      {/* Default logo — top-right; hidden when override is active */}
      {!hasOverride && branding.logoDarkUrl && (
        <div className="absolute top-[6%] right-[5%]">
          <img
            src={branding.logoDarkUrl}
            alt={branding.companyName}
            className="object-contain"
            style={{ maxHeight: 32, maxWidth: 130 }}
          />
        </div>
      )}

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
            className="font-serif font-bold"
            style={{ fontSize: "3.4em", lineHeight: 1.1, marginBottom: "0.4em" }}
          >
            {slide.headline}
          </h1>
          {slide.subheadline && (
            <p
              style={{
                fontSize: "1.1em",
                fontWeight: 400,
                opacity: 0.9,
                marginBottom: "0.7em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          {content.preparedFor && (
            <p style={{ fontSize: "0.72em", opacity: 0.7, marginTop: "0.5em" }}>
              Prepared for {content.preparedFor} by {branding.companyName}.
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
            className="font-serif font-bold text-white"
            style={{ fontSize: "3.4em", lineHeight: 1.1, marginBottom: "0.4em" }}
          >
            {slide.headline}
          </h1>
          {slide.subheadline && (
            <p
              className="text-white"
              style={{
                fontSize: "1.1em",
                fontWeight: 400,
                opacity: 0.9,
                marginBottom: "0.7em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          {content.preparedFor && (
            <p
              className="text-white"
              style={{ fontSize: "0.72em", opacity: 0.7, marginTop: "0.5em" }}
            >
              Prepared for {content.preparedFor} by {branding.companyName}.
            </p>
          )}
        </div>
      )}

      {/* Override logo — last child, always on top */}
      {hasOverride && (
        <AbsoluteLogo
          branding={branding}
          dark={true}
          x={logoPos.x}
          y={logoPos.y}
          scale={logoPos.scale}
        />
      )}
    </div>
  );
}

// ─── 3. right-panel-overlay layout ───────────────────────────────────────────
// Full-bleed image with a translucent white panel (~36%) overlaid on one side.
// Override logo rendered at slide root, above both image and panel.
// When slide.textZone + slide.backgroundId: suppress the structural panel, render text in zone.
function RightPanelOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const panelSide = content.overlayPosition ?? "right";
  const year = new Date().getFullYear();
  const hasOverride = !!content.logoOverride;
  const logoPos = resolveLogoPos(slide.layoutKey as CoverLayoutKey, content.logoOverride);
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
          <div
            className="flex items-start"
            style={{ visibility: hasOverride ? "hidden" : "visible" }}
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

          {/* Title block */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45em" }}>
            {slide.headline && (
              <p
                className="uppercase tracking-widest"
                style={{ fontSize: "0.6em", color: "#6B7280", letterSpacing: "0.15em" }}
              >
                {slide.headline}
              </p>
            )}
            <h1
              className="font-serif"
              style={{
                fontSize: "2.5em",
                fontWeight: 700,
                color: branding.textColor,
                lineHeight: 1.15,
              }}
            >
              {slide.subheadline || "Project Proposal"}
            </h1>
            <div
              style={{
                height: 2,
                width: "2.5em",
                background: branding.accentColor,
                marginTop: "0.3em",
                marginBottom: "0.35em",
              }}
            />
            {content.preparedFor && (
              <p style={{ fontSize: "0.72em", color: "#374151" }}>
                Prepared for{" "}
                <strong style={{ color: branding.textColor }}>
                  {content.preparedFor}
                </strong>
              </p>
            )}
            {branding.address && (
              <p style={{ fontSize: "0.62em", color: "#6B7280", marginTop: "0.1em" }}>
                {branding.address}
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
              style={{ fontSize: "0.6em", opacity: 0.75, letterSpacing: "0.15em", marginBottom: "0.4em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{ fontSize: "2.5em", fontWeight: 700, lineHeight: 1.15, marginBottom: "0.35em" }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ fontSize: "0.72em", opacity: 0.8, marginTop: "0.3em" }}>
              Prepared for <strong>{content.preparedFor}</strong>
            </p>
          )}
        </div>
      )}

      {/* Override logo — at slide root, above image AND panel */}
      {hasOverride && (
        <AbsoluteLogo
          branding={branding}
          dark={zone ? true : false}
          x={logoPos.x}
          y={logoPos.y}
          scale={logoPos.scale}
        />
      )}
    </div>
  );
}

// ─── 4. split-dark-editorial layout ──────────────────────────────────────────
// Dark brand panel left (~44%) + full image right.
// Override logo rendered at slide root AFTER the photo div — always on top.
// When slide.textZone + slide.backgroundId: suppress the left dark panel, render text in zone.
function SplitDarkEditorialLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const hasOverride = !!content.logoOverride;
  const logoPos = resolveLogoPos(slide.layoutKey as CoverLayoutKey, content.logoOverride);
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
          <div
            className="flex items-start"
            style={{ visibility: hasOverride ? "hidden" : "visible" }}
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

          {/* Vertically centered title block */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55em" }}>
            {slide.headline && (
              <p
                className="uppercase tracking-widest"
                style={{
                  fontSize: "0.6em",
                  color: branding.accentColor,
                  letterSpacing: "0.16em",
                }}
              >
                {slide.headline}
              </p>
            )}
            <h1
              className="font-serif"
              style={{
                fontSize: "2.6em",
                fontWeight: 700,
                color: "#FFFFFF",
                lineHeight: 1.15,
              }}
            >
              {slide.subheadline || "Project Proposal"}
            </h1>
            <div
              style={{
                height: 1,
                width: "3em",
                background: branding.accentColor,
                marginTop: "0.2em",
                marginBottom: "0.25em",
              }}
            />
            {content.preparedFor && (
              <p style={{ fontSize: "0.7em", color: "rgba(255,255,255,0.68)" }}>
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
              style={{ fontSize: "0.6em", opacity: 0.8, letterSpacing: "0.16em", marginBottom: "0.4em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{ fontSize: "2.6em", fontWeight: 700, lineHeight: 1.15, marginBottom: "0.3em" }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ fontSize: "0.7em", opacity: 0.75, marginTop: "0.25em" }}>
              Prepared for {content.preparedFor}
            </p>
          )}
        </div>
      )}

      {/* Override logo — after the photo div so it's last in DOM, always on top */}
      {hasOverride && (
        <AbsoluteLogo
          branding={branding}
          dark={true}
          x={logoPos.x}
          y={logoPos.y}
          scale={logoPos.scale}
        />
      )}
    </div>
  );
}

// ─── 5. bottom-card-overlay layout ───────────────────────────────────────────
// Full-bleed image + floating white card at bottom corner.
// Override logo rendered at slide root after the card — always on top.
// When slide.textZone + slide.backgroundId: suppress the frosted card, render text in zone.
function BottomCardOverlayLayout({ slide, branding }: Props) {
  const content = (slide.content ?? {}) as CoverContent;
  const cardPos = content.cardPosition ?? "bottom-left";
  const hasOverride = !!content.logoOverride;
  const logoPos = resolveLogoPos(
    slide.layoutKey as CoverLayoutKey,
    content.logoOverride,
    cardPos
  );
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

      {/* Default logo — opposite top corner; hidden when override is active */}
      {!hasOverride && (
        <div
          className="absolute"
          style={{
            top: "5%",
            ...(cardPos === "bottom-left" ? { right: "5%" } : { left: "5%" }),
          }}
        >
          {branding.logoDarkUrl ? (
            <img
              src={branding.logoDarkUrl}
              alt={branding.companyName}
              className="object-contain"
              style={{ maxHeight: 30, maxWidth: 120 }}
            />
          ) : (
            <span
              className="font-bold"
              style={{
                fontSize: "0.9em",
                color: "#FFFFFF",
                textShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              {branding.companyName}
            </span>
          )}
        </div>
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
                fontSize: "0.58em",
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
              fontSize: "2.2em",
              fontWeight: 700,
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
              background: branding.accentColor,
              marginBottom: "0.55em",
            }}
          />
          {content.preparedFor && (
            <p style={{ fontSize: "0.7em", color: "#374151", marginBottom: "0.2em" }}>
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
              style={{ fontSize: "0.58em", opacity: 0.75, letterSpacing: "0.14em", marginBottom: "0.5em" }}
            >
              {slide.headline}
            </p>
          )}
          <h1
            className="font-serif"
            style={{ fontSize: "2.2em", fontWeight: 700, lineHeight: 1.15, marginBottom: "0.3em" }}
          >
            {slide.subheadline || "Project Proposal"}
          </h1>
          {content.preparedFor && (
            <p style={{ fontSize: "0.7em", opacity: 0.8, marginBottom: "0.2em" }}>
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

      {/* Override logo — after the card, always on top of everything */}
      {hasOverride && (
        <AbsoluteLogo
          branding={branding}
          dark={true}
          x={logoPos.x}
          y={logoPos.y}
          scale={logoPos.scale}
        />
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

// hasAiBackground accepted; CoverSlide layouts have transparent roots by default.
export function CoverSlide({ slide, branding }: Props) {
  switch (slide.layoutKey) {
    case "hero-image":
      return <HeroImageLayout slide={slide} branding={branding} />;
    case "split-editorial":
      return <SplitEditorialLayout slide={slide} branding={branding} />;
    case "right-panel-overlay":
      return <RightPanelOverlayLayout slide={slide} branding={branding} />;
    case "split-dark-editorial":
      return <SplitDarkEditorialLayout slide={slide} branding={branding} />;
    case "bottom-card-overlay":
      return <BottomCardOverlayLayout slide={slide} branding={branding} />;
    default:
      return <HeroImageLayout slide={slide} branding={branding} />;
  }
}

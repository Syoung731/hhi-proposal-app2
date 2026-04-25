"use client";

import type {
  ProposalSlide,
  DeckBranding,
  AdditionOverviewContent,
  AdditionBullet,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_FONTS, CARD_SHADOWS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

const DEFAULT_BULLETS: AdditionBullet[] = [
  { id: "b1", label: "The Structure", description: "Foundations, structural framing, and all load-bearing elements engineered to current code standards." },
  { id: "b2", label: "Engineering & Systems", description: "Mechanical, electrical, and plumbing systems designed to serve the new space seamlessly." },
  { id: "b3", label: "Finishes & Site Work", description: "Interior finishes selected to complement the existing home, with exterior work matched to current materials." },
];

// ─── Photo placeholder ──────────────────────────────────────────────────────

function ImagePlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#E8E6E3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4em",
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#BDBAB5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <span style={{ fontSize: "0.55em", color: "#BDBAB5", fontFamily: SLIDE_FONTS.defaults.body }}>Select an exterior photo</span>
    </div>
  );
}

// ─── Bounding box overlay ───────────────────────────────────────────────────

function BoundingBoxOverlay({ content }: { content: AdditionOverviewContent }) {
  const x = content.boundingBoxX ?? 10;
  const y = content.boundingBoxY ?? 10;
  const w = content.boundingBoxWidth ?? 40;
  const h = content.boundingBoxHeight ?? 50;
  const labelText = content.calloutLabel ?? "Proposed Addition Area";

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        border: "2px dashed rgba(255,255,255,0.85)",
        borderRadius: "2px",
        pointerEvents: "none",
        boxShadow: "inset 0 0 30px rgba(255,255,255,0.08)",
      }}
    >
      <span
        style={{
          position: "absolute",
          bottom: "-24px",
          left: "50%",
          transform: "translateX(-50%)",
          color: content.calloutLabelColor ?? "#FFFFFF",
          fontFamily: content.calloutLabelFont ?? SLIDE_FONTS.defaults.body,
          fontSize: `${content.calloutLabelSize ?? 0.9}em`,
          fontWeight: content.calloutLabelBold ? 700 : 400,
          fontStyle: content.calloutLabelItalic ? "italic" : undefined,
          textDecoration: content.calloutLabelUnderline ? "underline" : undefined,
          textShadow: makeOutlineShadow(content.calloutLabelOutline) ?? "0 1px 3px rgba(0,0,0,0.5)",
          whiteSpace: "nowrap",
        }}
      >
        {labelText}
      </span>
    </div>
  );
}

// ─── Bullet card ────────────────────────────────────────────────────────────

function BulletCard({ content, branding }: { content: AdditionOverviewContent; branding: DeckBranding }) {
  const bullets = content.bullets ?? DEFAULT_BULLETS;
  const accent = content.cardAccentColor ?? content.accentColor ?? branding.accentColor;
  const cardBg = content.cardBackgroundColor ?? "#FFFFFF";

  return (
    <div
      style={{
        background: cardBg,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "4px",
        padding: "24px",
        boxShadow: CARD_SHADOWS.normal,
      }}
    >
      {bullets.slice(0, 3).map((bullet, idx) => (
        <div key={bullet.id} style={{ marginBottom: idx < bullets.length - 1 ? 20 : 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6em" }}>
            <span style={{ display: "inline-block", width: "0.45em", height: "0.45em", borderRadius: "50%", background: accent, marginTop: "0.45em", flexShrink: 0 }} />
            <div>
              <span
                style={{
                  fontFamily: bullet.labelFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${bullet.labelSize ?? 1.0}em`,
                  fontWeight: (bullet.labelBold !== false && bullet.labelBold !== null) ? 700 : 400,
                  fontStyle: bullet.labelItalic ? "italic" : undefined,
                  textDecoration: bullet.labelUnderline ? "underline" : undefined,
                  color: bullet.labelColor ?? "#1B2A4A",
                  textShadow: makeOutlineShadow(bullet.labelOutline),
                }}
              >
                {bullet.label}
              </span>
              <span style={{ margin: "0 0.35em" }}>&mdash;</span>
              <span
                style={{
                  fontFamily: bullet.descriptionFont ?? SLIDE_FONTS.defaults.body,
                  fontSize: `${bullet.descriptionSize ?? 0.9}em`,
                  fontWeight: bullet.descriptionBold ? 700 : 400,
                  fontStyle: bullet.descriptionItalic ? "italic" : undefined,
                  textDecoration: bullet.descriptionUnderline ? "underline" : undefined,
                  color: bullet.descriptionColor ?? "#4A5568",
                  textShadow: makeOutlineShadow(bullet.descriptionOutline),
                  lineHeight: 1.5,
                }}
              >
                {bullet.description}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CAD overlay approach ───────────────────────────────────────────────────
// When a generated CAD image exists, it replaces the source photo as the
// background. The nudge controls (cadOffsetX/Y) shift this entire image so the
// user can align the CAD lines with the bounding box and callout label (which
// are pure CSS overlays positioned independently via the bounding box sliders).

// ─── LAYOUT A: Photo + CAD Overlay only ─────────────────────────────────────

function PhotoCadOverlayLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as AdditionOverviewContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const hasGenerated = !!content.cadGeneratedImageUrl;
  const displayUrl = hasGenerated ? content.cadGeneratedImageUrl! : content.sourcePhotoUrl;
  const accent = content.accentColor ?? branding.accentColor;
  const boxVisible = content.showBoundingBox !== false;
  const offX = content.cadOffsetX ?? 0;
  const offY = content.cadOffsetY ?? 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: hasBg ? "transparent" : "#1B2A4A",
      }}
    >
      {/* Photo layer — generated image (shifted by nudge) or source photo */}
      {displayUrl ? (
        <div
          style={{
            position: "absolute",
            top: hasGenerated ? offY : 0,
            left: hasGenerated ? offX : 0,
            right: hasGenerated ? -offX : 0,
            bottom: hasGenerated ? -offY : 0,
            backgroundImage: `url(${displayUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <ImagePlaceholder />
      )}

      {/* Dark gradient for text legibility */}
      {displayUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)",
          }}
        />
      )}

      {/* Bounding box overlay — always positioned by sliders, independent of image nudge */}
      {displayUrl && boxVisible && <BoundingBoxOverlay content={content} />}

      {/* Subtle watermark when no CAD overlay generated */}
      {displayUrl && !hasGenerated && content.cadGenerationStatus !== "generating" && (
        <div
          style={{
            position: "absolute",
            bottom: "3%",
            right: "3%",
            fontSize: "0.5em",
            color: "rgba(255,255,255,0.35)",
            fontFamily: SLIDE_FONTS.defaults.body,
            fontStyle: "italic",
          }}
        >
          Generate overlay to enhance
        </div>
      )}

      {/* Headline bottom-left */}
      <div style={{ position: "absolute", bottom: "8%", left: "5%", maxWidth: "60%" }}>
        <h2
          style={{
            fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
            fontSize: `${content.headlineSize ?? 2.0}em`,
            fontWeight: content.headlineBold ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: content.headlineColor ?? "#FFFFFF",
            textShadow: makeOutlineShadow(content.headlineOutline) ?? "0 2px 6px rgba(0,0,0,0.4)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {slide.headline ?? "The Vision: Expanding the Footprint"}
        </h2>
        <TitleAccentRule accentColor={accent} marginTop="0.35em" />
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

// ─── LAYOUT B: Photo + Bullet Card ──────────────────────────────────────────

function PhotoBulletCardLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as AdditionOverviewContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const photoUrl = content.sourcePhotoUrl;
  const photoWidth = content.photoPanelWidth ?? 70;
  const accent = content.accentColor ?? branding.accentColor;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: hasBg ? "transparent" : "#F5F0E8",
      }}
    >
      {/* Left panel — photo */}
      <div style={{ width: `${photoWidth}%`, height: "100%", position: "relative", flexShrink: 0 }}>
        {photoUrl ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundImage: `url(${photoUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ) : (
          <ImagePlaceholder />
        )}
      </div>

      {/* Right panel — linen background + bullet card */}
      <div
        style={{
          flex: 1,
          background: "#F5F0E8",
          padding: "5% 5%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Section label */}
        {content.showSectionLabel !== false && (
          <p
            style={{
              fontSize: "0.5em",
              fontFamily: SLIDE_FONTS.defaults.label,
              letterSpacing: "0.15em",
              color: "#9CA3AF",
              textTransform: "uppercase",
              margin: "0 0 0.4em 0",
            }}
          >
            ADDITION OVERVIEW
          </p>
        )}

        {/* Headline */}
        <h2
          style={{
            fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
            fontSize: `${(content.headlineSize ?? 2.0) * 0.7}em`,
            fontWeight: content.headlineBold ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: content.headlineColor ?? "#1B2A4A",
            textShadow: makeOutlineShadow(content.headlineOutline),
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {slide.headline ?? "The Vision: Expanding the Footprint"}
        </h2>
        <TitleAccentRule accentColor={accent} marginTop="0.35em" marginBottom="0.8em" />

        <BulletCard content={content} branding={branding} />
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

// ─── LAYOUT C: Combined (CAD overlay + bullet card) ─────────────────────────

function CombinedLayout({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as AdditionOverviewContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const hasGenerated = !!content.cadGeneratedImageUrl;
  const displayUrl = hasGenerated ? content.cadGeneratedImageUrl! : content.sourcePhotoUrl;
  const photoWidth = content.photoPanelWidth ?? 70;
  const accent = content.accentColor ?? branding.accentColor;
  const offX = content.cadOffsetX ?? 0;
  const offY = content.cadOffsetY ?? 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: hasBg ? "transparent" : "#F5F0E8",
      }}
    >
      {/* Left panel — generated image (shifted by nudge) or source photo */}
      <div style={{ width: `${photoWidth}%`, height: "100%", position: "relative", flexShrink: 0, overflow: "hidden" }}>
        {displayUrl ? (
          <div
            style={{
              position: "absolute",
              top: hasGenerated ? offY : 0,
              left: hasGenerated ? offX : 0,
              right: hasGenerated ? -offX : 0,
              bottom: hasGenerated ? -offY : 0,
              backgroundImage: `url(${displayUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Bounding box overlay — positioned by sliders, independent of image nudge */}
        {displayUrl && content.showBoundingBox !== false && <BoundingBoxOverlay content={content} />}

        {/* Subtle watermark when no CAD overlay generated */}
        {displayUrl && !hasGenerated && content.cadGenerationStatus !== "generating" && (
          <div
            style={{
              position: "absolute",
              bottom: "3%",
              right: "3%",
              fontSize: "0.5em",
              color: "rgba(255,255,255,0.35)",
              fontFamily: SLIDE_FONTS.defaults.body,
              fontStyle: "italic",
            }}
          >
            Generate overlay to enhance
          </div>
        )}
      </div>

      {/* Right panel — linen background + bullet card */}
      <div
        style={{
          flex: 1,
          background: "#F5F0E8",
          padding: "5% 5%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Section label */}
        {content.showSectionLabel !== false && (
          <p
            style={{
              fontSize: "0.5em",
              fontFamily: SLIDE_FONTS.defaults.label,
              letterSpacing: "0.15em",
              color: "#9CA3AF",
              textTransform: "uppercase",
              margin: "0 0 0.4em 0",
            }}
          >
            ADDITION OVERVIEW
          </p>
        )}

        {/* Headline */}
        <h2
          style={{
            fontFamily: content.headlineFont ?? SLIDE_FONTS.defaults.headline,
            fontSize: `${(content.headlineSize ?? 2.0) * 0.7}em`,
            fontWeight: content.headlineBold ? 700 : 400,
            fontStyle: content.headlineItalic ? "italic" : undefined,
            textDecoration: content.headlineUnderline ? "underline" : undefined,
            color: content.headlineColor ?? "#1B2A4A",
            textShadow: makeOutlineShadow(content.headlineOutline),
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {slide.headline ?? "The Vision: Expanding the Footprint"}
        </h2>
        <TitleAccentRule accentColor={accent} marginTop="0.35em" marginBottom="0.8em" />

        <BulletCard content={content} branding={branding} />
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

// ─── Router ─────────────────────────────────────────────────────────────────

export function AdditionOverviewSlide({ slide, branding, hasAiBackground }: LayoutProps) {
  const content = (slide.content ?? {}) as AdditionOverviewContent;
  const layout = content.layout ?? (slide.layoutKey as AdditionOverviewContent["layout"]) ?? "combined";

  switch (layout) {
    case "photo-cad-overlay":
      return <PhotoCadOverlayLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "photo-bullet-card":
      return <PhotoBulletCardLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "combined":
    default:
      return <CombinedLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeOverviewContent,
} from "@/app/lib/deck/types";

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
}

// ─── Empty-state placeholder for image slots ─────────────────────────────────

function ImagePlaceholder({ label }: { label?: string }) {
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
      {/* Simple camera outline icon */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BDBAB5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {label && (
        <p style={{ fontSize: "0.6em", color: "#C4C0BB", letterSpacing: "0.06em" }}>
          {label}
        </p>
      )}
    </div>
  );
}

// ─── Layout 1: split-panel ───────────────────────────────────────────────────
// Left 42 %: label + large serif title + accent rule + description
// Right 58 %: 1 or 2 images stacked with a 2 px gap

function SplitPanelLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const imageUrls = (content.selectedPhotos ?? []).map((p) => p.url).filter(Boolean).slice(0, 2);
  const title = slide.headline ?? "Scope Overview";
  const description = content.description ?? "";
  const hasBg = !!slide.backgroundId;

  const titleSize  = content.titleSize  ?? 1.5;
  const titleColor = content.titleColor ?? branding.textColor;
  const titleX     = content.titleX     ?? 0.06;
  const titleY     = content.titleY     ?? 0.35;
  const copySize   = content.copySize   ?? 1.5;
  const copyColor  = content.copyColor  ?? "#4B5563";
  const copyX      = content.copyX      ?? 0.06;
  const copyY      = content.copyY      ?? 0.66;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Left panel border */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "42%", height: "100%", borderRight: "1px solid #E5E3DF", pointerEvents: "none" }} />

      {/* ── Right: image(s) ──────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: "42%", top: 0, right: 0, bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "hidden",
        }}
      >
        {imageUrls.length === 0 ? (
          <ImagePlaceholder label="Add images in the inspector" />
        ) : imageUrls.length === 1 ? (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <img src={imageUrls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : (
          imageUrls.map((url, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}>
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))
        )}
      </div>

      {/* ── Title cluster (absolutely positioned) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${titleX * 100}%`,
          top: `${titleY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "36%",
          zIndex: 2,
        }}
      >
        <p style={{ fontSize: "0.6em", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: branding.accentColor, marginBottom: "0.8em" }}>
          Project Scope
        </p>
        <h2 className="font-serif" style={{ fontSize: `${2.4 * titleSize}em`, fontWeight: 800, color: titleColor, lineHeight: 1.15, marginBottom: "0.5em" }}>
          {title}
        </h2>
        <div style={{ width: "2.5em", height: 2, background: branding.accentColor, flexShrink: 0 }} />
      </div>

      {/* ── Description (absolutely positioned) ───────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${copyX * 100}%`,
          top: `${copyY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "36%",
          zIndex: 2,
        }}
      >
        {description ? (
          <p style={{ fontSize: `${0.73 * copySize}em`, color: copyColor, lineHeight: 1.85, fontWeight: 400 }}>
            {description}
          </p>
        ) : (
          <p style={{ fontSize: "0.68em", color: "#C4C0BB", fontStyle: "italic" }}>
            Add a description in the inspector.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Layout 2: image-row ─────────────────────────────────────────────────────
// Top 38 %: eyebrow + title + accent rule + description (left-aligned)
// Bottom 62 %: 3–4 images in a full-bleed horizontal row

function ImageRowLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const imageUrls = (content.selectedPhotos ?? []).map((p) => p.url).filter(Boolean).slice(0, 4);
  const title = slide.headline ?? "Scope Overview";
  const description = content.description ?? "";
  const hasBg = !!slide.backgroundId;

  const titleSize  = content.titleSize  ?? 1.5;
  const titleColor = content.titleColor ?? branding.textColor;
  const titleX     = content.titleX     ?? 0.06;
  const titleY     = content.titleY     ?? 0.16;
  const copySize   = content.copySize   ?? 1.5;
  const copyColor  = content.copyColor  ?? "#4B5563";
  const copyX      = content.copyX      ?? 0.06;
  const copyY      = content.copyY      ?? 0.33;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* ── Bottom: image row (occupies lower 60%) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0, right: 0,
          top: "40%", bottom: 0,
          display: "flex",
          gap: 2,
          overflow: "hidden",
        }}
      >
        {imageUrls.length === 0 ? (
          <ImagePlaceholder label="Add images in the inspector" />
        ) : (
          imageUrls.map((url, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden" }}>
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))
        )}
      </div>

      {/* ── Title cluster (absolutely positioned) ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${titleX * 100}%`,
          top: `${titleY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "70%",
          zIndex: 2,
        }}
      >
        <p style={{ fontSize: "0.6em", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: branding.accentColor, marginBottom: "0.8em" }}>
          Project Scope
        </p>
        <h2 className="font-serif" style={{ fontSize: `${2.2 * titleSize}em`, fontWeight: 800, color: titleColor, lineHeight: 1.15, marginBottom: "0.5em" }}>
          {title}
        </h2>
        <div style={{ width: "2.5em", height: 2, background: branding.accentColor, flexShrink: 0 }} />
      </div>

      {/* ── Description (absolutely positioned) ───────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: `${copyX * 100}%`,
          top: `${copyY * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "70%",
          zIndex: 2,
        }}
      >
        {description ? (
          <p style={{ fontSize: `${0.72 * copySize}em`, color: copyColor, lineHeight: 1.8 }}>
            {description}
          </p>
        ) : (
          <p style={{ fontSize: "0.65em", color: "#C4C0BB", fontStyle: "italic" }}>
            Add a description in the inspector.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function ScopeOverviewSlide({ slide, branding }: LayoutProps) {
  switch (slide.layoutKey) {
    case "image-row":
      return <ImageRowLayout slide={slide} branding={branding} />;
    case "split-panel":
    default:
      return <SplitPanelLayout slide={slide} branding={branding} />;
  }
}

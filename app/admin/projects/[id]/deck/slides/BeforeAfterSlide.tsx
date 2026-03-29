"use client";

import type {
  ProposalSlide,
  DeckBranding,
  BeforeAfterContent,
} from "@/app/lib/deck/types";

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface LayoutProps {
  slide: ProposalSlide;
  branding: DeckBranding;
}

/** Small pill label: "BEFORE" or "AFTER" */
function Label({
  text,
  accent,
  dark = false,
}: {
  text: string;
  accent: string;
  dark?: boolean;
}) {
  return (
    <span
      className="uppercase tracking-widest font-semibold"
      style={{
        fontSize: "0.52em",
        letterSpacing: "0.16em",
        color: dark ? "rgba(255,255,255,0.75)" : accent,
        background: dark ? "rgba(0,0,0,0.35)" : `${accent}14`,
        padding: "0.25em 0.7em",
        borderRadius: 2,
        display: "inline-block",
      }}
    >
      {text}
    </span>
  );
}

/** Gray placeholder panel shown when no image URL is provided. */
function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-2"
      style={{ background: "#E8E6E2" }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BDBAB4"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      <span style={{ fontSize: "0.6em", color: "#B0ADA7", fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

// ─── Layout 1: side-by-side ───────────────────────────────────────────────────
// Left: before image. Right: after image. Room name at top, caption at bottom.

function SideBySideLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const roomName = content.roomName ?? slide.headline ?? "Room Overview";
  const caption = content.caption ?? null;
  const hasBg = !!slide.backgroundId;
  const resolvedTitleColor   = content.headingColor ?? branding.textColor;
  const resolvedCaptionColor = content.captionColor ?? "#9CA3AF";
  const accentLineColor = hasBg ? `${resolvedTitleColor}55` : `${branding.accentColor}30`;
  const headingEm   = `${content.headingFontSize ?? 1.5}em`;
  const captionEmSz = `${content.captionFontSize ?? 1.5}em`;

  return (
    <div
      className="relative w-full h-full flex flex-col"
      style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Header bar */}
      <div
        style={{
          flexShrink: 0,
          padding: "3.5% 5% 2.5%",
          display: "flex",
          alignItems: "baseline",
          gap: "1.2em",
        }}
      >
        <h2
          className="font-serif"
          style={{
            fontSize: headingEm,
            fontWeight: 700,
            color: resolvedTitleColor,
            lineHeight: 1.15,
          }}
        >
          {roomName}
        </h2>
        <div
          style={{
            height: 2,
            flex: 1,
            background: accentLineColor,
            marginBottom: "0.3em",
          }}
        />
      </div>

      {/* Image columns */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: "1.5%",
          padding: "0 5%",
          minHeight: 0,
        }}
      >
        {/* Before */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2.5%",
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
            {content.beforeImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.beforeImageUrl}
                alt="Before"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <ImagePlaceholder label="No before photo" />
            )}
            {/* Label overlay at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "8% 5% 5%",
                background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <Label text="Before" accent={branding.accentColor} dark />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "#D8D5D0", flexShrink: 0, alignSelf: "stretch" }} />

        {/* After */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2.5%",
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, position: "relative", borderRadius: 4, overflow: "hidden" }}>
            {content.afterImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.afterImageUrl}
                alt="After"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <ImagePlaceholder label="No render / after photo" />
            )}
            {/* Accent corner tab */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "8% 5% 5%",
                background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <Label text="After" accent={branding.accentColor} dark />
            </div>
          </div>
        </div>
      </div>

      {/* Caption / footer */}
      <div
        style={{
          flexShrink: 0,
          padding: "2% 5% 3%",
        }}
      >
        <p
          style={{
            fontSize: captionEmSz,
            color: resolvedCaptionColor,
            fontStyle: caption ? "italic" : "normal",
          }}
        >
          {caption ?? ""}
        </p>
      </div>

      {/* Freely positioned logo */}
      {(branding.logoLightUrl || branding.logoDarkUrl) && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={
            (content.logoVariant ?? "light") === "dark"
              ? (branding.logoDarkUrl ?? branding.logoLightUrl ?? "")
              : (branding.logoLightUrl ?? branding.logoDarkUrl ?? "")
          }
          alt={branding.companyName}
          style={{
            position: "absolute",
            left: `${(content.logoX ?? 0.85) * 100}%`,
            top: `${(content.logoY ?? 0.88) * 100}%`,
            transform: "translate(-50%, -50%)",
            height: `${content.logoSize ?? 4.0}em`,
            objectFit: "contain",
            opacity: 0.7,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ─── Layout 2: after-emphasis ─────────────────────────────────────────────────
// Hero after image fills the right 65%. Left editorial panel with room name.
// Before image shown as a small inset within the left panel.

function AfterEmphasisLayout({ slide, branding }: LayoutProps) {
  const content = (slide.content ?? {}) as BeforeAfterContent;
  const roomName = content.roomName ?? slide.headline ?? "Room Overview";
  const caption = content.caption ?? null;
  const hasBg = !!slide.backgroundId;
  const headingEm   = `${content.headingFontSize ?? 1.5}em`;
  const captionEmSz = `${content.captionFontSize ?? 1.5}em`;
  const resolvedTitleColor   = content.headingColor ?? "#F8F7F4";
  const resolvedCaptionColor = content.captionColor ?? "rgba(255,255,255,0.55)";

  return (
    <div
      className="relative w-full h-full flex"
      style={{ background: hasBg ? "transparent" : "#111827", overflow: "hidden" }}
    >
      {/* ── Left panel (35%) ───────────────────────────────────────────── */}
      <div
        style={{
          width: "35%",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "6% 6% 5%",
          background: hasBg ? "rgba(15,22,36,0.82)" : "#1A2332",
          zIndex: 2,
        }}
      >
        {/* Top block — room name + accent */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6em",
              marginBottom: "1.2em",
            }}
          >
            <div
              style={{
                width: "1.4em",
                height: 2,
                background: branding.accentColor,
                flexShrink: 0,
              }}
            />
            <span
              className="uppercase tracking-widest font-semibold"
              style={{ fontSize: "0.5em", color: branding.accentColor, letterSpacing: "0.14em" }}
            >
              After
            </span>
          </div>
          <h2
            className="font-serif"
            style={{
              fontSize: headingEm,
              fontWeight: 800,
              color: resolvedTitleColor,
              lineHeight: 1.2,
              marginBottom: caption ? "0.8em" : 0,
            }}
          >
            {roomName}
          </h2>
          {caption && (
            <p
              style={{
                fontSize: captionEmSz,
                color: resolvedCaptionColor,
                lineHeight: 1.65,
                fontStyle: "italic",
              }}
            >
              {caption}
            </p>
          )}
        </div>

        {/* Before thumbnail — bottom of left panel */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5em",
              marginBottom: "0.7em",
            }}
          >
            <span
              className="uppercase tracking-widest font-semibold"
              style={{ fontSize: "0.45em", color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em" }}
            >
              Before
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          </div>
          <div
            style={{
              aspectRatio: "4/3",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {content.beforeImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={content.beforeImageUrl}
                alt="Before"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: "#242E3D" }}
              >
                <span style={{ fontSize: "0.5em", color: "rgba(255,255,255,0.3)" }}>
                  No before photo
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Right panel — hero after image (65%) ──────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        {content.afterImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={content.afterImageUrl}
            alt="After"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-3"
            style={{ background: "#2A3545" }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span style={{ fontSize: "0.65em", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
              No render selected
            </span>
          </div>
        )}

        {/* Thin accent left edge over the photo */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            bottom: 0,
            background: branding.accentColor,
            opacity: 0.85,
          }}
        />
      </div>

      {/* Freely positioned logo */}
      {(branding.logoLightUrl || branding.logoDarkUrl) && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={
            (content.logoVariant ?? "light") === "dark"
              ? (branding.logoDarkUrl ?? branding.logoLightUrl ?? "")
              : (branding.logoLightUrl ?? branding.logoDarkUrl ?? "")
          }
          alt={branding.companyName}
          style={{
            position: "absolute",
            left: `${(content.logoX ?? 0.85) * 100}%`,
            top: `${(content.logoY ?? 0.88) * 100}%`,
            transform: "translate(-50%, -50%)",
            height: `${content.logoSize ?? 4.0}em`,
            objectFit: "contain",
            opacity: 0.7,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function BeforeAfterSlide({ slide, branding }: LayoutProps) {
  switch (slide.layoutKey) {
    case "after-emphasis":
      return <AfterEmphasisLayout slide={slide} branding={branding} />;
    case "side-by-side":
    default:
      return <SideBySideLayout slide={slide} branding={branding} />;
  }
}

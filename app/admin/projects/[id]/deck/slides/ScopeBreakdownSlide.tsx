"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeBreakdownContent,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOutlineShadow(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return `-1px -1px 0 ${color}, 1px -1px 0 ${color}, -1px 1px 0 ${color}, 1px 1px 0 ${color}, 0 -1px 0 ${color}, 0 1px 0 ${color}`;
}

function gridColumns(count: number): string {
  if (count <= 2) return "1fr";
  if (count <= 4) return "1fr 1fr";
  return "1fr 1fr 1fr";
}

// ─── No-rooms placeholder ─────────────────────────────────────────────────────

function NoRooms() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ fontSize: "0.75em", color: "#9CA3AF", fontStyle: "italic" }}>
        No sections added yet. Use ⚡ Auto-Fill → Auto Build Scope Breakdown.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScopeBreakdownSlide({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const resolvedAccent = content.accentColor ?? "#B8860B";
  const accent = resolvedAccent;

  const title =
    content.title || slide.headline || "Additional Areas Included";
  const introText = content.introText ?? "";
  const visibleRooms = (content.rooms ?? []).filter((r) => r.isIncluded);
  const photos = (content.photos ?? []).slice(0, 4);
  const hasPhotos = photos.length > 0;

  return (
    <div
      className="relative w-full h-full"
      style={{ background: hasAiBackground ? "transparent" : "#FAFAF8", overflow: "hidden" }}
    >
      {/* Subtle dot-grid watermark */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: 0.022,
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <pattern
            id="sb-dots"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill={branding.textColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sb-dots)" />
      </svg>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: SLIDE_PADDING.content,
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: SECTION_LABEL_SIZE,
                fontWeight: 600,
                fontFamily: SLIDE_FONTS.defaults.label,
                letterSpacing: "0.13em",
                color: accent,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            style={{
              fontSize: `${2.8 * (content.titleSize ?? 1.0)}em`,
              fontWeight: (content.titleBold ?? true) ? 800 : 400,
              fontFamily: content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
              fontStyle: content.titleItalic ? "italic" : undefined,
              textDecoration: content.titleUnderline ? "underline" : undefined,
              color: content.titleColor ?? branding.textColor,
              lineHeight: 1.1,
              textShadow: makeOutlineShadow(content.titleOutline),
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
          {introText && (
            <p
              style={{
                fontSize: `${0.72 * (content.introSize ?? 1.0)}em`,
                fontFamily: content.introFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                fontWeight: content.introBold ? 700 : 400,
                fontStyle: content.introItalic ? "italic" : undefined,
                textDecoration: content.introUnderline ? "underline" : undefined,
                color: content.introColor ?? "#6B7280",
                lineHeight: 1.65,
                marginTop: "0.65em",
                maxWidth: "72%",
                textShadow: makeOutlineShadow(content.introOutline),
              }}
            >
              {introText}
            </p>
          )}
        </div>

        {/* ── Room grid ────────────────────────────────────────────────── */}
        {visibleRooms.length === 0 ? (
          <NoRooms />
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: gridColumns(visibleRooms.length),
              gap: "1.8% 3.5%",
              alignContent: "start",
              overflow: "hidden",
              marginBottom: hasPhotos ? "2.5%" : 0,
            }}
          >
            {visibleRooms.map((room) => {
              const roomTitleStyle: React.CSSProperties = {
                fontSize: `${0.82 * (room.titleSize ?? 1.0)}em`,
                fontWeight: (room.titleBold ?? true) ? 700 : 400,
                fontFamily: room.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
                fontStyle: room.titleItalic ? "italic" : undefined,
                textDecoration: room.titleUnderline ? "underline" : undefined,
                color: room.titleColor ?? branding.textColor,
                lineHeight: 1.2,
                marginBottom: "0.4em",
                textShadow: makeOutlineShadow(room.titleOutline),
              };
              const roomDescStyle: React.CSSProperties = {
                fontSize: `${0.63 * (room.descriptionSize ?? 1.0)}em`,
                fontFamily: room.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
                fontWeight: room.descriptionBold ? 700 : 400,
                fontStyle: room.descriptionItalic ? "italic" : undefined,
                textDecoration: room.descriptionUnderline ? "underline" : undefined,
                color: room.descriptionColor ?? "#4B5563",
                lineHeight: 1.75,
                textShadow: makeOutlineShadow(room.descriptionOutline),
              };
              return (
                <div
                  key={room.id}
                  style={{
                    borderLeft: `3px solid ${accent}`,
                    paddingLeft: "4%",
                    paddingTop: "0.5%",
                    paddingBottom: "0.5%",
                  }}
                >
                  <p style={roomTitleStyle}>
                    {room.name}
                  </p>
                  {room.description && (
                    <p style={roomDescStyle}>
                      {room.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Optional photo strip ─────────────────────────────────────── */}
        {hasPhotos && (
          <div
            style={{
              display: "flex",
              gap: "1.5%",
              height: "21%",
              flexShrink: 0,
            }}
          >
            {photos.map((photo, idx) => (
              <div
                key={photo.id}
                style={{
                  flex: 1,
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "#E8E6E3",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Supporting photo ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            ))}
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

"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeBreakdownContent,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
          padding: "5% 6% 4%",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {slide.subheadline && (
            <p
              className="uppercase tracking-widest"
              style={{
                fontSize: "0.65em",
                fontWeight: 600,
                letterSpacing: "0.13em",
                color: branding.accentColor,
                marginBottom: "0.35em",
              }}
            >
              {slide.subheadline}
            </p>
          )}
          <h2
            className="font-serif"
            style={{
              fontSize: "2.8em",
              fontWeight: 800,
              color: branding.textColor,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          <TitleAccentRule accentColor={branding.accentColor} />
          {introText && (
            <p
              style={{
                fontSize: "0.72em",
                color: "#6B7280",
                lineHeight: 1.65,
                marginTop: "0.65em",
                maxWidth: "72%",
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
            {visibleRooms.map((room) => (
              <div
                key={room.id}
                style={{
                  borderLeft: `3px solid ${branding.accentColor}`,
                  paddingLeft: "4%",
                  paddingTop: "0.5%",
                  paddingBottom: "0.5%",
                }}
              >
                <p
                  className="font-serif"
                  style={{
                    fontSize: "0.82em",
                    fontWeight: 700,
                    color: branding.textColor,
                    lineHeight: 1.2,
                    marginBottom: "0.4em",
                  }}
                >
                  {room.name}
                </p>
                {room.description && (
                  <p
                    style={{
                      fontSize: "0.63em",
                      color: "#4B5563",
                      lineHeight: 1.75,
                      fontWeight: 400,
                    }}
                  >
                    {room.description}
                  </p>
                )}
              </div>
            ))}
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
    </div>
  );
}

"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ─────────────────────────────────────────────────────────

const NAVY = "#1B2A4A";
const GOLD = "#B8860B";
const LINEN = "#F5F0E8";

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

function resolveTitle(content: ScopeBreakdownContent, slide: ProposalSlide): string {
  // Guard against COPE-style titles leaking into the "Additional Areas"
  // header — older decks stored "Cost of Project Execution" in slide.headline.
  const fallback = slide.headline?.trim();
  const isCopeTitle = fallback ? /cost of project execution|\bcope\b/i.test(fallback) : false;
  return content.title || (fallback && !isCopeTitle ? fallback : "Additional Areas Included");
}

/** Rooms the slide should render: included + not a COPE entry. */
function visibleRoomsOf(content: ScopeBreakdownContent): ScopeBreakdownRoom[] {
  return (content.rooms ?? []).filter((r) => {
    if (r.isIncluded === false) return false;
    const name = (r.name ?? "").trim();
    // Legacy data: COPE was previously synced into content.rooms before the
    // isProjectOverhead filter was added in db.ts. Defensively drop it here.
    if (/cost of project execution|\bcope\b/i.test(name)) return false;
    return true;
  });
}

function resolveAccent(content: ScopeBreakdownContent): string {
  return content.accentColor ?? GOLD;
}

function resolveHeadlineFont(content: ScopeBreakdownContent): string {
  return content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline;
}

function resolveBodyFont(content: ScopeBreakdownContent): string {
  return content.introFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body;
}

function roomTitleStyle(room: ScopeBreakdownRoom, content: ScopeBreakdownContent, branding: DeckBranding, overrideColor?: string): React.CSSProperties {
  return {
    fontSize: `${0.82 * (room.titleSize ?? 1.0)}em`,
    fontWeight: (room.titleBold ?? true) ? 700 : 400,
    fontFamily: room.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline,
    fontStyle: room.titleItalic ? "italic" : undefined,
    textDecoration: room.titleUnderline ? "underline" : undefined,
    color: room.titleColor ?? overrideColor ?? branding.textColor,
    lineHeight: 1.2,
    marginBottom: "0.4em",
    textShadow: makeOutlineShadow(room.titleOutline),
  };
}

function roomDescStyle(room: ScopeBreakdownRoom, content: ScopeBreakdownContent, overrideColor?: string): React.CSSProperties {
  return {
    fontSize: `${0.63 * (room.descriptionSize ?? 1.0)}em`,
    fontFamily: room.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body,
    fontWeight: room.descriptionBold ? 700 : 400,
    fontStyle: room.descriptionItalic ? "italic" : undefined,
    textDecoration: room.descriptionUnderline ? "underline" : undefined,
    color: room.descriptionColor ?? overrideColor ?? "#4B5563",
    lineHeight: 1.75,
    textShadow: makeOutlineShadow(room.descriptionOutline),
  };
}

// ─── No-rooms placeholder ─────────────────────────────────────────────────────

function NoRooms() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: "0.75em", color: "#9CA3AF", fontStyle: "italic" }}>
        No sections added yet. Use &#x26A1; Auto-Fill &rarr; Auto Build Scope Breakdown.
      </p>
    </div>
  );
}

// ─── Photo strip (shared by layouts that support it) ─────────────────────────

function PhotoStrip({ photos }: { photos: ScopeBreakdownContent["photos"] }) {
  const items = (photos ?? []).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "1.5%", height: "21%", flexShrink: 0 }}>
      {items.map((photo, idx) => (
        <div key={photo.id} style={{ flex: 1, borderRadius: 4, overflow: "hidden", background: "#E8E6E3" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={`Supporting photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      ))}
    </div>
  );
}

// ─── Logo wrapper ────────────────────────────────────────────────────────────

function SlideLogo({ content, branding }: { content: ScopeBreakdownContent; branding: DeckBranding }) {
  return (
    <LogoOverlay
      show={content.showLogo ?? false}
      variant={content.logoVariant ?? "light"}
      xPercent={content.logoX ?? LOGO_POSITION_DEFAULTS.content.x}
      yPercent={content.logoY ?? LOGO_POSITION_DEFAULTS.content.y}
      scale={content.logoSize ?? 1.0}
      branding={branding}
    />
  );
}

// ─── Main component (layout router) ──────────────────────────────────────────

export function ScopeBreakdownSlide({ slide, branding, hasAiBackground }: Props) {
  const layoutKey = slide.layoutKey as string;

  switch (layoutKey) {
    case "dark-table":
      return <DarkTableLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "icon-columns":
      return <IconColumnsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "cards-split":
      return <CardsSplitLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "photo-grid":
      return <PhotoGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    // LEGACY: "three-pillars" caps at 3 rooms; superseded by pagination at 8 rooms/slide. Remove this case + ThreePillarsLayout in cleanup pass.
    case "three-pillars":
      return <ThreePillarsLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    default: // "text-grid"
      return <TextGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout: Text Grid (original default)
// ═══════════════════════════════════════════════════════════════════════════════

function TextGridLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);
  const photos = (content.photos ?? []).slice(0, 4);
  const hasPhotos = photos.length > 0;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      {/* Subtle dot-grid watermark */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.022 }} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <pattern id="sb-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={branding.textColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sb-dots)" />
      </svg>

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p className="uppercase tracking-widest" style={{ fontSize: SECTION_LABEL_SIZE, fontWeight: 600, fontFamily: SLIDE_FONTS.defaults.label, letterSpacing: "0.13em", color: accent, marginBottom: "0.35em" }}>
              {slide.subheadline}
            </p>
          )}
          <h2 style={{ fontSize: `${2.8 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 800 : 400, fontFamily: resolveHeadlineFont(content), fontStyle: content.titleItalic ? "italic" : undefined, textDecoration: content.titleUnderline ? "underline" : undefined, color: content.titleColor ?? branding.textColor, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
          {introText && (
            <p style={{ fontSize: `${0.72 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), fontWeight: content.introBold ? 700 : 400, fontStyle: content.introItalic ? "italic" : undefined, textDecoration: content.introUnderline ? "underline" : undefined, color: content.introColor ?? "#6B7280", lineHeight: 1.65, marginTop: "0.65em", maxWidth: "72%", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* Room grid — flat room-by-room.
            Phase 8C.1 reverted T6's grouped-by-category render. */}
        {visibleRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: gridColumns(visibleRooms.length), gap: "1.8% 3.5%", alignContent: "start", overflow: "hidden", marginBottom: hasPhotos ? "2.5%" : 0 }}>
            {visibleRooms.map((room) => (
              <div key={room.id} style={{ borderLeft: `3px solid ${accent}`, paddingLeft: "4%", paddingTop: "0.5%", paddingBottom: "0.5%" }}>
                <p style={roomTitleStyle(room, content, branding)}>{room.name}</p>
                {room.description && <p style={roomDescStyle(room, content)}>{room.description}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Optional photo strip */}
        {hasPhotos && <PhotoStrip photos={photos} />}
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout A: Dark Table (inspired by Seamless PDF p3 — horizontal rows)
// ═══════════════════════════════════════════════════════════════════════════════

function DarkTableLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : NAVY, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "4%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p className="uppercase tracking-widest" style={{ fontSize: SECTION_LABEL_SIZE, fontWeight: 600, fontFamily: SLIDE_FONTS.defaults.label, letterSpacing: "0.13em", color: accent, marginBottom: "0.35em" }}>
              {slide.subheadline}
            </p>
          )}
          <h2 style={{ fontSize: `${2.4 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content), fontStyle: content.titleItalic ? "italic" : undefined, color: content.titleColor ?? LINEN, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
          {introText && (
            <p style={{ fontSize: `${0.65 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), fontWeight: content.introBold ? 700 : 400, fontStyle: (content.introItalic ?? true) ? "italic" : undefined, color: content.introColor ?? "rgba(245,240,232,0.7)", lineHeight: 1.6, marginTop: "0.5em", maxWidth: "72%", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* Table rows */}
        {visibleRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
            {visibleRooms.map((room, i) => (
              <div key={room.id}>
                {i > 0 && <div style={{ height: 1, background: `${accent}30`, margin: "0.4em 0" }} />}
                <div style={{ display: "flex", gap: "5%", alignItems: "flex-start", padding: "1.2% 0" }}>
                  {/* Room name — left column */}
                  <div style={{ width: "28%", flexShrink: 0 }}>
                    <p style={{ ...roomTitleStyle(room, content, branding, accent), fontSize: `${0.78 * (room.titleSize ?? 1.0)}em`, fontStyle: "italic", marginBottom: 0 }}>
                      {room.name}
                    </p>
                  </div>
                  {/* Description — right column */}
                  <div style={{ flex: 1 }}>
                    {room.description && (
                      <p style={{ ...roomDescStyle(room, content, "rgba(245,240,232,0.85)"), fontSize: `${0.56 * (room.descriptionSize ?? 1.0)}em`, lineHeight: 1.65 }}>
                        {room.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout B: Icon Columns (inspired by Refined PDF p3 — "Anatomy of the Renovation")
// ═══════════════════════════════════════════════════════════════════════════════

const SCOPE_ICONS: Record<string, React.ReactNode> = {
  demolition: <><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 01-8 0" /></>,
  systems: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
  cabinetry: <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></>,
  surfaces: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></>,
  lighting: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17H8v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" /></>,
  default: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
};

function ScopeIcon({ name, color, size = "2em" }: { name?: string; color: string; size?: string }) {
  const key = name?.toLowerCase() ?? "default";
  const paths = SCOPE_ICONS[key] ?? SCOPE_ICONS.default;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

function IconColumnsLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);

  // Columns: max 5
  const displayRooms = visibleRooms.slice(0, 5);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header — centered */}
        <div style={{ flexShrink: 0, marginBottom: "4%", textAlign: "center" }}>
          <h2 style={{ fontSize: `${2.4 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content), color: content.titleColor ?? NAVY, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} />
          </div>
          {introText && (
            <p style={{ fontSize: `${0.6 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), color: content.introColor ?? "#4B5563", lineHeight: 1.6, marginTop: "0.5em", maxWidth: "70%", marginLeft: "auto", marginRight: "auto", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* Columns */}
        {displayRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "flex", gap: "1%", minHeight: 0, alignItems: "flex-start" }}>
            {displayRooms.map((room, i) => (
              <div key={room.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "2%", borderLeft: i > 0 ? `1px solid ${accent}20` : undefined }}>
                {/* Phase 8C.1: reverted from per-row category icon back to
                    the default icon (decision: no scope deep-dive feature). */}
                <div style={{ marginBottom: "8%" }}>
                  <ScopeIcon color={accent} />
                </div>
                {/* Name */}
                <p style={{ ...roomTitleStyle(room, content, branding, NAVY), fontSize: `${0.72 * (room.titleSize ?? 1.0)}em`, textAlign: "center" }}>
                  {room.name}
                </p>
                {/* Description */}
                {room.description && (
                  <p style={{ ...roomDescStyle(room, content), fontSize: `${0.52 * (room.descriptionSize ?? 1.0)}em`, textAlign: "center", lineHeight: 1.6 }}>
                    {room.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout C: Cards Split (dark bg, title left, white cards right)
// Inspired by Seamless PDF p1
// ═══════════════════════════════════════════════════════════════════════════════

function CardsSplitLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);

  // Max 3 cards in the right panel
  const displayRooms = visibleRooms.slice(0, 3);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : NAVY, overflow: "hidden" }}>
      {/* Architectural blueprint watermark */}
      <svg style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", pointerEvents: "none", opacity: 0.04 }} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <pattern id="sb-blueprint" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0v40" fill="none" stroke={LINEN} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sb-blueprint)" />
      </svg>

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex" }}>
        {/* Left panel — title area */}
        <div style={{ width: "35%", display: "flex", flexDirection: "column", justifyContent: "center", padding: SLIDE_PADDING.content }}>
          <h2 style={{ fontSize: `${2.2 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content), color: content.titleColor ?? LINEN, lineHeight: 1.15, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p style={{ fontSize: SECTION_LABEL_SIZE, fontWeight: 600, fontFamily: SLIDE_FONTS.defaults.label, textTransform: "uppercase", letterSpacing: "0.13em", color: accent, marginTop: "0.8em" }}>
              {slide.subheadline}
            </p>
          )}
          {introText && (
            <p style={{ fontSize: `${0.58 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), color: content.introColor ?? "rgba(245,240,232,0.7)", lineHeight: 1.65, marginTop: "0.8em", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* Right panel — cards */}
        <div style={{ width: "65%", display: "flex", gap: "2.5%", padding: "4% 5% 4% 2%", alignItems: "stretch" }}>
          {displayRooms.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <NoRooms />
            </div>
          ) : (
            displayRooms.map((room) => (
              <div key={room.id} style={{ flex: 1, background: "rgba(245,240,232,0.95)", borderRadius: 8, padding: "4%", display: "flex", flexDirection: "column" }}>
                {/* Phase 8C.1: reverted per-row category icon back to default. */}
                <div style={{ marginBottom: "6%" }}>
                  <ScopeIcon color={accent} size="1.8em" />
                </div>
                {/* Name */}
                <p style={{ ...roomTitleStyle(room, content, branding, NAVY), fontSize: `${0.72 * (room.titleSize ?? 1.0)}em` }}>
                  {room.name}
                </p>
                {/* Description */}
                {room.description && (
                  <p style={{ ...roomDescStyle(room, content, "#4B5563"), fontSize: `${0.5 * (room.descriptionSize ?? 1.0)}em`, lineHeight: 1.6 }}>
                    {room.description}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout D: Photo Grid (2x2 cards with photos + text)
// Inspired by Refined PDF p4 — "Material Standards"
// ═══════════════════════════════════════════════════════════════════════════════

function PhotoGridLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);
  const photos = content.photos ?? [];

  // Max 4 rooms in a 2x2 grid
  const displayRooms = visibleRooms.slice(0, 4);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header — centered */}
        <div style={{ flexShrink: 0, marginBottom: "3%", textAlign: "center" }}>
          <h2 style={{ fontSize: `${2.2 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content), color: content.titleColor ?? NAVY, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} />
          </div>
          {introText && (
            <p style={{ fontSize: `${0.58 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), fontStyle: "italic", color: content.introColor ?? "#4B5563", lineHeight: 1.5, marginTop: "0.3em", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* 2x2 grid */}
        {displayRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "2%", minHeight: 0 }}>
            {displayRooms.map((room, i) => {
              const photo = photos[i];
              return (
                <div key={room.id} style={{ display: "flex", borderRadius: 8, overflow: "hidden", background: "#F0EDE8", border: "1px solid rgba(0,0,0,0.06)" }}>
                  {/* Text side */}
                  <div style={{ flex: 1, padding: "4% 5%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <p style={{ ...roomTitleStyle(room, content, branding, accent), fontSize: `${0.72 * (room.titleSize ?? 1.0)}em` }}>
                      {room.name}
                    </p>
                    {room.description && (
                      <p style={{ ...roomDescStyle(room, content, "#4B5563"), fontSize: `${0.48 * (room.descriptionSize ?? 1.0)}em`, lineHeight: 1.6 }}>
                        {room.description}
                      </p>
                    )}
                  </div>
                  {/* Photo side */}
                  <div style={{ width: "38%", flexShrink: 0, background: "#E0DDD8", position: "relative" }}>
                    {photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={photo.url} alt={room.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="2em" height="2em" viewBox="0 0 24 24" fill="none" stroke="#B0AAA0" strokeWidth={1.2}>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom accent bar */}
        <div style={{ flexShrink: 0, marginTop: "2.5%", padding: "0.8% 2%", background: accent, borderRadius: 4 }}>
          <p style={{ fontFamily: SLIDE_FONTS.defaults.body, fontSize: "0.46em", color: LINEN, fontWeight: 600, textAlign: "center" }}>
            All areas completed to the same standard of quality and craftsmanship.
          </p>
        </div>
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout E: Three Pillars (centered, symmetrical columns)
// Inspired by Refined PDF p2 — "Elevating Functionality"
// ═══════════════════════════════════════════════════════════════════════════════

// LEGACY: hard-capped at 3 rooms — incompatible with the 8-rooms-per-slide pagination model. User confirmed no value. Remove with the case in resolveLayout above.
function ThreePillarsLayout({ slide, branding, hasAiBackground }: Props) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);

  // Show 3 pillars
  const displayRooms = visibleRooms.slice(0, 3);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : "#FAFAF8", overflow: "hidden" }}>
      {/* Subtle grid lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.035 }} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <pattern id="sb-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0v48" fill="none" stroke="#999" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sb-grid)" />
      </svg>

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.centered, textAlign: "center" }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "5%" }}>
          <h2 style={{ fontSize: `${2.6 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content), color: content.titleColor ?? NAVY, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} />
          </div>
          {introText && (
            <p style={{ fontSize: `${0.65 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), color: content.introColor ?? "#4B5563", lineHeight: 1.6, marginTop: "0.5em", maxWidth: "75%", marginLeft: "auto", marginRight: "auto", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {/* Three columns */}
        {displayRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "flex", gap: "4%", alignItems: "flex-start", justifyContent: "center" }}>
            {displayRooms.map((room) => (
              <div key={room.id} style={{ flex: 1, maxWidth: "30%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Phase 8C.1: reverted per-row category icon back to default. */}
                <div style={{ width: "3.5em", height: "3.5em", borderRadius: "50%", border: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8%", background: "rgba(255,255,255,0.6)" }}>
                  <ScopeIcon color={accent} size="1.6em" />
                </div>
                {/* Name */}
                <p style={{ ...roomTitleStyle(room, content, branding, NAVY), fontSize: `${0.78 * (room.titleSize ?? 1.0)}em`, textAlign: "center", marginBottom: "0.6em" }}>
                  {room.name}
                </p>
                {/* Description */}
                {room.description && (
                  <p style={{ ...roomDescStyle(room, content), fontSize: `${0.52 * (room.descriptionSize ?? 1.0)}em`, textAlign: "center", lineHeight: 1.65 }}>
                    {room.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <SlideLogo content={content} branding={branding} />
    </div>
  );
}

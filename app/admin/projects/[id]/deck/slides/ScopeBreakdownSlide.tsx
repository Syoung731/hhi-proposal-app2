"use client";

import type {
  ProposalSlide,
  DeckBranding,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
} from "@/app/lib/deck/types";
import { TitleAccentRule } from "./shared/TitleAccentRule";
import { BlueprintUnderlay } from "./shared/BlueprintUnderlay";
import { useDeckTheme } from "@/app/lib/deck/theme-context";
import { ScopeIcon } from "./shared/ScopeIcons";
import { LogoOverlay } from "@/components/slides/shared/LogoOverlay";
import { SLIDE_PADDING, SECTION_LABEL_SIZE, SLIDE_FONTS, LOGO_POSITION_DEFAULTS } from "@/app/lib/slide-constants";

interface Props {
  slide: ProposalSlide;
  branding: DeckBranding;
  hasAiBackground?: boolean;
}

// ─── Design tokens ─────────────────────────────────────────────────────────

// Cream title text on the Dark Table layout (a text color, not the page surface).
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

function resolveAccent(content: ScopeBreakdownContent, branding: DeckBranding): string {
  return content.accentColor ?? branding.accentColor;
}

function resolveHeadlineFont(content: ScopeBreakdownContent, fallback: string = SLIDE_FONTS.defaults.headline): string {
  return content.titleFont ?? content.headlineFont ?? fallback;
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
    case "utility-grid":
      return <UtilityGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    case "blueprint":
      return <BlueprintLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
    default: // "text-grid"
      return <TextGridLayout slide={slide} branding={branding} hasAiBackground={hasAiBackground} />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout: Text Grid (original default)
// ═══════════════════════════════════════════════════════════════════════════════

function TextGridLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content, branding);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);
  const photos = (content.photos ?? []).slice(0, 4);
  const hasPhotos = photos.length > 0;

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
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
          <h2 style={{ fontSize: `${2.8 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 800 : 400, fontFamily: resolveHeadlineFont(content, theme.fonts.headline), fontStyle: content.titleItalic ? "italic" : undefined, textDecoration: content.titleUnderline ? "underline" : undefined, color: content.titleColor ?? branding.textColor, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
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
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content, branding);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.panel, overflow: "hidden" }}>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: "4%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p className="uppercase tracking-widest" style={{ fontSize: SECTION_LABEL_SIZE, fontWeight: 600, fontFamily: SLIDE_FONTS.defaults.label, letterSpacing: "0.13em", color: accent, marginBottom: "0.35em" }}>
              {slide.subheadline}
            </p>
          )}
          <h2 style={{ fontSize: `${2.4 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content, theme.fonts.headline), fontStyle: content.titleItalic ? "italic" : undefined, color: content.titleColor ?? LINEN, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
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
// Per-room icon helpers (Utility Grid)
// ═══════════════════════════════════════════════════════════════════════════════

/** Guess a built-in icon key from a room name (fallback when no bespoke icon). */
function roomIconKey(name: string): string {
  const n = name.toLowerCase();
  const map: [RegExp, string][] = [
    [/kitchen/, "kitchen"],
    [/bath|powder|shower|wc|water closet/, "shower"],
    [/bed|primary|master|suite/, "house"],
    [/laundry|utility|mud/, "appliance"],
    [/garage/, "house"],
    [/dining/, "counter"],
    [/living|family|great|den|lounge/, "tv"],
    [/office|study|library/, "feature"],
    [/closet|storage|pantry/, "storage"],
    [/hall|foyer|entry|stair/, "stairs"],
    [/deck|patio|porch|outdoor|exterior/, "deck"],
    [/pool|spa/, "pool"],
    [/floor/, "flooring"],
    [/light|electric/, "lighting"],
  ];
  for (const [re, key] of map) if (re.test(n)) return key;
  return "feature";
}

/** Render a room's icon: bespoke PNG (mask-tinted) if present, else a built-in vector. */
function RoomIcon({ room, color, size = 28 }: { room: ScopeBreakdownRoom; color: string; size?: number }) {
  if (room.iconImageUrl) {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-block", width: size, height: size, backgroundColor: color,
          WebkitMaskImage: `url(${room.iconImageUrl})`, maskImage: `url(${room.iconImageUrl})`,
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          WebkitMaskPosition: "center", maskPosition: "center",
          WebkitMaskSize: "contain", maskSize: "contain",
        }}
      />
    );
  }
  return <ScopeIcon name={room.icon ?? roomIconKey(room.name)} size={size} color={color} strokeWidth={1.5} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout: Utility Grid (bordered icon cells — "Purposeful Living & Utility Spaces")
// ═══════════════════════════════════════════════════════════════════════════════

function UtilityGridLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content, branding);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);
  const cols = visibleRooms.length <= 4 ? 2 : 3;
  const cellBorder = "1px solid rgba(26,35,50,0.18)";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.surface, overflow: "hidden" }}>
      {theme.surface.grid && !hasBg && <BlueprintUnderlay />}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        <div style={{ flexShrink: 0, marginBottom: "3%" }}>
          {(content.showSectionLabel ?? true) && slide.subheadline && (
            <p className="uppercase tracking-widest" style={{ fontSize: SECTION_LABEL_SIZE, fontWeight: 600, fontFamily: SLIDE_FONTS.defaults.label, letterSpacing: "0.13em", color: accent, marginBottom: "0.35em" }}>
              {slide.subheadline}
            </p>
          )}
          <h2 style={{ fontSize: `${2.4 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content, theme.fonts.headline), fontStyle: content.titleItalic ? "italic" : undefined, textDecoration: content.titleUnderline ? "underline" : undefined, color: content.titleColor ?? branding.textColor, lineHeight: 1.1, textShadow: makeOutlineShadow(content.titleOutline) }}>
            {title}
          </h2>
          <TitleAccentRule accentColor={accent} />
          {introText && (
            <p style={{ fontSize: `${0.66 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), color: content.introColor ?? "#6B7280", lineHeight: 1.6, marginTop: "0.5em", maxWidth: "78%", textShadow: makeOutlineShadow(content.introOutline) }}>
              {introText}
            </p>
          )}
        </div>

        {visibleRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "2.5%", alignContent: "start", minHeight: 0, overflow: "hidden" }}>
            {visibleRooms.map((room) => (
              <div key={room.id} style={{ display: "flex", border: cellBorder, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.5)" }}>
                {/* Icon cell */}
                {/* Icon cell — widens with the icon size so the divider moves in
                    and the text column shrinks instead of the icon overflowing. */}
                <div style={{ flexShrink: 0, width: `${2.2 * Math.max(0.7, room.illustrationSize ?? 1)}em`, display: "flex", alignItems: "center", justifyContent: "center", padding: "0.2em 0.1em", borderRight: cellBorder }}>
                  <RoomIcon room={room} color={accent} size={Math.round(26 * (room.illustrationSize ?? 1))} />
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, padding: "0.8em 1em" }}>
                  <p style={{ ...roomTitleStyle(room, content, branding), fontSize: `${0.9 * (room.titleSize ?? 1.0)}em`, marginBottom: "0.5em" }}>
                    {room.name}
                  </p>
                  {/* Hairline under the room name */}
                  <div style={{ height: 1, background: "rgba(26,35,50,0.18)", marginBottom: "0.6em" }} />
                  {room.description && (
                    <p style={{ ...roomDescStyle(room, content), fontSize: `${0.6 * (room.descriptionSize ?? 1.0)}em`, lineHeight: 1.6 }}>
                      {room.description}
                    </p>
                  )}
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
// Layout: Blueprint (dark graph-paper bg + line-art illustrations — "Zone 2 & 3")
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fallback isometric massing block when a room has no bespoke illustration.
 * A clean 3D blueprint-style placeholder (the real per-room art is AI-generated
 * via "regenerate illustrations").
 */
function HouseLineArt({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 140 120" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* top face */}
      <path d="M30 50 L70 30 L110 50 L70 70 Z" />
      {/* left wall */}
      <path d="M30 50 L30 86 L70 106 L70 70 Z" />
      {/* right wall */}
      <path d="M110 50 L110 86 L70 106 L70 70 Z" />
      {/* door (left wall) */}
      <path d="M44 67 L44 86 L56 92 L56 73 Z" />
      {/* window (right wall) */}
      <path d="M84 64 L84 74 L96 80 L96 70 Z" opacity={0.7} />
    </svg>
  );
}

function BlueprintLayout({ slide, branding, hasAiBackground }: Props) {
  const theme = useDeckTheme();
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const hasBg = hasAiBackground || slide.backgroundId != null;
  const accent = resolveAccent(content, branding);
  const title = resolveTitle(content, slide);
  const introText = content.introText ?? "";
  const visibleRooms = visibleRoomsOf(content);
  const displayRooms = visibleRooms.slice(0, 3);
  const ink = "rgba(245,247,250,0.92)";
  const muted = "rgba(245,247,250,0.72)";
  const gridLine = "rgba(255,255,255,0.06)";

  return (
    <div className="relative w-full h-full" style={{ background: hasBg ? "transparent" : theme.color.panel, overflow: "hidden" }}>
      {/* Blueprint graph-paper grid */}
      {!hasBg && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
      )}

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: SLIDE_PADDING.content }}>
        {/* Centered header */}
        <div style={{ flexShrink: 0, marginBottom: "3%", textAlign: "center" }}>
          <h2 style={{ fontSize: `${2.3 * (content.titleSize ?? 1.0)}em`, fontWeight: (content.titleBold ?? true) ? 700 : 400, fontFamily: resolveHeadlineFont(content, theme.fonts.headline), fontStyle: content.titleItalic ? "italic" : undefined, color: content.titleColor ?? "#FFFFFF", lineHeight: 1.1, margin: 0 }}>
            {title}
          </h2>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <TitleAccentRule accentColor={accent} />
          </div>
          {introText && (
            <p style={{ fontSize: `${0.6 * (content.introSize ?? 1.0)}em`, fontFamily: resolveBodyFont(content), color: content.introColor ?? muted, lineHeight: 1.55, marginTop: "0.4em", maxWidth: "72%", marginLeft: "auto", marginRight: "auto" }}>
              {introText}
            </p>
          )}
        </div>

        {displayRooms.length === 0 ? <NoRooms /> : (
          <div style={{ flex: 1, display: "flex", minHeight: 0, alignItems: "stretch" }}>
            {displayRooms.map((room, i) => (
              <div key={room.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "1% 3%", borderLeft: i > 0 ? `1px solid ${gridLine}` : undefined }}>
                {/* Illustration */}
                <div style={{ width: "70%", height: "42%", marginBottom: "5%", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${room.illustrationSize ?? 1})`, transformOrigin: "center" }}>
                  {room.illustrationUrl ? (
                    <span aria-hidden style={{ display: "inline-block", width: "100%", height: "100%", backgroundColor: ink, WebkitMaskImage: `url(${room.illustrationUrl})`, maskImage: `url(${room.illustrationUrl})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center", WebkitMaskSize: "contain", maskSize: "contain" }} />
                  ) : (
                    <HouseLineArt color={ink} />
                  )}
                </div>
                {/* Name */}
                <p style={{ fontSize: `${1.05 * (room.titleSize ?? 1.0)}em`, fontWeight: 700, fontFamily: resolveHeadlineFont(content), color: room.titleColor ?? accent, marginBottom: "0.5em" }}>
                  {room.name}
                </p>
                {/* Description */}
                {room.description && (
                  <p style={{ ...roomDescStyle(room, content, muted), fontSize: `${0.58 * (room.descriptionSize ?? 1.0)}em`, color: room.descriptionColor ?? muted, textAlign: "center", lineHeight: 1.65, maxWidth: "92%" }}>
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

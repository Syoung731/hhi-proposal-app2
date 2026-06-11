"use client";

/**
 * Leader-line annotation primitives — the "engineering callout" device from
 * the reference decks: a line that physically ties a callout card to a pin
 * on a photo, plan, or diagram. Shared by the Floor Plan and Craftsmanship
 * slides (and reusable anywhere else).
 *
 * Coordinates are percentages of the nearest positioned ancestor, so callers
 * lay the overlay over the same container that holds the pins and cards.
 */

/** Full-container SVG overlay drawing straight leader lines between % points. */
export function LeaderOverlay({
  lines,
  color,
  strokeWidth = 1.5,
}: {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  color: string;
  strokeWidth?: number;
}) {
  if (lines.length === 0) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** Numbered circular pin (orange disc, white numeral) centered on its point. */
export function NumberPin({
  x,
  y,
  number,
  color,
  scale = 1,
}: {
  x: number;
  y: number;
  number: number;
  color: string;
  scale?: number;
}) {
  const d = 1.5 * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        width: `${d}em`,
        height: `${d}em`,
        borderRadius: "50%",
        background: color,
        border: "2px solid #FFFFFF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#FFFFFF",
        fontSize: `${0.7 * scale}em`,
        fontWeight: 700,
        lineHeight: 1,
        zIndex: 3,
      }}
    >
      {number}
    </div>
  );
}

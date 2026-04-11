"use client";

/**
 * Reusable star rating component.
 * Renders filled, half, and empty stars as inline SVGs.
 *
 * Usage:
 *   <StarRating rating={4.5} size="md" color="#B8860B" />
 */

const SIZES = {
  sm: 14,
  md: 18,
  lg: 24,
} as const;

type StarSize = keyof typeof SIZES;

interface StarRatingProps {
  /** Rating value, 1–5. Supports decimals for partial stars. */
  rating: number;
  /** Render size preset. Default: "md". */
  size?: StarSize;
  /** Star fill color. Default: gold (#B8860B). */
  color?: string;
  /** Empty star color. Default: #D1D5DB. */
  emptyColor?: string;
}

function StarIcon({
  fill,
  px,
  color,
  emptyColor,
}: {
  fill: "full" | "half" | "empty";
  px: number;
  color: string;
  emptyColor: string;
}) {
  const id = `half-${Math.random().toString(36).slice(2, 7)}`;

  if (fill === "full") {
    return (
      <svg width={px} height={px} viewBox="0 0 24 24" fill={color} stroke="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }

  if (fill === "half") {
    return (
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="none">
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor={color} />
            <stop offset="50%" stopColor={emptyColor} />
          </linearGradient>
        </defs>
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={`url(#${id})`}
        />
      </svg>
    );
  }

  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill={emptyColor} stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function StarRating({
  rating,
  size = "md",
  color = "#B8860B",
  emptyColor = "#D1D5DB",
}: StarRatingProps) {
  const px = SIZES[size];
  const clamped = Math.max(0, Math.min(5, rating));

  return (
    <div style={{ display: "inline-flex", gap: px * 0.1, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill: "full" | "half" | "empty" =
          clamped >= star ? "full" : clamped >= star - 0.5 ? "half" : "empty";
        return (
          <StarIcon key={star} fill={fill} px={px} color={color} emptyColor={emptyColor} />
        );
      })}
    </div>
  );
}

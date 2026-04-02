"use client";

/**
 * Orange horizontal rule used directly beneath every slide headline.
 * The most recognizable single visual element of the HHI proposal style.
 *
 * Usage:
 *   <TitleAccentRule accentColor={branding.accentColor} />
 *
 * Defaults to #F47216 so it renders correctly even when branding is unavailable.
 */
export function TitleAccentRule({
  accentColor = "#F47216",
  marginTop = "0.45em",
  marginBottom = "0.65em",
  width = "3.5em",
}: {
  accentColor?: string;
  marginTop?: string | number;
  marginBottom?: string | number;
  width?: string | number;
}) {
  return (
    <div
      style={{
        height: 2,
        width,
        background: accentColor,
        borderRadius: 1,
        marginTop,
        marginBottom,
        flexShrink: 0,
      }}
    />
  );
}

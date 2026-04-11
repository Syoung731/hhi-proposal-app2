"use client";

import type { DeckBranding } from "@/app/lib/deck/types";

interface BrandingColorRowProps {
  value: string | null | undefined;
  defaultVal: string;
  branding: DeckBranding;
  onChange: (v: string) => void;
  onReset?: () => void;
}

/** Branding color swatches derived from DeckBranding fields. */
function getBrandingSwatches(branding: DeckBranding) {
  const swatches: { label: string; color: string }[] = [];
  if (branding.accentColor) swatches.push({ label: "Accent", color: branding.accentColor });
  if (branding.textColor) swatches.push({ label: "Primary", color: branding.textColor });
  // Standard palette always included
  swatches.push({ label: "Navy", color: "#1B2A4A" });
  swatches.push({ label: "Gold", color: "#B8860B" });
  swatches.push({ label: "White", color: "#FFFFFF" });
  swatches.push({ label: "Black", color: "#111827" });
  swatches.push({ label: "Light", color: "#F5F0E8" });
  // Deduplicate by color value
  const seen = new Set<string>();
  return swatches.filter((s) => {
    const key = s.color.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Color picker row with branding swatches + hex input + reset.
 * Shows the project's branding colors as quick-pick swatches,
 * followed by a standard color input for custom values.
 */
export function BrandingColorRow({
  value,
  defaultVal,
  branding,
  onChange,
  onReset,
}: BrandingColorRowProps) {
  const swatches = getBrandingSwatches(branding);
  const current = value ?? defaultVal;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Branding swatches */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {swatches.map((s) => (
          <button
            key={s.color}
            title={s.label}
            onClick={() => onChange(s.color)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: s.color,
              border:
                current.toLowerCase() === s.color.toLowerCase()
                  ? "2px solid #1F2937"
                  : s.color.toLowerCase() === "#ffffff"
                    ? "1px solid #D1D5DB"
                    : "1px solid transparent",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      {/* Hex color picker + value display + reset */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 28,
            border: "1px solid #D1D5DB",
            borderRadius: 4,
            cursor: "pointer",
            padding: 2,
            background: "none",
          }}
        />
        <span
          style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}
        >
          {value ?? "(default)"}
        </span>
        {value && onReset && (
          <button
            onClick={onReset}
            style={{
              fontSize: 10,
              color: "#9CA3AF",
              background: "none",
              border: "none",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

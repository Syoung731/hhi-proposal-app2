"use client";

import React from "react";

/**
 * Hand-authored DUOTONE line icons — crisp two-tone SVGs (primary navy linework
 * + selective orange accents) for the deck's process / journey slides. Vectors
 * stay sharp at any size, render instantly, and look consistent — unlike
 * AI-generated PNGs which are unreliable at icon scale.
 *
 * Each icon is drawn on a 24×24 grid, Lucide-style (no fills except small accent
 * marks). `ink` drives the main strokes; `accent` drives the highlight strokes/
 * dots so the pair reads as a deliberate two-tone icon.
 */

export const DUOTONE_ICONS: { key: string; label: string }[] = [
  { key: "measure", label: "Measure" },
  { key: "feasibility", label: "Feasibility" },
  { key: "documentation", label: "Plans" },
  { key: "selections", label: "Selections" },
  { key: "contract", label: "Contract" },
  { key: "permit", label: "Permit" },
  { key: "shield", label: "Shield" },
  { key: "systems", label: "Systems" },
  { key: "schedule", label: "Schedule" },
  { key: "handover", label: "Handover" },
  { key: "home", label: "Home" },
];

export function DuotoneIcon({
  name,
  size = "1.5em",
  ink,
  accent,
  strokeWidth = 1.7,
}: {
  name: string | null | undefined;
  size?: string;
  ink: string;
  accent: string;
  strokeWidth?: number;
}) {
  const gray = "#DAD7D0"; // soft warm gray fill for body shapes (depth)
  const paths: Record<string, React.ReactNode> = {
    // As-built / measure — floor-plan sheet + orange dimension line.
    measure: (
      <>
        <rect fill={gray} stroke={ink} x="3.5" y="3" width="13" height="18" rx="1.5" />
        <path stroke={ink} d="M7 8h5v5h3" />
        <path stroke={accent} d="M6.5 18h7" />
        <path stroke={accent} d="M6.5 16.9v2.2M13.5 16.9v2.2" />
      </>
    ),
    // Feasibility study — document + orange-ringed magnifier with a check.
    feasibility: (
      <>
        <rect fill={gray} stroke={ink} x="3" y="3" width="10.5" height="15" rx="1.5" />
        <path stroke={ink} d="M6 7.5h5M6 10.5h4" />
        <circle fill="#FFFFFF" stroke={accent} cx="15.3" cy="14" r="4.6" />
        <path stroke={ink} d="M18.7 17.4 21.5 20.2" />
        <path stroke={accent} d="M13.2 14l1.4 1.4 2.6-2.9" />
      </>
    ),
    // Construction documentation — two stacked sheets, orange plan lines.
    documentation: (
      <>
        <rect fill={gray} stroke={ink} x="7" y="3.5" width="12" height="15" rx="1.5" />
        <rect fill="#FFFFFF" stroke={ink} x="3" y="6.5" width="12" height="14.5" rx="1.5" />
        <path stroke={accent} d="M6 11h6M6 14h6M6 17h3.5" />
      </>
    ),
    // Specifications & selections — filled palette with one orange swatch.
    selections: (
      <>
        <path fill={gray} stroke={ink} d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 2.5-2.5 1.5 1.5 0 0 1 1.5-1.5H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8Z" />
        <circle fill={ink} stroke="none" cx="7.5" cy="11.5" r="1" />
        <circle fill={ink} stroke="none" cx="11" cy="7.5" r="1" />
        <circle fill={accent} stroke="none" cx="15.6" cy="9.6" r="1.3" />
      </>
    ),
    // Final budget & fixed-price contract — signed sheet + orange check seal.
    contract: (
      <>
        <rect fill={gray} stroke={ink} x="4" y="3" width="12.5" height="18" rx="1.5" />
        <path stroke={ink} d="M7 8.5h6.5" />
        <path stroke={ink} d="M7 12c1-1.3 2 1.3 3 0s2 1.3 3 0" />
        <circle fill={accent} stroke="none" cx="17" cy="17.5" r="3.7" />
        <path stroke="#FFFFFF" strokeWidth={1.6} d="M15.4 17.6 16.6 18.8 18.8 16.4" />
      </>
    ),
    // Permits & approvals — clipboard with orange check.
    permit: (
      <>
        <path stroke={ink} d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
        <rect stroke={ink} x="9" y="2" width="6" height="4" rx="1" />
        <path stroke={accent} d="M9 13l2 2 4-4" />
      </>
    ),
    // Trust / guarantee — shield with orange check.
    shield: (
      <>
        <path stroke={ink} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path stroke={accent} d="M9 12l2 2 4-4" />
      </>
    ),
    // Systems / coordination — gear with orange hub.
    systems: (
      <>
        <circle stroke={ink} cx="12" cy="12" r="3.2" />
        <path stroke={ink} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
        <circle fill={accent} stroke={accent} cx="12" cy="12" r="1" />
      </>
    ),
    // Schedule — calendar with orange marked day.
    schedule: (
      <>
        <rect stroke={ink} x="4" y="5" width="16" height="16" rx="2" />
        <path stroke={ink} d="M4 9.5h16M8 3v4M16 3v4" />
        <circle fill={accent} stroke={accent} cx="12" cy="14.5" r="1.4" />
      </>
    ),
    // Handover — key, orange bit.
    handover: (
      <>
        <circle stroke={ink} cx="8" cy="16" r="4" />
        <path stroke={ink} d="M11 13l9-9" />
        <path stroke={accent} d="M16 8l2 2M14 10l2 2" />
      </>
    ),
    // Home.
    home: (
      <>
        <path stroke={ink} d="M3 11l9-7 9 7M5 10v10h14V10" />
        <path stroke={accent} d="M10 20v-5h4v5" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name ?? ""] ?? paths.documentation}
    </svg>
  );
}

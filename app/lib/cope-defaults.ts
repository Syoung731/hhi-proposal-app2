/**
 * Global COPE (Cost of Project Execution) defaults — client-safe constants and types.
 *
 * This file contains NO server imports (no prisma, no DB).
 * Safe to import from "use client" components.
 *
 * For the DB accessor, see cope-defaults.server.ts.
 */

import type { CopeItem, CopePageLayoutKey } from "./deck/types";

// ─── Hardcoded HHI defaults (immutable fallback) ────────────────────────────

export const HHI_DEFAULT_COPE_ITEMS: CopeItem[] = [
  {
    id: "permits",
    icon: "FileCheck",
    title: "Permits & Approvals",
    description: "All permitting, HOA submissions, and inspection coordination handled by our team.",
    bullets: [
      "Building permit application and filing",
      "HOA and ARB submission management",
      "Inspection scheduling and sign-off coordination",
    ],
    calloutLabel: "Permits",
  },
  {
    id: "site-protection",
    icon: "Shield",
    title: "Site Protection",
    description: "Your home is protected throughout the entire build process.",
    bullets: [
      "Floor, wall, and furniture protection throughout build",
      "Daily cleanup and debris removal",
      "Dust containment barriers where needed",
    ],
    calloutLabel: "Protection",
  },
  {
    id: "supervision",
    icon: "ClipboardList",
    title: "Project Supervision",
    description: "Dedicated on-site management with regular homeowner communication.",
    bullets: [
      "Dedicated project manager on-site daily",
      "Trade scheduling and coordination",
      "Weekly progress updates to homeowner",
    ],
    calloutLabel: "Supervision",
  },
  {
    id: "connectivity",
    icon: "Zap",
    title: "Connectivity & Systems",
    description: "Full coordination of mechanical, electrical, and technology systems.",
    bullets: [
      "HVAC, electrical, and plumbing coordination",
      "Smart home and AV rough-in oversight",
      "MEP engineer consultation when required",
    ],
    calloutLabel: "Systems",
  },
  {
    id: "compliance",
    icon: "CheckCircle",
    title: "Final Compliance",
    description: "Complete close-out including inspections, punch list, and warranty documentation.",
    bullets: [
      "Final inspections and certificate of occupancy",
      "Punch list completion and sign-off",
      "Warranty documentation delivery",
    ],
    calloutLabel: "Compliance",
  },
];

// ─── Settings shape ──────────────────────────────────────────────────────────

export interface GlobalCopeSettings {
  defaultItems: CopeItem[];
  defaultLayout: CopePageLayoutKey;
  defaultSectionLabel: string;
  defaultHeadline: string;
  defaultSubheadline?: string | null;
}

export const HHI_COPE_DEFAULTS: GlobalCopeSettings = {
  defaultItems: HHI_DEFAULT_COPE_ITEMS,
  defaultLayout: "icon-columns",
  defaultSectionLabel: "WHAT\u2019S INCLUDED",
  defaultHeadline: "The Cost of Project Execution",
  defaultSubheadline: null,
};

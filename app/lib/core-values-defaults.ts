/**
 * Global Core Values defaults — client-safe constants and types.
 *
 * This file contains NO server imports (no prisma, no DB).
 * Safe to import from "use client" components.
 *
 * For the DB accessor, see core-values-defaults.server.ts.
 */

import type { CoreValue, CoreValuesLayoutKey } from "./deck/types";

// ─── Hardcoded HHI defaults (immutable fallback) ────────────────────────────

export const HHI_DEFAULT_CORE_VALUES: CoreValue[] = [
  {
    id: "ownership",
    name: "OWNERSHIP",
    icon: "Shield",
    descriptor: "We treat your home like our own.",
    description:
      "We take full responsibility for every decision, every trade, and every outcome. When something isn\u2019t right, we fix it \u2014 no deflection, no excuses.",
  },
  {
    id: "ethics",
    name: "ETHICS",
    icon: "Scale",
    descriptor: "Transparency at every step.",
    description:
      "Honest pricing, honest timelines, honest conversations. We\u2019d rather have a hard talk now than a bad outcome later.",
  },
  {
    id: "communication",
    name: "COMMUNICATION",
    icon: "MessageSquare",
    descriptor: "You\u2019re never left wondering.",
    description:
      "Weekly updates, documented decisions, and a single point of contact. Clear communication is how we protect the relationship.",
  },
  {
    id: "innovation",
    name: "INNOVATION",
    icon: "Lightbulb",
    descriptor: "Smarter solutions, better results.",
    description:
      "We combine proven techniques with modern planning and technology to deliver quality that holds up for decades.",
  },
  {
    id: "collaboration",
    name: "COLLABORATION",
    icon: "Users",
    descriptor: "Your vision, our expertise.",
    description:
      "We work with you, not around you. From the first meeting to final walkthrough, your goals drive every decision we make.",
  },
];

// ─── Settings shape ──────────────────────────────────────────────────────────

export interface GlobalCoreValuesSettings {
  defaultValues: CoreValue[];
  defaultLayout: CoreValuesLayoutKey;
  defaultSectionLabel: string;
  defaultHeadline: string;
}

export const HHI_DEFAULTS: GlobalCoreValuesSettings = {
  defaultValues: HHI_DEFAULT_CORE_VALUES,
  defaultLayout: "cards-row",
  defaultSectionLabel: "WHO WE ARE",
  defaultHeadline: "Built on a Foundation of Values",
};

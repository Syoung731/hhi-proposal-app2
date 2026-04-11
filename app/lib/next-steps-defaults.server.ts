/**
 * Server-only DB accessor for global next steps settings.
 * Imports prisma — must NOT be imported from "use client" components.
 */

import { prisma } from "@/app/lib/prisma";
import type { NextStep, NextStepsLayoutKey } from "./deck/types";
import { HHI_NEXT_STEPS_DEFAULTS } from "./next-steps-defaults";
import type { GlobalNextStepsSettings } from "./next-steps-defaults";

export type { GlobalNextStepsSettings };
export { HHI_NEXT_STEPS_DEFAULTS };

/** Read global next steps defaults. Falls back to HHI defaults if not configured. */
export async function getNextStepsDefaults(): Promise<GlobalNextStepsSettings> {
  let settings: { nextStepsDefaultsJson: unknown } | null = null;
  try {
    settings = await prisma.companySettings.findFirst({
      select: { nextStepsDefaultsJson: true },
    });
  } catch {
    // Column may not exist yet if migration hasn't been applied — fall back gracefully
    return HHI_NEXT_STEPS_DEFAULTS;
  }
  if (!settings?.nextStepsDefaultsJson) return HHI_NEXT_STEPS_DEFAULTS;

  const json = settings.nextStepsDefaultsJson as Record<string, unknown>;
  return {
    defaultSteps: Array.isArray(json.defaultSteps) && json.defaultSteps.length > 0
      ? (json.defaultSteps as NextStep[])
      : HHI_NEXT_STEPS_DEFAULTS.defaultSteps,
    defaultLayout: (typeof json.defaultLayout === "string" ? json.defaultLayout : HHI_NEXT_STEPS_DEFAULTS.defaultLayout) as NextStepsLayoutKey,
    defaultSectionLabel: typeof json.defaultSectionLabel === "string" ? json.defaultSectionLabel : HHI_NEXT_STEPS_DEFAULTS.defaultSectionLabel,
    defaultHeadline: typeof json.defaultHeadline === "string" ? json.defaultHeadline : HHI_NEXT_STEPS_DEFAULTS.defaultHeadline,
    defaultContactEmail: typeof json.defaultContactEmail === "string" ? json.defaultContactEmail : HHI_NEXT_STEPS_DEFAULTS.defaultContactEmail,
    defaultContactPhone: typeof json.defaultContactPhone === "string" ? json.defaultContactPhone : HHI_NEXT_STEPS_DEFAULTS.defaultContactPhone,
  };
}

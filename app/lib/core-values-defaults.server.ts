/**
 * Server-only DB accessor for global core values settings.
 * Imports prisma — must NOT be imported from "use client" components.
 */

import { prisma } from "@/app/lib/prisma";
import type { CoreValue, CoreValuesLayoutKey } from "./deck/types";
import { HHI_DEFAULTS } from "./core-values-defaults";
import type { GlobalCoreValuesSettings } from "./core-values-defaults";

export type { GlobalCoreValuesSettings };
export { HHI_DEFAULTS };

/** Read global core values defaults. Falls back to HHI defaults if not configured. */
export async function getCoreValuesDefaults(): Promise<GlobalCoreValuesSettings> {
  let settings: { coreValuesDefaultsJson: unknown } | null = null;
  try {
    settings = await prisma.companySettings.findFirst({
      select: { coreValuesDefaultsJson: true },
    });
  } catch {
    // Column may not exist yet if migration hasn't been applied — fall back gracefully
    return HHI_DEFAULTS;
  }
  if (!settings?.coreValuesDefaultsJson) return HHI_DEFAULTS;

  const json = settings.coreValuesDefaultsJson as Record<string, unknown>;
  return {
    defaultValues: Array.isArray(json.defaultValues) && json.defaultValues.length > 0
      ? (json.defaultValues as CoreValue[])
      : HHI_DEFAULTS.defaultValues,
    defaultLayout: (typeof json.defaultLayout === "string" ? json.defaultLayout : HHI_DEFAULTS.defaultLayout) as CoreValuesLayoutKey,
    defaultSectionLabel: typeof json.defaultSectionLabel === "string" ? json.defaultSectionLabel : HHI_DEFAULTS.defaultSectionLabel,
    defaultHeadline: typeof json.defaultHeadline === "string" ? json.defaultHeadline : HHI_DEFAULTS.defaultHeadline,
  };
}

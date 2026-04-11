/**
 * Server-only DB accessor for global COPE settings.
 * Imports prisma — must NOT be imported from "use client" components.
 */

import { prisma } from "@/app/lib/prisma";
import type { CopeItem, CopePageLayoutKey } from "./deck/types";
import { HHI_COPE_DEFAULTS } from "./cope-defaults";
import type { GlobalCopeSettings } from "./cope-defaults";

export type { GlobalCopeSettings };
export { HHI_COPE_DEFAULTS };

/** Read global COPE defaults. Falls back to HHI defaults if not configured. */
export async function getCopeDefaults(): Promise<GlobalCopeSettings> {
  let settings: { copeDefaultsJson: unknown } | null = null;
  try {
    settings = await prisma.companySettings.findFirst({
      select: { copeDefaultsJson: true },
    });
  } catch {
    // Column may not exist yet if migration hasn't been applied — fall back gracefully
    return HHI_COPE_DEFAULTS;
  }
  if (!settings?.copeDefaultsJson) return HHI_COPE_DEFAULTS;

  const json = settings.copeDefaultsJson as Record<string, unknown>;
  return {
    defaultItems: Array.isArray(json.defaultItems) && json.defaultItems.length > 0
      ? (json.defaultItems as CopeItem[])
      : HHI_COPE_DEFAULTS.defaultItems,
    defaultLayout: (typeof json.defaultLayout === "string" ? json.defaultLayout : HHI_COPE_DEFAULTS.defaultLayout) as CopePageLayoutKey,
    defaultSectionLabel: typeof json.defaultSectionLabel === "string" ? json.defaultSectionLabel : HHI_COPE_DEFAULTS.defaultSectionLabel,
    defaultHeadline: typeof json.defaultHeadline === "string" ? json.defaultHeadline : HHI_COPE_DEFAULTS.defaultHeadline,
    defaultSubheadline: typeof json.defaultSubheadline === "string" ? json.defaultSubheadline : null,
  };
}

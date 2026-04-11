/**
 * Server-only DB accessor for global design-build advantage settings.
 * Imports prisma — must NOT be imported from "use client" components.
 */

import { prisma } from "@/app/lib/prisma";
import type {
  DesignBuildPillar,
  DesignBuildGuarantee,
  DesignBuildDiagramNode,
  DesignBuildSupportColumn,
  DesignBuildAdvantageLayoutKey,
} from "./deck/types";
import { HHI_DESIGN_BUILD_DEFAULTS } from "./design-build-defaults";
import type { GlobalDesignBuildSettings } from "./design-build-defaults";

export type { GlobalDesignBuildSettings };
export { HHI_DESIGN_BUILD_DEFAULTS };

/** Read global design-build defaults. Falls back to HHI defaults if not configured. */
export async function getDesignBuildDefaults(): Promise<GlobalDesignBuildSettings> {
  let settings: { designBuildDefaultsJson: unknown } | null = null;
  try {
    settings = await prisma.companySettings.findFirst({
      select: { designBuildDefaultsJson: true },
    });
  } catch {
    // Column may not exist yet if migration hasn't been applied — fall back gracefully
    return HHI_DESIGN_BUILD_DEFAULTS;
  }
  if (!settings?.designBuildDefaultsJson) return HHI_DESIGN_BUILD_DEFAULTS;

  const json = settings.designBuildDefaultsJson as Record<string, unknown>;
  return {
    defaultLayout: (typeof json.defaultLayout === "string" ? json.defaultLayout : HHI_DESIGN_BUILD_DEFAULTS.defaultLayout) as DesignBuildAdvantageLayoutKey,
    defaultHeadline: typeof json.defaultHeadline === "string" ? json.defaultHeadline : HHI_DESIGN_BUILD_DEFAULTS.defaultHeadline,
    defaultPillars: Array.isArray(json.defaultPillars) && json.defaultPillars.length > 0
      ? (json.defaultPillars as DesignBuildPillar[])
      : HHI_DESIGN_BUILD_DEFAULTS.defaultPillars,
    defaultGuarantees: Array.isArray(json.defaultGuarantees) && json.defaultGuarantees.length > 0
      ? (json.defaultGuarantees as DesignBuildGuarantee[])
      : HHI_DESIGN_BUILD_DEFAULTS.defaultGuarantees,
    defaultDiagramNodes: Array.isArray(json.defaultDiagramNodes) && json.defaultDiagramNodes.length > 0
      ? (json.defaultDiagramNodes as DesignBuildDiagramNode[])
      : HHI_DESIGN_BUILD_DEFAULTS.defaultDiagramNodes,
    defaultSupportColumns: Array.isArray(json.defaultSupportColumns) && json.defaultSupportColumns.length > 0
      ? (json.defaultSupportColumns as DesignBuildSupportColumn[])
      : HHI_DESIGN_BUILD_DEFAULTS.defaultSupportColumns,
  };
}

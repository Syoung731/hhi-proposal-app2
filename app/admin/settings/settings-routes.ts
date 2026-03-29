/**
 * Path-based settings routes. Each menu item maps to one path.
 * Used for validation and nav links.
 */
export const SETTINGS_BASE = "/admin/settings" as const;

export const SETTINGS_TAB_SLUGS = [
  "company-profile",
  "branding",
  "proposal-defaults",
  "pricing-profiles",
  "section-types",
  "style-presets",
  "photo-library",
  "value-pillars",
  "employees",
  "integrations",
  "dev-integrations",
] as const;

export type SettingsTabSlug = (typeof SETTINGS_TAB_SLUGS)[number];

/** Tabs that are rendered by the shared [tab] page (same data loading). */
export const SHARED_SETTINGS_TABS: readonly SettingsTabSlug[] = [
  "company-profile",
  "branding",
  "proposal-defaults",
  "pricing-profiles",
  "section-types",
  "style-presets",
  "employees",
  "integrations",
];

export function isSharedSettingsTab(tab: string): tab is SettingsTabSlug {
  return (SHARED_SETTINGS_TABS as readonly string[]).includes(tab);
}

export function settingsTabPath(slug: string): string {
  return `${SETTINGS_BASE}/${slug}`;
}

"use client";

import { useState } from "react";
import { CompanyProfileTab } from "./company-profile-tab";
import { BrandingTab } from "./branding-tab";
import { ProposalDefaultsTab } from "./proposal-defaults-tab";
import { RoomTypesTab } from "./room-types-tab";
import { SectionTypesTab } from "./section-types-tab";
import { StylePresetsTab, type StylePresetForUI } from "./style-presets-tab";
import { IntegrationsTab } from "./integrations-tab";
import { EmployeesTab } from "./employees-tab";

const DEFAULT_TAB = "company-profile";

export const SETTINGS_TABS: { slug: string; label: string }[] = [
  { slug: "company-profile", label: "Company Profile" },
  { slug: "branding", label: "Branding" },
  { slug: "proposal-defaults", label: "Proposal Defaults" },
  { slug: "pricing-profiles", label: "Pricing Profiles" },
  { slug: "section-types", label: "Section Types" },
  { slug: "style-presets", label: "Style Presets" },
  { slug: "photo-library", label: "Photo Library" },
  { slug: "value-pillars", label: "Value Pillars" },
  { slug: "employees", label: "Employees" },
  { slug: "integrations", label: "Integrations" },
  { slug: "ai-pricing", label: "AI Pricing" },
];

export type BrandIconForUI = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string;
  imageKey: string;
  tags: string[];
  category: string | null;
  isActive: boolean;
};

export type BrandBackgroundForUI = {
  id: string;
  slug: string;
  name: string;
  baseColorHex: string | null;
  overlayImageUrl: string | null;
  overlayImageKey: string | null;
  overlayIconId: string | null;
  overlayOpacity: number;
  overlayScale: number;
  overlaySpacing: number;
  overlayRotation: number;
  previewImageUrl: string | null;
  previewImageKey: string | null;
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
  tags: string[];
  /** Generation mode used when this background was AI-generated. Null for manually configured records. */
  generationMode: string | null;
  /** Style preset used during generation. Only set for "slide-visual" mode. */
  stylePreset: string | null;
  /** Composition seed used during slide-visual generation (e.g. "left-weighted"). */
  compositionSeed?: string | null;
  /** Cached text zone suggestion derived from composition seed or AI vision analysis. */
  textZoneSuggestion?: import("@/app/lib/deck/types").TextZoneSuggestion | null;
};

export type CompanySettingsForUI = {
  id: string;
  companyName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string | null;
  primaryColorHex: string | null;
  textColorHex: string | null;
  defaultProposalDisclaimer: string;
  defaultTimelineNote: string | null;
  integrationsJson: unknown;
  roomTypeLowPct: number | null;
  roomTypeHighPct: number | null;
  anthropicModel: string | null;
  geminiImageModel: string | null;
  geminiImageGenModel: string | null;
};

export type RoomTypeForUI = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  exterior: boolean;
  pricePerSqFtLow: number | null;
  pricePerSqFtTarget: number | null;
  pricePerSqFtHigh: number | null;
};

export type EmployeeForUI = {
  id: string;
  firstName: string;
  lastName: string;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  sortOrder: number;
};

export type SectionTypeForUI = {
  id: string;
  name: string;
  category: string;
  defaultMeasurementMode: string;
  defaultEstimateUnit: string;
  customUnitLabel: string | null;
  pricingBasis: string;
  priceLow: number | null;
  priceTarget: number | null;
  priceHigh: number | null;
};

export type IconLibraryContext = {
  companyName: string;
  websiteUrl: string | null;
  effectiveAccent: string;
  effectiveText: string;
};

type Props = {
  settings: CompanySettingsForUI;
  sectionTypes: SectionTypeForUI[];
  canSeedSectionTypes: boolean;
  stylePresets: StylePresetForUI[];
  employees: EmployeeForUI[];
  currentUserIsAdmin: boolean;
  brandIcons?: BrandIconForUI[];
  brandBackgrounds?: BrandBackgroundForUI[];
  iconLibraryContext?: IconLibraryContext;
  openIconLibrary?: boolean;
  openBackgroundLibrary?: boolean;
  /** When true, render only the content card (no sidebar); used when layout provides the nav. */
  embedInLayout?: boolean;
  /** Current tab when using path-based routing (required when embedInLayout). */
  activeTab?: string;
};

export function SettingsTabs({
  settings,
  sectionTypes,
  canSeedSectionTypes,
  stylePresets,
  employees,
  currentUserIsAdmin,
  brandIcons = [],
  brandBackgrounds = [],
  iconLibraryContext,
  openIconLibrary: initialOpenIconLibrary = false,
  openBackgroundLibrary: initialOpenBackgroundLibrary = false,
  embedInLayout = false,
  activeTab,
}: Props) {
  const [iconLibraryOpen, setIconLibraryOpen] = useState(initialOpenIconLibrary);
  const [backgroundLibraryOpen, setBackgroundLibraryOpen] = useState(initialOpenBackgroundLibrary);
  const currentTab = (embedInLayout && activeTab) ? activeTab : DEFAULT_TAB;
  const currentLabel = SETTINGS_TABS.find((t) => t.slug === currentTab)?.label ?? currentTab;

  const contentCard = (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Company Setup
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {currentLabel}
            </p>
          </header>
          {currentTab === "company-profile" && (
            <CompanyProfileTab settings={settings} />
          )}
          {currentTab === "branding" && (
            <BrandingTab
              settings={settings}
              brandIcons={brandIcons}
              brandBackgrounds={brandBackgrounds}
              iconLibraryContext={iconLibraryContext}
              iconLibraryOpen={iconLibraryOpen}
              onOpenIconLibrary={() => setIconLibraryOpen(true)}
              onCloseIconLibrary={() => {
              setIconLibraryOpen(false);
              if (typeof window !== "undefined") {
                const u = new URL(window.location.href);
                u.searchParams.delete("openIconLibrary");
                window.history.replaceState(null, "", u.pathname);
              }
            }}
              backgroundLibraryOpen={backgroundLibraryOpen}
              onOpenBackgroundLibrary={() => setBackgroundLibraryOpen(true)}
              onCloseBackgroundLibrary={() => {
                setBackgroundLibraryOpen(false);
                if (typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.delete("openBackgroundLibrary");
                  window.history.replaceState(null, "", u.pathname);
                }
              }}
            />
          )}
          {currentTab === "proposal-defaults" && (
            <ProposalDefaultsTab settings={settings} />
          )}
          {currentTab === "pricing-profiles" && (
            <RoomTypesTab
              sectionTypes={sectionTypes}
              roomTypeLowPct={settings.roomTypeLowPct}
              roomTypeHighPct={settings.roomTypeHighPct}
            />
          )}
          {currentTab === "section-types" && (
            <SectionTypesTab
              sectionTypes={sectionTypes}
              canSeed={canSeedSectionTypes}
            />
          )}
          {currentTab === "style-presets" && (
            <StylePresetsTab stylePresets={stylePresets} />
          )}
          {currentTab === "employees" && (
            <EmployeesTab
              employees={employees}
              currentUserIsAdmin={currentUserIsAdmin}
            />
          )}
          {currentTab === "integrations" && (
            <IntegrationsTab settings={settings} />
          )}
        </div>
  );

  return contentCard;
}

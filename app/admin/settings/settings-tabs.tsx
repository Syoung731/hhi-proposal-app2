"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CompanyProfileTab } from "./company-profile-tab";
import { BrandingTab } from "./branding-tab";
import { ProposalDefaultsTab } from "./proposal-defaults-tab";
import { RoomTypesTab } from "./room-types-tab";
import { SectionTypesTab } from "./section-types-tab";
import { StylePresetsTab, type StylePresetForUI } from "./style-presets-tab";
import { IntegrationsTab } from "./integrations-tab";
import { EmployeesTab } from "./employees-tab";

const DEFAULT_TAB = "company-profile";

const TABS: { slug: string; label: string; href?: string }[] = [
  { slug: "company-profile", label: "Company Profile" },
  { slug: "branding", label: "Branding" },
  { slug: "proposal-defaults", label: "Proposal Defaults" },
  { slug: "pricing-profiles", label: "Pricing Profiles" },
  { slug: "section-types", label: "Section Types" },
  { slug: "style-presets", label: "Style Presets" },
  { slug: "photo-library", label: "Photo Library", href: "/admin/settings/photo-library" },
  { slug: "employees", label: "Employees" },
  { slug: "integrations", label: "Integrations" },
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
}: Props) {
  const [currentTab, setCurrentTab] = useState<string>(DEFAULT_TAB);
  const [iconLibraryOpen, setIconLibraryOpen] = useState(initialOpenIconLibrary);
  const [backgroundLibraryOpen, setBackgroundLibraryOpen] = useState(initialOpenBackgroundLibrary);
  const currentLabel = TABS.find((t) => t.slug === currentTab)?.label ?? currentTab;

  useEffect(() => {
    const validSlugs = new Set(TABS.map((t) => t.slug));

    const applyHash = () => {
      if (typeof window === "undefined") return;
      const raw = window.location.hash;
      if (!raw) {
        setCurrentTab(DEFAULT_TAB);
        return;
      }
      const hash = raw.replace(/^#/, "");
      if (validSlugs.has(hash)) {
        setCurrentTab(hash);
      } else {
        setCurrentTab(DEFAULT_TAB);
      }
    };

    applyHash();

    const handleHashChange = () => {
      applyHash();
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <div className="flex gap-8">
      <aside className="w-64 shrink-0">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Company Setup
          </p>
          <nav className="space-y-0.5">
            {TABS.map(({ slug, label, href }) => {
              const isLink = href != null;
              const isActive = !isLink && currentTab === slug;
              const linkClass =
                "block w-full rounded-lg px-3 py-3 text-left text-sm transition-colors " +
                (isActive
                  ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100");
              if (href) {
                return (
                  <Link key={slug} href={href} className={linkClass}>
                    {label}
                  </Link>
                );
              }
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    setCurrentTab(slug);
                    if (typeof window !== "undefined") {
                      window.history.replaceState(null, "", `#${slug}`);
                    }
                  }}
                  className={linkClass}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 w-full flex-1">
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
                window.history.replaceState(null, "", u.pathname + (u.hash || "#branding"));
              }
            }}
              backgroundLibraryOpen={backgroundLibraryOpen}
              onOpenBackgroundLibrary={() => setBackgroundLibraryOpen(true)}
              onCloseBackgroundLibrary={() => {
                setBackgroundLibraryOpen(false);
                if (typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.delete("openBackgroundLibrary");
                  window.history.replaceState(null, "", u.pathname + (u.hash || "#branding"));
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
      </div>
    </div>
  );
}

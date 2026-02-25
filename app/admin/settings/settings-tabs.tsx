"use client";

import { useState } from "react";
import { CompanyProfileTab } from "./company-profile-tab";
import { BrandingTab } from "./branding-tab";
import { ProposalDefaultsTab } from "./proposal-defaults-tab";
import { RoomTypesTab } from "./room-types-tab";
import { StylePresetsTab, type StylePresetForUI } from "./style-presets-tab";
import { IntegrationsTab } from "./integrations-tab";
import { EmployeesTab } from "./employees-tab";

const TABS = [
  { slug: "company", label: "Company Profile" },
  { slug: "branding", label: "Branding" },
  { slug: "defaults", label: "Proposal Defaults" },
  { slug: "room-types", label: "Room Types" },
  { slug: "style-presets", label: "Style Presets" },
  { slug: "employees", label: "Employees" },
  { slug: "integrations", label: "Integrations" },
] as const;

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
  logoUrl: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string | null;
  primaryColorHex: string | null;
  textColorHex: string | null;
  defaultProposalDisclaimer: string;
  defaultTimelineNote: string | null;
  integrationsJson: unknown;
};

export type RoomTypeForUI = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  exterior: boolean;
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

type Props = {
  settings: CompanySettingsForUI;
  roomTypes: RoomTypeForUI[];
  stylePresets: StylePresetForUI[];
  employees: EmployeeForUI[];
  currentUserIsAdmin: boolean;
};

export function SettingsTabs({ settings, roomTypes, stylePresets, employees, currentUserIsAdmin }: Props) {
  const [currentTab, setCurrentTab] = useState<string>("company");
  const currentLabel = TABS.find((t) => t.slug === currentTab)?.label ?? currentTab;

  return (
    <div className="flex gap-8">
      <aside className="w-64 shrink-0">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Company Setup
          </p>
          <nav className="space-y-0.5">
            {TABS.map(({ slug, label }) => {
              const isActive = currentTab === slug;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setCurrentTab(slug)}
                  className={
                    "block w-full rounded-lg px-3 py-3 text-left text-sm transition-colors " +
                    (isActive
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100")
                  }
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
          {currentTab === "company" && (
            <CompanyProfileTab settings={settings} />
          )}
          {currentTab === "branding" && <BrandingTab settings={settings} />}
          {currentTab === "defaults" && (
            <ProposalDefaultsTab settings={settings} />
          )}
          {currentTab === "room-types" && (
            <RoomTypesTab roomTypes={roomTypes} />
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

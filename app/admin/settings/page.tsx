import { checkIsAdmin } from "@/app/lib/auth";
import { getOrCreateCompanySettings, getRoomTypes, listEmployees, listStylePresets } from "./actions";
import { SettingsTabs } from "./settings-tabs";

export default async function AdminSettingsPage() {
  const [settings, roomTypes, employees, stylePresets, currentUserIsAdmin] = await Promise.all([
    getOrCreateCompanySettings(),
    getRoomTypes(),
    listEmployees(),
    listStylePresets(),
    checkIsAdmin(),
  ]);
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-10">
        <SettingsTabs
        settings={{
          id: settings.id,
          companyName: settings.companyName,
          addressLine1: settings.addressLine1,
          addressLine2: settings.addressLine2,
          city: settings.city,
          state: settings.state,
          zip: settings.zip,
          phone: settings.phone,
          email: settings.email,
          logoUrl: settings.logoUrl,
          logoLightUrl: settings.logoLightUrl,
          logoDarkUrl: settings.logoDarkUrl,
          primaryColor: settings.primaryColor,
          primaryColorHex: settings.primaryColorHex,
          textColorHex: settings.textColorHex,
          defaultProposalDisclaimer: settings.defaultProposalDisclaimer ?? "",
          defaultTimelineNote: settings.defaultTimelineNote,
          integrationsJson: settings.integrationsJson,
        }}
        roomTypes={roomTypes.map((r) => ({
          id: r.id,
          name: r.name,
          sortOrder: r.sortOrder,
          active: r.active,
          exterior: r.exterior,
        }))}
        stylePresets={stylePresets.map((p) => ({
          id: p.id,
          name: p.name,
          prompt: p.prompt,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
        }))}
        employees={employees.map((e) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          roleTitle: e.roleTitle,
          email: e.email,
          phone: e.phone,
          isActive: e.isActive,
          isAdmin: e.isAdmin,
          sortOrder: e.sortOrder,
        }))}
        currentUserIsAdmin={currentUserIsAdmin}
      />
      </div>
    </div>
  );
}

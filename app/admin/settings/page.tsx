import { checkIsAdmin, getCurrentUserEmail } from "@/app/lib/auth";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";
import {
  getOrCreateCompanySettings,
  listSectionTypes,
  listEmployees,
  listStylePresets,
  listBrandIcons,
} from "./actions";
import { listBrandBackgrounds } from "./branding/backgrounds/actions";
import { SettingsTabs } from "./settings-tabs";

type SearchParams = {
  openIconLibrary?: string;
  openBackgroundLibrary?: string;
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const [
    settings,
    sectionTypes,
    employees,
    stylePresets,
    brandIcons,
    brandBackgrounds,
    currentUserIsAdmin,
    currentEmail,
  ] = await Promise.all([
    getOrCreateCompanySettings(),
    listSectionTypes(),
    listEmployees(),
    listStylePresets(),
    listBrandIcons(),
    listBrandBackgrounds(),
    checkIsAdmin(),
    getCurrentUserEmail(),
  ]);
  const openIconLibrary = resolvedSearchParams?.openIconLibrary === "1";
  const openBackgroundLibrary =
    resolvedSearchParams?.openBackgroundLibrary === "1";
  const effectiveAccent = settings.primaryColorHex ?? "#F47216";
  const effectiveText = settings.textColorHex ?? "#18181B";
  const canSeedSectionTypes =
    currentUserIsAdmin &&
    (currentEmail?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-10">
        <SettingsTabs
          openIconLibrary={openIconLibrary}
          openBackgroundLibrary={openBackgroundLibrary}
          brandIcons={brandIcons.map((icon: {
            id: string;
            slug: string;
            name: string;
            imageUrl: string;
            imageKey: string;
            tags: string[];
            category: string | null;
            isActive: boolean;
          }): {
            id: string;
            slug: string;
            name: string;
            imageUrl: string;
            imageKey: string;
            tags: string[];
            category: string | null;
            isActive: boolean;
          } => ({
            id: icon.id,
            slug: icon.slug,
            name: icon.name,
            imageUrl: icon.imageUrl,
            imageKey: icon.imageKey,
            tags: icon.tags,
            category: icon.category,
            isActive: icon.isActive,
          }))}
          brandBackgrounds={brandBackgrounds.map((b) => ({
            id: b.id,
            slug: b.slug,
            name: b.name,
            baseColorHex: b.baseColorHex,
            overlayImageUrl: b.overlayImageUrl,
            overlayImageKey: b.overlayImageKey,
            overlayIconId: b.overlayIconId,
            overlayOpacity: b.overlayOpacity,
            overlayScale: b.overlayScale,
            overlaySpacing: b.overlaySpacing,
            overlayRotation: b.overlayRotation,
            // New preview fields for cached thumbnails
            previewImageUrl: (b as { previewImageUrl?: string | null }).previewImageUrl ?? null,
            previewImageKey: (b as { previewImageKey?: string | null }).previewImageKey ?? null,
            isAvailable: (b as { isAvailable?: boolean | null }).isAvailable ?? true,
            isActive: b.isActive,
            sortOrder: b.sortOrder,
            tags: b.tags,
          }))}
          iconLibraryContext={{
            companyName: settings.companyName ?? "",
            websiteUrl: settings.websiteUrl ?? null,
            effectiveAccent,
            effectiveText,
          }}
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
          websiteUrl: settings.websiteUrl,
          logoUrl: settings.logoUrl,
          logoLightUrl: settings.logoLightUrl,
          logoDarkUrl: settings.logoDarkUrl,
          primaryColor: settings.primaryColor,
          primaryColorHex: settings.primaryColorHex,
          textColorHex: settings.textColorHex,
          defaultProposalDisclaimer: settings.defaultProposalDisclaimer ?? "",
          defaultTimelineNote: settings.defaultTimelineNote,
          integrationsJson: settings.integrationsJson,
          roomTypeLowPct: settings.roomTypeLowPct,
          roomTypeHighPct: settings.roomTypeHighPct,
        }}
          sectionTypes={sectionTypes.map((s: {
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
          }): {
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
          } => ({
            id: s.id,
            name: s.name,
            category: s.category,
            defaultMeasurementMode: s.defaultMeasurementMode,
            defaultEstimateUnit: s.defaultEstimateUnit,
            customUnitLabel: s.customUnitLabel,
            pricingBasis: s.pricingBasis,
            priceLow: s.priceLow,
            priceTarget: s.priceTarget,
            priceHigh: s.priceHigh,
          }))}
          canSeedSectionTypes={canSeedSectionTypes}
          stylePresets={stylePresets.map((p: {
            id: string;
            name: string;
            prompt: string;
            isActive: boolean;
            sortOrder: number;
          }): {
            id: string;
            name: string;
            prompt: string;
            isActive: boolean;
            sortOrder: number;
          } => ({
            id: p.id,
            name: p.name,
            prompt: p.prompt,
            isActive: p.isActive,
            sortOrder: p.sortOrder,
          }))}
          employees={employees.map((e: {
            id: string;
            firstName: string;
            lastName: string;
            roleTitle: string | null;
            email: string | null;
            phone: string | null;
            isActive: boolean;
            isAdmin: boolean;
            sortOrder: number;
          }): {
            id: string;
            firstName: string;
            lastName: string;
            roleTitle: string | null;
            email: string | null;
            phone: string | null;
            isActive: boolean;
            isAdmin: boolean;
            sortOrder: number;
          } => ({
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

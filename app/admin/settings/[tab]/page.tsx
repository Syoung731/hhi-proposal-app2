import { notFound } from "next/navigation";
import { checkIsAdmin, getCurrentUserEmail } from "@/app/lib/auth";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";
import {
  getOrCreateCompanySettings,
  listSectionTypes,
  listEmployees,
  listStylePresets,
  listBrandIcons,
} from "../actions";
import { listBrandBackgrounds } from "../branding/backgrounds/actions";
import { isSharedSettingsTab } from "../settings-routes";
import { SettingsTabs } from "../settings-tabs";

type SearchParams = {
  openIconLibrary?: string;
  openBackgroundLibrary?: string;
};

export default async function SettingsTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { tab } = await params;
  if (!isSharedSettingsTab(tab)) notFound();

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
    <SettingsTabs
      activeTab={tab}
      embedInLayout
      openIconLibrary={openIconLibrary}
      openBackgroundLibrary={openBackgroundLibrary}
      brandIcons={brandIcons.map((icon) => ({
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
        previewImageUrl: (b as { previewImageUrl?: string | null }).previewImageUrl ?? null,
        previewImageKey: (b as { previewImageKey?: string | null }).previewImageKey ?? null,
        isAvailable: (b as { isAvailable?: boolean | null }).isAvailable ?? true,
        isActive: b.isActive,
        sortOrder: b.sortOrder,
        tags: b.tags,
        generationMode: (b as { generationMode?: string | null }).generationMode ?? null,
        stylePreset: (b as { stylePreset?: string | null }).stylePreset ?? null,
        compositionSeed: (b as { compositionSeed?: string | null }).compositionSeed ?? null,
        textZoneSuggestion: (b as { textZoneSuggestion?: unknown }).textZoneSuggestion as import("@/app/lib/deck/types").TextZoneSuggestion | null ?? null,
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
        designHourlyRate: settings.designHourlyRate,
        brandTagline: settings.brandTagline,
        closingHeadline: settings.closingHeadline,
        integrationsJson: settings.integrationsJson,
        roomTypeLowPct: settings.roomTypeLowPct,
        roomTypeHighPct: settings.roomTypeHighPct,
        anthropicModel: settings.anthropicModel,
        aiEstimateConcurrency: settings.aiEstimateConcurrency,
        autoGenerateCope: settings.autoGenerateCope,
        geminiImageModel: settings.geminiImageModel,
        geminiImageGenModel: settings.geminiImageGenModel,
      }}
      sectionTypes={sectionTypes.map((s) => ({
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
        headshotUrl: e.headshotUrl,
        jobTitle: e.jobTitle,
        signatureQuote: e.signatureQuote,
        directPhone: e.directPhone,
        mobilePhone: e.mobilePhone,
        linkedInUrl: e.linkedInUrl,
        signatureEnabled: e.signatureEnabled,
      }))}
      currentUserIsAdmin={currentUserIsAdmin}
    />
  );
}

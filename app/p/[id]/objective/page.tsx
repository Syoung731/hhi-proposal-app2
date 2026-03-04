import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import {
  getLayoutConfig,
  type PresentationConfigSaved,
  type PublicLayoutConfigSaved,
  type ObjectivePageConfig,
} from "@/app/lib/layout-config";
import { getLibraryMediaByIds, getBrandIconsByIds } from "@/app/lib/library-media";
import { ObjectiveTemplateB } from "@/app/components/presentation/objective/objective-template-b";
import { ObjectiveTemplateC } from "@/app/components/presentation/objective/objective-template-c";
import { ObjectiveRenderer } from "@/components/public/objective";
import { prisma } from "@/app/lib/prisma";

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const cfg = getLayoutConfig(data.publicLayoutConfig);
  const { snapshot } = data;
  const { project } = snapshot;

  const rawPages =
    data.publicLayoutConfig &&
    typeof data.publicLayoutConfig === "object" &&
    "pages" in data.publicLayoutConfig
      ? (data.publicLayoutConfig as PresentationConfigSaved).pages
      : undefined;
  const rawObjective =
    rawPages?.objective ??
    (data.publicLayoutConfig as PublicLayoutConfigSaved | null)?.objective;
  const templateId =
    rawObjective && typeof rawObjective === "object" && "templateId" in rawObjective
      ? (rawObjective as ObjectivePageConfig).templateId
      : undefined;

  if (templateId === "B") {
    const raw = rawObjective as ObjectivePageConfig;
    const objectiveConfig: ObjectivePageConfig = {
      ...(rawObjective && typeof rawObjective === "object"
        ? (rawObjective as ObjectivePageConfig)
        : {}),
      title: raw?.title ?? "Project Objective",
      objectiveText: raw?.objectiveText ?? project.objective ?? "",
      objectiveTextB: raw?.objectiveTextB,
      commitments: raw?.commitments ?? [],
    };

    const companySettings = await prisma.companySettings.findFirst({
      select: { primaryColorHex: true },
    });
    const brandingAccentColor =
      companySettings?.primaryColorHex?.trim() &&
      /^#[0-9A-Fa-f]{6}$/.test(companySettings.primaryColorHex.trim())
        ? companySettings.primaryColorHex.trim()
        : null;
    return (
      <article className="flex min-h-0 flex-col pt-8 sm:pt-12">
        <div className="h-[min(80vh,675px)] w-full max-w-[1200px] mx-auto overflow-hidden">
          <ObjectiveTemplateB
            config={objectiveConfig}
            brandingAccentColor={brandingAccentColor}
          />
        </div>
      </article>
    );
  }

  if (templateId === "C") {
    const raw = rawObjective as ObjectivePageConfig;
    const rawCols = raw?.templateC?.columns ?? raw?.columns ?? [];
    const columnList = Array.isArray(rawCols) ? rawCols.slice(0, 3) : [];
    while (columnList.length < 3) columnList.push({});
    const objectiveConfig: ObjectivePageConfig = {
      ...(rawObjective && typeof rawObjective === "object"
        ? (rawObjective as ObjectivePageConfig)
        : {}),
      title: (rawObjective as ObjectivePageConfig)?.title ?? "Project Objective",
      objectiveText:
        (rawObjective as ObjectivePageConfig)?.objectiveText ?? project.objective ?? "",
      templateC: raw?.templateC ? { ...raw.templateC, columns: columnList } : undefined,
      columns: columnList,
    };
    const cols = objectiveConfig.columns ?? [];
    const iconIds = cols
      .slice(0, 3)
      .map((c) => c?.iconId)
      .filter((id): id is string => !!id);
    const [brandIcons, companySettings] = await Promise.all([
      getBrandIconsByIds(iconIds),
      prisma.companySettings.findFirst({ select: { primaryColorHex: true } }),
    ]);
    const iconUrls = new Map(brandIcons.map((icon) => [icon.id, icon.imageUrl]));
    const brandingAccentColor = companySettings?.primaryColorHex?.trim() && /^#[0-9A-Fa-f]{6}$/.test(companySettings.primaryColorHex.trim())
      ? companySettings.primaryColorHex.trim()
      : null;

    return (
      <article className="space-y-0">
        <ObjectiveTemplateC
          config={objectiveConfig}
          iconUrls={iconUrls}
          brandingAccentColor={brandingAccentColor}
        />
      </article>
    );
  }

  // Template A (or default): use ObjectiveRenderer with merged config and library media for photoSlots
  const mergedObjective: ObjectivePageConfig = {
    ...(rawObjective && typeof rawObjective === "object"
      ? (rawObjective as ObjectivePageConfig)
      : {}),
    variant: cfg.pages.objective.variant,
    title: (rawObjective as ObjectivePageConfig)?.title ?? "Project Objective",
    objectiveText:
      (rawObjective as ObjectivePageConfig)?.objectiveText ?? project.objective ?? "",
    commitments: (rawObjective as ObjectivePageConfig)?.commitments ?? [],
    photoSlots: (rawObjective as ObjectivePageConfig)?.photoSlots ?? [],
  };
  const photoSlotIds = (mergedObjective.photoSlots ?? [])
    .slice(0, 3)
    .map((s) => s?.libraryMediaId)
    .filter((id): id is string => !!id);
  const objectiveMedia = await getLibraryMediaByIds(photoSlotIds);

  return (
    <article className="space-y-14 pt-8 sm:pt-12">
      <ObjectiveRenderer config={mergedObjective} media={objectiveMedia} />
    </article>
  );
}

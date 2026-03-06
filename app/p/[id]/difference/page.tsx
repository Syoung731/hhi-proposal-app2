import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import {
  getLayoutConfig,
  type PresentationConfigSaved,
  type PublicLayoutConfigSaved,
  type WhyUsPageConfig,
} from "@/app/lib/layout-config";
import { getBrandIconsByIds } from "@/app/lib/library-media";
import { WhyUsRenderer } from "@/components/presentation/why-us/WhyUsRenderer";
import {
  getDefaultCompanyId,
  getWhyUsDefaults,
  listValuePillars,
} from "@/app/lib/value-pillars";

export default async function DifferencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const cfg = getLayoutConfig(data.publicLayoutConfig);
  const rawPages =
    data.publicLayoutConfig &&
    typeof data.publicLayoutConfig === "object" &&
    "pages" in data.publicLayoutConfig
      ? (data.publicLayoutConfig as PresentationConfigSaved).pages
      : undefined;

  let rawWhyUs: WhyUsPageConfig | null =
    (rawPages?.whyUs as WhyUsPageConfig | undefined) ??
    (data.publicLayoutConfig as PublicLayoutConfigSaved | null)?.whyUs ??
    null;

  let pillars = (rawWhyUs?.pillars ?? []).slice(0, 4);

  // Optional fallback: if project has no pillars, use company defaults (title + pillars with title and body)
  if (pillars.length === 0) {
    try {
      const companyId = await getDefaultCompanyId();
      const [defaults, companyPillars] = await Promise.all([
        getWhyUsDefaults(companyId),
        listValuePillars(companyId),
      ]);
      if (companyPillars.length > 0) {
        rawWhyUs = {
          title: defaults.title,
          variant: "gridCards",
          pillars: companyPillars.slice(0, 4).map((p) => ({
            iconKey: p.brandIconId ?? null,
            headline: p.title,
            body: p.body,
          })),
        };
        pillars = rawWhyUs.pillars ?? [];
      }
    } catch {
      // Ignore; keep rawWhyUs as-is (no pillars)
    }
  }

  const iconIds = pillars
    .map((p) => p?.iconKey)
    .filter((key): key is string => !!key);

  const brandIcons = await getBrandIconsByIds(iconIds);
  const iconUrls = new Map(brandIcons.map((icon) => [icon.id, icon.imageUrl]));

  const variant = rawWhyUs?.variant ?? cfg.pages.whyUs.variant;
  return <WhyUsRenderer config={{ ...rawWhyUs, variant }} iconUrls={iconUrls} />;
}

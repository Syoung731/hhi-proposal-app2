import { requireAdmin } from "@/app/lib/auth";
import { listBrandIcons } from "@/app/admin/settings/actions";
import {
  getDefaultCompanyId,
  getWhyUsDefaults,
  listValuePillars,
  logDbInfoInDev,
  logTableColumnsInDev,
} from "@/app/lib/value-pillars";
import { ValuePillarsClient } from "../presentation/value-pillars/ValuePillarsClient";

export const dynamic = "force-dynamic";

export default async function ValuePillarsSettingsPage() {
  await requireAdmin();

  if (process.env.NODE_ENV === "development") {
    await logDbInfoInDev();
    await logTableColumnsInDev();
  }

  const companyId = await getDefaultCompanyId();
  const [defaults, pillars, brandIcons] = await Promise.all([
    getWhyUsDefaults(companyId),
    listValuePillars(companyId),
    listBrandIcons(),
  ]);
  const brandIconsForUI = brandIcons.map((icon) => ({
    id: icon.id,
    imageUrl: icon.imageUrl,
    name: icon.name,
  }));
  const remountKey = `vp-${defaults.id}-${defaults.title}-${pillars.map((p) => p.id).join(",")}`;
  return (
    <ValuePillarsClient
      key={remountKey}
      initialDefaults={defaults}
      initialPillars={pillars}
      brandIcons={brandIconsForUI}
    />
  );
}

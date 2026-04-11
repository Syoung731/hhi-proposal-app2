import { requireAdmin } from "@/app/lib/auth";
import { getCoreValuesDefaults, HHI_DEFAULTS } from "@/app/lib/core-values-defaults.server";
import { listBrandIcons } from "../actions";
import { CoreValuesSettingsClient } from "./CoreValuesSettingsClient";

export const dynamic = "force-dynamic";

export default async function CoreValuesSettingsPage() {
  await requireAdmin();
  const defaults = await getCoreValuesDefaults();
  const rawIcons = await listBrandIcons();
  const brandIcons = rawIcons.map((i) => ({ id: i.id, imageUrl: i.imageUrl, name: i.name }));

  return (
    <CoreValuesSettingsClient
      initialSettings={defaults}
      hhiDefaults={HHI_DEFAULTS}
      brandIcons={brandIcons}
    />
  );
}

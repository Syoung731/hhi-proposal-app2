import { requireAdmin } from "@/app/lib/auth";
import { getCopeDefaults, HHI_COPE_DEFAULTS } from "@/app/lib/cope-defaults.server";
import { listBrandIcons } from "../actions";
import { CopeItemsSettingsClient } from "./CopeItemsSettingsClient";

export const dynamic = "force-dynamic";

export default async function CopeItemsSettingsPage() {
  await requireAdmin();
  const defaults = await getCopeDefaults();
  const rawIcons = await listBrandIcons();
  const brandIcons = rawIcons.map((i) => ({ id: i.id, imageUrl: i.imageUrl, name: i.name }));

  return (
    <CopeItemsSettingsClient
      initialSettings={defaults}
      hhiDefaults={HHI_COPE_DEFAULTS}
      brandIcons={brandIcons}
    />
  );
}

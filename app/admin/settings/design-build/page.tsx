import { requireAdmin } from "@/app/lib/auth";
import { getDesignBuildDefaults, HHI_DESIGN_BUILD_DEFAULTS } from "@/app/lib/design-build-defaults.server";
import { listBrandIcons } from "../actions";
import { DesignBuildSettingsClient } from "./DesignBuildSettingsClient";

export const dynamic = "force-dynamic";

export default async function DesignBuildSettingsPage() {
  await requireAdmin();
  const defaults = await getDesignBuildDefaults();
  const rawIcons = await listBrandIcons();
  const brandIcons = rawIcons.map((i) => ({ id: i.id, imageUrl: i.imageUrl, name: i.name }));

  return (
    <DesignBuildSettingsClient
      initialSettings={defaults}
      hhiDefaults={HHI_DESIGN_BUILD_DEFAULTS}
      brandIcons={brandIcons}
    />
  );
}

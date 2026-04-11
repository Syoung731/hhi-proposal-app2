import { requireAdmin } from "@/app/lib/auth";
import { getNextStepsDefaults, HHI_NEXT_STEPS_DEFAULTS } from "@/app/lib/next-steps-defaults.server";
import { NextStepsSettingsClient } from "./NextStepsSettingsClient";

export const dynamic = "force-dynamic";

export default async function NextStepsSettingsPage() {
  await requireAdmin();
  const defaults = await getNextStepsDefaults();

  return (
    <NextStepsSettingsClient
      initialSettings={defaults}
      hhiDefaults={HHI_NEXT_STEPS_DEFAULTS}
    />
  );
}

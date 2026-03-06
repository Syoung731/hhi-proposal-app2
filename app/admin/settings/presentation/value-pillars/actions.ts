"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import {
  getDefaultCompanyId,
  getWhyUsDefaults,
  upsertWhyUsDefaults,
  listValuePillars,
  createValuePillar,
  updateValuePillar,
  deleteValuePillar,
  swapPillarOrder,
  type WhyUsDefaultsRow,
  type ValuePillarRow,
} from "@/app/lib/value-pillars";
import { listBrandIcons } from "@/app/admin/settings/actions";

const VALUE_PILLARS_PATH = "/admin/settings/presentation/value-pillars";

export type WhyUsDefaultsForUI = WhyUsDefaultsRow;
export type ValuePillarForUI = ValuePillarRow;

/** Load defaults, pillars, and brandIcons for the Value Pillars settings page. */
export async function loadValuePillarsPageAction(): Promise<{
  error?: string;
  defaults?: WhyUsDefaultsRow;
  pillars?: ValuePillarRow[];
  brandIcons?: { id: string; imageUrl: string; name: string }[];
}> {
  await requireAdmin();
  try {
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
    return { defaults, pillars, brandIcons: brandIconsForUI };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return { error: message };
  }
}

/** Save Why Us defaults (Default Page Title only). */
export async function saveWhyUsDefaultsAction(
  title: string
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    await upsertWhyUsDefaults(companyId, {
      title: (title ?? "").trim() || "Why Us",
    });
    revalidatePath(VALUE_PILLARS_PATH);
    revalidatePath("/admin/settings");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return { error: message };
  }
}

/** Create a value pillar (title, body, optional brandIconId). Max 4 total. */
export async function createValuePillarAction(
  title: string,
  body: string,
  brandIconId?: string | null
): Promise<{ error?: string; pillar?: ValuePillarRow }> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    const pillar = await createValuePillar(companyId, { title, body, brandIconId });
    revalidatePath(VALUE_PILLARS_PATH);
    revalidatePath("/admin/settings");
    return { pillar };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create pillar";
    return { error: message };
  }
}

/** Update a value pillar (title, body, optional brandIconId). */
export async function updateValuePillarAction(
  pillarId: string,
  title: string,
  body: string,
  brandIconId?: string | null
): Promise<{ error?: string; pillar?: ValuePillarRow }> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    const pillar = await updateValuePillar(companyId, pillarId, {
      title,
      body,
      brandIconId,
    });
    if (!pillar) return { error: "Pillar not found" };
    revalidatePath(VALUE_PILLARS_PATH);
    revalidatePath("/admin/settings");
    return { pillar };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update pillar";
    return { error: message };
  }
}

/** Delete a value pillar. */
export async function deleteValuePillarAction(
  pillarId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    const deleted = await deleteValuePillar(companyId, pillarId);
    if (!deleted) return { error: "Pillar not found" };
    revalidatePath(VALUE_PILLARS_PATH);
    revalidatePath("/admin/settings");
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete pillar";
    return { error: message };
  }
}

/** Reorder a pillar up or down in the library. */
export async function reorderValuePillarAction(
  pillarId: string,
  direction: "up" | "down"
): Promise<{ error?: string; pillars?: ValuePillarRow[] }> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    const pillars = await swapPillarOrder(companyId, pillarId, direction);
    if (!pillars) {
      return { error: "Pillar not found or cannot move" };
    }
    revalidatePath(VALUE_PILLARS_PATH);
    revalidatePath("/admin/settings");
    return { pillars };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reorder";
    return { error: message };
  }
}

/** Return company Why Us defaults for "Apply Company Defaults" in project editor: title + pillars (iconKey, headline, body). Does not set layout variant. */
export type CompanyWhyUsDefaultsResult = {
  title: string;
  pillars: { iconKey: string | null; headline: string; body: string }[];
};

export async function getCompanyWhyUsDefaultsForProjectAction(): Promise<
  { error?: string } | CompanyWhyUsDefaultsResult
> {
  await requireAdmin();
  try {
    const companyId = await getDefaultCompanyId();
    const [defaults, pillars] = await Promise.all([
      getWhyUsDefaults(companyId),
      listValuePillars(companyId),
    ]);
    const pillarsForProject = pillars.slice(0, 4).map((p) => ({
      iconKey: p.brandIconId ?? null,
      headline: p.title,
      body: p.body,
    }));
    return {
      title: defaults.title,
      pillars: pillarsForProject,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load defaults";
    return { error: message };
  }
}

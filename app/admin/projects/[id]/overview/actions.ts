"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export type OverviewFieldErrors = Partial<Record<
  | "title"
  | "subtitle"
  | "addressLine1"
  | "city"
  | "state"
  | "zip"
  | "client1First"
  | "client1Last"
  | "client2First"
  | "client2Last",
  string
>>;

export async function updateProjectOverviewAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; fieldErrors?: OverviewFieldErrors }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };

  const title = (formData.get("title") as string)?.trim() ?? "";
  const subtitle = (formData.get("subtitle") as string)?.trim() ?? "";
  const addressLine1 = (formData.get("addressLine1") as string)?.trim() ?? "";
  const addressLine2 = (formData.get("addressLine2") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() ?? "";
  const state = (formData.get("state") as string)?.trim() ?? "";
  const zip = (formData.get("zip") as string)?.trim() ?? "";
  const client1First = (formData.get("client1First") as string)?.trim() ?? "";
  const client1Last = (formData.get("client1Last") as string)?.trim() ?? "";
  const client2First = (formData.get("client2First") as string)?.trim() ?? "";
  const client2Last = (formData.get("client2Last") as string)?.trim() ?? "";
  const transcriptText = (formData.get("transcriptText") as string)?.trim() || null;
  const objective = (formData.get("objective") as string)?.trim() || null;
  const supportingText = (formData.get("supportingText") as string)?.trim() || null;
  const bulletsRaw = (formData.get("bullets") as string)?.trim() || "";
  const bullets = bulletsRaw ? bulletsRaw.split("\n").map((b) => b.trim()).filter(Boolean) : [];
  const scopeOverview = (formData.get("scopeOverview") as string)?.trim() || null;
  const coverHeroImageId = formData.has("coverHeroImageId")
    ? ((formData.get("coverHeroImageId") as string)?.trim() || null)
    : undefined;

  const fieldErrors: OverviewFieldErrors = {};

  if (!title) fieldErrors.title = "Title is required";
  if (!subtitle) fieldErrors.subtitle = "Subtitle is required";
  if (!addressLine1) fieldErrors.addressLine1 = "Address line 1 is required";
  if (!city) fieldErrors.city = "City is required";
  if (!state) fieldErrors.state = "State is required";
  if (!zip) fieldErrors.zip = "Zip is required";

  const hasClient1 = !!(client1First || client1Last);
  if (!hasClient1) {
    fieldErrors.client1First = "At least one owner is required";
    fieldErrors.client1Last = "At least one owner is required";
  }

  const hasClient2First = !!client2First;
  const hasClient2Last = !!client2Last;
  if (hasClient2First && !hasClient2Last) fieldErrors.client2Last = "Last name is required when first name is provided";
  if (hasClient2Last && !hasClient2First) fieldErrors.client2First = "First name is required when last name is provided";

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please complete all required fields.",
      fieldErrors,
    };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      subtitle: subtitle || null,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      client1First: client1First || null,
      client1Last: client1Last || null,
      client2First: client2First || null,
      client2Last: client2Last || null,
      transcriptText,
      objective,
      supportingText,
      bullets,
      scopeOverview,
      ...(coverHeroImageId !== undefined && { coverHeroImageId }),
    },
  });
  // Invalidate project page (Overview tab) and preview so router.refresh() fetches updated data.
  // Also invalidate the deck route — the Objective slide reads project.objective,
  // supportingText, bullets, and objectivePillars, all of which this action updates.
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  revalidatePath(`/admin/projects/${projectId}/deck`);
  return {};
}

/**
 * Toggle `project.hasAddition`. Drives whether the Addition Overview slide
 * is included in the default deck spec. Saved immediately (no form submit).
 */
export async function updateProjectHasAdditionAction(
  projectId: string,
  value: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { hasAddition: value },
    });
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/deck`);
    return {};
  } catch (err) {
    return { error: String(err) };
  }
}

export async function updateProjectStylePresetAction(
  projectId: string,
  stylePresetId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  if (stylePresetId) {
    const preset = await prisma.stylePreset.findUnique({ where: { id: stylePresetId } });
    if (!preset?.isActive) return { error: "Style preset not found or inactive" };
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { stylePresetId },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateProjectTranscriptAction(
  projectId: string,
  transcriptText: string
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const trimmed = transcriptText?.trim() ?? "";
  if (!trimmed) {
    return { ok: true };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  await prisma.project.update({
    where: { id: projectId },
    data: { transcriptText: trimmed },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true };
}

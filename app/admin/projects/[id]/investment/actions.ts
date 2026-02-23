"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function createInvestmentLineItemAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found" };
  const label = (formData.get("label") as string)?.trim() ?? "";
  if (!label) return { error: "Label is required" };
  const rangeLow = formData.get("rangeLow");
  const rangeHigh = formData.get("rangeHigh");
  const notes = (formData.get("notes") as string)?.trim() || null;
  const maxOrder = await prisma.investmentLineItem
    .aggregate({ where: { projectId }, _max: { sortOrder: true } })
    .then((r) => r._max.sortOrder ?? -1);
  await prisma.investmentLineItem.create({
    data: {
      projectId,
      label,
      rangeLow: rangeLow !== null && rangeLow !== "" ? parseInt(String(rangeLow), 10) : undefined,
      rangeHigh: rangeHigh !== null && rangeHigh !== "" ? parseInt(String(rangeHigh), 10) : undefined,
      notes,
      sortOrder: maxOrder + 1,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function updateInvestmentLineItemAction(
  projectId: string,
  itemId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const item = await prisma.investmentLineItem.findFirst({
    where: { id: itemId, projectId },
  });
  if (!item) return { error: "Item not found" };
  const label = (formData.get("label") as string)?.trim();
  const rangeLow = formData.get("rangeLow");
  const rangeHigh = formData.get("rangeHigh");
  const notes = (formData.get("notes") as string)?.trim() || null;
  await prisma.investmentLineItem.update({
    where: { id: itemId },
    data: {
      ...(label !== undefined && { label }),
      rangeLow: rangeLow !== null && rangeLow !== "" ? parseInt(String(rangeLow), 10) : null,
      rangeHigh: rangeHigh !== null && rangeHigh !== "" ? parseInt(String(rangeHigh), 10) : null,
      notes,
    },
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function deleteInvestmentLineItemAction(
  projectId: string,
  itemId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const item = await prisma.investmentLineItem.findFirst({
    where: { id: itemId, projectId },
  });
  if (!item) return { error: "Item not found" };
  await prisma.investmentLineItem.delete({ where: { id: itemId } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export async function moveInvestmentOrderAction(
  projectId: string,
  itemId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireAdmin();
  const item = await prisma.investmentLineItem.findFirst({
    where: { id: itemId, projectId },
  });
  if (!item) return { error: "Item not found" };
  const list = await prisma.investmentLineItem.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx < 0) return { error: "Item not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {};
  const other = list[swapIdx]!;
  await prisma.$transaction([
    prisma.investmentLineItem.update({
      where: { id: itemId },
      data: { sortOrder: other.sortOrder },
    }),
    prisma.investmentLineItem.update({
      where: { id: other.id },
      data: { sortOrder: item.sortOrder },
    }),
  ]);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

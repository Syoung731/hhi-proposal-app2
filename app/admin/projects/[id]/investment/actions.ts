"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { recomputeInvestmentRollups } from "@/app/lib/investment-rollup";

/**
 * Pure DB helper — no revalidatePath, safe to call from server components
 * and other server-side code that runs during render.
 * Ensures rollup rows exist for this project without any cache side effects.
 */
export async function ensureInvestmentLineItemsForBucketsDB(
  projectId: string
): Promise<{ error?: string }> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "Project not found" };
  await recomputeInvestmentRollups(projectId);
  return {};
}

/**
 * Server-action wrapper — calls the DB helper then revalidates the cache.
 * Must only be invoked from client-initiated actions (form actions, button
 * handlers), never from within a server component render path.
 */
export async function ensureInvestmentLineItemsForBuckets(
  projectId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await ensureInvestmentLineItemsForBucketsDB(projectId);
  if (result.error) return result;
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

export type UpdateInvestmentLineItemPatch = {
  label?: string;
  rangeLow?: number | null;
  rangeTarget?: number | null;
  rangeHigh?: number | null;
  notes?: string | null;
  isOverride?: boolean;
  overrideLow?: number | null;
  overrideTarget?: number | null;
  overrideHigh?: number | null;
  overrideNotes?: string | null;
  includeInTotals?: boolean;
};

export async function updateInvestmentLineItem(
  projectId: string,
  itemId: string,
  patch: UpdateInvestmentLineItemPatch
): Promise<{ error?: string }> {
  await requireAdmin();
  const item = await prisma.investmentLineItem.findFirst({
    where: { id: itemId, projectId },
  });
  if (!item) return { error: "Item not found" };
  const data: Parameters<typeof prisma.investmentLineItem.update>[0]["data"] = {};
  if (patch.label !== undefined) data.label = patch.label;
  if (patch.rangeLow !== undefined) data.rangeLow = patch.rangeLow;
  if (patch.rangeTarget !== undefined) data.rangeTarget = patch.rangeTarget;
  if (patch.rangeHigh !== undefined) data.rangeHigh = patch.rangeHigh;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.includeInTotals !== undefined) data.includeInTotals = patch.includeInTotals;
  if (patch.isOverride !== undefined) {
    data.isOverride = patch.isOverride;
    if (!patch.isOverride) {
      data.overrideLow = null;
      data.overrideTarget = null;
      data.overrideHigh = null;
      data.overrideNotes = null;
    }
  }
  if (patch.isOverride !== false) {
    if (patch.overrideLow !== undefined) data.overrideLow = patch.overrideLow;
    if (patch.overrideTarget !== undefined) data.overrideTarget = patch.overrideTarget;
    if (patch.overrideHigh !== undefined) data.overrideHigh = patch.overrideHigh;
    if (patch.overrideNotes !== undefined) data.overrideNotes = patch.overrideNotes;
  }
  await prisma.investmentLineItem.update({
    where: { id: itemId },
    data,
  });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/preview`);
  return {};
}

/** No longer used: investment items are exactly 3 per project (one per bucket). Use ensureInvestmentLineItemsForBuckets. */
export async function createInvestmentLineItemAction(
  _projectId: string,
  _formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  return { error: "Investment line items are managed per bucket (Base, Alternates, Allowances)." };
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
  const rangeTarget = formData.get("rangeTarget");
  const rangeHigh = formData.get("rangeHigh");
  const notes = (formData.get("notes") as string)?.trim() || null;
  const parseOpt = (v: FormDataEntryValue | null): number | null => {
    if (v === null || v === "") return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
  };
  await prisma.investmentLineItem.update({
    where: { id: itemId },
    data: {
      ...(label !== undefined && { label }),
      rangeLow: parseOpt(rangeLow),
      rangeTarget: parseOpt(rangeTarget),
      rangeHigh: parseOpt(rangeHigh),
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

export type UpdateProjectRetainerPatch = {
  retainerEnabled?: boolean;
  retainerPercent?: number;
  retainerRoundTo?: number;
  retainerOverride?: number | null;
};

export async function updateProjectRetainer(
  projectId: string,
  patch: UpdateProjectRetainerPatch
): Promise<{ error?: string }> {
  await requireAdmin();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { error: "Project not found" };
  const data: Parameters<typeof prisma.project.update>[0]["data"] = {};
  if (patch.retainerEnabled !== undefined) data.retainerEnabled = patch.retainerEnabled;
  if (patch.retainerPercent !== undefined) {
    const p = Number(patch.retainerPercent);
    if (!Number.isFinite(p) || p < 0 || p > 1) return { error: "Invalid percent (0–1)" };
    data.retainerPercent = p;
  }
  if (patch.retainerRoundTo !== undefined) {
    const r = Math.max(1, Math.round(Number(patch.retainerRoundTo)));
    data.retainerRoundTo = r;
  }
  if (patch.retainerOverride !== undefined) {
    if (patch.retainerOverride === null) data.retainerOverride = null;
    else {
      const n = Math.round(Number(patch.retainerOverride));
      data.retainerOverride = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  await prisma.project.update({ where: { id: projectId }, data });
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

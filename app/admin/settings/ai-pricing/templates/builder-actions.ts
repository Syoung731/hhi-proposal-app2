"use server";

/**
 * Template Builder — server actions for authoring Room Templates in-app.
 *
 * Complements the import-from-JobTread flow: lets an admin create/edit templates
 * directly (especially the EXTERIOR templates that don't exist in JobTread yet),
 * which then serve as the scaffold for the JobTread budget push and can later be
 * pushed up to JobTread's org catalog (Phase 2).
 *
 * All mutations are local-DB only — no JobTread writes. The client re-fetches
 * `/api/settings/templates/imported` after each action, so these return plain
 * results rather than revalidating an RSC.
 */

import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export interface BuilderTemplateItem {
  id: string;
  name: string;
  costCode: string | null;
  costType: string | null;
  isActive: boolean;
  sortOrder: number;
  catalogItemId: string | null;
}
export interface BuilderTradeGroup {
  id: string;
  name: string;
  sortOrder: number;
  items: BuilderTemplateItem[];
}
export interface BuilderTemplate {
  id: string;
  name: string;
  displayName: string | null;
  active: boolean;
  isProjectOverhead: boolean;
  tradeGroups: BuilderTradeGroup[];
}

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

// ── Template-level ─────────────────────────────────────────────────────────

export async function createRoomTemplate(input: {
  name: string;
  displayName?: string | null;
  isProjectOverhead?: boolean;
}): Promise<{ id: string }> {
  await requireAdmin();
  const name = clean(input.name);
  if (!name) throw new Error("Template name is required.");
  const created = await prisma.roomTemplate.create({
    data: {
      name,
      displayName: clean(input.displayName) || null,
      isProjectOverhead: input.isProjectOverhead ?? false,
      // Authored-in-app templates have no JobTread id until pushed (Phase 2).
      jobtreadId: null,
    },
    select: { id: true },
  });
  return created;
}

export async function updateRoomTemplate(
  id: string,
  input: { name?: string; displayName?: string | null; active?: boolean; isProjectOverhead?: boolean },
): Promise<void> {
  await requireAdmin();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = clean(input.name);
    if (!name) throw new Error("Template name cannot be empty.");
    data.name = name;
  }
  if (input.displayName !== undefined) data.displayName = clean(input.displayName) || null;
  if (input.active !== undefined) data.active = input.active;
  if (input.isProjectOverhead !== undefined) data.isProjectOverhead = input.isProjectOverhead;
  if (Object.keys(data).length === 0) return;
  await prisma.roomTemplate.update({ where: { id }, data });
}

export async function deleteRoomTemplate(id: string): Promise<void> {
  await requireAdmin();
  // Trade groups + items cascade (onDelete: Cascade on the relations).
  await prisma.roomTemplate.delete({ where: { id } });
}

// ── Trade-group-level ──────────────────────────────────────────────────────

export async function addTradeGroup(templateId: string, name: string): Promise<{ id: string }> {
  await requireAdmin();
  const trimmed = clean(name);
  if (!trimmed) throw new Error("Trade group name is required.");
  const max = await prisma.roomTemplateTradeGroup.aggregate({
    where: { roomTemplateId: templateId },
    _max: { sortOrder: true },
  });
  const created = await prisma.roomTemplateTradeGroup.create({
    data: { roomTemplateId: templateId, name: trimmed, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    select: { id: true },
  });
  return created;
}

export async function updateTradeGroup(id: string, input: { name?: string }): Promise<void> {
  await requireAdmin();
  if (input.name === undefined) return;
  const name = clean(input.name);
  if (!name) throw new Error("Trade group name cannot be empty.");
  await prisma.roomTemplateTradeGroup.update({ where: { id }, data: { name } });
}

export async function deleteTradeGroup(id: string): Promise<void> {
  await requireAdmin();
  await prisma.roomTemplateTradeGroup.delete({ where: { id } });
}

export async function reorderTradeGroups(templateId: string, orderedIds: string[]): Promise<void> {
  await requireAdmin();
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.roomTemplateTradeGroup.updateMany({
        where: { id, roomTemplateId: templateId },
        data: { sortOrder: i },
      }),
    ),
  );
}

// ── Item-level ─────────────────────────────────────────────────────────────

export async function addTemplateItem(
  tradeGroupId: string,
  input: { name: string; costCode?: string | null; costType?: string | null; catalogItemId?: string | null },
): Promise<{ id: string }> {
  await requireAdmin();
  const name = clean(input.name);
  if (!name) throw new Error("Item name is required.");
  const max = await prisma.roomTemplateItem.aggregate({
    where: { tradeGroupId },
    _max: { sortOrder: true },
  });
  const created = await prisma.roomTemplateItem.create({
    data: {
      tradeGroupId,
      name,
      costCode: clean(input.costCode) || null,
      costType: clean(input.costType) || null,
      catalogItemId: input.catalogItemId || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  return created;
}

export async function updateTemplateItem(
  id: string,
  input: {
    name?: string;
    costCode?: string | null;
    costType?: string | null;
    catalogItemId?: string | null;
    isActive?: boolean;
  },
): Promise<void> {
  await requireAdmin();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = clean(input.name);
    if (!name) throw new Error("Item name cannot be empty.");
    data.name = name;
  }
  if (input.costCode !== undefined) data.costCode = clean(input.costCode) || null;
  if (input.costType !== undefined) data.costType = clean(input.costType) || null;
  if (input.catalogItemId !== undefined) data.catalogItemId = input.catalogItemId || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (Object.keys(data).length === 0) return;
  await prisma.roomTemplateItem.update({ where: { id }, data });
}

export async function deleteTemplateItem(id: string): Promise<void> {
  await requireAdmin();
  await prisma.roomTemplateItem.delete({ where: { id } });
}

export async function reorderTemplateItems(tradeGroupId: string, orderedIds: string[]): Promise<void> {
  await requireAdmin();
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.roomTemplateItem.updateMany({
        where: { id, tradeGroupId },
        data: { sortOrder: i },
      }),
    ),
  );
}

// ── Loader ─────────────────────────────────────────────────────────────────

export async function getTemplateForEdit(id: string): Promise<BuilderTemplate | null> {
  await requireAdmin();
  const t = await prisma.roomTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      displayName: true,
      active: true,
      isProjectOverhead: true,
      tradeGroups: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              costCode: true,
              costType: true,
              isActive: true,
              sortOrder: true,
              catalogItemId: true,
            },
          },
        },
      },
    },
  });
  return t;
}

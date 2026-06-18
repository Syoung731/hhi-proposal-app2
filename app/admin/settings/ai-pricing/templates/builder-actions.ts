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

// ── Build-from-estimate ──────────────────────────────────────────────────────

export interface EstimateSourceRoom {
  roomId: string;
  roomName: string;
  lineItemCount: number;
  templateName: string | null;
}
export interface EstimateSourceProject {
  id: string;
  title: string;
  rooms: EstimateSourceRoom[];
}

/**
 * List projects (and their rooms) that have a latest AI estimate with line items
 * — the candidates you can promote into a Room Template. One entry per room
 * (latest estimate wins).
 */
export async function listEstimateSources(): Promise<EstimateSourceProject[]> {
  await requireAdmin();
  const estimates = await prisma.aIEstimate.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      sectionId: true,
      projectId: true,
      project: { select: { id: true, title: true } },
      section: { select: { name: true } },
      roomTemplate: { select: { name: true, displayName: true } },
      _count: { select: { lineItems: true } },
    },
  });

  const seenRoom = new Set<string>();
  const byProject = new Map<string, EstimateSourceProject>();
  for (const e of estimates) {
    if (seenRoom.has(e.sectionId)) continue; // latest per room only
    seenRoom.add(e.sectionId);
    if (e._count.lineItems === 0) continue;
    let p = byProject.get(e.projectId);
    if (!p) {
      p = { id: e.project.id, title: e.project.title, rooms: [] };
      byProject.set(e.projectId, p);
    }
    p.rooms.push({
      roomId: e.sectionId,
      roomName: e.section.name,
      lineItemCount: e._count.lineItems,
      templateName: e.roomTemplate?.displayName ?? e.roomTemplate?.name ?? null,
    });
  }
  return Array.from(byProject.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Promote a room's latest AI estimate into a NEW Room Template: group line items
 * by trade, dedupe by name within a trade, carry cost code / cost type / catalog
 * linkage, and STRIP quantities & prices (templates carry method, not amounts).
 * Created INACTIVE so it is never used for estimating until the admin reviews +
 * activates it. Returns the new template id for immediate editing.
 */
export async function createTemplateFromRoomEstimate(roomId: string): Promise<{ id: string }> {
  await requireAdmin();
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { name: true, isProjectOverhead: true } });
  const est = await prisma.aIEstimate.findFirst({
    where: { sectionId: roomId },
    orderBy: { createdAt: "desc" },
    select: {
      lineItems: {
        orderBy: [{ tradeGroup: "asc" }, { sortOrder: "asc" }],
        select: {
          tradeGroup: true,
          name: true,
          catalogItemId: true,
          catalogItem: { select: { costCode: true, costType: true, jobtreadId: true } },
        },
      },
    },
  });
  if (!est || est.lineItems.length === 0) {
    throw new Error("That room has no AI estimate with line items to build from.");
  }

  // Group by trade (preserve first-seen order); dedupe items by name within a trade.
  const groupOrder: string[] = [];
  const groups = new Map<
    string,
    { name: string; items: Array<{ name: string; costCode: string | null; costType: string | null; catalogItemId: string | null; jobtreadItemId: string | null }> }
  >();
  const seenItem = new Set<string>();
  for (const li of est.lineItems) {
    const trade = li.tradeGroup || "General";
    if (!groups.has(trade)) {
      groups.set(trade, { name: trade, items: [] });
      groupOrder.push(trade);
    }
    const key = `${trade}|${li.name.trim().toLowerCase()}`;
    if (seenItem.has(key)) continue;
    seenItem.add(key);
    groups.get(trade)!.items.push({
      name: li.name,
      costCode: li.catalogItem?.costCode ?? null,
      costType: li.catalogItem?.costType ?? null,
      catalogItemId: li.catalogItemId ?? null,
      jobtreadItemId: li.catalogItem?.jobtreadId ?? null,
    });
  }

  const baseName = room?.name?.trim() || "New";
  const created = await prisma.roomTemplate.create({
    data: {
      name: `${baseName} — from estimate`,
      displayName: baseName,
      active: false, // review + activate to accept
      isProjectOverhead: room?.isProjectOverhead ?? false,
      jobtreadId: null,
      tradeGroups: {
        create: groupOrder.map((t, gi) => ({
          name: groups.get(t)!.name,
          sortOrder: gi,
          items: {
            create: groups.get(t)!.items.map((it, ii) => ({
              name: it.name,
              costCode: it.costCode,
              costType: it.costType,
              catalogItemId: it.catalogItemId,
              jobtreadItemId: it.jobtreadItemId,
              sortOrder: ii,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });
  return created;
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

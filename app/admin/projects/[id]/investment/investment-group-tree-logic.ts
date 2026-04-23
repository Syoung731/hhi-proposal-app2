/**
 * Pure-logic module for the Investment tab's display-group tree.
 *
 * No React. No server actions. Everything here is deterministic and
 * testable in isolation: group-node construction, category ordering, and
 * drag-math (reparentRoom, moveGroup).
 */

import {
  DEFAULT_GROUP_ORDER,
  resolveGroup,
  isKnownDisplayGroupSlug,
  type DisplayGroupSlug,
} from "@/app/lib/investment/display-group-classifier";
import type { DisplayGroupMove } from "./actions";

// ─── Public types ───────────────────────────────────────────────────────────

export type SectionRow = {
  id: string;
  name: string;
  bucket: string;
  sectionTypeName: string;
  totalLow: number | null;
  totalTarget: number | null;
  totalHigh: number | null;
  displayGroupId: string | null;
  displayGroupOrder: number;
  isProjectOverhead: boolean;
};

export type GroupNode = {
  slug: string;
  label: string;
  isIndividualized: boolean;
  isLocked: boolean; // COPE
  members: SectionRow[];
  bucket: string;
  sumLow: number;
  sumHigh: number;
};

// Drag payload types — attached to each sortable via `data`.
export type GroupDragData = { type: "group"; slug: string };
export type RoomDragData = { type: "room"; slug: string; roomId: string };
export type AnyDragData = GroupDragData | RoomDragData;

export const BUCKET_LABELS: Record<string, string> = {
  BASE: "Base",
  ALTERNATE: "Alternates",
  ALLOWANCE: "Allowances",
};

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function formatRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return "TBD";
  if (lo != null && hi != null && lo !== hi) {
    return `${formatMoney(lo)} – ${formatMoney(hi)}`;
  }
  return formatMoney(lo ?? hi);
}

export function hasPricing(s: SectionRow): boolean {
  return s.totalLow != null || s.totalHigh != null;
}

export function buildIncludesText(members: SectionRow[]): string | null {
  if (members.length <= 1) return null;
  const names = members.map((m) => m.name);
  if (names.length <= 3) return `Includes: ${names.join(", ")}`;
  return `Includes: ${names.slice(0, 3).join(", ")}, … and ${names.length - 3} more`;
}

// ─── Drag-sortable id helpers ───────────────────────────────────────────────

export function groupSortableId(slug: string): string {
  return `group::${slug}`;
}

export function isGroupSortableId(id: string): boolean {
  return typeof id === "string" && id.startsWith("group::");
}

export function getGroupSlugFromId(id: string): string {
  return id.replace(/^group::/, "");
}

// ─── buildGroupNodes ─────────────────────────────────────────────────────────

export function buildGroupNodes(
  sections: SectionRow[],
  savedOrder: string[]
): GroupNode[] {
  const buckets = new Map<string, SectionRow[]>();
  for (const s of sections) {
    const slug = s.displayGroupId ?? "ungrouped";
    const arr = buckets.get(slug) ?? [];
    arr.push(s);
    buckets.set(slug, arr);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (a.displayGroupOrder !== b.displayGroupOrder) {
        return a.displayGroupOrder - b.displayGroupOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }

  const nodes: GroupNode[] = [];
  for (const [slug, members] of buckets) {
    const resolved = isKnownDisplayGroupSlug(slug)
      ? resolveGroup(slug as DisplayGroupSlug)
      : { label: "(Unknown)", individualized: false, renderCategory: "ungrouped" as const };
    const label =
      resolved.individualized && members[0] ? members[0].name : resolved.label;

    let sumLow = 0;
    let sumHigh = 0;
    for (const m of members) {
      sumLow += m.totalLow ?? 0;
      sumHigh += m.totalHigh ?? 0;
    }

    nodes.push({
      slug,
      label,
      isIndividualized: resolved.individualized,
      // Phase 8C.2: COPE is no longer pinned. `isLocked` is kept on the
      // node type so the render code's conditional branches stay intact
      // (they all degrade to the unlocked path when no node is locked).
      // Re-enable per-node locking here in the future if needed.
      isLocked: false,
      members,
      bucket: members[0]?.bucket ?? "BASE",
      sumLow,
      sumHigh,
    });
  }

  // Phase 8C.2: COPE is no longer pinned to the end. The default
  // categoryIndex for "cope" stays at 99 (below) so it lands last when
  // the user hasn't ordered it; once the user drags it, savedOrder wins.
  const userIndex = new Map(savedOrder.map((s, i) => [s, i]));
  nodes.sort((a, b) => {
    const aUser = userIndex.get(a.slug);
    const bUser = userIndex.get(b.slug);
    if (aUser !== undefined && bUser !== undefined) return aUser - bUser;
    if (aUser !== undefined) return -1;
    if (bUser !== undefined) return 1;
    const aCat = categoryIndex(a);
    const bCat = categoryIndex(b);
    if (aCat !== bCat) return aCat - bCat;
    return a.label.localeCompare(b.label);
  });

  return nodes;
}

function categoryIndex(node: GroupNode): number {
  if (isKnownDisplayGroupSlug(node.slug)) {
    const res = resolveGroup(node.slug as DisplayGroupSlug);
    switch (res.renderCategory) {
      case "primary-suite": return 0;
      case "kitchen-dining": return 1;
      case "living-spaces": return 2;
      case "bedroom": return 3;
      case "bathroom": return 4;
      case "carolina-room": return 5;
      // Phase 8A.1c — standalone groups slot between individualized
      // categories and the housekeeping groups (utility/outdoor/storage).
      case "standalone": return 6;
      case "utility": return 7;
      case "outdoor": return 8;
      case "storage": return 9;
      case "ungrouped": return 10;
      case "cope": return 99;
    }
  }
  return 10;
}

// Silence unused-import warning — DEFAULT_GROUP_ORDER is exported for consumers.
void DEFAULT_GROUP_ORDER;

// ─── reparentRoom ─────────────────────────────────────────────────────────

/**
 * When a room is dragged onto a parent header or onto another child:
 *   - Insert into target group (possibly crossing groups).
 *   - Re-number everyone in the target group by their new position.
 *   - If the active left a group, also re-number the source group.
 */
export function reparentRoom(args: {
  sections: SectionRow[];
  nodes: GroupNode[];
  activeRoomId: string;
  activeSourceSlug: string;
  targetGroupSlug: string;
  overRoomId: string | null;
}): DisplayGroupMove[] {
  const { sections, nodes, activeRoomId, activeSourceSlug, targetGroupSlug, overRoomId } = args;
  const targetNode = nodes.find((n) => n.slug === targetGroupSlug);
  const sourceNode = nodes.find((n) => n.slug === activeSourceSlug);

  const targetMembers = targetNode ? [...targetNode.members] : [];
  const activeRow = sections.find((s) => s.id === activeRoomId);
  if (!activeRow) return [];

  const insertIndex = (() => {
    if (!overRoomId) return targetMembers.length;
    const idx = targetMembers.findIndex((m) => m.id === overRoomId);
    return idx === -1 ? targetMembers.length : idx;
  })();

  if (activeSourceSlug === targetGroupSlug) {
    const curIdx = targetMembers.findIndex((m) => m.id === activeRoomId);
    if (curIdx !== -1) targetMembers.splice(curIdx, 1);
  }
  targetMembers.splice(insertIndex, 0, activeRow);

  const moves: DisplayGroupMove[] = targetMembers.map((m, i) => ({
    id: m.id,
    displayGroupId: targetGroupSlug,
    displayGroupOrder: i,
  }));

  if (sourceNode && activeSourceSlug !== targetGroupSlug) {
    const sourceMembers = sourceNode.members.filter((m) => m.id !== activeRoomId);
    for (let i = 0; i < sourceMembers.length; i++) {
      moves.push({
        id: sourceMembers[i].id,
        displayGroupId: activeSourceSlug,
        displayGroupOrder: i,
      });
    }
  }

  return moves;
}

// ─── moveGroup ───────────────────────────────────────────────────────────────

/**
 * Reorder a group: move `activeSlug` to `overSlug`'s position in the current
 * sort order. Phase 8C.2: COPE is now included in the move math (was
 * filtered out before because the server pinned it to the end).
 */
export function moveGroup(
  nodes: GroupNode[],
  activeSlug: string,
  overSlug: string
): string[] {
  const slugs = nodes.map((n) => n.slug);
  const fromIdx = slugs.indexOf(activeSlug);
  const toIdx = slugs.indexOf(overSlug);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return slugs;
  const next = [...slugs];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, activeSlug);
  return next;
}

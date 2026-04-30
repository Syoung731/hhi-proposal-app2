"use client";

/**
 * Investment tab — parent/child display-group tree with drag-to-reparent.
 *
 * Phase 8A.1b — visual redesign to match the AI estimate pattern
 * (`ai-estimate-panel.tsx`): tinted peach parent rows, compact row heights,
 * inline metadata, emoji group icons. All drag logic + data flow unchanged.
 *
 * Drag behaviors:
 *   - Child → parent header: reparents into that group.
 *   - Child → another child: inserts at target position; adopts target's
 *     parent slug if crossing groups.
 *   - Parent → parent: reorders group render order.
 *
 * COPE is locked (no drag). Single-room "groups" render flat. Null-pricing
 * rooms are hidden. Pure-logic helpers live in investment-group-tree-logic.ts.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateRoomDisplayGroup,
  updateProjectDisplayGroupOrder,
} from "./actions";
import { InvestmentAddGroupDropdown } from "./investment-add-group-dropdown";
import {
  InvestmentMergeRoomsPopup,
  type MergeRoomsPopupExistingGroup,
  type MergeRoomsPopupResolution,
  type MergeRoomsPopupRoom,
} from "./investment-merge-rooms-popup";
import { FIXED_GROUPS, type FixedGroupSlug } from "@/app/lib/investment/display-group-classifier";
import {
  BUCKET_LABELS,
  buildGroupNodes,
  buildIncludesText,
  formatRange,
  groupSortableId,
  hasPricing,
  moveGroup,
  reparentRoom,
  type AnyDragData,
  type GroupDragData,
  type GroupNode,
  type RoomDragData,
  type SectionRow,
} from "./investment-group-tree-logic";

export type { SectionRow } from "./investment-group-tree-logic";

type Props = {
  projectId: string;
  sections: SectionRow[];
  /** The project's saved group order (array of slugs). Empty = use default. */
  groupOrder: string[];
};

// ─── Visual constants ───────────────────────────────────────────────────────

/**
 * Group icons per slug / category. Emoji renders reliably across platforms and
 * matches the AI estimate panel's lightweight aesthetic.
 */
function groupIconFor(slug: string): string {
  if (slug === "primary-suite") return "🏠";
  if (slug === "kitchen-dining") return "🍳";
  if (slug === "living-spaces") return "🛋️";
  if (slug.startsWith("bedroom-")) return "🛏️";
  if (slug.startsWith("bathroom-")) return "🚿";
  if (slug.startsWith("carolina-room-")) return "☀️";
  if (slug === "utility") return "🧺";
  if (slug === "outdoor") return "🌳";
  if (slug === "storage") return "📦";
  if (slug === "cope") return "💼";
  return "📄"; // ungrouped
}

/**
 * For a standalone group, derive an icon from the underlying room's name —
 * mirrors the classifier's regex rules so a standalone "Primary Bath" still
 * shows 🚿. Returns "" when no rule matches (the row simply renders no icon).
 */
function standaloneIconFromName(name: string): string {
  const n = name.toLowerCase();
  if (/\b(primary|master)\b/.test(n)) return "🏠";
  if (/\b(kitchen|pantry|breakfast|dining|wet bar)\b/.test(n)) return "🍳";
  if (/\b(living room|family|great room|entry way|foyer)\b/.test(n)) return "🛋️";
  if (/\bcarolina\b/.test(n)) return "☀️";
  if (/\bbedroom\b/.test(n)) return "🛏️";
  if (/\b(bath|powder|jack)\b/.test(n)) return "🚿";
  if (/\b(laundry|mud)\b/.test(n)) return "🧺";
  if (/\b(exterior|outdoor|patio|deck|porch)\b/.test(n)) return "🌳";
  if (/\b(attic|basement|garage|storage)\b/.test(n)) return "📦";
  return "";
}

function iconForNode(node: GroupNode): string {
  if (node.slug.startsWith("standalone-")) {
    return standaloneIconFromName(node.members[0]?.name ?? "");
  }
  return groupIconFor(node.slug);
}

/** Shortened bucket label for the compact pill. */
function shortBucketLabel(bucket: string): string {
  if (bucket === "ALTERNATE") return "ALT";
  if (bucket === "ALLOWANCE") return "ALLOW";
  return BUCKET_LABELS[bucket] ?? bucket; // "Base"
}

// ─── Synthetic drop-zone ids ────────────────────────────────────────────────
// Phase 8A.1c: invisible drop targets between non-cope parent rows that
// promote a child room to a standalone top-level group, plus one ungroup
// zone above COPE.
const PROMOTE_ZONE_PREFIX = "root-promote-";
const UNGROUP_ZONE_ID = "root-ungroup";

type RootZoneData = { type: "root-zone"; kind: "promote" | "ungroup"; insertBeforeIndex?: number };

// ─── Main component ─────────────────────────────────────────────────────────

export function InvestmentGroupTree({ projectId, sections, groupOrder }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [localSections, setLocalSections] = useState<SectionRow[]>(sections);
  const [localGroupOrder, setLocalGroupOrder] = useState<string[]>(groupOrder);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [activeDrag, setActiveDrag] = useState<AnyDragData | null>(null);
  // Phase 8A.1c — transient empty groups added via "+ Add Group". Lost on
  // refresh until at least one room is dropped in (which creates the real
  // group on the server). Per spec.
  const [pendingEmptySlugs, setPendingEmptySlugs] = useState<Set<FixedGroupSlug>>(
    () => new Set(),
  );
  // Drag-merge popup state. Set when user drops one room onto another and
  // the two rooms aren't already in the same group — caller picks which
  // group to assign both rooms to (existing, fixed, or custom-named).
  const [mergePending, setMergePending] = useState<{
    draggedRoomId: string;
    targetRoomId: string;
  } | null>(null);

  useSyncProps(sections, setLocalSections);
  useSyncProps(groupOrder, setLocalGroupOrder);

  const nodes = useMemo(
    () => buildGroupNodes(localSections.filter(hasPricing), localGroupOrder),
    [localSections, localGroupOrder],
  );

  // Auto-clear pending-empty slugs once they have a real member — covers the
  // case where a drop persists and the placeholder should retire silently.
  useEffect(() => {
    const realSlugs = new Set(nodes.map((n) => n.slug));
    setPendingEmptySlugs((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const slug of prev) {
        if (realSlugs.has(slug)) {
          next.delete(slug);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nodes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const toggleExpanded = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as AnyDragData | undefined;
    if (data) setActiveDrag(data);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as AnyDragData | undefined;
      const overData = over.data.current as AnyDragData | RootZoneData | undefined;
      if (!activeData) return;

      // Parent-header drag: reorder groups.
      // Phase 8C.2: COPE is now reorderable like any other group (it used
      // to be locked at the bottom). The room-drop guard at line ~327 still
      // prevents dropping individual rooms INTO the COPE bucket — COPE is
      // a project-overhead accounting bucket, not a renovation space.
      if (activeData.type === "group" && overData?.type === "group") {
        // Both groups single-member (= each is a solo room rendered flat) →
        // treat as room-merge, not group-reorder. Otherwise dragging two
        // ungrouped rooms onto each other would just shuffle the tree
        // order without ever opening the merge popup.
        const activeNode = nodes.find((n) => n.slug === activeData.slug);
        const overNode = nodes.find((n) => n.slug === overData.slug);
        if (
          activeNode &&
          overNode &&
          !activeNode.isLocked &&
          !overNode.isLocked &&
          activeNode.members.length === 1 &&
          overNode.members.length === 1 &&
          activeNode.members[0].id !== overNode.members[0].id
        ) {
          setMergePending({
            draggedRoomId: activeNode.members[0].id,
            targetRoomId: overNode.members[0].id,
          });
          return;
        }
        const newSlugOrder = moveGroup(nodes, activeData.slug, overData.slug);
        setLocalGroupOrder(newSlugOrder);
        startTransition(async () => {
          const result = await updateProjectDisplayGroupOrder(projectId, newSlugOrder);
          if (result.error) {
            console.error("updateProjectDisplayGroupOrder:", result.error);
            router.refresh();
          }
        });
        return;
      }

      // Room drag: reparent, reorder within group, promote to standalone, or
      // explicit ungroup via the synthetic root drop zones.
      if (activeData.type === "room") {
        // ── Promote-to-standalone (Phase 8A.1c) ───────────────────────────
        if (overData?.type === "root-zone" && overData.kind === "promote") {
          const newSlug = `standalone-${activeData.roomId}`;
          // Don't re-promote a room that's already standalone in place; only
          // re-position via the saved order.
          const isAlreadyStandalone = activeData.slug === newSlug;

          // Source-group renumbering (if room is leaving a multi-member group).
          const moves: { id: string; displayGroupId: string; displayGroupOrder: number }[] = [];
          if (!isAlreadyStandalone) {
            moves.push({ id: activeData.roomId, displayGroupId: newSlug, displayGroupOrder: 0 });
            const sourceNode = nodes.find((n) => n.slug === activeData.slug);
            if (sourceNode) {
              const remaining = sourceNode.members.filter((m) => m.id !== activeData.roomId);
              for (let i = 0; i < remaining.length; i++) {
                moves.push({ id: remaining[i].id, displayGroupId: activeData.slug, displayGroupOrder: i });
              }
            }
          }

          // Compute new groupOrder: insert newSlug at the requested index.
          // Use the currently rendered sequence (excluding cope) as the basis
          // so the user's existing ordering is preserved.
          const insertIdx = overData.insertBeforeIndex ?? 0;
          const currentRendered = nodes.filter((n) => !n.isLocked).map((n) => n.slug);
          const stripped = currentRendered.filter((s) => s !== newSlug);
          const cappedIdx = Math.max(0, Math.min(insertIdx, stripped.length));
          const newOrder = [...stripped];
          newOrder.splice(cappedIdx, 0, newSlug);

          // Optimistic state update.
          if (moves.length > 0) {
            setLocalSections((prev) => {
              const map = new Map(prev.map((s) => [s.id, s]));
              for (const m of moves) {
                const row = map.get(m.id);
                if (row) {
                  map.set(m.id, {
                    ...row,
                    displayGroupId: m.displayGroupId,
                    displayGroupOrder: m.displayGroupOrder,
                  });
                }
              }
              return Array.from(map.values());
            });
          }
          setLocalGroupOrder(newOrder);

          startTransition(async () => {
            if (moves.length > 0) {
              const r1 = await updateRoomDisplayGroup(projectId, moves);
              if (r1.error) {
                console.error("updateRoomDisplayGroup (promote):", r1.error);
                router.refresh();
                return;
              }
            }
            const r2 = await updateProjectDisplayGroupOrder(projectId, newOrder);
            if (r2.error) {
              console.error("updateProjectDisplayGroupOrder (promote):", r2.error);
              router.refresh();
            }
          });
          return;
        }

        // ── Explicit ungroup zone ─────────────────────────────────────────
        if (overData?.type === "root-zone" && overData.kind === "ungroup") {
          const targetGroupSlug = "ungrouped";
          const moves = reparentRoom({
            sections: localSections,
            nodes,
            activeRoomId: activeData.roomId,
            activeSourceSlug: activeData.slug,
            targetGroupSlug,
            overRoomId: null,
          });
          if (moves.length === 0) return;
          setLocalSections((prev) => {
            const map = new Map(prev.map((s) => [s.id, s]));
            for (const m of moves) {
              const row = map.get(m.id);
              if (row) {
                map.set(m.id, {
                  ...row,
                  displayGroupId: m.displayGroupId,
                  displayGroupOrder: m.displayGroupOrder,
                });
              }
            }
            return Array.from(map.values());
          });
          startTransition(async () => {
            const result = await updateRoomDisplayGroup(projectId, moves);
            if (result.error) {
              console.error("updateRoomDisplayGroup (ungroup):", result.error);
              router.refresh();
            }
          });
          return;
        }

        // ── Drop-room-on-room → open merge popup if they're in different
        //    groups (or either is ungrouped). Same-group drops keep the
        //    existing reorder behavior below.
        if (overData?.type === "room") {
          const draggedSlug = activeData.slug || null;
          const targetSlug = overData.slug || null;
          const sameRealGroup =
            draggedSlug != null &&
            targetSlug != null &&
            draggedSlug === targetSlug &&
            draggedSlug !== "ungrouped";
          if (!sameRealGroup && overData.roomId !== activeData.roomId) {
            setMergePending({
              draggedRoomId: activeData.roomId,
              targetRoomId: overData.roomId,
            });
            return;
          }
        }

        // ── Default: reparent into / reorder within an existing group ─────
        const targetGroupSlug =
          overData?.type === "group"
            ? overData.slug
            : overData?.type === "room"
            ? overData.slug
            : null;
        if (!targetGroupSlug) return;
        if (targetGroupSlug === "cope") return; // locked

        const moves = reparentRoom({
          sections: localSections,
          nodes,
          activeRoomId: activeData.roomId,
          activeSourceSlug: activeData.slug,
          targetGroupSlug,
          overRoomId: overData?.type === "room" ? overData.roomId : null,
        });
        if (moves.length === 0) return;

        // Optimistic update.
        setLocalSections((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const m of moves) {
            const row = map.get(m.id);
            if (row) {
              map.set(m.id, {
                ...row,
                displayGroupId: m.displayGroupId,
                displayGroupOrder: m.displayGroupOrder,
              });
            }
          }
          return Array.from(map.values());
        });
        setExpanded((prev) => new Set(prev).add(targetGroupSlug));

        startTransition(async () => {
          const result = await updateRoomDisplayGroup(projectId, moves);
          if (result.error) {
            console.error("updateRoomDisplayGroup:", result.error);
            router.refresh();
          }
        });
      }
    },
    [projectId, nodes, localSections, router, startTransition],
  );

  // Resolve the merge popup: assign both the dragged and target rooms to the
  // chosen slug. Appends to the end of the target group (or starts a fresh
  // group if the slug is empty / brand-new). Calls updateRoomDisplayGroup
  // once with both moves + the optional custom label.
  const handleMergeResolve = useCallback(
    (resolution: MergeRoomsPopupResolution) => {
      if (!mergePending) return;
      const { draggedRoomId, targetRoomId } = mergePending;
      const { slug, label } = resolution;

      const existingMembers = localSections.filter((s) => s.displayGroupId === slug);
      const baseOrder = existingMembers.reduce(
        (max, s) => Math.max(max, s.displayGroupOrder ?? 0),
        -1,
      );
      const moves = [
        { id: targetRoomId, displayGroupId: slug, displayGroupOrder: baseOrder + 1 },
        { id: draggedRoomId, displayGroupId: slug, displayGroupOrder: baseOrder + 2 },
      ];

      // Optimistic update.
      setLocalSections((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        for (const m of moves) {
          const row = map.get(m.id);
          if (row) {
            map.set(m.id, {
              ...row,
              displayGroupId: m.displayGroupId,
              displayGroupOrder: m.displayGroupOrder,
            });
          }
        }
        return Array.from(map.values());
      });
      setExpanded((prev) => new Set(prev).add(slug));
      setMergePending(null);

      startTransition(async () => {
        const result = await updateRoomDisplayGroup(
          projectId,
          moves,
          label != null ? { slug, label } : null,
        );
        if (result.error) {
          console.error("updateRoomDisplayGroup (merge):", result.error);
          router.refresh();
        }
      });
    },
    [mergePending, localSections, projectId, router, startTransition],
  );

  // Build the popup-friendly view of existing groups: only multi-member
  // groups (single-member ones don't really exist post-degroup) and not the
  // groups currently containing the two rooms being merged.
  const popupExistingGroups = useMemo<MergeRoomsPopupExistingGroup[]>(() => {
    if (!mergePending) return [];
    const result: MergeRoomsPopupExistingGroup[] = [];
    for (const node of nodes) {
      if (node.isLocked) continue; // skip COPE
      if (node.members.length < 2) continue;
      result.push({
        slug: node.slug,
        label: node.label,
        memberCount: node.members.length,
      });
    }
    return result;
  }, [mergePending, nodes]);

  // Predefined fixed groups that aren't currently populated and aren't COPE.
  const popupFixedSlugs = useMemo<readonly FixedGroupSlug[]>(() => {
    const populated = new Set(
      localSections
        .map((s) => s.displayGroupId)
        .filter((s): s is string => !!s),
    );
    const candidates: FixedGroupSlug[] = [
      "primary-suite",
      "kitchen-dining",
      "living-spaces",
      "utility",
      "outdoor",
      "storage",
    ];
    return candidates.filter((slug) => !populated.has(slug));
  }, [localSections]);

  const popupRooms = useMemo<MergeRoomsPopupRoom[]>(
    () =>
      localSections.map((s) => ({
        id: s.id,
        name: s.name,
        isProjectOverhead: s.isProjectOverhead,
      })),
    [localSections],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Header strip — Add Group button right-aligned. */}
      <div className="mb-2 flex items-center justify-end">
        <InvestmentAddGroupDropdown
          projectId={projectId}
          sections={localSections}
          pendingEmptySlugs={pendingEmptySlugs}
          onAddEmptyGroup={(slug) =>
            setPendingEmptySlugs((prev) => new Set(prev).add(slug))
          }
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {nodes.length === 0 && pendingEmptySlugs.size === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No pricing data yet. Add rooms in the Sections tab.
          </div>
        ) : (
          (() => {
            const nonCope = nodes.filter((n) => !n.isLocked);
            const cope = nodes.find((n) => n.isLocked);
            const showRootZones = activeDrag?.type === "room";
            const pendingArr = Array.from(pendingEmptySlugs);
            return (
              <>
                {/* Empty placeholder rows — drop targets only. */}
                {pendingArr.map((slug) => (
                  <EmptyGroupPlaceholder
                    key={`pending-${slug}`}
                    slug={slug}
                    onDismiss={() =>
                      setPendingEmptySlugs((prev) => {
                        const next = new Set(prev);
                        next.delete(slug);
                        return next;
                      })
                    }
                  />
                ))}

                <SortableContext
                  items={nonCope.map((n) => groupSortableId(n.slug))}
                  /* No strategy: keep top-level rows static during drag.
                     verticalListSortingStrategy auto-shifts siblings to
                     preview an insertion position, which is helpful for
                     reorder but turns "drop ON another row to merge" into
                     a moving target. Drops still fire correctly without
                     the strategy — just no live-shift animation on the
                     non-dragged rows. Inner group children keep their
                     own SortableContext below for in-group reorder. */
                >
                  {nonCope.map((node, i) => (
                    <Fragment key={node.slug}>
                      <DropZone
                        id={`${PROMOTE_ZONE_PREFIX}${i}`}
                        kind="promote"
                        insertBeforeIndex={i}
                        visible={showRootZones}
                      />
                      <GroupRow
                        node={node}
                        expanded={expanded.has(node.slug)}
                        onToggle={() => toggleExpanded(node.slug)}
                      />
                    </Fragment>
                  ))}
                  <DropZone id={UNGROUP_ZONE_ID} kind="ungroup" visible={showRootZones} />
                  {cope && (
                    <GroupRow
                      node={cope}
                      expanded={expanded.has(cope.slug)}
                      onToggle={() => toggleExpanded(cope.slug)}
                    />
                  )}
                </SortableContext>
              </>
            );
          })()
        )}
      </div>

      <DragOverlay>{activeDrag ? <DragPreview data={activeDrag} /> : null}</DragOverlay>

      {mergePending && (() => {
        const dragged = popupRooms.find((r) => r.id === mergePending.draggedRoomId);
        const target = popupRooms.find((r) => r.id === mergePending.targetRoomId);
        // Drag state went stale (e.g. data refresh between dragend and render).
        // Bail rather than render a half-formed popup. Don't call setState
        // during render — the next data refresh will reset mergePending.
        if (!dragged || !target) return null;
        return (
          <InvestmentMergeRoomsPopup
            draggedRoom={dragged}
            targetRoom={target}
            allRooms={popupRooms}
            existingGroups={popupExistingGroups}
            fixedGroupSlugs={popupFixedSlugs}
            onResolve={handleMergeResolve}
            onCancel={() => setMergePending(null)}
          />
        );
      })()}
    </DndContext>
  );
}

// ─── Sortable rows ──────────────────────────────────────────────────────────

function GroupRow({
  node,
  expanded,
  onToggle,
}: {
  node: GroupNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isSingleRoom = node.members.length === 1;

  // Single-room groups render as a tinted parent row with the room's details
  // inline (no chevron, no children to expand). Matches the AI estimate's
  // flat "Final Construction Cleaning" row.
  if (isSingleRoom) {
    return <GroupHeaderRow node={node} expanded={false} onToggle={() => {}} flat />;
  }

  return (
    <>
      <GroupHeaderRow node={node} expanded={expanded} onToggle={onToggle} />

      {expanded && (
        <SortableContext
          items={node.members.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {node.members.map((m, i) => (
            <ChildRow key={m.id} member={m} groupSlug={node.slug} zebraIndex={i} />
          ))}
        </SortableContext>
      )}
    </>
  );
}

function GroupHeaderRow({
  node,
  expanded,
  onToggle,
  flat = false,
}: {
  node: GroupNode;
  expanded: boolean;
  onToggle: () => void;
  flat?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: groupSortableId(node.slug),
    data: { type: "group", slug: node.slug } as GroupDragData,
    disabled: node.isLocked,
  });

  const includesText = buildIncludesText(node.members);
  const displayName = flat && node.members[0] ? node.members[0].name : node.label;
  // Flat (single-room) rows show the room's own range directly; multi-room
  // groups show the summed range.
  const low = flat && node.members[0] ? node.members[0].totalLow : node.sumLow;
  const high = flat && node.members[0] ? node.members[0].totalHigh : node.sumHigh;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={
        "group/row flex items-center gap-2 border-b border-zinc-200 bg-orange-100 px-3 py-2 text-xs transition-colors " +
        (node.isLocked ? "" : "hover:bg-orange-200/70") +
        " dark:border-zinc-800"
      }
    >
      {/* Drag handle — visible on hover only, except locked (COPE). */}
      <span
        className={
          "flex h-4 w-3 shrink-0 items-center justify-center text-[11px] " +
          (node.isLocked
            ? "text-zinc-400"
            : "cursor-grab text-zinc-400 opacity-0 group-hover/row:opacity-100 hover:text-zinc-700")
        }
        {...(node.isLocked ? {} : attributes)}
        {...(node.isLocked ? {} : listeners)}
        title={node.isLocked ? "COPE is pinned at the end" : "Drag to reorder groups"}
        aria-label={node.isLocked ? "Locked" : "Drag handle"}
      >
        {node.isLocked ? "🔒" : "⋮⋮"}
      </span>

      {/* Chevron — hidden on flat single-room and locked rows. */}
      {flat || node.isLocked ? (
        <span className="w-3 shrink-0"></span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-4 w-3 shrink-0 items-center justify-center text-[10px] text-zinc-500 hover:text-zinc-800"
        >
          {expanded ? "▼" : "▶"}
        </button>
      )}

      {/* Group icon — empty string for standalone rows with no name match. */}
      {(() => {
        const icon = iconForNode(node);
        return icon ? (
          <span className="shrink-0 text-sm leading-none" aria-hidden>{icon}</span>
        ) : (
          <span className="w-1 shrink-0"></span>
        );
      })()}

      {/* Label + (optional) Includes descriptor inline */}
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
          {displayName}
        </span>
        {!flat && !expanded && includesText && (
          <span className="truncate text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
            {includesText}
          </span>
        )}
      </span>

      <BucketPill bucket={node.bucket} />

      <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
        {formatRange(low, high)}
      </span>
    </div>
  );
}

function ChildRow({
  member,
  groupSlug,
  zebraIndex,
}: {
  member: SectionRow;
  groupSlug: string;
  zebraIndex: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    data: { type: "room", slug: groupSlug, roomId: member.id } as RoomDragData,
  });

  const zebra = zebraIndex % 2 === 0 ? "bg-white" : "bg-zinc-50";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={
        "group/row flex items-center gap-2 border-b border-zinc-100 pl-10 pr-3 py-1.5 text-[13px] transition-colors " +
        zebra +
        " hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40"
      }
      title={member.sectionTypeName}
    >
      <span
        className="flex h-4 w-3 shrink-0 cursor-grab items-center justify-center text-[11px] text-zinc-400 opacity-0 group-hover/row:opacity-100 hover:text-zinc-700"
        {...attributes}
        {...listeners}
        aria-label="Drag handle"
      >
        ⋮⋮
      </span>
      <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-300">
        {member.name}
      </span>
      <BucketPill bucket={member.bucket} muted />
      <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-400">
        {formatRange(member.totalLow, member.totalHigh)}
      </span>
    </div>
  );
}

function BucketPill({ bucket, muted }: { bucket: string; muted?: boolean }) {
  const label = shortBucketLabel(bucket);
  const isBase = bucket === "BASE";
  const cls = muted
    ? "text-zinc-500 dark:text-zinc-500"
    : isBase
    ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    : "bg-amber-50 text-amber-700 border border-amber-200";
  return (
    <span
      className={
        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider " +
        cls
      }
    >
      {label}
    </span>
  );
}

function DragPreview({ data }: { data: AnyDragData }) {
  const text = data.type === "group" ? "Moving group…" : "Moving room…";
  return (
    <div className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium shadow-lg dark:border-zinc-600 dark:bg-zinc-900">
      {text}
    </div>
  );
}

// ─── Empty group placeholder (Phase 8A.1c) ──────────────────────────────────

/**
 * Transient drop target rendered for slugs the user picked from "+ Add Group"
 * that don't yet have any members. Disappears once a room is dropped onto
 * it (the placeholder slug becomes a real group on the next render via the
 * useEffect cleanup in InvestmentGroupTree).
 */
function EmptyGroupPlaceholder({
  slug,
  onDismiss,
}: {
  slug: FixedGroupSlug;
  onDismiss: () => void;
}) {
  // Use the same droppable id format as a real parent header — the existing
  // dragEnd handler treats this as `data: { type: "group", slug }`.
  const dropData: GroupDragData = { type: "group", slug };
  const { isOver, setNodeRef } = useDroppable({
    id: groupSortableId(slug),
    data: dropData,
  });
  const def = FIXED_GROUPS[slug];
  const icon = groupIconFor(slug);

  return (
    <div
      ref={setNodeRef}
      className={
        "flex items-center gap-2 border-b border-orange-200 bg-orange-50 px-3 py-2 text-xs " +
        (isOver ? "bg-orange-200" : "")
      }
    >
      <span className="w-3 shrink-0"></span>
      <span className="w-3 shrink-0"></span>
      {icon ? (
        <span className="shrink-0 text-sm leading-none" aria-hidden>{icon}</span>
      ) : (
        <span className="w-1 shrink-0"></span>
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-semibold text-orange-900">{def.label}</span>
        <span className="truncate text-[10px] font-normal italic text-orange-700">
          Drop rooms here
        </span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[12px] font-semibold text-orange-500 hover:text-orange-800"
        title="Dismiss empty group"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Root drop zones (Phase 8A.1c) ──────────────────────────────────────────

function DropZone({
  id,
  kind,
  insertBeforeIndex,
  visible,
}: {
  id: string;
  kind: "promote" | "ungroup";
  insertBeforeIndex?: number;
  visible: boolean;
}) {
  const data: RootZoneData = { type: "root-zone", kind, insertBeforeIndex };
  const { isOver, setNodeRef } = useDroppable({ id, data });

  // Hidden when no drag in progress — render nothing so the tree layout is
  // unchanged in idle state.
  if (!visible) return null;

  const baseTone =
    kind === "promote"
      ? "bg-orange-200/60 text-orange-900"
      : "bg-zinc-200/60 text-zinc-700";
  const overTone =
    kind === "promote"
      ? "bg-orange-400 text-white"
      : "bg-zinc-500 text-white";
  const label =
    kind === "promote"
      ? "Drop here to make standalone"
      : "Drop here to ungroup";

  return (
    <div
      ref={setNodeRef}
      className={
        "flex items-center justify-center overflow-hidden text-[10px] font-medium uppercase tracking-wider transition-all " +
        (isOver ? `${overTone} h-7` : `${baseTone} h-2 text-transparent`)
      }
      aria-label={label}
    >
      {isOver ? label : ""}
    </div>
  );
}

// ─── Tiny hook: reset local state when props change ─────────────────────────

function useSyncProps<T>(incoming: T, setLocal: (v: T) => void) {
  const prevRef = useRef(incoming);
  useEffect(() => {
    if (prevRef.current !== incoming) {
      prevRef.current = incoming;
      setLocal(incoming);
    }
  }, [incoming, setLocal]);
}

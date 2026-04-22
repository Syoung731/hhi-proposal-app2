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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateRoomDisplayGroup,
  updateProjectDisplayGroupOrder,
} from "./actions";
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

/** Shortened bucket label for the compact pill. */
function shortBucketLabel(bucket: string): string {
  if (bucket === "ALTERNATE") return "ALT";
  if (bucket === "ALLOWANCE") return "ALLOW";
  return BUCKET_LABELS[bucket] ?? bucket; // "Base"
}

// ─── Main component ─────────────────────────────────────────────────────────

export function InvestmentGroupTree({ projectId, sections, groupOrder }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [localSections, setLocalSections] = useState<SectionRow[]>(sections);
  const [localGroupOrder, setLocalGroupOrder] = useState<string[]>(groupOrder);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [activeDrag, setActiveDrag] = useState<AnyDragData | null>(null);

  useSyncProps(sections, setLocalSections);
  useSyncProps(groupOrder, setLocalGroupOrder);

  const nodes = useMemo(
    () => buildGroupNodes(localSections.filter(hasPricing), localGroupOrder),
    [localSections, localGroupOrder],
  );

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
      const overData = over.data.current as AnyDragData | undefined;
      if (!activeData) return;

      // Parent-header drag: reorder groups.
      if (activeData.type === "group" && overData?.type === "group") {
        if (activeData.slug === "cope" || overData.slug === "cope") return;
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

      // Room drag: reparent or reorder within group.
      if (activeData.type === "room") {
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {nodes.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No pricing data yet. Add rooms in the Sections tab.
          </div>
        ) : (
          <SortableContext
            items={nodes.filter((n) => !n.isLocked).map((n) => groupSortableId(n.slug))}
            strategy={verticalListSortingStrategy}
          >
            {nodes.map((node) => (
              <GroupRow
                key={node.slug}
                node={node}
                expanded={expanded.has(node.slug)}
                onToggle={() => toggleExpanded(node.slug)}
              />
            ))}
          </SortableContext>
        )}
      </div>

      <DragOverlay>{activeDrag ? <DragPreview data={activeDrag} /> : null}</DragOverlay>
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

      {/* Group icon */}
      <span className="shrink-0 text-sm leading-none" aria-hidden>
        {groupIconFor(node.slug)}
      </span>

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

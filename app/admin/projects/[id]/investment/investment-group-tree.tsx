"use client";

/**
 * Investment tab — parent/child display-group tree with drag-to-reparent.
 *
 * Drag behaviors:
 *   - Child → parent header: reparents into that group (displayGroupId swap).
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
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
          <span className="w-4"></span>
          <span className="w-4"></span>
          <span>Section</span>
          <span>Bucket</span>
          <span className="text-right">Range</span>
        </div>

        {nodes.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No sections with pricing yet.
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

  if (isSingleRoom) {
    return (
      <GroupHeaderRow node={node} expanded={false} onToggle={() => {}} flat>
        <SingleRoomInline node={node} />
      </GroupHeaderRow>
    );
  }

  return (
    <>
      <GroupHeaderRow node={node} expanded={expanded} onToggle={onToggle}>
        <GroupHeaderContent node={node} expanded={expanded} />
      </GroupHeaderRow>

      {expanded && (
        <SortableContext
          items={node.members.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {node.members.map((m) => (
            <ChildRow key={m.id} member={m} groupSlug={node.slug} />
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
  children,
}: {
  node: GroupNode;
  expanded: boolean;
  onToggle: () => void;
  flat?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: groupSortableId(node.slug),
    data: { type: "group", slug: node.slug } as GroupDragData,
    disabled: node.isLocked,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={
        "border-t border-zinc-100 dark:border-zinc-800 " +
        (flat ? "" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50")
      }
    >
      <div className="grid w-full grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
        <span
          className={
            "flex h-5 w-4 items-center justify-center text-xs " +
            (node.isLocked
              ? "text-zinc-400"
              : "cursor-grab text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200")
          }
          {...(node.isLocked ? {} : attributes)}
          {...(node.isLocked ? {} : listeners)}
          title={node.isLocked ? "COPE is pinned at the end" : "Drag to reorder groups"}
          aria-label={node.isLocked ? "Locked" : "Drag handle"}
        >
          {node.isLocked ? "🔒" : "⋮⋮"}
        </span>
        {flat ? (
          <span className="w-4"></span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex h-5 w-4 items-center justify-center text-zinc-400"
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function GroupHeaderContent({ node, expanded }: { node: GroupNode; expanded: boolean }) {
  const includesText = buildIncludesText(node.members);
  return (
    <>
      <span className="flex flex-col">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{node.label}</span>
        {includesText && !expanded && (
          <span className="mt-0.5 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
            {includesText}
          </span>
        )}
      </span>
      <BucketBadge bucket={node.bucket} />
      <span className="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {formatRange(node.sumLow, node.sumHigh)}
      </span>
    </>
  );
}

function SingleRoomInline({ node }: { node: GroupNode }) {
  const m = node.members[0];
  return (
    <>
      <span className="truncate text-zinc-900 dark:text-zinc-100" title={m.sectionTypeName}>
        {m.name}
      </span>
      <BucketBadge bucket={m.bucket} />
      <span className="text-right font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
        {formatRange(m.totalLow, m.totalHigh)}
      </span>
    </>
  );
}

function ChildRow({ member, groupSlug }: { member: SectionRow; groupSlug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    data: { type: "room", slug: groupSlug, roomId: member.id } as RoomDragData,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-1.5 text-[13px] dark:border-zinc-800 dark:bg-zinc-900/40"
      title={member.sectionTypeName}
    >
      <span
        className="flex h-5 w-4 cursor-grab items-center justify-center text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        {...attributes}
        {...listeners}
        aria-label="Drag handle"
      >
        ⋮⋮
      </span>
      <span className="w-4 text-zinc-400">↳</span>
      <span className="truncate text-zinc-700 dark:text-zinc-300">{member.name}</span>
      <BucketBadge bucket={member.bucket} muted />
      <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">
        {formatRange(member.totalLow, member.totalHigh)}
      </span>
    </div>
  );
}

function BucketBadge({ bucket, muted }: { bucket: string; muted?: boolean }) {
  const label = BUCKET_LABELS[bucket] ?? bucket;
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (muted
          ? "bg-transparent text-zinc-500 dark:text-zinc-500"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
      }
    >
      {label}
    </span>
  );
}

function DragPreview({ data }: { data: AnyDragData }) {
  const text = data.type === "group" ? `Group: ${data.slug}` : `Room`;
  return (
    <div className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs shadow-lg dark:border-zinc-600 dark:bg-zinc-900">
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

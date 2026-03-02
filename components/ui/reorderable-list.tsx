"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type ReorderableListProps<T extends { id: string }> = {
  items: T[];
  onReorder: (newItems: T[]) => void;
  renderItem: (item: T) => React.ReactNode;
  disabled?: boolean;
  className?: string;
};

const pointerSensor = { activationConstraint: { distance: 8 } };

function DragHandle({
  attributes,
  listeners,
  disabled,
}: {
  attributes: object;
  listeners: object | undefined;
  disabled?: boolean;
}) {
  return (
    <span
      className={`shrink-0 flex cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 touch-none ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      title="Drag to reorder"
      aria-label="Drag to reorder"
      {...(disabled ? {} : { ...attributes, ...listeners })}
    >
      <span className="grid grid-cols-2 gap-0.5" aria-hidden>
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
    </span>
  );
}

function SortableRow<T extends { id: string }>({
  item,
  renderItem,
  disabled,
}: {
  item: T;
  renderItem: (item: T) => React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.12)" : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2 first:border-t-0 dark:border-zinc-700"
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        disabled={disabled}
      />
      <div className="min-w-0 flex-1">{renderItem(item)}</div>
    </li>
  );
}

export function ReorderableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  className = "",
}: ReorderableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, pointerSensor),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newItems = arrayMove(items, oldIndex, newIndex);
    onReorder(newItems);
  }

  if (items.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ul
          className={
            "rounded-lg border border-zinc-200 dark:border-zinc-700 " + className
          }
        >
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              renderItem={renderItem}
              disabled={disabled}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnmatchedRoomItem } from "./actions";
import {
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
  reorderRoomsAction,
  generateRoomsFromTranscriptAction,
  updateRoomScopesFromTranscriptAction,
  rewriteRoomScopeAction,
  updateRoomsRoomType,
  updateRoomStylePresetAction,
} from "./actions";
import { getRoomTypes } from "@/app/admin/settings/actions";
import { NewRoomTypesModal } from "./new-room-types-modal";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
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

type Room = {
  id: string;
  name: string;
  scopeNarrative: string;
  scopeSource?: string | null;
  scopeUpdatedAt?: Date | string | null;
  sortOrder: number;
  roomTypeId?: string | null;
  roomType?: { id: string; name: string } | null;
  stylePresetId?: string | null;
  stylePreset?: { id: string; name: string } | null;
};

type RoomTypeOption = { id: string; name: string };
type StylePresetOption = { id: string; name: string };

type Props = {
  projectId: string;
  rooms: Room[];
  stylePresets: StylePresetOption[];
};

function formatScopeUpdatedAt(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function RoomsTab({ projectId, rooms: initialRooms, stylePresets }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [rooms, setRooms] = useState<Room[]>(() =>
    [...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showUpdateScopesConfirm, setShowUpdateScopesConfirm] = useState(false);
  const [rewritingRoomId, setRewritingRoomId] = useState<string | null>(null);
  const [unmatchedRooms, setUnmatchedRooms] = useState<UnmatchedRoomItem[] | null>(null);
  const [activeRoomTypes, setActiveRoomTypes] = useState<RoomTypeOption[]>([]);
  const [updatingRoomTypeId, setUpdatingRoomTypeId] = useState<string | null>(null);
  const [updatingStylePresetRoomId, setUpdatingStylePresetRoomId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    getRoomTypes().then((list) => {
      setActiveRoomTypes((list ?? []).filter((r) => r.active).map((r) => ({ id: r.id, name: r.name })));
    });
  }, []);
  useEffect(() => {
    setRooms([...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initialRooms]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this room? Associated media will be unlinked.")) return;
    await deleteRoomAction(projectId, roomId);
    router.refresh();
  }

  async function handleGenerateFromTranscript() {
    setGenerating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await generateRoomsFromTranscriptAction(projectId);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        setStatusMessage(
          `Generated ${result.created} rooms. Skipped ${result.skipped} duplicates.`
        );
        if (result.unmatchedRooms?.length) {
          setUnmatchedRooms(result.unmatchedRooms);
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  function openUpdateScopesConfirm() {
    setShowUpdateScopesConfirm(true);
  }

  async function handleUpdateFromTranscriptConfirm() {
    setShowUpdateScopesConfirm(false);
    setUpdating(true);
    setStatusMessage(null);
    setUnmatchedRooms(null);
    try {
      const result = await updateRoomScopesFromTranscriptAction(projectId);
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
      } else {
        setStatusMessage(
          `Updated ${result.updated} rooms. Added ${result.created} new. Skipped ${result.skipped}.`
        );
        if (result.unmatchedRooms?.length) {
          setUnmatchedRooms(result.unmatchedRooms);
        }
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleRewriteScope(roomId: string) {
    setRewritingRoomId(roomId);
    setStatusMessage(null);
    try {
      const result = await rewriteRoomScopeAction(projectId, roomId);
      router.refresh();
      if (result.error) setStatusMessage(result.error);
    } finally {
      setRewritingRoomId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rooms.findIndex((r) => r.id === active.id);
    const newIndex = rooms.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newRooms = arrayMove(rooms, oldIndex, newIndex);
    setRooms(newRooms);

    const orderedIds = newRooms.map((r) => r.id);
    await reorderRoomsAction(projectId, orderedIds);
    router.refresh();
  }

  async function handleRoomTypeChange(roomId: string, roomTypeId: string | null) {
    setUpdatingRoomTypeId(roomId);
    await updateRoomsRoomType([roomId], roomTypeId);
    router.refresh();
    setUpdatingRoomTypeId(null);
  }

  async function handleRoomStylePresetChange(roomId: string, stylePresetId: string | null) {
    setUpdatingStylePresetRoomId(roomId);
    await updateRoomStylePresetAction(projectId, roomId, stylePresetId);
    router.refresh();
    setUpdatingStylePresetRoomId(null);
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <RoomForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
          submitAction={createRoomAction}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Add room
          </button>
          <button
            type="button"
            onClick={handleGenerateFromTranscript}
            disabled={generating || updating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {generating ? "Generating…" : "Generate rooms from transcript"}
          </button>
          <button
            type="button"
            onClick={openUpdateScopesConfirm}
            disabled={updating || generating}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {updating ? "Updating…" : "Update scopes from transcript"}
          </button>
        </div>
      )}
      {showUpdateScopesConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-scopes-confirm-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="update-scopes-confirm-title"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Update scopes from transcript
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will overwrite scope paragraphs for existing rooms. Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUpdateScopesConfirm(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateFromTranscriptConfirm}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {unmatchedRooms != null && unmatchedRooms.length > 0 && (
        <NewRoomTypesModal
          projectId={projectId}
          unmatchedRooms={unmatchedRooms}
          onClose={() => setUnmatchedRooms(null)}
        />
      )}
      {statusMessage && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusMessage}
        </p>
      )}
      {!mounted || editingId ? (
        <div className="space-y-2">
          {rooms.map((room) => (
            <StaticRoomCard
              key={room.id}
              projectId={projectId}
              room={room}
              activeRoomTypes={activeRoomTypes}
              stylePresets={stylePresets}
              updatingRoomTypeId={updatingRoomTypeId}
              updatingStylePresetRoomId={updatingStylePresetRoomId}
              onRoomTypeChange={handleRoomTypeChange}
              onRoomStylePresetChange={handleRoomStylePresetChange}
              isEditing={editingId === room.id}
              isRewriting={rewritingRoomId === room.id}
              onEdit={() => setEditingId(room.id)}
              onDoneEdit={() => {
                setEditingId(null);
                router.refresh();
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(room.id)}
              onRewriteScope={() => handleRewriteScope(room.id)}
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rooms.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rooms.map((room) => (
                <SortableRoomCard
                  key={room.id}
                  projectId={projectId}
                  room={room}
                  activeRoomTypes={activeRoomTypes}
                  stylePresets={stylePresets}
                  updatingRoomTypeId={updatingRoomTypeId}
                  updatingStylePresetRoomId={updatingStylePresetRoomId}
                  onRoomTypeChange={handleRoomTypeChange}
                  onRoomStylePresetChange={handleRoomStylePresetChange}
                  isEditing={editingId === room.id}
                  isRewriting={rewritingRoomId === room.id}
                  onEdit={() => setEditingId(room.id)}
                  onDoneEdit={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(room.id)}
                  onRewriteScope={() => handleRewriteScope(room.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function StaticRoomCard({
  projectId,
  room,
  activeRoomTypes,
  stylePresets,
  updatingRoomTypeId,
  updatingStylePresetRoomId,
  onRoomTypeChange,
  onRoomStylePresetChange,
  isEditing,
  isRewriting,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  stylePresets: StylePresetOption[];
  updatingRoomTypeId: string | null;
  updatingStylePresetRoomId: string | null;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onRoomStylePresetChange: (roomId: string, stylePresetId: string | null) => void;
  isEditing: boolean;
  isRewriting: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {isEditing ? (
        <RoomForm
          projectId={projectId}
          room={room}
          onDone={onDoneEdit}
          onCancel={onCancelEdit}
          submitAction={updateRoomAction}
        />
      ) : (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                {room.name}
              </h3>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Room type:
              </span>
              <select
                value={room.roomTypeId ?? ""}
                onChange={(e) =>
                  onRoomTypeChange(room.id, e.target.value || null)
                }
                disabled={updatingRoomTypeId === room.id}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                aria-label="Room type"
              >
                <option value="">Custom</option>
                {activeRoomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>
              <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                Style preset:
              </span>
              <select
                value={room.stylePresetId ?? ""}
                onChange={(e) =>
                  onRoomStylePresetChange(room.id, e.target.value || null)
                }
                disabled={updatingStylePresetRoomId === room.id}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                aria-label="Style preset for this room"
              >
                <option value="">Default (project or first active)</option>
                {stylePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {room.scopeNarrative || "—"}
            </p>
            <p
              className={
                room.scopeSource === "MANUAL"
                  ? "mt-1 text-xs text-green-600 dark:text-green-400"
                  : "mt-1 text-xs text-red-600 dark:text-red-400"
              }
            >
              {room.scopeSource === "MANUAL" ? "Manually updated" : "Updated by AI"}
              {room.scopeUpdatedAt != null && (
                <> · {formatScopeUpdatedAt(room.scopeUpdatedAt)}</>
              )}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={onRewriteScope}
              disabled={isRewriting}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isRewriting ? "Rewriting…" : "Rewrite with AI"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-36 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-zinc-800"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableRoomCard({
  projectId,
  room,
  activeRoomTypes,
  stylePresets,
  updatingRoomTypeId,
  updatingStylePresetRoomId,
  onRoomTypeChange,
  onRoomStylePresetChange,
  isEditing,
  isRewriting,
  onEdit,
  onDoneEdit,
  onCancelEdit,
  onDelete,
  onRewriteScope,
}: {
  projectId: string;
  room: Room;
  activeRoomTypes: RoomTypeOption[];
  stylePresets: StylePresetOption[];
  updatingRoomTypeId: string | null;
  updatingStylePresetRoomId: string | null;
  onRoomTypeChange: (roomId: string, roomTypeId: string | null) => void;
  onRoomStylePresetChange: (roomId: string, stylePresetId: string | null) => void;
  isEditing: boolean;
  isRewriting: boolean;
  onEdit: () => void;
  onDoneEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRewriteScope: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: room.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: "move" as const,
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
    opacity: isDragging ? 0.98 : 1,
    userSelect: isDragging ? ("none" as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {isEditing ? (
        <RoomForm
          projectId={projectId}
          room={room}
          onDone={onDoneEdit}
          onCancel={onCancelEdit}
          submitAction={updateRoomAction}
        />
      ) : (
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <button
              type="button"
              className="mt-0.5 shrink-0 flex cursor-move select-none text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              {...attributes}
              {...listeners}
            >
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                  {room.name}
                </h3>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Room type:
                </span>
                <select
                  value={room.roomTypeId ?? ""}
                  onChange={(e) =>
                    onRoomTypeChange(room.id, e.target.value || null)
                  }
                  disabled={updatingRoomTypeId === room.id}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Room type"
                >
                  <option value="">Custom</option>
                  {activeRoomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
                <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Style preset:
                </span>
                <select
                  value={room.stylePresetId ?? ""}
                  onChange={(e) =>
                    onRoomStylePresetChange(room.id, e.target.value || null)
                  }
                  disabled={updatingStylePresetRoomId === room.id}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  aria-label="Style preset for this room"
                >
                  <option value="">Default (project or first active)</option>
                  {stylePresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                {room.scopeNarrative || "—"}
              </p>
              <p
                className={
                  room.scopeSource === "MANUAL"
                    ? "mt-1 text-xs text-green-600 dark:text-green-400"
                    : "mt-1 text-xs text-red-600 dark:text-red-400"
                }
              >
                {room.scopeSource === "MANUAL" ? "Manually updated" : "Updated by AI"}
                {room.scopeUpdatedAt != null && (
                  <> · {formatScopeUpdatedAt(room.scopeUpdatedAt)}</>
                )}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex flex-col gap-2 items-stretch">
            <button
              type="button"
              onClick={onRewriteScope}
              disabled={isRewriting}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isRewriting ? "Rewriting…" : "Rewrite with AI"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-36 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-zinc-800"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomForm({
  projectId,
  room,
  onDone,
  onCancel,
  submitAction,
}: {
  projectId: string;
  room?: Room;
  onDone: () => void;
  onCancel: () => void;
  submitAction: typeof createRoomAction | typeof updateRoomAction;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const [scopeNarrative, setScopeNarrative] = useState(room?.scopeNarrative ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("name", name);
    formData.set("scopeNarrative", scopeNarrative);
    if (room) {
      await (submitAction as typeof updateRoomAction)(projectId, room.id, formData);
    } else {
      await (submitAction as typeof createRoomAction)(projectId, formData);
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Room name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kitchen, Primary Bath"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Scope narrative (paragraph)
        </label>
        <textarea
          value={scopeNarrative}
          onChange={(e) => setScopeNarrative(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {room ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
  moveRoomOrderAction,
} from "./actions";
import { RoomType } from "@/app/generated/prisma";

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: RoomType.KITCHEN, label: "Kitchen" },
  { value: RoomType.BATHROOM, label: "Bathroom" },
  { value: RoomType.LIVING_ROOM, label: "Living room" },
  { value: RoomType.BEDROOM, label: "Bedroom" },
  { value: RoomType.DINING_ROOM, label: "Dining room" },
  { value: RoomType.OFFICE, label: "Office" },
  { value: RoomType.BASEMENT, label: "Basement" },
  { value: RoomType.GARAGE, label: "Garage" },
  { value: RoomType.LAUNDRY, label: "Laundry" },
  { value: RoomType.MUDROOM, label: "Mudroom" },
  { value: RoomType.OTHER, label: "Other" },
];

type Room = {
  id: string;
  roomType: string;
  roomLabel: string | null;
  scopeNarrative: string;
  sortOrder: number;
};

type Props = {
  projectId: string;
  rooms: Room[];
};

export function RoomsTab({ projectId, rooms: initialRooms }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleDelete(roomId: string) {
    if (!confirm("Delete this room? Associated media will be unlinked.")) return;
    await deleteRoomAction(projectId, roomId);
    router.refresh();
  }

  async function handleMove(roomId: string, direction: "up" | "down") {
    await moveRoomOrderAction(projectId, roomId, direction);
    router.refresh();
  }

  const sorted = [...initialRooms].sort((a, b) => a.sortOrder - b.sortOrder);

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
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add room
        </button>
      )}
      <div className="space-y-2">
        {sorted.map((room, i) => (
          <div
            key={room.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {editingId === room.id ? (
              <RoomForm
                projectId={projectId}
                room={room}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
                submitAction={updateRoomAction}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {room.roomType.replace(/_/g, " ")}
                      {room.roomLabel ? ` – ${room.roomLabel}` : ""}
                    </h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {room.scopeNarrative || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(room.id, "up")}
                      disabled={i === 0}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(room.id, "down")}
                      disabled={i === sorted.length - 1}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(room.id)}
                      className="text-xs text-zinc-600 hover:underline dark:text-zinc-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(room.id)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
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
  const [roomType, setRoomType] = useState(room?.roomType ?? RoomType.OTHER);
  const [roomLabel, setRoomLabel] = useState(room?.roomLabel ?? "");
  const [scopeNarrative, setScopeNarrative] = useState(room?.scopeNarrative ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("roomType", roomType);
    formData.set("roomLabel", roomLabel);
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
          Room type
        </label>
        <select
          value={roomType}
          onChange={(e) => setRoomType(e.target.value as RoomType)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {ROOM_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {roomType === RoomType.OTHER && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Custom label
          </label>
          <input
            type="text"
            value={roomLabel}
            onChange={(e) => setRoomLabel(e.target.value)}
            placeholder="e.g. Primary suite"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      )}
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

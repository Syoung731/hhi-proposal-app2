"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addRoomTypeAction,
  toggleRoomTypeActiveAction,
  toggleRoomTypeExteriorAction,
  reorderRoomTypes,
  updateRoomTypeNameAction,
  deleteRoomTypeAction,
} from "./actions";
import type { RoomTypeForUI } from "./settings-tabs";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = { roomTypes: RoomTypeForUI[] };

function sortByOrder(rooms: RoomTypeForUI[]) {
  return [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function RoomTypesTab({ roomTypes: initialRoomTypes }: Props) {
  const router = useRouter();
  const [orderedRoomTypes, setOrderedRoomTypes] = useState<RoomTypeForUI[]>(() =>
    sortByOrder(initialRoomTypes)
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExterior, setNewExterior] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    setOrderedRoomTypes(sortByOrder(initialRoomTypes));
  }, [initialRoomTypes]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    const formData = new FormData();
    formData.set("name", newName.trim());
    formData.set("exterior", newExterior ? "on" : "off");
    const result = await addRoomTypeAction(formData);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    setAdding(false);
    setNewName("");
    setNewExterior(false);
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  async function handleToggleActive(id: string, current: boolean) {
    await toggleRoomTypeActiveAction(id, !current);
    router.refresh();
  }

  async function handleToggleExterior(id: string, current: boolean) {
    await toggleRoomTypeExteriorAction(id, !current);
    router.refresh();
  }

  function handleDragStart(e: React.DragEvent, roomId: string) {
    setDraggedId(roomId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", roomId);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }

  function handleDragLeave() {
    setDropTargetIndex(null);
  }

  async function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const roomId = e.dataTransfer.getData("text/plain") || draggedId;
    setDropTargetIndex(null);
    setDraggedId(null);
    if (!roomId) return;
    const from = orderedRoomTypes.findIndex((r) => r.id === roomId);
    if (from === -1 || from === dropIndex) return;
    let to = dropIndex;
    if (to > from) to -= 1;
    const copy = [...orderedRoomTypes];
    const [removed] = copy.splice(from, 1);
    copy.splice(to, 0, removed);
    setOrderedRoomTypes(copy);
    await reorderRoomTypes(copy.map((r) => r.id));
    router.refresh();
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropTargetIndex(null);
  }

  async function handleSaveName(id: string) {
    if (editName.trim() === "") return;
    setStatus("saving");
    const result = await updateRoomTypeNameAction(id, editName.trim());
    if (result.error) {
      setErrorMessage(result.error);
      setStatus("error");
      return;
    }
    setEditingId(null);
    setEditName("");
    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  function startEdit(room: RoomTypeForUI) {
    setEditingId(room.id);
    setEditName(room.name);
    setErrorMessage(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this room type?")) return;
    await deleteRoomTypeAction(id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Room Types
      </h2>

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <div>
            <label htmlFor="newRoomTypeName" className={labelClass}>
              Name
            </label>
            <input
              id="newRoomTypeName"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Kitchen"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="newExterior"
              type="checkbox"
              checked={newExterior}
              onChange={(e) => setNewExterior(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
            />
            <label htmlFor="newExterior" className="text-sm text-zinc-700 dark:text-zinc-300">
              Exterior
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={status === "saving"}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewExterior(false);
              }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add new room type
        </button>
      )}

      {(status === "saved" || status === "error") && (
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved successfully.
            </span>
          )}
          {status === "error" && errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Order
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Name
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Active
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Exterior
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedRoomTypes.map((room, index) => (
              <tr
                key={room.id}
                draggable
                onDragStart={(e) => handleDragStart(e, room.id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`border-t border-zinc-200 dark:border-zinc-700 ${
                  draggedId === room.id ? "opacity-50" : ""
                } ${
                  dropTargetIndex === index ? "bg-zinc-100 dark:bg-zinc-800" : ""
                }`}
              >
                <td className="px-4 py-2">
                  <span
                    className="inline-block cursor-grab text-zinc-400 dark:text-zinc-500"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    ⋮⋮
                  </span>
                </td>
                <td className="px-4 py-2">
                  {editingId === room.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-[180px] rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveName(room.id)}
                        className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                        className="text-sm text-zinc-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(room)}
                      className="text-left font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {room.name}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(room.id, room.active)}
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (room.active
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400")
                    }
                  >
                    {room.active ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleToggleExterior(room.id, room.exterior)}
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (room.exterior
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400")
                    }
                  >
                    {room.exterior ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(room.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

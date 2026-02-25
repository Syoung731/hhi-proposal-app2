"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoomTypes } from "@/app/admin/settings/actions";
import type { RoomTypeForUI } from "@/app/admin/settings/settings-tabs";
import {
  bulkResolveNewRoomTypes,
  type UnmatchedRoomItem,
} from "./actions";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnSecondary =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
const btnPrimary =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

type RowState = {
  selectedRoomTypeId: string;
  creatingNew: boolean;
  exterior: boolean;
};

type Props = {
  projectId: string;
  unmatchedRooms: UnmatchedRoomItem[];
  onClose: () => void;
};

export function NewRoomTypesModal({ projectId, unmatchedRooms, onClose }: Props) {
  const router = useRouter();
  const [roomTypes, setRoomTypes] = useState<RoomTypeForUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const u of unmatchedRooms) {
      init[u.name] = { selectedRoomTypeId: "", creatingNew: false, exterior: false };
    }
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    getRoomTypes().then((list) => {
      if (!cancelled) {
        setRoomTypes(list ?? []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setStateFor(name: string, patch: Partial<RowState>) {
    setRowState((prev) => ({
      ...prev,
      [name]: { ...prev[name]!, ...patch },
    }));
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    const resolutions = unmatchedRooms.map((u) => {
      const state = rowState[u.name]!;
      if (state.creatingNew) {
        return {
          name: u.name,
          roomIds: u.roomIds,
          createNew: { exterior: state.exterior },
        };
      }
      if (state.selectedRoomTypeId) {
        return {
          name: u.name,
          roomIds: u.roomIds,
          roomTypeId: state.selectedRoomTypeId,
        };
      }
      return { name: u.name, roomIds: u.roomIds };
    });
    const result = await bulkResolveNewRoomTypes(projectId, resolutions);
    if (result.error) {
      setError(result.error);
      setApplying(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-room-types-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h2
            id="new-room-types-title"
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            New Room Types Found
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Map to an existing type or create new ones. Skip to leave rooms custom (no library type).
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading room types…</p>
          ) : (
            <ul className="space-y-4">
              {unmatchedRooms.map((u) => {
                const state = rowState[u.name]!;
                return (
                  <li
                    key={u.name}
                    className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                  >
                    <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {u.name}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label htmlFor={`map-${u.name}`} className={labelClass}>
                          Map to existing
                        </label>
                        <select
                          id={`map-${u.name}`}
                          className={inputClass + " w-full"}
                          value={state.selectedRoomTypeId}
                          disabled={state.creatingNew}
                          onChange={(e) =>
                            setStateFor(u.name, {
                              selectedRoomTypeId: e.target.value,
                              creatingNew: false,
                            })
                          }
                        >
                          <option value="">—</option>
                          {roomTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name}
                              {rt.exterior ? " (exterior)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() =>
                            setStateFor(u.name, {
                              creatingNew: !state.creatingNew,
                              selectedRoomTypeId: state.creatingNew ? "" : state.selectedRoomTypeId,
                            })
                          }
                        >
                          {state.creatingNew ? "Cancel create" : "Create new Room Type"}
                        </button>
                        {state.creatingNew && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={state.exterior}
                              onChange={(e) =>
                                setStateFor(u.name, { exterior: e.target.checked })
                              }
                              className="rounded border-zinc-300 dark:border-zinc-600"
                            />
                            Exterior
                          </label>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {error && (
          <p className="px-4 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Skip
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || loading}
            className={btnPrimary}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

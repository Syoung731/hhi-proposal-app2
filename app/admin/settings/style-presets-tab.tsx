"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  listStylePresets,
  createStylePreset,
  updateStylePreset,
  deleteStylePreset,
  reorderStylePreset,
  toggleStylePresetActive,
} from "./actions";
import type { CreateStylePresetData } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export type StylePresetForUI = {
  id: string;
  name: string;
  prompt: string;
  isActive: boolean;
  sortOrder: number;
};

type Props = { stylePresets: StylePresetForUI[] };

export function StylePresetsTab({ stylePresets: initialPresets }: Props) {
  const router = useRouter();
  const [presets, setPresets] = useState<StylePresetForUI[]>(() =>
    [...initialPresets].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  );
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPresets(
      [...initialPresets].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      )
    );
  }, [initialPresets]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    const data: CreateStylePresetData = {
      name: newName.trim(),
      prompt: newPrompt.trim(),
      isActive: newActive,
      sortOrder: newSortOrder,
    };
    const result = await createStylePreset(data);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    setAdding(false);
    setNewName("");
    setNewPrompt("");
    setNewActive(true);
    setNewSortOrder(0);
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  async function handleToggleActive(id: string, current: boolean) {
    const result = await toggleStylePresetActive(id, !current);
    if (result.error) {
      setErrorMessage(result.error);
      setStatus("error");
      setTimeout(() => {
        setErrorMessage(null);
        setStatus("idle");
      }, 4000);
      return;
    }
    router.refresh();
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || !editPrompt.trim()) return;
    setStatus("saving");
    setErrorMessage(null);
    const result = await updateStylePreset(id, {
      name: editName.trim(),
      prompt: editPrompt.trim(),
      isActive: editActive,
      sortOrder: editSortOrder,
    });
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    setEditingId(null);
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  function startEdit(preset: StylePresetForUI) {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditPrompt(preset.prompt);
    setEditActive(preset.isActive);
    setEditSortOrder(preset.sortOrder);
    setErrorMessage(null);
  }

  async function handleDelete(id: string) {
    const preset = presets.find((p) => p.id === id);
    const msg = preset
      ? `Remove style preset "${preset.name}"? Projects, rooms, and renderings using it will have their preset cleared.`
      : "Remove this style preset?";
    if (!confirm(msg)) return;
    const result = await deleteStylePreset(id);
    if (result.error) {
      setErrorMessage(result.error);
      setStatus("error");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    await reorderStylePreset(id, direction);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Style Presets
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Presets define the style direction (materials, lighting, palette) used when generating renderings. Set a project default, optional room override, or choose per render.
      </p>

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <div>
            <label htmlFor="newPresetName" className={labelClass}>
              Name
            </label>
            <input
              id="newPresetName"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Coastal Modern"
              required
            />
          </div>
          <div>
            <label htmlFor="newPresetPrompt" className={labelClass}>
              Prompt (style instructions)
            </label>
            <textarea
              id="newPresetPrompt"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              className={inputClass}
              rows={4}
              placeholder="Materials, lighting, palette, fixtures…"
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newActive}
                onChange={(e) => setNewActive(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Active
              </span>
            </label>
            <div>
              <label htmlFor="newSortOrder" className={labelClass}>
                Sort order
              </label>
              <input
                id="newSortOrder"
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value) || 0)}
                className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={status === "saving"}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add preset
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewPrompt("");
                setNewActive(true);
                setNewSortOrder(0);
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
          Add preset
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
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset, index) => (
              <tr
                key={preset.id}
                className="border-t border-zinc-200 dark:border-zinc-700"
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleReorder(preset.id, "up")}
                      disabled={index === 0}
                      className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(preset.id, "down")}
                      disabled={index === presets.length - 1}
                      className="rounded p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {editingId === preset.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-[200px] rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="Name"
                      />
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        className="max-w-full rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        rows={3}
                        placeholder="Prompt"
                      />
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                          />
                          <span className="text-xs">Active</span>
                        </label>
                        <input
                          type="number"
                          value={editSortOrder}
                          onChange={(e) =>
                            setEditSortOrder(Number(e.target.value) || 0)
                          }
                          className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(preset.id)}
                          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-sm text-zinc-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(preset)}
                      className="text-left font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {preset.name}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editingId !== preset.id && (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(preset.id, preset.isActive)}
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (preset.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400")
                      }
                    >
                      {preset.isActive ? "Yes" : "No"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editingId !== preset.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(preset.id)}
                      className="text-sm text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

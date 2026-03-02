"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createSectionType,
  updateSectionType,
  deleteSectionType,
  seedSectionTypesAction,
  type CreateSectionTypeData,
  type UpdateSectionTypeData,
} from "./actions";
import type { SectionTypeForUI } from "./settings-tabs";
import { SectionCategory, MeasurementMode, EstimateUnit } from "@/app/generated/prisma";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const CATEGORY_OPTIONS: { value: SectionCategory; label: string }[] = [
  { value: "INTERIOR", label: "Interior" },
  { value: "EXTERIOR", label: "Exterior" },
  { value: "SYSTEMS", label: "Systems" },
  { value: "WHOLE_HOME", label: "Whole home" },
  { value: "ADDITION", label: "Addition" },
  { value: "FAST", label: "Fast" },
];

const MEASUREMENT_OPTIONS: { value: MeasurementMode; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "DIMENSIONS", label: "Dimensions" },
  { value: "AREA", label: "Area" },
  { value: "COUNT", label: "Count" },
];

const UNIT_OPTIONS: { value: EstimateUnit; label: string }[] = [
  { value: "SF", label: "SF" },
  { value: "LF", label: "LF" },
  { value: "EA", label: "EA" },
  { value: "SQ", label: "SQ" },
  { value: "HR", label: "HR" },
  { value: "DAY", label: "Day" },
  { value: "ROOM", label: "Room" },
  { value: "UNIT", label: "Unit" },
  { value: "GAL", label: "Gal" },
  { value: "CUSTOM", label: "Custom" },
];

type Props = {
  sectionTypes: SectionTypeForUI[];
  canSeed: boolean;
};

export function SectionTypesTab({ sectionTypes: initialList, canSeed }: Props) {
  const router = useRouter();
  const [list, setList] = useState<SectionTypeForUI[]>(() =>
    [...initialList].sort(
      (a, b) =>
        CATEGORY_OPTIONS.findIndex((c) => c.value === a.category) -
          CATEGORY_OPTIONS.findIndex((c) => c.value === b.category) ||
        a.name.localeCompare(b.name)
    )
  );
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<SectionCategory>("INTERIOR");
  const [newMeasurementMode, setNewMeasurementMode] =
    useState<MeasurementMode>("AREA");
  const [newEstimateUnit, setNewEstimateUnit] = useState<EstimateUnit>("SF");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<SectionCategory>("INTERIOR");
  const [editMeasurementMode, setEditMeasurementMode] =
    useState<MeasurementMode>("AREA");
  const [editEstimateUnit, setEditEstimateUnit] = useState<EstimateUnit>("SF");
  const [editCustomLabel, setEditCustomLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => {
    setList(
      [...initialList].sort(
        (a, b) =>
          CATEGORY_OPTIONS.findIndex((c) => c.value === a.category) -
            CATEGORY_OPTIONS.findIndex((c) => c.value === b.category) ||
          a.name.localeCompare(b.name)
      )
    );
  }, [initialList]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    const data: CreateSectionTypeData = {
      name: newName.trim(),
      category: newCategory,
      defaultMeasurementMode: newMeasurementMode,
      defaultEstimateUnit: newEstimateUnit,
      customUnitLabel:
        newEstimateUnit === "CUSTOM" ? newCustomLabel.trim() || null : null,
    };
    const result = await createSectionType(data);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    setAdding(false);
    setNewName("");
    setNewCategory("INTERIOR");
    setNewMeasurementMode("AREA");
    setNewEstimateUnit("SF");
    setNewCustomLabel("");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  function startEdit(row: SectionTypeForUI) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCategory(row.category as SectionCategory);
    setEditMeasurementMode(row.defaultMeasurementMode as MeasurementMode);
    setEditEstimateUnit(row.defaultEstimateUnit as EstimateUnit);
    setEditCustomLabel(row.customUnitLabel ?? "");
    setErrorMessage(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    if (editEstimateUnit === "CUSTOM" && !editCustomLabel.trim()) {
      setErrorMessage("Custom unit label is required when unit is CUSTOM");
      return;
    }
    setStatus("saving");
    setErrorMessage(null);
    const result = await updateSectionType(id, {
      name: editName.trim(),
      category: editCategory,
      defaultMeasurementMode: editMeasurementMode,
      defaultEstimateUnit: editEstimateUnit,
      customUnitLabel:
        editEstimateUnit === "CUSTOM" ? editCustomLabel.trim() || null : null,
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

  async function handleDelete(id: string) {
    const row = list.find((r) => r.id === id);
    if (!confirm(`Remove section type "${row?.name ?? "this"}"?`)) return;
    const result = await deleteSectionType(id);
    if (result.error) {
      setErrorMessage(result.error);
      setStatus("error");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleSeed() {
    if (!canSeed) return;
    setSeedStatus("running");
    setSeedMessage(null);
    const result = await seedSectionTypesAction();
    if (result.error) {
      setSeedStatus("error");
      setSeedMessage(result.error);
      return;
    }
    setSeedStatus("done");
    setSeedMessage(
      result.inserted != null
        ? `Inserted ${result.inserted} section type(s).`
        : "Seed complete."
    );
    router.refresh();
    setTimeout(() => {
      setSeedStatus("idle");
      setSeedMessage(null);
    }, 4000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Section Types
        </h2>
        {canSeed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seedStatus === "running"}
              className="rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/30"
            >
              {seedStatus === "running" ? "Seeding…" : "Seed HHI defaults"}
            </button>
            {seedStatus === "done" && seedMessage && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {seedMessage}
              </span>
            )}
            {seedStatus === "error" && seedMessage && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {seedMessage}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Section types define category, default measurement mode, and estimate
        unit for scope sections. When unit is CUSTOM, a label (e.g. &quot;Job&quot;) is
        required.
      </p>

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="newName" className={labelClass}>
                Name
              </label>
              <input
                id="newName"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Kitchen"
                required
              />
            </div>
            <div>
              <label htmlFor="newCategory" className={labelClass}>
                Category
              </label>
              <select
                id="newCategory"
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as SectionCategory)
                }
                className={inputClass}
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="newMeasurementMode" className={labelClass}>
                Measurement
              </label>
              <select
                id="newMeasurementMode"
                value={newMeasurementMode}
                onChange={(e) =>
                  setNewMeasurementMode(e.target.value as MeasurementMode)
                }
                className={inputClass}
              >
                {MEASUREMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="newEstimateUnit" className={labelClass}>
                Unit
              </label>
              <select
                id="newEstimateUnit"
                value={newEstimateUnit}
                onChange={(e) =>
                  setNewEstimateUnit(e.target.value as EstimateUnit)
                }
                className={inputClass}
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {newEstimateUnit === "CUSTOM" && (
              <div>
                <label htmlFor="newCustomLabel" className={labelClass}>
                  Custom label
                </label>
                <input
                  id="newCustomLabel"
                  type="text"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Job"
                  required={newEstimateUnit === "CUSTOM"}
                />
              </div>
            )}
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
                setNewCategory("INTERIOR");
                setNewMeasurementMode("AREA");
                setNewEstimateUnit("SF");
                setNewCustomLabel("");
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
          Add section type
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
        <table className="table-fixed w-full border-collapse text-sm">
          <colgroup>
            <col style={{ width: "40%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr className="bg-zinc-50 text-zinc-900 dark:bg-zinc-800/50 dark:text-zinc-100">
              <th className="py-2 px-3 text-left text-xs font-medium sm:text-sm">
                Name
              </th>
              <th className="py-2 px-3 text-center text-xs font-medium sm:text-sm">
                Category
              </th>
              <th className="py-2 px-3 text-center text-xs font-medium sm:text-sm">
                Measurement
              </th>
              <th className="py-2 px-3 text-center text-xs font-medium sm:text-sm">
                Unit
              </th>
              <th className="py-2 px-3 text-center text-xs font-medium sm:text-sm">
                Custom label
              </th>
              <th className="py-2 px-3 text-right text-xs font-medium sm:text-sm">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-6 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No section types yet. Add one or seed HHI defaults (Super
                  Admin only).
                </td>
              </tr>
            ) : (
              list.map((row, index) => (
                <tr
                  key={row.id}
                  className={
                    index % 2 === 0
                      ? "border-t border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/30"
                      : "border-t border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30"
                  }
                >
                  {editingId === row.id ? (
                    <>
                      <td className="py-2 px-3 align-middle">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="min-w-0 max-w-full rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          placeholder="Name"
                        />
                      </td>
                      <td className="py-2 px-3 text-center align-middle">
                        <select
                          value={editCategory}
                          onChange={(e) =>
                            setEditCategory(e.target.value as SectionCategory)
                          }
                          className="min-w-0 max-w-full rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {CATEGORY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center align-middle">
                        <select
                          value={editMeasurementMode}
                          onChange={(e) =>
                            setEditMeasurementMode(
                              e.target.value as MeasurementMode
                            )
                          }
                          className="min-w-0 max-w-full rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {MEASUREMENT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <select
                            value={editEstimateUnit}
                            onChange={(e) =>
                              setEditEstimateUnit(
                                e.target.value as EstimateUnit
                              )
                            }
                            className="min-w-0 max-w-full rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          >
                            {UNIT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {editEstimateUnit === "CUSTOM" && (
                            <input
                              type="text"
                              value={editCustomLabel}
                              onChange={(e) =>
                                setEditCustomLabel(e.target.value)
                              }
                              className="w-20 rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                              placeholder="Label"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center align-middle text-zinc-400">
                        —
                      </td>
                      <td className="py-2 px-3 text-right align-middle">
                        <div className="inline-flex w-full min-w-0 justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(row.id)}
                            disabled={status === "saving"}
                            className="shrink-0 text-zinc-600 hover:underline dark:text-zinc-400"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="shrink-0 text-zinc-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="max-w-0 py-2 px-3 align-middle">
                        <span
                          className="block max-w-full truncate font-medium text-zinc-900 dark:text-zinc-100"
                          title={row.name}
                        >
                          {row.name}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center align-middle whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {CATEGORY_OPTIONS.find((c) => c.value === row.category)
                          ?.label ?? row.category}
                      </td>
                      <td className="py-2 px-3 text-center align-middle whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {MEASUREMENT_OPTIONS.find(
                          (m) => m.value === row.defaultMeasurementMode
                        )?.label ?? row.defaultMeasurementMode}
                      </td>
                      <td className="py-2 px-3 text-center align-middle whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {row.defaultEstimateUnit === "CUSTOM" &&
                        row.customUnitLabel
                          ? `${row.customUnitLabel}`
                          : UNIT_OPTIONS.find(
                              (u) => u.value === row.defaultEstimateUnit
                            )?.label ?? row.defaultEstimateUnit}
                      </td>
                      <td className="py-2 px-3 text-center align-middle whitespace-nowrap text-zinc-500 dark:text-zinc-500">
                        {row.defaultEstimateUnit === "CUSTOM"
                          ? row.customUnitLabel ?? "—"
                          : "—"}
                      </td>
                      <td className="w-[8%] py-2 px-3 text-right align-middle">
                        <div className="inline-flex w-full min-w-0 justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="shrink-0 text-zinc-600 hover:underline dark:text-zinc-400"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            className="shrink-0 text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

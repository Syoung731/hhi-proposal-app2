"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInvestmentLineItemAction,
  updateInvestmentLineItemAction,
  deleteInvestmentLineItemAction,
  moveInvestmentOrderAction,
} from "./actions";

type Item = {
  id: string;
  label: string;
  rangeLow: number | null;
  rangeHigh: number | null;
  notes: string | null;
  sortOrder: number;
};

type Props = {
  projectId: string;
  items: Item[];
};

export function InvestmentTab({ projectId, items: initialItems }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder);

  async function handleDelete(itemId: string) {
    if (!confirm("Remove this line item?")) return;
    await deleteInvestmentLineItemAction(projectId, itemId);
    router.refresh();
  }

  async function handleMove(itemId: string, direction: "up" | "down") {
    await moveInvestmentOrderAction(projectId, itemId, direction);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {adding ? (
        <ItemForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
          submitAction={createInvestmentLineItemAction}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add line item
        </button>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Label
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Low
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                High
              </th>
              <th className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Notes
              </th>
              <th className="w-24 px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Order
              </th>
              <th className="w-24 px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => (
              <tr
                key={item.id}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                {editingId === item.id ? (
                  <td colSpan={6} className="px-4 py-2">
                    <ItemForm
                      projectId={projectId}
                      item={item}
                      onDone={() => {
                        setEditingId(null);
                        router.refresh();
                      }}
                      onCancel={() => setEditingId(null)}
                      submitAction={updateInvestmentLineItemAction}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.rangeLow != null ? `$${item.rangeLow.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {item.rangeHigh != null ? `$${item.rangeHigh.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-500 dark:text-zinc-500">
                      {item.notes ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(item.id, "up")}
                          disabled={i === 0}
                          className="rounded border px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(item.id, "down")}
                          disabled={i === sorted.length - 1}
                          className="rounded border px-2 py-0.5 text-xs disabled:opacity-50 dark:border-zinc-600"
                        >
                          Down
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className="text-xs text-zinc-600 hover:underline dark:text-zinc-400"
                      >
                        Edit
                      </button>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemForm({
  projectId,
  item,
  onDone,
  onCancel,
  submitAction,
}: {
  projectId: string;
  item?: Item;
  onDone: () => void;
  onCancel: () => void;
  submitAction: typeof createInvestmentLineItemAction | typeof updateInvestmentLineItemAction;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [rangeLow, setRangeLow] = useState(
    item?.rangeLow != null ? String(item.rangeLow) : ""
  );
  const [rangeHigh, setRangeHigh] = useState(
    item?.rangeHigh != null ? String(item.rangeHigh) : ""
  );
  const [notes, setNotes] = useState(item?.notes ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("label", label);
    formData.set("rangeLow", rangeLow);
    formData.set("rangeHigh", rangeHigh);
    formData.set("notes", notes);
    if (item) {
      await (submitAction as typeof updateInvestmentLineItemAction)(
        projectId,
        item.id,
        formData
      );
    } else {
      await (submitAction as typeof createInvestmentLineItemAction)(
        projectId,
        formData
      );
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 py-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        required
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="number"
        value={rangeLow}
        onChange={(e) => setRangeLow(e.target.value)}
        placeholder="Low $"
        min={0}
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="number"
        value={rangeHigh}
        onChange={(e) => setRangeHigh(e.target.value)}
        placeholder="High $"
        min={0}
        className="w-24 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="w-32 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <button
        type="submit"
        className="rounded bg-zinc-900 px-2 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {item ? "Save" : "Add"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600"
      >
        Cancel
      </button>
    </form>
  );
}

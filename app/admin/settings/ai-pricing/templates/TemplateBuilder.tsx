"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type BuilderTemplate,
  createRoomTemplate,
  updateRoomTemplate,
  addTradeGroup,
  updateTradeGroup,
  deleteTradeGroup,
  addTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
  getTemplateForEdit,
} from "./builder-actions";

/**
 * In-app Room Template authoring panel. Create a brand-new template (e.g. the
 * exterior templates JobTread doesn't have) or edit an existing one — add/rename/
 * delete trade groups and items. Every change persists immediately via server
 * actions, then the template is reloaded for a consistent view. Local DB only.
 */
export function TemplateBuilder({
  templateId,
  onClose,
  onSaved,
}: {
  templateId: string | null; // null = create mode
  onClose: () => void;
  onSaved: () => void; // notify parent to refresh its list
}) {
  const [tplId, setTplId] = useState<string | null>(templateId);
  const [tpl, setTpl] = useState<BuilderTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(templateId != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // create-mode form
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [newCope, setNewCope] = useState(false);
  // add-group input
  const [groupName, setGroupName] = useState("");

  const reload = useCallback(async (id: string) => {
    const fresh = await getTemplateForEdit(id);
    setTpl(fresh);
  }, []);

  useEffect(() => {
    if (tplId) {
      setLoading(true);
      reload(tplId)
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load template"))
        .finally(() => setLoading(false));
    }
  }, [tplId, reload]);

  // Run a mutation, surface errors, reload, mark dirty.
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (!tplId) return;
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reload(tplId);
        setDirty(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
    [tplId, reload],
  );

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Template name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await createRoomTemplate({
        name: newName,
        displayName: newDisplay,
        isProjectOverhead: newCope,
      });
      setTplId(id);
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (dirty) onSaved();
    onClose();
  }

  const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
  const panel =
    "flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900";
  const input =
    "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";

  // ── Create mode ───────────────────────────────────────────────────────────
  if (!tplId) {
    return (
      <div className={overlay} role="dialog" aria-modal="true" onClick={close}>
        <div className={panel} style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New Room Template</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Build a template (e.g. an exterior template) to scaffold estimates and push to JobTread.
            </p>
          </div>
          <div className="space-y-3 px-6 py-4">
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">Name</span>
              <input className={`mt-1 w-full ${input}`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Exterior — Porch / Deck" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">Display name (optional)</span>
              <input className={`mt-1 w-full ${input}`} value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} placeholder="Porch / Deck" />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={newCope} onChange={(e) => setNewCope(e.target.checked)} />
              Project-overhead (COPE) template
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <button onClick={close} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">Cancel</button>
            <button onClick={handleCreate} disabled={busy || !newName.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {busy ? "Creating…" : "Create & edit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={close}>
      <div className={panel} style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {tpl?.displayName ?? tpl?.name ?? "Edit template"}
          </h3>
          {busy && <span className="text-xs text-zinc-400">Saving…</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loading || !tpl ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ) : (
            <div className="space-y-5">
              {/* Template meta */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Name</span>
                  <input
                    className={`mt-1 w-full ${input}`}
                    defaultValue={tpl.name}
                    onBlur={(e) => { if (e.target.value.trim() !== tpl.name) void run(() => updateRoomTemplate(tpl.id, { name: e.target.value })); }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Display name</span>
                  <input
                    className={`mt-1 w-full ${input}`}
                    defaultValue={tpl.displayName ?? ""}
                    onBlur={(e) => { if ((e.target.value.trim() || null) !== tpl.displayName) void run(() => updateRoomTemplate(tpl.id, { displayName: e.target.value })); }}
                  />
                </label>
              </div>

              {/* Trade groups */}
              {tpl.tradeGroups.map((g) => (
                <div key={g.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <input
                      className={`flex-1 font-medium ${input}`}
                      defaultValue={g.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== g.name) void run(() => updateTradeGroup(g.id, { name: e.target.value })); }}
                    />
                    <button
                      onClick={() => { if (confirm(`Delete trade group "${g.name}" and its ${g.items.length} item(s)?`)) void run(() => deleteTradeGroup(g.id)); }}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >Delete group</button>
                  </div>
                  <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                    {g.items.map((it) => (
                      <div key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                        <input
                          type="checkbox" checked={it.isActive}
                          onChange={() => void run(() => updateTemplateItem(it.id, { isActive: !it.isActive }))}
                          title={it.isActive ? "Active" : "Inactive"}
                        />
                        <input
                          className={`min-w-[14rem] flex-1 ${input}`}
                          defaultValue={it.name}
                          onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== it.name) void run(() => updateTemplateItem(it.id, { name: e.target.value })); }}
                        />
                        <input
                          className={`w-44 ${input}`} placeholder="Cost code (e.g. Framing - Material)"
                          defaultValue={it.costCode ?? ""}
                          onBlur={(e) => { if ((e.target.value.trim() || null) !== it.costCode) void run(() => updateTemplateItem(it.id, { costCode: e.target.value })); }}
                        />
                        <input
                          className={`w-28 ${input}`} placeholder="Cost type"
                          defaultValue={it.costType ?? ""}
                          onBlur={(e) => { if ((e.target.value.trim() || null) !== it.costType) void run(() => updateTemplateItem(it.id, { costType: e.target.value })); }}
                        />
                        <button onClick={() => void run(() => deleteTemplateItem(it.id))} className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" title="Delete item">✕</button>
                      </div>
                    ))}
                    <AddItemRow groupId={g.id} disabled={busy} onAdd={(name, costCode, costType) => run(() => addTemplateItem(g.id, { name, costCode, costType }))} inputClass={input} />
                  </div>
                </div>
              ))}

              {/* Add trade group */}
              <div className="flex items-center gap-2">
                <input className={`flex-1 ${input}`} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="New trade group (e.g. Framing)" />
                <button
                  onClick={() => { if (groupName.trim()) { const n = groupName; setGroupName(""); void run(() => addTradeGroup(tpl.id, n)); } }}
                  disabled={busy || !groupName.trim()}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >Add group</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button onClick={close} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900">Done</button>
        </div>
      </div>
    </div>
  );
}

function AddItemRow({
  groupId,
  disabled,
  onAdd,
  inputClass,
}: {
  groupId: string;
  disabled: boolean;
  onAdd: (name: string, costCode: string, costType: string) => Promise<void>;
  inputClass: string;
}) {
  const [name, setName] = useState("");
  const [costCode, setCostCode] = useState("");
  const [costType, setCostType] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 bg-zinc-50/60 px-3 py-1.5 dark:bg-zinc-800/40">
      <input className={`min-w-[14rem] flex-1 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New item name" />
      <input className={`w-44 ${inputClass}`} value={costCode} onChange={(e) => setCostCode(e.target.value)} placeholder="Cost code (optional)" />
      <input className={`w-28 ${inputClass}`} value={costType} onChange={(e) => setCostType(e.target.value)} placeholder="Cost type" />
      <button
        onClick={async () => { if (name.trim()) { await onAdd(name, costCode, costType); setName(""); setCostCode(""); setCostType(""); } }}
        disabled={disabled || !name.trim()}
        className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
        // groupId intentionally unused in markup; kept for caller clarity
        data-group={groupId}
      >+ Add item</button>
    </div>
  );
}

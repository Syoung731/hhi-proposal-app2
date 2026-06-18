"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type BuilderTemplate,
  type EstimateSourceProject,
  createRoomTemplate,
  createTemplateFromRoomEstimate,
  listEstimateSources,
  updateRoomTemplate,
  addTradeGroup,
  updateTradeGroup,
  deleteTradeGroup,
  addTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
  deleteRoomTemplate,
  getTemplateForEdit,
  getJobTreadCostCodeOptions,
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
  initialMode = "blank",
  isDraft = false,
}: {
  templateId: string | null; // null = create mode
  onClose: () => void;
  onSaved: () => void; // notify parent to refresh its list
  initialMode?: "blank" | "from-estimate";
  isDraft?: boolean; // true when templateId is a freshly-created draft → Cancel discards it
}) {
  const [tplId, setTplId] = useState<string | null>(templateId);
  const [wasCreatedHere, setWasCreatedHere] = useState(false);
  const [mode, setMode] = useState<"blank" | "from-estimate">(initialMode);
  const [sources, setSources] = useState<EstimateSourceProject[] | null>(null);
  const [selProjectId, setSelProjectId] = useState("");
  const [selRoomId, setSelRoomId] = useState("");
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
  // JobTread cost-code / cost-type dropdown options (names); empty => text fallback.
  const [costCodeOptions, setCostCodeOptions] = useState<string[]>([]);
  const [costTypeOptions, setCostTypeOptions] = useState<string[]>([]);

  const reload = useCallback(async (id: string) => {
    const fresh = await getTemplateForEdit(id);
    setTpl(fresh);
  }, []);

  // Load JobTread cost-code / cost-type names for the dropdowns (once). On
  // failure the lists stay empty and the fields fall back to free text.
  useEffect(() => {
    getJobTreadCostCodeOptions()
      .then((o) => { setCostCodeOptions(o.costCodes); setCostTypeOptions(o.costTypes); })
      .catch(() => {});
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
      setWasCreatedHere(true);
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  // Load promotable estimates when the user picks "from estimate" in create mode.
  useEffect(() => {
    if (tplId || mode !== "from-estimate" || sources !== null) return;
    listEstimateSources()
      .then((s) => setSources(s))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load estimates"));
  }, [tplId, mode, sources]);

  async function handleGenerateFromEstimate() {
    if (!selRoomId) {
      setError("Pick a project and room first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await createTemplateFromRoomEstimate(selRoomId);
      setTplId(id);
      setWasCreatedHere(true);
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (dirty) onSaved();
    onClose();
  }

  // A freshly-created template (blank, from-estimate, or per-room) is a draft —
  // Cancel deletes it (and, via the room FK's SetNull, unlinks any room). Editing
  // a pre-existing template just closes (its changes are already persisted).
  const treatAsDraft = isDraft || wasCreatedHere;

  async function discard() {
    if (!tplId || !treatAsDraft) { onClose(); return; }
    if (!confirm("Discard this template? It will be deleted.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRoomTemplate(tplId);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard the template.");
      setBusy(false);
    }
  }

  const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
  const panel =
    "flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900";
  const input =
    "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";

  // ── Create mode ───────────────────────────────────────────────────────────
  if (!tplId) {
    const selProject = (sources ?? []).find((p) => p.id === selProjectId) ?? null;
    const toggleBtn = (active: boolean) =>
      `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"}`;
    return (
      <div className={overlay} role="dialog" aria-modal="true" onClick={close}>
        <div className={panel} style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New Room Template</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Build from an existing AI estimate (recommended), or start blank. Created inactive — review &amp; activate to accept.
            </p>
            <div className="mt-3 flex gap-2">
              <button className={toggleBtn(mode === "from-estimate")} onClick={() => setMode("from-estimate")}>From an estimate</button>
              <button className={toggleBtn(mode === "blank")} onClick={() => setMode("blank")}>Blank</button>
            </div>
          </div>

          <div className="space-y-3 px-6 py-4">
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {mode === "from-estimate" ? (
              sources === null ? (
                <p className="py-4 text-center text-sm text-zinc-500">Loading estimates…</p>
              ) : sources.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">No projects have an AI estimate yet.</p>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-500">Project</span>
                    <select
                      className={`mt-1 w-full ${input}`}
                      value={selProjectId}
                      onChange={(e) => { setSelProjectId(e.target.value); setSelRoomId(""); }}
                    >
                      <option value="">Select a project…</option>
                      {sources.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-500">Room / estimate to promote</span>
                    <select
                      className={`mt-1 w-full ${input}`}
                      value={selRoomId}
                      onChange={(e) => setSelRoomId(e.target.value)}
                      disabled={!selProject}
                    >
                      <option value="">Select a room…</option>
                      {(selProject?.rooms ?? []).map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.roomName} — {r.lineItemCount} items{r.templateName ? ` (est. as ${r.templateName})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-zinc-400">
                    We&apos;ll group the estimate&apos;s line items by trade, drop quantities &amp; prices, and carry cost codes — then you can edit before activating.
                  </p>
                </>
              )
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <button onClick={close} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800">Cancel</button>
            {mode === "from-estimate" ? (
              <button onClick={handleGenerateFromEstimate} disabled={busy || !selRoomId} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {busy ? "Generating…" : "Generate & edit"}
              </button>
            ) : (
              <button onClick={handleCreate} disabled={busy || !newName.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {busy ? "Creating…" : "Create & edit"}
              </button>
            )}
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
                        <CostSelect
                          value={it.costCode ?? ""} options={costCodeOptions} placeholder="— cost code —" className={`w-48 ${input}`}
                          onCommit={(v) => { if ((v.trim() || null) !== it.costCode) void run(() => updateTemplateItem(it.id, { costCode: v })); }}
                        />
                        <CostSelect
                          value={it.costType ?? ""} options={costTypeOptions} placeholder="— cost type —" className={`w-40 ${input}`}
                          onCommit={(v) => { if ((v.trim() || null) !== it.costType) void run(() => updateTemplateItem(it.id, { costType: v })); }}
                        />
                        <button onClick={() => void run(() => deleteTemplateItem(it.id))} className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" title="Delete item">✕</button>
                      </div>
                    ))}
                    <AddItemRow groupId={g.id} disabled={busy} onAdd={(name, costCode, costType) => run(() => addTemplateItem(g.id, { name, costCode, costType }))} inputClass={input} costCodeOptions={costCodeOptions} costTypeOptions={costTypeOptions} />
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

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            onClick={discard}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {treatAsDraft ? "Cancel & discard" : "Cancel"}
          </button>
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
  costCodeOptions,
  costTypeOptions,
}: {
  groupId: string;
  disabled: boolean;
  onAdd: (name: string, costCode: string, costType: string) => Promise<void>;
  inputClass: string;
  costCodeOptions: string[];
  costTypeOptions: string[];
}) {
  const [name, setName] = useState("");
  const [costCode, setCostCode] = useState("");
  const [costType, setCostType] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 bg-zinc-50/60 px-3 py-1.5 dark:bg-zinc-800/40" data-group={groupId}>
      <input className={`min-w-[14rem] flex-1 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New item name" />
      {costCodeOptions.length === 0 ? (
        <input className={`w-48 ${inputClass}`} value={costCode} onChange={(e) => setCostCode(e.target.value)} placeholder="Cost code (optional)" />
      ) : (
        <select className={`w-48 ${inputClass}`} value={costCode} onChange={(e) => setCostCode(e.target.value)}>
          <option value="">— cost code —</option>
          {costCode && !costCodeOptions.includes(costCode) && <option value={costCode}>{costCode}</option>}
          {costCodeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {costTypeOptions.length === 0 ? (
        <input className={`w-40 ${inputClass}`} value={costType} onChange={(e) => setCostType(e.target.value)} placeholder="Cost type" />
      ) : (
        <select className={`w-40 ${inputClass}`} value={costType} onChange={(e) => setCostType(e.target.value)}>
          <option value="">— cost type —</option>
          {costType && !costTypeOptions.includes(costType) && <option value={costType}>{costType}</option>}
          {costTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      <button
        onClick={async () => { if (name.trim()) { await onAdd(name, costCode, costType); setName(""); setCostCode(""); setCostType(""); } }}
        disabled={disabled || !name.trim()}
        className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >+ Add item</button>
    </div>
  );
}

/**
 * Cost code / cost type field for an existing item row: a dropdown over the live
 * JobTread options (uncontrolled, commits on change), falling back to a free-text
 * input when no options loaded. Preserves a current value not present in the list.
 */
function CostSelect({
  value,
  options,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  options: string[];
  placeholder: string;
  className: string;
  onCommit: (v: string) => void;
}) {
  if (options.length === 0) {
    return (
      <input
        className={className}
        placeholder={placeholder}
        defaultValue={value}
        onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
      />
    );
  }
  return (
    <select className={className} defaultValue={value} onChange={(e) => onCommit(e.target.value)}>
      <option value="">{placeholder}</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

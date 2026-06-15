"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AssemblyReviewStatus } from "@/app/generated/prisma";
import {
  createEngineeringAssembly,
  updateEngineeringAssembly,
  deleteEngineeringAssembly,
  setAssemblyReviewStatus,
  uploadAssemblyDrawingAction,
  addAssemblyComponent,
  updateAssemblyComponent,
  deleteAssemblyComponent,
  type AssemblyWithRelations,
  type AssemblyCreateInput,
  type AssemblyUpdateInput,
} from "./actions";

// ─── Controlled vocabulary (from docs/engineering-assembly-tags.md) ───────────
// Categories the assembly can fall under. Free-text is still allowed in the
// field; these power the grouping headers and a quick-pick dropdown.
const KNOWN_CATEGORIES = [
  "Foundation",
  "Wall Framing",
  "Floor Framing",
  "Roof Framing",
  "Connectors & Strapping",
  "Openings",
  "Structural Steel",
  "Masonry",
  "Deck/Porch",
  "Stairs",
  "Other",
] as const;

const COMPONENT_KINDS = ["MEMBER", "CONNECTOR"] as const;

const REVIEW_ORDER: AssemblyReviewStatus[] = [
  AssemblyReviewStatus.DRAFT,
  AssemblyReviewStatus.APPROVED,
  AssemblyReviewStatus.ARCHIVED,
];

const REVIEW_LABEL: Record<AssemblyReviewStatus, string> = {
  [AssemblyReviewStatus.DRAFT]: "Draft",
  [AssemblyReviewStatus.APPROVED]: "Approved",
  [AssemblyReviewStatus.ARCHIVED]: "Archived",
};

const REVIEW_BADGE: Record<AssemblyReviewStatus, string> = {
  [AssemblyReviewStatus.DRAFT]:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  [AssemblyReviewStatus.APPROVED]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  [AssemblyReviewStatus.ARCHIVED]:
    "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// ─── Draft shapes (form state) ────────────────────────────────────────────────

type ComponentDraft = {
  id?: string | null; // present = existing row; absent = new (not yet saved)
  kind: string;
  name: string;
  spec: string;
  model: string;
  qtyRule: string;
  unit: string;
  isConditional: boolean;
  notes: string;
};

type AssemblyDraft = {
  name: string;
  category: string;
  slug: string;
  discriminator: string;
  whenToUse: string;
  methodSummary: string;
  codeBasis: string;
  quantityBasis: string;
  caveats: string;
  unitOfAssembly: string;
  triggerKeywordsText: string;
  tagsText: string;
  sourceFirm: string;
  engineerName: string;
  engineerLicense: string;
  sourceRef: string;
  sourceDrawingUrl: string | null;
  sourceDrawingKey: string | null;
  sortOrder: number;
  isActive: boolean;
};

function emptyDraft(): AssemblyDraft {
  return {
    name: "",
    category: "Foundation",
    slug: "",
    discriminator: "",
    whenToUse: "",
    methodSummary: "",
    codeBasis: "",
    quantityBasis: "",
    caveats: "",
    unitOfAssembly: "",
    triggerKeywordsText: "",
    tagsText: "",
    sourceFirm: "",
    engineerName: "",
    engineerLicense: "",
    sourceRef: "",
    sourceDrawingUrl: null,
    sourceDrawingKey: null,
    sortOrder: 0,
    isActive: true,
  };
}

function draftFromAssembly(a: AssemblyWithRelations): AssemblyDraft {
  return {
    name: a.name,
    category: a.category,
    slug: a.slug,
    discriminator: a.discriminator ?? "",
    whenToUse: a.whenToUse ?? "",
    methodSummary: a.methodSummary ?? "",
    codeBasis: a.codeBasis ?? "",
    quantityBasis: a.quantityBasis ?? "",
    caveats: a.caveats ?? "",
    unitOfAssembly: a.unitOfAssembly ?? "",
    triggerKeywordsText: (a.triggerKeywords ?? []).join(", "),
    tagsText: (a.tags ?? []).join(", "),
    sourceFirm: a.sourceFirm ?? "",
    engineerName: a.engineerName ?? "",
    engineerLicense: a.engineerLicense ?? "",
    sourceRef: a.sourceRef ?? "",
    sourceDrawingUrl: a.sourceDrawingUrl ?? null,
    sourceDrawingKey: a.sourceDrawingKey ?? null,
    sortOrder: a.sortOrder ?? 0,
    isActive: a.isActive,
  };
}

/** Split a comma/space/newline-delimited string into a clean token list. */
function parseTokens(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

type SaveStatus = "idle" | "saving" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  initialAssemblies: AssemblyWithRelations[];
};

export function EngineeringAssembliesClient({ initialAssemblies }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [assemblies, setAssemblies] =
    useState<AssemblyWithRelations[]>(initialAssemblies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState<AssemblyDraft>(emptyDraft());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [drawingUploading, setDrawingUploading] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);

  // New-component entry row (only used when editing an existing, saved assembly).
  const [newComponent, setNewComponent] = useState<ComponentDraft>({
    kind: "MEMBER",
    name: "",
    spec: "",
    model: "",
    qtyRule: "",
    unit: "",
    isConditional: false,
    notes: "",
  });
  const [componentBusyId, setComponentBusyId] = useState<string | null>(null);

  const selected = useMemo(
    () => assemblies.find((a) => a.id === selectedId) ?? null,
    [assemblies, selectedId]
  );

  // Group the list for the left rail: reviewStatus → category → assemblies.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? assemblies.filter((a) => {
          const hay = [
            a.name,
            a.slug,
            a.category,
            a.discriminator ?? "",
            ...(a.triggerKeywords ?? []),
            ...(a.tags ?? []),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : assemblies;

    const byStatus = new Map<AssemblyReviewStatus, Map<string, AssemblyWithRelations[]>>();
    for (const a of filtered) {
      const statusKey = a.reviewStatus;
      if (!byStatus.has(statusKey)) byStatus.set(statusKey, new Map());
      const catMap = byStatus.get(statusKey)!;
      if (!catMap.has(a.category)) catMap.set(a.category, []);
      catMap.get(a.category)!.push(a);
    }
    return byStatus;
  }, [assemblies, search]);

  const counts = useMemo(() => {
    const c: Record<AssemblyReviewStatus, number> = {
      [AssemblyReviewStatus.DRAFT]: 0,
      [AssemblyReviewStatus.APPROVED]: 0,
      [AssemblyReviewStatus.ARCHIVED]: 0,
    };
    for (const a of assemblies) c[a.reviewStatus] += 1;
    return c;
  }, [assemblies]);

  // ── Selection / mode helpers ──

  function selectAssembly(a: AssemblyWithRelations) {
    setIsCreating(false);
    setSelectedId(a.id);
    setDraft(draftFromAssembly(a));
    setStatus("idle");
    setErrorMsg(null);
    setDrawingError(null);
  }

  function startCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setStatus("idle");
    setErrorMsg(null);
    setDrawingError(null);
  }

  function patchDraft<K extends keyof AssemblyDraft>(key: K, value: AssemblyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // ── Save (create or update) ──

  async function handleSave() {
    setStatus("saving");
    setErrorMsg(null);

    const common = {
      name: draft.name,
      category: draft.category,
      slug: draft.slug.trim() || undefined,
      discriminator: draft.discriminator.trim() || null,
      whenToUse: draft.whenToUse.trim() || null,
      methodSummary: draft.methodSummary.trim() || null,
      codeBasis: draft.codeBasis.trim() || null,
      quantityBasis: draft.quantityBasis.trim() || null,
      caveats: draft.caveats.trim() || null,
      unitOfAssembly: draft.unitOfAssembly.trim() || null,
      triggerKeywords: parseTokens(draft.triggerKeywordsText),
      tags: parseTokens(draft.tagsText),
      sourceFirm: draft.sourceFirm.trim() || null,
      engineerName: draft.engineerName.trim() || null,
      engineerLicense: draft.engineerLicense.trim() || null,
      sourceRef: draft.sourceRef.trim() || null,
      sourceDrawingUrl: draft.sourceDrawingUrl,
      sourceDrawingKey: draft.sourceDrawingKey,
      sortOrder: Number(draft.sortOrder) || 0,
      isActive: draft.isActive,
    };

    const result =
      isCreating || !selected
        ? await createEngineeringAssembly(common as AssemblyCreateInput)
        : await updateEngineeringAssembly(selected.id, common as AssemblyUpdateInput);

    if (!result.ok) {
      setStatus("error");
      setErrorMsg(result.message);
      return;
    }

    upsertLocal(result.assembly);
    setSelectedId(result.assembly.id);
    setIsCreating(false);
    setDraft(draftFromAssembly(result.assembly));
    setStatus("idle");
    startTransition(() => router.refresh());
  }

  function upsertLocal(a: AssemblyWithRelations) {
    setAssemblies((prev) => {
      const idx = prev.findIndex((x) => x.id === a.id);
      if (idx === -1) return [...prev, a];
      const next = prev.slice();
      next[idx] = a;
      return next;
    });
  }

  // ── Review status (approve / archive gate) ──

  async function handleSetReviewStatus(next: AssemblyReviewStatus) {
    if (!selected) return;
    setStatus("saving");
    setErrorMsg(null);
    const result = await setAssemblyReviewStatus(selected.id, next);
    if (!result.ok) {
      setStatus("error");
      setErrorMsg(result.message);
      return;
    }
    upsertLocal(result.assembly);
    setStatus("idle");
    startTransition(() => router.refresh());
  }

  // ── Delete ──

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    setStatus("saving");
    setErrorMsg(null);
    const result = await deleteEngineeringAssembly(selected.id);
    if (!result.ok) {
      setStatus("error");
      setErrorMsg(result.message);
      return;
    }
    setAssemblies((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
    setIsCreating(false);
    setDraft(emptyDraft());
    setStatus("idle");
    startTransition(() => router.refresh());
  }

  // ── Source-drawing upload ──

  async function handleDrawingUpload(file: File) {
    setDrawingUploading(true);
    setDrawingError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadAssemblyDrawingAction(fd);
    setDrawingUploading(false);
    if (!result.ok) {
      setDrawingError(result.error);
      return;
    }
    // Stash on the draft. Persist happens on Save (or immediately if editing
    // an existing record, so the upload isn't lost).
    setDraft((prev) => ({
      ...prev,
      sourceDrawingUrl: result.url,
      sourceDrawingKey: result.key,
    }));
    if (selected && !isCreating) {
      const upd = await updateEngineeringAssembly(selected.id, {
        sourceDrawingUrl: result.url,
        sourceDrawingKey: result.key,
      });
      if (upd.ok) {
        upsertLocal(upd.assembly);
        startTransition(() => router.refresh());
      }
    }
  }

  function clearDrawing() {
    setDraft((prev) => ({ ...prev, sourceDrawingUrl: null, sourceDrawingKey: null }));
  }

  // ── Component CRUD (only on saved assemblies) ──

  async function handleAddComponent() {
    if (!selected) return;
    const name = newComponent.name.trim();
    if (!name) return;
    setComponentBusyId("new");
    const result = await addAssemblyComponent(selected.id, {
      kind: newComponent.kind,
      name,
      spec: newComponent.spec.trim() || null,
      model: newComponent.model.trim() || null,
      qtyRule: newComponent.qtyRule.trim() || null,
      unit: newComponent.unit.trim() || null,
      isConditional: newComponent.isConditional,
      notes: newComponent.notes.trim() || null,
    });
    setComponentBusyId(null);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    setAssemblies((prev) =>
      prev.map((a) =>
        a.id === selected.id
          ? { ...a, components: [...a.components, result.component] }
          : a
      )
    );
    setNewComponent({
      kind: "MEMBER",
      name: "",
      spec: "",
      model: "",
      qtyRule: "",
      unit: "",
      isConditional: false,
      notes: "",
    });
    startTransition(() => router.refresh());
  }

  async function handleUpdateComponent(
    componentId: string,
    patch: Partial<ComponentDraft>
  ) {
    if (!selected) return;
    setComponentBusyId(componentId);
    const result = await updateAssemblyComponent(componentId, {
      kind: patch.kind,
      name: patch.name,
      spec: patch.spec ?? undefined,
      model: patch.model ?? undefined,
      qtyRule: patch.qtyRule ?? undefined,
      unit: patch.unit ?? undefined,
      isConditional: patch.isConditional,
      notes: patch.notes ?? undefined,
    });
    setComponentBusyId(null);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    setAssemblies((prev) =>
      prev.map((a) =>
        a.id === selected.id
          ? {
              ...a,
              components: a.components.map((c) =>
                c.id === componentId ? result.component : c
              ),
            }
          : a
      )
    );
    startTransition(() => router.refresh());
  }

  async function handleDeleteComponent(componentId: string) {
    if (!selected) return;
    setComponentBusyId(componentId);
    const result = await deleteAssemblyComponent(componentId);
    setComponentBusyId(null);
    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    setAssemblies((prev) =>
      prev.map((a) =>
        a.id === selected.id
          ? { ...a, components: a.components.filter((c) => c.id !== componentId) }
          : a
      )
    );
    startTransition(() => router.refresh());
  }

  const showEditor = isCreating || selected != null;
  const isPdfDrawing = (draft.sourceDrawingKey ?? "").toLowerCase().endsWith(".pdf");

  return (
    <div className="min-h-[320px] w-full rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Engineering Assemblies
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The engineer-vetted assembly library the AI estimate retrieves from. Curate
          the canonical method &amp; spec for each assembly, then approve it to make it
          live for retrieval.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {REVIEW_ORDER.map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${REVIEW_BADGE[s]}`}
            >
              {REVIEW_LABEL[s]}: {counts[s]}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Left rail: grouped list ── */}
        <div className="min-w-0 lg:w-[320px] lg:shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, slug, keyword…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
            />
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-8 shrink-0 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              + New
            </button>
          </div>

          {assemblies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              <p className="font-medium text-zinc-800 dark:text-zinc-100">
                No assemblies yet
              </p>
              <p className="mt-1">
                Create your first assembly, or import from the engineering KB
                extraction guide.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {REVIEW_ORDER.map((statusKey) => {
                const catMap = grouped.get(statusKey);
                if (!catMap || catMap.size === 0) return null;
                return (
                  <div key={statusKey} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${REVIEW_BADGE[statusKey]}`}
                      >
                        {REVIEW_LABEL[statusKey]}
                      </span>
                    </div>
                    {Array.from(catMap.entries()).map(([category, list]) => (
                      <div key={category} className="space-y-0.5">
                        <p className="px-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {category}
                        </p>
                        {list.map((a) => {
                          const isSel = selectedId === a.id;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => selectAssembly(a)}
                              className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                                isSel
                                  ? "bg-zinc-100 font-medium text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600"
                                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
                              }`}
                            >
                              <span className="block truncate">{a.name}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                                <span className="truncate">{a.slug}</span>
                                {!a.isActive && (
                                  <span className="rounded bg-zinc-200 px-1 text-[9px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                                    inactive
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: editor ── */}
        <div className="min-w-0 flex-1">
          {!showEditor ? (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              Select an assembly to edit, or create a new one.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top bar: status badge + approve/archive gate */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {selected && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REVIEW_BADGE[selected.reviewStatus]}`}
                    >
                      {REVIEW_LABEL[selected.reviewStatus]}
                    </span>
                  )}
                  {isCreating && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      New assembly
                    </span>
                  )}
                </div>
                {selected && (
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.reviewStatus !== AssemblyReviewStatus.APPROVED && (
                      <button
                        type="button"
                        onClick={() => handleSetReviewStatus(AssemblyReviewStatus.APPROVED)}
                        disabled={status === "saving"}
                        className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve (vet)
                      </button>
                    )}
                    {selected.reviewStatus === AssemblyReviewStatus.APPROVED && (
                      <button
                        type="button"
                        onClick={() => handleSetReviewStatus(AssemblyReviewStatus.DRAFT)}
                        disabled={status === "saving"}
                        className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Revert to draft
                      </button>
                    )}
                    {selected.reviewStatus !== AssemblyReviewStatus.ARCHIVED ? (
                      <button
                        type="button"
                        onClick={() => handleSetReviewStatus(AssemblyReviewStatus.ARCHIVED)}
                        disabled={status === "saving"}
                        className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetReviewStatus(AssemblyReviewStatus.DRAFT)}
                        disabled={status === "saving"}
                        className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Unarchive
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={status === "saving"}
                      className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* ── Canonical fields ── */}
              <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Canonical spec
                </h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" required>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => patchDraft("name", e.target.value)}
                      placeholder="Wall Footing (CMU stem on spread footing)"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Category" required>
                    <input
                      list="assembly-categories"
                      type="text"
                      value={draft.category}
                      onChange={(e) => patchDraft("category", e.target.value)}
                      className={inputClass}
                    />
                    <datalist id="assembly-categories">
                      {KNOWN_CATEGORIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Slug" hint="Auto-derived from name if left blank">
                    <input
                      type="text"
                      value={draft.slug}
                      onChange={(e) => patchDraft("slug", e.target.value)}
                      placeholder="wall-footing-cmu"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Discriminator" hint="Disambiguator when titles collide">
                    <input
                      type="text"
                      value={draft.discriminator}
                      onChange={(e) => patchDraft("discriminator", e.target.value)}
                      placeholder="steel-column-base"
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="When to use" hint="Trigger condition prose">
                  <textarea
                    value={draft.whenToUse}
                    onChange={(e) => patchDraft("whenToUse", e.target.value)}
                    rows={2}
                    className={textareaClass}
                  />
                </Field>

                <Field label="Method summary" hint="Markdown — how it's built">
                  <textarea
                    value={draft.methodSummary}
                    onChange={(e) => patchDraft("methodSummary", e.target.value)}
                    rows={4}
                    className={textareaClass}
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Code basis">
                    <input
                      type="text"
                      value={draft.codeBasis}
                      onChange={(e) => patchDraft("codeBasis", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Quantity basis" hint="per LF / per rafter / field-determined">
                    <input
                      type="text"
                      value={draft.quantityBasis}
                      onChange={(e) => patchDraft("quantityBasis", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Unit of assembly">
                    <input
                      type="text"
                      value={draft.unitOfAssembly}
                      onChange={(e) => patchDraft("unitOfAssembly", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Sort order">
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(e) => patchDraft("sortOrder", Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Caveats">
                  <textarea
                    value={draft.caveats}
                    onChange={(e) => patchDraft("caveats", e.target.value)}
                    rows={2}
                    className={textareaClass}
                  />
                </Field>

                <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => patchDraft("isActive", e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                  />
                  Active (available for retrieval when approved)
                </label>
              </section>

              {/* ── Retrieval: keywords + tags ── */}
              <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Retrieval
                </h2>
                <Field
                  label="Trigger keywords"
                  hint="Controlled-vocabulary matchers — comma or space separated"
                >
                  <textarea
                    value={draft.triggerKeywordsText}
                    onChange={(e) => patchDraft("triggerKeywordsText", e.target.value)}
                    rows={2}
                    placeholder="foundation footing stem-wall wind-uplift rebar"
                    className={textareaClass}
                  />
                  <TokenPreview text={draft.triggerKeywordsText} />
                </Field>
                <Field label="Tags" hint="Extra / free tags — comma or space separated">
                  <textarea
                    value={draft.tagsText}
                    onChange={(e) => patchDraft("tagsText", e.target.value)}
                    rows={2}
                    className={textareaClass}
                  />
                  <TokenPreview text={draft.tagsText} />
                </Field>
              </section>

              {/* ── Components table (members & connectors) ── */}
              <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Components
                  </h2>
                  {isCreating && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      Save the assembly first to add components
                    </span>
                  )}
                </div>

                {selected ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                            <th className="py-1.5 pr-2 font-medium">Kind</th>
                            <th className="py-1.5 pr-2 font-medium">Name</th>
                            <th className="py-1.5 pr-2 font-medium">Spec</th>
                            <th className="py-1.5 pr-2 font-medium">Model</th>
                            <th className="py-1.5 pr-2 font-medium">Qty rule</th>
                            <th className="py-1.5 pr-2 font-medium">Unit</th>
                            <th className="py-1.5 pr-2 font-medium">Cond.</th>
                            <th className="py-1.5 font-medium" />
                          </tr>
                        </thead>
                        <tbody>
                          {selected.components.length === 0 && (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-3 text-center text-[11px] text-zinc-400 dark:text-zinc-500"
                              >
                                No components yet.
                              </td>
                            </tr>
                          )}
                          {selected.components.map((c) => {
                            const busy = componentBusyId === c.id;
                            return (
                              <tr
                                key={c.id}
                                className="border-b border-zinc-100 align-top dark:border-zinc-800"
                              >
                                <td className="py-1.5 pr-2">
                                  <select
                                    defaultValue={c.kind}
                                    disabled={busy}
                                    onChange={(e) =>
                                      handleUpdateComponent(c.id, { kind: e.target.value })
                                    }
                                    className={cellInputClass}
                                  >
                                    {COMPONENT_KINDS.map((k) => (
                                      <option key={k} value={k}>
                                        {k}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <ComponentCell
                                  key={`name-${c.name}`}
                                  value={c.name}
                                  busy={busy}
                                  onCommit={(v) => handleUpdateComponent(c.id, { name: v })}
                                />
                                <ComponentCell
                                  key={`spec-${c.spec ?? ""}`}
                                  value={c.spec ?? ""}
                                  busy={busy}
                                  onCommit={(v) => handleUpdateComponent(c.id, { spec: v })}
                                />
                                <ComponentCell
                                  key={`model-${c.model ?? ""}`}
                                  value={c.model ?? ""}
                                  busy={busy}
                                  onCommit={(v) => handleUpdateComponent(c.id, { model: v })}
                                />
                                <ComponentCell
                                  key={`qty-${c.qtyRule ?? ""}`}
                                  value={c.qtyRule ?? ""}
                                  busy={busy}
                                  onCommit={(v) => handleUpdateComponent(c.id, { qtyRule: v })}
                                />
                                <ComponentCell
                                  key={`unit-${c.unit ?? ""}`}
                                  value={c.unit ?? ""}
                                  busy={busy}
                                  onCommit={(v) => handleUpdateComponent(c.id, { unit: v })}
                                />
                                <td className="py-1.5 pr-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={c.isConditional}
                                    disabled={busy}
                                    onChange={(e) =>
                                      handleUpdateComponent(c.id, {
                                        isConditional: e.target.checked,
                                      })
                                    }
                                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                                  />
                                </td>
                                <td className="py-1.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComponent(c.id)}
                                    disabled={busy}
                                    className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* New-component entry row */}
                    <div className="grid gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40 sm:grid-cols-12">
                      <select
                        value={newComponent.kind}
                        onChange={(e) =>
                          setNewComponent((p) => ({ ...p, kind: e.target.value }))
                        }
                        className={`${cellInputClass} sm:col-span-2`}
                      >
                        {COMPONENT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newComponent.name}
                        onChange={(e) =>
                          setNewComponent((p) => ({ ...p, name: e.target.value }))
                        }
                        placeholder="Name (e.g. Wall stud)"
                        className={`${cellInputClass} sm:col-span-3`}
                      />
                      <input
                        type="text"
                        value={newComponent.spec}
                        onChange={(e) =>
                          setNewComponent((p) => ({ ...p, spec: e.target.value }))
                        }
                        placeholder="Spec"
                        className={`${cellInputClass} sm:col-span-2`}
                      />
                      <input
                        type="text"
                        value={newComponent.model}
                        onChange={(e) =>
                          setNewComponent((p) => ({ ...p, model: e.target.value }))
                        }
                        placeholder="Model"
                        className={`${cellInputClass} sm:col-span-2`}
                      />
                      <input
                        type="text"
                        value={newComponent.qtyRule}
                        onChange={(e) =>
                          setNewComponent((p) => ({ ...p, qtyRule: e.target.value }))
                        }
                        placeholder="Qty rule"
                        className={`${cellInputClass} sm:col-span-2`}
                      />
                      <button
                        type="button"
                        onClick={handleAddComponent}
                        disabled={componentBusyId === "new" || !newComponent.name.trim()}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:col-span-1"
                      >
                        Add
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    Components become editable once the assembly is saved.
                  </p>
                )}
              </section>

              {/* ── Provenance: canonical source + source drawing ── */}
              <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Canonical provenance
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Source firm">
                    <input
                      type="text"
                      value={draft.sourceFirm}
                      onChange={(e) => patchDraft("sourceFirm", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Engineer name">
                    <input
                      type="text"
                      value={draft.engineerName}
                      onChange={(e) => patchDraft("engineerName", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Engineer license">
                    <input
                      type="text"
                      value={draft.engineerLicense}
                      onChange={(e) => patchDraft("engineerLicense", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Source ref" hint="Sheet / detail, e.g. S201 / Detail 1">
                    <input
                      type="text"
                      value={draft.sourceRef}
                      onChange={(e) => patchDraft("sourceRef", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                {/* Source drawing upload */}
                <Field label="Source drawing" hint="PNG, JPEG, WebP, or PDF (max 5 MB)">
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      disabled={drawingUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleDrawingUpload(file);
                      }}
                      className="block w-full text-[11px] text-zinc-600 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
                    />
                    {drawingUploading && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Uploading…
                      </p>
                    )}
                    {drawingError && (
                      <p className="text-[10px] text-red-600 dark:text-red-400">
                        {drawingError}
                      </p>
                    )}
                    {draft.sourceDrawingUrl && !drawingUploading && (
                      <div className="flex items-start gap-3">
                        {isPdfDrawing ? (
                          <a
                            href={draft.sourceDrawingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-20 w-20 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                          >
                            PDF
                          </a>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={draft.sourceDrawingUrl}
                            alt="Source drawing"
                            className="h-20 w-20 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                          />
                        )}
                        <div className="flex flex-col gap-1">
                          <a
                            href={draft.sourceDrawingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                          >
                            Open drawing
                          </a>
                          <button
                            type="button"
                            onClick={clearDrawing}
                            className="text-left text-[11px] font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Remove (on next save)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Field>
              </section>

              {/* ── Sources / reconcile view (read-only) ── */}
              {selected && (
                <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Sources &amp; provenance{" "}
                    <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
                      (reconcile view — read only)
                    </span>
                  </h2>
                  {selected.sources.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      No project sources recorded for this assembly yet. Sources are
                      created during KB import — each captures how one project&apos;s
                      drawing differed from the canonical.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selected.sources.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/40"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {s.projectName}
                            </span>
                            {s.status && (
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                {s.status}
                              </span>
                            )}
                            {s.drawingDate && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                {s.drawingDate}
                              </span>
                            )}
                          </div>
                          <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
                            {s.sourceFirm && (
                              <Provenance label="Firm" value={s.sourceFirm} />
                            )}
                            {s.engineerName && (
                              <Provenance label="Engineer" value={s.engineerName} />
                            )}
                            {s.engineerLicense && (
                              <Provenance label="License" value={s.engineerLicense} />
                            )}
                            {s.certNumber && (
                              <Provenance label="Cert #" value={s.certNumber} />
                            )}
                            {s.sourceRef && (
                              <Provenance label="Ref" value={s.sourceRef} />
                            )}
                            {s.designCriteria && (
                              <Provenance label="Design criteria" value={s.designCriteria} />
                            )}
                          </dl>
                          {s.deltaNotes && (
                            <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              <span className="font-medium">Delta:</span> {s.deltaNotes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Save bar ── */}
              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
                {errorMsg ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                ) : (
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {isCreating
                      ? "Creating a new assembly"
                      : selected
                      ? `Editing ${selected.slug}`
                      : ""}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedId(null);
                      setDraft(emptyDraft());
                      setErrorMsg(null);
                    }}
                    className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={status === "saving" || !draft.name.trim()}
                    className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {status === "saving" ? "Saving…" : isCreating ? "Create assembly" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ─────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600";

const textareaClass =
  "w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600";

const cellInputClass =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && (
          <span className="font-normal text-zinc-400 dark:text-zinc-500">— {hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function TokenPreview({ text }: { text: string }) {
  const tokens = text
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {tokens.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Provenance({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="font-medium text-zinc-500 dark:text-zinc-500">{label}:</dt>
      <dd className="text-zinc-700 dark:text-zinc-300">{value}</dd>
    </div>
  );
}

/**
 * Inline-editable text cell that commits on blur (and Enter). Uncontrolled so
 * typing doesn't round-trip to the server on every keystroke. The `key` prop
 * supplied by the caller (the server value) remounts it after a save so the
 * defaultValue stays in sync.
 */
function ComponentCell({
  value,
  busy,
  onCommit,
}: {
  value: string;
  busy: boolean;
  onCommit: (next: string) => void;
}) {
  return (
    <td className="py-1.5 pr-2">
      <input
        type="text"
        defaultValue={value}
        disabled={busy}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className={cellInputClass}
      />
    </td>
  );
}

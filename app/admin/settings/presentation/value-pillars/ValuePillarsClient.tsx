"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
import {
  saveWhyUsDefaultsAction,
  createValuePillarAction,
  updateValuePillarAction,
  deleteValuePillarAction,
  reorderValuePillarAction,
  type WhyUsDefaultsForUI,
  type ValuePillarForUI,
} from "./actions";
import { TemplateCIconPicker } from "@/app/admin/projects/[id]/presentation/template-c-icon-picker";
import { WhyUsRenderer } from "@/components/presentation/why-us/WhyUsRenderer";
import type { WhyUsPageConfig } from "@/app/lib/layout-config";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const WHY_US_PREVIEW_W = 1200;
const WHY_US_PREVIEW_H = 675;

function WhyUsPreviewFrame({
  config,
  iconUrls,
}: {
  config: WhyUsPageConfig;
  iconUrls: Map<string, string>;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / WHY_US_PREVIEW_W, h / WHY_US_PREVIEW_H, 1);
        setScale(s);
      }
    };
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={frameRef}
      className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: WHY_US_PREVIEW_W,
          height: WHY_US_PREVIEW_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <WhyUsRenderer config={config} iconUrls={iconUrls} />
      </div>
    </div>
  );
}

type BrandIconOption = { id: string; imageUrl: string; name?: string };

type Props = {
  initialDefaults: WhyUsDefaultsForUI;
  initialPillars: ValuePillarForUI[];
  brandIcons: BrandIconOption[];
};

const MAX_PILLARS = 4;
const TITLE_MIN = 3;
const TITLE_MAX = 80;
const BODY_MIN = 10;
const BODY_MAX = 280;

function validatePillarForm(title: string, body: string): string | null {
  const t = title.trim();
  const b = body.trim();
  if (t.length < TITLE_MIN) return `Title must be at least ${TITLE_MIN} characters.`;
  if (t.length > TITLE_MAX) return `Title must be at most ${TITLE_MAX} characters.`;
  if (b.length < BODY_MIN) return `Body must be at least ${BODY_MIN} characters.`;
  if (b.length > BODY_MAX) return `Body must be at most ${BODY_MAX} characters.`;
  return null;
}

export function ValuePillarsClient({
  initialDefaults,
  initialPillars,
  brandIcons,
}: Props) {
  const router = useRouter();
  const [defaults, setDefaults] = useState(initialDefaults);
  const [pillars, setPillars] = useState(initialPillars);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<"add" | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formBrandIconId, setFormBrandIconId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canAddPillar = pillars.length < MAX_PILLARS;
  const addFormValidationError = validatePillarForm(formTitle, formBody);
  const addFormValid = !addFormValidationError;

  const openAddModal = () => {
    setFormTitle("");
    setFormBody("");
    setFormBrandIconId(null);
    setFormError(null);
    setModalOpen("add");
  };

  const closeModal = () => setModalOpen(null);

  const handleSaveDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDefaults(true);
    setDefaultsError(null);
    const result = await saveWhyUsDefaultsAction(defaults.title);
    setSavingDefaults(false);
    if (result.error) {
      setDefaultsError(result.error);
      return;
    }
    router.refresh();
  };

  const handleCreatePillar = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePillarForm(formTitle, formBody);
    if (err) {
      setFormError(err);
      return;
    }
    setFormSaving(true);
    setFormError(null);
    const result = await createValuePillarAction(
      formTitle.trim(),
      formBody.trim(),
      formBrandIconId
    );
    setFormSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.pillar) {
      setPillars((prev) =>
        [...prev, result.pillar!].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
    closeModal();
    router.refresh();
  };

  const handleUpdatePillar = async (
    pillarId: string,
    data: { title?: string; body?: string; brandIconId?: string | null }
  ) => {
    const pillar = pillars.find((p) => p.id === pillarId);
    if (!pillar) return;
    const result = await updateValuePillarAction(
      pillarId,
      data.title ?? pillar.title,
      data.body ?? pillar.body,
      data.brandIconId
    );
    if (result.error) {
      alert(result.error);
      return;
    }
    if (result.pillar) {
      setPillars((prev) =>
        prev
          .map((p) => (p.id === pillarId ? result.pillar! : p))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
    router.refresh();
  };

  const handleDelete = async (pillarId: string) => {
    if (!confirm("Delete this pillar?")) return;
    const result = await deleteValuePillarAction(pillarId);
    if (result.error) {
      alert(result.error);
      return;
    }
    setPillars((prev) => prev.filter((p) => p.id !== pillarId));
    router.refresh();
  };

  const handleReorder = async (pillarId: string, direction: "up" | "down") => {
    const result = await reorderValuePillarAction(pillarId, direction);
    if (result.error) {
      alert(result.error);
      return;
    }
    if (result.pillars) setPillars(result.pillars);
    router.refresh();
  };

  const previewConfig = useMemo<WhyUsPageConfig>(
    () => ({
      title: defaults.title.trim() || "Why Us",
      variant: "gridCards",
      pillars: pillars.map((p) => ({
        iconKey: p.brandIconId ?? null,
        headline: p.title,
        body: p.body,
      })),
    }),
    [defaults.title, pillars]
  );

  const iconUrlsForPreview = useMemo(() => {
    const m = new Map<string, string>();
    for (const icon of brandIcons) {
      if (icon.id && icon.imageUrl) m.set(icon.id, icon.imageUrl);
    }
    return m;
  }, [brandIcons]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Value Pillars
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Company-wide default pillars (title + body + icon). Layout is chosen
          per project.
        </p>
      </header>

      {/* A) Pillars Library (max 4) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Pillars Library (max 4)
          </h2>
          <div className="flex flex-col items-end gap-1">
            {pillars.length >= MAX_PILLARS && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Maximum of 4 pillars.
              </p>
            )}
            <button
              type="button"
              onClick={openAddModal}
              disabled={!canAddPillar}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              title={pillars.length >= MAX_PILLARS ? "Maximum of 4 pillars." : undefined}
            >
              Add Pillar
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map((p, idx) => (
            <PillarCard
              key={p.id}
              pillar={p}
              brandIcons={brandIcons}
              isFirst={idx === 0}
              isLast={idx === pillars.length - 1}
              onUpdate={(data) => handleUpdatePillar(p.id, data)}
              onReorder={(dir) => handleReorder(p.id, dir)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
        {pillars.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No pillars yet. Add up to 4.
          </p>
        )}
      </section>

      {/* B) Why Us Defaults */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Why Us Defaults
        </h2>
        <form onSubmit={handleSaveDefaults} className="max-w-xl space-y-4">
          {defaultsError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {defaultsError}
            </p>
          )}
          <div>
            <label className={labelClass} htmlFor="vp-default-title">
              Default Page Title
            </label>
            <input
              id="vp-default-title"
              type="text"
              className={inputClass}
              value={defaults.title}
              onChange={(e) =>
                setDefaults((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="Why Us"
            />
          </div>
          <button
            type="submit"
            disabled={savingDefaults}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {savingDefaults ? "Saving…" : "Save"}
          </button>
        </form>
      </section>

      {/* C) Live Preview (LAST) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Live Preview
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Grid layout for preview; final layout is selected per project.
        </p>
        <div
          className="relative w-full max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
          style={{ aspectRatio: "16 / 9" }}
        >
          {pillars.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              No pillars yet. Add pillars above to see a preview.
            </div>
          ) : (
            <WhyUsPreviewFrame
              config={previewConfig}
              iconUrls={iconUrlsForPreview}
            />
          )}
        </div>
      </section>

      {/* Add Pillar Modal */}
      {modalOpen === "add" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Add Pillar
            </h3>
            <form onSubmit={handleCreatePillar} className="space-y-4">
              {formError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {formError}
                </p>
              )}
              <div>
                <label className={labelClass} htmlFor="add-pillar-title">
                  Pillar Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="add-pillar-title"
                  type="text"
                  className={inputClass}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="No Change Order Guarantee"
                />
                {formTitle.length > 0 && formTitle.length < TITLE_MIN && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    At least {TITLE_MIN} characters.
                  </p>
                )}
                {formTitle.length > TITLE_MAX && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    At most {TITLE_MAX} characters.
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="add-pillar-body">
                  Pillar Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="add-pillar-body"
                  rows={4}
                  className={inputClass}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="We commit to a fixed, buildable scope…"
                />
                {formBody.length > 0 && formBody.length < BODY_MIN && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    At least {BODY_MIN} characters.
                  </p>
                )}
                {formBody.length > BODY_MAX && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    At most {BODY_MAX} characters.
                  </p>
                )}
              </div>
              <div>
                <TemplateCIconPicker
                  icons={brandIcons}
                  value={formBrandIconId}
                  onChange={setFormBrandIconId}
                  label="Brand Icon (optional)"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving || !addFormValid}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {formSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const textareaClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 resize-y min-h-[80px]";

function PillarCard({
  pillar,
  brandIcons,
  isFirst,
  isLast,
  onUpdate,
  onReorder,
  onDelete,
}: {
  pillar: ValuePillarForUI;
  brandIcons: BrandIconOption[];
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (data: { title?: string; body?: string; brandIconId?: string | null }) => void;
  onReorder: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(pillar.title);
  const [body, setBody] = useState(pillar.body);
  const [brandIconId, setBrandIconId] = useState<string | null>(
    pillar.brandIconId ?? null
  );
  const [saving, setSaving] = useState(false);

  // Sync local state when pillar prop changes (e.g. after parent reorder or server refresh).
  useEffect(() => {
    setTitle(pillar.title);
    setBody(pillar.body);
    setBrandIconId(pillar.brandIconId ?? null);
  }, [pillar.id, pillar.title, pillar.body, pillar.brandIconId]);

  const handleSave = async () => {
    const t = title.trim() || "Pillar";
    const b = body.trim();
    if (t.length < TITLE_MIN || t.length > TITLE_MAX || b.length < BODY_MIN || b.length > BODY_MAX) {
      return;
    }
    setSaving(true);
    await onUpdate({
      title: t,
      body: b,
      brandIconId,
    });
    setSaving(false);
  };

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX;
  const bodyValid = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX;
  const canSave = titleValid && bodyValid;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onReorder("up")}
            disabled={isFirst}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-600"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            disabled={isLast}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-600"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>
      <div className="min-w-[140px]">
        <TemplateCIconPicker
          icons={brandIcons}
          value={brandIconId}
          onChange={setBrandIconId}
          label="Icon (optional)"
        />
      </div>
      <div>
        <label className={labelClass}>Pillar Title</label>
        <input
          type="text"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          placeholder="No Change Order Guarantee"
        />
      </div>
      <div>
        <label className={labelClass}>Pillar Body</label>
        <textarea
          rows={3}
          className={textareaClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={handleSave}
          placeholder="We commit to a fixed, buildable scope…"
        />
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave}
          className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

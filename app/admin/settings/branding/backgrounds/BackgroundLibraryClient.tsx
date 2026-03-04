"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BrandBackgroundForUI, BrandIconForUI } from "../../settings-tabs";
import {
  createBrandBackground,
  deleteBrandBackground,
  toggleBrandBackgroundActive,
  toggleBackgroundAvailabilityAction,
  updateBrandBackground,
  type BrandBackgroundCreateData,
  type BrandBackgroundUpdateData,
  type BrandBackgroundActionResult,
  type BrandBackgroundActionErrorCode,
  generateBackgroundImagesAction,
} from "./actions";
import { BackgroundPreviewSurface } from "./BackgroundPreviewSurface";

const PREVIEW_MIN_HEIGHT = 320;
const DEFAULT_OPACITY = 6;
const DEFAULT_SCALE = 100;
const DEFAULT_SPACING = 120;
const DEFAULT_ROTATION = 0;
const OPACITY_RANGE = { min: 0, max: 100 };
const SCALE_RANGE = { min: 25, max: 300 };
const SPACING_RANGE = { min: 10, max: 600 };
const ROTATION_RANGE = { min: 0, max: 45 };

const BACKGROUND_GEN_TYPES = [
  { value: "subtle_texture", label: "Subtle texture" },
  { value: "icon_pattern", label: "Icon pattern" },
  { value: "gradient_texture", label: "Gradient + texture" },
] as const;

type Props = {
  brandIcons: BrandIconForUI[];
  brandBackgrounds: BrandBackgroundForUI[];
  companyName: string;
  websiteUrl: string | null;
  effectiveAccent: string;
  effectiveText: string;
  panelMode?: boolean;
};

type GeneratedImage = { imageUrl: string; imageKey: string };

type PanelMode = "saved" | "edit";

type BuilderDraft = {
  id?: string | null;
  name: string;
  slug: string;
  tagsCsv: string;
  baseColorHex: string;
  overlayMode: "image" | "icon" | "none";
  overlayImageUrl?: string | null;
  overlayImageKey?: string | null;
  overlayIconId?: string | null;
  overlayOpacity: number;
  overlayScale: number;
  overlaySpacing: number;
  overlayRotation: number;
};

type Status = "idle" | "saving" | "error";

export function BackgroundLibraryClient({
  brandIcons,
  brandBackgrounds,
  companyName,
  websiteUrl,
  effectiveAccent,
  effectiveText,
  panelMode = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Library state
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, Status>>({});
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});

  // Builder state (single source of truth)
  const [builderMode, setBuilderMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderStatus, setBuilderStatus] = useState<Status>("idle");
  const [builderDraft, setBuilderDraft] = useState<BuilderDraft>({
    id: null,
    name: "",
    slug: "",
    tagsCsv: "",
    baseColorHex: "#ffffff",
    overlayMode: "none",
    overlayImageUrl: null,
    overlayImageKey: null,
    overlayIconId: null,
    overlayOpacity: DEFAULT_OPACITY,
    overlayScale: DEFAULT_SCALE,
    overlaySpacing: DEFAULT_SPACING,
    overlayRotation: DEFAULT_ROTATION,
  });

  // AI generator state (images feed into builder as overlay images)
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiType, setAiType] = useState<"subtle_texture" | "icon_pattern" | "gradient_texture">(
    "subtle_texture"
  );
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<GeneratedImage[]>([]);
  const [selectedAiKey, setSelectedAiKey] = useState<string | null>(null);

  const [panelModeState, setPanelModeState] = useState<PanelMode>("saved");
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);

  const [backgrounds, setBackgrounds] = useState<BrandBackgroundForUI[]>(brandBackgrounds);

  const activeIcons = brandIcons.filter((icon) => icon.isActive);
  const selectedIcon = builderDraft.overlayIconId
    ? activeIcons.find((i) => i.id === builderDraft.overlayIconId)
    : null;

  const isPanelLayout = panelMode ?? false;

  const builderSectionRef = useRef<HTMLDivElement | null>(null);
  const builderNameInputRef = useRef<HTMLInputElement | null>(null);

  const visibleBackgrounds = useMemo(
    () =>
      showOnlyActive
        ? backgrounds.filter((b) => b.isActive)
        : backgrounds,
    [backgrounds, showOnlyActive]
  );

  const filteredBackgrounds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleBackgrounds;
    return visibleBackgrounds.filter((b) => {
      const haystack = [
        b.name,
        b.slug,
        ...(b.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleBackgrounds, search]);

  function parseTagsCsv(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function resetBuilderToDefaults() {
    setBuilderMode("create");
    setEditingId(null);
    setBuilderError(null);
    setBuilderStatus("idle");
    setSelectedAiKey(null);
    setBuilderDraft({
      id: null,
      name: "",
      slug: "",
      tagsCsv: "",
      baseColorHex: "#ffffff",
      overlayMode: "none",
      overlayImageUrl: null,
      overlayImageKey: null,
      overlayIconId: null,
      overlayOpacity: DEFAULT_OPACITY,
      overlayScale: DEFAULT_SCALE,
      overlaySpacing: DEFAULT_SPACING,
      overlayRotation: DEFAULT_ROTATION,
    });
  }

  function loadBackgroundIntoBuilder(bg: BrandBackgroundForUI) {
    setPanelModeState("edit");
    setSelectedBackgroundId(bg.id);
    setBuilderMode("edit");
    setEditingId(bg.id);
    setBuilderError(null);
    setBuilderStatus("idle");
    setSelectedAiKey(null);
    setBuilderDraft({
      id: bg.id,
      name: bg.name,
      slug: bg.slug,
      tagsCsv: (bg.tags ?? []).join(", "),
      baseColorHex: bg.baseColorHex ?? "#ffffff",
      overlayMode: bg.overlayImageUrl
        ? "image"
        : bg.overlayIconId
          ? "icon"
          : "none",
      overlayImageUrl: bg.overlayImageUrl ?? null,
      overlayImageKey: bg.overlayImageKey ?? null,
      overlayIconId: bg.overlayIconId ?? null,
      overlayOpacity: bg.overlayOpacity ?? DEFAULT_OPACITY,
      overlayScale: bg.overlayScale ?? DEFAULT_SCALE,
      overlaySpacing: bg.overlaySpacing ?? DEFAULT_SPACING,
      overlayRotation: bg.overlayRotation ?? DEFAULT_ROTATION,
    });
  }

  function handleSelectSavedBackground(bg: BrandBackgroundForUI) {
    setSelectedBackgroundId(bg.id);
    if (panelModeState === "edit") {
      loadBackgroundIntoBuilder(bg);
    }
  }

  async function handleSaveBackground() {
    setBuilderStatus("saving");
    setBuilderError(null);

    const tags = parseTagsCsv(builderDraft.tagsCsv);

    const payload: BrandBackgroundCreateData | BrandBackgroundUpdateData = {
      slug: builderDraft.slug,
      name: builderDraft.name,
      baseColorHex: builderDraft.baseColorHex,
      overlayImageUrl:
        builderDraft.overlayMode === "image"
          ? builderDraft.overlayImageUrl ?? null
          : null,
      overlayImageKey:
        builderDraft.overlayMode === "image"
          ? builderDraft.overlayImageKey ?? null
          : null,
      overlayIconId:
        builderDraft.overlayMode === "icon"
          ? builderDraft.overlayIconId ?? null
          : null,
      overlayOpacity: builderDraft.overlayOpacity,
      overlayScale: builderDraft.overlayScale,
      overlaySpacing: builderDraft.overlaySpacing,
      overlayRotation: builderDraft.overlayRotation,
      tags,
    };

    const isEdit = builderMode === "edit" && editingId;

    // Guard against stale/missing IDs when editing.
    if (isEdit) {
      const stillExists = backgrounds.some((b) => b.id === editingId);
      if (!stillExists) {
        setBuilderStatus("error");
        setBuilderError(
          "That background no longer exists. Select another one from the list or create a new background."
        );
        setSelectedBackgroundId(null);
        resetBuilderToDefaults();
        setPanelModeState("saved");
        return;
      }
    }

    const result = isEdit
      ? await updateBrandBackground(editingId!, payload)
      : await createBrandBackground(payload as BrandBackgroundCreateData);

    const handleError = (res: BrandBackgroundActionResult, code?: BrandBackgroundActionErrorCode) => {
      const errorCode = code ?? ("errorCode" in res ? res.errorCode : undefined);
      if (errorCode === "NOT_FOUND" && isEdit && editingId) {
        // Background was deleted elsewhere; reconcile local state.
        setBackgrounds((prev) => prev.filter((b) => b.id !== editingId));
        setSelectedBackgroundId(null);
        resetBuilderToDefaults();
        setPanelModeState("saved");
        setBuilderStatus("error");
        setBuilderError(
          "That background no longer exists. Pick another one from the list or create a new background."
        );
      } else {
        setBuilderStatus("error");
        setBuilderError(
          "message" in res && res.message
            ? res.message
            : "Failed to save background. Please try again."
        );
      }
    };

    if (!("ok" in result) || !result.ok) {
      handleError(result as BrandBackgroundActionResult);
      return;
    }

    // Sync local list with the server result when available.
    if ("background" in result && result.background) {
      const bg = result.background;
      const mapped: BrandBackgroundForUI = {
        id: bg.id,
        slug: bg.slug,
        name: bg.name,
        baseColorHex: bg.baseColorHex ?? null,
        overlayImageUrl: bg.overlayImageUrl ?? null,
        overlayImageKey: bg.overlayImageKey ?? null,
        overlayIconId: bg.overlayIconId ?? null,
        overlayOpacity: bg.overlayOpacity ?? DEFAULT_OPACITY,
        overlayScale: bg.overlayScale ?? DEFAULT_SCALE,
        overlaySpacing: bg.overlaySpacing ?? DEFAULT_SPACING,
        overlayRotation: bg.overlayRotation ?? DEFAULT_ROTATION,
        previewImageUrl: (bg as { previewImageUrl?: string | null }).previewImageUrl ?? null,
        previewImageKey: (bg as { previewImageKey?: string | null }).previewImageKey ?? null,
        isAvailable: (bg as { isAvailable?: boolean | null }).isAvailable ?? true,
        isActive: bg.isActive,
        sortOrder: bg.sortOrder,
        tags: bg.tags ?? [],
      };

      setBackgrounds((prev) => {
        const index = prev.findIndex((b) => b.id === bg.id);
        if (index === -1) {
          return [...prev, mapped];
        }
        const next = prev.slice();
        next[index] = mapped;
        return next;
      });
    }

    setBuilderStatus("idle");
    setBuilderError(null);
    if (!isEdit) {
      resetBuilderToDefaults();
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setErrorById((prev) => ({ ...prev, [id]: null }));
    const result = await toggleBrandBackgroundActive(id, !isActive);
    if (result.error) {
      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setErrorById((prev) => ({
        ...prev,
        [id]: result.error ?? "Failed to update background",
      }));
      return;
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleToggleAvailability(id: string) {
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setErrorById((prev) => ({ ...prev, [id]: null }));

    // Optimistic local toggle so the card doesn't disappear
    setBackgrounds((prev) =>
      prev.map((bg) =>
        bg.id === id ? { ...bg, isAvailable: !bg.isAvailable } : bg
      )
    );

    const result = await toggleBackgroundAvailabilityAction(id);

    if (result.error || !result.background) {
      // Revert optimistic update on failure
      setBackgrounds((prev) =>
        prev.map((bg) =>
          bg.id === id ? { ...bg, isAvailable: !bg.isAvailable } : bg
        )
      );

      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setErrorById((prev) => ({
        ...prev,
        [id]:
          result.error ??
          "Failed to update background availability",
      }));
      return;
    }

    // Sync local state with server response
    setBackgrounds((prev) =>
      prev.map((bg) =>
        bg.id === id
          ? { ...bg, isAvailable: result.background!.isAvailable }
          : bg
      )
    );

    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
  }

  async function handleDelete(id: string, name?: string) {
    const label = name ?? "this background";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setErrorById((prev) => ({ ...prev, [id]: null }));
    const result = await deleteBrandBackground(id);

    if (!result.ok) {
      // Treat NOT_FOUND as already deleted / safe success.
      if (result.errorCode === "NOT_FOUND") {
        setBackgrounds((prev) => prev.filter((bg) => bg.id !== id));
        if (selectedBackgroundId === id) {
          setSelectedBackgroundId(null);
          resetBuilderToDefaults();
          setPanelModeState("saved");
        }
      } else {
        setStatusById((prev) => ({ ...prev, [id]: "error" }));
        setErrorById((prev) => ({
          ...prev,
          [id]:
            result.message ??
            "Failed to delete background",
        }));
        return;
      }
    } else {
      // Successful delete: remove from local list and clear selection/editor if needed.
      setBackgrounds((prev) => prev.filter((bg) => bg.id !== id));
      if (selectedBackgroundId === id) {
        setSelectedBackgroundId(null);
        resetBuilderToDefaults();
        setPanelModeState("saved");
      }
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleGenerateBackground() {
    setAiGenerating(true);
    setAiError(null);
    setAiResults([]);
    const result = await generateBackgroundImagesAction({
      prompt: aiPrompt.trim() || "Subtle paper-like texture for document background",
      type: aiType,
    });
    setAiGenerating(false);
    if (result.error) {
      setAiError(result.error);
      return;
    }
    if (result.images?.length) {
      setAiResults(result.images);
      setSelectedAiKey(null);
    }
  }

  const selectedBackground =
    selectedBackgroundId != null
      ? backgrounds.find((b) => b.id === selectedBackgroundId) ?? null
      : null;

  const totalBackgrounds = visibleBackgrounds.length;
  const hasBackgrounds = totalBackgrounds > 0;
  const noMatches =
    hasBackgrounds &&
    filteredBackgrounds.length === 0 &&
    search.trim().length > 0;

  function generateUniqueSlug(base: string, existingSlugs: string[]): string {
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    if (!existingSlugs.includes(normalized)) return normalized;
    let i = 2;
    while (existingSlugs.includes(`${normalized}-${i}`)) {
      i += 1;
    }
    return `${normalized}-${i}`;
  }

  function handleSelectAiResult(img: GeneratedImage, index: number) {
    setSelectedAiKey(img.imageKey);
    const existingSlugs = backgrounds.map((b) => b.slug);
    setBuilderDraft((prev) => {
      const next: BuilderDraft = {
        ...prev,
        overlayMode: "image",
        overlayImageUrl: img.imageUrl,
        overlayImageKey: img.imageKey,
        overlayIconId: null,
        overlayOpacity: 8,
        overlayScale: 100,
        overlaySpacing: 140,
        overlayRotation: 0,
      };

      if (!prev.name.trim()) {
        const name = `AI Background ${index + 1}`;
        next.name = name;
      }
      if (!prev.slug.trim()) {
        const baseSlug = `ai-background-${index + 1}`;
        next.slug = generateUniqueSlug(baseSlug, existingSlugs);
      }

      return next;
    });
    setPanelModeState("edit");
    if (builderSectionRef.current) {
      builderSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    if (builderNameInputRef.current) {
      builderNameInputRef.current.focus();
    }
  }

  return (
    <div className={isPanelLayout ? "space-y-4" : "space-y-6"}>
      {/* Top controls: Saved vs Create/Edit, plus search/filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-1 py-0.5 text-[11px] text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <button
            type="button"
            onClick={() => setPanelModeState("saved")}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              panelModeState === "saved"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Saved Backgrounds
          </button>
          <button
            type="button"
            onClick={() => {
              setPanelModeState("edit");
            }}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              panelModeState === "edit"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            Create / Edit
          </button>
        </div>
        {panelModeState === "saved" && selectedBackground && (
          <button
            type="button"
            onClick={() => loadBackgroundIntoBuilder(selectedBackground)}
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Edit selected
          </button>
        )}
        {panelModeState === "saved" && (
          <>
            <input
              type="search"
              placeholder="Search by name, slug, or tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600 sm:max-w-[220px]"
            />
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Show
              </span>
              <button
                type="button"
                onClick={() => setShowOnlyActive(true)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  showOnlyActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setShowOnlyActive(false)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  !showOnlyActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                All
              </button>
            </div>
          </>
        )}
      </div>

      {panelModeState === "edit" && (
        <>
          {/* Flow steps */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
              Step 1: Generate
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
              Step 2: Select a result to edit
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
              Step 3: Adjust + Save
            </span>
          </div>

          {/* AI generator card */}
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  AI Background Generator
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Describe the background style. Generated images can be used as repeating texture overlays.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void handleGenerateBackground();
                  }}
                  disabled={aiGenerating}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {aiGenerating ? "Generating…" : "Generate with AI"}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Describe the background style…
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                className="w-full max-h-[90px] resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                placeholder="e.g. Subtle paper texture, light blueprint grid, soft concrete noise…"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Type
              </label>
              <select
                value={aiType}
                onChange={(e) =>
                  setAiType(e.target.value as typeof aiType)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
              >
                {BACKGROUND_GEN_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {aiError && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {aiError}
              </p>
            )}
            {aiResults.length > 0 && (
              <div className="space-y-2 pointer-events-auto relative z-10">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  AI Results — click a card to edit
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {aiResults.slice(0, 6).map((img, idx) => {
                    const isSelected = selectedAiKey === img.imageKey;
                    return (
                      <button
                        key={img.imageKey + idx}
                        type="button"
                        onClick={() => handleSelectAiResult(img, idx)}
                        className={`flex flex-col gap-1 rounded-lg border overflow-hidden bg-zinc-50 text-left transition focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:bg-zinc-800 ${
                          isSelected
                            ? "ring-2 ring-zinc-900 border-zinc-900 dark:ring-zinc-100 dark:border-zinc-100"
                            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-500"
                        }`}
                      >
                        <div className="relative aspect-square w-full bg-zinc-200 dark:bg-zinc-700">
                          <img
                            src={img.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          {isSelected && (
                            <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100/90 dark:text-zinc-900">
                              Selected
                            </span>
                          )}
                        </div>
                        <div className="mx-1 mb-1 flex items-center justify-between gap-1">
                          <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                            Result {idx + 1}
                          </span>
                          <span className="inline-flex items-center rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                            Edit this
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Main content */}
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
          {/* Left: Saved Backgrounds grid */}
          <div className="min-w-0 flex-1 space-y-3 lg:max-w-[360px]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Saved Backgrounds
                </h2>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {filteredBackgrounds.length} item
                  {filteredBackgrounds.length === 1 ? "" : "s"}
                </span>
              </div>
              {!hasBackgrounds ? (
                <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                  <p className="font-medium text-zinc-800 dark:text-zinc-100">
                    No saved backgrounds yet
                  </p>
                  <p className="mt-1">
                    Use the builder on the right to create your first background recipe.
                  </p>
                </div>
              ) : (
                <>
                  {noMatches && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      No matches for &quot;{search}&quot;.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filteredBackgrounds.map((bg) => {
                      const status = statusById[bg.id] ?? "idle";
                      const error = errorById[bg.id] ?? null;
                      const isKebabOpen = kebabOpenId === bg.id;
                      const isSelected = selectedBackgroundId === bg.id;

                      const overlayIconImageUrl =
                        bg.overlayIconId
                          ? brandIcons.find((i) => i.id === bg.overlayIconId)?.imageUrl ?? null
                          : null;

                      const effectivePreviewUrl =
                        bg.previewImageUrl ??
                        bg.overlayImageUrl ??
                        overlayIconImageUrl ??
                        null;

                      return (
                        <article
                          key={bg.id}
                          className={`relative flex flex-col rounded-xl border bg-white p-3 text-xs shadow-sm dark:bg-zinc-900 ${
                            isSelected
                              ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                              : "border-zinc-200 dark:border-zinc-800"
                          }`}
                        >
                          {isKebabOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={() => setKebabOpenId(null)}
                              />
                              <div className="absolute left-3 top-7 z-20 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                                <button
                                  type="button"
                                  onClick={() => {
                                    loadBackgroundIntoBuilder(bg);
                                    setKebabOpenId(null);
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleToggleActive(
                                      bg.id,
                                      bg.isActive
                                    );
                                    setKebabOpenId(null);
                                  }}
                                  disabled={status === "saving" || pending}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  {bg.isActive ? "Disable" : "Enable"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDelete(bg.id, bg.name);
                                    setKebabOpenId(null);
                                  }}
                                  disabled={status === "saving" || pending}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}

                          <div className="mb-2">
                            <button
                              type="button"
                              onClick={() => handleSelectSavedBackground(bg)}
                              className="block w-full text-left"
                            >
                              {effectivePreviewUrl ? (
                                <div className="relative h-24 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                                  <img
                                    src={effectivePreviewUrl}
                                    alt={bg.name}
                                    className="h-full w-full object-cover"
                                  />
                                  {isSelected && (
                                    <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100/90 dark:text-zinc-900">
                                      Selected
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <BackgroundPreviewSurface
                                  recipe={{
                                    baseColorHex: bg.baseColorHex ?? "#ffffff",
                                    overlayImageUrl: bg.overlayImageUrl ?? null,
                                    overlayOpacity:
                                      bg.overlayOpacity ?? DEFAULT_OPACITY,
                                    overlayScale: bg.overlayScale ?? DEFAULT_SCALE,
                                    overlaySpacing:
                                      bg.overlaySpacing ?? DEFAULT_SPACING,
                                    overlayRotation:
                                      bg.overlayRotation ?? DEFAULT_ROTATION,
                                    overlayIconImageUrl:
                                      overlayIconImageUrl,
                                  }}
                                  className="h-24 w-full"
                                >
                                  {isSelected && (
                                    <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100/90 dark:text-zinc-900">
                                      Selected
                                    </span>
                                  )}
                                </BackgroundPreviewSurface>
                              )}
                            </button>
                          </div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                                title={bg.name}
                              >
                                {bg.name}
                              </p>
                              {bg.slug && (
                                <p
                                  className="truncate text-[11px] text-zinc-500 dark:text-zinc-400"
                                  title={bg.slug}
                                >
                                  {bg.slug}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  bg.isActive
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}
                              >
                                {bg.isActive ? "Active" : "Disabled"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setKebabOpenId(isKebabOpen ? null : bg.id)
                                }
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                                aria-label="Actions"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleToggleAvailability(bg.id);
                            }}
                            disabled={status === "saving" || pending}
                            className={`mt-2 inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[11px] font-medium shadow-sm transition ${
                              bg.isAvailable
                                ? "border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "border border-zinc-300 bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {bg.isAvailable ? "Available" : "Unavailable"}
                          </button>
                          {error && (
                            <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">
                              {error}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

          {/* Right: Builder + live preview */}
          <div
            ref={builderSectionRef}
            className="min-w-0 flex-1 space-y-4 lg:max-w-[420px]"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Background builder
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {panelModeState === "saved"
                  ? "Switch to Create/Edit to modify the selected background or design a new one."
                  : builderMode === "edit" && builderDraft.name
                    ? `Editing: Saved Background “${builderDraft.name}”`
                    : selectedAiKey &&
                        builderDraft.overlayMode === "image" &&
                        builderDraft.overlayImageKey === selectedAiKey
                      ? "Editing: AI Generated Overlay"
                      : "Editing: New Background"}
              </p>
            </div>
            {panelModeState === "saved" ? (
              <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                {selectedBackground ? (
                  <div className="flex items-center gap-3">
                    <BackgroundPreviewSurface
                      recipe={{
                        baseColorHex: selectedBackground.baseColorHex ?? "#ffffff",
                        overlayImageUrl: selectedBackground.overlayImageUrl ?? null,
                        overlayOpacity:
                          selectedBackground.overlayOpacity ?? DEFAULT_OPACITY,
                        overlayScale: selectedBackground.overlayScale ?? DEFAULT_SCALE,
                        overlaySpacing:
                          selectedBackground.overlaySpacing ?? DEFAULT_SPACING,
                        overlayRotation:
                          selectedBackground.overlayRotation ?? DEFAULT_ROTATION,
                        overlayIconImageUrl:
                          selectedBackground.overlayIconId
                            ? brandIcons.find(
                                (i) => i.id === selectedBackground.overlayIconId
                              )?.imageUrl ?? null
                            : null,
                      }}
                      className="h-10 w-16"
                    />
                    <div className="space-y-0.5">
                      <div className="font-medium text-zinc-800 dark:text-zinc-100">
                        {selectedBackground.name}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {selectedBackground.slug}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>
                    Select a Saved Background from the grid on the left. Use &ldquo;Edit selected&rdquo; to jump into Create/Edit mode.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Name
                    </label>
                    <input
                      type="text"
                      ref={builderNameInputRef}
                      value={builderDraft.name}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                      placeholder="Presentation background A"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={builderDraft.slug}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({ ...prev, slug: e.target.value }))
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                      placeholder="presentation-background-a"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={builderDraft.tagsCsv}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({ ...prev, tagsCsv: e.target.value }))
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                      placeholder="light, cover, subtle"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Base Color
                    </label>
                    <div className="flex w-full max-w-xs items-center gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                      <input
                        type="color"
                        aria-label="Base color picker"
                        value={builderDraft.baseColorHex}
                        onChange={(e) =>
                          setBuilderDraft((prev) => ({
                            ...prev,
                            baseColorHex: e.target.value,
                          }))
                        }
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-sm border-0 p-0"
                      />
                      <input
                        type="text"
                        value={builderDraft.baseColorHex}
                        onChange={(e) =>
                          setBuilderDraft((prev) => ({
                            ...prev,
                            baseColorHex: e.target.value,
                          }))
                        }
                        className="h-8 flex-1 border-0 bg-transparent px-0 text-xs text-zinc-900 focus:ring-0 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Use icon tiling overlay
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={builderDraft.overlayMode === "icon"}
                      onClick={() =>
                        setBuilderDraft((prev) => {
                          if (prev.overlayMode === "icon") {
                            return {
                              ...prev,
                              overlayMode: "none",
                              overlayIconId: null,
                            };
                          }
                          return {
                            ...prev,
                            overlayMode: "icon",
                            overlayImageUrl: null,
                            overlayImageKey: null,
                          };
                        })
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 dark:focus:ring-zinc-600 ${
                        builderDraft.overlayMode === "icon"
                          ? "bg-zinc-900 dark:bg-zinc-100"
                          : "bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                          builderDraft.overlayMode === "icon"
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Icon (for tiling)
                    </label>
                    <select
                      value={builderDraft.overlayIconId ?? ""}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({
                          ...prev,
                          overlayMode: e.target.value ? "icon" : "none",
                          overlayIconId: e.target.value || null,
                          overlayImageUrl: e.target.value ? null : prev.overlayImageUrl,
                          overlayImageKey: e.target.value ? null : prev.overlayImageKey,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    >
                      <option value="">None</option>
                      {activeIcons.map((icon) => (
                        <option key={icon.id} value={icon.id}>
                          {icon.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Opacity
                      </label>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {builderDraft.overlayOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={OPACITY_RANGE.min}
                      max={OPACITY_RANGE.max}
                      value={builderDraft.overlayOpacity}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({
                          ...prev,
                          overlayOpacity: Number(e.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Scale
                      </label>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {builderDraft.overlayScale}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={SCALE_RANGE.min}
                      max={SCALE_RANGE.max}
                      value={builderDraft.overlayScale}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({
                          ...prev,
                          overlayScale: Number(e.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Spacing
                      </label>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {builderDraft.overlaySpacing}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={SPACING_RANGE.min}
                      max={SPACING_RANGE.max}
                      value={builderDraft.overlaySpacing}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({
                          ...prev,
                          overlaySpacing: Number(e.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Rotation
                      </label>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {builderDraft.overlayRotation}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ROTATION_RANGE.min}
                      max={ROTATION_RANGE.max}
                      value={builderDraft.overlayRotation}
                      onChange={(e) =>
                        setBuilderDraft((prev) => ({
                          ...prev,
                          overlayRotation: Number(e.target.value),
                        }))
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700"
                    />
                  </div>
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                    {builderDraft.overlayMode === "none" &&
                    !builderDraft.overlayImageUrl &&
                    !builderDraft.overlayIconId ? (
                      <p>
                        Pick a generated result above or choose an icon below to start.
                      </p>
                    ) : (
                      <div className="flex items-center gap-3">
                        <BackgroundPreviewSurface
                          recipe={{
                            baseColorHex: builderDraft.baseColorHex,
                            overlayImageUrl:
                              builderDraft.overlayMode === "image"
                                ? builderDraft.overlayImageUrl ?? null
                                : null,
                            overlayOpacity: builderDraft.overlayOpacity,
                            overlayScale: builderDraft.overlayScale,
                            overlaySpacing: builderDraft.overlaySpacing,
                            overlayRotation: builderDraft.overlayRotation,
                            overlayIconImageUrl:
                              builderDraft.overlayMode === "icon" && selectedIcon?.imageUrl
                                ? selectedIcon.imageUrl
                                : null,
                          }}
                          className="h-10 w-16"
                        />
                        <div className="space-y-0.5">
                          <div className="font-medium">Current overlay</div>
                          <div>
                            {builderDraft.overlayMode === "image"
                              ? "Overlay: AI image"
                              : builderDraft.overlayMode === "icon"
                                ? "Overlay: Icon pattern"
                                : "Overlay: None"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetBuilderToDefaults}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Reset to Defaults
                    </button>
                    {builderMode === "edit" && (
                      <button
                        type="button"
                        onClick={resetBuilderToDefaults}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSaveBackground()}
                      disabled={
                        builderStatus === "saving" ||
                        pending ||
                        !builderDraft.name.trim() ||
                        !builderDraft.slug.trim() ||
                        (!builderDraft.baseColorHex.trim() &&
                          !builderDraft.overlayImageUrl &&
                          !builderDraft.overlayIconId)
                      }
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-4 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {builderStatus === "saving"
                        ? "Saving…"
                        : builderMode === "edit"
                          ? "Save Background"
                          : "Save New Background"}
                    </button>
                  </div>
                  {builderError && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {builderError}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Live Preview: uses same recipe rules as cards */}
          <div className="shrink-0 lg:sticky lg:top-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Live Preview
              </p>
              <BackgroundPreviewSurface
                recipe={{
                  baseColorHex: builderDraft.baseColorHex,
                  overlayImageUrl:
                    builderDraft.overlayMode === "image"
                      ? builderDraft.overlayImageUrl ?? null
                      : null,
                  overlayOpacity: builderDraft.overlayOpacity,
                  overlayScale: builderDraft.overlayScale,
                  overlaySpacing: builderDraft.overlaySpacing,
                  overlayRotation: builderDraft.overlayRotation,
                  overlayIconImageUrl:
                    builderDraft.overlayMode === "icon" && selectedIcon?.imageUrl
                      ? selectedIcon.imageUrl
                      : null,
                }}
                minHeight={PREVIEW_MIN_HEIGHT}
              >
                {builderDraft.overlayMode === "none" &&
                  !builderDraft.overlayImageUrl &&
                  !builderDraft.overlayIconId && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        Base color only. Add an icon or generate a texture.
                      </span>
                    </div>
                  )}
              </BackgroundPreviewSurface>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BrandBackgroundForUI, BrandIconForUI } from "../../settings-tabs";
import {
  createBrandBackground,
  deleteBrandBackground,
  toggleBrandBackgroundActive,
  toggleBackgroundAvailabilityAction,
  updateBrandBackground,
  regenerateBackgroundPreviewAction,
  backfillAllBackgroundPreviewsAction,
  type BrandBackgroundCreateData,
  type BrandBackgroundUpdateData,
  type BrandBackgroundActionResult,
  type BrandBackgroundActionErrorCode,
  type BackgroundGenerationMode,
  type BackgroundStylePreset,
  generateBackgroundImagesAction,
  uploadReferenceImageAction,
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

const BACKGROUND_GEN_MODES: {
  value: BackgroundGenerationMode;
  label: string;
  description: string;
  count: string;
}[] = [
  {
    value: "subtle-texture",
    label: "Subtle Texture",
    description: "Low-contrast seamless tile. Composited behind text at ~5–15% opacity.",
    count: "3 results",
  },
  {
    value: "blueprint-overlay",
    label: "Blueprint Overlay",
    description: "Architectural line-work tile. Technical / drafting quality, tiled at low opacity.",
    count: "2 results",
  },
  {
    value: "slide-visual",
    label: "Slide Visual",
    description: "Text-safe 16:9 slide backgrounds. 4 single-zone compositions + 1 full-frame concept-to-built split diptych.",
    count: "5 results",
  },
];

const STYLE_PRESETS: { value: BackgroundStylePreset; label: string }[] = [
  { value: "architectural", label: "Architectural — concrete, steel, geometric forms" },
  { value: "editorial",     label: "Editorial — design-magazine, high-contrast, refined" },
  { value: "technical",     label: "Technical — blueprint precision meets luxury brand" },
  { value: "warm-luxury",   label: "Warm Luxury — linen, stone, warm wood grain" },
];

const REFERENCE_NOTES: { value: NonNullable<import("./actions").GenerateBackgroundImagesInput["referenceNote"]>; label: string }[] = [
  { value: "composition",      label: "Borrow the composition / spatial layout" },
  { value: "style",            label: "Match the overall visual style" },
  { value: "color-mood",       label: "Draw from the color palette and mood" },
  { value: "visual-hierarchy", label: "Follow the contrast and emphasis structure" },
];

type Props = {
  brandIcons: BrandIconForUI[];
  brandBackgrounds: BrandBackgroundForUI[];
  companyName: string;
  websiteUrl: string | null;
  effectiveAccent: string;
  effectiveText: string;
  panelMode?: boolean;
};

type GeneratedImage = { imageUrl: string; imageKey: string; compositionSeed?: string | null };

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
  const [backfillStatus, setBackfillStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

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

  // AI generator state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<BackgroundGenerationMode>("subtle-texture");
  const [aiStylePreset, setAiStylePreset] = useState<BackgroundStylePreset>("architectural");
  // Reference image: uploaded to R2 first; only the key+url are kept in state.
  // No base64 ever touches the Server Action JSON payload.
  const [aiRefImageKey, setAiRefImageKey] = useState<string | null>(null);
  const [aiRefImageUrl, setAiRefImageUrl] = useState<string | null>(null);
  const [aiRefImageMimeType, setAiRefImageMimeType] = useState<string | null>(null);
  const [aiRefUploading, setAiRefUploading] = useState(false);
  const [aiRefUploadError, setAiRefUploadError] = useState<string | null>(null);
  const [aiRefNote, setAiRefNote] = useState<import("./actions").GenerateBackgroundImagesInput["referenceNote"]>(null);
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

  // ── Debug: log the live preview recipe whenever the builder draft changes ──
  // Fires any time a background is loaded into the builder or a control is
  // adjusted.  Shows exactly what BackgroundPreviewSurface will receive.
  useEffect(() => {
    if (!editingId) return;
    const tileSizePx =
      builderDraft.overlaySpacing * (builderDraft.overlayScale / 100 || 1);
    console.log("[BgLib] Live preview recipe", {
      editingId,
      builderMode,
      overlayMode: builderDraft.overlayMode,
      baseColorHex: builderDraft.baseColorHex,
      // image overlay
      overlayImageUrl:
        builderDraft.overlayMode === "image"
          ? builderDraft.overlayImageUrl
          : "(not image mode)",
      // icon overlay
      overlayIconId:
        builderDraft.overlayMode === "icon" ? builderDraft.overlayIconId : "(not icon mode)",
      overlayOpacity: builderDraft.overlayOpacity,
      overlayScale: builderDraft.overlayScale,
      overlaySpacing: builderDraft.overlaySpacing,
      overlayRotation: builderDraft.overlayRotation,
      // Derived — what BackgroundPreviewSurface computes
      computedTileSizePx: tileSizePx,
      willUseCoverMode: tileSizePx >= 2000,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, builderDraft]);

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

  /**
   * Hydrates all builder state fields from a saved background record.
   * Does NOT change the panel tab — callers decide whether to switch.
   */
  function hydrateBuilderState(bg: BrandBackgroundForUI) {
    const resolvedOverlayMode = bg.overlayImageUrl ? "image" : bg.overlayIconId ? "icon" : "none";
    const computedTileSizePx = (bg.overlaySpacing ?? DEFAULT_SPACING) * ((bg.overlayScale ?? DEFAULT_SCALE) / 100 || 1);
    console.log("[BgLib] hydrateBuilderState", {
      id: bg.id,
      name: bg.name,
      generationMode: bg.generationMode,
      overlayImageUrl: bg.overlayImageUrl,
      overlayIconId: bg.overlayIconId,
      overlayOpacity: bg.overlayOpacity,
      overlayScale: bg.overlayScale,
      overlaySpacing: bg.overlaySpacing,
      overlayRotation: bg.overlayRotation,
      previewImageUrl: bg.previewImageUrl,
      resolvedOverlayMode,
      computedTileSizePx,
      willUseCoverMode: computedTileSizePx >= 2000,
    });
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
      overlayMode: resolvedOverlayMode,
      overlayImageUrl: bg.overlayImageUrl ?? null,
      overlayImageKey: bg.overlayImageKey ?? null,
      overlayIconId: bg.overlayIconId ?? null,
      overlayOpacity: bg.overlayOpacity ?? DEFAULT_OPACITY,
      overlayScale: bg.overlayScale ?? DEFAULT_SCALE,
      overlaySpacing: bg.overlaySpacing ?? DEFAULT_SPACING,
      overlayRotation: bg.overlayRotation ?? DEFAULT_ROTATION,
    });
  }

  function loadBackgroundIntoBuilder(bg: BrandBackgroundForUI) {
    // Hydrate builder AND switch to Create/Edit panel.
    // Called by "Edit selected" pill and "Edit this background" kebab item.
    console.log("[BgLib] loadBackgroundIntoBuilder → switching to edit panel for:", bg.id, bg.name);
    hydrateBuilderState(bg);
    setPanelModeState("edit");
  }

  function handleSelectSavedBackground(bg: BrandBackgroundForUI) {
    // Card click: hydrate builder so the small selected-preview updates,
    // but STAY on the Saved Backgrounds panel (no tab switch).
    console.log("[BgLib] Card selected → hydrating builder (staying on Saved tab):", bg.id, bg.name);
    hydrateBuilderState(bg);
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
      // Preserve generation provenance so the record knows how it was created.
      generationMode: selectedAiKey ? aiMode : undefined,
      stylePreset: selectedAiKey && aiMode === "slide-visual" ? aiStylePreset : undefined,
      compositionSeed: selectedAiKey
        ? (aiResults.find(r => r.imageKey === selectedAiKey)?.compositionSeed ?? null)
        : null,
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
        generationMode: (bg as { generationMode?: string | null }).generationMode ?? null,
        stylePreset: (bg as { stylePreset?: string | null }).stylePreset ?? null,
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
    const current = backgrounds.find((b) => b.id === id);
    console.log("[BgLib] Toggling availability for id:", id, "| currently isAvailable:", current?.isAvailable);
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

  async function handleRegeneratePreview(id: string) {
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setErrorById((prev) => ({ ...prev, [id]: null }));
    const result = await regenerateBackgroundPreviewAction(id);
    if (!result.ok) {
      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setErrorById((prev) => ({ ...prev, [id]: result.message ?? "Preview regeneration failed" }));
      return;
    }
    // Update the local backgrounds list with the refreshed previewImageUrl
    if ("background" in result && result.background) {
      const bg = result.background;
      setBackgrounds((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                previewImageUrl: (bg as { previewImageUrl?: string | null }).previewImageUrl ?? b.previewImageUrl,
                previewImageKey: (bg as { previewImageKey?: string | null }).previewImageKey ?? b.previewImageKey,
              }
            : b
        )
      );
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    startTransition(() => { router.refresh(); });
  }

  async function handleBackfillPreviews() {
    setBackfillStatus("running");
    setBackfillMessage(null);
    const result = await backfillAllBackgroundPreviewsAction();
    setBackfillStatus(result.ok ? "done" : "error");
    setBackfillMessage(result.message);
    startTransition(() => { router.refresh(); });
  }

  async function handleGenerateBackground() {
    setAiGenerating(true);
    setAiError(null);
    setAiResults([]);
    const result = await generateBackgroundImagesAction({
      prompt: aiPrompt.trim(),
      mode: aiMode,
      stylePreset: aiStylePreset,
      brandContext: {
        accentColor: effectiveAccent,
        textColor: effectiveText,
        companyName: companyName || "Design-Build Company",
      },
      // Pass R2 key only — no binary data in the SA payload.
      // The action fetches bytes from R2 itself and cleans up after use.
      referenceImageKey: aiRefImageKey,
      referenceImageMimeType: aiRefImageMimeType,
      referenceNote: aiRefNote,
    });
    setAiGenerating(false);
    // The server action deleted the temp ref image from R2 after use.
    // Clear the client-side ref state so the next generation starts fresh.
    setAiRefImageKey(null);
    setAiRefImageUrl(null);
    setAiRefImageMimeType(null);
    setAiRefNote(null);
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

    // Default overlay settings vary by mode.
    // slide-visual: full opacity, non-tiling (large spacing acts as no-repeat)
    // others: low opacity tile with spacing
    const isSlideVisual = aiMode === "slide-visual";
    const modeSlug = aiMode === "slide-visual" ? "slide-visual" : aiMode === "blueprint-overlay" ? "blueprint" : "texture";

    setBuilderDraft((prev) => {
      const next: BuilderDraft = {
        ...prev,
        overlayMode: "image",
        overlayImageUrl: img.imageUrl,
        overlayImageKey: img.imageKey,
        overlayIconId: null,
        overlayOpacity: isSlideVisual ? 100 : 8,
        overlayScale: 100,
        overlaySpacing: isSlideVisual ? 9999 : 140,
        overlayRotation: 0,
      };

      if (!prev.name.trim()) {
        next.name = `AI ${modeSlug.charAt(0).toUpperCase() + modeSlug.slice(1)} ${index + 1}`;
      }
      if (!prev.slug.trim()) {
        next.slug = generateUniqueSlug(`ai-${modeSlug}-${index + 1}`, existingSlugs);
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
                  Choose a mode, describe what you want, then generate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { void handleGenerateBackground(); }}
                disabled={aiGenerating}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {aiGenerating ? "Generating…" : "Generate with AI"}
              </button>
            </div>

            {/* Generation mode selector */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Mode</p>
              <div className="grid grid-cols-1 gap-1.5">
                {BACKGROUND_GEN_MODES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAiMode(opt.value)}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                      aiMode === opt.value
                        ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
                        : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500"
                    }`}
                  >
                    <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 ${
                      aiMode === opt.value
                        ? "border-white bg-white dark:border-zinc-900 dark:bg-zinc-900"
                        : "border-zinc-400 bg-transparent dark:border-zinc-500"
                    }`} />
                    <span className="min-w-0">
                      <span className={`block text-[11px] font-semibold leading-tight ${
                        aiMode === opt.value ? "text-white dark:text-zinc-900" : "text-zinc-900 dark:text-zinc-100"
                      }`}>
                        {opt.label}
                        <span className={`ml-1.5 font-normal opacity-60`}>{opt.count}</span>
                      </span>
                      <span className={`block text-[10px] leading-snug mt-0.5 ${
                        aiMode === opt.value ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500 dark:text-zinc-400"
                      }`}>
                        {opt.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Style preset — only visible for slide-visual */}
            {aiMode === "slide-visual" && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Visual Mood</p>
                <select
                  value={aiStylePreset}
                  onChange={(e) => setAiStylePreset(e.target.value as BackgroundStylePreset)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                >
                  {STYLE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Brand colors ({effectiveAccent}, {effectiveText}) are automatically injected.
                </p>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {aiMode === "slide-visual"
                  ? "Describe material, texture, or architectural cues…"
                  : "Describe the texture or pattern…"}
              </label>
              {aiMode === "slide-visual" && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Describe materials or architectural elements — not a full scene. The AI will generate 4 background variants (left-weighted, right-weighted, bottom fade, corner).
                </p>
              )}
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                className="w-full max-h-[80px] resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                placeholder={
                  aiMode === "subtle-texture"
                    ? "e.g. Soft paper grain, muted linen weave, warm concrete…"
                    : aiMode === "blueprint-overlay"
                    ? "e.g. Floor plan fragments, drafting grid, construction detail callouts…"
                    : "e.g. Warm stone surface, linear wood grain, geometric steel framing…"
                }
              />
            </div>

            {/* Optional reference image */}
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 select-none list-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                Optional: reference image
              </summary>
              <div className="mt-2 space-y-2 pl-4">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Upload an image to guide — not copy — the output. Choose what to borrow from it.
                </p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={aiRefUploading}
                  className="block w-full text-[11px] text-zinc-600 dark:text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-zinc-700 disabled:opacity-50 dark:file:bg-zinc-800 dark:file:text-zinc-200"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setAiRefImageKey(null);
                      setAiRefImageUrl(null);
                      setAiRefImageMimeType(null);
                      setAiRefUploadError(null);
                      return;
                    }
                    // Upload to R2 immediately so the SA payload stays key-only.
                    setAiRefUploading(true);
                    setAiRefUploadError(null);
                    setAiRefImageKey(null);
                    setAiRefImageUrl(null);
                    const fd = new FormData();
                    fd.set("file", file);
                    const result = await uploadReferenceImageAction(fd);
                    setAiRefUploading(false);
                    if (!result.ok) {
                      setAiRefUploadError(result.error);
                      return;
                    }
                    setAiRefImageKey(result.key);
                    setAiRefImageUrl(result.url);
                    setAiRefImageMimeType(file.type);
                  }}
                />
                {/* Upload progress / error */}
                {aiRefUploading && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Uploading…
                  </p>
                )}
                {aiRefUploadError && (
                  <p className="text-[10px] text-red-600 dark:text-red-400">
                    {aiRefUploadError}
                  </p>
                )}
                {/* Thumbnail preview + aspect note selector */}
                {aiRefImageUrl && !aiRefUploading && (
                  <div className="space-y-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={aiRefImageUrl}
                      alt="Reference image preview"
                      className="h-16 w-full rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                    <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      What to borrow from it:
                    </p>
                    <select
                      value={aiRefNote ?? ""}
                      onChange={(e) =>
                        setAiRefNote((e.target.value || null) as typeof aiRefNote)
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    >
                      <option value="">Choose…</option>
                      {REFERENCE_NOTES.map((n) => (
                        <option key={n.value} value={n.value}>{n.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </details>

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
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Saved Backgrounds
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {filteredBackgrounds.length} item{filteredBackgrounds.length === 1 ? "" : "s"}
                  </span>
                  {hasBackgrounds && (
                    <button
                      type="button"
                      onClick={() => { void handleBackfillPreviews(); }}
                      disabled={backfillStatus === "running"}
                      title="Regenerate missing preview images for all saved backgrounds"
                      className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      {backfillStatus === "running" ? "Fixing…" : "Fix previews"}
                    </button>
                  )}
                </div>
              </div>
              {backfillMessage && (
                <p className={`text-[11px] ${backfillStatus === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {backfillMessage}
                </p>
              )}
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

                      // Thumbnail opacity: boost to minimum 70% so low-opacity textures
                      // (subtle-texture / blueprint at 6–8%) are visible in the card grid.
                      // The actual design opacity is preserved in the builder live preview.
                      const thumbnailOpacity = Math.max(bg.overlayOpacity ?? DEFAULT_OPACITY, 70);

                      const resolvedOverlayMode = bg.overlayImageUrl ? "image" : overlayIconImageUrl ? "icon" : "none";
                      const computedTileSizePx = (bg.overlaySpacing ?? DEFAULT_SPACING) * ((bg.overlayScale ?? DEFAULT_SCALE) / 100 || 1);
                      console.log("[BgLib] Card render", {
                        id: bg.id,
                        name: bg.name,
                        generationMode: bg.generationMode,
                        baseColorHex: bg.baseColorHex,
                        overlayType: resolvedOverlayMode,
                        overlayImageUrl: bg.overlayImageUrl ?? null,
                        overlayIconImageUrl,
                        overlayOpacity: bg.overlayOpacity,
                        thumbnailOpacity,
                        overlayScale: bg.overlayScale,
                        overlaySpacing: bg.overlaySpacing,
                        computedTileSizePx,
                        willUseCoverMode: computedTileSizePx >= 2000,
                        previewImageUrl: bg.previewImageUrl,
                      });

                      return (
                        <article
                          key={bg.id}
                          className={`relative flex flex-col rounded-xl border bg-white text-xs shadow-sm transition-shadow dark:bg-zinc-900 ${
                            isSelected
                              ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                              : "border-zinc-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
                          }`}
                        >
                          {/* ── Kebab overlay (stopPropagation so card click doesn't fire) ── */}
                          {isKebabOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={(e) => { e.stopPropagation(); setKebabOpenId(null); }}
                              />
                              <div className="absolute right-2 top-8 z-20 min-w-[148px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadBackgroundIntoBuilder(bg);
                                    setKebabOpenId(null);
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Edit this background
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRegeneratePreview(bg.id);
                                    setKebabOpenId(null);
                                  }}
                                  disabled={status === "saving" || pending}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  Regenerate preview
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleToggleActive(bg.id, bg.isActive);
                                    setKebabOpenId(null);
                                  }}
                                  disabled={status === "saving" || pending}
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                  {bg.isActive ? "Disable" : "Enable"}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
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

                          {/* ── Selectable card body — clicking anywhere here loads into builder ── */}
                          <button
                            type="button"
                            onClick={() => handleSelectSavedBackground(bg)}
                            className="flex w-full flex-col gap-0 rounded-t-xl p-3 pb-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset"
                            aria-label={`Select background: ${bg.name}`}
                          >
                            {/* Thumbnail — opacity boosted to min 70% so low-opacity textures are visible */}
                            <BackgroundPreviewSurface
                              recipe={{
                                baseColorHex: bg.baseColorHex ?? "#f5f4f1",
                                overlayImageUrl: bg.overlayImageUrl ?? null,
                                overlayOpacity: thumbnailOpacity,
                                overlayScale: bg.overlayScale ?? DEFAULT_SCALE,
                                overlaySpacing: bg.overlaySpacing ?? DEFAULT_SPACING,
                                overlayRotation: bg.overlayRotation ?? DEFAULT_ROTATION,
                                overlayIconImageUrl: overlayIconImageUrl,
                              }}
                              className="mb-2 h-24 w-full"
                            >
                              {/* Selected badge */}
                              {isSelected && (
                                <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100/90 dark:text-zinc-900">
                                  Selected
                                </span>
                              )}
                              {/* Base-color-only hint */}
                              {!bg.overlayImageUrl && !overlayIconImageUrl && (
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-zinc-400 dark:text-zinc-500 pointer-events-none">
                                  Base color only
                                </span>
                              )}
                            </BackgroundPreviewSurface>

                            {/* Name / slug */}
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
                          </button>

                          {/* ── Bottom bar: active badge, kebab, availability toggle ── */}
                          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                            {/* Left: availability toggle — stopPropagation so it doesn't bubble to card */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleToggleAvailability(bg.id);
                              }}
                              disabled={status === "saving" || pending}
                              title={bg.isAvailable ? "Click to mark unavailable" : "Click to mark available"}
                              className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-medium transition ${
                                bg.isAvailable
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                              } disabled:opacity-50`}
                            >
                              {bg.isAvailable ? "Available" : "Unavailable"}
                            </button>

                            {/* Right: active badge + kebab */}
                            <div className="flex items-center gap-1.5">
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setKebabOpenId(isKebabOpen ? null : bg.id);
                                }}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                                aria-label="Actions"
                              >
                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {error && (
                            <p className="px-3 pb-2 text-[10px] text-red-600 dark:text-red-400">
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


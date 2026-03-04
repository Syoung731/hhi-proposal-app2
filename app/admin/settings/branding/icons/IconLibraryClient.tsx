"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createBrandIcon,
  deleteBrandIcon,
  toggleBrandIconActive,
  updateBrandIcon,
  type BrandIconCreateData,
  type BrandIconUpdateData,
  type BrandIconSuggestion,
  suggestBrandIconsAction,
  generateBrandIconPngAction,
  createBrandIconUploadAction,
} from "../../actions";
import { normalizeIconKey } from "@/app/lib/brand-icons";

const PREVIEW_BOX_SIZE = 96;

type BrandIconForUI = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string;
  imageKey: string;
  tags: string[];
  category: string | null;
  isActive: boolean;
};

type SuggestionWithPng = BrandIconSuggestion & {
  imageUrl?: string;
  imageKey?: string;
  pngStatus: "idle" | "generating" | "ready" | "error";
  pngError?: string;
  saved: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError?: string;
  skipAutoSave?: boolean;
};

type Props = {
  icons: BrandIconForUI[];
  companyName: string;
  websiteUrl: string | null;
  effectiveAccent: string;
  effectiveText: string;
  /** When true, render for slide-over panel: toolbar, no breadcrumbs, AI as separate view */
  panelMode?: boolean;
};

type Status = "idle" | "saving" | "error";

export function IconLibraryClient({
  icons,
  companyName,
  websiteUrl,
  effectiveAccent,
  effectiveText,
  panelMode = false,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editErrorById, setEditErrorById] = useState<Record<string, string | null>>({});
  const [statusById, setStatusById] = useState<Record<string, Status>>({});
  const [createStatus, setCreateStatus] = useState<Status>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeSuggestionKey, setActiveSuggestionKey] = useState<string | null>(
    null
  );

  const [aiDescription, setAiDescription] = useState("");
  const [aiSuggesting, setAiSuggesting] = useState<Status>("idle");
  const [suggestionsWithPng, setSuggestionsWithPng] = useState<SuggestionWithPng[]>([]);
  const [aiSuggestionsError, setAiSuggestionsError] = useState<string | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  /** In panel mode: "library" | "ai" to switch between grid and AI generator view */
  const [panelView, setPanelView] = useState<"library" | "ai">("library");
  /** Kebab menu open per icon id */
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null);

  const [autoSaveReady, setAutoSaveReady] = useState(false);

  const [bulkSaveStatus, setBulkSaveStatus] = useState<Status>("idle");
  const [bulkSaveProgress, setBulkSaveProgress] = useState<{
    total: number;
    success: number;
    failed: number;
  } | null>(null);
  const [bulkSaveErrors, setBulkSaveErrors] = useState<
    { slug: string; error: string }[]
  >([]);

  const [generatingCount, setGeneratingCount] = useState(0);
  const [createUploading, setCreateUploading] = useState(false);

  const [createForm, setCreateForm] = useState<{
    slug: string;
    name: string;
    imageUrl: string;
    imageKey: string;
    tagsCsv: string;
    category: string;
  }>({
    slug: "",
    name: "",
    imageUrl: "",
    imageKey: "",
    tagsCsv: "",
    category: "",
  });

  const [editForms, setEditForms] = useState<
    Record<
      string,
      {
        slug: string;
        name: string;
        imageUrl: string;
        imageKey: string;
        tagsCsv: string;
        category: string;
      }
    >
  >({});

  const visibleIcons = useMemo(
    () => (showOnlyActive ? icons.filter((icon) => icon.isActive) : icons),
    [icons, showOnlyActive]
  );

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleIcons;
    return visibleIcons.filter((icon) => {
      const haystack = [
        icon.name,
        icon.slug,
        icon.category ?? "",
        ...(icon.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleIcons, search]);

  function parseTagsCsv(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function isSlugAlreadyExistsError(message: string | undefined | null): boolean {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes("slug") && lower.includes("already exists");
  }

  async function saveSuggestionToBrandIcons(
    suggestion: SuggestionWithPng
  ): Promise<{ ok: boolean; error?: string }> {
    if (!suggestion.imageUrl || !suggestion.imageKey) {
      return { ok: false, error: "Suggestion is missing generated image" };
    }

    const baseSlug = suggestion.slug;
    const tags = suggestion.tags ?? [];
    const category = suggestion.category ?? null;

    for (let attempt = 0; attempt <= 10; attempt++) {
      const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
      const slugToUse = `${baseSlug}${suffix}`;

      const payload: BrandIconCreateData = {
        slug: slugToUse,
        name: suggestion.name,
        imageUrl: suggestion.imageUrl,
        imageKey: suggestion.imageKey,
        tags,
        category,
      };

      const result = await createBrandIcon(payload);
      if (!result.error) {
        return { ok: true };
      }

      if (!isSlugAlreadyExistsError(result.error) || attempt === 10) {
        return { ok: false, error: result.error ?? "Failed to save icon" };
      }
    }

    return { ok: false, error: "Failed to save icon due to slug collisions" };
  }

  function getSuggestionKey(s: { slug?: string; name: string }): string {
    return normalizeIconKey(s.slug || s.name);
  }

  async function handleSuggestIcons() {
    setAiSuggesting("saving");
    setAiSuggestionsError(null);

    // Build a set of existing normalized keys from saved icons and current suggestions
    const existingKeySet = new Set<string>();
    icons.forEach((icon) => {
      const key = normalizeIconKey(icon.slug || icon.name);
      if (key) existingKeySet.add(key);
    });
    suggestionsWithPng.forEach((s) => {
      const key = normalizeIconKey(s.slug || s.name);
      if (key) existingKeySet.add(key);
    });

    setSuggestionsWithPng([]);
    setGeneratingCount(0);
    try {
      const result = await suggestBrandIconsAction({
        companyName,
        websiteUrl: websiteUrl ?? undefined,
        description: aiDescription || undefined,
        existingKeys: Array.from(existingKeySet),
      });
      if (result.error) {
        setAiSuggesting("error");
        setSuggestionsWithPng([]);
        setAiSuggestionsError(result.error);
        return;
      }
      setAiSuggesting("idle");
      const suggestions = result.suggestions ?? [];
      const mapped: SuggestionWithPng[] = suggestions.map((s) => ({
        ...s,
        imageUrl: undefined,
        imageKey: undefined,
        pngStatus: "idle",
        pngError: undefined,
        saved: false,
        saveStatus: "idle",
        saveError: undefined,
        skipAutoSave: false,
      }));
      setSuggestionsWithPng(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiSuggesting("error");
      setSuggestionsWithPng([]);
      setAiSuggestionsError(msg);
    }
  }

  async function generatePngForSuggestion(index: number) {
    const suggestion = suggestionsWithPng[index];
    if (!suggestion) return;
    try {
      const result = await generateBrandIconPngAction({
        name: suggestion.name,
        description: suggestion.description ?? undefined,
        visual: suggestion.visual,
      });
      if (result.error || !result.imageUrl || !result.imageKey) {
        const errorMessage =
          result.error ?? "Failed to generate PNG for this icon.";
        setSuggestionsWithPng((prev) => {
          if (!prev[index]) return prev;
          const next = [...prev];
          next[index] = {
            ...next[index]!,
            pngStatus: "error",
            pngError: errorMessage,
          };
          return next;
        });
        return;
      }

      setSuggestionsWithPng((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        next[index] = {
          ...next[index]!,
          imageUrl: result.imageUrl,
          imageKey: result.imageKey,
          pngStatus: "ready",
          pngError: undefined,
        };
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSuggestionsWithPng((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        next[index] = {
          ...next[index]!,
          pngStatus: "error",
          pngError: msg,
        };
        return next;
      });
    } finally {
      setGeneratingCount((count) => Math.max(0, count - 1));
    }
  }

  const MAX_CONCURRENT_PNG_REQUESTS = 3;

  useEffect(() => {
    if (suggestionsWithPng.length === 0) return;
    if (generatingCount >= MAX_CONCURRENT_PNG_REQUESTS) return;

    const availableSlots = MAX_CONCURRENT_PNG_REQUESTS - generatingCount;
    if (availableSlots <= 0) return;

    const idleIndexes = suggestionsWithPng
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.pngStatus === "idle")
      .slice(0, availableSlots);

    if (idleIndexes.length === 0) return;

    idleIndexes.forEach(({ index }) => {
      setSuggestionsWithPng((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        next[index] = {
          ...next[index]!,
          pngStatus: "generating",
          pngError: undefined,
        };
        return next;
      });
      setGeneratingCount((count) => count + 1);
      void generatePngForSuggestion(index);
    });
  }, [suggestionsWithPng, generatingCount]);

  useEffect(() => {
    if (!autoSaveReady) return;
    if (suggestionsWithPng.length === 0) return;

    const readyToAutoSave = suggestionsWithPng.filter((s) => {
      const key = getSuggestionKey(s);
      return (
        s.pngStatus === "ready" &&
        !!s.imageUrl &&
        !!s.imageKey &&
        !s.saved &&
        s.saveStatus !== "saving" &&
        s.saveStatus !== "saved" &&
        !s.skipAutoSave &&
        !!key
      );
    });

    if (readyToAutoSave.length === 0) return;

    readyToAutoSave.forEach((suggestion) => {
      const suggestionKey = getSuggestionKey(suggestion);
      setSuggestionsWithPng((prev) =>
        prev.map((s) => {
          const key = getSuggestionKey(s);
          return key === suggestionKey
            ? { ...s, saveStatus: "saving", saveError: undefined }
            : s;
        })
      );

      void (async () => {
        const result = await saveSuggestionToBrandIcons(suggestion);

        const suggestionKey = getSuggestionKey(suggestion);
        setSuggestionsWithPng((prev) =>
          prev.map((s) => {
            const key = getSuggestionKey(s);
            if (key !== suggestionKey) return s;
            if (result.ok) {
              return {
                ...s,
                saved: true,
                saveStatus: "saved",
                saveError: undefined,
              };
            }
            return {
              ...s,
              saved: false,
              saveStatus: "error",
              saveError: result.error ?? "Failed to save icon",
            };
          })
        );

        if (result.ok) {
          startTransition(() => {
            router.refresh();
          });
        }
      })();
    });
  }, [autoSaveReady, suggestionsWithPng]);

  function handleOpenCreateFromSuggestion(suggestion: SuggestionWithPng) {
    if (!suggestion.imageUrl || !suggestion.imageKey || suggestion.pngStatus !== "ready") return;
    setActiveSuggestionKey(getSuggestionKey(suggestion));
    setCreateForm({
      slug: suggestion.slug,
      name: suggestion.name,
      imageUrl: suggestion.imageUrl,
      imageKey: suggestion.imageKey,
      tagsCsv: (suggestion.tags ?? []).join(", "),
      category: suggestion.category ?? "",
    });
    setCreateError(null);
    setModalMode("create");
  }

  async function handleCreate() {
    setCreateStatus("saving");
    setCreateError(null);
    const payload: BrandIconCreateData = {
      slug: createForm.slug,
      name: createForm.name,
      imageUrl: createForm.imageUrl,
      imageKey: createForm.imageKey,
      tags: parseTagsCsv(createForm.tagsCsv),
      category: createForm.category || null,
    };
    const result = await createBrandIcon(payload);
    if (result.error) {
      setCreateStatus("error");
      setCreateError(result.error);
      return;
    }
    setCreateStatus("idle");
    setCreateForm({
      slug: "",
      name: "",
      imageUrl: "",
      imageKey: "",
      tagsCsv: "",
      category: "",
    });
    setModalMode(null);

    // If this create came from a suggestion, remove that suggestion from the list
    if (activeSuggestionKey) {
      setSuggestionsWithPng((prev) =>
        prev.filter((s) => getSuggestionKey(s) !== activeSuggestionKey)
      );
      setActiveSuggestionKey(null);
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleCreateUpload(file: File) {
    setCreateUploading(true);
    setCreateError(null);
    try {
      const res = await createBrandIconUploadAction({
        filename: file.name,
        contentType: file.type || "image/png",
      });
      if ("error" in res) {
        setCreateError(res.error);
        return;
      }
      const uploadRes = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!uploadRes.ok) {
        setCreateError("Upload failed");
        return;
      }
      setCreateForm((prev) => ({
        ...prev,
        imageUrl: res.publicUrl,
        imageKey: res.objectKey,
      }));
    } finally {
      setCreateUploading(false);
    }
  }

  function ensureEditForm(id: string) {
    if (editForms[id]) return;
    const icon = icons.find((i) => i.id === id);
    if (!icon) return;
    setEditForms((prev) => ({
      ...prev,
      [id]: {
        slug: icon.slug,
        name: icon.name,
        imageUrl: icon.imageUrl,
        imageKey: icon.imageKey,
        tagsCsv: (icon.tags ?? []).join(", "),
        category: icon.category ?? "",
      },
    }));
  }

  async function handleUpdate(id: string) {
    const form = editForms[id];
    if (!form) return;
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setEditErrorById((prev) => ({ ...prev, [id]: null }));
    const payload: BrandIconUpdateData = {
      slug: form.slug,
      name: form.name,
      imageUrl: form.imageUrl,
      imageKey: form.imageKey,
      tags: parseTagsCsv(form.tagsCsv),
      category: form.category || null,
    };
    const result = await updateBrandIcon(id, payload);
    if (result.error) {
      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setEditErrorById((prev) => ({ ...prev, [id]: result.error ?? "Failed to update icon" }));
      return;
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    setEditingId(null);
    setModalMode(null);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setEditErrorById((prev) => ({ ...prev, [id]: null }));
    const result = await toggleBrandIconActive(id, !isActive);
    if (result.error) {
      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setEditErrorById((prev) => ({ ...prev, [id]: result.error ?? "Failed to update icon" }));
      return;
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    const icon = icons.find((i) => i.id === id);
    const label = icon?.name ?? "this icon";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setStatusById((prev) => ({ ...prev, [id]: "saving" }));
    setEditErrorById((prev) => ({ ...prev, [id]: null }));
    const result = await deleteBrandIcon(id);
    if (result.error) {
      setStatusById((prev) => ({ ...prev, [id]: "error" }));
      setEditErrorById((prev) => ({ ...prev, [id]: result.error ?? "Failed to delete icon" }));
      return;
    }
    setStatusById((prev) => ({ ...prev, [id]: "idle" }));
    startTransition(() => {
      router.refresh();
    });
  }

  const isModalOpen = modalMode !== null;

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
    setCreateError(null);
    setEditErrorById((prev) =>
      editingId ? { ...prev, [editingId]: null } : prev
    );
  }

  useEffect(() => {
    if (!isModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen, editingId]);

  function handleClearSuggestions() {
    setSuggestionsWithPng([]);
    setAiSuggestionsError(null);
    setGeneratingCount(0);
  }

  async function handleBulkSaveReady() {
    const readyToSave = suggestionsWithPng.filter((s) => {
      const key = getSuggestionKey(s);
      return (
        s.pngStatus === "ready" &&
        !!s.imageUrl &&
        !!s.imageKey &&
        !s.saved &&
        !!key
      );
    });
    if (readyToSave.length === 0) return;

    setBulkSaveStatus("saving");
    setBulkSaveErrors([]);
    setBulkSaveProgress({
      total: readyToSave.length,
      success: 0,
      failed: 0,
    });

    const readySuggestionKeys = new Set(
      readyToSave
        .map((s) => getSuggestionKey(s))
        .filter((k): k is string => !!k)
    );

    let success = 0;
    let failed = 0;
    const failures: { key: string; slug: string; error: string }[] = [];
    const successfulKeys: string[] = [];

    await Promise.all(
      readyToSave.map(async (suggestion) => {
        const key = getSuggestionKey(suggestion);
        if (!key) return;

        const result = await saveSuggestionToBrandIcons(suggestion);

        if (result.ok) {
          success += 1;
          successfulKeys.push(key);
        } else {
          failed += 1;
          failures.push({
            key,
            slug: suggestion.slug,
            error: result.error ?? "Failed to save icon",
          });
        }

        setBulkSaveProgress({
          total: readyToSave.length,
          success,
          failed,
        });
      })
    );

    const successfulKeySet = new Set(successfulKeys);
    const failureByKey = new Map<string, { error: string }>();
    failures.forEach((f) => {
      failureByKey.set(f.key, { error: f.error });
    });

    setSuggestionsWithPng((prev) =>
      prev
        .filter((s) => {
          const key = getSuggestionKey(s);
          if (!key) return true;
          return !successfulKeySet.has(key);
        })
        .map((s) => {
          const key = getSuggestionKey(s);
          if (!key) return s;
          const failure = failureByKey.get(key);
          if (!failure) return s;
          return {
            ...s,
            saved: false,
            saveStatus: "error",
            saveError: failure.error,
          };
        })
    );

    setBulkSaveErrors(
      failures.map((f) => ({
        slug: f.slug,
        error: f.error,
      }))
    );
    setBulkSaveStatus("idle");

    if (success > 0) {
      startTransition(() => {
        router.refresh();
      });
    }
  }

  const totalIcons = visibleIcons.length;
  const hasIcons = totalIcons > 0;
  const noMatches =
    hasIcons && filteredIcons.length === 0 && search.trim().length > 0;

  /** Card icon preview size in grid (slide-over and full page) — dominant centered preview */
  const CARD_ICON_SIZE = 72;
  const showAiView = panelMode ? panelView === "ai" : isAiOpen;

  return (
    <div className={panelMode ? "space-y-4" : "space-y-6"}>
      {panelMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search by name, slug, or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600 sm:max-w-[200px]"
          />
          <button
            type="button"
            onClick={() => {
              setModalMode("create");
              setCreateError(null);
            }}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Add Icon (Upload)
          </button>
          <button
            type="button"
            onClick={() => {
              setPanelView("ai");
              setIsAiOpen(true);
            }}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Generate Icons with AI
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <nav className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Link
                href="/admin/settings"
                className="rounded-full px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Settings
              </Link>
              <span className="text-zinc-400">/</span>
              <Link
                href="/admin/settings#branding"
                className="rounded-full px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Branding
              </Link>
              <span className="text-zinc-400">/</span>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-100">
                Icon Library
              </span>
            </nav>
            <Link
              href="/admin/settings#branding"
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Back to Branding
            </Link>
          </div>
          <header className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Icon Library
              </h1>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Icons used in proposal templates (Objective Template C, etc.).
              </p>
            </div>
          </header>
        </>
      )}

      <section className="space-y-4">
        {panelMode && showAiView && (
          <button
            type="button"
            onClick={() => setPanelView("library")}
            className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to library
          </button>
        )}
        {!panelMode && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setIsAiOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              <span className="text-[10px]">
                {isAiOpen ? "▾" : "▸"}
              </span>
              <span>Generate with AI</span>
            </button>
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
          </div>
        )}

        {showAiView && (
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                AI Icon Generator
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Use Gemini to suggest icon ideas based on your company and generate PNG icons you can review and save.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Company description
                </label>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Optional
                </span>
              </div>
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={3}
                className="w-full max-h-[90px] resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                placeholder="e.g. Design-build firm focused on whole-home remodels, additions, and exterior upgrades."
              />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSuggestIcons();
                  }}
                  disabled={aiSuggesting === "saving" || pending}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {aiSuggesting === "saving" ? "Suggesting…" : "Suggest Icons"}
                </button>
                <label className="inline-flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                    checked={autoSaveReady}
                    onChange={(e) => setAutoSaveReady(e.target.checked)}
                  />
                  <span>Auto-save ready icons</span>
                </label>
                {suggestionsWithPng.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSuggestions}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Clear Suggestions
                  </button>
                )}
              </div>
              {aiSuggestionsError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {aiSuggestionsError}
                </p>
              )}
              {bulkSaveProgress && (
                <div className="mt-1 space-y-1 text-[11px]">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">
                    {bulkSaveProgress.success} saved, {bulkSaveProgress.failed} failed
                  </p>
                  {bulkSaveErrors.length > 0 && (
                    <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-400">
                      {bulkSaveErrors.map((err) => (
                        <li key={err.slug}>
                          <span className="font-medium">{err.slug}</span>: {err.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {suggestionsWithPng.length > 0 && (
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Suggestions ({suggestionsWithPng.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    {suggestionsWithPng.some(
                      (s) =>
                        s.pngStatus === "ready" &&
                        !!s.imageUrl &&
                        !!s.imageKey &&
                        !s.saved
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleBulkSaveReady();
                        }}
                        disabled={bulkSaveStatus === "saving" || pending}
                        className="inline-flex h-7 items-center justify-center rounded-full bg-zinc-900 px-3 text-[11px] font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {bulkSaveStatus === "saving" && bulkSaveProgress
                          ? `Saving ${bulkSaveProgress.success + bulkSaveProgress.failed}/${
                              bulkSaveProgress.total
                            }…`
                          : "Save all ready"}
                      </button>
                    )}
                    {suggestionsWithPng.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSuggestions}
                        className="inline-flex h-7 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                {suggestionsWithPng.length > 0 && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {generatingCount > 0 && (
                      <span>Generating {generatingCount}…</span>
                    )}
                    <span className={generatingCount > 0 ? "ml-3" : ""}>
                      Ready:{" "}
                      {suggestionsWithPng.filter((s) => s.pngStatus === "ready").length} • Failed:{" "}
                      {suggestionsWithPng.filter((s) => s.pngStatus === "error").length}
                    </span>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {suggestionsWithPng.map((suggestion) => {
                    const key = getSuggestionKey(suggestion) || suggestion.slug;
                    return (
                      <article
                        key={key}
                        className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-900/60"
                      >
                        <div
                        className="mb-1.5 flex items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                        style={{ width: PREVIEW_BOX_SIZE, height: PREVIEW_BOX_SIZE }}
                      >
                        {suggestion.pngStatus === "generating" && (
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500 dark:border-zinc-600 dark:border-t-zinc-300" />
                        )}
                        {suggestion.pngStatus === "ready" && suggestion.imageUrl && (
                          <img
                            src={suggestion.imageUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        )}
                        {suggestion.pngStatus === "error" && (
                          <span className="text-[11px] text-red-600 dark:text-red-400">
                            Failed to generate
                          </span>
                        )}
                        {suggestion.pngStatus === "idle" && (
                          <div className="h-10 w-10 rounded-md bg-zinc-100 dark:bg-zinc-800" />
                        )}
                      </div>
                      <div className="mb-0.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {suggestion.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {suggestion.slug}
                          </p>
                        </div>
                      </div>
                      {suggestion.tags && suggestion.tags.length > 0 && (
                        <div className="mb-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          {suggestion.tags.join(", ")}
                        </div>
                      )}
                      {suggestion.description && (
                        <p className="mt-1 line-clamp-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {suggestion.description}
                        </p>
                      )}
                      {suggestion.visual && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 italic dark:text-zinc-500">
                          {suggestion.visual}
                        </p>
                      )}
                      {autoSaveReady &&
                        suggestion.pngStatus === "ready" &&
                        !suggestion.saved && (
                          <button
                            type="button"
                            onClick={() => {
                              const suggestionKey = getSuggestionKey(suggestion);
                              setSuggestionsWithPng((prev) =>
                                prev.map((s) => {
                                  const key = getSuggestionKey(s);
                                  return key === suggestionKey
                                    ? { ...s, skipAutoSave: true }
                                    : s;
                                })
                              );
                              handleOpenCreateFromSuggestion(suggestion);
                            }}
                            className="mt-1 self-start text-[11px] font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                          >
                            Edit before saving
                          </button>
                      )}
                      <div className="mt-2 flex flex-col gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                        {suggestion.pngStatus === "error" && suggestion.pngError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {suggestion.pngError}
                          </p>
                        )}
                        {suggestion.saveStatus === "error" && suggestion.saveError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {suggestion.saveError}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          {suggestion.pngStatus === "ready" &&
                            suggestion.imageUrl &&
                            suggestion.imageKey &&
                            !autoSaveReady && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreateFromSuggestion(suggestion)}
                                disabled={pending}
                                className="inline-flex h-7 items-center justify-center rounded-md bg-zinc-900 px-2.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                              >
                                Use
                              </button>
                            )}
                          {suggestion.pngStatus === "ready" &&
                            suggestion.imageUrl &&
                            suggestion.imageKey &&
                            autoSaveReady && (
                              <span
                                className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium ${
                                  suggestion.saved
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                }`}
                              >
                                {suggestion.saved
                                  ? "Saved"
                                  : suggestion.saveStatus === "saving"
                                    ? "Saving…"
                                    : "Will auto-save"}
                              </span>
                            )}
                          {suggestion.pngStatus === "error" && (
                            <button
                              type="button"
                              onClick={() => {
                                const suggestionKey = getSuggestionKey(suggestion);
                                setSuggestionsWithPng((prev) =>
                                  prev.map((s) => {
                                    const key = getSuggestionKey(s);
                                    return key === suggestionKey
                                      ? {
                                          ...s,
                                          imageUrl: undefined,
                                          imageKey: undefined,
                                          pngStatus: "idle",
                                          pngError: undefined,
                                          saveStatus: "idle",
                                          saveError: undefined,
                                          saved: false,
                                        }
                                      : s;
                                  })
                                );
                              }}
                              disabled={pending}
                              className="text-[11px] font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {(!panelMode || !showAiView) && (
        <>
        {!panelMode && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {totalIcons} icon{totalIcons === 1 ? "" : "s"}
          </h2>
          <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end sm:justify-end sm:gap-0">
            <div className="flex w-full flex-col gap-1 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex w-full items-center gap-2 sm:justify-end">
                <input
                  type="search"
                  placeholder="Search by name, slug, or tag"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    setModalMode("create");
                    setCreateError(null);
                  }}
                  className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Add Icon
                </button>
              </div>
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
            </div>
            {noMatches && (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                No matches for{" "}
                <span className="font-medium">&quot;{search}&quot;</span>. Try a
                different search or clear the search.
              </p>
            )}
          </div>
        </div>
        )}
        {panelMode && !showAiView && noMatches && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No matches for &quot;{search}&quot;.
          </p>
        )}
        {panelMode && !showAiView && hasIcons && (
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {filteredIcons.length} icon{filteredIcons.length === 1 ? "" : "s"}
          </p>
        )}
        {!hasIcons ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            <div className="flex flex-col items-center justify-center text-center">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No icons yet
              </h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Add your first icon to start using Objective Template C.
              </p>
              <button
                type="button"
                onClick={() => {
                  setModalMode("create");
                  setCreateError(null);
                }}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Add Icon Manually
              </button>
              {!panelMode && !isAiOpen && (
                <button
                  type="button"
                  onClick={() => setIsAiOpen(true)}
                  className="mt-3 text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Or generate icons with AI
                </button>
              )}
              {panelMode && (
                <button
                  type="button"
                  onClick={() => { setPanelView("ai"); setIsAiOpen(true); }}
                  className="mt-3 text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Or generate icons with AI
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 ${panelMode ? "gap-3 sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}`}>
            {filteredIcons.map((icon) => {
              const form = editForms[icon.id];
              const status = statusById[icon.id] ?? "idle";
              const error = editErrorById[icon.id] ?? null;
              const tags = icon.tags ?? [];
              const isKebabOpen = kebabOpenId === icon.id;

              return (
                <article
                  key={icon.id}
                  className={`flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${panelMode ? "relative p-3" : "p-4"}`}
                >
                  {/* Top overlay: kebab (left) + Active pill (right) */}
                  <div className="flex items-center justify-between gap-2">
                    {panelMode ? (
                      <button
                        type="button"
                        onClick={() => setKebabOpenId(isKebabOpen ? null : icon.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        aria-label="Actions"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    ) : (
                      <span aria-hidden className="shrink-0" />
                    )}
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        icon.isActive
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {icon.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                  {panelMode && isKebabOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        aria-hidden
                        onClick={() => setKebabOpenId(null)}
                      />
                      <div className="absolute left-3 top-8 z-20 min-w-[120px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        <button
                          type="button"
                          onClick={() => {
                            ensureEditForm(icon.id);
                            setEditingId(icon.id);
                            setModalMode("edit");
                            setKebabOpenId(null);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleToggleActive(icon.id, icon.isActive); setKebabOpenId(null); }}
                          disabled={status === "saving" || pending}
                          className="block w-full px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {icon.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleDelete(icon.id); setKebabOpenId(null); }}
                          disabled={status === "saving" || pending}
                          className="block w-full px-3 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}

                  {/* Main: centered icon preview (dominant) */}
                  <div
                    className="flex flex-1 items-center justify-center py-3"
                    style={{ minHeight: CARD_ICON_SIZE + 24 }}
                  >
                    <div
                      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50"
                      style={{ width: CARD_ICON_SIZE, height: CARD_ICON_SIZE }}
                    >
                      <img
                        src={icon.imageUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Bottom: name (bold, tooltip), optional slug, optional +N tags — no tag pills */}
                  <div className="min-w-0 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <p
                      className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100"
                      title={icon.name}
                    >
                      {icon.name}
                    </p>
                    <p
                      className="truncate text-xs text-zinc-500 dark:text-zinc-400"
                      title={icon.slug}
                    >
                      {icon.slug}
                    </p>
                    {tags.length > 0 && (
                      <p
                        className="mt-0.5 truncate text-[10px] text-zinc-400 dark:text-zinc-500"
                        title={tags.join(", ")}
                      >
                        +{tags.length} tag{tags.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  {/* Footer actions: full page only (panel uses kebab in top bar) */}
                  {!panelMode && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => {
                          ensureEditForm(icon.id);
                          setEditingId(icon.id);
                          setModalMode("edit");
                        }}
                        className="inline-flex items-center rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(icon.id, icon.isActive)}
                        disabled={status === "saving" || pending}
                        className="inline-flex items-center rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {icon.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(icon.id)}
                        disabled={status === "saving" || pending}
                        className="inline-flex items-center rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        </>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6 sm:px-6">
          <div
            className="absolute inset-0 bg-zinc-950/60"
            onClick={closeModal}
          />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {modalMode === "edit" ? "Edit Icon" : "Add Icon"}
                </h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Slug should be lowercase kebab-case (e.g. &quot;check-circle&quot;). Upload a PNG image or use an AI-generated icon.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-8 items-center justify-center rounded-full border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Name
                  </label>
                  <input
                    type="text"
                    value={
                      modalMode === "edit" && editingId && editForms[editingId]
                        ? editForms[editingId].name
                        : createForm.name
                    }
                    onChange={(e) => {
                      if (modalMode === "edit" && editingId && editForms[editingId]) {
                        const value = e.target.value;
                        setEditForms((prev) => ({
                          ...prev,
                          [editingId]: { ...prev[editingId], name: value },
                        }));
                      } else {
                        const value = e.target.value;
                        setCreateForm((prev) => ({ ...prev, name: value }));
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    placeholder="Check mark"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={
                      modalMode === "edit" && editingId && editForms[editingId]
                        ? editForms[editingId].slug
                        : createForm.slug
                    }
                    onChange={(e) => {
                      if (modalMode === "edit" && editingId && editForms[editingId]) {
                        const value = e.target.value;
                        setEditForms((prev) => ({
                          ...prev,
                          [editingId]: { ...prev[editingId], slug: value },
                        }));
                      } else {
                        const value = e.target.value;
                        setCreateForm((prev) => ({ ...prev, slug: value }));
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    placeholder="check-circle"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Category
                  </label>
                  <input
                    type="text"
                    value={
                      modalMode === "edit" && editingId && editForms[editingId]
                        ? editForms[editingId].category
                        : createForm.category
                    }
                    onChange={(e) => {
                      if (modalMode === "edit" && editingId && editForms[editingId]) {
                        const value = e.target.value;
                        setEditForms((prev) => ({
                          ...prev,
                          [editingId]: { ...prev[editingId], category: value },
                        }));
                      } else {
                        const value = e.target.value;
                        setCreateForm((prev) => ({ ...prev, category: value }));
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    placeholder="Objective"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={
                      modalMode === "edit" && editingId && editForms[editingId]
                        ? editForms[editingId].tagsCsv
                        : createForm.tagsCsv
                    }
                    onChange={(e) => {
                      if (modalMode === "edit" && editingId && editForms[editingId]) {
                        const value = e.target.value;
                        setEditForms((prev) => ({
                          ...prev,
                          [editingId]: { ...prev[editingId], tagsCsv: value },
                        }));
                      } else {
                        const value = e.target.value;
                        setCreateForm((prev) => ({ ...prev, tagsCsv: value }));
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-600"
                    placeholder="check, success, objective"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Icon image (PNG with transparent background)
                  </label>
                  {modalMode === "create" && (
                    <input
                      type="file"
                      accept="image/png"
                      className="w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
                      disabled={createUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleCreateUpload(file);
                        e.target.value = "";
                      }}
                    />
                  )}
                  {(modalMode === "edit" && editingId && editForms[editingId]?.imageUrl) ||
                  (modalMode === "create" && createForm.imageUrl) ? (
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Image set. Edit other fields and save.
                    </p>
                  ) : modalMode === "create" ? (
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Upload a PNG with a transparent background, or use &quot;Use&quot; from an AI suggestion.
                    </p>
                  ) : null}
                </div>
                <div
                  className="mt-2 flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                  style={{
                    width: PREVIEW_BOX_SIZE,
                    height: PREVIEW_BOX_SIZE,
                  }}
                >
                  {(modalMode === "edit" &&
                    editingId &&
                    editForms[editingId]?.imageUrl) ||
                  (modalMode === "create" && createForm.imageUrl) ? (
                    <img
                      src={
                        modalMode === "edit" && editingId && editForms[editingId]
                          ? editForms[editingId].imageUrl
                          : createForm.imageUrl
                      }
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs">Preview</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (modalMode === "edit" && editingId) {
                      void handleUpdate(editingId);
                    } else if (modalMode === "create") {
                      void handleCreate();
                    }
                  }}
                  disabled={
                    modalMode === "edit"
                      ? !!(editingId && statusById[editingId] === "saving") || pending
                      : createStatus === "saving" || pending || !createForm.imageUrl || !createForm.imageKey
                  }
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {modalMode === "edit"
                    ? statusById[editingId ?? ""] === "saving"
                      ? "Saving…"
                      : "Save"
                    : createStatus === "saving"
                      ? "Saving…"
                      : "Save Icon"}
                </button>
              </div>
              <div className="flex min-h-[1.25rem] items-center text-xs">
                {modalMode === "edit" && editingId && editErrorById[editingId] && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {editErrorById[editingId]}
                  </span>
                )}
                {modalMode === "create" && createError && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {createError}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


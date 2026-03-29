"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type {
  ProposalSlide,
  DeckBranding,
  SlideType,
  WhyUsPillarItem,
  RoomWithMedia,
  BeforeAfterContent,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  TextZoneSetting,
} from "@/app/lib/deck/types";
import { saveDeckSlidesAction, refreshDeckAction } from "./actions";
import { SlideRail } from "./SlideRail";
import { SlideCanvas } from "./SlideCanvas";
import { InspectorPanel } from "./InspectorPanel";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { analyzeBackgroundTextZoneAction } from "@/app/admin/settings/branding/backgrounds/actions";

interface Props {
  /** Slides loaded from the database (post auto-sync). */
  initialSlides: ProposalSlide[];
  branding: DeckBranding;
  projectId: string;
  projectTitle: string;
  /** Value pillars resolved from DB at SSR time. Used when "+ Why Us" is added. */
  valuePillars: WhyUsPillarItem[];
  /** Rooms with resolved before/render media — powers the BeforeAfterInspector. */
  projectRoomsWithMedia: RoomWithMedia[];
  /** Brand backgrounds for the per-slide background picker. */
  brandBackgrounds?: BrandBackgroundForUI[];
}

function generateId() {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const ADD_SLIDE_OPTIONS: { type: SlideType; label: string }[] = [
  { type: "cover",            label: "+ Cover"           },
  { type: "objective",        label: "+ Objective"       },
  { type: "investment",       label: "+ Investment"      },
  { type: "why-us",           label: "+ Why Us"          },
  { type: "scope-overview",   label: "+ Scope Overview"  },
  { type: "before-after",     label: "+ Before / After"  },
  { type: "scope-breakdown",  label: "+ Scope Breakdown" },
  { type: "risk-brief",      label: "+ Risk Brief"      },
  { type: "process",         label: "+ Our Process"     },
];

// ─── Add-slide dropdown ───────────────────────────────────────────────────────

function AddSlideMenu({
  onAdd,
  accentColor,
}: {
  onAdd: (type: SlideType) => void;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded"
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 10px",
          background: open ? accentColor + "22" : "#2D3F50",
          color: open ? "#E2E8F0" : "#94A3B8",
          border: `1px solid ${open ? accentColor : "#334155"}`,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        + Add Slide ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#1E2D3A",
            border: "1px solid #334155",
            borderRadius: 6,
            overflow: "hidden",
            zIndex: 200,
            minWidth: 168,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {ADD_SLIDE_OPTIONS.map((opt, i) => (
            <button
              key={opt.type}
              onClick={() => {
                onAdd(opt.type);
                setOpen(false);
              }}
              className="w-full text-left"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 14px",
                background: "transparent",
                color: "#CBD5E1",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid #253040",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#2D3F50";
                (e.currentTarget as HTMLButtonElement).style.color = "#E2E8F0";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1";
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auto Before/After dropdown ──────────────────────────────────────────────

function AutoBeforeAfterMenu({
  onAutoGen,
  onRefresh,
  onAutoGenScope,
  accentColor,
}: {
  onAutoGen: () => void;
  onRefresh: () => void;
  onAutoGenScope: () => void;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded"
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 10px",
          background: open ? accentColor + "22" : "#2D3F50",
          color: open ? "#E2E8F0" : "#94A3B8",
          border: `1px solid ${open ? accentColor : "#334155"}`,
          cursor: "pointer",
          userSelect: "none",
        }}
        title="Auto-generate Before/After slides from project rooms"
      >
        ⚡ Before/After ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#1E2D3A",
            border: "1px solid #334155",
            borderRadius: 6,
            overflow: "hidden",
            zIndex: 200,
            minWidth: 220,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {[
            {
              label: "Auto Build Before/After",
              sublabel: "One slide per room with before + render",
              action: onAutoGen,
            },
            {
              label: "Refresh Before/After",
              sublabel: "Update renders + captions from rooms",
              action: onRefresh,
            },
            {
              label: "Auto Build Scope Breakdown",
              sublabel: "Rooms without a selected render",
              action: onAutoGenScope,
            },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false); }}
              className="w-full text-left"
              style={{
                display: "block",
                width: "100%",
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid #253040",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "#2D3F50";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#CBD5E1" }}>
                {item.label}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "#64748B", marginTop: 2 }}>
                {item.sublabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeckEditorClient({
  initialSlides,
  branding,
  projectId,
  projectTitle,
  valuePillars,
  projectRoomsWithMedia,
  brandBackgrounds = [],
}: Props) {
  const [slides, setSlides] = useState<ProposalSlide[]>(
    [...initialSlides].sort((a, b) => a.order - b.order)
  );
  const [activeSlideId, setActiveSlideId] = useState<string>(
    initialSlides[0]?.id ?? ""
  );

  // ── Persist state ──────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save: debounced 2 s after any slide state change.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      const result = await saveDeckSlidesAction(projectId, slides);
      setSaveStatus(result.ok ? "saved" : "error");
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);

  const activeSlide = slides.find((s) => s.id === activeSlideId) ?? null;

  // ── Slide operations ──────────────────────────────────────────────────────

  const updateSlide = useCallback((updated: ProposalSlide) => {
    setSlides((prev) =>
      prev.map((s) => {
        if (s.id !== updated.id) return s;
        // If the user edits an auto-generated slide, flag it so the sync
        // engine won't overwrite their changes on the next refresh.
        if (s.source === "auto" && !s.isUserModified) {
          return { ...updated, isUserModified: true };
        }
        return updated;
      })
    );
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isEnabled: !s.isEnabled } : s))
    );
  }, []);

  const reorderSlides = useCallback((updated: ProposalSlide[]) => {
    setSlides(updated);
  }, []);

  // ── Background + Text Zone operations ────────────────────────────────────

  const handleBackgroundChange = useCallback(async (backgroundId: string | null) => {
    if (!activeSlideId) return;
    setSlides((prev) =>
      prev.map((s) => s.id === activeSlideId ? { ...s, backgroundId: backgroundId ?? undefined } : s)
    );
    // Auto-analyze the new background and seed textZone if we get a suggestion
    if (backgroundId) {
      const result = await analyzeBackgroundTextZoneAction(backgroundId);
      if (result.ok) {
        const sug = result.zone;
        setSlides((prev) =>
          prev.map((s) => {
            if (s.id !== activeSlideId) return s;
            // Only auto-apply if textZone is not already set or was AI-suggested (not manual override)
            if (s.textZone?.isManualOverride) return s;
            const zone: TextZoneSetting = {
              x: sug.x, y: sug.y, width: sug.width, height: sug.height,
              padding: sug.padding, textAlign: sug.textAlign,
              textColor: sug.recommendedTextColor,
              isManualOverride: false,
            };
            return { ...s, textZone: zone };
          })
        );
      }
    } else {
      // Clear text zone when background is removed
      setSlides((prev) =>
        prev.map((s) => s.id === activeSlideId ? { ...s, textZone: null } : s)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlideId]);

  const handleTextZoneChange = useCallback((zone: TextZoneSetting | null) => {
    if (!activeSlideId) return;
    setSlides((prev) =>
      prev.map((s) => s.id === activeSlideId ? { ...s, textZone: zone } : s)
    );
  }, [activeSlideId]);

  const duplicateSlide = useCallback((id: string) => {
    setSlides((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const copy: ProposalSlide = {
        ...original,
        id: generateId(),
        order: idx + 1,
        // Copies are never locked — only the original cover/closing retain lock status
        isLocked: false,
        lockPosition: undefined,
      };
      const updated = [
        ...prev.slice(0, idx + 1),
        copy,
        ...prev.slice(idx + 1),
      ].map((s, i) => ({ ...s, order: i }));
      setActiveSlideId(copy.id);
      return updated;
    });
  }, []);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => {
      // Locked slides cannot be removed
      const target = prev.find((s) => s.id === id);
      if (target?.isLocked) return prev;
      const filtered = prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
      if (activeSlideId === id) {
        setActiveSlideId(filtered[0]?.id ?? "");
      }
      return filtered;
    });
  }, [activeSlideId]);

  const addSlide = useCallback((type: SlideType) => {
    const layoutKey =
      type === "cover"            ? "hero-image"     :
      type === "objective"        ? "statement-left" :
      type === "investment"       ? "table-callout"  :
      type === "why-us"           ? "pillars-grid"   :
      type === "scope-overview"   ? "split-panel"    :
      type === "scope-breakdown"  ? "text-grid"      :
      type === "risk-brief"       ? "two-column"        :
      type === "process"          ? "three-stages"      :
      /* before-after */            "side-by-side";

    const headline =
      type === "cover"            ? "New Cover"                  :
      type === "objective"        ? "Project Objective"          :
      type === "investment"       ? "Projected Investment"       :
      type === "why-us"           ? "The HHI Difference"         :
      type === "scope-overview"   ? "Project Scope"              :
      type === "scope-breakdown"  ? "Additional Areas Included"  :
      type === "risk-brief"       ? "The Stress-Free Remodel: How We Eliminate Common Risks" :
      type === "process"          ? "Our Process: From Vision to Finished Home" :
      /* before-after */            "Before & After";

    // Seed content per type
    const content =
      type === "why-us"
        ? {
            sectionTitle: null,
            pillars: valuePillars,
            selectedPillarIds: valuePillars.map((p) => p.id),
          }
        : type === "scope-overview"
        ? { description: null, selectedPhotos: [] }
        : type === "before-after"
        ? { roomId: null, roomName: null, beforeMediaId: null, afterMediaId: null, beforeImageUrl: null, afterImageUrl: null, caption: null }
        : type === "scope-breakdown"
        ? {
            title: null,
            introText:
              "These spaces are included in the project and will be completed to the same level of quality and detail.",
            rooms: [],
            photos: [],
          } satisfies ScopeBreakdownContent
        : type === "risk-brief"
        ? {
            leftHeader: "Why Remodels Go Wrong",
            leftBullets: [
              "Too many separate contractors means no single person is accountable.",
              "Designs get approved before anyone confirms they fit the budget.",
              "Hidden problems get discovered mid-construction, stalling everything.",
            ],
            rightHeader: "How We Prevent That",
            rightBullets: [
              "One team handles design and construction from start to finish.",
              "Your budget is set before a single detail is finalized.",
              "We identify and resolve potential issues before work ever begins.",
            ],
            bottomStatement:
              "You'll know exactly what's being built, what it costs, and what to expect — before construction starts.",
          }
        : type === "process"
        ? {
            stages: [
              {
                name: "Discovery & Design",
                bullets: [
                  "We learn your goals, priorities, and how you use your space.",
                  "Scope and early budget direction are established upfront.",
                  "Potential issues are identified before they become surprises.",
                ],
              },
              {
                name: "Plan & Select",
                bullets: [
                  "Layouts, materials, and finishes are finalized to match your vision.",
                  "Every selection is reviewed against your target investment.",
                  "A complete, build-ready plan is approved before construction begins.",
                ],
              },
              {
                name: "Build & Deliver",
                bullets: [
                  "A dedicated project team executes the work from start to finish.",
                  "You receive regular updates so you always know what's happening.",
                  "Your home is returned clean, complete, and ready to enjoy.",
                ],
              },
            ],
            bottomStatement:
              "Every detail is planned before we break ground—so the build stays on schedule, on budget, and free of surprises.",
          }
        : undefined;

    const newSlide: ProposalSlide = {
      id: generateId(),
      type,
      layoutKey,
      order: slides.length,
      isEnabled: true,
      headline,
      ...(content !== undefined ? { content } : {}),
    };

    setSlides((prev) => [...prev, newSlide]);
    setActiveSlideId(newSlide.id);
  }, [slides.length, valuePillars]);

  // ── Auto-generate Before/After slides ────────────────────────────────────
  // Creates one slide per room that has at least 1 before photo + 1 completed
  // render.  Skips rooms already represented in the deck.  Inserts after the
  // last existing before-after slide, or after scope-overview, or after
  // objective — never before cover.

  const autoGenBeforeAfterSlides = useCallback(() => {
    // Only rooms with at least 1 before photo AND at least 1 completed render
    const eligible = projectRoomsWithMedia.filter(
      (r) => r.beforeMedia.length > 0 && r.renderMedia.length > 0
    );
    if (eligible.length === 0) return;

    // Rooms already covered in the current deck
    const coveredRoomIds = new Set<string>(
      slides
        .filter((s) => s.type === "before-after")
        .map((s) => (s.content as BeforeAfterContent)?.roomId)
        .filter((id): id is string => Boolean(id))
    );

    // Build the new slides
    const newSlides: ProposalSlide[] = eligible
      .filter((room) => !coveredRoomIds.has(room.id))
      .map((room) => {
        const beforeMedia = room.beforeMedia[0];
        // Prefer the user-selected render; fall back to first DONE render
        const selectedRender =
          room.renderMedia.find((m) => m.id === room.selectedRenderMediaId) ??
          room.renderMedia[0];

        // Caption: full scope-of-work text from the room's Sections tab
        const caption = (room.scopeNarrative ?? "").trim() || null;

        const content: BeforeAfterContent = {
          roomId: room.id,
          roomName: room.name,
          beforeMediaId: beforeMedia.id,
          afterMediaId: selectedRender.id,
          beforeImageUrl: beforeMedia.url,
          afterImageUrl: selectedRender.url,
          caption,
        };

        return {
          id: generateId(),
          type: "before-after" as const,
          layoutKey: "side-by-side" as const,
          order: 0,
          isEnabled: true,
          headline: room.name,
          content,
        };
      });

    if (newSlides.length === 0) return; // all rooms already have slides

    // Insertion point: after last before-after → scope-overview → objective → cover
    setSlides((prev) => {
      const insertAfter = (() => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === "before-after") return i;
        }
        const idx = prev.findIndex((s) => s.type === "scope-overview");
        if (idx >= 0) return idx;
        const oIdx = prev.findIndex((s) => s.type === "objective");
        if (oIdx >= 0) return oIdx;
        const cIdx = prev.findIndex((s) => s.type === "cover");
        return cIdx >= 0 ? cIdx : prev.length - 1;
      })();

      return [
        ...prev.slice(0, insertAfter + 1),
        ...newSlides,
        ...prev.slice(insertAfter + 1),
      ].map((s, i) => ({ ...s, order: i }));
    });

    // Navigate to the first newly generated slide
    setActiveSlideId(newSlides[0].id);
  }, [slides, projectRoomsWithMedia]);

  // ── Refresh deck from server ───────────────────────────────────────────────
  // Saves current state, re-runs the full server-side sync, and replaces
  // local slides with the freshly synced result.

  const handleServerRefresh = useCallback(async () => {
    setSaveStatus("saving");
    const result = await refreshDeckAction(projectId, slides);
    if (result.slides && result.slides.length > 0) {
      setSlides(result.slides.sort((a, b) => a.order - b.order));
      const first = result.slides.sort((a, b) => a.order - b.order)[0];
      if (first) setActiveSlideId((prev) => (result.slides!.find(s => s.id === prev) ? prev : first.id));
      setSaveStatus("saved");
    } else {
      setSaveStatus(result.error ? "error" : "saved");
    }
  }, [projectId, slides]);

  // ── Auto-generate Scope Breakdown slide ───────────────────────────────────
  // Builds ONE scope-breakdown slide covering every room that does NOT have a
  // proposal-selected render.  Only one such slide is allowed per deck.

  const autoGenScopeBreakdown = useCallback(() => {
    // Only one scope-breakdown per deck
    if (slides.some((s) => s.type === "scope-breakdown")) return;

    // Rooms without a selected render — these need written scope coverage
    const unrendered = projectRoomsWithMedia.filter(
      (r) => !r.selectedRenderMediaId
    );
    if (unrendered.length === 0) return;

    // Build room entries: full scope-of-work text from the Sections tab
    const scopeRooms: ScopeBreakdownRoom[] = unrendered.map((room) => ({
      id: room.id,
      name: room.name,
      description: (room.scopeNarrative ?? "").trim(),
      isIncluded: true,
    }));

    const content: ScopeBreakdownContent = {
      title: null,
      introText:
        "These spaces are included in the project and will be completed to the same level of quality and detail.",
      rooms: scopeRooms,
      photos: [],
    };

    const newSlide: ProposalSlide = {
      id: generateId(),
      type: "scope-breakdown" as const,
      layoutKey: "text-grid" as const,
      order: 0,
      isEnabled: true,
      headline: "Additional Areas Included",
      content,
    };

    setSlides((prev) => {
      // Insert: after last before-after → before first investment → end
      const insertAfter = (() => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].type === "before-after") return i;
        }
        const investIdx = prev.findIndex((s) => s.type === "investment");
        if (investIdx > 0) return investIdx - 1;
        return prev.length - 1;
      })();

      return [
        ...prev.slice(0, insertAfter + 1),
        newSlide,
        ...prev.slice(insertAfter + 1),
      ].map((s, i) => ({ ...s, order: i }));
    });

    setActiveSlideId(newSlide.id);
  }, [slides, projectRoomsWithMedia]);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const sorted = [...slides].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((s) => s.id === activeSlideId);
      if (e.key === "ArrowLeft" && idx > 0) {
        setActiveSlideId(sorted[idx - 1].id);
      } else if (e.key === "ArrowRight" && idx < sorted.length - 1) {
        setActiveSlideId(sorted[idx + 1].id);
      }
    },
    [slides, activeSlideId]
  );

  return (
    <div
      className="flex flex-col"
      style={{ height: "100vh", background: "#F4F3F0" }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between flex-shrink-0"
        style={{
          height: 48,
          background: "#1E2D3A",
          padding: "0 16px",
          borderBottom: "1px solid #0F1A24",
        }}
      >
        {/* Left — back + title */}
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/projects/${projectId}`}
            className="flex items-center gap-1.5 rounded"
            style={{
              fontSize: 12,
              color: "#94A3B8",
              padding: "3px 6px",
              textDecoration: "none",
            }}
          >
            ← Projects
          </Link>
          <span style={{ color: "#334155", fontSize: 12 }}>|</span>
          <span style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>
            Deck Editor
          </span>
          {projectTitle && (
            <>
              <span style={{ color: "#334155", fontSize: 12 }}>·</span>
              <span style={{ fontSize: 12, color: "#64748B", maxWidth: 240 }} className="truncate">
                {projectTitle}
              </span>
            </>
          )}
        </div>

        {/* Center — slide counter */}
        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSlideId(s.id)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: s.id === activeSlideId ? branding.accentColor : "#334155",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              title={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Right — add slide dropdown + auto B/A + save placeholder */}
        <div className="flex items-center gap-2">
          <AddSlideMenu onAdd={(type) => addSlide(type)} accentColor={branding.accentColor} />
          <AutoBeforeAfterMenu
            onAutoGen={autoGenBeforeAfterSlides}
            onRefresh={handleServerRefresh}
            onAutoGenScope={autoGenScopeBreakdown}
            accentColor={branding.accentColor}
          />
          <button
            onClick={async () => {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              setSaveStatus("saving");
              const result = await saveDeckSlidesAction(projectId, slides);
              setSaveStatus(result.ok ? "saved" : "error");
            }}
            disabled={saveStatus === "saving"}
            className="rounded font-semibold"
            style={{
              fontSize: 11,
              padding: "4px 12px",
              background: saveStatus === "error" ? "#EF4444" : branding.accentColor,
              color: "#fff",
              border: "none",
              cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
              opacity: saveStatus === "saving" ? 0.7 : 1,
              minWidth: 60,
              transition: "background 0.2s",
            }}
          >
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "saved"
              ? "Saved ✓"
              : saveStatus === "error"
              ? "Error"
              : "Save"}
          </button>
        </div>
      </header>

      {/* ── Three-column editor layout ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — slide rail */}
        <SlideRail
          slides={slides}
          activeSlideId={activeSlideId}
          branding={branding}
          onSelect={setActiveSlideId}
          onReorder={reorderSlides}
          onToggleEnabled={toggleEnabled}
          brandBackgrounds={brandBackgrounds}
        />

        {/* Center — canvas */}
        <SlideCanvas slide={activeSlide} branding={branding} brandBackgrounds={brandBackgrounds} />

        {/* Right — inspector */}
        <InspectorPanel
          slide={activeSlide}
          branding={branding}
          onUpdate={updateSlide}
          onDuplicate={duplicateSlide}
          onRemove={removeSlide}
          onToggleEnabled={toggleEnabled}
          projectRoomsWithMedia={projectRoomsWithMedia}
          brandBackgrounds={brandBackgrounds}
          onBackgroundChange={handleBackgroundChange}
          onTextZoneChange={handleTextZoneChange}
        />
      </div>
    </div>
  );
}

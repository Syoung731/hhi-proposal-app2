"use client";

import { useState, useCallback, useRef, useEffect, useMemo, useReducer } from "react";
import type {
  ProposalSlide,
  DeckBranding,
  SlideType,
  WhyUsPillarItem,
  RoomWithMedia,
  RoomMediaItem,
  BeforeAfterContent,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  TextZoneSetting,
} from "@/app/lib/deck/types";
import { saveDeckSlidesAction, refreshDeckAction, generateDefaultDeckAction, deleteProjectDeckAction, updateDeckThemeAction } from "./actions";
import { DECK_THEMES, type DeckThemeKey } from "@/app/lib/deck/themes";
import { HHI_DEFAULT_CRAFTSMANSHIP_ITEMS } from "@/app/lib/craftsmanship-defaults";
import { composeDeckCopyAction, generateDeckVisualsAction } from "../studio/actions";
import { DEFAULT_SPEC_SLIDE_TYPES } from "@/app/lib/deck/default-spec";
import { SlideRail } from "./SlideRail";
import { SlideCanvas } from "./SlideCanvas";
import { InspectorPanel } from "./InspectorPanel";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import type { GlobalDesignBuildSettings } from "@/app/lib/design-build-defaults";
import { analyzeBackgroundTextZoneAction } from "@/app/admin/settings/branding/backgrounds/actions";
import { ProjectTabNav } from "../ProjectTabNav";

interface Props {
  /** Slides loaded from the database (post auto-sync). */
  initialSlides: ProposalSlide[];
  branding: DeckBranding;
  /** Deck-level visual theme, loaded from ProposalDeck.deckTheme. */
  initialDeckTheme?: DeckThemeKey;
  projectId: string;
  projectTitle: string;
  /** Value pillars resolved from DB at SSR time. Used when "+ Why Us" is added. */
  valuePillars: WhyUsPillarItem[];
  /** Design-Build defaults from global settings. Used when "+ Design-Build" is added. */
  designBuildDefaults: GlobalDesignBuildSettings;
  /** Rooms with resolved before/render media — powers the BeforeAfterInspector. */
  projectRoomsWithMedia: RoomWithMedia[];
  /** Project-level media (Front Page photos — roomId null). */
  projectLevelMedia?: RoomMediaItem[];
  /** Brand backgrounds for the per-slide background picker. */
  brandBackgrounds?: BrandBackgroundForUI[];
  /** Whether Rendr integration is configured — controls tab nav visibility. */
  rendrConfigured?: boolean;
  /**
   * Precondition status for the "Generate Default Deck" button. When `ok`
   * is false, the button is disabled and `missing` populates the tooltip.
   */
  canGenerateDefaultDeck?: { ok: boolean; missing: string[] };
}

function generateId() {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type AddSlideGroup = {
  heading: string;
  options: { type: SlideType; label: string }[];
};

// Grouped per Phase 8A T7 — "Default" set matches buildDefaultDeckSpec
// composition; "Optional" set is everything else that's reclassified out of
// the default deck but still reachable via + Add Slide.
const ADD_SLIDE_GROUPS: AddSlideGroup[] = [
  {
    heading: "Default",
    options: [
      { type: "cover",              label: "+ Cover" },
      { type: "objective",          label: "+ Objective" },
      { type: "scope-overview",     label: "+ Scope Overview" },
      { type: "scope-breakdown",     label: "+ Scope Breakdown" },
      { type: "before-after",        label: "+ Before / After" },
      { type: "cope",                label: "+ COPE" },
      { type: "why-us",              label: "+ Why Us" },
      { type: "design-experience",   label: "+ Design Experience" },
      { type: "timeline",            label: "+ Timeline" },
      { type: "investment-by-space", label: "+ Investment by Space" },
      { type: "overall-investment",  label: "+ Overall Investment" },
      { type: "next-steps",          label: "+ Next Steps" },
      { type: "addition-overview",   label: "+ Addition Overview" },
      { type: "closing",             label: "+ Closing" },
    ],
  },
  {
    heading: "Optional",
    options: [
      { type: "floor-plan",     label: "+ Floor Plan Map" },
      { type: "craftsmanship",  label: "+ Craftsmanship" },
      { type: "our-process",    label: "+ Our Process" },
      { type: "core-values",    label: "+ Core Values" },
      { type: "design-build",   label: "+ Design-Build" },
      { type: "testimonials",   label: "+ Testimonials" },
    ],
  },
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
            minWidth: 210,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {ADD_SLIDE_GROUPS.map((group, gi) => (
            <div key={group.heading}>
              <div
                style={{
                  padding: "7px 14px 5px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#64748B",
                  background: "#17222D",
                  borderTop: gi === 0 ? "none" : "1px solid #253040",
                }}
              >
                {group.heading}
              </div>
              {group.options.map((opt) => (
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
                    borderTop: "1px solid #253040",
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

// ─── Generate Default Deck button + confirm modal ────────────────────────────

function GenerateDeckButton({
  disabled,
  disabledReason,
  onClick,
  busy,
}: {
  disabled: boolean;
  disabledReason: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && !busy && onClick()}
      className="rounded"
      title={disabled ? disabledReason : "Populate this deck with the default slide set"}
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 10px",
        background: disabled ? "#1E2D3A" : "#2D3F50",
        color: disabled ? "#475569" : "#94A3B8",
        border: `1px solid ${disabled ? "#1E2D3A" : "#334155"}`,
        cursor: disabled ? "not-allowed" : busy ? "wait" : "pointer",
        opacity: busy ? 0.7 : 1,
        userSelect: "none",
      }}
    >
      {busy ? "Generating…" : "Generate Deck"}
    </button>
  );
}

function GenerateDeckModal({
  onClose,
  hasSlides,
  generating,
  alsoDraftCopy,
  setAlsoDraftCopy,
  alsoIllustrate,
  setAlsoIllustrate,
  onGenerate,
  onDeleteAll,
  composeBusy,
  composeMsg,
  onComposeCopy,
  illustrateBusy,
  illustrateMsg,
  onGenerateIllustrations,
  accent,
}: {
  onClose: () => void;
  hasSlides: boolean;
  generating: boolean;
  alsoDraftCopy: boolean;
  setAlsoDraftCopy: (v: boolean) => void;
  alsoIllustrate: boolean;
  setAlsoIllustrate: (v: boolean) => void;
  onGenerate: (mode: "keep-manual" | "replace-all") => void;
  onDeleteAll: () => void;
  composeBusy: boolean;
  composeMsg: string | null;
  onComposeCopy: () => void;
  illustrateBusy: boolean;
  illustrateMsg: string | null;
  onGenerateIllustrations: () => void;
  accent: string;
}) {
  const busy = generating || composeBusy || illustrateBusy;
  const sectionLabel: React.CSSProperties = {
    color: "#94A3B8", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", marginBottom: 8,
  };
  const cardBtn = (bg: string, border: string, color: string): React.CSSProperties => ({
    padding: "10px 14px", background: bg, color, border: `1px solid ${border}`,
    borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", textAlign: "left", fontSize: 13,
    opacity: busy ? 0.6 : 1, width: "100%",
  });
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#1E2D3A", border: "1px solid #334155", borderRadius: 8, padding: 24, width: 480, maxHeight: "86vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
      >
        <h2 style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Generate Deck</h2>

        {/* ── STRUCTURE ── */}
        <div style={sectionLabel}>1 · Slides</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {!hasSlides ? (
            <button onClick={() => onGenerate("replace-all")} disabled={busy} style={cardBtn("#2D3F50", "#475569", "#E2E8F0")}>
              <div style={{ fontWeight: 600 }}>{generating ? "Generating…" : "Generate default slides"}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Builds the standard slide set for this project.</div>
            </button>
          ) : (
            <>
              <button onClick={() => onGenerate("keep-manual")} disabled={busy} style={cardBtn("#2D3F50", "#475569", "#E2E8F0")}>
                <div style={{ fontWeight: 600 }}>Keep manual, regenerate auto</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Preserves your slides and adds any missing defaults.</div>
              </button>
              <button onClick={() => onGenerate("replace-all")} disabled={busy} style={cardBtn("#3A1F1F", "#7F1D1D", "#FECACA")}>
                <div style={{ fontWeight: 600 }}>Replace everything</div>
                <div style={{ fontSize: 11, color: "#FCA5A5", marginTop: 3 }}>Deletes all slides and re-seeds. User edits are lost.</div>
              </button>
              <button onClick={onDeleteAll} disabled={busy} style={cardBtn("#3A1F1F", "#7F1D1D", "#FECACA")}>
                <div style={{ fontWeight: 600 }}>Delete entire deck — start over</div>
                <div style={{ fontSize: 11, color: "#FCA5A5", marginTop: 3 }}>Removes all slides + the deck. Photos &amp; renders kept.</div>
              </button>
            </>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#CBD5E1", marginBottom: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={alsoDraftCopy} onChange={(e) => setAlsoDraftCopy(e.target.checked)} style={{ accentColor: accent }} />
          Also draft slide copy with AI after generating
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#CBD5E1", marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" checked={alsoIllustrate} onChange={(e) => setAlsoIllustrate(e.target.checked)} style={{ accentColor: accent }} />
          Also generate illustrations (full build — slower, ~1&nbsp;min)
        </label>

        {/* ── AI FILL ── */}
        <div style={sectionLabel}>2 · Fill with AI</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onComposeCopy} disabled={busy} style={cardBtn("#2D3F50", "#475569", "#E2E8F0")}>
            <div style={{ fontWeight: 600 }}>{composeBusy ? "Drafting copy…" : "Draft slide copy"}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Writes headlines, scope, objective zones from the project. Fast.</div>
          </button>
          {composeMsg && <span style={{ fontSize: 11, color: composeMsg.toLowerCase().includes("error") ? "#FCA5A5" : "#86EFAC" }}>{composeMsg}</span>}
          <button onClick={onGenerateIllustrations} disabled={busy} style={cardBtn("#2D3F50", "#475569", "#E2E8F0")}>
            <div style={{ fontWeight: 600 }}>{illustrateBusy ? "Generating illustrations…" : "Generate illustrations"}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Draws the Objective hub + zones and Blueprint icons. Slower (~30–60s).</div>
          </button>
          {illustrateMsg && <span style={{ fontSize: 11, color: illustrateMsg.toLowerCase().includes("error") ? "#FCA5A5" : "#86EFAC" }}>{illustrateMsg}</span>}
        </div>

        <button
          onClick={onClose}
          disabled={busy}
          style={{ marginTop: 20, padding: "9px 14px", background: "transparent", color: "#94A3B8", border: "1px solid #334155", borderRadius: 6, cursor: busy ? "not-allowed" : "pointer", textAlign: "center", fontSize: 13, width: "100%" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function DeckEditorClient({
  initialSlides,
  branding,
  initialDeckTheme = "blueprint",
  projectId,
  projectTitle,
  valuePillars,
  designBuildDefaults,
  projectRoomsWithMedia,
  projectLevelMedia = [],
  brandBackgrounds = [],
  rendrConfigured = false,
  canGenerateDefaultDeck,
}: Props) {
  const [slides, setSlides] = useState<ProposalSlide[]>(
    [...initialSlides].sort((a, b) => a.order - b.order)
  );

  // ── Deck theme ───────────────────────────────────────────────────────────
  const [deckTheme, setDeckTheme] = useState<DeckThemeKey>(initialDeckTheme);
  // Inject the live theme into branding so all render contexts (canvas, rail,
  // inspector) pick it up via SlideRenderer's theme context.
  const themedBranding: DeckBranding = useMemo(
    () => ({ ...branding, deckTheme }),
    [branding, deckTheme],
  );
  const handleThemeChange = useCallback(
    async (next: DeckThemeKey) => {
      setDeckTheme(next);
      await updateDeckThemeAction(projectId, next);
    },
    [projectId],
  );
  const [activeSlideId, setActiveSlideId] = useState<string>(
    initialSlides[0]?.id ?? ""
  );

  // ── Persist state ──────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While an AI generation/compose/illustrate run is in flight, the debounced
  // autosave below must NOT fire: it would persist the stale, pre-AI client
  // `slides` state on top of the AI content the server is writing to the DB,
  // silently reverting Generate Deck. All those flows end in a full reload, so
  // the post-reload DB state is authoritative — there is nothing to autosave
  // mid-run. (Root cause of the "objective/scope come out generic" bug.)
  const suppressSaveRef = useRef(false);

  // ── Generate Deck state ───────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  // AI Fill (unified Generate Deck modal)
  const [alsoDraftCopy, setAlsoDraftCopy] = useState(false);
  const [alsoIllustrate, setAlsoIllustrate] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeMsg, setComposeMsg] = useState<string | null>(null);
  const [illustrateBusy, setIllustrateBusy] = useState(false);
  const [illustrateMsg, setIllustrateMsg] = useState<string | null>(null);

  const runGeneration = useCallback(
    async (mode: "keep-manual" | "replace-all") => {
      // Block the debounced autosave for the whole run: setSlides() below would
      // otherwise schedule a save of the pre-AI client state that lands on top
      // of the AI content compose/visuals write server-side. Cleared only on the
      // error path (success ends in a full reload).
      suppressSaveRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setGenerating(true);
      setGenerateStatus(null);
      const result = await generateDefaultDeckAction(projectId, mode);
      if (result.error) {
        suppressSaveRef.current = false;
        setGenerating(false);
        setGenerateStatus(`Error: ${result.error}`);
        setTimeout(() => setGenerateStatus(null), 5000);
        return;
      }
      const sorted = result.slides.sort((a, b) => a.order - b.order);
      setSlides(sorted);
      if (sorted[0]) setActiveSlideId(sorted[0].id);
      // Optionally chain the AI copy draft + illustrations, then reload to show them.
      if (alsoDraftCopy || alsoIllustrate) {
        let summary = "";
        if (alsoDraftCopy) {
          setGenerateStatus("Drafting copy with AI…");
          const c = await composeDeckCopyAction(projectId);
          summary += "error" in c ? `copy ERROR: ${c.error}` : `copy: ${c.updated} updated · ${c.skipped} skipped · ${c.errors.length} err`;
        }
        if (alsoIllustrate) {
          setGenerateStatus("Generating illustrations… (~1 min)");
          const v = await generateDeckVisualsAction(projectId);
          summary += (summary ? " | " : "") + ("error" in v ? `visuals ERROR: ${v.error}` : `visuals: ${v.illustrations} ill · ${v.icons} icons · ${v.errors} err`);
        }
        setGenerating(false);
        setGenerateStatus(summary + " — reloading in 8s");
        // eslint-disable-next-line no-console
        console.log("[GenerateDeck]", summary);
        setTimeout(() => window.location.reload(), 8000);
        return;
      }
      // No AI chain → no reload. The new deck is already persisted by
      // generateDefaultDeckAction; re-enable autosave for subsequent edits.
      suppressSaveRef.current = false;
      setGenerating(false);
      setConfirmOpen(false);
      setGenerateStatus(slides.length === 0 ? "Default deck generated" : "Default deck regenerated");
      setTimeout(() => setGenerateStatus(null), 3000);
    },
    [projectId, slides.length, alsoDraftCopy, alsoIllustrate]
  );

  // Save current editor state first (so user edits persist), run the AI action,
  // then reload so the freshly-written content shows.
  const runComposeCopy = useCallback(async () => {
    setComposeBusy(true);
    setComposeMsg(null);
    try {
      // Persist current edits FIRST so the AI reads the latest copy, then block
      // the debounced autosave for the rest of the run so it can't overwrite the
      // AI content compose writes server-side. Success ends in a reload.
      await saveDeckSlidesAction(projectId, slides);
      suppressSaveRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const res = await composeDeckCopyAction(projectId);
      if ("error" in res) {
        suppressSaveRef.current = false;
        setComposeMsg(`Error: ${res.error}`);
        setComposeBusy(false);
        return;
      }
      setComposeMsg(`Drafted ${res.updated} slide${res.updated === 1 ? "" : "s"} — reloading…`);
      setTimeout(() => window.location.reload(), 700);
    } catch {
      suppressSaveRef.current = false;
      setComposeMsg("Error: draft failed");
      setComposeBusy(false);
    }
  }, [projectId, slides]);

  const runGenerateIllustrations = useCallback(async () => {
    setIllustrateBusy(true);
    setIllustrateMsg(null);
    try {
      // Same autosave-suppression contract as runComposeCopy: save edits first,
      // then block autosave while visuals are written server-side.
      await saveDeckSlidesAction(projectId, slides);
      suppressSaveRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const res = await generateDeckVisualsAction(projectId);
      if ("error" in res) {
        suppressSaveRef.current = false;
        setIllustrateMsg(`Error: ${res.error}`);
        setIllustrateBusy(false);
        return;
      }
      setIllustrateMsg(`${res.illustrations} illustration${res.illustrations === 1 ? "" : "s"}, ${res.icons} icon${res.icons === 1 ? "" : "s"} — reloading…`);
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      suppressSaveRef.current = false;
      setIllustrateMsg("Error: generation failed");
      setIllustrateBusy(false);
    }
  }, [projectId, slides]);

  const handleGenerateClick = useCallback(() => {
    setComposeMsg(null);
    setIllustrateMsg(null);
    setConfirmOpen(true);
  }, []);

  const runDeleteDeck = useCallback(async () => {
    setConfirmOpen(false);
    if (
      !window.confirm(
        "Delete the entire deck? This removes all slides and cannot be undone. (Your photos and renders are kept.)",
      )
    ) {
      return;
    }
    setGenerating(true);
    setGenerateStatus(null);
    const result = await deleteProjectDeckAction(projectId);
    setGenerating(false);
    if ("error" in result) {
      setGenerateStatus(`Error: ${result.error}`);
      setTimeout(() => setGenerateStatus(null), 5000);
      return;
    }
    setSlides([]);
    setActiveSlideId("");
    setGenerateStatus("Deck deleted — use Generate Default Deck to start over.");
    setTimeout(() => setGenerateStatus(null), 5000);
  }, [projectId]);

  const preconditions = canGenerateDefaultDeck ?? { ok: true, missing: [] };
  const generateDisabled = !preconditions.ok;
  const generateDisabledReason = preconditions.ok
    ? ""
    : `Cannot generate: missing ${preconditions.missing.join(", ")}.`;

  // Auto-save: debounced 2 s after any slide state change.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Skip auto-save on an empty deck — there's nothing to persist.
    if (slides.length === 0) return;
    // Skip while an AI run is writing the deck server-side (see suppressSaveRef).
    if (suppressSaveRef.current) return;
    saveTimerRef.current = setTimeout(async () => {
      // Re-check at fire time: a run may have started during the debounce window.
      if (suppressSaveRef.current) return;
      setSaveStatus("saving");
      const result = await saveDeckSlidesAction(projectId, slides);
      setSaveStatus(result.ok ? "saved" : "error");
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides]);

  // Slides that have been "removed" from a default-spec type are kept in DB
  // with isUserHidden=true so backfill on next load won't resurrect them.
  // The editor surfaces only the visible subset; auto-save still operates on
  // the full `slides` array so the hidden flag persists.
  const visibleSlides = slides.filter((s) => !s.isUserHidden);
  const activeSlide = visibleSlides.find((s) => s.id === activeSlideId) ?? null;

  // ── AI Edit undo (per-slide, multi-step, in-memory) ───────────────────────
  // Snapshots live in a ref (source of truth for pop); a version counter forces
  // re-render so the Undo button's enabled state stays in sync. Cleared on reload.
  const aiUndoRef = useRef<Record<string, ProposalSlide[]>>({});
  const [, bumpUndo] = useReducer((x: number) => x + 1, 0);
  const MAX_UNDO = 10;

  const pushAiSnapshot = useCallback((s: ProposalSlide) => {
    const stack = aiUndoRef.current[s.id] ?? [];
    // Shallow copy with a cloned content object so later edits don't mutate it.
    const snap: ProposalSlide = { ...s, content: s.content ? { ...s.content } : s.content };
    aiUndoRef.current[s.id] = [...stack, snap].slice(-MAX_UNDO);
    bumpUndo();
  }, []);

  const undoAiEdit = useCallback((slideId: string) => {
    const stack = aiUndoRef.current[slideId] ?? [];
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    aiUndoRef.current[slideId] = stack.slice(0, -1);
    setSlides((prev) => prev.map((s) => (s.id === slideId ? snap : s)));
    bumpUndo();
  }, []);

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

  const reorderSlides = useCallback((updatedVisible: ProposalSlide[]) => {
    setSlides((prev) => {
      // SlideRail returns only the visible slides with their new orders 0..N.
      // Preserve hidden slides by appending them with their existing orders —
      // they're filtered out of the editor view but must persist in DB so
      // backfill on next load still sees their type.
      const hidden = prev.filter((s) => s.isUserHidden);
      return [...updatedVisible, ...hidden];
    });
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
      const target = prev.find((s) => s.id === id);
      if (!target || target.isLocked) return prev;

      // Default-spec types must soft-hide instead of hard-delete. Otherwise
      // backfillMissingDefaults resurrects them at the spec's hardcoded order
      // (e.g. 300 / 600) on the next page load — which lands them BELOW the
      // closing slide once siblings have been renumbered to integer orders
      // by a manual reorder. Hidden rows are filtered from the editor view
      // but stay in DB so backfill sees the type and skips it.
      if (DEFAULT_SPEC_SLIDE_TYPES.has(target.type)) {
        const updated = prev.map((s) =>
          s.id === id ? { ...s, isUserHidden: true } : s,
        );
        if (activeSlideId === id) {
          const nextActive = updated.find((s) => !s.isUserHidden);
          setActiveSlideId(nextActive?.id ?? "");
        }
        return updated;
      }

      // Optional / manually-added slide types — hard-remove and renumber.
      const filtered = prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
      if (activeSlideId === id) {
        setActiveSlideId(filtered[0]?.id ?? "");
      }
      return filtered;
    });
  }, [activeSlideId]);

  const addSlide = useCallback((type: SlideType) => {
    const layoutKey =
      type === "cover"               ? "hero-image"          :
      type === "objective"           ? "light-statement"     :
      type === "investment-by-space" ? "table-callout"       :
      type === "why-us"              ? "guarantee-grid"      :
      type === "scope-overview"      ? "editorial-split"     :
      type === "scope-breakdown"     ? "text-grid"           :
      type === "our-process"         ? "three-stages"        :
      type === "overall-investment"  ? "three-band-summary"  :
      type === "next-steps"          ? "numbered-photo"      :
      type === "closing"             ? "blueprint-split"     :
      type === "floor-plan"          ? "callout-map"         :
      type === "craftsmanship"       ? "standards-grid"      :
      type === "design-experience"   ? "stepped-circles"     :
      type === "timeline"            ? "week-axis"           :
      type === "testimonials"        ? "quote-cards"         :
      type === "design-build"        ? designBuildDefaults.defaultLayout :
      type === "addition-overview"   ? "combined"            :
      /* before-after */               "after-emphasis";

    const headline =
      type === "cover"               ? "New Cover"                  :
      type === "objective"           ? "Project Objective"          :
      type === "investment-by-space" ? "Investment by Space"        :
      type === "why-us"              ? "The HHI Difference"         :
      type === "scope-overview"      ? "Project Scope"              :
      type === "scope-breakdown"     ? "Additional Areas Included"  :
      type === "our-process"         ? "Our Process: From Vision to Finished Home" :
      type === "overall-investment"  ? "Your Investment"            :
      type === "next-steps"          ? "Your Path Forward"          :
      type === "closing"             ? "Securing Your Project Schedule" :
      type === "floor-plan"          ? "Mapping the Project Footprint" :
      type === "craftsmanship"       ? "Material & Assembly Standards" :
      type === "design-experience"   ? "Your Design Experience"     :
      type === "timeline"            ? "Projected Timeline"         :
      type === "testimonials"        ? "What Our Clients Say"       :
      type === "design-build"        ? designBuildDefaults.defaultHeadline :
      type === "addition-overview"   ? "The Vision: Expanding the Footprint" :
      /* before-after */               "Before & After";

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
        : type === "our-process"
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
        : type === "overall-investment"
        ? {
            sectionLabel: "DESIGN RETAINER",
            tagline: "Your investment in certainty before construction begins.",
            retainerAmount: "$22,000",
            benefits: [
              "Full architectural design and space planning",
              "HOA / ARB submission and approval management",
              "Complete material and finish specifications",
              "Fixed-price build contract before construction begins",
            ],
          }
        : type === "next-steps"
        ? {
            sectionLabel: "WHAT HAPPENS NEXT",
            steps: [
              { id: "sign-contract", number: 1, title: "Sign the Design Contract", description: "Formalize the relationship and secure your project start date with a signed design agreement." },
              { id: "measure-meeting", number: 2, title: "Schedule Your Measure Meeting", description: "We visit the space, take precise measurements, and document existing conditions to begin the design process." },
              { id: "feasibility-study", number: 3, title: "Complete the Feasibility Study", description: "Our team produces a detailed feasibility analysis confirming scope, budget alignment, and any structural considerations." },
              { id: "proposed-plan", number: 4, title: "Receive Your Proposed Plan", description: "We present your full architectural design, material selections, and fixed-price build contract for your approval." },
            ],
          }
        : type === "closing"
        ? {
            tagline: "Design. Build. Remodel.",
            validityNote: "This proposal is valid for 30 days.",
          }
        : type === "floor-plan"
        ? {
            // Seed zones from the project's rooms (COPE excluded); SF can be
            // pulled from room dimensions via the inspector's sync button.
            zones: projectRoomsWithMedia
              .filter((r) => !r.isProjectOverhead)
              .slice(0, 8)
              .map((r, i) => ({
                id: `zone-${r.id}`,
                number: i + 1,
                label: `Zone ${i + 1}: ${r.name}`,
                sqft: null,
                roomId: r.id,
              })),
          }
        : type === "craftsmanship"
        ? { items: HHI_DEFAULT_CRAFTSMANSHIP_ITEMS }
        : type === "testimonials"
        ? {
            showStars: true,
            testimonials: [],
          }
        : type === "design-build"
        ? {
            pillars: designBuildDefaults.defaultPillars,
            guarantees: designBuildDefaults.defaultGuarantees,
            diagramNodes: designBuildDefaults.defaultDiagramNodes,
            supportColumns: designBuildDefaults.defaultSupportColumns,
          }
        : type === "addition-overview"
        ? {
            layout: "combined",
            cadGenerationStatus: "idle",
            boundingBoxX: 10,
            boundingBoxY: 10,
            boundingBoxWidth: 40,
            boundingBoxHeight: 50,
            calloutLabel: "Proposed Addition Area",
            photoPanelWidth: 70,
            cadOverlayIntensity: 70,
            bullets: [
              { id: "b1", label: "The Structure", description: "Foundations, structural framing, and all load-bearing elements engineered to current code standards." },
              { id: "b2", label: "Engineering & Systems", description: "Mechanical, electrical, and plumbing systems designed to serve the new space seamlessly." },
              { id: "b3", label: "Finishes & Site Work", description: "Interior finishes selected to complement the existing home, with exterior work matched to current materials." },
            ],
          }
        : type === "design-experience"
        ? {}
        : type === "timeline"
        ? { sectionLabel: "YOUR PROJECT" }
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
  }, [slides.length, valuePillars, designBuildDefaults]);

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
          layoutKey: "after-emphasis" as const,
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

  // ── Re-sync investment slide ───────────────────────────────────────────────
  // Clears isUserModified on the investment slide, saves all slides, then
  // re-runs the full server sync so fresh line items are injected.
  const handleResyncInvestment = useCallback(async () => {
    // Build updated slide list with isUserModified cleared on the investment slide.
    const updatedSlides = slides.map((s) =>
      s.type === "investment-by-space" ? { ...s, isUserModified: false } : s
    );
    setSlides(updatedSlides);
    setSaveStatus("saving");
    // Pass updatedSlides directly so refreshDeckAction saves the cleared flag
    // before re-running the sync — avoids the async-state timing issue.
    const result = await refreshDeckAction(projectId, updatedSlides);
    if (result.slides && result.slides.length > 0) {
      const sorted = result.slides.sort((a, b) => a.order - b.order);
      setSlides(sorted);
      setActiveSlideId((prev) => (result.slides!.find((s) => s.id === prev) ? prev : sorted[0]?.id ?? prev));
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
        const investIdx = prev.findIndex((s) => s.type === "investment-by-space");
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

  const deckActions = (
    <>
      <AddSlideMenu onAdd={(type) => addSlide(type)} accentColor={branding.accentColor} />
      <AutoBeforeAfterMenu
        onAutoGen={autoGenBeforeAfterSlides}
        onRefresh={handleServerRefresh}
        onAutoGenScope={autoGenScopeBreakdown}
        accentColor={branding.accentColor}
      />
      <select
        value={deckTheme}
        onChange={(e) => handleThemeChange(e.target.value as DeckThemeKey)}
        title="Deck visual theme"
        className="rounded"
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 10px",
          background: "#2D3F50",
          color: "#94A3B8",
          border: "1px solid #334155",
          cursor: "pointer",
          userSelect: "none",
          alignSelf: "center",
        }}
      >
        {DECK_THEMES.map((t) => (
          <option key={t.key} value={t.key} style={{ color: "#111" }}>
            Theme: {t.label}
          </option>
        ))}
      </select>
      <GenerateDeckButton
        disabled={generateDisabled}
        disabledReason={generateDisabledReason}
        onClick={handleGenerateClick}
        busy={generating}
      />
      {generateStatus && (
        <span
          style={{
            fontSize: 11,
            color: generateStatus.startsWith("Error") ? "#FCA5A5" : "#86EFAC",
            alignSelf: "center",
            marginLeft: 4,
          }}
        >
          {generateStatus}
        </span>
      )}
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
    </>
  );

  return (
    <div
      className="flex flex-col -mt-10 -mb-10"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
    >
      {/* ── Tab nav with deck actions flush-right ───────────────────────── */}
      <ProjectTabNav
        projectId={projectId}
        currentTab="deck"
        rendrConfigured={rendrConfigured}
        rightSlot={deckActions}
        stickyTop={112}
      />

      {/* ── Three-column editor layout or empty state ──────────────────── */}
      {slides.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{ background: "#F4F3F0", height: "calc(100vh - 160px)" }}
        >
          <div
            style={{
              maxWidth: 460,
              textAlign: "center",
              padding: 32,
              background: "#FFFFFF",
              border: "1px solid #E5E4DE",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            }}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "#1A2332",
                marginBottom: 10,
                fontFamily: "Cormorant Garamond, serif",
              }}
            >
              No slides yet
            </h2>
            <p style={{ fontSize: 14, color: "#5A5A5A", lineHeight: 1.5, marginBottom: 22 }}>
              Generate a default deck for this project, or add slides individually
              from the toolbar.
            </p>
            <button
              onClick={handleGenerateClick}
              disabled={generateDisabled || generating}
              title={generateDisabled ? generateDisabledReason : ""}
              style={{
                padding: "10px 22px",
                background: generateDisabled ? "#D4D4D4" : branding.accentColor,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: generateDisabled
                  ? "not-allowed"
                  : generating
                  ? "wait"
                  : "pointer",
                opacity: generating ? 0.75 : 1,
              }}
            >
              {generating ? "Generating…" : "Generate Default Deck"}
            </button>
            {generateDisabled && (
              <p style={{ fontSize: 12, color: "#9A9A9A", marginTop: 14, lineHeight: 1.5 }}>
                Missing: {preconditions.missing.join(", ")}.
              </p>
            )}
            {generateStatus && generateStatus.startsWith("Error") && (
              <p style={{ fontSize: 12, color: "#DC2626", marginTop: 14 }}>
                {generateStatus}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex overflow-hidden"
          style={{ background: "#F4F3F0", height: "calc(100vh - 160px)" }}
        >
          {/* Left — slide rail */}
          <SlideRail
            slides={visibleSlides}
            activeSlideId={activeSlideId}
            branding={themedBranding}
            onSelect={setActiveSlideId}
            onReorder={reorderSlides}
            onToggleEnabled={toggleEnabled}
            brandBackgrounds={brandBackgrounds}
          />

          {/* Center — canvas */}
          <SlideCanvas slide={activeSlide} branding={themedBranding} brandBackgrounds={brandBackgrounds} />

          {/* Right — inspector */}
          <InspectorPanel
            slide={activeSlide}
            branding={themedBranding}
            projectId={projectId}
            onUpdate={updateSlide}
            onDuplicate={duplicateSlide}
            onRemove={removeSlide}
            onToggleEnabled={toggleEnabled}
            projectRoomsWithMedia={projectRoomsWithMedia}
            projectLevelMedia={projectLevelMedia}
            brandBackgrounds={brandBackgrounds}
            onBackgroundChange={handleBackgroundChange}
            onTextZoneChange={handleTextZoneChange}
            onResyncInvestment={handleResyncInvestment}
            pushAiSnapshot={pushAiSnapshot}
            onAiUndo={undoAiEdit}
            aiUndoDepth={activeSlide ? (aiUndoRef.current[activeSlide.id]?.length ?? 0) : 0}
          />
        </div>
      )}

      {confirmOpen && (
        <GenerateDeckModal
          onClose={() => setConfirmOpen(false)}
          hasSlides={slides.length > 0}
          generating={generating}
          alsoDraftCopy={alsoDraftCopy}
          setAlsoDraftCopy={setAlsoDraftCopy}
          alsoIllustrate={alsoIllustrate}
          setAlsoIllustrate={setAlsoIllustrate}
          onGenerate={(mode) => void runGeneration(mode)}
          onDeleteAll={() => void runDeleteDeck()}
          composeBusy={composeBusy}
          composeMsg={composeMsg}
          onComposeCopy={() => void runComposeCopy()}
          illustrateBusy={illustrateBusy}
          illustrateMsg={illustrateMsg}
          onGenerateIllustrations={() => void runGenerateIllustrations()}
          accent={branding.accentColor}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type {
  ProposalSlide,
  DeckBranding,
  SlideType,
  CoverContent,
  CoverLayoutKey,
  LogoOverride,
  ObjectiveContent,
  InvestmentContent,
  WhyUsContent,
  ScopeOverviewContent,
  ScopeOverviewSelectedPhoto,
  BeforeAfterContent,
  RoomWithMedia,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  RiskBriefContent,
  ProcessContent,
  TextZoneSetting,
  TextZoneSuggestion,
} from "@/app/lib/deck/types";
import {
  SLIDE_TYPE_LABELS,
  LOGO_DEFAULTS,
  getLayoutsForType,
} from "@/app/lib/deck/types";
import { LibraryMediaPicker } from "@/app/admin/settings/photo-library/library-media-picker";
import type { LibraryMediaItem } from "@/app/admin/settings/photo-library/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { analyzeBackgroundTextZoneAction } from "@/app/admin/settings/branding/backgrounds/actions";

interface Props {
  slide: ProposalSlide | null;
  branding: DeckBranding;
  onUpdate: (updated: ProposalSlide) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  /** Rooms with pre-resolved before/render media — powers BeforeAfterInspector. */
  projectRoomsWithMedia?: RoomWithMedia[];
  /** All brand backgrounds for the background picker. */
  brandBackgrounds?: BrandBackgroundForUI[];
  /** Callback when user picks a background. */
  onBackgroundChange?: (backgroundId: string | null) => void;
  /** Callback when user edits the text zone. */
  onTextZoneChange?: (zone: TextZoneSetting | null) => void;
}

// ─── Small UI primitives ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="uppercase tracking-widest font-semibold"
      style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div style={{ height: 1, background: "#E5E3DF", margin: "16px 0" }} />
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded"
      style={{
        fontSize: 12,
        padding: "5px 8px",
        border: "1px solid #D1D5DB",
        color: "#111827",
        background: "#fff",
        outline: "none",
      }}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded resize-y"
      style={{
        fontSize: 12,
        padding: "5px 8px",
        border: "1px solid #D1D5DB",
        color: "#111827",
        background: "#fff",
        outline: "none",
      }}
    />
  );
}

function ActionButton({
  onClick,
  children,
  variant = "default",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded text-left font-medium"
      style={{
        fontSize: 12,
        padding: "6px 10px",
        background: variant === "danger" ? "#FEE2E2" : "#F3F4F6",
        color: variant === "danger" ? "#DC2626" : "#374151",
        border: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─── Content editors per slide type ─────────────────────────────────────────

function CoverInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as CoverContent;

  function updateContent(patch: Partial<CoverContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const isRightPanel = slide.layoutKey === "right-panel-overlay";
  const isBottomCard = slide.layoutKey === "bottom-card-overlay";

  return (
    <>
      <SectionLabel>Content</SectionLabel>
      <FieldGroup label="Headline">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. 34 Sussex Lane"
        />
      </FieldGroup>
      <FieldGroup label="Subheadline / Project Name">
        <TextInput
          value={slide.subheadline ?? ""}
          onChange={(v) => onUpdate({ ...slide, subheadline: v })}
          placeholder="e.g. Multiple Bathroom + Laundry Updates"
        />
      </FieldGroup>
      <FieldGroup label="Prepared For">
        <TextInput
          value={content.preparedFor ?? ""}
          onChange={(v) => updateContent({ preparedFor: v })}
          placeholder="Client name"
        />
      </FieldGroup>
      <FieldGroup label="Date">
        <TextInput
          value={content.date ?? ""}
          onChange={(v) => updateContent({ date: v })}
          placeholder="e.g. March 22, 2026"
        />
      </FieldGroup>

      {/* Panel position — right-panel-overlay only */}
      {isRightPanel && (
        <FieldGroup label="Panel Side">
          <div className="flex gap-1">
            {(["left", "right"] as const).map((pos) => {
              const active = (content.overlayPosition ?? "right") === pos;
              return (
                <button
                  key={pos}
                  onClick={() => updateContent({ overlayPosition: pos })}
                  className="flex-1 rounded capitalize"
                  style={{
                    fontSize: 12,
                    padding: "5px 8px",
                    background: active ? `${branding.accentColor}18` : "#F3F4F6",
                    color: active ? branding.textColor : "#6B7280",
                    border: `1px solid ${active ? branding.accentColor : "#E5E7EB"}`,
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {pos}
                </button>
              );
            })}
          </div>
        </FieldGroup>
      )}

      {/* Card position — bottom-card-overlay only */}
      {isBottomCard && (
        <FieldGroup label="Card Corner">
          <div className="flex gap-1">
            {(
              [
                { key: "bottom-left",  label: "Bottom Left"  },
                { key: "bottom-right", label: "Bottom Right" },
              ] as const
            ).map(({ key: pos, label }) => {
              const active = (content.cardPosition ?? "bottom-left") === pos;
              return (
                <button
                  key={pos}
                  onClick={() => updateContent({ cardPosition: pos })}
                  className="flex-1 rounded"
                  style={{
                    fontSize: 11,
                    padding: "5px 6px",
                    background: active ? `${branding.accentColor}18` : "#F3F4F6",
                    color: active ? branding.textColor : "#6B7280",
                    border: `1px solid ${active ? branding.accentColor : "#E5E7EB"}`,
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </FieldGroup>
      )}

      {/* ── Logo Position & Scale ─────────────────────────────────────────── */}
      <LogoPositionSection
        slide={slide}
        branding={branding}
        content={content}
        updateContent={updateContent}
      />
    </>
  );
}

// ─── Logo position sub-section (used only inside CoverInspector) ─────────────

function LogoPositionSection({
  slide,
  branding,
  content,
  updateContent,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  content: CoverContent;
  updateContent: (patch: Partial<CoverContent>) => void;
}) {
  const lo = content.logoOverride ?? null;

  // Seed values: use stored override if present, else layout defaults
  const layoutKey = slide.layoutKey as CoverLayoutKey;
  const defaults = LOGO_DEFAULTS[layoutKey] ?? { x: 10, y: 8, scale: 1.0 };
  const cardPos = content.cardPosition ?? "bottom-left";
  const effectiveDefaults =
    layoutKey === "bottom-card-overlay"
      ? { x: cardPos === "bottom-right" ? 5 : 78, y: 5, scale: 1.0 }
      : defaults;

  const cur: LogoOverride = lo
    ? {
        x:     Math.max(0,   Math.min(100, lo.x)),
        y:     Math.max(0,   Math.min(100, lo.y)),
        scale: Math.max(0.5, Math.min(5.0, lo.scale)),
      }
    : { ...effectiveDefaults };

  function updateLogo(patch: Partial<LogoOverride>) {
    updateContent({ logoOverride: { ...cur, ...patch } });
  }

  return (
    <>
      <div style={{ height: 1, background: "#E5E3DF", margin: "16px 0" }} />
      <p
        className="uppercase tracking-widest font-semibold"
        style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}
      >
        Logo
      </p>

      {/* X Position */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 11, color: "#6B7280" }}>X Position</span>
          <span
            style={{
              fontSize: 11,
              color: "#374151",
              fontVariantNumeric: "tabular-nums",
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {Math.round(cur.x)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={cur.x}
          onChange={(e) => updateLogo({ x: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }}
        />
      </div>

      {/* Y Position */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 11, color: "#6B7280" }}>Y Position</span>
          <span
            style={{
              fontSize: 11,
              color: "#374151",
              fontVariantNumeric: "tabular-nums",
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {Math.round(cur.y)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={cur.y}
          onChange={(e) => updateLogo({ y: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }}
        />
      </div>

      {/* Scale */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <span style={{ fontSize: 11, color: "#6B7280" }}>Scale</span>
          <span
            style={{
              fontSize: 11,
              color: "#374151",
              fontVariantNumeric: "tabular-nums",
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {cur.scale.toFixed(1)}×
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={5.0}
          step={0.1}
          value={cur.scale}
          onChange={(e) => updateLogo({ scale: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }}
        />
      </div>

      {/* Reset — only visible when an override is stored */}
      {lo && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => updateContent({ logoOverride: null })}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: "transparent",
              color: "#6B7280",
              border: "1px solid #E5E7EB",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Reset to default
          </button>
        </div>
      )}
    </>
  );
}

function ObjectiveInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ObjectiveContent;

  function updateContent(patch: Partial<ObjectiveContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const bullets = (content.bullets ?? ["", "", ""]).concat(["", "", ""]).slice(0, 3);

  /** Reusable colour picker row */
  function ColorRow({ value, defaultVal, onChangeFn, onReset }: {
    value: string | null | undefined;
    defaultVal: string;
    onChangeFn: (v: string) => void;
    onReset?: () => void;
  }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value ?? defaultVal} onChange={(e) => onChangeFn(e.target.value)}
          style={{ width: 36, height: 28, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
          {value ?? "(default)"}
        </span>
        {value && onReset && (
          <button onClick={onReset}
            style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
            Reset
          </button>
        )}
      </div>
    );
  }

  /** Reusable outline picker: None button + colour picker */
  function OutlineRow({ value, onChangeFn }: {
    value: string | null | undefined;
    onChangeFn: (v: string | null) => void;
  }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => onChangeFn(null)}
          style={{
            fontSize: 11, padding: "3px 10px",
            background: !value ? branding.accentColor : "#F3F4F6",
            color: !value ? "#fff" : "#374151",
            border: `1px solid ${!value ? branding.accentColor : "#D1D5DB"}`,
            borderRadius: 4, cursor: "pointer", fontWeight: !value ? 600 : 400,
          }}>
          None
        </button>
        <input type="color" value={value ?? "#ffffff"}
          onChange={(e) => onChangeFn(e.target.value)}
          style={{ width: 32, height: 26, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
          {value ?? "None"}
        </span>
      </div>
    );
  }

  return (
    <>
      {/* ── Content ───────────────────────────────────────────────────────── */}
      <SectionLabel>Content</SectionLabel>
      <FieldGroup label="Headline">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. Project Objective"
        />
      </FieldGroup>
      <FieldGroup label="Subheadline">
        <TextInput
          value={slide.subheadline ?? ""}
          onChange={(v) => onUpdate({ ...slide, subheadline: v })}
          placeholder="e.g. Refined Modernization"
        />
      </FieldGroup>
      <FieldGroup label="Statement (bold)">
        <TextArea
          value={content.statementText ?? ""}
          onChange={(v) => updateContent({ statementText: v })}
          placeholder="Our objective is to deliver…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Supporting Text">
        <TextArea
          value={content.supportingText ?? ""}
          onChange={(v) => updateContent({ supportingText: v })}
          placeholder="We will manage permitting…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Bullet 1">
        <TextInput
          value={bullets[0]}
          onChange={(v) => updateContent({ bullets: [v, bullets[1], bullets[2]] })}
          placeholder="Coordinated trades and permitting"
        />
      </FieldGroup>
      <FieldGroup label="Bullet 2">
        <TextInput
          value={bullets[1]}
          onChange={(v) => updateContent({ bullets: [bullets[0], v, bullets[2]] })}
          placeholder="Comprehensive site protection"
        />
      </FieldGroup>
      <FieldGroup label="Bullet 3">
        <TextInput
          value={bullets[2]}
          onChange={(v) => updateContent({ bullets: [bullets[0], bullets[1], v] })}
          placeholder="Professional cleaning included"
        />
      </FieldGroup>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: -6, marginBottom: 12, lineHeight: 1.4 }}>
        Bullets used by Dark Statement (bottom row), Blueprint Overlay (3-col blocks), and Executive Summary ("The Outcome" column).
      </p>

      {/* ── Headline Style ────────────────────────────────────────────────── */}
      <SectionLabel>Headline Style</SectionLabel>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 1.0).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.headlineSize ?? 1.0}
          onChange={(e) => updateContent({ headlineSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label="Color">
        <ColorRow
          value={content.headlineColor}
          defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ headlineColor: v })}
          onReset={() => updateContent({ headlineColor: null })}
        />
      </FieldGroup>
      <FieldGroup label="Outline">
        <OutlineRow
          value={content.headlineOutline}
          onChangeFn={(v) => updateContent({ headlineOutline: v })}
        />
      </FieldGroup>

      {/* ── Statement Style ───────────────────────────────────────────────── */}
      <SectionLabel>Statement Style</SectionLabel>
      <FieldGroup label={`Size — ${(content.statementSize ?? 1.0).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.statementSize ?? 1.0}
          onChange={(e) => updateContent({ statementSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label="Color">
        <ColorRow
          value={content.statementColor}
          defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ statementColor: v })}
          onReset={() => updateContent({ statementColor: null })}
        />
      </FieldGroup>
      <FieldGroup label="Outline">
        <OutlineRow
          value={content.statementOutline}
          onChangeFn={(v) => updateContent({ statementOutline: v })}
        />
      </FieldGroup>

      {/* ── Supporting Text Style ─────────────────────────────────────────── */}
      <SectionLabel>Supporting Text Style</SectionLabel>
      <FieldGroup label={`Size — ${(content.supportingSize ?? 1.0).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.supportingSize ?? 1.0}
          onChange={(e) => updateContent({ supportingSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label="Color">
        <ColorRow
          value={content.supportingColor}
          defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ supportingColor: v })}
          onReset={() => updateContent({ supportingColor: null })}
        />
      </FieldGroup>

      {/* ── Bullets Style ─────────────────────────────────────────────────── */}
      <SectionLabel>Bullets Style</SectionLabel>
      <FieldGroup label="Color">
        <ColorRow
          value={content.bulletColor}
          defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ bulletColor: v })}
          onReset={() => updateContent({ bulletColor: null })}
        />
      </FieldGroup>

      {/* ── Text Position & Width ──────────────────────────────────────────── */}
      <SectionLabel>Text Position &amp; Width</SectionLabel>
      <FieldGroup label={`Position X — ${Math.round((content.textX ?? 0.06) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.textX ?? 0.06) * 100)}
          onChange={(e) => updateContent({ textX: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label={`Position Y — ${Math.round((content.textY ?? 0.08) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.textY ?? 0.08) * 100)}
          onChange={(e) => updateContent({ textY: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label={`Width — ${content.textWidth ?? "layout default"}%`}>
        <input type="range" min={10} max={100} step={1}
          value={content.textWidth ?? 60}
          onChange={(e) => updateContent({ textWidth: parseInt(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        {content.textWidth != null && (
          <button
            onClick={() => updateContent({ textWidth: null })}
            style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginTop: 2 }}
          >
            Reset to layout default
          </button>
        )}
      </FieldGroup>

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <SectionLabel>Card</SectionLabel>
      <FieldGroup label="Show Card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={content.showCard ?? false}
            onChange={(e) => updateContent({ showCard: e.target.checked })}
            style={{ accentColor: branding.accentColor, width: 16, height: 16 }}
          />
          <span style={{ fontSize: 12, color: "#374151" }}>
            {content.showCard ? "Card enabled" : "No card background"}
          </span>
        </div>
      </FieldGroup>
      {content.showCard && (
        <>
          <FieldGroup label="Card Color">
            <ColorRow
              value={content.cardColor}
              defaultVal="#000000"
              onChangeFn={(v) => updateContent({ cardColor: v })}
              onReset={() => updateContent({ cardColor: null })}
            />
          </FieldGroup>
          <FieldGroup label={`Card Opacity — ${content.cardOpacity ?? 50}%`}>
            <input type="range" min={0} max={100} step={1}
              value={content.cardOpacity ?? 50}
              onChange={(e) => updateContent({ cardOpacity: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: branding.accentColor }} />
          </FieldGroup>
        </>
      )}
    </>
  );
}

function InvestmentInspector({
  slide,
}: {
  slide: ProposalSlide;
}) {
  const content = (slide.content ?? {}) as InvestmentContent;

  return (
    <>
      <SectionLabel>Content</SectionLabel>
      <p style={{ fontSize: 11, color: "#9CA3AF" }}>
        {(content.lineItems ?? []).length} line items. Edit from the Investment
        tab — line item editing inside the deck inspector is coming in Phase 2.
      </p>
    </>
  );
}

// ─── Why Us Inspector ────────────────────────────────────────────────────────

function WhyUsInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as WhyUsContent;
  const allPillars = content.pillars ?? [];

  // selectedPillarIds: non-empty = explicit selection; empty/absent = all shown
  const selectedIds: string[] =
    (content.selectedPillarIds?.length ?? 0) > 0
      ? content.selectedPillarIds!
      : allPillars.map((p) => p.id);

  function updateContent(patch: Partial<WhyUsContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function togglePillar(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    // Keep at least one pillar selected
    updateContent({ selectedPillarIds: next.length > 0 ? next : selectedIds });
  }

  const isTestimonialsSplit = slide.layoutKey === "testimonials-split";

  return (
    <>
      <SectionLabel>Content</SectionLabel>
      <FieldGroup label="Section Title">
        <TextInput
          value={content.sectionTitle ?? ""}
          onChange={(v) => updateContent({ sectionTitle: v || null })}
          placeholder={slide.headline ?? "The HHI Difference"}
        />
      </FieldGroup>

      {/* Testimonials notice — only for testimonials-split layout */}
      {isTestimonialsSplit && (
        <div
          style={{
            background: "#FEF9EC",
            border: "1px solid #FDE68A",
            borderRadius: 4,
            padding: "7px 9px",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 10, color: "#92400E", lineHeight: 1.5, fontWeight: 500 }}>
            Testimonials: using built-in sample quotes.
          </p>
          <p style={{ fontSize: 10, color: "#B45309", lineHeight: 1.5, marginTop: 2 }}>
            Real project reviews will be wired in Phase 2.
          </p>
        </div>
      )}

      <Divider />

      <SectionLabel>Pillars</SectionLabel>
      {allPillars.length === 0 ? (
        <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
          No pillars found. Go to{" "}
          <strong style={{ color: "#6B7280" }}>
            Settings → Value Pillars
          </strong>{" "}
          to add them.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {allPillars.map((pillar) => {
            const active = selectedIds.includes(pillar.id);
            return (
              <button
                key={pillar.id}
                onClick={() => togglePillar(pillar.id)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "5px 7px",
                  background: active
                    ? `${branding.accentColor}12`
                    : "#F3F4F6",
                  border: `1px solid ${active ? branding.accentColor : "#E5E7EB"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {/* Checkbox dot */}
                <span
                  style={{
                    flexShrink: 0,
                    marginTop: 1,
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: active ? branding.accentColor : "transparent",
                    border: `1.5px solid ${active ? branding.accentColor : "#D1D5DB"}`,
                  }}
                />
                {/* Icon + title */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    flex: 1,
                  }}
                >
                  {pillar.iconUrl && (
                    <img
                      src={pillar.iconUrl}
                      alt=""
                      style={{ width: 13, height: 13, objectFit: "contain", flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: active ? branding.textColor : "#6B7280",
                      fontWeight: active ? 600 : 400,
                      lineHeight: 1.4,
                    }}
                  >
                    {pillar.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p
        style={{
          fontSize: 10,
          color: "#C4C4BF",
          marginTop: 6,
          lineHeight: 1.4,
        }}
      >
        {selectedIds.length} of {allPillars.length} pillar
        {allPillars.length !== 1 ? "s" : ""} visible
      </p>
    </>
  );
}

// ─── Scope Overview Inspector ────────────────────────────────────────────────

function ScopeOverviewInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const selectedPhotos = content.selectedPhotos ?? [];
  const isSplitPanel = slide.layoutKey === "split-panel";
  const maxPhotos = isSplitPanel ? 2 : 4;
  const [pickerOpen, setPickerOpen] = useState(false);

  function updateContent(patch: Partial<ScopeOverviewContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handlePickerSelect(items: LibraryMediaItem[]) {
    const photos: ScopeOverviewSelectedPhoto[] = items.map((item) => ({
      id: item.id,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
    }));
    // Replace entire selection (picker returns the full desired set)
    updateContent({ selectedPhotos: photos.slice(0, maxPhotos) });
    setPickerOpen(false);
  }

  function removePhoto(id: string) {
    updateContent({ selectedPhotos: selectedPhotos.filter((p) => p.id !== id) });
  }

  return (
    <>
      <SectionLabel>Content</SectionLabel>

      <FieldGroup label="Title">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. What We're Building"
        />
      </FieldGroup>

      <FieldGroup label="Description">
        <TextArea
          value={content.description ?? ""}
          onChange={(v) => updateContent({ description: v || null })}
          placeholder="3–4 sentences summarizing the project scope…"
          rows={4}
        />
      </FieldGroup>

      <Divider />

      {/* ── Photo picker ────────────────────────────────────────────────── */}
      <SectionLabel>Photos</SectionLabel>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.5 }}>
        {isSplitPanel ? "Up to 2 photos (Split Panel)." : "Up to 4 photos (Image Row)."}
      </p>

      {/* Selected thumbnails grid */}
      {selectedPhotos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            marginBottom: 8,
          }}
        >
          {selectedPhotos.map((photo, idx) => (
            <div
              key={photo.id}
              style={{
                position: "relative",
                aspectRatio: "16 / 9",
                borderRadius: 4,
                overflow: "hidden",
                background: "#E8E6E3",
                flexShrink: 0,
              }}
            >
              {/* Thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbnailUrl ?? photo.url}
                alt={`Photo ${idx + 1}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />

              {/* Remove button */}
              <button
                onClick={() => removePhoto(photo.id)}
                title="Remove"
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.60)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>

              {/* Order badge */}
              <span
                style={{
                  position: "absolute",
                  bottom: 3,
                  left: 4,
                  fontSize: 8,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: "0.04em",
                }}
              >
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Choose / replace button */}
      <button
        onClick={() => setPickerOpen(true)}
        style={{
          width: "100%",
          padding: "7px 10px",
          background: selectedPhotos.length > 0 ? "#F3F4F6" : branding.accentColor + "18",
          color: selectedPhotos.length > 0 ? "#374151" : branding.textColor,
          border: `1px solid ${selectedPhotos.length > 0 ? "#D1D5DB" : branding.accentColor}`,
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          textAlign: "center" as const,
          marginBottom: 4,
        }}
      >
        {selectedPhotos.length === 0
          ? "Choose Photos"
          : `Change Photos (${selectedPhotos.length}/${maxPhotos})`}
      </button>

      {selectedPhotos.length > 0 && (
        <p style={{ fontSize: 10, color: "#C4C0BB", lineHeight: 1.4, marginBottom: 4 }}>
          Click "Change Photos" to reopen the picker and replace the selection.
        </p>
      )}

      {/* Picker modal — reuses the existing Library Media Picker */}
      <LibraryMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        multiple={maxPhotos > 1}
        includeUnapproved
      />

      <Divider />

      {/* ── Title controls ──────────────────────────────────────────────── */}
      <SectionLabel>Title</SectionLabel>

      <FieldGroup label={`Size — ${(content.titleSize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.titleSize ?? 1.5}
          onChange={(e) => updateContent({ titleSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Color">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color"
            value={content.titleColor ?? branding.textColor}
            onChange={(e) => updateContent({ titleColor: e.target.value })}
            style={{ width: 36, height: 28, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
          <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{content.titleColor ?? branding.textColor}</span>
          {content.titleColor && (
            <button onClick={() => updateContent({ titleColor: null })}
              style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>Reset</button>
          )}
        </div>
      </FieldGroup>

      <FieldGroup label={`Position X — ${Math.round((content.titleX ?? 0.06) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.titleX ?? 0.06) * 100)}
          onChange={(e) => updateContent({ titleX: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>Left</span><span>Right</span>
        </div>
      </FieldGroup>

      <FieldGroup label={`Position Y — ${Math.round((content.titleY ?? (isSplitPanel ? 0.35 : 0.16)) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.titleY ?? (isSplitPanel ? 0.35 : 0.16)) * 100)}
          onChange={(e) => updateContent({ titleY: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>Top</span><span>Bottom</span>
        </div>
      </FieldGroup>

      <Divider />

      {/* ── Copy controls ───────────────────────────────────────────────── */}
      <SectionLabel>Description Copy</SectionLabel>

      <FieldGroup label={`Size — ${(content.copySize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.copySize ?? 1.5}
          onChange={(e) => updateContent({ copySize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Color">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color"
            value={content.copyColor ?? "#4B5563"}
            onChange={(e) => updateContent({ copyColor: e.target.value })}
            style={{ width: 36, height: 28, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
          <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{content.copyColor ?? "#4B5563"}</span>
          {content.copyColor && (
            <button onClick={() => updateContent({ copyColor: null })}
              style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>Reset</button>
          )}
        </div>
      </FieldGroup>

      <FieldGroup label={`Position X — ${Math.round((content.copyX ?? 0.06) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.copyX ?? 0.06) * 100)}
          onChange={(e) => updateContent({ copyX: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>Left</span><span>Right</span>
        </div>
      </FieldGroup>

      <FieldGroup label={`Position Y — ${Math.round((content.copyY ?? (isSplitPanel ? 0.66 : 0.33)) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.copyY ?? (isSplitPanel ? 0.66 : 0.33)) * 100)}
          onChange={(e) => updateContent({ copyY: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>Top</span><span>Bottom</span>
        </div>
      </FieldGroup>
    </>
  );
}

// ─── Before / After Inspector ────────────────────────────────────────────────

function BeforeAfterInspector({
  slide,
  branding,
  onUpdate,
  projectRoomsWithMedia = [],
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  projectRoomsWithMedia: RoomWithMedia[];
}) {
  const content = (slide.content ?? {}) as BeforeAfterContent;

  function updateContent(patch: Partial<BeforeAfterContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  /** When the user picks a different room, auto-select sensible defaults. */
  function handleRoomChange(roomId: string) {
    if (!roomId) {
      updateContent({ roomId: null, roomName: null, beforeMediaId: null, beforeImageUrl: null, afterMediaId: null, afterImageUrl: null });
      return;
    }
    const room = projectRoomsWithMedia.find((r) => r.id === roomId);
    if (!room) return;

    // Before default: auto-select if exactly 1 exists
    const defaultBefore =
      room.beforeMedia.length === 1 ? room.beforeMedia[0] : null;

    // After default: selectedRenderMediaId first, then auto-select if exactly 1
    const selectedRender = room.selectedRenderMediaId
      ? room.renderMedia.find((m) => m.id === room.selectedRenderMediaId) ?? null
      : null;
    const defaultAfter =
      selectedRender ?? (room.renderMedia.length === 1 ? room.renderMedia[0] : null);

    updateContent({
      roomId,
      roomName: room.name,
      beforeMediaId: defaultBefore?.id ?? null,
      beforeImageUrl: defaultBefore?.url ?? null,
      afterMediaId: defaultAfter?.id ?? null,
      afterImageUrl: defaultAfter?.url ?? null,
    });
  }

  function selectBefore(media: { id: string; url: string }) {
    updateContent({ beforeMediaId: media.id, beforeImageUrl: media.url });
  }

  function selectAfter(media: { id: string; url: string }) {
    updateContent({ afterMediaId: media.id, afterImageUrl: media.url });
  }

  const selectedRoom = projectRoomsWithMedia.find((r) => r.id === content.roomId) ?? null;

  return (
    <>
      <SectionLabel>Content</SectionLabel>

      {/* ── Typography controls ───────────────────────────────────────── */}

      {/* Heading size slider */}
      <FieldGroup label="Heading Size">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.05}
            value={content.headingFontSize ?? 1.5}
            onChange={(e) => updateContent({ headingFontSize: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: branding.accentColor, cursor: "pointer" }}
          />
          <span style={{ fontSize: 10, color: "#6B7280", minWidth: 32, textAlign: "right" }}>
            {(content.headingFontSize ?? 1.5).toFixed(2)}×
          </span>
        </div>
      </FieldGroup>

      {/* Caption / body size slider */}
      <FieldGroup label="Caption Size">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.05}
            value={content.captionFontSize ?? 1.5}
            onChange={(e) => updateContent({ captionFontSize: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: branding.accentColor, cursor: "pointer" }}
          />
          <span style={{ fontSize: 10, color: "#6B7280", minWidth: 32, textAlign: "right" }}>
            {(content.captionFontSize ?? 1.5).toFixed(2)}×
          </span>
        </div>
      </FieldGroup>

      {/* Heading color picker */}
      <FieldGroup label="Heading Color">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="color"
            value={content.headingColor ?? branding.textColor ?? "#1A1A1A"}
            onChange={(e) => updateContent({ headingColor: e.target.value })}
            style={{
              width: 30,
              height: 30,
              padding: 2,
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={content.headingColor ?? branding.textColor ?? "#1A1A1A"}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateContent({ headingColor: v });
            }}
            style={{
              flex: 1,
              fontSize: 11,
              padding: "4px 6px",
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              fontFamily: "monospace",
              color: "#374151",
            }}
          />
          {content.headingColor && (
            <button
              onClick={() => updateContent({ headingColor: null })}
              title="Reset to default"
              style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}
            >
              ↺
            </button>
          )}
        </div>
      </FieldGroup>

      {/* Caption color picker */}
      <FieldGroup label="Caption Color">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="color"
            value={content.captionColor ?? "#9CA3AF"}
            onChange={(e) => updateContent({ captionColor: e.target.value })}
            style={{
              width: 30,
              height: 30,
              padding: 2,
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={content.captionColor ?? "#9CA3AF"}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateContent({ captionColor: v });
            }}
            style={{
              flex: 1,
              fontSize: 11,
              padding: "4px 6px",
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              fontFamily: "monospace",
              color: "#374151",
            }}
          />
          {content.captionColor && (
            <button
              onClick={() => updateContent({ captionColor: null })}
              title="Reset to default"
              style={{ fontSize: 14, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}
            >
              ↺
            </button>
          )}
        </div>
      </FieldGroup>

      {/* ── Logo controls ─────────────────────────────────────────────── */}

      {/* Logo variant — light or dark */}
      <FieldGroup label="Logo Variant">
        <div style={{ display: "flex", gap: 4 }}>
          {(["light", "dark"] as const).map((v) => {
            const active = (content.logoVariant ?? "light") === v;
            return (
              <button
                key={v}
                onClick={() => updateContent({ logoVariant: v })}
                style={{
                  flex: 1,
                  fontSize: 11,
                  padding: "4px 0",
                  background: active ? branding.accentColor : "#F3F4F6",
                  color: active ? "#fff" : "#374151",
                  border: `1px solid ${active ? branding.accentColor : "#D1D5DB"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                  textTransform: "capitalize",
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      {/* Logo size slider */}
      <FieldGroup label="Logo Size">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min={0.5}
            max={8.0}
            step={0.05}
            value={content.logoSize ?? 4.0}
            onChange={(e) => updateContent({ logoSize: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: branding.accentColor, cursor: "pointer" }}
          />
          <span style={{ fontSize: 10, color: "#6B7280", minWidth: 32, textAlign: "right" }}>
            {(content.logoSize ?? 4.0).toFixed(2)}×
          </span>
        </div>
      </FieldGroup>

      {/* Logo position — X */}
      <FieldGroup label="Logo Position">
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>← Left / Right →</span>
            <span style={{ fontSize: 10, color: "#6B7280" }}>
              {Math.round((content.logoX ?? 0.85) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((content.logoX ?? 0.85) * 100)}
            onChange={(e) => updateContent({ logoX: Number(e.target.value) / 100 })}
            style={{ width: "100%", accentColor: branding.accentColor, cursor: "pointer" }}
          />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>↑ Top / Bottom ↓</span>
            <span style={{ fontSize: 10, color: "#6B7280" }}>
              {Math.round((content.logoY ?? 0.88) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((content.logoY ?? 0.88) * 100)}
            onChange={(e) => updateContent({ logoY: Number(e.target.value) / 100 })}
            style={{ width: "100%", accentColor: branding.accentColor, cursor: "pointer" }}
          />
        </div>
      </FieldGroup>

      {/* Room selector */}
      <FieldGroup label="Room / Section">
        {projectRoomsWithMedia.length === 0 ? (
          <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
            No rooms found for this project. Add rooms in the Media tab first.
          </p>
        ) : (
          <select
            value={content.roomId ?? ""}
            onChange={(e) => handleRoomChange(e.target.value)}
            style={{
              width: "100%",
              fontSize: 12,
              padding: "5px 8px",
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              background: "#fff",
              color: content.roomId ? "#111827" : "#9CA3AF",
              outline: "none",
            }}
          >
            <option value="">— Select a room —</option>
            {projectRoomsWithMedia.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        )}
      </FieldGroup>

      {/* Caption */}
      <FieldGroup label="Caption (optional)">
        <TextInput
          value={content.caption ?? ""}
          onChange={(v) => updateContent({ caption: v || null })}
          placeholder="e.g. Full bath renovation — primary suite"
        />
      </FieldGroup>

      {/* Media selectors — only when a room is chosen */}
      {selectedRoom ? (
        <>
          <Divider />

          {/* Before images */}
          <SectionLabel>Before Photo</SectionLabel>
          {selectedRoom.beforeMedia.length === 0 ? (
            <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, marginBottom: 10 }}>
              No uploaded photos for this room. Upload in the Media tab.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 4,
                marginBottom: 10,
              }}
            >
              {selectedRoom.beforeMedia.map((m) => {
                const active = content.beforeMediaId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => selectBefore(m)}
                    title={m.caption ?? "Select as before"}
                    style={{
                      padding: 0,
                      border: `2px solid ${active ? branding.accentColor : "transparent"}`,
                      borderRadius: 4,
                      overflow: "hidden",
                      aspectRatio: "4/3",
                      cursor: "pointer",
                      background: "#E8E6E3",
                      position: "relative",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {active && (
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          background: branding.accentColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 7,
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* After / render images */}
          <SectionLabel>After / Render</SectionLabel>
          {selectedRoom.renderMedia.length === 0 ? (
            <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, marginBottom: 10 }}>
              No completed renders for this room. Generate renders in the Media tab.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 4,
                marginBottom: 6,
              }}
            >
              {selectedRoom.renderMedia.map((m) => {
                const active = content.afterMediaId === m.id;
                const isProposalSelected = m.id === selectedRoom.selectedRenderMediaId;
                return (
                  <button
                    key={m.id}
                    onClick={() => selectAfter(m)}
                    title={
                      isProposalSelected
                        ? "Proposal-selected render — click to use"
                        : m.caption ?? "Select as after"
                    }
                    style={{
                      padding: 0,
                      border: `2px solid ${active ? branding.accentColor : isProposalSelected ? `${branding.accentColor}60` : "transparent"}`,
                      borderRadius: 4,
                      overflow: "hidden",
                      aspectRatio: "4/3",
                      cursor: "pointer",
                      background: "#E8E6E3",
                      position: "relative",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {/* Active checkmark */}
                    {active && (
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          background: branding.accentColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 7,
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </span>
                    )}
                    {/* Star badge — proposal-selected */}
                    {isProposalSelected && !active && (
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: 2,
                          fontSize: 9,
                          lineHeight: 1,
                        }}
                        title="Proposal-selected render"
                      >
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: 10, color: "#C4C0BB", lineHeight: 1.4, marginBottom: 4 }}>
            ★ = proposal-selected render from the Media tab.
          </p>
        </>
      ) : (
        content.roomId == null && projectRoomsWithMedia.length > 0 ? (
          <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5, marginTop: 4 }}>
            Select a room above to choose before and after images.
          </p>
        ) : null
      )}
    </>
  );
}

// ─── Scope Breakdown Inspector ───────────────────────────────────────────────

function ScopeBreakdownInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ScopeBreakdownContent;
  const rooms = content.rooms ?? [];
  const photos = content.photos ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const MAX_PHOTOS = 4;

  function updateContent(patch: Partial<ScopeBreakdownContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function updateRoom(id: string, patch: Partial<ScopeBreakdownRoom>) {
    updateContent({ rooms: rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function handlePickerSelect(items: LibraryMediaItem[]) {
    const selected: ScopeOverviewSelectedPhoto[] = items
      .slice(0, MAX_PHOTOS)
      .map((item) => ({ id: item.id, url: item.url, thumbnailUrl: item.thumbnailUrl }));
    updateContent({ photos: selected });
    setPickerOpen(false);
  }

  function removePhoto(id: string) {
    updateContent({ photos: photos.filter((p) => p.id !== id) });
  }

  const visibleCount = rooms.filter((r) => r.isIncluded).length;

  return (
    <>
      <SectionLabel>Content</SectionLabel>

      <FieldGroup label="Title">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="Additional Areas Included"
        />
      </FieldGroup>

      <FieldGroup label="Intro Text">
        <TextArea
          value={content.introText ?? ""}
          onChange={(v) => updateContent({ introText: v || null })}
          placeholder="These spaces are included in the project…"
          rows={3}
        />
      </FieldGroup>

      <Divider />

      {/* ── Room list ────────────────────────────────────────────────── */}
      <SectionLabel>Sections</SectionLabel>

      {rooms.length === 0 ? (
        <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
          No sections yet. Use{" "}
          <strong style={{ color: "#6B7280" }}>⚡ Auto-Fill → Auto Build Scope Breakdown</strong>{" "}
          to populate from project sections.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 10, color: "#C4C0BB", marginBottom: 8, lineHeight: 1.4 }}>
            {visibleCount} of {rooms.length} section
            {rooms.length !== 1 ? "s" : ""} visible
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  background: room.isIncluded ? "#F3F4F6" : "#F9F9F8",
                  border: `1px solid ${room.isIncluded ? "#D1D5DB" : "#E5E7EB"}`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  opacity: room.isIncluded ? 1 : 0.55,
                  transition: "opacity 0.15s",
                }}
              >
                {/* Toggle row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: room.isIncluded ? 6 : 0,
                    cursor: "pointer",
                  }}
                  onClick={() => updateRoom(room.id, { isIncluded: !room.isIncluded })}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: room.isIncluded ? branding.accentColor : "transparent",
                      border: `1.5px solid ${room.isIncluded ? branding.accentColor : "#D1D5DB"}`,
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#374151",
                      lineHeight: 1.3,
                      flex: 1,
                    }}
                  >
                    {room.name}
                  </span>
                </div>

                {/* Description textarea — only shown when included */}
                {room.isIncluded && (
                  <TextArea
                    value={room.description}
                    onChange={(v) => updateRoom(room.id, { description: v })}
                    placeholder="Short description of this area's scope…"
                    rows={2}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Divider />

      {/* ── Supporting photos ────────────────────────────────────────── */}
      <SectionLabel>Supporting Photos</SectionLabel>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.5 }}>
        Optional. Up to 4 photos shown as a strip at the bottom.
      </p>

      {photos.length > 0 && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}
        >
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              style={{
                position: "relative",
                aspectRatio: "16 / 9",
                borderRadius: 4,
                overflow: "hidden",
                background: "#E8E6E3",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbnailUrl ?? photo.url}
                alt={`Photo ${idx + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <button
                onClick={() => removePhoto(photo.id)}
                title="Remove"
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.60)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
              <span
                style={{
                  position: "absolute",
                  bottom: 3,
                  left: 4,
                  fontSize: 8,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          width: "100%",
          padding: "7px 10px",
          background:
            photos.length > 0 ? "#F3F4F6" : branding.accentColor + "18",
          color: photos.length > 0 ? "#374151" : branding.textColor,
          border: `1px solid ${photos.length > 0 ? "#D1D5DB" : branding.accentColor}`,
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          textAlign: "center" as const,
          marginBottom: 4,
        }}
      >
        {photos.length === 0
          ? "Add Photos"
          : `Change Photos (${photos.length}/${MAX_PHOTOS})`}
      </button>

      <LibraryMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        multiple
        includeUnapproved
      />
    </>
  );
}

// ─── Risk Brief Inspector ─────────────────────────────────────────────────────

function RiskBriefInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as RiskBriefContent;

  function updateContent(patch: Partial<RiskBriefContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const isComparisonTable = slide.layoutKey === "comparison-table";

  function updateBullet(side: "leftBullets" | "rightBullets", index: number, value: string) {
    const current = (content[side] ?? ["", "", ""]).slice();
    while (current.length < 3) current.push("");
    current[index] = value;
    updateContent({ [side]: current });
  }

  function updateRowLabel(index: number, value: string) {
    const current = (content.rowLabels ?? ["", "", ""]).slice();
    while (current.length < 3) current.push("");
    current[index] = value;
    updateContent({ rowLabels: current });
  }

  const leftBullets  = (content.leftBullets  ?? ["", "", ""]).concat(Array(3).fill("")).slice(0, 3);
  const rightBullets = (content.rightBullets ?? ["", "", ""]).concat(Array(3).fill("")).slice(0, 3);
  const rowLabels    = (content.rowLabels    ?? ["", "", ""]).concat(Array(3).fill("")).slice(0, 3);

  /** Reusable colour picker row */
  function ColorRow({ value, defaultVal, onChangeFn, onReset }: {
    value: string | null | undefined;
    defaultVal: string;
    onChangeFn: (v: string) => void;
    onReset?: () => void;
  }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value ?? defaultVal} onChange={(e) => onChangeFn(e.target.value)}
          style={{ width: 36, height: 28, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
          {value ?? "(default)"}
        </span>
        {value && onReset && (
          <button onClick={onReset}
            style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
            Reset
          </button>
        )}
      </div>
    );
  }

  /** Reusable outline picker: None button + colour picker */
  function OutlineRow({ value, onChangeFn }: {
    value: string | null | undefined;
    onChangeFn: (v: string | null) => void;
  }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => onChangeFn(null)}
          style={{
            fontSize: 11, padding: "3px 10px",
            background: !value ? branding.accentColor : "#F3F4F6",
            color: !value ? "#fff" : "#374151",
            border: `1px solid ${!value ? branding.accentColor : "#D1D5DB"}`,
            borderRadius: 4, cursor: "pointer", fontWeight: !value ? 600 : 400,
          }}>
          None
        </button>
        <input type="color" value={value ?? "#ffffff"}
          onChange={(e) => onChangeFn(e.target.value)}
          style={{ width: 32, height: 26, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
          {value ?? "None"}
        </span>
      </div>
    );
  }

  return (
    <>
      {/* ── Title ────────────────────────────────────────────────────────── */}
      <SectionLabel>Title</SectionLabel>

      <FieldGroup label="Title">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder={isComparisonTable ? "Diagnostic Matrix: The Traditional Model vs. HHI" : "The Stress-Free Remodel: How We Eliminate Common Risks"}
        />
      </FieldGroup>

      <FieldGroup label={`Title Size — ${(content.titleSize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.titleSize ?? 1.5}
          onChange={(e) => updateContent({ titleSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Title Text Color">
        <ColorRow value={content.titleColor}
          defaultVal={isComparisonTable ? "#FFFFFF" : branding.textColor}
          onChangeFn={(v) => updateContent({ titleColor: v })}
          onReset={() => updateContent({ titleColor: null })} />
      </FieldGroup>

      <FieldGroup label="Title Text Outline">
        <OutlineRow value={content.titleTextOutline}
          onChangeFn={(v) => updateContent({ titleTextOutline: v })} />
      </FieldGroup>

      <Divider />

      {/* ── Left Column ───────────────────────────────────────────────────── */}
      <SectionLabel>Left Column</SectionLabel>

      <FieldGroup label="Left Column Header">
        <TextInput value={content.leftHeader ?? ""}
          onChange={(v) => updateContent({ leftHeader: v || null })}
          placeholder={isComparisonTable ? "Traditional Contracting" : "Why Remodels Go Wrong"} />
      </FieldGroup>
      {[0, 1, 2].map((i) => (
        <FieldGroup key={i} label={`Left Bullet ${i + 1}`}>
          <TextArea value={leftBullets[i]}
            onChange={(v) => updateBullet("leftBullets", i, v)}
            placeholder={`Problem bullet ${i + 1}…`} rows={2} />
        </FieldGroup>
      ))}
      <FieldGroup label="Left Box Color">
        <ColorRow value={content.leftBoxColor} defaultVal="#0D1B2A"
          onChangeFn={(v) => updateContent({ leftBoxColor: v })}
          onReset={() => updateContent({ leftBoxColor: null })} />
      </FieldGroup>

      <Divider />

      {/* ── Right Column ─────────────────────────────────────────────────── */}
      <SectionLabel>Right Column</SectionLabel>

      <FieldGroup label="Right Column Header">
        <TextInput value={content.rightHeader ?? ""}
          onChange={(v) => updateContent({ rightHeader: v || null })}
          placeholder={isComparisonTable ? "HHI Design-Build" : "How We Prevent That"} />
      </FieldGroup>
      {[0, 1, 2].map((i) => (
        <FieldGroup key={i} label={`Right Bullet ${i + 1}`}>
          <TextArea value={rightBullets[i]}
            onChange={(v) => updateBullet("rightBullets", i, v)}
            placeholder={`Solution bullet ${i + 1}…`} rows={2} />
        </FieldGroup>
      ))}
      <FieldGroup label="Right Box Color">
        <ColorRow value={content.rightBoxColor} defaultVal={branding.accentColor}
          onChangeFn={(v) => updateContent({ rightBoxColor: v })}
          onReset={() => updateContent({ rightBoxColor: null })} />
      </FieldGroup>

      <Divider />

      {/* ── Box Header ───────────────────────────────────────────────────── */}
      <SectionLabel>Box Header</SectionLabel>

      <FieldGroup label={`Box Header Size — ${(content.headerSize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.headerSize ?? 1.5}
          onChange={(e) => updateContent({ headerSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Box Header Text Color">
        <ColorRow value={content.headerTextColor} defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ headerTextColor: v })}
          onReset={() => updateContent({ headerTextColor: null })} />
      </FieldGroup>

      <FieldGroup label="Box Header Text Outline">
        <OutlineRow value={content.headerTextOutline}
          onChangeFn={(v) => updateContent({ headerTextOutline: v })} />
      </FieldGroup>

      <Divider />

      {/* ── Row Labels (comparison-table only) ───────────────────────────── */}
      <SectionLabel>Row Labels</SectionLabel>
      {!isComparisonTable && (
        <p style={{ fontSize: 10, color: "#C4C0BB", marginBottom: 8, lineHeight: 1.4 }}>
          Only applies to the Comparison Matrix layout.
        </p>
      )}

      <FieldGroup label="Show Row Labels">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => updateContent({ showRowLabels: !content.showRowLabels })}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: content.showRowLabels ? branding.accentColor : "#D1D5DB",
              border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: content.showRowLabels ? 21 : 3,
              width: 16, height: 16, borderRadius: "50%",
              background: "#fff", transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            {content.showRowLabels ? "On" : "Off"}
          </span>
        </div>
      </FieldGroup>

      {content.showRowLabels && (
        <>
          {[0, 1, 2].map((i) => (
            <FieldGroup key={i} label={`Row ${i + 1} Label`}>
              <TextInput value={rowLabels[i]}
                onChange={(v) => updateRowLabel(i, v)}
                placeholder={["Accountability", "Budgeting", "Design"][i] ?? `Row ${i + 1}`} />
            </FieldGroup>
          ))}
        </>
      )}

      <Divider />

      {/* ── Box Body ─────────────────────────────────────────────────────── */}
      <SectionLabel>Box Body</SectionLabel>

      <FieldGroup label={`Box Body Size — ${(content.bodySize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.bodySize ?? 1.5}
          onChange={(e) => updateContent({ bodySize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Box Body Text Color">
        <ColorRow value={content.bodyTextColor} defaultVal="#ffffff"
          onChangeFn={(v) => updateContent({ bodyTextColor: v })}
          onReset={() => updateContent({ bodyTextColor: null })} />
      </FieldGroup>

      <FieldGroup label="Box Body Text Outline">
        <OutlineRow value={content.bodyTextOutline}
          onChangeFn={(v) => updateContent({ bodyTextOutline: v })} />
      </FieldGroup>

      <Divider />

      {/* ── Box Colors ───────────────────────────────────────────────────── */}
      <SectionLabel>Box Colors</SectionLabel>

      <FieldGroup label="Left Column Color">
        <ColorRow value={content.leftBoxColor} defaultVal="#0D1B2A"
          onChangeFn={(v) => updateContent({ leftBoxColor: v })}
          onReset={() => updateContent({ leftBoxColor: null })} />
      </FieldGroup>

      <FieldGroup label="Right Column Color">
        <ColorRow value={content.rightBoxColor} defaultVal={branding.accentColor}
          onChangeFn={(v) => updateContent({ rightBoxColor: v })}
          onReset={() => updateContent({ rightBoxColor: null })} />
      </FieldGroup>

      <Divider />

      {/* ── Box Icons ────────────────────────────────────────────────────── */}
      <SectionLabel>Box Icons</SectionLabel>

      <FieldGroup label="Cross ✕ Color">
        <ColorRow
          value={content.crossColor}
          defaultVal="#9CA3AF"
          onChangeFn={(v) => updateContent({ crossColor: v })}
          onReset={() => updateContent({ crossColor: null })}
        />
      </FieldGroup>

      <FieldGroup label="Check ✓ Color">
        <ColorRow
          value={content.checkColor}
          defaultVal={branding.accentColor}
          onChangeFn={(v) => updateContent({ checkColor: v })}
          onReset={() => updateContent({ checkColor: null })}
        />
      </FieldGroup>

      <FieldGroup label={`Icon Size — ${(content.iconSize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.iconSize ?? 1.5}
          onChange={(e) => updateContent({ iconSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Icon Outline">
        <OutlineRow
          value={content.iconOutline}
          onChangeFn={(v) => updateContent({ iconOutline: v })}
        />
      </FieldGroup>

      <Divider />

      {/* ── Bottom Statement ─────────────────────────────────────────────── */}
      <SectionLabel>Bottom Statement</SectionLabel>

      <FieldGroup label="Bottom Statement">
        <TextArea value={content.bottomStatement ?? ""}
          onChange={(v) => updateContent({ bottomStatement: v || null })}
          placeholder="A clear plan, a defined budget, and no surprises during construction."
          rows={3} />
      </FieldGroup>

      <FieldGroup label={`Bottom Statement Size — ${(content.bottomSize ?? 1.5).toFixed(1)}×`}>
        <input type="range" min={0.5} max={3.0} step={0.05}
          value={content.bottomSize ?? 1.5}
          onChange={(e) => updateContent({ bottomSize: parseFloat(e.target.value) })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
          <span>0.5×</span><span>1.5×</span><span>3.0×</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Bottom Statement Color">
        <ColorRow value={content.bottomColor} defaultVal={branding.accentColor}
          onChangeFn={(v) => updateContent({ bottomColor: v })}
          onReset={() => updateContent({ bottomColor: null })} />
      </FieldGroup>

      <FieldGroup label="Bottom Statement Outline">
        <OutlineRow value={content.bottomTextOutline}
          onChangeFn={(v) => updateContent({ bottomTextOutline: v })} />
      </FieldGroup>
    </>
  );
}

// ─── Process Inspector ───────────────────────────────────────────────────────

function ProcessInspector({
  slide,
  onUpdate,
}: {
  slide: ProposalSlide;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = ((slide.content ?? {}) as ProcessContent);
  const stages = content.stages ?? [
    { name: "Discovery & Design", bullets: ["", "", ""] },
    { name: "Plan & Select",      bullets: ["", "", ""] },
    { name: "Build & Deliver",    bullets: ["", "", ""] },
  ];

  function updateContent(patch: Partial<ProcessContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function updateStage(stageIdx: number, patch: Partial<{ name: string; bullets: string[] }>) {
    const updated = stages.map((s, i) =>
      i === stageIdx ? { ...s, ...patch } : s
    );
    updateContent({ stages: updated });
  }

  function updateBullet(stageIdx: number, bulletIdx: number, value: string) {
    const bullets = [...(stages[stageIdx]?.bullets ?? [])];
    bullets[bulletIdx] = value;
    updateStage(stageIdx, { bullets });
  }

  return (
    <>
      <SectionLabel>Slide Title</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Our Process: From Vision to Finished Home"
        />
      </FieldGroup>

      <Divider />

      {stages.map((stage, si) => (
        <div key={si} style={{ marginBottom: 16 }}>
          <SectionLabel>Stage {si + 1}</SectionLabel>
          <FieldGroup label="Name">
            <TextInput
              value={stage.name}
              onChange={(v) => updateStage(si, { name: v })}
              placeholder={["Discovery & Design", "Plan & Select", "Build & Deliver"][si] ?? `Stage ${si + 1}`}
            />
          </FieldGroup>
          {(stage.bullets ?? []).map((b, bi) => (
            <FieldGroup key={bi} label={`Bullet ${bi + 1}`}>
              <TextArea
                value={b}
                onChange={(v) => updateBullet(si, bi, v)}
                placeholder=""
                rows={2}
              />
            </FieldGroup>
          ))}
        </div>
      ))}

      <Divider />

      <FieldGroup label="Bottom Statement">
        <TextArea
          value={content.bottomStatement ?? ""}
          onChange={(v) => updateContent({ bottomStatement: v || null })}
          placeholder="Every detail is planned before we break ground—so the build stays on schedule, on budget, and free of surprises."
          rows={3}
        />
      </FieldGroup>
    </>
  );
}

// ─── Background + Text Zone Section ─────────────────────────────────────────

function BackgroundSection({
  slide,
  branding,
  brandBackgrounds = [],
  onBackgroundChange,
  onTextZoneChange,
  showTextZone = true,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  brandBackgrounds: BrandBackgroundForUI[];
  onBackgroundChange: (id: string | null) => void;
  onTextZoneChange: (zone: TextZoneSetting | null) => void;
  showTextZone?: boolean;
}) {
  const selectedBg = brandBackgrounds.find((b) => b.id === slide.backgroundId) ?? null;
  const zone = slide.textZone ?? null;
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<TextZoneSuggestion | null>(
    (selectedBg?.textZoneSuggestion as TextZoneSuggestion | null | undefined) ?? null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const pickerPortalRef = useRef<HTMLDivElement>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  // When opening picker, capture the Change button's viewport position for portal placement
  function openPicker() {
    if (changeButtonRef.current) {
      const r = changeButtonRef.current.getBoundingClientRect();
      setPickerAnchor({ top: r.bottom + 4, left: r.left, width: Math.max(r.width + 60, 220) });
    }
    setPickerOpen(true);
  }

  // Close picker on outside click — use "click" (not "mousedown") so the picker
  // item's onClick fires BEFORE this handler closes the portal.
  useEffect(() => {
    if (!pickerOpen) return;
    function handleOutside(e: MouseEvent) {
      if (changeButtonRef.current && changeButtonRef.current.contains(e.target as Node)) return;
      if (pickerPortalRef.current && pickerPortalRef.current.contains(e.target as Node)) return;
      setPickerOpen(false);
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, [pickerOpen]);

  // Fetch zone suggestion when backgroundId changes — only for slides that use text zones
  useEffect(() => {
    if (!showTextZone) return;
    if (!slide.backgroundId) {
      setSuggestion(null);
      return;
    }
    // If the selected background already has a cached suggestion, use it
    if (selectedBg?.textZoneSuggestion) {
      setSuggestion(selectedBg.textZoneSuggestion as TextZoneSuggestion);
      return;
    }
    // Otherwise analyze
    setAnalyzing(true);
    analyzeBackgroundTextZoneAction(slide.backgroundId).then((result) => {
      setAnalyzing(false);
      if (result.ok) setSuggestion(result.zone);
    }).catch(() => setAnalyzing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.backgroundId, showTextZone]);

  function handleSelectBackground(bgId: string | null) {
    onBackgroundChange(bgId);
    if (!bgId) {
      onTextZoneChange(null);
      return;
    }
    if (!showTextZone) return;
    // If zone suggestion is already available, seed the text zone from it
    const bg = brandBackgrounds.find((b) => b.id === bgId);
    const sug = (bg?.textZoneSuggestion as TextZoneSuggestion | null | undefined) ?? null;
    if (sug) {
      onTextZoneChange({
        x: sug.x, y: sug.y, width: sug.width, height: sug.height,
        padding: sug.padding, textAlign: sug.textAlign,
        textColor: sug.recommendedTextColor,
        isManualOverride: false,
      });
    }
  }

  function applyZoneSuggestion(sug: TextZoneSuggestion) {
    onTextZoneChange({
      x: sug.x, y: sug.y, width: sug.width, height: sug.height,
      padding: sug.padding, textAlign: sug.textAlign,
      textColor: sug.recommendedTextColor,
      isManualOverride: false,
    });
  }

  function updateZone(patch: Partial<TextZoneSetting>) {
    if (!zone) return;
    onTextZoneChange({ ...zone, ...patch, isManualOverride: true });
  }

  const confidenceColor = !suggestion ? "#9CA3AF"
    : suggestion.confidence >= 0.85 ? "#10B981"
    : suggestion.confidence >= 0.70 ? "#F59E0B"
    : "#F97316";

  return (
    <>
      <SectionLabel>Background</SectionLabel>

      {/* Current background preview + change button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 56,
            height: 32,
            borderRadius: 3,
            overflow: "hidden",
            background: "#E5E7EB",
            flexShrink: 0,
          }}
        >
          {selectedBg?.previewImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedBg.previewImageUrl}
              alt={selectedBg.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: selectedBg?.baseColorHex ?? "#F3F4F6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!selectedBg && (
                <span style={{ fontSize: 8, color: "#9CA3AF" }}>None</span>
              )}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: "#374151", fontWeight: 500, marginBottom: 2 }} className="truncate">
            {selectedBg?.name ?? "No background"}
          </p>
          <button
            ref={changeButtonRef}
            onClick={openPicker}
            style={{
              fontSize: 10,
              padding: "2px 7px",
              background: "#F3F4F6",
              color: "#374151",
              border: "1px solid #D1D5DB",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Change
          </button>
          {selectedBg && (
            <button
              onClick={() => { onBackgroundChange(null); onTextZoneChange(null); }}
              style={{
                fontSize: 10,
                padding: "2px 7px",
                background: "transparent",
                color: "#9CA3AF",
                border: "none",
                cursor: "pointer",
                marginLeft: 4,
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Background picker — rendered as a portal so overflow:auto on the
          inspector aside cannot clip it. Anchored to the Change button. */}
      {pickerOpen && pickerAnchor && typeof document !== "undefined" && createPortal(
        <div
          ref={pickerPortalRef}
          style={{
            position: "fixed",
            top: pickerAnchor.top,
            left: pickerAnchor.left,
            width: pickerAnchor.width,
            maxHeight: 240,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            zIndex: 9999,
          }}
        >
          {brandBackgrounds.length === 0 ? (
            <p style={{ fontSize: 11, color: "#9CA3AF", padding: "10px 12px" }}>
              No backgrounds available. Add some in Settings → Branding.
            </p>
          ) : (
            <>
              <button
                onClick={() => { handleSelectBackground(null); setPickerOpen(false); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  background: !slide.backgroundId ? `${branding.accentColor}12` : "transparent",
                  border: "none",
                  borderBottom: "1px solid #F3F4F6",
                  cursor: "pointer",
                  textAlign: "left" as const,
                }}
              >
                <span style={{ fontSize: 11, color: "#6B7280" }}>— None —</span>
              </button>
              {brandBackgrounds.map((bg) => {
                const isActive = bg.id === slide.backgroundId;
                return (
                  <button
                    key={bg.id}
                    onClick={() => { handleSelectBackground(bg.id); setPickerOpen(false); }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: isActive ? `${branding.accentColor}12` : "transparent",
                      border: "none",
                      borderBottom: "1px solid #F9F9F8",
                      cursor: "pointer",
                      textAlign: "left" as const,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 24,
                        borderRadius: 2,
                        overflow: "hidden",
                        flexShrink: 0,
                        background: bg.baseColorHex ?? "#E5E7EB",
                      }}
                    >
                      {bg.previewImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bg.previewImageUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: isActive ? branding.textColor : "#374151",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {bg.name}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>,
        document.body
      )}

      {/* Text Zone editor — only for slides that use zone positioning */}
      {showTextZone && slide.backgroundId && (
        <>
          <div style={{ height: 1, background: "#E5E3DF", margin: "8px 0" }} />
          <SectionLabel>Text Zone</SectionLabel>

          {/* Confidence + source indicator */}
          {suggestion && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: confidenceColor,
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 10, color: "#6B7280" }}>
                {Math.round(suggestion.confidence * 100)}% confidence
                {" · "}
                {suggestion.source === "derived" ? "derived from seed" : "AI vision"}
              </span>
            </div>
          )}

          {analyzing && (
            <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6 }}>Analyzing background…</p>
          )}

          {/* Apply AI suggestion button (when no zone override yet) */}
          {suggestion && !zone && (
            <button
              onClick={() => applyZoneSuggestion(suggestion)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: `${branding.accentColor}18`,
                color: branding.textColor,
                border: `1px solid ${branding.accentColor}`,
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Apply AI Suggestion
            </button>
          )}

          {/* Zone sliders */}
          {zone && (
            <div>
              {/* AI/Manual indicator */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: zone.isManualOverride ? "#F59E0B" : "#10B981" }}>
                  {zone.isManualOverride ? "Manual override" : "AI suggestion applied"}
                </span>
                {zone.isManualOverride && suggestion && (
                  <button
                    onClick={() => applyZoneSuggestion(suggestion)}
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      background: "transparent",
                      color: "#6B7280",
                      border: "1px solid #E5E7EB",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                    title="Reset to AI suggestion"
                  >
                    ↺ Reset
                  </button>
                )}
              </div>

              {/* X slider */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: "#6B7280" }}>X</span>
                  <span style={{ fontSize: 10, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zone.x * 100)}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={80} step={1}
                  value={Math.round(zone.x * 100)}
                  onChange={(e) => updateZone({ x: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
              </div>

              {/* Y slider */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: "#6B7280" }}>Y</span>
                  <span style={{ fontSize: 10, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zone.y * 100)}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={80} step={1}
                  value={Math.round(zone.y * 100)}
                  onChange={(e) => updateZone({ y: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
              </div>

              {/* Width slider */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: "#6B7280" }}>Width</span>
                  <span style={{ fontSize: 10, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zone.width * 100)}%
                  </span>
                </div>
                <input
                  type="range" min={20} max={95} step={1}
                  value={Math.round(zone.width * 100)}
                  onChange={(e) => updateZone({ width: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
              </div>

              {/* Height slider */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: "#6B7280" }}>Height</span>
                  <span style={{ fontSize: 10, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(zone.height * 100)}%
                  </span>
                </div>
                <input
                  type="range" min={20} max={95} step={1}
                  value={Math.round(zone.height * 100)}
                  onChange={(e) => updateZone({ height: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
              </div>

              {/* Text color toggle */}
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 10, color: "#6B7280", display: "block", marginBottom: 3 }}>
                  Text Color
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["light", "dark"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => updateZone({ textColor: c })}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        fontSize: 11,
                        background: zone.textColor === c ? `${branding.accentColor}18` : "#F3F4F6",
                        color: zone.textColor === c ? branding.textColor : "#6B7280",
                        border: `1px solid ${zone.textColor === c ? branding.accentColor : "#E5E7EB"}`,
                        borderRadius: 3,
                        cursor: "pointer",
                        fontWeight: zone.textColor === c ? 600 : 400,
                        textTransform: "capitalize",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text align toggle */}
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 10, color: "#6B7280", display: "block", marginBottom: 3 }}>
                  Text Align
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => updateZone({ textAlign: a })}
                      style={{
                        flex: 1,
                        padding: "4px 4px",
                        fontSize: 10,
                        background: zone.textAlign === a ? `${branding.accentColor}18` : "#F3F4F6",
                        color: zone.textAlign === a ? branding.textColor : "#6B7280",
                        border: `1px solid ${zone.textAlign === a ? branding.accentColor : "#E5E7EB"}`,
                        borderRadius: 3,
                        cursor: "pointer",
                        fontWeight: zone.textAlign === a ? 600 : 400,
                        textTransform: "capitalize",
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remove zone */}
              <button
                onClick={() => onTextZoneChange(null)}
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  background: "transparent",
                  color: "#9CA3AF",
                  border: "1px solid #E5E7EB",
                  borderRadius: 3,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Clear Text Zone
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Main Inspector ──────────────────────────────────────────────────────────

export function InspectorPanel({
  slide,
  branding,
  onUpdate,
  onDuplicate,
  onRemove,
  onToggleEnabled,
  projectRoomsWithMedia = [],
  brandBackgrounds = [],
  onBackgroundChange,
  onTextZoneChange,
}: Props) {
  if (!slide) {
    return (
      <aside
        className="flex flex-col items-center justify-center"
        style={{
          width: 260,
          minWidth: 260,
          background: "#F9F8F6",
          borderLeft: "1px solid #E5E3DF",
          padding: 20,
        }}
      >
        <p className="text-xs text-zinc-400 text-center">
          Select a slide to inspect
        </p>
      </aside>
    );
  }

  const layouts = getLayoutsForType(slide.type);

  return (
    <aside
      className="flex flex-col overflow-y-auto"
      style={{
        width: 260,
        minWidth: 260,
        background: "#F9F8F6",
        borderLeft: "1px solid #E5E3DF",
        padding: "16px 14px",
      }}
    >
      {/* Slide identity */}
      <div style={{ marginBottom: 12 }}>
        <p
          className="font-semibold"
          style={{ fontSize: 13, color: "#111827", marginBottom: 2 }}
        >
          {SLIDE_TYPE_LABELS[slide.type]} Slide
        </p>
        <p style={{ fontSize: 10, color: "#9CA3AF" }}>
          Slide #{slide.order + 1} · {slide.layoutKey}
        </p>
      </div>

      <Divider />

      {/* Visibility */}
      <SectionLabel>Visibility</SectionLabel>
      <button
        onClick={() => onToggleEnabled(slide.id)}
        className="rounded font-medium"
        style={{
          fontSize: 12,
          padding: "6px 10px",
          background: slide.isEnabled ? "#ECFDF5" : "#F3F4F6",
          color: slide.isEnabled ? "#059669" : "#6B7280",
          border: `1px solid ${slide.isEnabled ? "#A7F3D0" : "#E5E7EB"}`,
          cursor: "pointer",
          marginBottom: 12,
          width: "100%",
          textAlign: "left",
        }}
      >
        {slide.isEnabled ? "✓ Visible" : "○ Hidden"}
      </button>

      {/* Layout selection */}
      <SectionLabel>Layout</SectionLabel>
      <div className="flex flex-col gap-1" style={{ marginBottom: 12 }}>
        {layouts.map((l) => (
          <button
            key={l.key}
            onClick={() => onUpdate({ ...slide, layoutKey: l.key })}
            className="rounded text-left"
            style={{
              fontSize: 12,
              padding: "5px 8px",
              background:
                slide.layoutKey === l.key ? branding.accentColor + "18" : "#F3F4F6",
              color:
                slide.layoutKey === l.key ? branding.textColor : "#6B7280",
              border: `1px solid ${
                slide.layoutKey === l.key ? branding.accentColor : "#E5E7EB"
              }`,
              cursor: "pointer",
              fontWeight: slide.layoutKey === l.key ? 600 : 400,
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      <Divider />

      {/* Background + Text Zone */}
      {onBackgroundChange && onTextZoneChange && slide.type !== "cover" && (
        <>
          <BackgroundSection
            slide={slide}
            branding={branding}
            brandBackgrounds={brandBackgrounds}
            onBackgroundChange={onBackgroundChange}
            onTextZoneChange={onTextZoneChange}
            showTextZone={slide.type !== "before-after" && slide.type !== "risk-brief" && slide.type !== "scope-overview" && slide.type !== "objective"}
          />
          <Divider />
        </>
      )}

      {/* Type-specific content editors */}
      {slide.type === "cover" && (
        <CoverInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "objective" && (
        <ObjectiveInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "investment" && (
        <InvestmentInspector slide={slide} />
      )}
      {slide.type === "why-us" && (
        <WhyUsInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "scope-overview" && (
        <ScopeOverviewInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "before-after" && (
        <BeforeAfterInspector
          slide={slide}
          branding={branding}
          onUpdate={onUpdate}
          projectRoomsWithMedia={projectRoomsWithMedia}
        />
      )}
      {slide.type === "scope-breakdown" && (
        <ScopeBreakdownInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "risk-brief" && (
        <RiskBriefInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "process" && (
        <ProcessInspector slide={slide} onUpdate={onUpdate} />
      )}

      <Divider />

      {/* Branding preview */}
      <SectionLabel>Branding</SectionLabel>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <div
          className="rounded-full flex-shrink-0"
          style={{
            width: 14,
            height: 14,
            background: branding.accentColor,
          }}
        />
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          Accent {branding.accentColor}
        </span>
      </div>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <div
          className="rounded-full flex-shrink-0"
          style={{
            width: 14,
            height: 14,
            background: branding.textColor,
          }}
        />
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          Text {branding.textColor}
        </span>
      </div>

      <Divider />

      {/* Actions */}
      <SectionLabel>Actions</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <ActionButton onClick={() => onDuplicate(slide.id)}>
          ⧉ Duplicate
        </ActionButton>
        <ActionButton onClick={() => onRemove(slide.id)} variant="danger">
          ✕ Remove
        </ActionButton>
      </div>
    </aside>
  );
}

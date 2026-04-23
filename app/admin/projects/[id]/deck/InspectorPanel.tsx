"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type {
  ProposalSlide,
  DeckBranding,
  SlideType,
  CoverContent,
  CoverLayoutKey,
  ObjectiveContent,
  InvestmentContent,
  WhyUsContent,
  WhyUsPillarItem,
  WhyUsTestimonial,
  ScopeOverviewContent,
  ScopeOverviewSelectedPhoto,
  BeforeAfterContent,
  RoomWithMedia,
  RoomMediaItem,
  ScopeBreakdownContent,
  ScopeBreakdownRoom,
  ScopeCategory,
  RiskBriefContent,
  ProcessContent,
  ProcessStage,
  CoreValuesContent,
  CoreValue,
  ProjectTimelineContent,
  ProjectPhase,
  CopePageContent,
  CopeItem,
  DesignRetainerContent,
  DesignRetainerBenefit,
  NextStepsContent,
  NextStep,
  ClosingSlideContent,
  VisualInspirationContent,
  ClientTestimonialsContent,
  SlideTestimonial,
  DesignBuildAdvantageContent,
  DesignBuildPillar,
  DesignBuildGuarantee,
  DesignBuildDiagramNode,
  DesignBuildSupportColumn,
  TextZoneSetting,
  TextZoneSuggestion,
  SharedSlideFields,
  AdditionOverviewContent,
  AdditionBullet,
  AdditionOverviewLayoutKey,
} from "@/app/lib/deck/types";
import {
  SLIDE_TYPE_LABELS,
  LOGO_DEFAULTS,
  getLayoutsForType,
  ADDITION_OVERVIEW_LAYOUTS,
  SCOPE_CATEGORIES,
  SCOPE_CATEGORY_LABELS,
} from "@/app/lib/deck/types";
import { HHI_DEFAULT_CORE_VALUES } from "@/app/lib/core-values-defaults";
import { HHI_DEFAULT_COPE_ITEMS } from "@/app/lib/cope-defaults";
import { DEFAULT_DESIGN_RETAINER_BENEFITS, HHI_DESIGN_RETAINER_DEFAULTS } from "@/app/lib/design-retainer-defaults";
import { HHI_DEFAULT_NEXT_STEPS, HHI_NEXT_STEPS_DEFAULTS } from "@/app/lib/next-steps-defaults";
import { CLOSING_SLIDE_DEFAULTS } from "@/app/lib/closing-slide-defaults";
import { TemplateCIconPicker, type TemplateCIcon } from "@/app/admin/components/template-c-icon-picker";
import { VISUAL_INSPIRATION_DEFAULTS } from "@/app/lib/visual-inspiration-defaults";
import { DEFAULT_TESTIMONIALS, TESTIMONIALS_SLIDE_DEFAULTS } from "@/app/lib/testimonial-defaults";
import { DEFAULT_PILLARS, DEFAULT_GUARANTEES, DEFAULT_DIAGRAM_NODES, DEFAULT_SUPPORT_COLUMNS } from "@/app/lib/design-build-defaults";
import { LibraryMediaPicker } from "@/app/admin/settings/photo-library/library-media-picker";
import type { LibraryMediaItem } from "@/app/admin/settings/photo-library/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { analyzeBackgroundTextZoneAction } from "@/app/admin/settings/branding/backgrounds/actions";
import { BrandingColorRow } from "@/components/ui/BrandingColorRow";
import { SLIDE_FONTS } from "@/app/lib/slide-constants";
import { SlideAIRegenerate } from "./SlideAIRegenerate";
import { getBrandBackgroundStyles } from "@/app/lib/brand-background-utils";
import { fetchProjectScopeOverviewAction, generateAdditionBulletsAction } from "./actions";

interface Props {
  slide: ProposalSlide | null;
  branding: DeckBranding;
  /** Project ID — passed to SlideAIRegenerate for the API call. */
  projectId: string;
  onUpdate: (updated: ProposalSlide) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleEnabled: (id: string) => void;
  /** Rooms with pre-resolved before/render media — powers BeforeAfterInspector. */
  projectRoomsWithMedia?: RoomWithMedia[];
  /** Project-level media (Front Page photos — roomId null). */
  projectLevelMedia?: RoomMediaItem[];
  /** All brand backgrounds for the background picker. */
  brandBackgrounds?: BrandBackgroundForUI[];
  /** Callback when user picks a background. */
  onBackgroundChange?: (backgroundId: string | null) => void;
  /** Callback when user edits the text zone. */
  onTextZoneChange?: (zone: TextZoneSetting | null) => void;
  /**
   * Callback for AI-generated background URL.
   * Must bypass updateSlide to avoid triggering isUserModified.
   * Pass null to clear the current AI background.
   */
  onAiBackgroundChange?: (url: string | null) => void;
  /**
   * Clears isUserModified on the investment slide and re-runs the full
   * server sync so fresh line items are pulled from the Investment tab.
   */
  onResyncInvestment?: () => void;
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

// ─── Per-field control helpers (module-level for stable React identity) ──────

/** Combined font list (headline + body, deduplicated) for dropdowns. */
const PF_ALL_FONTS = (() => {
  const all = [...SLIDE_FONTS.headline];
  for (const f of SLIDE_FONTS.body) {
    if (!all.some((h) => h.value === f.value)) all.push(f);
  }
  return all;
})();

const PF_SIZE_TICKS = ["XS", "S", "M", "L", "XL", "Display"];

function PFontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 4, background: "#fff", color: "#374151" }}>
      {PF_ALL_FONTS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
    </select>
  );
}

function PSizeSlider({ value, onChange, accentColor }: { value: number; onChange: (v: number) => void; accentColor: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="range" min={0.5} max={4.0} step={0.1} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor }} />
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        {PF_SIZE_TICKS.map((t) => (<span key={t} style={{ fontSize: 8, color: "#9CA3AF" }}>{t}</span>))}
      </div>
    </div>
  );
}

function PStyleButtons({ bold, italic, underline, onBold, onItalic, onUnderline }: {
  bold?: boolean | null; italic?: boolean | null; underline?: boolean | null;
  onBold: (v: boolean) => void; onItalic: (v: boolean) => void; onUnderline: (v: boolean) => void;
}) {
  const btnBase: React.CSSProperties = {
    width: 28, height: 28, fontSize: 13, cursor: "pointer", borderRadius: 4,
    display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", padding: 0,
  };
  function btnStyle(active: boolean): React.CSSProperties {
    return { ...btnBase, background: active ? "#1A2332" : "transparent", color: active ? "#fff" : "#374151",
      border: active ? "1px solid #1A2332" : "1px solid #D1D5DB", fontWeight: active ? 700 : 400 };
  }
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button style={{ ...btnStyle(!!bold), fontWeight: 700 }} onClick={() => onBold(!bold)}>B</button>
      <button style={{ ...btnStyle(!!italic), fontStyle: "italic" }} onClick={() => onItalic(!italic)}>I</button>
      <button style={{ ...btnStyle(!!underline), textDecoration: "underline" }} onClick={() => onUnderline(!underline)}>U</button>
    </div>
  );
}

function POutlineRow({ value, onChangeFn, accentColor }: {
  value: string | null | undefined;
  onChangeFn: (v: string | null) => void;
  accentColor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => onChangeFn(null)}
        style={{ fontSize: 11, padding: "3px 10px", background: !value ? accentColor : "#F3F4F6",
          color: !value ? "#fff" : "#374151", border: `1px solid ${!value ? accentColor : "#D1D5DB"}`,
          borderRadius: 4, cursor: "pointer", fontWeight: !value ? 600 : 400 }}>None</button>
      <input type="color" value={value ?? "#ffffff"} onChange={(e) => onChangeFn(e.target.value)}
        style={{ width: 32, height: 26, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2, background: "none" }} />
      <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{value ?? "None"}</span>
    </div>
  );
}

const PF_GROUP_DIVIDER = <div style={{ height: 1, background: "#E5E3DF", margin: "14px 0" }} />;

/** Checkbox toggle for "Lock all items to match first". */
function PLockItemStylesToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Lock all items to match first
    </label>
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

// ─── Shared editor controls ────────────────────────────────────────────────

/** Shared logo controls for all slide inspectors (Phase 3 — slider-based). */
function SharedLogoSection({
  content,
  updateContent,
  defaultShow,
  defaultX,
  defaultY,
  hidePosSliders,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
  defaultShow: boolean;
  defaultX?: number;
  defaultY?: number;
  hidePosSliders?: boolean;
}) {
  const logoOn = content.showLogo ?? defaultShow;
  const curX = content.logoX ?? (defaultX ?? 85);
  const curY = content.logoY ?? (defaultY ?? 88);
  const curSize = content.logoSize ?? 1.0;

  return (
    <>
      <Divider />
      <SectionLabel>Logo</SectionLabel>
      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={logoOn}
            onChange={(e) => updateContent({ showLogo: e.target.checked })}
          />
          Show Logo
        </label>
      </FieldGroup>
      {logoOn && (
        <>
          <FieldGroup label="Logo Variant">
            <div style={{ display: "flex", gap: 4 }}>
              {(["light", "dark"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => updateContent({ logoVariant: v })}
                  style={{
                    flex: 1, fontSize: 11, padding: "4px 8px", borderRadius: 4, cursor: "pointer",
                    background: (content.logoVariant ?? "light") === v ? "#1F2937" : "#F3F4F6",
                    color: (content.logoVariant ?? "light") === v ? "#fff" : "#374151",
                    border: `1px solid ${(content.logoVariant ?? "light") === v ? "#1F2937" : "#D1D5DB"}`,
                  }}
                >
                  {v === "light" ? "Light Background" : "Dark Background"}
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* Logo Size — continuous slider */}
          <FieldGroup label={`Logo Size — ${curSize.toFixed(1)}`}>
            <input
              type="range" min={0.5} max={4.0} step={0.1}
              value={curSize}
              onChange={(e) => updateContent({ logoSize: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>
              <span>S</span><span>M</span><span>L</span><span>XL</span>
            </div>
          </FieldGroup>

          {/* X / Y position sliders */}
          {!hidePosSliders && (
            <>
              <FieldGroup label={`Horizontal Position — ${curX}%`}>
                <input
                  type="range" min={0} max={100} step={1}
                  value={curX}
                  onChange={(e) => updateContent({ logoX: parseInt(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </FieldGroup>
              <FieldGroup label={`Vertical Position — ${curY}%`}>
                <input
                  type="range" min={0} max={100} step={1}
                  value={curY}
                  onChange={(e) => updateContent({ logoY: parseInt(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </FieldGroup>
              <button
                onClick={() => updateContent({ logoX: defaultX ?? 85, logoY: defaultY ?? 88 })}
                style={{
                  fontSize: 10, padding: "3px 8px", background: "transparent",
                  color: "#9CA3AF", border: "1px solid #E5E7EB", borderRadius: 3,
                  cursor: "pointer", marginBottom: 6,
                }}
              >
                Reset Position
              </button>
            </>
          )}
        </>
      )}
      <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
        Logo managed in{" "}
        <a href="/admin/settings/branding" target="_blank" rel="noopener noreferrer" style={{ color: "#6B7280", textDecoration: "underline" }}>
          Settings &rarr; Branding
        </a>
      </p>
    </>
  );
}

/** Shared accent color override for all slide inspectors. */
function SharedAccentColorSection({
  content,
  updateContent,
  branding,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
  branding: DeckBranding;
}) {
  return (
    <>
      <Divider />
      <SectionLabel>Accent Color</SectionLabel>
      <BrandingColorRow
        value={content.accentColor}
        defaultVal="#B8860B"
        branding={branding}
        onChange={(v) => updateContent({ accentColor: v })}
        onReset={() => updateContent({ accentColor: null })}
      />
    </>
  );
}

/** Shared typography controls for all slide inspectors (Phase 3). */
function SharedTypographySection({
  content,
  updateContent,
  branding,
  showSizeControls,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
  branding: DeckBranding;
  showSizeControls?: boolean;
}) {
  return (
    <>
      <Divider />
      <SectionLabel>Typography</SectionLabel>
      <FieldGroup label="Headline Font">
        <select
          value={content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(e) => updateContent({ headlineFont: e.target.value })}
          style={{ width: "100%", fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 4, background: "#fff", color: "#374151" }}
        >
          {SLIDE_FONTS.headline.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Body Font">
        <select
          value={content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(e) => updateContent({ bodyFont: e.target.value })}
          style={{ width: "100%", fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 4, background: "#fff", color: "#374151" }}
        >
          {SLIDE_FONTS.body.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </FieldGroup>
      {showSizeControls && (
        <>
          <FieldGroup label="Headline Size">
            <div style={{ display: "flex", gap: 3 }}>
              {(["small", "medium", "large", "display"] as const).map((s) => {
                const active = (content.headlineSizeScale ?? "medium") === s;
                return (
                  <button key={s} onClick={() => updateContent({ headlineSizeScale: s })} style={{
                    flex: 1, fontSize: 10, padding: "3px 4px", borderRadius: 3, cursor: "pointer",
                    background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                    border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
                  }}>
                    {s === "display" ? "Display" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </FieldGroup>
          <FieldGroup label="Headline Color">
            <BrandingColorRow
              value={content.headlineColor}
              defaultVal="#1B2A4A"
              branding={branding}
              onChange={(v) => updateContent({ headlineColor: v })}
              onReset={() => updateContent({ headlineColor: null })}
            />
          </FieldGroup>
          <FieldGroup label="Body Text Size">
            <div style={{ display: "flex", gap: 3 }}>
              {(["small", "medium", "large"] as const).map((s) => {
                const active = (content.bodySizeScale ?? "medium") === s;
                return (
                  <button key={s} onClick={() => updateContent({ bodySizeScale: s })} style={{
                    flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                    background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                    border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
                  }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </FieldGroup>
          <FieldGroup label="Body Text Color">
            <BrandingColorRow
              value={content.bodyColor}
              defaultVal="#4A5568"
              branding={branding}
              onChange={(v) => updateContent({ bodyColor: v })}
              onReset={() => updateContent({ bodyColor: null })}
            />
          </FieldGroup>
        </>
      )}
    </>
  );
}

/** Shared card style controls for card-based slides (Phase 3). */
function SharedCardStyleSection({
  content,
  updateContent,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
}) {
  return (
    <>
      <Divider />
      <SectionLabel>Card Style</SectionLabel>
      <FieldGroup label="Card Border">
        <div style={{ display: "flex", gap: 3 }}>
          {(["none", "subtle", "accent"] as const).map((v) => {
            const active = (content.cardBorderStyle ?? "none") === v;
            return (
              <button key={v} onClick={() => updateContent({ cardBorderStyle: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
      <FieldGroup label="Card Shadow">
        <div style={{ display: "flex", gap: 3 }}>
          {(["none", "subtle", "normal", "elevated"] as const).map((v) => {
            const active = (content.cardShadow ?? "normal") === v;
            return (
              <button key={v} onClick={() => updateContent({ cardShadow: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 4px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
      <FieldGroup label="Card Spacing">
        <div style={{ display: "flex", gap: 3 }}>
          {(["compact", "normal", "spacious"] as const).map((v) => {
            const active = (content.cardSpacing ?? "normal") === v;
            return (
              <button key={v} onClick={() => updateContent({ cardSpacing: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
    </>
  );
}

/** Shared overlay opacity controls for photo-capable slides (Phase 3). */
function SharedOverlaySection({
  content,
  updateContent,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
}) {
  const overlayOn = content.showOverlay ?? true;

  return (
    <>
      <Divider />
      <SectionLabel>Photo Overlay</SectionLabel>
      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={overlayOn}
            onChange={(e) => updateContent({ showOverlay: e.target.checked })}
          />
          Show Overlay
        </label>
      </FieldGroup>
      {overlayOn && (
        <FieldGroup label="Overlay Density">
          <div style={{ display: "flex", gap: 3 }}>
            {([{ label: "Light", value: 0.35 }, { label: "Medium", value: 0.55 }, { label: "Heavy", value: 0.75 }] as const).map((opt) => {
              const active = (content.overlayOpacity ?? 0.55) === opt.value;
              return (
                <button key={opt.label} onClick={() => updateContent({ overlayOpacity: opt.value })} style={{
                  flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                  background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                  border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`,
                }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </FieldGroup>
      )}
    </>
  );
}

/** Shared CTA controls for closing/retainer slides (Phase 3). */
function SharedCTASection({
  content,
  updateContent,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
}) {
  return (
    <>
      <Divider />
      <SectionLabel>CTA Options</SectionLabel>
      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={content.showContactInfo ?? true}
            onChange={(e) => updateContent({ showContactInfo: e.target.checked })}
          />
          Show Contact Info
        </label>
      </FieldGroup>
      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={content.showFooterNote ?? true}
            onChange={(e) => updateContent({ showFooterNote: e.target.checked })}
          />
          Show Footer Note
        </label>
      </FieldGroup>
    </>
  );
}

/** Shared text layout controls for editorial slides (Phase 3). */
function SharedTextLayoutSection({
  content,
  updateContent,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
}) {
  return (
    <>
      <Divider />
      <SectionLabel>Text Layout</SectionLabel>
      <FieldGroup label="Text Alignment">
        <div style={{ display: "flex", gap: 3 }}>
          {(["left", "center"] as const).map((v) => {
            const active = (content.textAlignment ?? "left") === v;
            return (
              <button key={v} onClick={() => updateContent({ textAlignment: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
      <FieldGroup label="Line Spacing">
        <div style={{ display: "flex", gap: 3 }}>
          {(["tight", "normal", "relaxed"] as const).map((v) => {
            const active = (content.lineSpacing ?? "normal") === v;
            return (
              <button key={v} onClick={() => updateContent({ lineSpacing: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
    </>
  );
}

/** Shared section label show/hide toggle. */
function SharedSectionLabelToggle({
  content,
  updateContent,
}: {
  content: SharedSlideFields;
  updateContent: (patch: Partial<SharedSlideFields>) => void;
}) {
  return (
    <FieldGroup label="">
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={content.showSectionLabel ?? true}
          onChange={(e) => updateContent({ showSectionLabel: e.target.checked })}
        />
        Show Section Label
      </label>
    </FieldGroup>
  );
}

// ─── Content editors per slide type ─────────────────────────────────────────

/** Compact B | I | U toggle group for per-field text formatting. */
function TextFormatGroup({
  bold, italic, underline,
  onBold, onItalic, onUnderline,
}: {
  bold: boolean; italic: boolean; underline: boolean;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
  onUnderline: (v: boolean) => void;
}) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    padding: "3px 0",
    cursor: "pointer",
    background: active ? "#1F2937" : "#F3F4F6",
    color: active ? "#fff" : "#374151",
    border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`,
    borderRadius: 0,
  });
  return (
    <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
      <button onClick={() => onBold(!bold)} style={{ ...btnStyle(bold), borderRadius: "4px 0 0 4px" }}>
        <strong>B</strong>
      </button>
      <button onClick={() => onItalic(!italic)} style={{ ...btnStyle(italic), borderLeft: "none" }}>
        <em>I</em>
      </button>
      <button onClick={() => onUnderline(!underline)} style={{ ...btnStyle(underline), borderLeft: "none", borderRadius: "0 4px 4px 0" }}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </button>
    </div>
  );
}

/** Size slider with tick labels for per-field font size control. */
function FontSizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="range"
          min={0.5}
          max={4.0}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10, color: "#6B7280", minWidth: 28, textAlign: "right" }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#9CA3AF", marginTop: 1, padding: "0 1px" }}>
        <span>XS</span><span>S</span><span>M</span><span>L</span><span>XL</span><span>Display</span>
      </div>
    </div>
  );
}

/** Inline font selector for a single cover text field. */
function CoverFontSelect({
  value,
  onChange,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  list: readonly { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", fontSize: 10, padding: "3px 5px", border: "1px solid #D1D5DB", borderRadius: 4, background: "#fff", color: "#374151", marginTop: 4 }}
    >
      {list.map((f) => (
        <option key={f.value} value={f.value}>{f.label}</option>
      ))}
    </select>
  );
}

function CoverInspector({
  slide,
  branding,
  onUpdate,
  projectId,
  projectRoomsWithMedia = [],
  projectLevelMedia = [],
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  projectId: string;
  projectRoomsWithMedia?: RoomWithMedia[];
  projectLevelMedia?: RoomMediaItem[];
}) {
  const content = (slide.content ?? {}) as CoverContent;
  const [cadPickerOpen, setCadPickerOpen] = useState(false);
  const [cadGenerating, setCadGenerating] = useState(false);

  function updateContent(patch: Partial<CoverContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const isRightPanel = slide.layoutKey === "right-panel-overlay";
  const isBottomCard = slide.layoutKey === "bottom-card-overlay";
  const isCadOverlay = slide.layoutKey === "cad-overlay";

  // ── CAD overlay generation handler ─────────────────────────────────────────
  async function handleCadGenerate() {
    if (!content.cadSourcePhotoUrl) return;
    setCadGenerating(true);
    updateContent({
      cadGenerationStatus: "generating",
      cadGenerationError: null,
    });

    try {
      const res = await fetch("/api/slides/cad-overlay/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePhotoUrl: content.cadSourcePhotoUrl,
          overlayIntensity: content.cadOverlayIntensity ?? 0.7,
          transitionPosition: content.cadTransitionPosition ?? 45,
          cadSide: content.cadSide ?? "right",
          projectId,
          slideId: slide.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        updateContent({
          cadGenerationStatus: "error",
          cadGenerationError: data.error ?? "Generation failed",
        });
      } else {
        updateContent({
          cadGeneratedImageUrl: data.imageUrl,
          cadGenerationStatus: "complete",
          cadGenerationError: null,
        });
      }
    } catch (e) {
      updateContent({
        cadGenerationStatus: "error",
        cadGenerationError: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setCadGenerating(false);
    }
  }

  return (
    <>
      {/* ── CAD Overlay controls (only when cad-overlay layout) ────────── */}
      {isCadOverlay && (
        <>
          <SectionLabel>Source Photo</SectionLabel>
          {/* Selected photo preview + change/remove */}
          {content.cadSourcePhotoUrl ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 6, overflow: "hidden", border: "1px solid #E5E7EB", marginBottom: 6 }}>
                <img src={content.cadSourcePhotoUrl} alt="CAD source" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setCadPickerOpen(true)}
                  style={{ flex: 1, fontSize: 10, padding: "4px 8px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 4, cursor: "pointer", color: "#6B7280" }}
                >
                  Change Photo
                </button>
                <button
                  onClick={() => updateContent({
                    cadSourcePhotoId: null, cadSourcePhotoUrl: null,
                    cadGeneratedImageUrl: null, cadGenerationStatus: "idle",
                    cadGenerationError: null,
                  })}
                  style={{ fontSize: 10, padding: "4px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, cursor: "pointer", color: "#DC2626" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCadPickerOpen(true)}
              style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "16px 10px", marginBottom: 8, textAlign: "center" }}
            >
              + Select Photo
            </button>
          )}

          {/* ── Project media picker modal ──────────────────────────────── */}
          {cadPickerOpen && typeof document !== "undefined" && createPortal(
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => setCadPickerOpen(false)}
            >
              {/* Backdrop */}
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
              {/* Panel */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "relative",
                  background: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                  width: "min(520px, 90vw)",
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: branding.textColor }}>Select Source Photo</span>
                  <button
                    onClick={() => setCadPickerOpen(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: 4 }}
                  >
                    &times;
                  </button>
                </div>
                {/* Scrollable body */}
                <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1 }}>
                  {(() => {
                    const hasAny = projectLevelMedia.length > 0 || projectRoomsWithMedia.some((r) => r.beforeMedia.length > 0 || r.renderMedia.length > 0);
                    if (!hasAny) {
                      return <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>No project media found. Add photos in the Media tab.</p>;
                    }

                    function ModalThumb({ m, label, sectionName }: { m: RoomMediaItem; label: "Photo" | "Render"; sectionName: string }) {
                      const isSelected = content.cadSourcePhotoId === m.id;
                      return (
                        <button
                          onClick={() => {
                            updateContent({
                              cadSourcePhotoId: m.id,
                              cadSourcePhotoUrl: m.url,
                              cadGeneratedImageUrl: null,
                              cadGenerationStatus: "idle",
                              cadGenerationError: null,
                            });
                            setCadPickerOpen(false);
                          }}
                          style={{
                            position: "relative",
                            aspectRatio: "4/3",
                            borderRadius: 6,
                            overflow: "hidden",
                            border: isSelected ? `3px solid ${branding.accentColor}` : "2px solid #E5E7EB",
                            cursor: "pointer",
                            padding: 0,
                            background: "none",
                            transition: "border-color 0.15s",
                          }}
                        >
                          <img src={m.url} alt={m.caption ?? sectionName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <span style={{
                            position: "absolute", bottom: 0, left: 0, right: 0,
                            fontSize: 9, fontWeight: 600, textAlign: "center",
                            padding: "2px 4px",
                            background: label === "Render" ? "rgba(22,163,74,0.85)" : "rgba(0,0,0,0.55)",
                            color: "#fff",
                          }}>
                            {label}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <>
                        {projectLevelMedia.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Front Page
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                              {projectLevelMedia.map((m) => (
                                <ModalThumb key={m.id} m={m} label={m.renderStatus === "DONE" ? "Render" : "Photo"} sectionName="Front Page" />
                              ))}
                            </div>
                          </div>
                        )}
                        {projectRoomsWithMedia.map((room) => {
                          const allMedia = [
                            ...room.beforeMedia.map((m) => ({ ...m, label: "Photo" as const })),
                            ...room.renderMedia.map((m) => ({ ...m, label: "Render" as const })),
                          ];
                          if (allMedia.length === 0) return null;
                          return (
                            <div key={room.id} style={{ marginBottom: 14 }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                {room.name}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                                {allMedia.map((m) => (
                                  <ModalThumb key={m.id} m={m} label={m.label} sectionName={room.name} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>,
            document.body,
          )}

          {/* Generate section — only when source photo is selected */}
          {content.cadSourcePhotoUrl && (
            <>
              <Divider />
              <SectionLabel>Generate</SectionLabel>

              {/* CAD Side toggle */}
              <FieldGroup label="CAD Side">
                <div className="flex gap-1">
                  {(["left", "right"] as const).map((side) => {
                    const active = (content.cadSide ?? "right") === side;
                    return (
                      <button
                        key={side}
                        onClick={() => updateContent({
                          cadSide: side,
                          cadGeneratedImageUrl: null,
                          cadGenerationStatus: "idle",
                          cadGenerationError: null,
                        })}
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
                        {side}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              {/* Overlay Intensity slider */}
              <FieldGroup label={`CAD Intensity — ${Math.round((content.cadOverlayIntensity ?? 0.7) * 100)}%`}>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={Math.round((content.cadOverlayIntensity ?? 0.7) * 100)}
                  onChange={(e) => updateContent({ cadOverlayIntensity: Number(e.target.value) / 100 })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
                <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>Higher = stronger CAD effect on right side</p>
              </FieldGroup>

              {/* Transition Position slider */}
              <FieldGroup label={`Transition Point — ${content.cadTransitionPosition ?? 45}%`}>
                <input
                  type="range"
                  min={10} max={80} step={5}
                  value={content.cadTransitionPosition ?? 45}
                  onChange={(e) => updateContent({ cadTransitionPosition: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: branding.accentColor }}
                />
                <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>Where the photo fades into CAD (% from left)</p>
              </FieldGroup>

              {/* Generate / Regenerate button */}
              <button
                onClick={handleCadGenerate}
                disabled={cadGenerating}
                style={{
                  width: "100%",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 12px",
                  background: cadGenerating ? "#D1D5DB" : branding.textColor,
                  color: cadGenerating ? "#6B7280" : branding.accentColor,
                  border: "none",
                  borderRadius: 6,
                  cursor: cadGenerating ? "not-allowed" : "pointer",
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {cadGenerating ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                    Generating...
                  </>
                ) : content.cadGenerationStatus === "complete" ? (
                  "Regenerate CAD Overlay"
                ) : (
                  "Generate CAD Overlay"
                )}
              </button>

              {/* Status section */}
              {content.cadGenerationStatus === "complete" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ color: "#16A34A", fontSize: 14 }}>&#10003;</span>
                  <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 500 }}>CAD overlay generated</span>
                </div>
              )}
              {content.cadGenerationStatus === "error" && !cadGenerating && (
                <div style={{ marginTop: 6, padding: "6px 8px", background: "#FEF2F2", borderRadius: 4, border: "1px solid #FECACA" }}>
                  <span style={{ fontSize: 10, color: "#DC2626" }}>
                    {content.cadGenerationError ?? "Generation failed"}
                  </span>
                </div>
              )}
            </>
          )}

          <Divider />
        </>
      )}

      <SectionLabel>Content</SectionLabel>

      {/* ── Headline (the big serif heading — stored as slide.subheadline) ── */}
      <FieldGroup label="Headline">
        <TextInput
          value={slide.subheadline ?? ""}
          onChange={(v) => onUpdate({ ...slide, subheadline: v })}
          placeholder="e.g. Project Proposal"
        />
        <FontSizeSlider
          value={content.headlineSize ?? 2.0}
          onChange={(v) => updateContent({ headlineSize: v })}
        />
        <TextFormatGroup
          bold={content.headlineBold ?? true}
          italic={content.headlineItalic ?? false}
          underline={content.headlineUnderline ?? false}
          onBold={(v) => updateContent({ headlineBold: v })}
          onItalic={(v) => updateContent({ headlineItalic: v })}
          onUnderline={(v) => updateContent({ headlineUnderline: v })}
        />
        <CoverFontSelect
          value={content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ headlineFont: v })}
          list={SLIDE_FONTS.headline}
        />
      </FieldGroup>

      {/* ── Project Name (the small uppercase label — stored as slide.headline) ── */}
      <FieldGroup label="Project Name">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. 3 Carma Ct - Master Bath Remodel"
        />
        <FontSizeSlider
          value={content.subheadlineSize ?? 0.6}
          onChange={(v) => updateContent({ subheadlineSize: v })}
        />
        <TextFormatGroup
          bold={content.subheadlineBold ?? false}
          italic={content.subheadlineItalic ?? false}
          underline={content.subheadlineUnderline ?? false}
          onBold={(v) => updateContent({ subheadlineBold: v })}
          onItalic={(v) => updateContent({ subheadlineItalic: v })}
          onUnderline={(v) => updateContent({ subheadlineUnderline: v })}
        />
        <CoverFontSelect
          value={content.projectNameFont ?? SLIDE_FONTS.defaults.label}
          onChange={(v) => updateContent({ projectNameFont: v })}
          list={SLIDE_FONTS.body}
        />
      </FieldGroup>

      {/* ── Prepared For ── */}
      <FieldGroup label="Prepared For">
        <TextInput
          value={content.preparedFor ?? ""}
          onChange={(v) => updateContent({ preparedFor: v })}
          placeholder="Client name"
        />
        <FontSizeSlider
          value={content.preparedForSize ?? 0.9}
          onChange={(v) => updateContent({ preparedForSize: v })}
        />
        <TextFormatGroup
          bold={content.preparedForBold ?? false}
          italic={content.preparedForItalic ?? false}
          underline={content.preparedForUnderline ?? false}
          onBold={(v) => updateContent({ preparedForBold: v })}
          onItalic={(v) => updateContent({ preparedForItalic: v })}
          onUnderline={(v) => updateContent({ preparedForUnderline: v })}
        />
        <CoverFontSelect
          value={content.preparedForFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ preparedForFont: v })}
          list={SLIDE_FONTS.body}
        />
      </FieldGroup>

      {/* ── Address (editable — defaults from company settings) ── */}
      <FieldGroup label="Address">
        <TextInput
          value={content.address ?? branding.address ?? ""}
          onChange={(v) => updateContent({ address: v })}
          placeholder="e.g. 1 Mathews Dr, Hilton Head, SC 29926"
        />
        {content.address && content.address !== branding.address && (
          <button
            onClick={() => updateContent({ address: null })}
            style={{ fontSize: 9, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline" }}
          >
            Reset to company address
          </button>
        )}
      </FieldGroup>

      <FieldGroup label="Date">
        <TextInput
          value={content.date ?? ""}
          onChange={(v) => updateContent({ date: v })}
          placeholder="e.g. March 22, 2026"
        />
      </FieldGroup>

      {/* ── Tagline (cad-overlay only) ── */}
      {isCadOverlay && (
        <FieldGroup label="Tagline">
          <TextInput
            value={content.tagline ?? ""}
            onChange={(v) => updateContent({ tagline: v })}
            placeholder="e.g. A deliberate path from vision to reality."
          />
          <FontSizeSlider
            value={content.taglineSize ?? 1.05}
            onChange={(v) => updateContent({ taglineSize: v })}
          />
          <TextFormatGroup
            bold={content.taglineBold ?? false}
            italic={content.taglineItalic ?? true}
            underline={content.taglineUnderline ?? false}
            onBold={(v) => updateContent({ taglineBold: v })}
            onItalic={(v) => updateContent({ taglineItalic: v })}
            onUnderline={(v) => updateContent({ taglineUnderline: v })}
          />
          <CoverFontSelect
            value={content.taglineFont ?? SLIDE_FONTS.defaults.body}
            onChange={(v) => updateContent({ taglineFont: v })}
            list={SLIDE_FONTS.body}
          />
        </FieldGroup>
      )}

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

      {(slide.layoutKey === "right-panel-overlay" || slide.layoutKey === "bottom-card-overlay") && (
        <SharedOverlaySection content={content} updateContent={updateContent} />
      )}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
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

  // Determine layout-aware headline color default
  const isLight = slide.layoutKey !== "dark-statement";
  const headlineColorDefault = isLight ? "#1B2A4A" : "#FFFFFF";

  // ── Pillars editor (new structured layout) ─────────────────────────────
  // The slide renders the 3-pillar layout when `content.pillars` has exactly 3
  // valid entries. Editing any field below writes straight into slide content.
  const pillarSlots: { title: string; body: string }[] = (() => {
    const seed = (content.pillars ?? []).slice(0, 3);
    while (seed.length < 3) seed.push({ title: "", body: "" });
    return seed;
  })();

  function updatePillar(index: 0 | 1 | 2, patch: Partial<{ title: string; body: string }>) {
    const next = pillarSlots.map((p, i) => (i === index ? { ...p, ...patch } : p));
    // Only persist a defined pillars array when the user has entered content.
    const hasAny = next.some((p) => p.title.trim() || p.body.trim());
    updateContent({ pillars: hasAny ? next : undefined });
  }

  return (
    <>
      {/* ── HEADLINE ─────────────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. Project Objective"
        />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── PILLARS (new 3-pillar layout — Phase 8A) ───────────────────── */}
      <SectionLabel>Pillars (3 required for new layout)</SectionLabel>
      <FieldGroup label="Objective (short, ≤50 words)">
        <TextArea
          value={content.objective ?? ""}
          onChange={(v) => updateContent({ objective: v })}
          placeholder="2-3 sentence opener — frames the project as a single vision."
          rows={3}
        />
      </FieldGroup>
      {([0, 1, 2] as const).map((i) => (
        <div key={i} style={{ marginBottom: 10, paddingLeft: 4, borderLeft: `2px solid ${branding.accentColor}33` }}>
          <FieldGroup label={`Pillar ${i + 1} — Title (2-4 words)`}>
            <TextInput
              value={pillarSlots[i].title}
              onChange={(v) => updatePillar(i, { title: v })}
              placeholder={i === 0 ? "The Space" : i === 1 ? "The Connection" : "The Protection"}
            />
          </FieldGroup>
          <FieldGroup label={`Pillar ${i + 1} — Body (≤20 words)`}>
            <TextArea
              value={pillarSlots[i].body}
              onChange={(v) => updatePillar(i, { body: v })}
              placeholder="One sentence describing this dimension."
              rows={2}
            />
          </FieldGroup>
        </div>
      ))}

      {PF_GROUP_DIVIDER}

      <FieldGroup label="Font">
        <PFontSelect
          value={content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ headlineFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor}
          value={content.headlineSize ?? 1.0}
          onChange={(v) => updateContent({ headlineSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.headlineBold} italic={content.headlineItalic} underline={content.headlineUnderline}
        onBold={(v) => updateContent({ headlineBold: v })}
        onItalic={(v) => updateContent({ headlineItalic: v })}
        onUnderline={(v) => updateContent({ headlineUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.headlineColor}
            defaultVal={headlineColorDefault}
            onChange={(v) => updateContent({ headlineColor: v })}
            onReset={() => updateContent({ headlineColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor}
          value={content.headlineOutline}
          onChangeFn={(v) => updateContent({ headlineOutline: v })}
        />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── STATEMENT ────────────────────────────────────────────────────── */}
      <SectionLabel>Statement</SectionLabel>
      <FieldGroup label="Text">
        <TextArea
          value={content.statementText ?? ""}
          onChange={(v) => updateContent({ statementText: v })}
          placeholder="Our objective is to deliver…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.statementFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ statementFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.statementSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor}
          value={content.statementSize ?? 1.0}
          onChange={(v) => updateContent({ statementSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.statementBold} italic={content.statementItalic} underline={content.statementUnderline}
        onBold={(v) => updateContent({ statementBold: v })}
        onItalic={(v) => updateContent({ statementItalic: v })}
        onUnderline={(v) => updateContent({ statementUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.statementColor}
            defaultVal="#ffffff"
            onChange={(v) => updateContent({ statementColor: v })}
            onReset={() => updateContent({ statementColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor}
          value={content.statementOutline}
          onChangeFn={(v) => updateContent({ statementOutline: v })}
        />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── SUPPORTING TEXT ──────────────────────────────────────────────── */}
      <SectionLabel>Supporting Text</SectionLabel>
      <FieldGroup label="Text">
        <TextArea
          value={content.supportingText ?? ""}
          onChange={(v) => updateContent({ supportingText: v })}
          placeholder="We will manage permitting…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.supportingTextFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ supportingTextFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.supportingSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor}
          value={content.supportingSize ?? 1.0}
          onChange={(v) => updateContent({ supportingSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.supportingBold} italic={content.supportingItalic} underline={content.supportingUnderline}
        onBold={(v) => updateContent({ supportingBold: v })}
        onItalic={(v) => updateContent({ supportingItalic: v })}
        onUnderline={(v) => updateContent({ supportingUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.supportingColor}
            defaultVal="#4A5568"
            onChange={(v) => updateContent({ supportingColor: v })}
            onReset={() => updateContent({ supportingColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor}
          value={content.supportingOutline}
          onChangeFn={(v) => updateContent({ supportingOutline: v })}
        />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── BULLETS ──────────────────────────────────────────────────────── */}
      <SectionLabel>Bullets</SectionLabel>
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
      <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: -6, marginBottom: 8, lineHeight: 1.4 }}>
        Bullets shown as proof-point row in Dark Statement layout.
      </p>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.bulletsFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ bulletsFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.bulletsSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor}
          value={content.bulletsSize ?? 1.0}
          onChange={(v) => updateContent({ bulletsSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.bulletsBold} italic={content.bulletsItalic} underline={content.bulletsUnderline}
        onBold={(v) => updateContent({ bulletsBold: v })}
        onItalic={(v) => updateContent({ bulletsItalic: v })}
        onUnderline={(v) => updateContent({ bulletsUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Bullet Text Color">
          <BrandingColorRow branding={branding}
            value={content.bulletColor}
            defaultVal="#4A5568"
            onChange={(v) => updateContent({ bulletColor: v })}
            onReset={() => updateContent({ bulletColor: null })}
          />
        </FieldGroup>
      </div>
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Bullet Icon Color">
          <BrandingColorRow branding={branding}
            value={content.bulletIconColor}
            defaultVal={branding.accentColor}
            onChange={(v) => updateContent({ bulletIconColor: v })}
            onReset={() => updateContent({ bulletIconColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor}
          value={content.bulletsOutline}
          onChangeFn={(v) => updateContent({ bulletsOutline: v })}
        />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── TEXT POSITION ────────────────────────────────────────────────── */}
      <SectionLabel>Text Position</SectionLabel>
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
      <button
        onClick={() => updateContent({ textX: null, textY: null, textWidth: null })}
        style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}
      >
        Reset all positions
      </button>

      {PF_GROUP_DIVIDER}

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
            <BrandingColorRow branding={branding}
              value={content.cardColor}
              defaultVal="#000000"
              onChange={(v) => updateContent({ cardColor: v })}
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
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} />
      <SharedTextLayoutSection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

function InvestmentInspector({
  slide,
  branding,
  onUpdate,
  onResyncInvestment,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  onResyncInvestment?: () => void;
}) {
  const content = (slide.content ?? {}) as InvestmentContent;
  const itemCount = (content.lineItems ?? []).length;
  const accent = content.accentColor ?? branding.accentColor;

  function updateContent(patch: Partial<InvestmentContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch }, isUserModified: true });
  }

  // Controlled retainerAmount: display as formatted string, store as number
  const [retainerRaw, setRetainerRaw] = useState(
    content.retainerAmount != null ? String(content.retainerAmount) : ""
  );
  // Keep local retainerRaw in sync if slide content changes externally
  useEffect(() => {
    setRetainerRaw(content.retainerAmount != null ? String(content.retainerAmount) : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id]);

  const [resyncing, setResyncing] = useState(false);

  async function handleResync() {
    if (!onResyncInvestment) return;
    setResyncing(true);
    await onResyncInvestment();
    setResyncing(false);
  }

  return (
    <>
      {/* Auto-sync notice */}
      <div
        style={{
          background: "#F0F9FF",
          border: "1px solid #BAE6FD",
          borderRadius: 4,
          padding: "7px 9px",
          marginBottom: 12,
        }}
      >
        <p style={{ fontSize: 10, color: "#0369A1", lineHeight: 1.5, fontWeight: 500 }}>
          {itemCount > 0
            ? `${itemCount} line item${itemCount !== 1 ? "s" : ""} synced from the Investment tab.`
            : "No line items synced yet. Add items in the Investment tab."}
        </p>
        <p style={{ fontSize: 10, color: "#0284C7", lineHeight: 1.5, marginTop: 2 }}>
          To add or edit line items, go to the{" "}
          <strong>Investment tab</strong> and mark them "Include in totals".
        </p>
      </div>

      {/* Re-sync button */}
      <button
        onClick={handleResync}
        disabled={resyncing}
        style={{
          fontSize: 11,
          padding: "5px 10px",
          borderRadius: 4,
          border: "1px solid #D1D5DB",
          background: resyncing ? "#F3F4F6" : "#fff",
          color: resyncing ? "#9CA3AF" : "#374151",
          cursor: resyncing ? "not-allowed" : "pointer",
          marginBottom: 16,
          width: "100%",
        }}
      >
        {resyncing ? "Syncing…" : "↺ Re-sync from Investment Tab"}
      </button>

      <Divider />

      {PF_GROUP_DIVIDER}

      {/* ── HEADLINE ─────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headlineBold ?? true} italic={content.headlineItalic} underline={content.headlineUnderline}
          onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headlineColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── RETAINER LABEL ───────────────────────────── */}
      <SectionLabel>Retainer Label</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={content.retainerLabel ?? ""}
          onChange={(v) => updateContent({ retainerLabel: v || null })}
          placeholder="Design / Feasibility Retainer"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.retainerLabelFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ retainerLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.retainerLabelSize ?? 0.75).toFixed(1)}×`}>
        <PSizeSlider value={content.retainerLabelSize ?? 0.75} onChange={(v) => updateContent({ retainerLabelSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.retainerLabelBold ?? true} italic={content.retainerLabelItalic} underline={content.retainerLabelUnderline}
          onBold={(v) => updateContent({ retainerLabelBold: v })} onItalic={(v) => updateContent({ retainerLabelItalic: v })} onUnderline={(v) => updateContent({ retainerLabelUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.retainerLabelColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ retainerLabelColor: v })} onReset={() => updateContent({ retainerLabelColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.retainerLabelOutline} onChangeFn={(v) => updateContent({ retainerLabelOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── RETAINER AMOUNT ──────────────────────────── */}
      <SectionLabel>Retainer Amount</SectionLabel>
      <FieldGroup label="Amount (number)">
        <input
          type="text"
          inputMode="numeric"
          value={retainerRaw}
          onChange={(e) => setRetainerRaw(e.target.value)}
          onBlur={() => {
            const stripped = retainerRaw.replace(/[^0-9.]/g, "");
            const n = parseFloat(stripped);
            const parsed = Number.isFinite(n) && n > 0 ? n : null;
            updateContent({ retainerAmount: parsed });
            setRetainerRaw(parsed != null ? String(parsed) : "");
          }}
          placeholder="e.g. 15000"
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
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.retainerAmountFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ retainerAmountFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.retainerAmountSize ?? 2.5).toFixed(1)}×`}>
        <PSizeSlider value={content.retainerAmountSize ?? 2.5} onChange={(v) => updateContent({ retainerAmountSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.retainerAmountBold ?? true} italic={content.retainerAmountItalic} underline={content.retainerAmountUnderline}
          onBold={(v) => updateContent({ retainerAmountBold: v })} onItalic={(v) => updateContent({ retainerAmountItalic: v })} onUnderline={(v) => updateContent({ retainerAmountUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.retainerAmountColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ retainerAmountColor: v })} onReset={() => updateContent({ retainerAmountColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.retainerAmountOutline} onChangeFn={(v) => updateContent({ retainerAmountOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── RETAINER DESCRIPTION ─────────────────────── */}
      <SectionLabel>Retainer Description</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={content.retainerDescription ?? ""}
          onChange={(v) => updateContent({ retainerDescription: v || null })}
          placeholder="Think of this as an insurance policy..."
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.retainerDescFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ retainerDescFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.retainerDescSize ?? 0.62).toFixed(1)}×`}>
        <PSizeSlider value={content.retainerDescSize ?? 0.62} onChange={(v) => updateContent({ retainerDescSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.retainerDescBold} italic={content.retainerDescItalic} underline={content.retainerDescUnderline}
          onBold={(v) => updateContent({ retainerDescBold: v })} onItalic={(v) => updateContent({ retainerDescItalic: v })} onUnderline={(v) => updateContent({ retainerDescUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.retainerDescColor} defaultVal="#6B7280"
          onChange={(v) => updateContent({ retainerDescColor: v })} onReset={() => updateContent({ retainerDescColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.retainerDescOutline} onChangeFn={(v) => updateContent({ retainerDescOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── TABLE HEADER ─────────────────────────────── */}
      <SectionLabel>Table Header</SectionLabel>
      <FieldGroup label="Font">
        <PFontSelect value={content.tableHeaderFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ tableHeaderFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.tableHeaderSize ?? 0.72).toFixed(1)}×`}>
        <PSizeSlider value={content.tableHeaderSize ?? 0.72} onChange={(v) => updateContent({ tableHeaderSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.tableHeaderBold ?? true} italic={content.tableHeaderItalic} underline={content.tableHeaderUnderline}
          onBold={(v) => updateContent({ tableHeaderBold: v })} onItalic={(v) => updateContent({ tableHeaderItalic: v })} onUnderline={(v) => updateContent({ tableHeaderUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Header Bg Color">
        <BrandingColorRow branding={branding} value={content.tableHeaderBgColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ tableHeaderBgColor: v })} onReset={() => updateContent({ tableHeaderBgColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.tableHeaderOutline} onChangeFn={(v) => updateContent({ tableHeaderOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} showSizeControls />
      <SharedTextLayoutSection content={content} updateContent={updateContent} />

      {/* ── Table Style (Investment-specific) ── */}
      <Divider />
      <SectionLabel>Table Style</SectionLabel>
      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={content.showRetainerSection ?? true}
            onChange={(e) => updateContent({ showRetainerSection: e.target.checked })}
          />
          Show Retainer Section
        </label>
      </FieldGroup>
      <FieldGroup label="Line Item Density">
        <div style={{ display: "flex", gap: 3 }}>
          {(["compact", "normal", "spacious"] as const).map((v) => {
            const active = (content.lineItemSizePreset ?? "normal") === v;
            return (
              <button key={v} onClick={() => updateContent({ lineItemSizePreset: v })} style={{
                flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 3, cursor: "pointer",
                background: active ? "#1F2937" : "#F3F4F6", color: active ? "#fff" : "#374151",
                border: `1px solid ${active ? "#1F2937" : "#D1D5DB"}`, textTransform: "capitalize",
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            );
          })}
        </div>
      </FieldGroup>
      <FieldGroup label="Retainer Accent Color">
        <BrandingColorRow
          value={content.retainerAccentColor}
          defaultVal="#B8860B"
          branding={branding}
          onChange={(v) => updateContent({ retainerAccentColor: v })}
          onReset={() => updateContent({ retainerAccentColor: null })}
        />
      </FieldGroup>

      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ──�� Why Us Inspector ─────────────────────────────────────��──────────────────

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
  const testimonials = content.testimonials ?? [];

  // Testimonial library state (same pattern as ClientTestimonialsInspector)
  const [libraryItems, setLibraryItems] = useState<WhyUsTestimonial[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  // selectedPillarIds: non-empty = explicit selection; empty/absent = all shown
  const selectedIds: string[] =
    (content.selectedPillarIds?.length ?? 0) > 0
      ? content.selectedPillarIds!
      : allPillars.map((p) => p.id);

  const isTestimonialsSplit = slide.layoutKey === "testimonials-split";

  // Load approved testimonials from library when Testimonials Split is active
  useEffect(() => {
    if (!isTestimonialsSplit || libraryLoaded) return;
    import("@/app/admin/settings/actions").then((mod) => {
      mod.getApprovedTestimonialsAction().then((items) => {
        setLibraryItems(
          items.map((t) => ({
            id: t.id,
            quote: t.quote,
            author: t.clientName,
            location: t.projectName ?? null,
            rating: t.rating ?? null,
          }))
        );
        setLibraryLoaded(true);
      });
    });
  }, [isTestimonialsSplit, libraryLoaded]);

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

  // Testimonial picker helpers
  function addTestimonial(t: WhyUsTestimonial) {
    if (testimonials.length >= 3) return;
    if (testimonials.some((x) => x.id === t.id)) return;
    const next = [...testimonials, t];
    updateContent({ testimonials: next, testimonialIds: next.map((x) => x.id) });
  }

  function removeTestimonial(idx: number) {
    const next = testimonials.filter((_, i) => i !== idx);
    updateContent({ testimonials: next, testimonialIds: next.map((x) => x.id) });
  }

  function moveTestimonial(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= testimonials.length) return;
    const updated = [...testimonials];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ testimonials: updated, testimonialIds: updated.map((x) => x.id) });
  }

  const available = libraryItems.filter((t) => !testimonials.some((s) => s.id === t.id));

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

      <Divider />

      {/* Testimonial picker — only for testimonials-split layout */}
      {isTestimonialsSplit && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel>Testimonials (1–3)</SectionLabel>
          </div>

          {testimonials.length === 0 && libraryLoaded && libraryItems.length === 0 && (
            <div style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
              No approved testimonials found.{" "}
              <a
                href="/admin/settings/testimonials"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#6B7280", textDecoration: "underline" }}
              >
                Add testimonials
              </a>
            </div>
          )}

          {testimonials.length === 0 && libraryLoaded && libraryItems.length > 0 && (
            <div style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
              No testimonials selected. Choose from your library below.
            </div>
          )}

          {testimonials.map((t, i) => (
            <div key={t.id} style={{ marginBottom: 8, padding: "6px 8px", background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#374151" }}>{t.author}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => moveTestimonial(i, -1)} disabled={i === 0} style={{ fontSize: 9, color: i === 0 ? "#D1D5DB" : "#6B7280", cursor: i === 0 ? "default" : "pointer", background: "none", border: "none", padding: 0 }}>▲</button>
                  <button onClick={() => moveTestimonial(i, 1)} disabled={i === testimonials.length - 1} style={{ fontSize: 9, color: i === testimonials.length - 1 ? "#D1D5DB" : "#6B7280", cursor: i === testimonials.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: 0 }}>▼</button>
                  <button onClick={() => removeTestimonial(i)} style={{ fontSize: 9, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: 0 }}>✕</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {"\u201C"}{t.quote.slice(0, 60)}{t.quote.length > 60 ? "\u2026" : ""}{"\u201D"}
              </div>
            </div>
          ))}

          {/* Available testimonials from library */}
          {testimonials.length < 3 && available.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4, fontWeight: 500 }}>From Library:</div>
              {available.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTestimonial(t)}
                  style={{ width: "100%", textAlign: "left", fontSize: 10, color: "#374151", cursor: "pointer", background: "none", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 8px", marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.author}: {"\u201C"}{t.quote.slice(0, 40)}{"\u2026"}{"\u201D"}</span>
                  <span style={{ color: "#B8860B", fontWeight: 600, marginLeft: 4, flexShrink: 0 }}>+</span>
                </button>
              ))}
            </div>
          )}

          {testimonials.length < 3 && available.length === 0 && libraryLoaded && (
            <div style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
              {libraryItems.length === 0
                ? "No testimonials in library yet."
                : "All library testimonials already selected."}
            </div>
          )}

          <a
            href="/admin/settings/testimonials"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "#6B7280", textDecoration: "underline", display: "inline-block", marginBottom: 8 }}
          >
            Manage Testimonials
          </a>

          <Divider />
        </>
      )}

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

      <Divider />

      {/* ── Per-field: SECTION TITLE ──────────────────────────────────── */}
      {(() => {
        const allP = content.pillars ?? [];
        const selIds = (content.selectedPillarIds?.length ?? 0) > 0
          ? content.selectedPillarIds!
          : allP.map((p) => p.id);
        const visiblePillars2 = allP.filter((p) => selIds.includes(p.id));

        return (
          <>
            <SectionLabel>Section Title</SectionLabel>
            <FieldGroup label="Text">
              <TextInput value={content.sectionTitle ?? ""} onChange={(v) => updateContent({ sectionTitle: v || null })}
                placeholder={slide.headline ?? "The HHI Difference"} />
            </FieldGroup>
            <FieldGroup label="Font">
              <PFontSelect value={content.sectionTitleFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ sectionTitleFont: v })} />
            </FieldGroup>
            <FieldGroup label={`Size — ${(content.sectionTitleSize ?? 2.0).toFixed(1)}×`}>
              <PSizeSlider accentColor={branding.accentColor} value={content.sectionTitleSize ?? 2.0} onChange={(v) => updateContent({ sectionTitleSize: v })} />
            </FieldGroup>
            <PStyleButtons bold={content.sectionTitleBold} italic={content.sectionTitleItalic} underline={content.sectionTitleUnderline}
              onBold={(v) => updateContent({ sectionTitleBold: v })} onItalic={(v) => updateContent({ sectionTitleItalic: v })} onUnderline={(v) => updateContent({ sectionTitleUnderline: v })} />
            <div style={{ marginTop: 8 }}>
              <FieldGroup label="Color">
                <BrandingColorRow branding={branding} value={content.sectionTitleColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateContent({ sectionTitleColor: v })} onReset={() => updateContent({ sectionTitleColor: null })} />
              </FieldGroup>
            </div>
            <FieldGroup label="Outline">
              <POutlineRow accentColor={branding.accentColor} value={content.sectionTitleOutline} onChangeFn={(v) => updateContent({ sectionTitleOutline: v })} />
            </FieldGroup>

            {PF_GROUP_DIVIDER}

            {/* ── Per-item pillar controls ────────────────────────────────── */}
            {visiblePillars2.length > 0 && (
              <>
                <SectionLabel>Pillar Styles</SectionLabel>
                {visiblePillars2.map((pillar: WhyUsPillarItem, pi: number) => {
                  const pIdx = (content.pillars ?? []).findIndex((p) => p.id === pillar.id);
                  if (pIdx < 0) return null;
                  function updatePillar(patch: Partial<typeof pillar>) {
                    const updated = [...(content.pillars ?? [])];
                    updated[pIdx] = { ...updated[pIdx], ...patch };
                    updateContent({ pillars: updated });
                  }
                  return (
                    <div key={pillar.id} style={{ marginBottom: 12, paddingLeft: 4 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{pillar.title}</p>

                      {/* Title styles */}
                      <p style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Title</p>
                      <FieldGroup label="Font">
                        <PFontSelect value={pillar.titleFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updatePillar({ titleFont: v })} />
                      </FieldGroup>
                      <FieldGroup label={`Size — ${(pillar.titleSize ?? 1.1).toFixed(1)}×`}>
                        <PSizeSlider accentColor={branding.accentColor} value={pillar.titleSize ?? 1.1} onChange={(v) => updatePillar({ titleSize: v })} />
                      </FieldGroup>
                      <PStyleButtons bold={pillar.titleBold} italic={pillar.titleItalic} underline={pillar.titleUnderline}
                        onBold={(v) => updatePillar({ titleBold: v })} onItalic={(v) => updatePillar({ titleItalic: v })} onUnderline={(v) => updatePillar({ titleUnderline: v })} />
                      <div style={{ marginTop: 8 }}>
                        <FieldGroup label="Color">
                          <BrandingColorRow branding={branding} value={pillar.titleColor} defaultVal="#1B2A4A"
                            onChange={(v) => updatePillar({ titleColor: v })} onReset={() => updatePillar({ titleColor: undefined })} />
                        </FieldGroup>
                      </div>
                      <FieldGroup label="Outline">
                        <POutlineRow accentColor={branding.accentColor} value={pillar.titleOutline} onChangeFn={(v) => updatePillar({ titleOutline: v })} />
                      </FieldGroup>

                      {/* Description styles */}
                      <p style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, marginTop: 8 }}>Description</p>
                      <FieldGroup label="Font">
                        <PFontSelect value={pillar.descriptionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePillar({ descriptionFont: v })} />
                      </FieldGroup>
                      <FieldGroup label={`Size — ${(pillar.descriptionSize ?? 0.9).toFixed(1)}×`}>
                        <PSizeSlider accentColor={branding.accentColor} value={pillar.descriptionSize ?? 0.9} onChange={(v) => updatePillar({ descriptionSize: v })} />
                      </FieldGroup>
                      <PStyleButtons bold={pillar.descriptionBold} italic={pillar.descriptionItalic} underline={pillar.descriptionUnderline}
                        onBold={(v) => updatePillar({ descriptionBold: v })} onItalic={(v) => updatePillar({ descriptionItalic: v })} onUnderline={(v) => updatePillar({ descriptionUnderline: v })} />
                      <div style={{ marginTop: 8 }}>
                        <FieldGroup label="Color">
                          <BrandingColorRow branding={branding} value={pillar.descriptionColor} defaultVal="#4B5563"
                            onChange={(v) => updatePillar({ descriptionColor: v })} onReset={() => updatePillar({ descriptionColor: undefined })} />
                        </FieldGroup>
                      </div>
                      <FieldGroup label="Outline">
                        <POutlineRow accentColor={branding.accentColor} value={pillar.descriptionOutline} onChangeFn={(v) => updatePillar({ descriptionOutline: v })} />
                      </FieldGroup>

                      {pi < visiblePillars2.length - 1 && PF_GROUP_DIVIDER}
                    </div>
                  );
                })}
              </>
            )}
          </>
        );
      })()}

      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      {slide.layoutKey === "editorial-cards" && (
        <SharedCardStyleSection content={content} updateContent={updateContent} />
      )}
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Scope Overview Inspector ───────���────────────────────────────────────────

// ─── Scope Overview Photo Card (per-photo controls) ────────────────────────

function ScopeOverviewPhotoCard({
  photo,
  index,
  accentColor,
  onRemove,
  onUpdate,
}: {
  photo: ScopeOverviewSelectedPhoto;
  index: number;
  accentColor: string;
  onRemove: () => void;
  onUpdate: (patch: Partial<ScopeOverviewSelectedPhoto>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scale = photo.scale ?? 100;
  const posX = photo.positionX ?? 50;
  const posY = photo.positionY ?? 50;
  const isDefault = scale === 100 && posX === 50 && posY === 50;

  return (
    <div style={{ borderRadius: 4, border: "1px solid #E5E7EB", overflow: "hidden", background: "#FAFAFA" }}>
      {/* Thumbnail + remove */}
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#E8E6E3" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbnailUrl ?? photo.url}
          alt={`Photo ${index + 1}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            position: "absolute", top: 3, right: 3, width: 16, height: 16,
            borderRadius: "50%", background: "rgba(0,0,0,0.60)", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 8, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}
        >
          ✕
        </button>
        <span style={{ position: "absolute", bottom: 3, left: 4, fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em" }}>
          {index + 1}
        </span>
      </div>

      {/* Collapsible Position & Zoom */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", padding: "4px 8px",
          background: "none", border: "none", borderTop: "1px solid #E5E7EB",
          cursor: "pointer", fontSize: 10, fontWeight: 500, color: "#6B7280",
          display: "flex", alignItems: "center", gap: 4,
          textAlign: "left" as const,
        }}
      >
        <span style={{ fontSize: 8, color: "#9CA3AF" }}>{expanded ? "\u25BC" : "\u25B6"}</span>
        Position &amp; Zoom
        {!isDefault && <span style={{ fontSize: 8, color: accentColor, marginLeft: "auto" }}>{"\u25CF"}</span>}
      </button>

      {expanded && (
        <div style={{ padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Zoom */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6B7280", marginBottom: 1 }}>
              <span>Zoom</span><span>{scale}%</span>
            </div>
            <input type="range" min={50} max={200} step={5}
              value={scale}
              onChange={(e) => onUpdate({ scale: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor, height: 12 }} />
          </div>
          {/* Horizontal */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6B7280", marginBottom: 1 }}>
              <span>Horizontal</span><span>{posX}%</span>
            </div>
            <input type="range" min={0} max={100} step={1}
              value={posX}
              onChange={(e) => onUpdate({ positionX: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor, height: 12 }} />
          </div>
          {/* Vertical */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6B7280", marginBottom: 1 }}>
              <span>Vertical</span><span>{posY}%</span>
            </div>
            <input type="range" min={0} max={100} step={1}
              value={posY}
              onChange={(e) => onUpdate({ positionY: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor, height: 12 }} />
          </div>
          {/* Reset */}
          <button
            onClick={() => onUpdate({ scale: 100, positionX: 50, positionY: 50 })}
            disabled={isDefault}
            style={{
              fontSize: 9, color: isDefault ? "#D1D5DB" : "#9CA3AF",
              background: "none", border: "none", cursor: isDefault ? "default" : "pointer",
              textAlign: "left" as const, padding: 0, marginTop: 2,
            }}
          >
            Reset Position
          </button>
        </div>
      )}
    </div>
  );
}

function ScopeOverviewInspector({
  slide,
  branding,
  onUpdate,
  projectId,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  projectId: string;
}) {
  const content = (slide.content ?? {}) as ScopeOverviewContent;
  const selectedPhotos = content.selectedPhotos ?? [];
  const isSplitPanel = slide.layoutKey === "split-panel";
  const maxPhotos = isSplitPanel ? 2 : 4;
  const [pickerOpen, setPickerOpen] = useState(false);

  function updateContent(patch: Partial<ScopeOverviewContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  // Auto-populate description from Project.scopeOverview when empty
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (hasFetchedRef.current) return;
    const desc = (content.description ?? "").trim();
    if (desc) return; // already has content — don't overwrite
    hasFetchedRef.current = true;
    fetchProjectScopeOverviewAction(projectId).then(({ scopeOverview }) => {
      if (scopeOverview) {
        updateContent({ description: scopeOverview });
      }
    }).catch(() => { /* silent — user can still type manually */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickerSelect(items: LibraryMediaItem[]) {
    const photos: ScopeOverviewSelectedPhoto[] = items.map((item) => ({
      id: item.id,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
    }));
    updateContent({ selectedPhotos: photos.slice(0, maxPhotos) });
    setPickerOpen(false);
  }

  function removePhoto(id: string) {
    updateContent({ selectedPhotos: selectedPhotos.filter((p) => p.id !== id) });
  }

  return (
    <>
      {/* ── TITLE ──────────────────────────────────────────────────────── */}
      <SectionLabel>Title</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="e.g. What We're Building"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ titleFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.titleSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.titleSize ?? 2.0}
          onChange={(v) => updateContent({ titleSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.titleBold ?? true} italic={content.titleItalic} underline={content.titleUnderline}
        onBold={(v) => updateContent({ titleBold: v })}
        onItalic={(v) => updateContent({ titleItalic: v })}
        onUnderline={(v) => updateContent({ titleUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.titleColor}
            defaultVal="#1B2A4A"
            onChange={(v) => updateContent({ titleColor: v })}
            onReset={() => updateContent({ titleColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.titleOutline} onChangeFn={(v) => updateContent({ titleOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── DESCRIPTION ────────────────────────────────────────────────── */}
      <SectionLabel>Description</SectionLabel>
      <FieldGroup label="Text">
        <TextArea
          value={content.description ?? ""}
          onChange={(v) => updateContent({ description: v || null })}
          placeholder="3–4 sentences summarizing the project scope…"
          rows={4}
        />
      </FieldGroup>
      {(() => {
        const desc = (content.description ?? "").trim();
        if (!desc) return null;
        const wc = desc.split(/\s+/).filter(Boolean).length;
        const cc = desc.length;
        const color = wc > 250 ? "#EF4444" : wc > 200 ? "#D97706" : "#9CA3AF";
        return (
          <p style={{ fontSize: 10, color, lineHeight: 1.4, marginBottom: 4 }}>
            {wc} words &middot; {cc.toLocaleString()} characters
          </p>
        );
      })()}
      <FieldGroup label="Font">
        <PFontSelect
          value={content.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ descriptionFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.descriptionSize ?? content.copySize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.descriptionSize ?? content.copySize ?? 1.0}
          onChange={(v) => updateContent({ descriptionSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.descriptionBold} italic={content.descriptionItalic} underline={content.descriptionUnderline}
        onBold={(v) => updateContent({ descriptionBold: v })}
        onItalic={(v) => updateContent({ descriptionItalic: v })}
        onUnderline={(v) => updateContent({ descriptionUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.descriptionColor ?? content.copyColor}
            defaultVal="#4A5568"
            onChange={(v) => updateContent({ descriptionColor: v })}
            onReset={() => updateContent({ descriptionColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.descriptionOutline} onChangeFn={(v) => updateContent({ descriptionOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── TEXT POSITION ──────────────────────────────────────────────── */}
      <SectionLabel>Text Position</SectionLabel>
      <FieldGroup label={`Title X — ${Math.round((content.titleX ?? 0.06) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.titleX ?? 0.06) * 100)}
          onChange={(e) => updateContent({ titleX: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label={`Title Y — ${Math.round((content.titleY ?? (isSplitPanel ? 0.35 : 0.16)) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.titleY ?? (isSplitPanel ? 0.35 : 0.16)) * 100)}
          onChange={(e) => updateContent({ titleY: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label={`Desc X — ${Math.round((content.copyX ?? 0.06) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.copyX ?? 0.06) * 100)}
          onChange={(e) => updateContent({ copyX: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <FieldGroup label={`Desc Y — ${Math.round((content.copyY ?? (isSplitPanel ? 0.66 : 0.33)) * 100)}%`}>
        <input type="range" min={0} max={100} step={1}
          value={Math.round((content.copyY ?? (isSplitPanel ? 0.66 : 0.33)) * 100)}
          onChange={(e) => updateContent({ copyY: parseInt(e.target.value) / 100 })}
          style={{ width: "100%", accentColor: branding.accentColor }} />
      </FieldGroup>
      <button
        onClick={() => updateContent({ titleX: null, titleY: null, copyX: null, copyY: null })}
        style={{ fontSize: 10, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}
      >
        Reset all positions
      </button>

      {PF_GROUP_DIVIDER}

      {/* ── Photo picker ────────────────────────────────────────────────── */}
      <SectionLabel>Photos</SectionLabel>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.5 }}>
        {isSplitPanel ? "Up to 2 photos (Split Panel)." : "Up to 4 photos (Image Row)."}
      </p>

      {/* Panel split ratio — Split Panel only */}
      {isSplitPanel && (
        <FieldGroup label={`Photo Panel Width — ${content.panelSplitRatio ?? 50}% photo / ${100 - (content.panelSplitRatio ?? 50)}% text`}>
          <input type="range" min={20} max={80} step={5}
            value={content.panelSplitRatio ?? 50}
            onChange={(e) => updateContent({ panelSplitRatio: parseInt(e.target.value) })}
            style={{ width: "100%", accentColor: branding.accentColor }} />
        </FieldGroup>
      )}

      {selectedPhotos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {selectedPhotos.map((photo, idx) => (
            <ScopeOverviewPhotoCard
              key={photo.id}
              photo={photo}
              index={idx}
              accentColor={branding.accentColor}
              onRemove={() => removePhoto(photo.id)}
              onUpdate={(patch) => {
                updateContent({
                  selectedPhotos: selectedPhotos.map((p, i) =>
                    i === idx ? { ...p, ...patch } : p
                  ),
                });
              }}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          width: "100%", padding: "7px 10px",
          background: selectedPhotos.length > 0 ? "#F3F4F6" : branding.accentColor + "18",
          color: selectedPhotos.length > 0 ? "#374151" : branding.textColor,
          border: `1px solid ${selectedPhotos.length > 0 ? "#D1D5DB" : branding.accentColor}`,
          borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 500,
          textAlign: "center" as const, marginBottom: 4,
        }}
      >
        {selectedPhotos.length === 0
          ? "Choose Photos"
          : `Change Photos (${selectedPhotos.length}/${maxPhotos})`}
      </button>

      {selectedPhotos.length > 0 && (
        <p style={{ fontSize: 10, color: "#C4C0BB", lineHeight: 1.4, marginBottom: 4 }}>
          Click &quot;Change Photos&quot; to reopen the picker and replace the selection.
        </p>
      )}

      <LibraryMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        multiple={maxPhotos > 1}
        includeUnapproved
      />
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedOverlaySection content={content} updateContent={updateContent} />
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
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
  const accent = content.accentColor ?? branding.accentColor;

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
      {/* ── HEADLINE ─────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headlineBold ?? true} italic={content.headlineItalic} underline={content.headlineUnderline}
          onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headlineColor ?? content.headingColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null, headingColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── CAPTION ──────────────────────────────────── */}
      <SectionLabel>Caption</SectionLabel>

      {/* Caption text */}
      <FieldGroup label="Text">
        <TextArea
          value={content.caption ?? ""}
          onChange={(v) => updateContent({ caption: v || null })}
          placeholder="e.g. Full bath renovation — primary suite"
          rows={4}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.captionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ captionFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.captionSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.captionSize ?? 1.0} onChange={(v) => updateContent({ captionSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.captionBold} italic={content.captionItalic} underline={content.captionUnderline}
          onBold={(v) => updateContent({ captionBold: v })} onItalic={(v) => updateContent({ captionItalic: v })} onUnderline={(v) => updateContent({ captionUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.captionColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ captionColor: v })} onReset={() => updateContent({ captionColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.captionOutline} onChangeFn={(v) => updateContent({ captionOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── BULLETS (Phase 8C) ─────────────────────────── */}
      <SectionLabel>Bullets</SectionLabel>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6, lineHeight: 1.5 }}>
        Short client-facing changes shown beneath the images. Auto-generated from the room&rsquo;s Render Controls; manual edits persist across re-syncs.
      </p>
      {(content.bullets ?? []).length === 0 ? (
        <p style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
          No bullets yet. Will auto-populate on next sync if the room has Render Controls.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {(content.bullets ?? []).map((bullet, idx) => {
            const bullets = content.bullets ?? [];
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#9CA3AF", width: 14, textAlign: "right" }}>{idx + 1}</span>
                <input
                  type="text"
                  value={bullet.text}
                  onChange={(e) => {
                    const next = [...bullets];
                    next[idx] = { ...bullet, text: e.target.value, manuallyEdited: true };
                    updateContent({ bullets: next });
                  }}
                  placeholder="New vanity with stone countertop"
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: "4px 6px",
                    border: `1px solid ${bullet.manuallyEdited ? accent + "80" : "#D1D5DB"}`,
                    borderRadius: 3,
                    background: "#fff",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    updateContent({ bullets: bullets.filter((_, i) => i !== idx) });
                  }}
                  title="Remove bullet"
                  style={{
                    width: 20,
                    height: 20,
                    fontSize: 12,
                    color: "#9CA3AF",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          const next = [...(content.bullets ?? []), { text: "", sourceKey: null, manuallyEdited: true }];
          updateContent({ bullets: next });
        }}
        style={{
          fontSize: 11,
          padding: "4px 8px",
          border: "1px solid #D1D5DB",
          borderRadius: 3,
          background: "#F9FAFB",
          color: "#374151",
          cursor: "pointer",
          marginBottom: 8,
        }}
      >
        + Add bullet
      </button>

      {PF_GROUP_DIVIDER}

      {/* ── BEFORE LABEL ─────────────────────────────── */}
      <SectionLabel>Before Label</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.beforeLabel ?? "BEFORE"} onChange={(v) => updateContent({ beforeLabel: v || null })} placeholder="BEFORE" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.beforeLabelFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ beforeLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.beforeLabelSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.beforeLabelSize ?? 1.0} onChange={(v) => updateContent({ beforeLabelSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.beforeLabelBold ?? true} italic={content.beforeLabelItalic} underline={content.beforeLabelUnderline}
          onBold={(v) => updateContent({ beforeLabelBold: v })} onItalic={(v) => updateContent({ beforeLabelItalic: v })} onUnderline={(v) => updateContent({ beforeLabelUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.beforeLabelColor} defaultVal="rgba(255,255,255,0.75)"
          onChange={(v) => updateContent({ beforeLabelColor: v })} onReset={() => updateContent({ beforeLabelColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.beforeLabelOutline} onChangeFn={(v) => updateContent({ beforeLabelOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── AFTER LABEL ──────────────────────────────── */}
      <SectionLabel>After Label</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.afterLabel ?? "AFTER"} onChange={(v) => updateContent({ afterLabel: v || null })} placeholder="AFTER" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.afterLabelFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ afterLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.afterLabelSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.afterLabelSize ?? 1.0} onChange={(v) => updateContent({ afterLabelSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.afterLabelBold ?? true} italic={content.afterLabelItalic} underline={content.afterLabelUnderline}
          onBold={(v) => updateContent({ afterLabelBold: v })} onItalic={(v) => updateContent({ afterLabelItalic: v })} onUnderline={(v) => updateContent({ afterLabelUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.afterLabelColor} defaultVal="rgba(255,255,255,0.75)"
          onChange={(v) => updateContent({ afterLabelColor: v })} onReset={() => updateContent({ afterLabelColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.afterLabelOutline} onChangeFn={(v) => updateContent({ afterLabelOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* Panel split + before photo scale — after-emphasis only */}
      {slide.layoutKey === "after-emphasis" && (
        <>
          <FieldGroup label={`Text Panel Width — ${content.leftPanelWidth ?? 35}%`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range"
                min={20}
                max={60}
                step={1}
                value={content.leftPanelWidth ?? 35}
                onChange={(e) => updateContent({ leftPanelWidth: parseInt(e.target.value) })}
                style={{ flex: 1, accentColor: accent }}
              />
              <button
                onClick={() => updateContent({ leftPanelWidth: null })}
                style={{ fontSize: 9, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 3, padding: "2px 6px" }}
              >
                Reset
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 8, color: "#9CA3AF" }}>20%</span>
              <span style={{ fontSize: 8, color: "#9CA3AF" }}>35%</span>
              <span style={{ fontSize: 8, color: "#9CA3AF" }}>50%</span>
              <span style={{ fontSize: 8, color: "#9CA3AF" }}>60%</span>
            </div>
          </FieldGroup>
          <FieldGroup label={`Before Photo Size — ${content.beforePhotoScale ?? 100}%`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range"
                min={30}
                max={100}
                step={5}
                value={content.beforePhotoScale ?? 100}
                onChange={(e) => updateContent({ beforePhotoScale: parseInt(e.target.value) })}
                style={{ flex: 1, accentColor: accent }}
              />
              <button
                onClick={() => updateContent({ beforePhotoScale: null })}
                style={{ fontSize: 9, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 3, padding: "2px 6px" }}
              >
                Reset
              </button>
            </div>
          </FieldGroup>
        </>
      )}

      {PF_GROUP_DIVIDER}

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
      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
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
      {/* ── TITLE ──────────────────────────────────────────────────────── */}
      <SectionLabel>Title</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v })}
          placeholder="Additional Areas Included"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ titleFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.titleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.titleSize ?? 1.0}
          onChange={(v) => updateContent({ titleSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.titleBold ?? true} italic={content.titleItalic} underline={content.titleUnderline}
        onBold={(v) => updateContent({ titleBold: v })}
        onItalic={(v) => updateContent({ titleItalic: v })}
        onUnderline={(v) => updateContent({ titleUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.titleColor}
            defaultVal="#1B2A4A"
            onChange={(v) => updateContent({ titleColor: v })}
            onReset={() => updateContent({ titleColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.titleOutline} onChangeFn={(v) => updateContent({ titleOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── INTRO TEXT ─────────────────────────────────────────────────── */}
      <SectionLabel>Intro Text</SectionLabel>
      <FieldGroup label="Text">
        <TextArea
          value={content.introText ?? ""}
          onChange={(v) => updateContent({ introText: v || null })}
          placeholder="These spaces are included in the project…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.introFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ introFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.introSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.introSize ?? 1.0}
          onChange={(v) => updateContent({ introSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.introBold} italic={content.introItalic} underline={content.introUnderline}
        onBold={(v) => updateContent({ introBold: v })}
        onItalic={(v) => updateContent({ introItalic: v })}
        onUnderline={(v) => updateContent({ introUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.introColor}
            defaultVal="#6B7280"
            onChange={(v) => updateContent({ introColor: v })}
            onReset={() => updateContent({ introColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.introOutline} onChangeFn={(v) => updateContent({ introOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── SECTION ITEMS ─────────────────────────────────────────────── */}
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
                    display: "flex", alignItems: "center", gap: 7,
                    marginBottom: room.isIncluded ? 6 : 0, cursor: "pointer",
                  }}
                  onClick={() => updateRoom(room.id, { isIncluded: !room.isIncluded })}
                >
                  <span style={{
                    flexShrink: 0, width: 12, height: 12, borderRadius: 3,
                    background: room.isIncluded ? branding.accentColor : "transparent",
                    border: `1.5px solid ${room.isIncluded ? branding.accentColor : "#D1D5DB"}`,
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", lineHeight: 1.3, flex: 1 }}>
                    {room.name}
                  </span>
                </div>

                {/* Expanded editor when included */}
                {room.isIncluded && (
                  <div style={{ marginTop: 4 }}>
                    <TextArea
                      value={room.description}
                      onChange={(v) => updateRoom(room.id, { description: v })}
                      placeholder="Short description of this area's scope…"
                      rows={2}
                    />

                    {/* Phase 8C: category picker. Manual edits flip
                        manuallyClassified = true so the sync's keyword
                        classifier won't overwrite the choice on re-sync. */}
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8, marginBottom: 4 }}>
                      Category
                    </p>
                    <select
                      value={room.category ?? "other"}
                      onChange={(e) => {
                        const next = e.target.value as ScopeCategory;
                        updateRoom(room.id, { category: next, manuallyClassified: true });
                      }}
                      style={{
                        width: "100%",
                        fontSize: 11,
                        padding: "4px 6px",
                        borderRadius: 3,
                        border: "1px solid #D1D5DB",
                        background: "#fff",
                        color: "#374151",
                      }}
                    >
                      {SCOPE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {SCOPE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                    {room.manuallyClassified ? (
                      <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 3, lineHeight: 1.3 }}>
                        Manually set — sync won&rsquo;t change this.
                      </p>
                    ) : (
                      <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 3, lineHeight: 1.3 }}>
                        Auto-classified from scope text.
                      </p>
                    )}

                    {/* Per-item: Section title style */}
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8, marginBottom: 4 }}>Title Style</p>
                    <PFontSelect
                      value={room.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
                      onChange={(v) => updateRoom(room.id, { titleFont: v })}
                    />
                    <div style={{ marginTop: 4 }}>
                      <PSizeSlider accentColor={branding.accentColor} value={room.titleSize ?? 1.0} onChange={(v) => updateRoom(room.id, { titleSize: v })} />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <PStyleButtons
                        bold={room.titleBold ?? true} italic={room.titleItalic} underline={room.titleUnderline}
                        onBold={(v) => updateRoom(room.id, { titleBold: v })}
                        onItalic={(v) => updateRoom(room.id, { titleItalic: v })}
                        onUnderline={(v) => updateRoom(room.id, { titleUnderline: v })}
                      />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <BrandingColorRow branding={branding}
                        value={room.titleColor} defaultVal="#1B2A4A"
                        onChange={(v) => updateRoom(room.id, { titleColor: v })}
                        onReset={() => updateRoom(room.id, { titleColor: undefined })}
                      />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <POutlineRow accentColor={branding.accentColor} value={room.titleOutline} onChangeFn={(v) => updateRoom(room.id, { titleOutline: v ?? undefined })} />
                    </div>

                    {/* Per-item: Section description style */}
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8, marginBottom: 4 }}>Description Style</p>
                    <PFontSelect
                      value={room.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
                      onChange={(v) => updateRoom(room.id, { descriptionFont: v })}
                    />
                    <div style={{ marginTop: 4 }}>
                      <PSizeSlider accentColor={branding.accentColor} value={room.descriptionSize ?? 1.0} onChange={(v) => updateRoom(room.id, { descriptionSize: v })} />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <PStyleButtons
                        bold={room.descriptionBold} italic={room.descriptionItalic} underline={room.descriptionUnderline}
                        onBold={(v) => updateRoom(room.id, { descriptionBold: v })}
                        onItalic={(v) => updateRoom(room.id, { descriptionItalic: v })}
                        onUnderline={(v) => updateRoom(room.id, { descriptionUnderline: v })}
                      />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <BrandingColorRow branding={branding}
                        value={room.descriptionColor} defaultVal="#4B5563"
                        onChange={(v) => updateRoom(room.id, { descriptionColor: v })}
                        onReset={() => updateRoom(room.id, { descriptionColor: undefined })}
                      />
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <POutlineRow accentColor={branding.accentColor} value={room.descriptionOutline} onChangeFn={(v) => updateRoom(room.id, { descriptionOutline: v ?? undefined })} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {PF_GROUP_DIVIDER}

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
                position: "relative", aspectRatio: "16 / 9",
                borderRadius: 4, overflow: "hidden", background: "#E8E6E3",
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
                  position: "absolute", top: 3, right: 3, width: 16, height: 16,
                  borderRadius: "50%", background: "rgba(0,0,0,0.60)", color: "#fff",
                  border: "none", cursor: "pointer", fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                }}
              >
                ✕
              </button>
              <span style={{ position: "absolute", bottom: 3, left: 4, fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          width: "100%", padding: "7px 10px",
          background: photos.length > 0 ? "#F3F4F6" : branding.accentColor + "18",
          color: photos.length > 0 ? "#374151" : branding.textColor,
          border: `1px solid ${photos.length > 0 ? "#D1D5DB" : branding.accentColor}`,
          borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 500,
          textAlign: "center" as const, marginBottom: 4,
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
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedTextLayoutSection content={content} updateContent={updateContent} />
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
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

  const accent = content.accentColor ?? branding.accentColor;

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
      <FieldGroup label="Font">
        <PFontSelect value={content.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ titleFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.titleSize ?? 1.5).toFixed(1)}×`}>
        <PSizeSlider value={content.titleSize ?? 1.5} onChange={(v) => updateContent({ titleSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.titleBold ?? true} italic={content.titleItalic} underline={content.titleUnderline}
          onBold={(v) => updateContent({ titleBold: v })} onItalic={(v) => updateContent({ titleItalic: v })} onUnderline={(v) => updateContent({ titleUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.titleColor}
          defaultVal={isComparisonTable ? "#FFFFFF" : branding.textColor}
          onChange={(v) => updateContent({ titleColor: v })}
          onReset={() => updateContent({ titleColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.titleTextOutline} onChangeFn={(v) => updateContent({ titleTextOutline: v })} accentColor={accent} />
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
        <BrandingColorRow branding={branding} value={content.leftBoxColor} defaultVal="#0D1B2A"
          onChange={(v) => updateContent({ leftBoxColor: v })}
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
        <BrandingColorRow branding={branding} value={content.rightBoxColor} defaultVal={branding.accentColor}
          onChange={(v) => updateContent({ rightBoxColor: v })}
          onReset={() => updateContent({ rightBoxColor: null })} />
      </FieldGroup>

      <Divider />

      {/* ── Column Headers ───────────────────────────────────────────────── */}
      <SectionLabel>Column Headers</SectionLabel>

      <FieldGroup label="Font">
        <PFontSelect value={content.headerFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headerFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headerSize ?? 1.5).toFixed(1)}×`}>
        <PSizeSlider value={content.headerSize ?? 1.5} onChange={(v) => updateContent({ headerSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headerBold ?? true} italic={content.headerItalic} underline={content.headerUnderline}
          onBold={(v) => updateContent({ headerBold: v })} onItalic={(v) => updateContent({ headerItalic: v })} onUnderline={(v) => updateContent({ headerUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headerTextColor} defaultVal="#ffffff"
          onChange={(v) => updateContent({ headerTextColor: v })}
          onReset={() => updateContent({ headerTextColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headerTextOutline} onChangeFn={(v) => updateContent({ headerTextOutline: v })} accentColor={accent} />
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

      {/* ── Body / Bullets ────────────────────────────────────────────────── */}
      <SectionLabel>Body / Bullets</SectionLabel>

      <FieldGroup label={`Size — ${(content.bodySize ?? 1.5).toFixed(1)}×`}>
        <PSizeSlider value={content.bodySize ?? 1.5} onChange={(v) => updateContent({ bodySize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.bodyBold} italic={content.bodyItalic} underline={content.bodyUnderline}
          onBold={(v) => updateContent({ bodyBold: v })} onItalic={(v) => updateContent({ bodyItalic: v })} onUnderline={(v) => updateContent({ bodyUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.bodyTextColor} defaultVal="#ffffff"
          onChange={(v) => updateContent({ bodyTextColor: v })}
          onReset={() => updateContent({ bodyTextColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.bodyTextOutline} onChangeFn={(v) => updateContent({ bodyTextOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── Box Icons ────────────────────────────────────────────────────── */}
      <SectionLabel>Box Icons</SectionLabel>

      <FieldGroup label="Cross ✕ Color">
        <BrandingColorRow branding={branding} value={content.crossColor} defaultVal="#9CA3AF"
          onChange={(v) => updateContent({ crossColor: v })} onReset={() => updateContent({ crossColor: null })} />
      </FieldGroup>
      <FieldGroup label="Check ✓ Color">
        <BrandingColorRow branding={branding} value={content.checkColor} defaultVal={branding.accentColor}
          onChange={(v) => updateContent({ checkColor: v })} onReset={() => updateContent({ checkColor: null })} />
      </FieldGroup>
      <FieldGroup label={`Icon Size — ${(content.iconSize ?? 1.5).toFixed(1)}×`}>
        <PSizeSlider value={content.iconSize ?? 1.5} onChange={(v) => updateContent({ iconSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Icon Outline">
        <POutlineRow value={content.iconOutline} onChangeFn={(v) => updateContent({ iconOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── Bottom Statement ─────────────────────────────────────────────── */}
      <SectionLabel>Bottom Statement</SectionLabel>

      <FieldGroup label="">
        <TextArea value={content.bottomStatement ?? ""}
          onChange={(v) => updateContent({ bottomStatement: v || null })}
          placeholder="A clear plan, a defined budget, and no surprises during construction."
          rows={3} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.bottomFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ bottomFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.bottomSize ?? 1.5).toFixed(1)}×`}>
        <PSizeSlider value={content.bottomSize ?? 1.5} onChange={(v) => updateContent({ bottomSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.bottomBold ?? true} italic={content.bottomItalic ?? true} underline={content.bottomUnderline}
          onBold={(v) => updateContent({ bottomBold: v })} onItalic={(v) => updateContent({ bottomItalic: v })} onUnderline={(v) => updateContent({ bottomUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.bottomColor} defaultVal={branding.accentColor}
          onChange={(v) => updateContent({ bottomColor: v })} onReset={() => updateContent({ bottomColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.bottomTextOutline} onChangeFn={(v) => updateContent({ bottomTextOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedCardStyleSection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Process Inspector ───────────────────────────────────────────────────────

function ProcessInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
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

  const locked = !!content.lockItemStyles;

  /** Style-only keys for ProcessStage that get propagated when locked. */
  const STAGE_STYLE_KEYS: (keyof ProcessStage)[] = [
    "nameFont", "nameSize", "nameBold", "nameItalic", "nameUnderline", "nameColor", "nameOutline",
    "bulletsFont", "bulletsSize", "bulletsBold", "bulletsItalic", "bulletsUnderline", "bulletsColor", "bulletsOutline",
  ];

  function updateStage(stageIdx: number, patch: Partial<ProcessStage>) {
    let updated = stages.map((s, i) =>
      i === stageIdx ? { ...s, ...patch } : s
    );
    // When locked and editing first item's style, propagate to all others
    if (locked && stageIdx === 0) {
      const stylePatch: Partial<ProcessStage> = {};
      for (const k of STAGE_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((s, i) => i === 0 ? s : { ...s, ...stylePatch });
      }
    }
    updateContent({ stages: updated });
  }

  function updateBullet(stageIdx: number, bulletIdx: number, value: string) {
    const bullets = [...(stages[stageIdx]?.bullets ?? [])];
    bullets[bulletIdx] = value;
    updateStage(stageIdx, { bullets });
  }

  return (
    <>
      {/* ── SLIDE TITLE ───────────────────────────────────────────────── */}
      <SectionLabel>Slide Title</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Our Process: From Vision to Finished Home"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
          onChange={(v) => updateContent({ slideTitleFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.slideTitleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.slideTitleSize ?? 1.0}
          onChange={(v) => updateContent({ slideTitleSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.slideTitleBold ?? true} italic={content.slideTitleItalic} underline={content.slideTitleUnderline}
        onBold={(v) => updateContent({ slideTitleBold: v })}
        onItalic={(v) => updateContent({ slideTitleItalic: v })}
        onUnderline={(v) => updateContent({ slideTitleUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.slideTitleColor}
            defaultVal="#1B2A4A"
            onChange={(v) => updateContent({ slideTitleColor: v })}
            onReset={() => updateContent({ slideTitleColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.slideTitleOutline} onChangeFn={(v) => updateContent({ slideTitleOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── STAGES ────────────────────────────────────────────────────── */}
      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v && stages.length > 1) {
          // Copy style fields from stage[0] to all others
          const src = stages[0];
          const stylePatch: Partial<ProcessStage> = {};
          for (const k of STAGE_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
          const synced = stages.map((s, i) => i === 0 ? s : { ...s, ...stylePatch });
          updateContent({ lockItemStyles: true, stages: synced });
        } else {
          updateContent({ lockItemStyles: v || null });
        }
      }} />
      {stages.map((stage, si) => (
        <div key={si} style={{ marginBottom: 16 }}>
          <SectionLabel>Stage {si + 1}</SectionLabel>

          {/* Stage name */}
          <FieldGroup label="Name">
            <TextInput
              value={stage.name}
              onChange={(v) => updateStage(si, { name: v })}
              placeholder={["Discovery & Design", "Plan & Select", "Build & Deliver"][si] ?? `Stage ${si + 1}`}
            />
          </FieldGroup>

          {/* Per-item: Name style — hidden for items 1+ when locked */}
          {(!locked || si === 0) && (
            <>
              <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6, marginBottom: 4 }}>Name Style{locked ? " (applies to all)" : ""}</p>
              <PFontSelect
                value={stage.nameFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline}
                onChange={(v) => updateStage(si, { nameFont: v })}
              />
              <div style={{ marginTop: 4 }}>
                <PSizeSlider accentColor={branding.accentColor} value={stage.nameSize ?? 1.0} onChange={(v) => updateStage(si, { nameSize: v })} />
              </div>
              <div style={{ marginTop: 4 }}>
                <PStyleButtons
                  bold={stage.nameBold ?? true} italic={stage.nameItalic} underline={stage.nameUnderline}
                  onBold={(v) => updateStage(si, { nameBold: v })}
                  onItalic={(v) => updateStage(si, { nameItalic: v })}
                  onUnderline={(v) => updateStage(si, { nameUnderline: v })}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <BrandingColorRow branding={branding}
                  value={stage.nameColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateStage(si, { nameColor: v })}
                  onReset={() => updateStage(si, { nameColor: undefined })}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <POutlineRow accentColor={branding.accentColor} value={stage.nameOutline} onChangeFn={(v) => updateStage(si, { nameOutline: v ?? undefined })} />
              </div>
            </>
          )}

          {/* Bullets */}
          <div style={{ marginTop: 8 }}>
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

          {/* Per-item: Bullets style — hidden for items 1+ when locked */}
          {(!locked || si === 0) && (
            <>
              <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6, marginBottom: 4 }}>Bullets Style{locked ? " (applies to all)" : ""}</p>
              <PFontSelect
                value={stage.bulletsFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
                onChange={(v) => updateStage(si, { bulletsFont: v })}
              />
              <div style={{ marginTop: 4 }}>
                <PSizeSlider accentColor={branding.accentColor} value={stage.bulletsSize ?? 1.0} onChange={(v) => updateStage(si, { bulletsSize: v })} />
              </div>
              <div style={{ marginTop: 4 }}>
                <PStyleButtons
                  bold={stage.bulletsBold} italic={stage.bulletsItalic} underline={stage.bulletsUnderline}
                  onBold={(v) => updateStage(si, { bulletsBold: v })}
                  onItalic={(v) => updateStage(si, { bulletsItalic: v })}
                  onUnderline={(v) => updateStage(si, { bulletsUnderline: v })}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <BrandingColorRow branding={branding}
                  value={stage.bulletsColor} defaultVal="#4A5568"
                  onChange={(v) => updateStage(si, { bulletsColor: v })}
                  onReset={() => updateStage(si, { bulletsColor: undefined })}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <POutlineRow accentColor={branding.accentColor} value={stage.bulletsOutline} onChangeFn={(v) => updateStage(si, { bulletsOutline: v ?? undefined })} />
              </div>
            </>
          )}

          {PF_GROUP_DIVIDER}
        </div>
      ))}

      {/* ── FOOTER CTA ────────────────────────────────────────────────── */}
      <SectionLabel>Footer CTA</SectionLabel>
      <FieldGroup label="Text">
        <TextArea
          value={content.bottomStatement ?? ""}
          onChange={(v) => updateContent({ bottomStatement: v || null })}
          placeholder="Every detail is planned before we break ground…"
          rows={3}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.footerFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body}
          onChange={(v) => updateContent({ footerFont: v })}
        />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.footerSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider
          accentColor={branding.accentColor}
          value={content.footerSize ?? 1.0}
          onChange={(v) => updateContent({ footerSize: v })}
        />
      </FieldGroup>
      <PStyleButtons
        bold={content.footerBold} italic={content.footerItalic} underline={content.footerUnderline}
        onBold={(v) => updateContent({ footerBold: v })}
        onItalic={(v) => updateContent({ footerItalic: v })}
        onUnderline={(v) => updateContent({ footerUnderline: v })}
      />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.footerColor}
            defaultVal="#6B7280"
            onChange={(v) => updateContent({ footerColor: v })}
            onReset={() => updateContent({ footerColor: null })}
          />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.footerOutline} onChangeFn={(v) => updateContent({ footerOutline: v })} />
      </FieldGroup>

      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <SharedCardStyleSection content={content} updateContent={updateContent} />
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Core Values Inspector ──────────────────────────────────────────────────

const DEFAULT_CV_VALUES = HHI_DEFAULT_CORE_VALUES;

function CoreValuesInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as CoreValuesContent;
  const values = content.values ?? DEFAULT_CV_VALUES;

  function updateContent(patch: Partial<CoreValuesContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const locked = !!content.lockItemStyles;

  const CV_STYLE_KEYS: (keyof CoreValue)[] = [
    "nameFont", "nameSize", "nameBold", "nameItalic", "nameUnderline", "nameColor", "nameOutline",
    "descriptorFont", "descriptorSize", "descriptorBold", "descriptorItalic", "descriptorUnderline", "descriptorColor", "descriptorOutline",
    "descriptionFont", "descriptionSize", "descriptionBold", "descriptionItalic", "descriptionUnderline", "descriptionColor", "descriptionOutline",
  ];

  function updateValue(idx: number, patch: Partial<CoreValue>) {
    let updated = values.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    if (locked && idx === 0) {
      const stylePatch: Partial<CoreValue> = {};
      for (const k of CV_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((v, i) => i === 0 ? v : { ...v, ...stylePatch });
      }
    }
    updateContent({ values: updated });
  }

  function moveValue(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= values.length) return;
    const updated = [...values];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ values: updated });
  }

  function resetToDefaults() {
    updateContent({ values: DEFAULT_CV_VALUES, sectionLabel: "WHO WE ARE" });
    onUpdate({ ...slide, headline: "Built on a Foundation of Values", content: { ...content, values: DEFAULT_CV_VALUES, sectionLabel: "WHO WE ARE" } });
  }

  const accent = content.accentColor ?? branding.accentColor;

  return (
    <>
      {/* ── Section Label ───────────────────────────────────────────── */}
      <SectionLabel>Section Label</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={content.sectionLabel ?? ""}
          onChange={(v) => updateContent({ sectionLabel: v || null })}
          placeholder="WHO WE ARE"
        />
      </FieldGroup>
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <FieldGroup label="Label Font">
        <PFontSelect value={content.sectionLabelFont ?? SLIDE_FONTS.defaults.label} onChange={(v) => updateContent({ sectionLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label="Label Color">
        <BrandingColorRow branding={branding} value={content.sectionLabelColor} defaultVal={accent}
          onChange={(v) => updateContent({ sectionLabelColor: v })}
          onReset={() => updateContent({ sectionLabelColor: null })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── Slide Title ─────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Built on a Foundation of Values"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ slideTitleFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.slideTitleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.slideTitleSize ?? 1.0} onChange={(v) => updateContent({ slideTitleSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.slideTitleBold ?? true} italic={content.slideTitleItalic ?? true} underline={content.slideTitleUnderline}
          onBold={(v) => updateContent({ slideTitleBold: v })} onItalic={(v) => updateContent({ slideTitleItalic: v })} onUnderline={(v) => updateContent({ slideTitleUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.slideTitleColor} defaultVal={branding.textColor}
          onChange={(v) => updateContent({ slideTitleColor: v })}
          onReset={() => updateContent({ slideTitleColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.slideTitleOutline} onChangeFn={(v) => updateContent({ slideTitleOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── Value items ─────────────────────────────────────────────── */}
      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v && values.length > 1) {
          const src = values[0];
          const stylePatch: Partial<CoreValue> = {};
          for (const k of CV_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
          const synced = values.map((val, i) => i === 0 ? val : { ...val, ...stylePatch });
          updateContent({ lockItemStyles: true, values: synced });
        } else {
          updateContent({ lockItemStyles: v || null });
        }
      }} />
      {values.map((val, vi) => (
        <div key={val.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel>Value {vi + 1}</SectionLabel>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => moveValue(vi, -1)} disabled={vi === 0}
                style={{ fontSize: 11, color: vi === 0 ? "#D1D5DB" : "#6B7280", cursor: vi === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
              <button onClick={() => moveValue(vi, 1)} disabled={vi === values.length - 1}
                style={{ fontSize: 11, color: vi === values.length - 1 ? "#D1D5DB" : "#6B7280", cursor: vi === values.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
            </div>
          </div>

          {/* Name */}
          <FieldGroup label="Name">
            <TextInput value={val.name} onChange={(v) => updateValue(vi, { name: v })} placeholder={DEFAULT_CV_VALUES[vi]?.name ?? "VALUE NAME"} />
          </FieldGroup>
          {(!locked || vi === 0) && (
            <>
              <FieldGroup label={`Name Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={val.nameFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateValue(vi, { nameFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Name Size — ${(val.nameSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={val.nameSize ?? 1.0} onChange={(v) => updateValue(vi, { nameSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Name Style">
                <PStyleButtons bold={val.nameBold ?? true} italic={val.nameItalic} underline={val.nameUnderline}
                  onBold={(v) => updateValue(vi, { nameBold: v })} onItalic={(v) => updateValue(vi, { nameItalic: v })} onUnderline={(v) => updateValue(vi, { nameUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Name Color">
                <BrandingColorRow branding={branding} value={val.nameColor} defaultVal={branding.textColor}
                  onChange={(v) => updateValue(vi, { nameColor: v })} onReset={() => updateValue(vi, { nameColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Name Outline">
                <POutlineRow value={val.nameOutline} onChangeFn={(v) => updateValue(vi, { nameOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Descriptor */}
          <FieldGroup label="Descriptor">
            <TextInput value={val.descriptor} onChange={(v) => updateValue(vi, { descriptor: v })} placeholder={DEFAULT_CV_VALUES[vi]?.descriptor ?? ""} />
          </FieldGroup>
          {(!locked || vi === 0) && (
            <>
              <FieldGroup label={`Descriptor Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={val.descriptorFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateValue(vi, { descriptorFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Descriptor Size — ${(val.descriptorSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={val.descriptorSize ?? 1.0} onChange={(v) => updateValue(vi, { descriptorSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Descriptor Style">
                <PStyleButtons bold={val.descriptorBold} italic={val.descriptorItalic ?? true} underline={val.descriptorUnderline}
                  onBold={(v) => updateValue(vi, { descriptorBold: v })} onItalic={(v) => updateValue(vi, { descriptorItalic: v })} onUnderline={(v) => updateValue(vi, { descriptorUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Descriptor Color">
                <BrandingColorRow branding={branding} value={val.descriptorColor} defaultVal="#4A5568"
                  onChange={(v) => updateValue(vi, { descriptorColor: v })} onReset={() => updateValue(vi, { descriptorColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Descriptor Outline">
                <POutlineRow value={val.descriptorOutline} onChangeFn={(v) => updateValue(vi, { descriptorOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Description */}
          <FieldGroup label="Description">
            <TextArea value={val.description} onChange={(v) => updateValue(vi, { description: v })} placeholder={DEFAULT_CV_VALUES[vi]?.description ?? ""} rows={3} />
          </FieldGroup>
          {(!locked || vi === 0) && (
            <>
              <FieldGroup label={`Description Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={val.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateValue(vi, { descriptionFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Description Size — ${(val.descriptionSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={val.descriptionSize ?? 1.0} onChange={(v) => updateValue(vi, { descriptionSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Description Style">
                <PStyleButtons bold={val.descriptionBold} italic={val.descriptionItalic} underline={val.descriptionUnderline}
                  onBold={(v) => updateValue(vi, { descriptionBold: v })} onItalic={(v) => updateValue(vi, { descriptionItalic: v })} onUnderline={(v) => updateValue(vi, { descriptionUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Description Color">
                <BrandingColorRow branding={branding} value={val.descriptionColor} defaultVal={branding.textColor}
                  onChange={(v) => updateValue(vi, { descriptionColor: v })} onReset={() => updateValue(vi, { descriptionColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Description Outline">
                <POutlineRow value={val.descriptionOutline} onChangeFn={(v) => updateValue(vi, { descriptionOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}
        </div>
      ))}

      <SharedCardStyleSection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />

      <Divider />

      <button
        onClick={resetToDefaults}
        className="w-full rounded"
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "6px 10px",
          border: "1px solid #D1D5DB",
          background: "#F9FAFB",
          color: "#6B7280",
          cursor: "pointer",
        }}
      >
        Reset to Defaults
      </button>
    </>
  );
}

// ─── Project Timeline Inspector ─────────────────────────────────────────────

const DEFAULT_TL_PHASES: ProjectPhase[] = [
  { id: "design", name: "Architectural Design", duration: "8 \u2013 12 weeks", description: "Deep collaboration to create the exact remodel plan. HOA and permit approvals are secured during this window." },
  { id: "precon", name: "Pre-Construction", duration: "3 \u2013 5 weeks", description: "Material specification, permit document preparation, and cross-team review to generate the absolute final fixed-price build budget." },
  { id: "construction", name: "Construction", duration: "10 \u2013 14 weeks", description: "Our build team and specialized subcontractors execute the agreed plan with daily oversight and minimal disruption to your home." },
];

function ProjectTimelineInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ProjectTimelineContent;
  const phases = content.phases ?? DEFAULT_TL_PHASES;
  const accent = content.accentColor ?? branding.accentColor;
  const layoutKey = slide.layoutKey as string;

  function updateContent(patch: Partial<ProjectTimelineContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function updatePhase(idx: number, patch: Partial<ProjectPhase>) {
    const updated = phases.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    updateContent({ phases: updated });
  }

  function movePhase(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= phases.length) return;
    const updated = [...phases];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ phases: updated });
  }

  function addPhase() {
    updateContent({
      phases: [...phases, { id: `phase-${Date.now()}`, name: "New Phase", duration: "", description: "" }],
    });
  }

  function removePhase(idx: number) {
    updateContent({ phases: phases.filter((_, i) => i !== idx) });
  }

  function resetToDefaults() {
    updateContent({ phases: DEFAULT_TL_PHASES, sectionLabel: "YOUR PROJECT", footnoteText: null });
    onUpdate({ ...slide, headline: "Projected Timeline", content: { ...content, phases: DEFAULT_TL_PHASES, sectionLabel: "YOUR PROJECT", footnoteText: null } });
  }

  return (
    <>
      {/* ── Section Label (font + color only) ──────────── */}
      <SectionLabel>Section Label</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={content.sectionLabel ?? ""}
          onChange={(v) => updateContent({ sectionLabel: v || null })}
          placeholder="YOUR PROJECT"
        />
      </FieldGroup>
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <FieldGroup label="Label Font">
        <PFontSelect value={content.sectionLabelFont ?? SLIDE_FONTS.defaults.label} onChange={(v) => updateContent({ sectionLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label="Label Color">
        <BrandingColorRow branding={branding} value={content.sectionLabelColor} defaultVal={accent}
          onChange={(v) => updateContent({ sectionLabelColor: v })} onReset={() => updateContent({ sectionLabelColor: null })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── HEADLINE ─────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Projected Timeline"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headlineBold ?? true} italic={content.headlineItalic} underline={content.headlineUnderline}
          onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headlineColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── FOOTNOTE ─────────────────────────────────── */}
      <SectionLabel>Footnote</SectionLabel>
      <FieldGroup label="">
        <TextArea
          value={content.footnoteText ?? ""}
          onChange={(v) => updateContent({ footnoteText: v || null })}
          placeholder="Optional footnote text"
          rows={2}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.footnoteFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ footnoteFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.footnoteSize ?? 0.7).toFixed(1)}×`}>
        <PSizeSlider value={content.footnoteSize ?? 0.7} onChange={(v) => updateContent({ footnoteSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.footnoteBold} italic={content.footnoteItalic} underline={content.footnoteUnderline}
          onBold={(v) => updateContent({ footnoteBold: v })} onItalic={(v) => updateContent({ footnoteItalic: v })} onUnderline={(v) => updateContent({ footnoteUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.footnoteColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ footnoteColor: v })} onReset={() => updateContent({ footnoteColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.footnoteOutline} onChangeFn={(v) => updateContent({ footnoteOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── PHASES ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Phases</SectionLabel>
        <button
          onClick={addPhase}
          style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}
        >
          + Add
        </button>
      </div>

      {phases.map((phase, pi) => (
        <div key={phase.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel>Phase {pi + 1}</SectionLabel>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => movePhase(pi, -1)} disabled={pi === 0} style={{ fontSize: 11, color: pi === 0 ? "#D1D5DB" : "#6B7280", cursor: pi === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
              <button onClick={() => movePhase(pi, 1)} disabled={pi === phases.length - 1} style={{ fontSize: 11, color: pi === phases.length - 1 ? "#D1D5DB" : "#6B7280", cursor: pi === phases.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
              {phases.length > 1 && (
                <button onClick={() => removePhase(pi)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>
              )}
            </div>
          </div>

          {/* Name */}
          <FieldGroup label="Name">
            <TextInput value={phase.name} onChange={(v) => updatePhase(pi, { name: v })} placeholder="Phase name" />
          </FieldGroup>
          <FieldGroup label="Name Font">
            <PFontSelect value={phase.nameFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePhase(pi, { nameFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Name Size — ${(phase.nameSize ?? 1.2).toFixed(1)}×`}>
            <PSizeSlider value={phase.nameSize ?? 1.2} onChange={(v) => updatePhase(pi, { nameSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Name Style">
            <PStyleButtons bold={phase.nameBold ?? true} italic={phase.nameItalic} underline={phase.nameUnderline}
              onBold={(v) => updatePhase(pi, { nameBold: v })} onItalic={(v) => updatePhase(pi, { nameItalic: v })} onUnderline={(v) => updatePhase(pi, { nameUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Name Color">
            <BrandingColorRow branding={branding} value={phase.nameColor} defaultVal="#1B2A4A"
              onChange={(v) => updatePhase(pi, { nameColor: v })} onReset={() => updatePhase(pi, { nameColor: undefined })} />
          </FieldGroup>
          <FieldGroup label="Name Outline">
            <POutlineRow value={phase.nameOutline} onChangeFn={(v) => updatePhase(pi, { nameOutline: v })} accentColor={accent} />
          </FieldGroup>

          {PF_GROUP_DIVIDER}

          {/* Duration */}
          <FieldGroup label="Duration">
            <TextInput value={phase.duration} onChange={(v) => updatePhase(pi, { duration: v })} placeholder="e.g. 8 – 12 weeks" />
          </FieldGroup>
          <FieldGroup label="Duration Font">
            <PFontSelect value={phase.durationFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePhase(pi, { durationFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Duration Size — ${(phase.durationSize ?? 0.9).toFixed(1)}×`}>
            <PSizeSlider value={phase.durationSize ?? 0.9} onChange={(v) => updatePhase(pi, { durationSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Duration Style">
            <PStyleButtons bold={phase.durationBold} italic={phase.durationItalic} underline={phase.durationUnderline}
              onBold={(v) => updatePhase(pi, { durationBold: v })} onItalic={(v) => updatePhase(pi, { durationItalic: v })} onUnderline={(v) => updatePhase(pi, { durationUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Duration Color">
            <BrandingColorRow branding={branding} value={phase.durationColor} defaultVal={accent}
              onChange={(v) => updatePhase(pi, { durationColor: v })} onReset={() => updatePhase(pi, { durationColor: undefined })} />
          </FieldGroup>
          <FieldGroup label="Duration Outline">
            <POutlineRow value={phase.durationOutline} onChangeFn={(v) => updatePhase(pi, { durationOutline: v })} accentColor={accent} />
          </FieldGroup>

          {PF_GROUP_DIVIDER}

          {/* Description */}
          <FieldGroup label="Description">
            <TextArea value={phase.description} onChange={(v) => updatePhase(pi, { description: v })} placeholder="" rows={2} />
          </FieldGroup>
          <FieldGroup label="Desc Font">
            <PFontSelect value={phase.descriptionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePhase(pi, { descriptionFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Desc Size — ${(phase.descriptionSize ?? 0.9).toFixed(1)}×`}>
            <PSizeSlider value={phase.descriptionSize ?? 0.9} onChange={(v) => updatePhase(pi, { descriptionSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Desc Style">
            <PStyleButtons bold={phase.descriptionBold} italic={phase.descriptionItalic} underline={phase.descriptionUnderline}
              onBold={(v) => updatePhase(pi, { descriptionBold: v })} onItalic={(v) => updatePhase(pi, { descriptionItalic: v })} onUnderline={(v) => updatePhase(pi, { descriptionUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Desc Color">
            <BrandingColorRow branding={branding} value={phase.descriptionColor} defaultVal="#4A5568"
              onChange={(v) => updatePhase(pi, { descriptionColor: v })} onReset={() => updatePhase(pi, { descriptionColor: undefined })} />
          </FieldGroup>
          <FieldGroup label="Desc Outline">
            <POutlineRow value={phase.descriptionOutline} onChangeFn={(v) => updatePhase(pi, { descriptionOutline: v })} accentColor={accent} />
          </FieldGroup>

          {/* Note (shown only for Stepped Hierarchy layout) */}
          {layoutKey === "stepped-hierarchy" && (
            <>
              {PF_GROUP_DIVIDER}
              <FieldGroup label="Note (optional)">
                <TextInput value={phase.note ?? ""} onChange={(v) => updatePhase(pi, { note: v || null })} placeholder="Sub-note for Stepped layout" />
              </FieldGroup>
              <FieldGroup label="Note Font">
                <PFontSelect value={phase.noteFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePhase(pi, { noteFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Note Size — ${(phase.noteSize ?? 0.8).toFixed(1)}×`}>
                <PSizeSlider value={phase.noteSize ?? 0.8} onChange={(v) => updatePhase(pi, { noteSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Note Style">
                <PStyleButtons bold={phase.noteBold} italic={phase.noteItalic} underline={phase.noteUnderline}
                  onBold={(v) => updatePhase(pi, { noteBold: v })} onItalic={(v) => updatePhase(pi, { noteItalic: v })} onUnderline={(v) => updatePhase(pi, { noteUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Note Color">
                <BrandingColorRow branding={branding} value={phase.noteColor} defaultVal="#4A5568"
                  onChange={(v) => updatePhase(pi, { noteColor: v })} onReset={() => updatePhase(pi, { noteColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Note Outline">
                <POutlineRow value={phase.noteOutline} onChangeFn={(v) => updatePhase(pi, { noteOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {/* Note field always visible for non-stepped layouts (text only, no style) */}
          {layoutKey !== "stepped-hierarchy" && (
            <FieldGroup label="Note (optional)">
              <TextInput value={phase.note ?? ""} onChange={(v) => updatePhase(pi, { note: v || null })} placeholder="Sub-note for Stepped layout" />
            </FieldGroup>
          )}
        </div>
      ))}

      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} showSizeControls />
      <SharedTextLayoutSection content={content} updateContent={updateContent} />
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />

      <Divider />

      <button
        onClick={resetToDefaults}
        className="w-full rounded"
        style={{ fontSize: 11, fontWeight: 500, padding: "6px 10px", border: "1px solid #D1D5DB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}
      >
        Reset to Defaults
      </button>
    </>
  );
}

// ─── COPE Page Inspector ────────────────────────────────────────────────────

const DEFAULT_COPE = HHI_DEFAULT_COPE_ITEMS;

function CopePageInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as CopePageContent;
  const items = content.items ?? DEFAULT_COPE;
  const [brandIcons, setBrandIcons] = useState<TemplateCIcon[]>([]);
  const [iconsLoaded, setIconsLoaded] = useState(false);

  useEffect(() => {
    if (iconsLoaded) return;
    import("@/app/admin/settings/actions").then((mod) => {
      mod.listBrandIcons().then((icons) => {
        setBrandIcons(icons.map((i) => ({ id: i.id, imageUrl: i.imageUrl, name: i.name })));
        setIconsLoaded(true);
      });
    });
  }, [iconsLoaded]);

  function updateContent(patch: Partial<CopePageContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const locked = !!content.lockItemStyles;

  const COPE_STYLE_KEYS: (keyof CopeItem)[] = [
    "titleFont", "titleSize", "titleBold", "titleItalic", "titleUnderline", "titleColor", "titleOutline",
    "descriptionFont", "descriptionSize", "descriptionBold", "descriptionItalic", "descriptionUnderline", "descriptionColor", "descriptionOutline",
    "bulletsFont", "bulletsSize", "bulletsBold", "bulletsItalic", "bulletsUnderline", "bulletsColor", "bulletsOutline",
  ];

  function updateItem(idx: number, patch: Partial<CopeItem>) {
    let updated = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    if (locked && idx === 0) {
      const stylePatch: Partial<CopeItem> = {};
      for (const k of COPE_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((it, i) => i === 0 ? it : { ...it, ...stylePatch });
      }
    }
    updateContent({ items: updated });
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const updated = [...items];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ items: updated });
  }

  function addItem() {
    updateContent({
      items: [...items, { id: `cope-${Date.now()}`, title: "New Item", description: "", icon: "FileCheck", bullets: [] }],
    });
  }

  function removeItem(idx: number) {
    updateContent({ items: items.filter((_, i) => i !== idx) });
  }

  function updateBullet(itemIdx: number, bulletIdx: number, value: string) {
    const bullets = [...(items[itemIdx]?.bullets ?? [])];
    bullets[bulletIdx] = value;
    updateItem(itemIdx, { bullets });
  }

  function addBullet(itemIdx: number) {
    const bullets = [...(items[itemIdx]?.bullets ?? []), ""];
    updateItem(itemIdx, { bullets });
  }

  function removeBullet(itemIdx: number, bulletIdx: number) {
    const bullets = (items[itemIdx]?.bullets ?? []).filter((_, i) => i !== bulletIdx);
    updateItem(itemIdx, { bullets });
  }

  function resetToDefaults() {
    updateContent({ items: DEFAULT_COPE, sectionLabel: "WHAT\u2019S INCLUDED", subheadline: null });
    onUpdate({ ...slide, headline: "The Cost of Project Execution", content: { ...content, items: DEFAULT_COPE, sectionLabel: "WHAT\u2019S INCLUDED", subheadline: null } });
  }

  const accent = content.accentColor ?? branding.accentColor;

  return (
    <>
      {/* ── Section Label ───────────────────────────────────────────── */}
      <SectionLabel>Section Label</SectionLabel>
      <FieldGroup label="">
        <TextInput value={content.sectionLabel ?? ""} onChange={(v) => updateContent({ sectionLabel: v || null })} placeholder="WHAT'S INCLUDED" />
      </FieldGroup>
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <FieldGroup label="Label Font">
        <PFontSelect value={content.sectionLabelFont ?? SLIDE_FONTS.defaults.label} onChange={(v) => updateContent({ sectionLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label="Label Color">
        <BrandingColorRow branding={branding} value={content.sectionLabelColor} defaultVal={accent}
          onChange={(v) => updateContent({ sectionLabelColor: v })} onReset={() => updateContent({ sectionLabelColor: null })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── Slide Title ─────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput value={slide.headline ?? ""} onChange={(v) => onUpdate({ ...slide, headline: v || null })} placeholder="The Cost of Project Execution" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ slideTitleFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.slideTitleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.slideTitleSize ?? 1.0} onChange={(v) => updateContent({ slideTitleSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.slideTitleBold ?? true} italic={content.slideTitleItalic ?? true} underline={content.slideTitleUnderline}
          onBold={(v) => updateContent({ slideTitleBold: v })} onItalic={(v) => updateContent({ slideTitleItalic: v })} onUnderline={(v) => updateContent({ slideTitleUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.slideTitleColor} defaultVal={branding.textColor}
          onChange={(v) => updateContent({ slideTitleColor: v })} onReset={() => updateContent({ slideTitleColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.slideTitleOutline} onChangeFn={(v) => updateContent({ slideTitleOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── Subheadline ─────────────────────────────────────────────── */}
      <SectionLabel>Subheadline</SectionLabel>
      <FieldGroup label="">
        <TextInput value={content.subheadline ?? ""} onChange={(v) => updateContent({ subheadline: v || null })} placeholder="Optional supporting line" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ subheadlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.subheadlineSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.subheadlineSize ?? 1.0} onChange={(v) => updateContent({ subheadlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.subheadlineBold} italic={content.subheadlineItalic ?? true} underline={content.subheadlineUnderline}
          onBold={(v) => updateContent({ subheadlineBold: v })} onItalic={(v) => updateContent({ subheadlineItalic: v })} onUnderline={(v) => updateContent({ subheadlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.subheadlineColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ subheadlineColor: v })} onReset={() => updateContent({ subheadlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.subheadlineOutline} onChangeFn={(v) => updateContent({ subheadlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── COPE Items ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>COPE Items</SectionLabel>
        <button onClick={addItem} style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>+ Add</button>
      </div>
      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v && items.length > 1) {
          const src = items[0];
          const stylePatch: Partial<CopeItem> = {};
          for (const k of COPE_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
          const synced = items.map((it, i) => i === 0 ? it : { ...it, ...stylePatch });
          updateContent({ lockItemStyles: true, items: synced });
        } else {
          updateContent({ lockItemStyles: v || null });
        }
      }} />

      {items.map((item, ii) => (
        <div key={item.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel>Item {ii + 1}</SectionLabel>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => moveItem(ii, -1)} disabled={ii === 0} style={{ fontSize: 11, color: ii === 0 ? "#D1D5DB" : "#6B7280", cursor: ii === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
              <button onClick={() => moveItem(ii, 1)} disabled={ii === items.length - 1} style={{ fontSize: 11, color: ii === items.length - 1 ? "#D1D5DB" : "#6B7280", cursor: ii === items.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
              {items.length > 1 && (
                <button onClick={() => removeItem(ii)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>
              )}
            </div>
          </div>

          {/* Title */}
          <FieldGroup label="Title">
            <TextInput value={item.title} onChange={(v) => updateItem(ii, { title: v })} placeholder="Item title" />
          </FieldGroup>
          {(!locked || ii === 0) && (
            <>
              <FieldGroup label={`Title Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={item.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateItem(ii, { titleFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Title Size — ${(item.titleSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={item.titleSize ?? 1.0} onChange={(v) => updateItem(ii, { titleSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Title Style">
                <PStyleButtons bold={item.titleBold ?? true} italic={item.titleItalic} underline={item.titleUnderline}
                  onBold={(v) => updateItem(ii, { titleBold: v })} onItalic={(v) => updateItem(ii, { titleItalic: v })} onUnderline={(v) => updateItem(ii, { titleUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Title Color">
                <BrandingColorRow branding={branding} value={item.titleColor} defaultVal={branding.textColor}
                  onChange={(v) => updateItem(ii, { titleColor: v })} onReset={() => updateItem(ii, { titleColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Title Outline">
                <POutlineRow value={item.titleOutline} onChangeFn={(v) => updateItem(ii, { titleOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Description */}
          <FieldGroup label="Description">
            <TextArea value={item.description} onChange={(v) => updateItem(ii, { description: v })} placeholder="" rows={2} />
          </FieldGroup>
          {(!locked || ii === 0) && (
            <>
              <FieldGroup label={`Desc Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={item.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateItem(ii, { descriptionFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Desc Size — ${(item.descriptionSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={item.descriptionSize ?? 1.0} onChange={(v) => updateItem(ii, { descriptionSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Desc Style">
                <PStyleButtons bold={item.descriptionBold} italic={item.descriptionItalic} underline={item.descriptionUnderline}
                  onBold={(v) => updateItem(ii, { descriptionBold: v })} onItalic={(v) => updateItem(ii, { descriptionItalic: v })} onUnderline={(v) => updateItem(ii, { descriptionUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Desc Color">
                <BrandingColorRow branding={branding} value={item.descriptionColor} defaultVal="#4B5563"
                  onChange={(v) => updateItem(ii, { descriptionColor: v })} onReset={() => updateItem(ii, { descriptionColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Desc Outline">
                <POutlineRow value={item.descriptionOutline} onChangeFn={(v) => updateItem(ii, { descriptionOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          <FieldGroup label="">
            <TemplateCIconPicker
              icons={brandIcons}
              value={item.iconId ?? null}
              onChange={(iconId) => {
                const ic = iconId ? brandIcons.find((i) => i.id === iconId) : null;
                updateItem(ii, { iconId: iconId ?? null, iconUrl: ic?.imageUrl ?? null });
              }}
              label="Icon"
            />
          </FieldGroup>
          <FieldGroup label="Callout Label">
            <TextInput value={item.calloutLabel ?? ""} onChange={(v) => updateItem(ii, { calloutLabel: v || null })} placeholder="Short label for Annotated layout" />
          </FieldGroup>

          {/* Bullets */}
          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>Bullets</label>
              <button onClick={() => addBullet(ii)} style={{ fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "none", padding: 0 }}>+ bullet</button>
            </div>
            {(item.bullets ?? []).map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
                <TextInput value={b} onChange={(v) => updateBullet(ii, bi, v)} placeholder="" />
                <button onClick={() => removeBullet(ii, bi)} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 2px", flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Bullets style */}
          {(!locked || ii === 0) && (
            <>
              <FieldGroup label={`Bullets Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={item.bulletsFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateItem(ii, { bulletsFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Bullets Size — ${(item.bulletsSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={item.bulletsSize ?? 1.0} onChange={(v) => updateItem(ii, { bulletsSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Bullets Style">
                <PStyleButtons bold={item.bulletsBold} italic={item.bulletsItalic} underline={item.bulletsUnderline}
                  onBold={(v) => updateItem(ii, { bulletsBold: v })} onItalic={(v) => updateItem(ii, { bulletsItalic: v })} onUnderline={(v) => updateItem(ii, { bulletsUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Bullets Color">
                <BrandingColorRow branding={branding} value={item.bulletsColor} defaultVal={branding.textColor}
                  onChange={(v) => updateItem(ii, { bulletsColor: v })} onReset={() => updateItem(ii, { bulletsColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Bullets Outline">
                <POutlineRow value={item.bulletsOutline} onChangeFn={(v) => updateItem(ii, { bulletsOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}
        </div>
      ))}

      <SharedCardStyleSection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />

      <Divider />

      <button onClick={resetToDefaults} className="w-full rounded" style={{ fontSize: 11, fontWeight: 500, padding: "6px 10px", border: "1px solid #D1D5DB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}>
        Reset to Defaults
      </button>
    </>
  );
}

// ─── Design Retainer Inspector ─────────────────────────────────────────────

function DesignRetainerInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as DesignRetainerContent;
  const rawBenefits = content.benefits ?? DEFAULT_DESIGN_RETAINER_BENEFITS;
  const benefits: DesignRetainerBenefit[] = rawBenefits.map((b) =>
    typeof b === "string" ? { text: b } : b
  );
  const layoutKey = slide.layoutKey as string;
  const [bgImagePickerOpen, setBgImagePickerOpen] = useState(false);
  const resolvedAccent = content.accentColor ?? "#B8860B";

  function updateContent(patch: Partial<DesignRetainerContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handleBgImageSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) {
      updateContent({ backgroundImage: items[0].url });
    }
    setBgImagePickerOpen(false);
  }

  function updateBenefitText(idx: number, value: string) {
    const updated = [...benefits];
    updated[idx] = { ...updated[idx], text: value };
    updateContent({ benefits: updated });
  }

  function updateBenefitStyle(idx: number, patch: Partial<DesignRetainerBenefit>) {
    const updated = benefits.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    updateContent({ benefits: updated });
  }

  function moveBenefit(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= benefits.length) return;
    const updated = [...benefits];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ benefits: updated });
  }

  function addBenefit() {
    updateContent({ benefits: [...benefits, { text: "" }] });
  }

  function removeBenefit(idx: number) {
    updateContent({ benefits: benefits.filter((_, i) => i !== idx) });
  }

  function resetToDefaults() {
    updateContent({
      benefits: DEFAULT_DESIGN_RETAINER_BENEFITS,
      sectionLabel: HHI_DESIGN_RETAINER_DEFAULTS.defaultSectionLabel,
      tagline: HHI_DESIGN_RETAINER_DEFAULTS.defaultTagline,
      retainerAmount: HHI_DESIGN_RETAINER_DEFAULTS.defaultRetainerAmount,
      description: null,
      noteText: null,
    });
    onUpdate({
      ...slide,
      headline: HHI_DESIGN_RETAINER_DEFAULTS.defaultHeadline,
      content: {
        ...content,
        benefits: DEFAULT_DESIGN_RETAINER_BENEFITS,
        sectionLabel: HHI_DESIGN_RETAINER_DEFAULTS.defaultSectionLabel,
        tagline: HHI_DESIGN_RETAINER_DEFAULTS.defaultTagline,
        retainerAmount: HHI_DESIGN_RETAINER_DEFAULTS.defaultRetainerAmount,
        description: null,
        noteText: null,
      },
    });
  }

  return (
    <>
      {/* ── SECTION LABEL (font + color only) ──────────────────────────── */}
      <SectionLabel>Section Label</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={content.sectionLabel ?? ""}
          onChange={(v) => updateContent({ sectionLabel: v || null })}
          placeholder="YOUR INVESTMENT"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect
          value={content.sectionLabelFont ?? SLIDE_FONTS.defaults.label}
          onChange={(v: string) => updateContent({ sectionLabelFont: v })}
        />
      </FieldGroup>
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding}
            value={content.sectionLabelColor}
            defaultVal={resolvedAccent}
            onChange={(v) => updateContent({ sectionLabelColor: v })}
            onReset={() => updateContent({ sectionLabelColor: null })}
          />
        </FieldGroup>
      </div>
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />

      {PF_GROUP_DIVIDER}

      {/* ── HEADLINE ───────────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Your Design Retainer"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont2 ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont2: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 1.3).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.headlineSize ?? 1.3} onChange={(v) => updateContent({ headlineSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.headlineBold} italic={content.headlineItalic} underline={content.headlineUnderline}
        onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.headlineColor2} defaultVal="#1B2A4A"
            onChange={(v) => updateContent({ headlineColor2: v })} onReset={() => updateContent({ headlineColor2: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── TAGLINE ────────────────────────────────────────────────────── */}
      <SectionLabel>Tagline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.tagline ?? ""} onChange={(v) => updateContent({ tagline: v || null })}
          placeholder="Your investment in certainty before construction begins." />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.taglineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ taglineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.taglineSize ?? 0.75).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.taglineSize ?? 0.75} onChange={(v) => updateContent({ taglineSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.taglineBold} italic={content.taglineItalic} underline={content.taglineUnderline}
        onBold={(v) => updateContent({ taglineBold: v })} onItalic={(v) => updateContent({ taglineItalic: v })} onUnderline={(v) => updateContent({ taglineUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.taglineColor} defaultVal="#4A5568"
            onChange={(v) => updateContent({ taglineColor: v })} onReset={() => updateContent({ taglineColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.taglineOutline} onChangeFn={(v) => updateContent({ taglineOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── RETAINER AMOUNT ────────────────────────────────────────────── */}
      <SectionLabel>Retainer Amount</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.retainerAmount ?? ""} onChange={(v) => updateContent({ retainerAmount: v || null })} placeholder="$22,000" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.amountFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ amountFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.amountSize ?? 3.0).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.amountSize ?? 3.0} onChange={(v) => updateContent({ amountSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.amountBold} italic={content.amountItalic} underline={content.amountUnderline}
        onBold={(v) => updateContent({ amountBold: v })} onItalic={(v) => updateContent({ amountItalic: v })} onUnderline={(v) => updateContent({ amountUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.amountColor} defaultVal={resolvedAccent}
            onChange={(v) => updateContent({ amountColor: v })} onReset={() => updateContent({ amountColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.amountOutline} onChangeFn={(v) => updateContent({ amountOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── DESCRIPTION (framed-card only) ─────────────────────────────── */}
      {layoutKey === "framed-card" && (
        <>
          <SectionLabel>Description</SectionLabel>
          <FieldGroup label="Text">
            <TextArea value={content.description ?? ""} onChange={(v) => updateContent({ description: v || null })} placeholder="One-line description" rows={2} />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.descriptionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ descriptionFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.descriptionSize ?? 0.6).toFixed(1)}×`}>
            <PSizeSlider accentColor={branding.accentColor} value={content.descriptionSize ?? 0.6} onChange={(v) => updateContent({ descriptionSize: v })} />
          </FieldGroup>
          <PStyleButtons bold={content.descriptionBold} italic={content.descriptionItalic} underline={content.descriptionUnderline}
            onBold={(v) => updateContent({ descriptionBold: v })} onItalic={(v) => updateContent({ descriptionItalic: v })} onUnderline={(v) => updateContent({ descriptionUnderline: v })} />
          <div style={{ marginTop: 8 }}>
            <FieldGroup label="Color">
              <BrandingColorRow branding={branding} value={content.descriptionColor} defaultVal="#4A5568"
                onChange={(v) => updateContent({ descriptionColor: v })} onReset={() => updateContent({ descriptionColor: null })} />
            </FieldGroup>
          </div>
          <FieldGroup label="Outline">
            <POutlineRow accentColor={branding.accentColor} value={content.descriptionOutline} onChangeFn={(v) => updateContent({ descriptionOutline: v })} />
          </FieldGroup>
          {PF_GROUP_DIVIDER}
        </>
      )}

      {/* ── NOTE TEXT (fine print) ─────────────────────────────────────── */}
      <SectionLabel>Note / Fine Print</SectionLabel>
      <FieldGroup label="Text">
        <TextArea value={content.noteText ?? ""} onChange={(v) => updateContent({ noteText: v || null })} placeholder="Optional fine print" rows={2} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.noteFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ noteFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.noteSize ?? 0.75).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.noteSize ?? 0.75} onChange={(v) => updateContent({ noteSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.noteBold} italic={content.noteItalic} underline={content.noteUnderline}
        onBold={(v) => updateContent({ noteBold: v })} onItalic={(v) => updateContent({ noteItalic: v })} onUnderline={(v) => updateContent({ noteUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.noteColor} defaultVal="#4A5568"
            onChange={(v) => updateContent({ noteColor: v })} onReset={() => updateContent({ noteColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.noteOutline} onChangeFn={(v) => updateContent({ noteOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {layoutKey === "dark-overlay-modal" && (
        <>
          <SectionLabel>Background Image</SectionLabel>
          {content.backgroundImage ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                <img src={content.backgroundImage} alt="Background" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setBgImagePickerOpen(true)} style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}>Change</button>
                <button onClick={() => updateContent({ backgroundImage: null })} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}>Remove</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setBgImagePickerOpen(true)} style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}>
              + Select from Photo Library
            </button>
          )}
          <LibraryMediaPicker open={bgImagePickerOpen} onClose={() => setBgImagePickerOpen(false)} onSelect={handleBgImageSelect} multiple={false} includeUnapproved />
          {PF_GROUP_DIVIDER}
        </>
      )}

      {/* ── BENEFITS ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Benefits</SectionLabel>
        <button onClick={addBenefit}
          style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>
          + Add
        </button>
      </div>

      {benefits.map((b, bi) => (
        <div key={bi} style={{ marginBottom: 10, padding: "6px 0", borderBottom: bi < benefits.length - 1 ? "1px solid #F3F4F6" : undefined }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button onClick={() => moveBenefit(bi, -1)} disabled={bi === 0}
                style={{ fontSize: 9, color: bi === 0 ? "#D1D5DB" : "#6B7280", cursor: bi === 0 ? "default" : "pointer", background: "none", border: "none", padding: 0, lineHeight: 1 }}>▲</button>
              <button onClick={() => moveBenefit(bi, 1)} disabled={bi === benefits.length - 1}
                style={{ fontSize: 9, color: bi === benefits.length - 1 ? "#D1D5DB" : "#6B7280", cursor: bi === benefits.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: 0, lineHeight: 1 }}>▼</button>
            </div>
            <TextInput value={b.text} onChange={(v) => updateBenefitText(bi, v)} placeholder="Benefit text" />
            <button onClick={() => removeBenefit(bi)}
              style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 2px", flexShrink: 0 }}>✕</button>
          </div>
          {/* Per-item style controls */}
          <div style={{ paddingLeft: 20 }}>
            <FieldGroup label="Font">
              <PFontSelect value={b.textFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateBenefitStyle(bi, { textFont: v })} />
            </FieldGroup>
            <FieldGroup label={`Size — ${(b.textSize ?? 0.58).toFixed(1)}×`}>
              <PSizeSlider accentColor={branding.accentColor} value={b.textSize ?? 0.58} onChange={(v) => updateBenefitStyle(bi, { textSize: v })} />
            </FieldGroup>
            <PStyleButtons bold={b.textBold} italic={b.textItalic} underline={b.textUnderline}
              onBold={(v) => updateBenefitStyle(bi, { textBold: v })} onItalic={(v) => updateBenefitStyle(bi, { textItalic: v })} onUnderline={(v) => updateBenefitStyle(bi, { textUnderline: v })} />
            <div style={{ marginTop: 8 }}>
              <FieldGroup label="Color">
                <BrandingColorRow branding={branding} value={b.textColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateBenefitStyle(bi, { textColor: v })} onReset={() => updateBenefitStyle(bi, { textColor: undefined })} />
              </FieldGroup>
            </div>
            <FieldGroup label="Outline">
              <POutlineRow accentColor={branding.accentColor} value={b.textOutline} onChangeFn={(v) => updateBenefitStyle(bi, { textOutline: v })} />
            </FieldGroup>
          </div>
        </div>
      ))}

      <SharedCTASection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />

      <Divider />

      <button
        onClick={resetToDefaults}
        className="w-full rounded"
        style={{ fontSize: 11, fontWeight: 500, padding: "6px 10px", border: "1px solid #D1D5DB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}
      >
        Reset to Defaults
      </button>
    </>
  );
}

// ─── Next Steps Inspector ──────────────────────────────────────────────────

function NextStepsInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as NextStepsContent;
  const steps = content.steps ?? HHI_DEFAULT_NEXT_STEPS;
  const layoutKey = slide.layoutKey as string;
  const [rightPhotoPickerOpen, setRightPhotoPickerOpen] = useState(false);
  const [stepPhotoOpen, setStepPhotoOpen] = useState<string | null>(null);

  function updateContent(patch: Partial<NextStepsContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handleRightPhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) {
      updateContent({ rightPhoto: items[0].url });
    }
    setRightPhotoPickerOpen(false);
  }

  const locked = !!content.lockItemStyles;

  const STEP_STYLE_KEYS: (keyof NextStep)[] = [
    "numberFont", "numberSize", "numberBold", "numberItalic", "numberUnderline", "numberColor", "numberOutline",
    "titleFont", "titleSize", "titleBold", "titleItalic", "titleUnderline", "titleColor", "titleOutline",
    "descriptionFont", "descriptionSize", "descriptionBold", "descriptionItalic", "descriptionUnderline", "descriptionColor", "descriptionOutline",
  ];

  function updateStep(idx: number, patch: Partial<NextStep>) {
    let updated = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    if (locked && idx === 0) {
      const stylePatch: Partial<NextStep> = {};
      for (const k of STEP_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((s, i) => i === 0 ? s : { ...s, ...stylePatch });
      }
    }
    updateContent({ steps: updated });
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ steps: updated });
  }

  function addStep() {
    updateContent({
      steps: [...steps, { id: `step-${Date.now()}`, number: steps.length + 1, title: "New Step", description: "" }],
    });
  }

  function removeStep(idx: number) {
    updateContent({ steps: steps.filter((_, i) => i !== idx) });
  }

  function resetToDefaults() {
    updateContent({
      steps: HHI_DEFAULT_NEXT_STEPS,
      sectionLabel: HHI_NEXT_STEPS_DEFAULTS.defaultSectionLabel,
      contactEmail: null,
      contactPhone: null,
      rightPhoto: null,
      showAddress: null,
    });
    onUpdate({
      ...slide,
      headline: HHI_NEXT_STEPS_DEFAULTS.defaultHeadline,
      content: {
        ...content,
        steps: HHI_DEFAULT_NEXT_STEPS,
        sectionLabel: HHI_NEXT_STEPS_DEFAULTS.defaultSectionLabel,
        contactEmail: null,
        contactPhone: null,
        rightPhoto: null,
        showAddress: null,
      },
    });
  }

  const accent = content.accentColor ?? branding.accentColor;

  return (
    <>
      {/* ── Section Label ───────────────────────────────────────────── */}
      <SectionLabel>Section Label</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={content.sectionLabel ?? ""}
          onChange={(v) => updateContent({ sectionLabel: v || null })}
          placeholder="WHAT HAPPENS NEXT"
        />
      </FieldGroup>
      <SharedSectionLabelToggle content={content} updateContent={updateContent} />
      <FieldGroup label="Label Font">
        <PFontSelect value={content.sectionLabelFont ?? SLIDE_FONTS.defaults.label} onChange={(v) => updateContent({ sectionLabelFont: v })} />
      </FieldGroup>
      <FieldGroup label="Label Color">
        <BrandingColorRow branding={branding} value={content.sectionLabelColor} defaultVal={accent}
          onChange={(v) => updateContent({ sectionLabelColor: v })} onReset={() => updateContent({ sectionLabelColor: null })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── Headline ────────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="Your Path Forward"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ slideTitleFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.slideTitleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.slideTitleSize ?? 1.0} onChange={(v) => updateContent({ slideTitleSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.slideTitleBold ?? true} italic={content.slideTitleItalic} underline={content.slideTitleUnderline}
          onBold={(v) => updateContent({ slideTitleBold: v })} onItalic={(v) => updateContent({ slideTitleItalic: v })} onUnderline={(v) => updateContent({ slideTitleUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.slideTitleColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ slideTitleColor: v })} onReset={() => updateContent({ slideTitleColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.slideTitleOutline} onChangeFn={(v) => updateContent({ slideTitleOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      <FieldGroup label="Contact Email">
        <TextInput
          value={content.contactEmail ?? ""}
          onChange={(v) => updateContent({ contactEmail: v || null })}
          placeholder="email@example.com"
        />
      </FieldGroup>

      <FieldGroup label="Contact Phone">
        <TextInput
          value={content.contactPhone ?? ""}
          onChange={(v) => updateContent({ contactPhone: v || null })}
          placeholder="(555) 123-4567"
        />
      </FieldGroup>

      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!content.showAddress}
            onChange={(e) => updateContent({ showAddress: e.target.checked || null })}
          />
          Show project address in footer
        </label>
      </FieldGroup>

      {(layoutKey === "numbered-photo" || layoutKey === "large-number-hero") && (
        <>
          <SectionLabel>Right Photo</SectionLabel>
          {content.rightPhoto ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                <img
                  src={content.rightPhoto}
                  alt="Right photo"
                  style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setRightPhotoPickerOpen(true)}
                  style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}
                >
                  Change
                </button>
                <button
                  onClick={() => updateContent({ rightPhoto: null })}
                  style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRightPhotoPickerOpen(true)}
              style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}
            >
              + Select from Photo Library
            </button>
          )}
          <LibraryMediaPicker
            open={rightPhotoPickerOpen}
            onClose={() => setRightPhotoPickerOpen(false)}
            onSelect={handleRightPhotoSelect}
            multiple={false}
            includeUnapproved
          />
        </>
      )}

      <Divider />

      {/* Steps list */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>Steps</SectionLabel>
        <button
          onClick={addStep}
          style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}
        >
          + Add
        </button>
      </div>

      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v && steps.length > 1) {
          const src = steps[0];
          const stylePatch: Partial<NextStep> = {};
          for (const k of STEP_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
          const synced = steps.map((s, i) => i === 0 ? s : { ...s, ...stylePatch });
          updateContent({ lockItemStyles: true, steps: synced });
        } else {
          updateContent({ lockItemStyles: v || null });
        }
      }} />

      {steps.map((step, si) => (
        <div key={step.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel>Step {si + 1}</SectionLabel>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => moveStep(si, -1)} disabled={si === 0} style={{ fontSize: 11, color: si === 0 ? "#D1D5DB" : "#6B7280", cursor: si === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
              <button onClick={() => moveStep(si, 1)} disabled={si === steps.length - 1} style={{ fontSize: 11, color: si === steps.length - 1 ? "#D1D5DB" : "#6B7280", cursor: si === steps.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
              {steps.length > 1 && (
                <button onClick={() => removeStep(si)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>
              )}
            </div>
          </div>
          {/* Number display */}
          <FieldGroup label="Number">
            <TextInput
              value={String(step.number)}
              onChange={(v) => updateStep(si, { number: parseInt(v) || si + 1 })}
              placeholder={String(si + 1)}
            />
          </FieldGroup>
          {(!locked || si === 0) && (
            <>
              <FieldGroup label={`Number Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={step.numberFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateStep(si, { numberFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Number Size — ${(step.numberSize ?? 3.0).toFixed(1)}×`}>
                <PSizeSlider value={step.numberSize ?? 3.0} onChange={(v) => updateStep(si, { numberSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Number Style">
                <PStyleButtons bold={step.numberBold ?? true} italic={step.numberItalic} underline={step.numberUnderline}
                  onBold={(v) => updateStep(si, { numberBold: v })} onItalic={(v) => updateStep(si, { numberItalic: v })} onUnderline={(v) => updateStep(si, { numberUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Number Color">
                <BrandingColorRow branding={branding} value={step.numberColor} defaultVal={accent}
                  onChange={(v) => updateStep(si, { numberColor: v })} onReset={() => updateStep(si, { numberColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Number Outline">
                <POutlineRow value={step.numberOutline} onChangeFn={(v) => updateStep(si, { numberOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Title */}
          <FieldGroup label="Title">
            <TextInput
              value={step.title}
              onChange={(v) => updateStep(si, { title: v })}
              placeholder="Step title"
            />
          </FieldGroup>
          {(!locked || si === 0) && (
            <>
              <FieldGroup label={`Title Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={step.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateStep(si, { titleFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Title Size — ${(step.titleSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={step.titleSize ?? 1.0} onChange={(v) => updateStep(si, { titleSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Title Style">
                <PStyleButtons bold={step.titleBold ?? true} italic={step.titleItalic} underline={step.titleUnderline}
                  onBold={(v) => updateStep(si, { titleBold: v })} onItalic={(v) => updateStep(si, { titleItalic: v })} onUnderline={(v) => updateStep(si, { titleUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Title Color">
                <BrandingColorRow branding={branding} value={step.titleColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateStep(si, { titleColor: v })} onReset={() => updateStep(si, { titleColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Title Outline">
                <POutlineRow value={step.titleOutline} onChangeFn={(v) => updateStep(si, { titleOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Description */}
          <FieldGroup label="Description">
            <TextArea
              value={step.description}
              onChange={(v) => updateStep(si, { description: v })}
              placeholder=""
              rows={2}
            />
          </FieldGroup>
          {(!locked || si === 0) && (
            <>
              <FieldGroup label={`Desc Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={step.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateStep(si, { descriptionFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Desc Size — ${(step.descriptionSize ?? 1.0).toFixed(1)}×`}>
                <PSizeSlider value={step.descriptionSize ?? 1.0} onChange={(v) => updateStep(si, { descriptionSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Desc Style">
                <PStyleButtons bold={step.descriptionBold} italic={step.descriptionItalic} underline={step.descriptionUnderline}
                  onBold={(v) => updateStep(si, { descriptionBold: v })} onItalic={(v) => updateStep(si, { descriptionItalic: v })} onUnderline={(v) => updateStep(si, { descriptionUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Desc Color">
                <BrandingColorRow branding={branding} value={step.descriptionColor} defaultVal="#4A5568"
                  onChange={(v) => updateStep(si, { descriptionColor: v })} onReset={() => updateStep(si, { descriptionColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Desc Outline">
                <POutlineRow value={step.descriptionOutline} onChangeFn={(v) => updateStep(si, { descriptionOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}

          {layoutKey === "column-grid-photos" && (
            <>
              <FieldGroup label="Step Photo">
                {step.photo ? (
                  <div>
                    <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                      <img src={step.photo} alt="Step photo" style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setStepPhotoOpen(step.id)} style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 6px" }}>Change</button>
                      <button onClick={() => updateStep(si, { photo: null })} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 6px" }}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setStepPhotoOpen(step.id)} style={{ width: "100%", fontSize: 10, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "8px 8px" }}>
                    + Select Photo
                  </button>
                )}
              </FieldGroup>
              <LibraryMediaPicker
                open={stepPhotoOpen === step.id}
                onClose={() => setStepPhotoOpen(null)}
                onSelect={(items) => {
                  if (items.length > 0) updateStep(si, { photo: items[0].url });
                  setStepPhotoOpen(null);
                }}
                multiple={false}
                includeUnapproved
              />
            </>
          )}
        </div>
      ))}

      {PF_GROUP_DIVIDER}

      {/* ── CONTACT INFO ─────────────────────────────── */}
      <SectionLabel>Contact Info</SectionLabel>
      <FieldGroup label="Font">
        <PFontSelect value={content.contactFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ contactFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.contactSize ?? 0.7).toFixed(1)}×`}>
        <PSizeSlider value={content.contactSize ?? 0.7} onChange={(v) => updateContent({ contactSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.contactBold} italic={content.contactItalic} underline={content.contactUnderline}
          onBold={(v) => updateContent({ contactBold: v })} onItalic={(v) => updateContent({ contactItalic: v })} onUnderline={(v) => updateContent({ contactUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.contactColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ contactColor: v })} onReset={() => updateContent({ contactColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.contactOutline} onChangeFn={(v) => updateContent({ contactOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── FOOTER NOTE ──────────────────────────────── */}
      <SectionLabel>Footer Note</SectionLabel>
      <FieldGroup label="Font">
        <PFontSelect value={content.footerNoteFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ footerNoteFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.footerNoteSize ?? 0.7).toFixed(1)}×`}>
        <PSizeSlider value={content.footerNoteSize ?? 0.7} onChange={(v) => updateContent({ footerNoteSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.footerNoteBold} italic={content.footerNoteItalic} underline={content.footerNoteUnderline}
          onBold={(v) => updateContent({ footerNoteBold: v })} onItalic={(v) => updateContent({ footerNoteItalic: v })} onUnderline={(v) => updateContent({ footerNoteUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.footerNoteColor} defaultVal="#6B7280"
          onChange={(v) => updateContent({ footerNoteColor: v })} onReset={() => updateContent({ footerNoteColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.footerNoteOutline} onChangeFn={(v) => updateContent({ footerNoteOutline: v })} accentColor={accent} />
      </FieldGroup>

      <SharedCTASection content={content} updateContent={updateContent} />
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />

      <Divider />

      <button
        onClick={resetToDefaults}
        className="w-full rounded"
        style={{ fontSize: 11, fontWeight: 500, padding: "6px 10px", border: "1px solid #D1D5DB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}
      >
        Reset to Defaults
      </button>
    </>
  );
}

// ─── Closing Slide Inspector ───────────────────────────────────────────────

function ClosingSlideInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ClosingSlideContent;
  const layoutKey = slide.layoutKey as string;
  const [bgPhotoPickerOpen, setBgPhotoPickerOpen] = useState(false);

  function updateContent(patch: Partial<ClosingSlideContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handleBgPhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) {
      updateContent({ backgroundPhoto: items[0].url });
    }
    setBgPhotoPickerOpen(false);
  }

  // Layout-aware defaults
  const isDark = layoutKey === "dark-centered";
  const isPhoto = layoutKey === "photo-white-card";
  const headlineColorDefault = isDark ? "#FFFFFF" : "#1B2A4A";
  const contactColorDefault = isDark ? "rgba(255,255,255,0.75)" : "#4A5568";
  const validityColorDefault = "#9CA3AF";
  const subColorDefault = isDark ? "rgba(255,255,255,0.7)" : "#6B7280";
  const resolvedAccent = content.accentColor ?? "#B8860B";

  return (
    <>
      {/* ── HEADLINE ───────────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={slide.headline ?? ""} onChange={(v) => onUpdate({ ...slide, headline: v || null })} placeholder={CLOSING_SLIDE_DEFAULTS.headline} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont2 ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont2: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 1.6).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.headlineSize ?? 1.6} onChange={(v) => updateContent({ headlineSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.headlineBold2} italic={content.headlineItalic} underline={content.headlineUnderline}
        onBold={(v) => updateContent({ headlineBold2: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.headlineColor2} defaultVal={headlineColorDefault}
            onChange={(v) => updateContent({ headlineColor2: v })} onReset={() => updateContent({ headlineColor2: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── TAGLINE ────────────────────────────────────────────────────── */}
      <SectionLabel>Tagline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.tagline ?? ""} onChange={(v) => updateContent({ tagline: v || null })} placeholder={CLOSING_SLIDE_DEFAULTS.tagline} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.taglineFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ taglineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.taglineSize ?? 0.75).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.taglineSize ?? 0.75} onChange={(v) => updateContent({ taglineSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.taglineBold} italic={content.taglineItalic} underline={content.taglineUnderline}
        onBold={(v) => updateContent({ taglineBold: v })} onItalic={(v) => updateContent({ taglineItalic: v })} onUnderline={(v) => updateContent({ taglineUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.taglineColor} defaultVal={resolvedAccent}
            onChange={(v) => updateContent({ taglineColor: v })} onReset={() => updateContent({ taglineColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.taglineOutline} onChangeFn={(v) => updateContent({ taglineOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── SUBHEADLINE ────────────────────────────────────────────────── */}
      <SectionLabel>Subheadline</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.subheadline ?? ""} onChange={(v) => updateContent({ subheadline: v || null })} placeholder="Optional subheadline" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ subheadlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.subheadlineSize ?? 0.52).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.subheadlineSize ?? 0.52} onChange={(v) => updateContent({ subheadlineSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.subheadlineBold} italic={content.subheadlineItalic} underline={content.subheadlineUnderline}
        onBold={(v) => updateContent({ subheadlineBold: v })} onItalic={(v) => updateContent({ subheadlineItalic: v })} onUnderline={(v) => updateContent({ subheadlineUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.subheadlineColor} defaultVal={subColorDefault}
            onChange={(v) => updateContent({ subheadlineColor: v })} onReset={() => updateContent({ subheadlineColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.subheadlineOutline} onChangeFn={(v) => updateContent({ subheadlineOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── CONTACT INFO ───────────────────────────────────────────────── */}
      <SectionLabel>Contact Info</SectionLabel>
      <FieldGroup label="Email">
        <TextInput value={content.contactEmail ?? ""} onChange={(v) => updateContent({ contactEmail: v || null })} placeholder={branding.email ?? "email@example.com"} />
      </FieldGroup>
      <FieldGroup label="Phone">
        <TextInput value={content.contactPhone ?? ""} onChange={(v) => updateContent({ contactPhone: v || null })} placeholder={branding.phone ?? "(555) 123-4567"} />
      </FieldGroup>
      <FieldGroup label="Address">
        <TextInput value={content.address ?? ""} onChange={(v) => updateContent({ address: v || null })} placeholder={branding.address ?? "123 Main St"} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.contactFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ contactFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.contactSize ?? 0.48).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.contactSize ?? 0.48} onChange={(v) => updateContent({ contactSize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.contactBold} italic={content.contactItalic} underline={content.contactUnderline}
        onBold={(v) => updateContent({ contactBold: v })} onItalic={(v) => updateContent({ contactItalic: v })} onUnderline={(v) => updateContent({ contactUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.contactColor} defaultVal={contactColorDefault}
            onChange={(v) => updateContent({ contactColor: v })} onReset={() => updateContent({ contactColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.contactOutline} onChangeFn={(v) => updateContent({ contactOutline: v })} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── VALIDITY NOTE ──────────────────────────────────────────────── */}
      <SectionLabel>Validity Note</SectionLabel>
      <FieldGroup label="Text">
        <TextInput value={content.validityNote ?? ""} onChange={(v) => updateContent({ validityNote: v || null })} placeholder={CLOSING_SLIDE_DEFAULTS.validityNote} />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.validityFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ validityFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.validitySize ?? 0.75).toFixed(1)}×`}>
        <PSizeSlider accentColor={branding.accentColor} value={content.validitySize ?? 0.75} onChange={(v) => updateContent({ validitySize: v })} />
      </FieldGroup>
      <PStyleButtons bold={content.validityBold} italic={content.validityItalic} underline={content.validityUnderline}
        onBold={(v) => updateContent({ validityBold: v })} onItalic={(v) => updateContent({ validityItalic: v })} onUnderline={(v) => updateContent({ validityUnderline: v })} />
      <div style={{ marginTop: 8 }}>
        <FieldGroup label="Color">
          <BrandingColorRow branding={branding} value={content.validityColor} defaultVal={validityColorDefault}
            onChange={(v) => updateContent({ validityColor: v })} onReset={() => updateContent({ validityColor: null })} />
        </FieldGroup>
      </div>
      <FieldGroup label="Outline">
        <POutlineRow accentColor={branding.accentColor} value={content.validityOutline} onChangeFn={(v) => updateContent({ validityOutline: v })} />
      </FieldGroup>

      <Divider />

      {layoutKey === "dark-centered" && (
        <FieldGroup label="Background Color">
          <BrandingColorRow
            value={content.backgroundColor}
            defaultVal="#1B2A4A"
            branding={branding}
            onChange={(v) => updateContent({ backgroundColor: v })}
            onReset={() => updateContent({ backgroundColor: null })}
          />
        </FieldGroup>
      )}

      {(layoutKey === "dark-centered" || layoutKey === "photo-white-card") && (
        <>
          <SectionLabel>Background Photo</SectionLabel>
          {content.backgroundPhoto ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                <img
                  src={content.backgroundPhoto}
                  alt="Background photo"
                  style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setBgPhotoPickerOpen(true)}
                  style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}
                >
                  Change
                </button>
                <button
                  onClick={() => updateContent({ backgroundPhoto: null })}
                  style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setBgPhotoPickerOpen(true)}
              style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}
            >
              + Select from Photo Library
            </button>
          )}
          <LibraryMediaPicker
            open={bgPhotoPickerOpen}
            onClose={() => setBgPhotoPickerOpen(false)}
            onSelect={handleBgPhotoSelect}
            multiple={false}
            includeUnapproved
          />
        </>
      )}
      {(layoutKey === "dark-centered" || layoutKey === "photo-white-card") && (
        <SharedOverlaySection content={content} updateContent={updateContent} />
      )}
      <SharedCTASection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Visual Inspiration Inspector ──────────────────────────────────────────

function VisualInspirationInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as VisualInspirationContent;
  const layoutKey = slide.layoutKey as string;
  const photos = content.photos ?? [];
  const accent = content.accentColor ?? branding.accentColor;
  const [heroPickerOpen, setHeroPickerOpen] = useState(false);
  const [photosPickerOpen, setPhotosPickerOpen] = useState(false);

  function updateContent(patch: Partial<VisualInspirationContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handleHeroPhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) {
      updateContent({ heroPhoto: items[0].url });
    }
    setHeroPickerOpen(false);
  }

  function handlePhotosSelect(items: LibraryMediaItem[]) {
    const newUrls = items.map((item) => item.url);
    updateContent({ photos: [...photos, ...newUrls] });
    setPhotosPickerOpen(false);
  }

  function removePhoto(idx: number) {
    updateContent({ photos: photos.filter((_, i) => i !== idx) });
  }

  function movePhoto(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= photos.length) return;
    const updated = [...photos];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ photos: updated });
  }

  // Photo count guidance per layout
  const guidance =
    layoutKey === "hero-plus-stacked" ? { label: "2 stacked photos", min: 2, max: 2 } :
    layoutKey === "masonry-grid"      ? { label: "4\u20138 photos", min: 4, max: 8 } :
    layoutKey === "side-by-side-bleed" ? { label: "2 photos", min: 2, max: 2 } :
    { label: "photos", min: 0, max: 8 };

  const countWarning =
    photos.length < guidance.min ? `Need at least ${guidance.min} photos (have ${photos.length})` :
    photos.length > guidance.max ? `Maximum ${guidance.max} photos recommended (have ${photos.length})` :
    null;

  // Phase 8A T7: when false, Regenerate Default Deck (replace-all) skips
  // this slide. Addable manually via + Add Slide regardless.
  const showByDefault = content.showByDefault ?? true;

  return (
    <>
      {/* ── INCLUDE IN DEFAULT DECK (T7) ───────────────── */}
      <SectionLabel>Default deck inclusion</SectionLabel>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={showByDefault}
          onChange={(e) => updateContent({ showByDefault: e.target.checked })}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 11, lineHeight: 1.45, color: "#374151" }}>
          Include in Generate Default Deck
          <span style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
            Uncheck to keep this slide out of regenerated default decks.
            Manual + Add Slide still works.
          </span>
        </span>
      </label>

      {PF_GROUP_DIVIDER}

      {/* ── HEADLINE — Layouts A and C ────────────────── */}
      {(layoutKey === "hero-plus-stacked" || layoutKey === "side-by-side-bleed") && (
        <>
          <SectionLabel>Headline</SectionLabel>
          <FieldGroup label="">
            <TextInput
              value={slide.headline ?? ""}
              onChange={(v) => onUpdate({ ...slide, headline: v || null })}
              placeholder={VISUAL_INSPIRATION_DEFAULTS.headline}
            />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
            <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Style">
            <PStyleButtons bold={content.headlineBold ?? true} italic={content.headlineItalic} underline={content.headlineUnderline}
              onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Color">
            <BrandingColorRow branding={branding} value={content.headlineColor} defaultVal="#FFFFFF"
              onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null })} />
          </FieldGroup>
          <FieldGroup label="Outline">
            <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
          </FieldGroup>
          {PF_GROUP_DIVIDER}
        </>
      )}

      {/* ── SUBTITLE — Layout A only ────────────────── */}
      {layoutKey === "hero-plus-stacked" && (
        <>
          <SectionLabel>Subtitle</SectionLabel>
          <FieldGroup label="">
            <TextInput
              value={content.subtitle ?? ""}
              onChange={(v) => updateContent({ subtitle: v || null })}
              placeholder={VISUAL_INSPIRATION_DEFAULTS.subtitle}
            />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.subtitleFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ subtitleFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.subtitleSize ?? 1.0).toFixed(1)}×`}>
            <PSizeSlider value={content.subtitleSize ?? 1.0} onChange={(v) => updateContent({ subtitleSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Style">
            <PStyleButtons bold={content.subtitleBold} italic={content.subtitleItalic} underline={content.subtitleUnderline}
              onBold={(v) => updateContent({ subtitleBold: v })} onItalic={(v) => updateContent({ subtitleItalic: v })} onUnderline={(v) => updateContent({ subtitleUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Color">
            <BrandingColorRow branding={branding} value={content.subtitleColor} defaultVal="#FFFFFF"
              onChange={(v) => updateContent({ subtitleColor: v })} onReset={() => updateContent({ subtitleColor: null })} />
          </FieldGroup>
          <FieldGroup label="Outline">
            <POutlineRow value={content.subtitleOutline} onChangeFn={(v) => updateContent({ subtitleOutline: v })} accentColor={accent} />
          </FieldGroup>
          {PF_GROUP_DIVIDER}
        </>
      )}

      {/* ── CAPTION — Layouts B and C ───────────────── */}
      {(layoutKey === "masonry-grid" || layoutKey === "side-by-side-bleed") && (
        <>
          <SectionLabel>Caption</SectionLabel>
          <FieldGroup label="">
            <TextInput
              value={content.caption ?? ""}
              onChange={(v) => updateContent({ caption: v || null })}
              placeholder="Optional caption"
            />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.captionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ captionFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.captionSize ?? 1.0).toFixed(1)}×`}>
            <PSizeSlider value={content.captionSize ?? 1.0} onChange={(v) => updateContent({ captionSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Style">
            <PStyleButtons bold={content.captionBold} italic={content.captionItalic} underline={content.captionUnderline}
              onBold={(v) => updateContent({ captionBold: v })} onItalic={(v) => updateContent({ captionItalic: v })} onUnderline={(v) => updateContent({ captionUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Color">
            <BrandingColorRow branding={branding} value={content.captionColor} defaultVal="#FFFFFF"
              onChange={(v) => updateContent({ captionColor: v })} onReset={() => updateContent({ captionColor: null })} />
          </FieldGroup>
          <FieldGroup label="Outline">
            <POutlineRow value={content.captionOutline} onChangeFn={(v) => updateContent({ captionOutline: v })} accentColor={accent} />
          </FieldGroup>
          {PF_GROUP_DIVIDER}
        </>
      )}

      <Divider />

      {/* Hero photo — Layout A only */}
      {layoutKey === "hero-plus-stacked" && (
        <>
          <SectionLabel>Hero Photo</SectionLabel>
          {content.heroPhoto ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                <img
                  src={content.heroPhoto}
                  alt="Hero photo"
                  style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setHeroPickerOpen(true)}
                  style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}
                >
                  Change
                </button>
                <button
                  onClick={() => updateContent({ heroPhoto: null })}
                  style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setHeroPickerOpen(true)}
              style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}
            >
              + Select Hero Photo
            </button>
          )}
          <LibraryMediaPicker
            open={heroPickerOpen}
            onClose={() => setHeroPickerOpen(false)}
            onSelect={handleHeroPhotoSelect}
            multiple={false}
            includeUnapproved
          />
          <Divider />
        </>
      )}

      {/* Photos list */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <SectionLabel>Photos ({guidance.label})</SectionLabel>
      </div>

      {/* Count warning */}
      {countWarning && (
        <div style={{ fontSize: 10, color: "#F59E0B", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 4, padding: "4px 8px", marginBottom: 8 }}>
          {countWarning}
        </div>
      )}

      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {photos.map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                <button
                  onClick={() => movePhoto(i, -1)}
                  disabled={i === 0}
                  style={{ fontSize: 9, color: i === 0 ? "#D1D5DB" : "#6B7280", cursor: i === 0 ? "default" : "pointer", background: "none", border: "none", padding: 0, lineHeight: 1 }}
                >
                  ▲
                </button>
                <button
                  onClick={() => movePhoto(i, 1)}
                  disabled={i === photos.length - 1}
                  style={{ fontSize: 9, color: i === photos.length - 1 ? "#D1D5DB" : "#6B7280", cursor: i === photos.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: 0, lineHeight: 1 }}
                >
                  ▼
                </button>
              </div>
              <div style={{ width: 48, height: 36, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "#F3F4F6" }}>
                <img src={url} alt={`Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <span style={{ flex: 1, fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Photo {i + 1}
              </span>
              <button
                onClick={() => removePhoto(i)}
                style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 2px", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setPhotosPickerOpen(true)}
        style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "10px 10px", marginBottom: 8 }}
      >
        + Add Photos from Library
      </button>
      <LibraryMediaPicker
        open={photosPickerOpen}
        onClose={() => setPhotosPickerOpen(false)}
        onSelect={handlePhotosSelect}
        multiple
        includeUnapproved
      />
      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} showSizeControls />
      {(layoutKey === "hero-plus-stacked" || layoutKey === "side-by-side-bleed") && (
        <SharedOverlaySection content={content} updateContent={updateContent} />
      )}
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Client Testimonials Inspector ─────────────────────────────────────────

function ClientTestimonialsInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as ClientTestimonialsContent;
  const testimonials = content.testimonials ?? [];
  const accent = content.accentColor ?? branding.accentColor;
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<SlideTestimonial[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  function updateContent(patch: Partial<ClientTestimonialsContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const locked = !!content.lockItemStyles;

  const TESTIMONIAL_STYLE_KEYS: (keyof SlideTestimonial)[] = [
    "quoteFont", "quoteSize", "quoteBold", "quoteItalic", "quoteUnderline", "quoteColor", "quoteOutline",
    "clientNameFont", "clientNameSize", "clientNameBold", "clientNameItalic", "clientNameUnderline", "clientNameColor", "clientNameOutline",
    "projectNameFont", "projectNameSize", "projectNameBold", "projectNameItalic", "projectNameUnderline", "projectNameColor", "projectNameOutline",
  ];

  function updateTestimonial(idx: number, patch: Partial<SlideTestimonial>) {
    let updated = testimonials.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    if (locked && idx === 0) {
      const stylePatch: Partial<SlideTestimonial> = {};
      for (const k of TESTIMONIAL_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((t, i) => i === 0 ? t : { ...t, ...stylePatch });
      }
    }
    updateContent({ testimonials: updated });
  }

  function handleBgPhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) updateContent({ backgroundPhoto: items[0].url });
    setBgPickerOpen(false);
  }

  // Load approved testimonials from library
  useEffect(() => {
    if (libraryLoaded) return;
    import("@/app/admin/settings/actions").then((mod) => {
      mod.getApprovedTestimonialsAction().then((items) => {
        setLibraryItems(
          items.map((t) => ({
            id: t.id,
            quote: t.quote,
            clientName: t.clientName,
            projectName: t.projectName,
            rating: t.rating,
            source: t.source as "google" | "manual",
          }))
        );
        setLibraryLoaded(true);
      });
    });
  }, [libraryLoaded]);

  function addTestimonial(t: SlideTestimonial) {
    if (testimonials.length >= 4) return;
    if (testimonials.some((x) => x.id === t.id)) return;
    updateContent({ testimonials: [...testimonials, t] });
  }

  function removeTestimonial(idx: number) {
    updateContent({ testimonials: testimonials.filter((_, i) => i !== idx) });
  }

  function moveTestimonial(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= testimonials.length) return;
    const updated = [...testimonials];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ testimonials: updated });
  }

  const available = libraryItems.filter((t) => !testimonials.some((s) => s.id === t.id));

  return (
    <>
      {/* ── HEADLINE ─────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder={TESTIMONIALS_SLIDE_DEFAULTS.headline}
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headlineBold ?? true} italic={content.headlineItalic} underline={content.headlineUnderline}
          onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headlineColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── SUBHEADLINE ──────────────────────────────── */}
      <SectionLabel>Subheadline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={content.subheadline ?? ""}
          onChange={(v) => updateContent({ subheadline: v || null })}
          placeholder="Optional supporting line"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.subheadlineFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ subheadlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.subheadlineSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.subheadlineSize ?? 1.0} onChange={(v) => updateContent({ subheadlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.subheadlineBold} italic={content.subheadlineItalic} underline={content.subheadlineUnderline}
          onBold={(v) => updateContent({ subheadlineBold: v })} onItalic={(v) => updateContent({ subheadlineItalic: v })} onUnderline={(v) => updateContent({ subheadlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.subheadlineColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ subheadlineColor: v })} onReset={() => updateContent({ subheadlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.subheadlineOutline} onChangeFn={(v) => updateContent({ subheadlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      <FieldGroup label="">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={content.showStars !== false}
            onChange={(e) => updateContent({ showStars: e.target.checked })}
          />
          Show star ratings
        </label>
      </FieldGroup>

      <Divider />

      {/* Background photo picker */}
      <SectionLabel>Background Photo</SectionLabel>
      {content.backgroundPhoto ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
            <img src={content.backgroundPhoto} alt="Background" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setBgPickerOpen(true)} style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}>Change</button>
            <button onClick={() => updateContent({ backgroundPhoto: null })} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}>Remove</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setBgPickerOpen(true)} style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}>
          + Select from Photo Library
        </button>
      )}
      <LibraryMediaPicker open={bgPickerOpen} onClose={() => setBgPickerOpen(false)} onSelect={handleBgPhotoSelect} multiple={false} includeUnapproved />

      <Divider />

      {/* Selected testimonials */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <SectionLabel>Testimonials (1\u20134)</SectionLabel>
      </div>

      {testimonials.length === 0 && (
        <div style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
          No testimonials selected. Choose from your library below.
        </div>
      )}

      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v && testimonials.length > 1) {
          const src = testimonials[0];
          const stylePatch: Partial<SlideTestimonial> = {};
          for (const k of TESTIMONIAL_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
          const synced = testimonials.map((t, i) => i === 0 ? t : { ...t, ...stylePatch });
          updateContent({ lockItemStyles: true, testimonials: synced });
        } else {
          updateContent({ lockItemStyles: v || null });
        }
      }} />

      {testimonials.map((t, i) => (
        <div key={t.id} style={{ marginBottom: 12, padding: "6px 8px", background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#374151" }}>{t.clientName}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => moveTestimonial(i, -1)} disabled={i === 0} style={{ fontSize: 9, color: i === 0 ? "#D1D5DB" : "#6B7280", cursor: i === 0 ? "default" : "pointer", background: "none", border: "none", padding: 0 }}>▲</button>
              <button onClick={() => moveTestimonial(i, 1)} disabled={i === testimonials.length - 1} style={{ fontSize: 9, color: i === testimonials.length - 1 ? "#D1D5DB" : "#6B7280", cursor: i === testimonials.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: 0 }}>▼</button>
              <button onClick={() => removeTestimonial(i)} style={{ fontSize: 9, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: 0 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
            {"\u201C"}{t.quote.slice(0, 60)}{t.quote.length > 60 ? "\u2026" : ""}{"\u201D"}
          </div>

          {/* Per-item style controls */}
          {(!locked || i === 0) && (
            <>
              {/* Quote styles */}
              <FieldGroup label={`Quote Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={t.quoteFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateTestimonial(i, { quoteFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Quote Size — ${(t.quoteSize ?? 1.1).toFixed(1)}×`}>
                <PSizeSlider value={t.quoteSize ?? 1.1} onChange={(v) => updateTestimonial(i, { quoteSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Quote Style">
                <PStyleButtons bold={t.quoteBold} italic={t.quoteItalic ?? true} underline={t.quoteUnderline}
                  onBold={(v) => updateTestimonial(i, { quoteBold: v })} onItalic={(v) => updateTestimonial(i, { quoteItalic: v })} onUnderline={(v) => updateTestimonial(i, { quoteUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Quote Color">
                <BrandingColorRow branding={branding} value={t.quoteColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateTestimonial(i, { quoteColor: v })} onReset={() => updateTestimonial(i, { quoteColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Quote Outline">
                <POutlineRow value={t.quoteOutline} onChangeFn={(v) => updateTestimonial(i, { quoteOutline: v })} accentColor={accent} />
              </FieldGroup>

              {PF_GROUP_DIVIDER}

              {/* Client name styles */}
              <FieldGroup label={`Name Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={t.clientNameFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateTestimonial(i, { clientNameFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Name Size — ${(t.clientNameSize ?? 0.9).toFixed(1)}×`}>
                <PSizeSlider value={t.clientNameSize ?? 0.9} onChange={(v) => updateTestimonial(i, { clientNameSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Name Style">
                <PStyleButtons bold={t.clientNameBold ?? true} italic={t.clientNameItalic} underline={t.clientNameUnderline}
                  onBold={(v) => updateTestimonial(i, { clientNameBold: v })} onItalic={(v) => updateTestimonial(i, { clientNameItalic: v })} onUnderline={(v) => updateTestimonial(i, { clientNameUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Name Color">
                <BrandingColorRow branding={branding} value={t.clientNameColor} defaultVal="#1B2A4A"
                  onChange={(v) => updateTestimonial(i, { clientNameColor: v })} onReset={() => updateTestimonial(i, { clientNameColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Name Outline">
                <POutlineRow value={t.clientNameOutline} onChangeFn={(v) => updateTestimonial(i, { clientNameOutline: v })} accentColor={accent} />
              </FieldGroup>

              {PF_GROUP_DIVIDER}

              {/* Project name styles */}
              <FieldGroup label={`Project Font${locked ? " (all)" : ""}`}>
                <PFontSelect value={t.projectNameFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateTestimonial(i, { projectNameFont: v })} />
              </FieldGroup>
              <FieldGroup label={`Project Size — ${(t.projectNameSize ?? 0.8).toFixed(1)}×`}>
                <PSizeSlider value={t.projectNameSize ?? 0.8} onChange={(v) => updateTestimonial(i, { projectNameSize: v })} accentColor={accent} />
              </FieldGroup>
              <FieldGroup label="Project Style">
                <PStyleButtons bold={t.projectNameBold} italic={t.projectNameItalic} underline={t.projectNameUnderline}
                  onBold={(v) => updateTestimonial(i, { projectNameBold: v })} onItalic={(v) => updateTestimonial(i, { projectNameItalic: v })} onUnderline={(v) => updateTestimonial(i, { projectNameUnderline: v })} />
              </FieldGroup>
              <FieldGroup label="Project Color">
                <BrandingColorRow branding={branding} value={t.projectNameColor} defaultVal="#4A5568"
                  onChange={(v) => updateTestimonial(i, { projectNameColor: v })} onReset={() => updateTestimonial(i, { projectNameColor: undefined })} />
              </FieldGroup>
              <FieldGroup label="Project Outline">
                <POutlineRow value={t.projectNameOutline} onChangeFn={(v) => updateTestimonial(i, { projectNameOutline: v })} accentColor={accent} />
              </FieldGroup>
            </>
          )}
        </div>
      ))}

      {/* Available testimonials from library */}
      {testimonials.length < 4 && available.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4, fontWeight: 500 }}>From Library:</div>
          {available.map((t) => (
            <button
              key={t.id}
              onClick={() => addTestimonial(t)}
              style={{ width: "100%", textAlign: "left", fontSize: 10, color: "#374151", cursor: "pointer", background: "none", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 8px", marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.clientName}: {"\u201C"}{t.quote.slice(0, 40)}{"\u2026"}{"\u201D"}</span>
              <span style={{ color: "#B8860B", fontWeight: 600, marginLeft: 4, flexShrink: 0 }}>+</span>
            </button>
          ))}
        </div>
      )}

      {testimonials.length < 4 && available.length === 0 && libraryLoaded && (
        <div style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
          {libraryItems.length === 0
            ? "No testimonials in library yet."
            : "All library testimonials already selected."}
        </div>
      )}

      <a
        href="/admin/settings/testimonials"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, color: "#6B7280", textDecoration: "underline", display: "inline-block", marginBottom: 8 }}
      >
        Manage Testimonials in Settings
      </a>
      <SharedTypographySection content={content} updateContent={updateContent} branding={branding} showSizeControls />
      <SharedCardStyleSection content={content} updateContent={updateContent} />
      <SharedOverlaySection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}

// ─── Design-Build Advantage Inspector ──────────────────────────────────────

function DesignBuildAdvantageInspector({
  slide,
  branding,
  onUpdate,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
}) {
  const content = (slide.content ?? {}) as DesignBuildAdvantageContent;
  const layoutKey = slide.layoutKey as string;
  const pillars = content.pillars && content.pillars.length > 0 ? content.pillars : DEFAULT_PILLARS;
  const guarantees = content.guarantees && content.guarantees.length > 0 ? content.guarantees : DEFAULT_GUARANTEES;
  const nodes = content.diagramNodes && content.diagramNodes.length > 0 ? content.diagramNodes : DEFAULT_DIAGRAM_NODES;
  const columns = content.supportColumns && content.supportColumns.length > 0 ? content.supportColumns : DEFAULT_SUPPORT_COLUMNS;
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [dbBrandIcons, setDbBrandIcons] = useState<TemplateCIcon[]>([]);
  const [dbIconsLoaded, setDbIconsLoaded] = useState(false);

  useEffect(() => {
    if (dbIconsLoaded) return;
    import("@/app/admin/settings/actions").then((mod) => {
      mod.listBrandIcons().then((icons) => {
        setDbBrandIcons(icons.map((i) => ({ id: i.id, imageUrl: i.imageUrl, name: i.name })));
        setDbIconsLoaded(true);
      });
    });
  }, [dbIconsLoaded]);

  function updateContent(patch: Partial<DesignBuildAdvantageContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  function handleBgPhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) updateContent({ backgroundPhoto: items[0].url });
    setBgPickerOpen(false);
  }

  const locked = !!content.lockItemStyles;

  const DB_ITEM_STYLE_KEYS: string[] = [
    "titleFont", "titleSize", "titleBold", "titleItalic", "titleUnderline", "titleColor", "titleOutline",
    "descriptionFont", "descriptionSize", "descriptionBold", "descriptionItalic", "descriptionUnderline", "descriptionColor", "descriptionOutline",
  ];

  function propagateLock<T>(items: T[], idx: number, patch: Partial<T>): T[] {
    let updated = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    if (locked && idx === 0) {
      const stylePatch: Record<string, unknown> = {};
      for (const k of DB_ITEM_STYLE_KEYS) {
        if (k in (patch as unknown as Record<string, unknown>)) stylePatch[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((it, i) => i === 0 ? it : { ...it, ...stylePatch });
      }
    }
    return updated;
  }

  // Pillar CRUD
  function updatePillar(idx: number, patch: Partial<DesignBuildPillar>) {
    updateContent({ pillars: propagateLock(pillars, idx, patch) });
  }
  function movePillar(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= pillars.length) return;
    const u = [...pillars];
    [u[idx], u[t]] = [u[t], u[idx]];
    updateContent({ pillars: u });
  }
  function addPillar() {
    // Empty title + description so an unedited pillar won't render on the
    // slide (the DesignBuildAdvantageSlide filters pillars where both are
    // blank). Prevents the "New Pillar" orphan from leaking into published decks.
    updateContent({ pillars: [...pillars, { id: `p-${Date.now()}`, icon: "Shield", title: "", description: "" }] });
  }
  function removePillar(idx: number) {
    updateContent({ pillars: pillars.filter((_, i) => i !== idx) });
  }

  // Guarantee CRUD
  function updateGuarantee(idx: number, patch: Partial<DesignBuildGuarantee>) {
    updateContent({ guarantees: propagateLock(guarantees, idx, patch) });
  }
  function addGuarantee() {
    updateContent({ guarantees: [...guarantees, { id: `g-${Date.now()}`, title: "New Guarantee", description: "" }] });
  }
  function removeGuarantee(idx: number) {
    updateContent({ guarantees: guarantees.filter((_, i) => i !== idx) });
  }

  // Diagram node CRUD
  function updateNode(idx: number, label: string) {
    updateContent({ diagramNodes: nodes.map((n, i) => (i === idx ? { ...n, label } : n)) });
  }
  function addNode() {
    updateContent({ diagramNodes: [...nodes, { id: `n-${Date.now()}`, label: "New" }] });
  }
  function removeNode(idx: number) {
    updateContent({ diagramNodes: nodes.filter((_, i) => i !== idx) });
  }

  // Support column CRUD
  function updateColumn(idx: number, patch: Partial<DesignBuildSupportColumn>) {
    updateContent({ supportColumns: propagateLock(columns, idx, patch) });
  }
  function moveColumn(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= columns.length) return;
    const u = [...columns];
    [u[idx], u[t]] = [u[t], u[idx]];
    updateContent({ supportColumns: u });
  }
  function addColumn() {
    updateContent({ supportColumns: [...columns, { id: `c-${Date.now()}`, title: "New Column", description: "" }] });
  }
  function removeColumn(idx: number) {
    updateContent({ supportColumns: columns.filter((_, i) => i !== idx) });
  }

  const accent = content.accentColor ?? branding.accentColor;

  return (
    <>
      {/* ── Slide Title ─────────────────────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput value={slide.headline ?? ""} onChange={(v) => onUpdate({ ...slide, headline: v || null })} placeholder="The Design-Build Advantage" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.slideTitleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ slideTitleFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.slideTitleSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.slideTitleSize ?? 1.0} onChange={(v) => updateContent({ slideTitleSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.slideTitleBold ?? true} italic={content.slideTitleItalic} underline={content.slideTitleUnderline}
          onBold={(v) => updateContent({ slideTitleBold: v })} onItalic={(v) => updateContent({ slideTitleItalic: v })} onUnderline={(v) => updateContent({ slideTitleUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.slideTitleColor} defaultVal={branding.textColor}
          onChange={(v) => updateContent({ slideTitleColor: v })} onReset={() => updateContent({ slideTitleColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.slideTitleOutline} onChangeFn={(v) => updateContent({ slideTitleOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* ── Subheadline ─────────────────────────────────────────────── */}
      <SectionLabel>Subheadline</SectionLabel>
      <FieldGroup label="">
        <TextInput value={content.subheadline ?? ""} onChange={(v) => updateContent({ subheadline: v || null })} placeholder="Optional supporting line" />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.subheadlineFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ subheadlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.subheadlineSize ?? 1.0).toFixed(1)}×`}>
        <PSizeSlider value={content.subheadlineSize ?? 1.0} onChange={(v) => updateContent({ subheadlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.subheadlineBold} italic={content.subheadlineItalic} underline={content.subheadlineUnderline}
          onBold={(v) => updateContent({ subheadlineBold: v })} onItalic={(v) => updateContent({ subheadlineItalic: v })} onUnderline={(v) => updateContent({ subheadlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.subheadlineColor} defaultVal="#4A5568"
          onChange={(v) => updateContent({ subheadlineColor: v })} onReset={() => updateContent({ subheadlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.subheadlineOutline} onChangeFn={(v) => updateContent({ subheadlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      {PF_GROUP_DIVIDER}

      {/* Background style — Layout B */}
      {layoutKey === "bold-guarantee" && (
        <FieldGroup label="Background Style">
          <select
            value={content.backgroundStyle ?? "dark"}
            onChange={(e) => updateContent({ backgroundStyle: e.target.value as "light" | "dark" })}
            style={{ width: "100%", fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "1px solid #D1D5DB" }}
          >
            <option value="dark">Dark (Navy)</option>
            <option value="light">Light (Linen)</option>
          </select>
        </FieldGroup>
      )}

      {/* Background photo — Layouts A, B, C */}
      {(layoutKey === "icon-cards" || layoutKey === "bold-guarantee" || layoutKey === "quad-grid") && (
        <>
          <SectionLabel>Background Photo</SectionLabel>
          {content.backgroundPhoto ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "#F3F4F6" }}>
                <img src={content.backgroundPhoto} alt="Background" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setBgPickerOpen(true)} style={{ flex: 1, fontSize: 10, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "3px 8px" }}>Change</button>
                <button onClick={() => updateContent({ backgroundPhoto: null })} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "1px solid #FCA5A5", borderRadius: 4, padding: "3px 8px" }}>Remove</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setBgPickerOpen(true)} style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "12px 10px", marginBottom: 8 }}>
              + Select from Photo Library
            </button>
          )}
          <LibraryMediaPicker open={bgPickerOpen} onClose={() => setBgPickerOpen(false)} onSelect={handleBgPhotoSelect} multiple={false} includeUnapproved />
        </>
      )}

      {/* Footer note — Layout B */}
      {layoutKey === "bold-guarantee" && (
        <>
          <SectionLabel>Footer Note</SectionLabel>
          <FieldGroup label="">
            <TextInput value={content.footerNote ?? ""} onChange={(v) => updateContent({ footerNote: v || null })} placeholder="Optional footer" />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.footerNoteFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ footerNoteFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.footerNoteSize ?? 1.0).toFixed(1)}×`}>
            <PSizeSlider value={content.footerNoteSize ?? 1.0} onChange={(v) => updateContent({ footerNoteSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Style">
            <PStyleButtons bold={content.footerNoteBold} italic={content.footerNoteItalic ?? true} underline={content.footerNoteUnderline}
              onBold={(v) => updateContent({ footerNoteBold: v })} onItalic={(v) => updateContent({ footerNoteItalic: v })} onUnderline={(v) => updateContent({ footerNoteUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Color">
            <BrandingColorRow branding={branding} value={content.footerNoteColor} defaultVal="#4A5568"
              onChange={(v) => updateContent({ footerNoteColor: v })} onReset={() => updateContent({ footerNoteColor: null })} />
          </FieldGroup>
          <FieldGroup label="Outline">
            <POutlineRow value={content.footerNoteOutline} onChangeFn={(v) => updateContent({ footerNoteOutline: v })} accentColor={accent} />
          </FieldGroup>
        </>
      )}

      <Divider />

      {/* Lock toggle for all item types */}
      <PLockItemStylesToggle checked={locked} onChange={(v) => {
        if (v) {
          const patch: Partial<DesignBuildAdvantageContent> = { lockItemStyles: true };
          // Sync active item list from first item
          if ((layoutKey === "icon-cards" || layoutKey === "quad-grid") && pillars.length > 1) {
            const src = pillars[0]; const sp: Record<string, unknown> = {};
            for (const k of DB_ITEM_STYLE_KEYS) sp[k] = (src as unknown as Record<string, unknown>)[k];
            patch.pillars = pillars.map((p, i) => i === 0 ? p : { ...p, ...sp }) as DesignBuildPillar[];
          }
          if (layoutKey === "bold-guarantee" && guarantees.length > 1) {
            const src = guarantees[0]; const sp: Record<string, unknown> = {};
            for (const k of DB_ITEM_STYLE_KEYS) sp[k] = (src as unknown as Record<string, unknown>)[k];
            patch.guarantees = guarantees.map((g, i) => i === 0 ? g : { ...g, ...sp }) as DesignBuildGuarantee[];
          }
          if (layoutKey === "cycle-diagram" && columns.length > 1) {
            const src = columns[0]; const sp: Record<string, unknown> = {};
            for (const k of DB_ITEM_STYLE_KEYS) sp[k] = (src as unknown as Record<string, unknown>)[k];
            patch.supportColumns = columns.map((c, i) => i === 0 ? c : { ...c, ...sp }) as DesignBuildSupportColumn[];
          }
          updateContent(patch);
        } else {
          updateContent({ lockItemStyles: null });
        }
      }} />

      {/* Pillars — Layouts A and C */}
      {(layoutKey === "icon-cards" || layoutKey === "quad-grid") && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionLabel>Pillars</SectionLabel>
            <button onClick={addPillar} style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>+ Add</button>
          </div>
          {pillars.map((p, pi) => (
            <div key={p.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <SectionLabel>Pillar {pi + 1}</SectionLabel>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => movePillar(pi, -1)} disabled={pi === 0} style={{ fontSize: 11, color: pi === 0 ? "#D1D5DB" : "#6B7280", cursor: pi === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
                  <button onClick={() => movePillar(pi, 1)} disabled={pi === pillars.length - 1} style={{ fontSize: 11, color: pi === pillars.length - 1 ? "#D1D5DB" : "#6B7280", cursor: pi === pillars.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
                  {pillars.length > 1 && <button onClick={() => removePillar(pi)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>}
                </div>
              </div>
              <FieldGroup label="">
                <TemplateCIconPicker
                  icons={dbBrandIcons}
                  value={p.iconId ?? null}
                  onChange={(iconId) => {
                    const ic = iconId ? dbBrandIcons.find((i) => i.id === iconId) : null;
                    updatePillar(pi, { iconId: iconId ?? null, iconUrl: ic?.imageUrl ?? null });
                  }}
                  label="Icon"
                />
              </FieldGroup>
              <FieldGroup label="Title"><TextInput value={p.title} onChange={(v) => updatePillar(pi, { title: v })} placeholder="Pillar title" /></FieldGroup>
              {(!locked || pi === 0) && (
                <>
                  <FieldGroup label={`Title Font${locked ? " (all)" : ""}`}><PFontSelect value={p.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePillar(pi, { titleFont: v })} /></FieldGroup>
                  <FieldGroup label={`Title Size — ${(p.titleSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={p.titleSize ?? 1.0} onChange={(v) => updatePillar(pi, { titleSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Title Style"><PStyleButtons bold={p.titleBold ?? true} italic={p.titleItalic} underline={p.titleUnderline} onBold={(v) => updatePillar(pi, { titleBold: v })} onItalic={(v) => updatePillar(pi, { titleItalic: v })} onUnderline={(v) => updatePillar(pi, { titleUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Title Color"><BrandingColorRow branding={branding} value={p.titleColor} defaultVal={branding.textColor} onChange={(v) => updatePillar(pi, { titleColor: v })} onReset={() => updatePillar(pi, { titleColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Title Outline"><POutlineRow value={p.titleOutline} onChangeFn={(v) => updatePillar(pi, { titleOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
              {PF_GROUP_DIVIDER}
              <FieldGroup label="Description"><TextArea value={p.description} onChange={(v) => updatePillar(pi, { description: v })} rows={2} placeholder="" /></FieldGroup>
              {(!locked || pi === 0) && (
                <>
                  <FieldGroup label={`Desc Font${locked ? " (all)" : ""}`}><PFontSelect value={p.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updatePillar(pi, { descriptionFont: v })} /></FieldGroup>
                  <FieldGroup label={`Desc Size — ${(p.descriptionSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={p.descriptionSize ?? 1.0} onChange={(v) => updatePillar(pi, { descriptionSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Desc Style"><PStyleButtons bold={p.descriptionBold} italic={p.descriptionItalic} underline={p.descriptionUnderline} onBold={(v) => updatePillar(pi, { descriptionBold: v })} onItalic={(v) => updatePillar(pi, { descriptionItalic: v })} onUnderline={(v) => updatePillar(pi, { descriptionUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Desc Color"><BrandingColorRow branding={branding} value={p.descriptionColor} defaultVal="#4A5568" onChange={(v) => updatePillar(pi, { descriptionColor: v })} onReset={() => updatePillar(pi, { descriptionColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Desc Outline"><POutlineRow value={p.descriptionOutline} onChangeFn={(v) => updatePillar(pi, { descriptionOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
            </div>
          ))}
          <Divider />
        </>
      )}

      {/* Guarantees — Layout B */}
      {layoutKey === "bold-guarantee" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionLabel>Guarantees</SectionLabel>
            <button onClick={addGuarantee} style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>+ Add</button>
          </div>
          {guarantees.map((g, gi) => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <SectionLabel>Guarantee {gi + 1}</SectionLabel>
                {guarantees.length > 1 && <button onClick={() => removeGuarantee(gi)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>}
              </div>
              <FieldGroup label="Title"><TextInput value={g.title} onChange={(v) => updateGuarantee(gi, { title: v })} placeholder="Guarantee title" /></FieldGroup>
              {(!locked || gi === 0) && (
                <>
                  <FieldGroup label={`Title Font${locked ? " (all)" : ""}`}><PFontSelect value={g.titleFont ?? content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateGuarantee(gi, { titleFont: v })} /></FieldGroup>
                  <FieldGroup label={`Title Size — ${(g.titleSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={g.titleSize ?? 1.0} onChange={(v) => updateGuarantee(gi, { titleSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Title Style"><PStyleButtons bold={g.titleBold ?? true} italic={g.titleItalic} underline={g.titleUnderline} onBold={(v) => updateGuarantee(gi, { titleBold: v })} onItalic={(v) => updateGuarantee(gi, { titleItalic: v })} onUnderline={(v) => updateGuarantee(gi, { titleUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Title Color"><BrandingColorRow branding={branding} value={g.titleColor} defaultVal={branding.textColor} onChange={(v) => updateGuarantee(gi, { titleColor: v })} onReset={() => updateGuarantee(gi, { titleColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Title Outline"><POutlineRow value={g.titleOutline} onChangeFn={(v) => updateGuarantee(gi, { titleOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
              {PF_GROUP_DIVIDER}
              <FieldGroup label="Description"><TextArea value={g.description} onChange={(v) => updateGuarantee(gi, { description: v })} rows={2} placeholder="" /></FieldGroup>
              {(!locked || gi === 0) && (
                <>
                  <FieldGroup label={`Desc Font${locked ? " (all)" : ""}`}><PFontSelect value={g.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateGuarantee(gi, { descriptionFont: v })} /></FieldGroup>
                  <FieldGroup label={`Desc Size — ${(g.descriptionSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={g.descriptionSize ?? 1.0} onChange={(v) => updateGuarantee(gi, { descriptionSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Desc Style"><PStyleButtons bold={g.descriptionBold} italic={g.descriptionItalic} underline={g.descriptionUnderline} onBold={(v) => updateGuarantee(gi, { descriptionBold: v })} onItalic={(v) => updateGuarantee(gi, { descriptionItalic: v })} onUnderline={(v) => updateGuarantee(gi, { descriptionUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Desc Color"><BrandingColorRow branding={branding} value={g.descriptionColor} defaultVal="#4A5568" onChange={(v) => updateGuarantee(gi, { descriptionColor: v })} onReset={() => updateGuarantee(gi, { descriptionColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Desc Outline"><POutlineRow value={g.descriptionOutline} onChangeFn={(v) => updateGuarantee(gi, { descriptionOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
            </div>
          ))}
          <Divider />
        </>
      )}

      {/* Diagram nodes — Layout D */}
      {layoutKey === "cycle-diagram" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionLabel>Cycle Nodes</SectionLabel>
            <button onClick={addNode} style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>+ Add</button>
          </div>
          {nodes.map((n, ni) => (
            <div key={n.id} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
              <TextInput value={n.label} onChange={(v) => updateNode(ni, v)} placeholder={`Node ${ni + 1}`} />
              {nodes.length > 2 && <button onClick={() => removeNode(ni)} style={{ fontSize: 10, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 2px", flexShrink: 0 }}>✕</button>}
            </div>
          ))}

          <Divider />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionLabel>Support Columns</SectionLabel>
            <button onClick={addColumn} style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", background: "none", border: "1px solid #D1D5DB", borderRadius: 4, padding: "2px 8px" }}>+ Add</button>
          </div>
          {columns.map((col, ci) => (
            <div key={col.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <SectionLabel>Column {ci + 1}</SectionLabel>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => moveColumn(ci, -1)} disabled={ci === 0} style={{ fontSize: 11, color: ci === 0 ? "#D1D5DB" : "#6B7280", cursor: ci === 0 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▲</button>
                  <button onClick={() => moveColumn(ci, 1)} disabled={ci === columns.length - 1} style={{ fontSize: 11, color: ci === columns.length - 1 ? "#D1D5DB" : "#6B7280", cursor: ci === columns.length - 1 ? "default" : "pointer", background: "none", border: "none", padding: "0 3px" }}>▼</button>
                  {columns.length > 1 && <button onClick={() => removeColumn(ci)} style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none", padding: "0 3px" }}>✕</button>}
                </div>
              </div>
              <FieldGroup label="Title"><TextInput value={col.title} onChange={(v) => updateColumn(ci, { title: v })} placeholder="Column title" /></FieldGroup>
              {(!locked || ci === 0) && (
                <>
                  <FieldGroup label={`Title Font${locked ? " (all)" : ""}`}><PFontSelect value={col.titleFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateColumn(ci, { titleFont: v })} /></FieldGroup>
                  <FieldGroup label={`Title Size — ${(col.titleSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={col.titleSize ?? 1.0} onChange={(v) => updateColumn(ci, { titleSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Title Style"><PStyleButtons bold={col.titleBold ?? true} italic={col.titleItalic} underline={col.titleUnderline} onBold={(v) => updateColumn(ci, { titleBold: v })} onItalic={(v) => updateColumn(ci, { titleItalic: v })} onUnderline={(v) => updateColumn(ci, { titleUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Title Color"><BrandingColorRow branding={branding} value={col.titleColor} defaultVal={branding.textColor} onChange={(v) => updateColumn(ci, { titleColor: v })} onReset={() => updateColumn(ci, { titleColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Title Outline"><POutlineRow value={col.titleOutline} onChangeFn={(v) => updateColumn(ci, { titleOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
              {PF_GROUP_DIVIDER}
              <FieldGroup label="Description"><TextArea value={col.description} onChange={(v) => updateColumn(ci, { description: v })} rows={2} placeholder="" /></FieldGroup>
              {(!locked || ci === 0) && (
                <>
                  <FieldGroup label={`Desc Font${locked ? " (all)" : ""}`}><PFontSelect value={col.descriptionFont ?? content.bodyFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateColumn(ci, { descriptionFont: v })} /></FieldGroup>
                  <FieldGroup label={`Desc Size — ${(col.descriptionSize ?? 1.0).toFixed(1)}×`}><PSizeSlider value={col.descriptionSize ?? 1.0} onChange={(v) => updateColumn(ci, { descriptionSize: v })} accentColor={accent} /></FieldGroup>
                  <FieldGroup label="Desc Style"><PStyleButtons bold={col.descriptionBold} italic={col.descriptionItalic} underline={col.descriptionUnderline} onBold={(v) => updateColumn(ci, { descriptionBold: v })} onItalic={(v) => updateColumn(ci, { descriptionItalic: v })} onUnderline={(v) => updateColumn(ci, { descriptionUnderline: v })} /></FieldGroup>
                  <FieldGroup label="Desc Color"><BrandingColorRow branding={branding} value={col.descriptionColor} defaultVal="#4A5568" onChange={(v) => updateColumn(ci, { descriptionColor: v })} onReset={() => updateColumn(ci, { descriptionColor: undefined })} /></FieldGroup>
                  <FieldGroup label="Desc Outline"><POutlineRow value={col.descriptionOutline} onChangeFn={(v) => updateColumn(ci, { descriptionOutline: v })} accentColor={accent} /></FieldGroup>
                </>
              )}
            </div>
          ))}
          <Divider />
        </>
      )}

      <a
        href="/admin/settings/design-build"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, color: "#6B7280", textDecoration: "underline", display: "inline-block", marginBottom: 8 }}
      >
        Manage defaults in Settings
      </a>
      <SharedCardStyleSection content={content} updateContent={updateContent} />
      <SharedOverlaySection content={content} updateContent={updateContent} />
      {/* Logo section moved to main InspectorPanel */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
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
                ...(selectedBg
                  ? (getBrandBackgroundStyles(selectedBg) as React.CSSProperties)
                  : { background: "#F3F4F6" }),
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
                        ...(!bg.previewImageUrl
                          ? (getBrandBackgroundStyles(bg) as React.CSSProperties)
                          : { background: bg.baseColorHex ?? "#E5E7EB" }),
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

// ─── Addition Overview Inspector ────────────────────────────────────────────

function AdditionOverviewInspector({
  slide,
  branding,
  onUpdate,
  projectId,
  projectRoomsWithMedia = [],
  projectLevelMedia = [],
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  projectId: string;
  projectRoomsWithMedia?: RoomWithMedia[];
  projectLevelMedia?: RoomMediaItem[];
}) {
  const content = (slide.content ?? {}) as AdditionOverviewContent;
  const accent = content.accentColor ?? branding.accentColor;
  const bullets = content.bullets ?? [];
  const layout = content.layout ?? "combined";
  const showCad = layout === "photo-cad-overlay" || layout === "combined";
  const showCard = layout === "photo-bullet-card" || layout === "combined";

  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [generatingOverlay, setGeneratingOverlay] = useState(false);
  const [generatingBullets, setGeneratingBullets] = useState(false);
  const [libPickerOpen, setLibPickerOpen] = useState(false);

  function updateContent(patch: Partial<AdditionOverviewContent>) {
    onUpdate({ ...slide, content: { ...content, ...patch } });
  }

  const locked = !!content.lockItemStyles;
  const BULLET_STYLE_KEYS: (keyof AdditionBullet)[] = [
    "labelFont", "labelSize", "labelBold", "labelItalic", "labelUnderline", "labelColor", "labelOutline",
    "descriptionFont", "descriptionSize", "descriptionBold", "descriptionItalic", "descriptionUnderline", "descriptionColor", "descriptionOutline",
  ];

  function updateBullet(idx: number, patch: Partial<AdditionBullet>) {
    let updated = bullets.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    if (locked && idx === 0) {
      const stylePatch: Partial<AdditionBullet> = {};
      for (const k of BULLET_STYLE_KEYS) {
        if (k in patch) (stylePatch as unknown as Record<string, unknown>)[k] = (patch as unknown as Record<string, unknown>)[k];
      }
      if (Object.keys(stylePatch).length > 0) {
        updated = updated.map((b, i) => i === 0 ? b : { ...b, ...stylePatch });
      }
    }
    updateContent({ bullets: updated });
  }

  function removeBullet(idx: number) {
    if (bullets.length <= 1) return;
    updateContent({ bullets: bullets.filter((_, i) => i !== idx) });
  }

  function moveBullet(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= bullets.length) return;
    const updated = [...bullets];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateContent({ bullets: updated });
  }

  function addBullet() {
    if (bullets.length >= 3) return;
    updateContent({
      bullets: [...bullets, { id: `b-${Date.now()}`, label: "New Item", description: "Description here." }],
    });
  }

  function handlePhotoSelect(items: LibraryMediaItem[]) {
    if (items.length > 0) {
      updateContent({ sourcePhotoUrl: items[0].url, sourcePhotoId: items[0].id });
    }
    setLibPickerOpen(false);
  }

  function handleProjectMediaSelect(m: RoomMediaItem) {
    updateContent({
      sourcePhotoUrl: m.url,
      sourcePhotoId: m.id,
      cadGeneratedImageUrl: null,
      cadGenerationStatus: "idle",
      cadGenerationError: null,
    });
    setPhotoPickerOpen(false);
  }

  async function handleGenerateOverlay() {
    if (!content.sourcePhotoUrl) return;
    setGeneratingOverlay(true);
    updateContent({ cadGenerationStatus: "generating", cadGenerationError: null });

    try {
      const res = await fetch("/api/slides/addition-overview/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePhotoUrl: content.sourcePhotoUrl,
          boundingBoxX: content.boundingBoxX ?? 10,
          boundingBoxY: content.boundingBoxY ?? 10,
          boundingBoxWidth: content.boundingBoxWidth ?? 40,
          boundingBoxHeight: content.boundingBoxHeight ?? 50,
          calloutLabel: content.calloutLabel ?? "Proposed Addition Area",
          overlayIntensity: content.cadOverlayIntensity ?? 70,
          projectId,
          slideId: slide.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        updateContent({ cadGeneratedImageUrl: data.imageUrl, cadGenerationStatus: "complete" });
      } else {
        updateContent({ cadGenerationStatus: "error", cadGenerationError: data.error ?? "Unknown error" });
      }
    } catch (err) {
      updateContent({ cadGenerationStatus: "error", cadGenerationError: String(err) });
    } finally {
      setGeneratingOverlay(false);
    }
  }

  async function handlePullFromScopes() {
    setGeneratingBullets(true);
    try {
      const result = await generateAdditionBulletsAction(projectId);
      updateContent({ bullets: result.bullets });
    } catch {
      // Fall back silently — default bullets remain
    } finally {
      setGeneratingBullets(false);
    }
  }

  return (
    <>
      {/* ── HEADLINE ─────────────────────────────── */}
      <SectionLabel>Headline</SectionLabel>
      <FieldGroup label="">
        <TextInput
          value={slide.headline ?? ""}
          onChange={(v) => onUpdate({ ...slide, headline: v || null })}
          placeholder="The Vision: Expanding the Footprint"
        />
      </FieldGroup>
      <FieldGroup label="Font">
        <PFontSelect value={content.headlineFont ?? SLIDE_FONTS.defaults.headline} onChange={(v) => updateContent({ headlineFont: v })} />
      </FieldGroup>
      <FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}×`}>
        <PSizeSlider value={content.headlineSize ?? 2.0} onChange={(v) => updateContent({ headlineSize: v })} accentColor={accent} />
      </FieldGroup>
      <FieldGroup label="Style">
        <PStyleButtons bold={content.headlineBold} italic={content.headlineItalic} underline={content.headlineUnderline}
          onBold={(v) => updateContent({ headlineBold: v })} onItalic={(v) => updateContent({ headlineItalic: v })} onUnderline={(v) => updateContent({ headlineUnderline: v })} />
      </FieldGroup>
      <FieldGroup label="Color">
        <BrandingColorRow branding={branding} value={content.headlineColor} defaultVal="#1B2A4A"
          onChange={(v) => updateContent({ headlineColor: v })} onReset={() => updateContent({ headlineColor: null })} />
      </FieldGroup>
      <FieldGroup label="Outline">
        <POutlineRow value={content.headlineOutline} onChangeFn={(v) => updateContent({ headlineOutline: v })} accentColor={accent} />
      </FieldGroup>

      <Divider />

      {/* ── EXTERIOR PHOTO ───────────────────────── */}
      <SectionLabel>Source Photo</SectionLabel>
      {content.sourcePhotoUrl ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 6, overflow: "hidden", border: "1px solid #E5E7EB", marginBottom: 6 }}>
            <img src={content.sourcePhotoUrl} alt="Source" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div className="flex gap-1">
            <button onClick={() => setPhotoPickerOpen(true)}
              style={{ flex: 1, fontSize: 10, padding: "4px 8px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 4, cursor: "pointer", color: "#6B7280" }}>
              Change Photo
            </button>
            <button onClick={() => setLibPickerOpen(true)}
              style={{ flex: 1, fontSize: 10, padding: "4px 8px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 4, cursor: "pointer", color: "#6B7280" }}>
              Photo Library
            </button>
            <button onClick={() => updateContent({ sourcePhotoUrl: null, sourcePhotoId: null, cadGeneratedImageUrl: null, cadGenerationStatus: "idle", cadGenerationError: null })}
              style={{ fontSize: 10, padding: "4px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, cursor: "pointer", color: "#DC2626" }}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1" style={{ marginBottom: 8 }}>
          <button onClick={() => setPhotoPickerOpen(true)}
            style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "16px 10px", textAlign: "center" }}>
            + Select from Project Media
          </button>
          <button onClick={() => setLibPickerOpen(true)}
            style={{ width: "100%", fontSize: 10, color: "#9CA3AF", cursor: "pointer", background: "none", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 10px", textAlign: "center" }}>
            or Photo Library
          </button>
        </div>
      )}

      {/* Project media picker modal (same as Cover slide Source Photo) */}
      {photoPickerOpen && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setPhotoPickerOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", background: "#fff", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "min(520px, 90vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: branding.textColor }}>Select Source Photo</span>
              <button onClick={() => setPhotoPickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: 4 }}>&times;</button>
            </div>
            <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1 }}>
              {(() => {
                const hasAny = projectLevelMedia.length > 0 || projectRoomsWithMedia.some((r) => r.beforeMedia.length > 0 || r.renderMedia.length > 0);
                if (!hasAny) {
                  return <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>No project media found. Add photos in the Media tab.</p>;
                }

                function ModalThumb({ m, label, sectionName }: { m: RoomMediaItem; label: "Photo" | "Render"; sectionName: string }) {
                  const isSelected = content.sourcePhotoId === m.id;
                  return (
                    <button
                      onClick={() => handleProjectMediaSelect(m)}
                      style={{
                        position: "relative", aspectRatio: "4/3", borderRadius: 6, overflow: "hidden",
                        border: isSelected ? `3px solid ${branding.accentColor}` : "2px solid #E5E7EB",
                        cursor: "pointer", padding: 0, background: "none", transition: "border-color 0.15s",
                      }}
                    >
                      <img src={m.url} alt={m.caption ?? sectionName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <span style={{
                        position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 9, fontWeight: 600, textAlign: "center", padding: "2px 4px",
                        background: label === "Render" ? "rgba(22,163,74,0.85)" : "rgba(0,0,0,0.55)", color: "#fff",
                      }}>{label}</span>
                    </button>
                  );
                }

                return (
                  <>
                    {projectLevelMedia.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Front Page</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                          {projectLevelMedia.map((m) => (
                            <ModalThumb key={m.id} m={m} label={m.renderStatus === "DONE" ? "Render" : "Photo"} sectionName="Front Page" />
                          ))}
                        </div>
                      </div>
                    )}
                    {projectRoomsWithMedia.map((room) => {
                      const allMedia = [
                        ...room.beforeMedia.map((m) => ({ ...m, label: "Photo" as const })),
                        ...room.renderMedia.map((m) => ({ ...m, label: "Render" as const })),
                      ];
                      if (allMedia.length === 0) return null;
                      return (
                        <div key={room.id} style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{room.name}</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                            {allMedia.map((m) => (<ModalThumb key={m.id} m={m} label={m.label} sectionName={room.name} />))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Library media picker fallback */}
      <LibraryMediaPicker open={libPickerOpen} onClose={() => setLibPickerOpen(false)} onSelect={handlePhotoSelect} multiple={false} includeUnapproved />

      {/* ── CAD OVERLAY ──────────────────────────── */}
      {showCad && (
        <>
          <Divider />
          <SectionLabel>CAD Overlay</SectionLabel>

          {content.cadGeneratedImageUrl ? (
            <p style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
              Adjust the sliders to move and resize the overlay region. The generated image is clipped to this area.
            </p>
          ) : (
            <p style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginBottom: 8 }}>
              Position the addition area, then generate. You can fine-tune the position after.
            </p>
          )}

          {/* Show / hide bounding box toggle */}
          <FieldGroup label="">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={content.showBoundingBox !== false}
                onChange={(e) => updateContent({ showBoundingBox: e.target.checked })}
              />
              Show dashed border
            </label>
          </FieldGroup>

          <FieldGroup label={`Left Edge — ${content.boundingBoxX ?? 10}%`}>
            <input type="range" min={0} max={90} step={1} value={content.boundingBoxX ?? 10}
              onChange={(e) => updateContent({ boundingBoxX: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>
          <FieldGroup label={`Top Edge — ${content.boundingBoxY ?? 10}%`}>
            <input type="range" min={0} max={90} step={1} value={content.boundingBoxY ?? 10}
              onChange={(e) => updateContent({ boundingBoxY: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>
          <FieldGroup label={`Width — ${content.boundingBoxWidth ?? 40}%`}>
            <input type="range" min={10} max={90} step={1} value={content.boundingBoxWidth ?? 40}
              onChange={(e) => updateContent({ boundingBoxWidth: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>
          <FieldGroup label={`Height — ${content.boundingBoxHeight ?? 50}%`}>
            <input type="range" min={10} max={90} step={1} value={content.boundingBoxHeight ?? 50}
              onChange={(e) => updateContent({ boundingBoxHeight: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>

          {/* Nudge rendered image — only visible after generation */}
          {content.cadGeneratedImageUrl && (
            <>
              {PF_GROUP_DIVIDER}
              <SectionLabel>Nudge Rendered Area</SectionLabel>
              <p style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic", marginBottom: 6 }}>
                Shift the CAD lines left/right/up/down to align with the structure.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {/* Up / Down row */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => updateContent({ cadOffsetY: (content.cadOffsetY ?? 0) - 5 })}
                    style={{ width: 36, height: 28, fontSize: 14, background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#374151" }}
                  >↑</button>
                </div>
                {/* Left / Reset / Right row */}
                <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                  <button
                    onClick={() => updateContent({ cadOffsetX: (content.cadOffsetX ?? 0) - 5 })}
                    style={{ width: 36, height: 28, fontSize: 14, background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#374151" }}
                  >←</button>
                  <button
                    onClick={() => updateContent({ cadOffsetX: 0, cadOffsetY: 0 })}
                    style={{ width: 36, height: 28, fontSize: 10, background: "#F9FAFB", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#9CA3AF", fontWeight: 600 }}
                  >⟲</button>
                  <button
                    onClick={() => updateContent({ cadOffsetX: (content.cadOffsetX ?? 0) + 5 })}
                    style={{ width: 36, height: 28, fontSize: 14, background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#374151" }}
                  >→</button>
                </div>
                {/* Down */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => updateContent({ cadOffsetY: (content.cadOffsetY ?? 0) + 5 })}
                    style={{ width: 36, height: 28, fontSize: 14, background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", color: "#374151" }}
                  >↓</button>
                </div>
                <p style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}>
                  Offset: {content.cadOffsetX ?? 0}px, {content.cadOffsetY ?? 0}px
                </p>
              </div>
            </>
          )}

          {PF_GROUP_DIVIDER}

          {/* Callout label per-field controls */}
          <SectionLabel>Callout Label</SectionLabel>
          <FieldGroup label="">
            <TextInput
              value={content.calloutLabel ?? ""}
              onChange={(v) => updateContent({ calloutLabel: v || null })}
              placeholder="Proposed Addition Area"
            />
          </FieldGroup>
          <FieldGroup label="Font">
            <PFontSelect value={content.calloutLabelFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateContent({ calloutLabelFont: v })} />
          </FieldGroup>
          <FieldGroup label={`Size — ${(content.calloutLabelSize ?? 0.9).toFixed(1)}×`}>
            <PSizeSlider value={content.calloutLabelSize ?? 0.9} onChange={(v) => updateContent({ calloutLabelSize: v })} accentColor={accent} />
          </FieldGroup>
          <FieldGroup label="Style">
            <PStyleButtons bold={content.calloutLabelBold} italic={content.calloutLabelItalic} underline={content.calloutLabelUnderline}
              onBold={(v) => updateContent({ calloutLabelBold: v })} onItalic={(v) => updateContent({ calloutLabelItalic: v })} onUnderline={(v) => updateContent({ calloutLabelUnderline: v })} />
          </FieldGroup>
          <FieldGroup label="Color">
            <BrandingColorRow branding={branding} value={content.calloutLabelColor} defaultVal="#FFFFFF"
              onChange={(v) => updateContent({ calloutLabelColor: v })} onReset={() => updateContent({ calloutLabelColor: null })} />
          </FieldGroup>
          <FieldGroup label="Outline">
            <POutlineRow value={content.calloutLabelOutline} onChangeFn={(v) => updateContent({ calloutLabelOutline: v })} accentColor={accent} />
          </FieldGroup>

          {PF_GROUP_DIVIDER}

          <FieldGroup label={`Overlay Intensity — ${content.cadOverlayIntensity ?? 70}%`}>
            <input type="range" min={0} max={100} step={1} value={content.cadOverlayIntensity ?? 70}
              onChange={(e) => updateContent({ cadOverlayIntensity: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>

          {/* Generate button */}
          <button
            onClick={handleGenerateOverlay}
            disabled={generatingOverlay || !content.sourcePhotoUrl}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              background: generatingOverlay ? "#9CA3AF" : accent,
              border: "none",
              borderRadius: 6,
              cursor: generatingOverlay || !content.sourcePhotoUrl ? "not-allowed" : "pointer",
              marginBottom: 6,
              opacity: !content.sourcePhotoUrl ? 0.5 : 1,
            }}
          >
            {generatingOverlay ? "Generating…" : content.cadGeneratedImageUrl ? "Regenerate CAD Overlay" : "Generate CAD Overlay"}
          </button>

          {content.cadGenerationStatus === "error" && content.cadGenerationError && (
            <p style={{ fontSize: 10, color: "#EF4444", marginBottom: 8 }}>
              {content.cadGenerationError}
            </p>
          )}

          {content.cadGeneratedImageUrl && (
            <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 8, background: "#F3F4F6" }}>
              <img src={content.cadGeneratedImageUrl} alt="CAD overlay" style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }} />
            </div>
          )}

          {!content.sourcePhotoUrl && (
            <p style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>
              Select an exterior photo first to enable overlay generation.
            </p>
          )}
        </>
      )}

      {/* ── BULLET CARD ──────────────────────────── */}
      {showCard && (
        <>
          <Divider />
          <SectionLabel>Scope Highlights</SectionLabel>

          <button
            onClick={handlePullFromScopes}
            disabled={generatingBullets}
            style={{
              width: "100%",
              padding: "7px 12px",
              fontSize: 11,
              color: generatingBullets ? "#9CA3AF" : "#6B7280",
              background: "#F9FAFB",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              cursor: generatingBullets ? "not-allowed" : "pointer",
              marginBottom: 10,
            }}
          >
            {generatingBullets ? "Generating…" : "Pull from Room Scopes"}
          </button>

          <FieldGroup label="Card Accent">
            <BrandingColorRow branding={branding} value={content.cardAccentColor} defaultVal={accent}
              onChange={(v) => updateContent({ cardAccentColor: v })} onReset={() => updateContent({ cardAccentColor: null })} />
          </FieldGroup>
          <FieldGroup label="Card Background">
            <BrandingColorRow branding={branding} value={content.cardBackgroundColor} defaultVal="#FFFFFF"
              onChange={(v) => updateContent({ cardBackgroundColor: v })} onReset={() => updateContent({ cardBackgroundColor: null })} />
          </FieldGroup>

          {PF_GROUP_DIVIDER}

          <PLockItemStylesToggle checked={locked} onChange={(v) => {
            if (v && bullets.length > 1) {
              const src = bullets[0];
              const stylePatch: Partial<AdditionBullet> = {};
              for (const k of BULLET_STYLE_KEYS) (stylePatch as unknown as Record<string, unknown>)[k] = (src as unknown as Record<string, unknown>)[k];
              const synced = bullets.map((b, i) => i === 0 ? b : { ...b, ...stylePatch });
              updateContent({ lockItemStyles: true, bullets: synced });
            } else {
              updateContent({ lockItemStyles: v });
            }
          }} />

          {bullets.map((bullet, idx) => (
            <div key={bullet.id} style={{ marginBottom: 14, padding: "8px 0", borderTop: idx > 0 ? "1px solid #E5E3DF" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Bullet {idx + 1}
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => moveBullet(idx, -1)} disabled={idx === 0}
                    style={{ width: 22, height: 22, fontSize: 10, background: "none", border: "1px solid #D1D5DB", borderRadius: 3, cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveBullet(idx, 1)} disabled={idx === bullets.length - 1}
                    style={{ width: 22, height: 22, fontSize: 10, background: "none", border: "1px solid #D1D5DB", borderRadius: 3, cursor: idx === bullets.length - 1 ? "not-allowed" : "pointer", opacity: idx === bullets.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => removeBullet(idx)} disabled={bullets.length <= 1}
                    style={{ width: 22, height: 22, fontSize: 10, color: "#EF4444", background: "none", border: "1px solid #FCA5A5", borderRadius: 3, cursor: bullets.length <= 1 ? "not-allowed" : "pointer", opacity: bullets.length <= 1 ? 0.3 : 1 }}>×</button>
                </div>
              </div>

              {/* Label per-field controls */}
              <FieldGroup label="Label">
                <TextInput value={bullet.label} onChange={(v) => updateBullet(idx, { label: v })} placeholder="Bold label" />
              </FieldGroup>
              {(idx === 0 || !locked) && (
                <>
                  <FieldGroup label="Label Font">
                    <PFontSelect value={bullet.labelFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateBullet(idx, { labelFont: v })} />
                  </FieldGroup>
                  <FieldGroup label={`Label Size — ${(bullet.labelSize ?? 1.0).toFixed(1)}×`}>
                    <PSizeSlider value={bullet.labelSize ?? 1.0} onChange={(v) => updateBullet(idx, { labelSize: v })} accentColor={accent} />
                  </FieldGroup>
                  <FieldGroup label="Label Style">
                    <PStyleButtons bold={bullet.labelBold ?? true} italic={bullet.labelItalic} underline={bullet.labelUnderline}
                      onBold={(v) => updateBullet(idx, { labelBold: v })} onItalic={(v) => updateBullet(idx, { labelItalic: v })} onUnderline={(v) => updateBullet(idx, { labelUnderline: v })} />
                  </FieldGroup>
                  <FieldGroup label="Label Color">
                    <BrandingColorRow branding={branding} value={bullet.labelColor} defaultVal="#1B2A4A"
                      onChange={(v) => updateBullet(idx, { labelColor: v })} onReset={() => updateBullet(idx, { labelColor: null })} />
                  </FieldGroup>
                  <FieldGroup label="Label Outline">
                    <POutlineRow value={bullet.labelOutline} onChangeFn={(v) => updateBullet(idx, { labelOutline: v })} accentColor={accent} />
                  </FieldGroup>
                </>
              )}

              {/* Description per-field controls */}
              <FieldGroup label="Description">
                <TextArea value={bullet.description} onChange={(v) => updateBullet(idx, { description: v })} placeholder="Description text" rows={2} />
              </FieldGroup>
              {(idx === 0 || !locked) && (
                <>
                  <FieldGroup label="Desc Font">
                    <PFontSelect value={bullet.descriptionFont ?? SLIDE_FONTS.defaults.body} onChange={(v) => updateBullet(idx, { descriptionFont: v })} />
                  </FieldGroup>
                  <FieldGroup label={`Desc Size — ${(bullet.descriptionSize ?? 0.9).toFixed(1)}×`}>
                    <PSizeSlider value={bullet.descriptionSize ?? 0.9} onChange={(v) => updateBullet(idx, { descriptionSize: v })} accentColor={accent} />
                  </FieldGroup>
                  <FieldGroup label="Desc Style">
                    <PStyleButtons bold={bullet.descriptionBold} italic={bullet.descriptionItalic} underline={bullet.descriptionUnderline}
                      onBold={(v) => updateBullet(idx, { descriptionBold: v })} onItalic={(v) => updateBullet(idx, { descriptionItalic: v })} onUnderline={(v) => updateBullet(idx, { descriptionUnderline: v })} />
                  </FieldGroup>
                  <FieldGroup label="Desc Color">
                    <BrandingColorRow branding={branding} value={bullet.descriptionColor} defaultVal="#4A5568"
                      onChange={(v) => updateBullet(idx, { descriptionColor: v })} onReset={() => updateBullet(idx, { descriptionColor: null })} />
                  </FieldGroup>
                  <FieldGroup label="Desc Outline">
                    <POutlineRow value={bullet.descriptionOutline} onChangeFn={(v) => updateBullet(idx, { descriptionOutline: v })} accentColor={accent} />
                  </FieldGroup>
                </>
              )}
            </div>
          ))}

          {bullets.length < 3 && (
            <button onClick={addBullet} style={{ width: "100%", fontSize: 11, color: "#6B7280", cursor: "pointer", background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
              + Add Bullet
            </button>
          )}
        </>
      )}

      {/* ── PHOTO PANEL WIDTH ────────────────────── */}
      {layout === "combined" && (
        <>
          <Divider />
          <FieldGroup label={`Photo Panel Width — ${content.photoPanelWidth ?? 70}% photo / ${100 - (content.photoPanelWidth ?? 70)}% card`}>
            <input type="range" min={40} max={80} step={1} value={content.photoPanelWidth ?? 70}
              onChange={(e) => updateContent({ photoPanelWidth: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>
        </>
      )}
      {layout === "photo-bullet-card" && (
        <>
          <Divider />
          <FieldGroup label={`Photo Panel Width — ${content.photoPanelWidth ?? 70}% photo / ${100 - (content.photoPanelWidth ?? 70)}% card`}>
            <input type="range" min={40} max={80} step={1} value={content.photoPanelWidth ?? 70}
              onChange={(e) => updateContent({ photoPanelWidth: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: accent }} />
          </FieldGroup>
        </>
      )}

      {/* ── ACCENT COLOR ─────────────────────────── */}
      <SharedAccentColorSection content={content} updateContent={updateContent} branding={branding} />
    </>
  );
}
// ─── Main Inspector ──────────────────────────────────────────────────────────

export function InspectorPanel({
  slide,
  branding,
  projectId,
  onUpdate,
  onDuplicate,
  onRemove,
  onToggleEnabled,
  projectRoomsWithMedia = [],
  projectLevelMedia = [],
  brandBackgrounds = [],
  onBackgroundChange,
  onTextZoneChange,
  onAiBackgroundChange,
  onResyncInvestment,
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

      {/* Logo — moved here so it appears right below Visibility on all 18 slides */}
      {(() => {
        const logoContent = (slide.content ?? {}) as SharedSlideFields;
        const logoUpdate = (patch: Partial<SharedSlideFields>) => {
          onUpdate({ ...slide, content: { ...logoContent, ...patch } });
        };
        const logoDefaults: Record<string, { show: boolean; x: number; y: number; hidePos?: boolean }> = {
          "cover":                  { show: true,  x: 5,  y: 5 },
          "before-after":           { show: true,  x: 85, y: 88 },
          "closing-slide":          { show: true,  x: 50, y: 50, hidePos: true },
          "design-retainer":        { show: false, x: 50, y: 88 },
          "next-steps":             { show: false, x: 50, y: 88 },
        };
        const def = logoDefaults[slide.type] ?? { show: false, x: 85, y: 88 };
        return (
          <SharedLogoSection
            content={logoContent}
            updateContent={logoUpdate}
            defaultShow={def.show}
            defaultX={def.x}
            defaultY={def.y}
            hidePosSliders={def.hidePos}
          />
        );
      })()}

      {/* Layout selection */}
      <SectionLabel>Layout</SectionLabel>
      <div className="flex flex-col gap-1" style={{ marginBottom: 12 }}>
        {layouts.map((l) => (
          <button
            key={l.key}
            onClick={() => {
              const updated = { ...slide, layoutKey: l.key };
              // Addition Overview / Blueprint store layout in content.layout as well
              if (slide.type === "addition-overview") {
                const c = (slide.content ?? {}) as AdditionOverviewContent;
                updated.content = { ...c, layout: l.key as AdditionOverviewLayoutKey };
              }
              onUpdate(updated);
            }}
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
        <CoverInspector slide={slide} branding={branding} onUpdate={onUpdate} projectId={projectId} projectRoomsWithMedia={projectRoomsWithMedia} projectLevelMedia={projectLevelMedia} />
      )}
      {slide.type === "objective" && (
        <ObjectiveInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "investment" && (
        <InvestmentInspector slide={slide} branding={branding} onUpdate={onUpdate} onResyncInvestment={onResyncInvestment} />
      )}
      {slide.type === "why-us" && (
        <WhyUsInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "scope-overview" && (
        <ScopeOverviewInspector slide={slide} branding={branding} onUpdate={onUpdate} projectId={projectId} />
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
        <ProcessInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "core-values" && (
        <CoreValuesInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "project-timeline" && (
        <ProjectTimelineInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "cope-page" && (
        <CopePageInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "design-retainer" && (
        <DesignRetainerInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "next-steps" && (
        <NextStepsInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "closing-slide" && (
        <ClosingSlideInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "visual-inspiration" && (
        <VisualInspirationInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "client-testimonials" && (
        <ClientTestimonialsInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "design-build-advantage" && (
        <DesignBuildAdvantageInspector slide={slide} branding={branding} onUpdate={onUpdate} />
      )}
      {slide.type === "addition-overview" && (
        <AdditionOverviewInspector slide={slide} branding={branding} onUpdate={onUpdate} projectId={projectId} projectRoomsWithMedia={projectRoomsWithMedia} projectLevelMedia={projectLevelMedia} />
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

      {/* AI Background — not shown for Cover (hero photo is the background) */}
      {onAiBackgroundChange && slide.type !== "cover" && (
        <>
          <SlideAIRegenerate
            slideType={slide.type}
            slideId={slide.id}
            projectId={projectId}
            currentAiBackground={slide.aiBackground ?? null}
            onAccept={(url) => onAiBackgroundChange(url)}
            onDiscard={() => {/* no-op: discard just closes the preview */}}
          />
          <Divider />
        </>
      )}

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

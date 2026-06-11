"use client";

import { useState } from "react";
import type { ProposalSlide, DeckBranding, SlideType } from "@/app/lib/deck/types";
import { SLIDE_TYPE_LABELS } from "@/app/lib/deck/types";
import type { BrandBackgroundForUI } from "@/app/admin/settings/settings-tabs";
import { SlideRenderer } from "./slides/SlideRenderer";

interface Props {
  slides: ProposalSlide[];
  activeSlideId: string;
  branding: DeckBranding;
  onSelect: (id: string) => void;
  onReorder: (slides: ProposalSlide[]) => void;
  onToggleEnabled: (id: string) => void;
  brandBackgrounds?: BrandBackgroundForUI[];
}

const TYPE_ICON: Record<SlideType, string> = {
  cover:                 "⬛",
  objective:             "📋",
  "investment-by-space": "💰",
  "why-us":              "⭐",
  "scope-overview":      "🏗",
  "before-after":        "🔄",
  "scope-breakdown":     "📝",
  "our-process":         "📐",
  "core-values":         "💎",
  timeline:              "📅",
  cope:                  "🔧",
  "overall-investment":  "📄",
  "next-steps":          "➡",
  closing:               "🏁",
  "design-experience":   "🧭",
  testimonials:          "💬",
  "design-build":        "🏗",
  "addition-overview":   "🏠",
  "floor-plan":          "🗺",
  craftsmanship:         "🛠",
};

// ─── Constraint helpers ───────────────────────────────────────────────────────

/**
 * Returns true if moving the slide at `dragIdx` to land at `dropIdx` is valid.
 *
 * The splice-based reorder puts the dragged item AT `dropIdx` in the result.
 * Constraints:
 *   • A "first"-locked slide is always at index 0 — nothing can land ≤ its index.
 *   • A "last"-locked slide is always at the final index — nothing can land ≥ its index.
 *   • A locked slide itself cannot be dragged at all.
 */
function canDrop(slides: ProposalSlide[], dragIdx: number, dropIdx: number): boolean {
  if (dragIdx === dropIdx) return false;
  if (slides[dragIdx]?.isLocked) return false;

  const firstLockedIdx = slides.findIndex((s) => s.lockPosition === "first");
  if (firstLockedIdx !== -1 && dropIdx <= firstLockedIdx) return false;

  let lastLockedIdx = -1;
  for (let i = slides.length - 1; i >= 0; i--) {
    if (slides[i].lockPosition === "last") { lastLockedIdx = i; break; }
  }
  if (lastLockedIdx !== -1 && dropIdx >= lastLockedIdx) return false;

  return true;
}

/**
 * Returns true if the slide at `idx` can be moved one step in `direction` (-1 = up, 1 = down).
 * A slide cannot swap with a locked neighbour, and locked slides cannot move at all.
 */
function canMove(slides: ProposalSlide[], idx: number, direction: -1 | 1): boolean {
  if (slides[idx]?.isLocked) return false;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= slides.length) return false;
  if (slides[nextIdx]?.isLocked) return false;
  return true;
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      width="9"
      height="10"
      viewBox="0 0 9 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="4.5" width="7" height="5" rx="1" fill="#9CA3AF" />
      <path
        d="M2.5 4.5V3A2 2 0 0 1 6.5 3V4.5"
        stroke="#9CA3AF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DragHandleIcon({ faint }: { faint?: boolean }) {
  const fill = faint ? "#C4C4BF" : "#9CA3AF";
  return (
    <svg
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="2" cy="2"  r="1.2" fill={fill} />
      <circle cx="2" cy="6"  r="1.2" fill={fill} />
      <circle cx="2" cy="10" r="1.2" fill={fill} />
      <circle cx="6" cy="2"  r="1.2" fill={fill} />
      <circle cx="6" cy="6"  r="1.2" fill={fill} />
      <circle cx="6" cy="10" r="1.2" fill={fill} />
    </svg>
  );
}

// ─── SlideRail ────────────────────────────────────────────────────────────────

export function SlideRail({
  slides,
  activeSlideId,
  branding,
  onSelect,
  onReorder,
  onToggleEnabled,
  brandBackgrounds = [],
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, index: number) {
    if (slides[index]?.isLocked) {
      e.preventDefault();
      return;
    }
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnter(index: number) {
    if (dragIndex === null) return;
    setDropIndex(canDrop(slides, dragIndex, index) ? index : null);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    // Re-evaluate on every dragover to keep indicator accurate
    if (dragIndex === null) return;
    const valid = canDrop(slides, dragIndex, index);
    e.dataTransfer.dropEffect = valid ? "move" : "none";
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null) return;
    if (!canDrop(slides, dragIndex, index)) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onReorder(reordered.map((s, i) => ({ ...s, order: i })));
    // Clear state so handleDragEnd (which always fires after drop) doesn't reorder again
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd() {
    // Fallback commit — only fires the reorder if handleDrop didn't already run
    if (dragIndex !== null && dropIndex !== null && canDrop(slides, dragIndex, dropIndex)) {
      const reordered = [...slides];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      onReorder(reordered.map((s, i) => ({ ...s, order: i })));
    }
    setDragIndex(null);
    setDropIndex(null);
  }

  // ── Up/down button move ────────────────────────────────────────────────────

  function move(index: number, direction: -1 | 1) {
    if (!canMove(slides, index, direction)) return;
    const next = index + direction;
    const reordered = [...slides];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    onReorder(reordered.map((s, i) => ({ ...s, order: i })));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside
      className="flex flex-col overflow-y-auto"
      style={{
        width: 192,
        minWidth: 192,
        background: "#F4F3F0",
        borderRight: "1px solid #E5E3DF",
        padding: "12px 8px",
        gap: 0,
      }}
    >
      <p
        className="uppercase tracking-widest font-medium"
        style={{ fontSize: 10, color: "#9CA3AF", padding: "0 4px 8px" }}
      >
        Slides
      </p>

      {slides.map((slide, index) => {
        const isActive    = slide.id === activeSlideId;
        const isDragging  = dragIndex === index;
        const isDropAbove = dropIndex === index;
        const locked      = !!slide.isLocked;
        const upOk        = canMove(slides, index, -1);
        const downOk      = canMove(slides, index, 1);

        return (
          <div
            key={slide.id}
            draggable={!locked}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            style={{
              opacity: isDragging ? 0.3 : 1,
              cursor: locked ? "default" : "grab",
              transition: "opacity 0.12s",
              // 2-px accent-colour line above the valid drop target
              paddingTop: isDropAbove ? 0 : 2,
              borderTop: isDropAbove
                ? `2px solid ${branding.accentColor}`
                : "2px solid transparent",
              marginBottom: 6,
            }}
          >
            {/* Card shell — active highlight + border */}
            <div
              style={{
                position: "relative",
                padding: "2px",
                background: isActive ? `${branding.accentColor}22` : "transparent",
                border: `1.5px solid ${isActive ? branding.accentColor : "transparent"}`,
                borderRadius: 4,
              }}
            >
              {/* ── Badge row (lock icon OR drag handle) ───────────────── */}
              <div
                style={{
                  position: "absolute",
                  top: 5,
                  left: 5,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  pointerEvents: "none",
                }}
              >
                {locked ? (
                  <LockIcon />
                ) : (
                  <DragHandleIcon faint={!isDragging} />
                )}
              </div>

              {/* ── Thumbnail ──────────────────────────────────────────── */}
              <button
                onClick={() => onSelect(slide.id)}
                className="block w-full text-left"
                style={{ borderRadius: 2, overflow: "hidden" }}
              >
                {(() => {
                  const activeBg = slide.backgroundId
                    ? brandBackgrounds.find((b) => b.id === slide.backgroundId) ?? null
                    : null;
                  return (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "16/9",
                        position: "relative",
                        overflow: "hidden",
                        background: "#fff",
                        opacity: slide.isEnabled ? 1 : 0.45,
                      }}
                    >
                      {/* Brand background layer */}
                      {activeBg && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={
                            activeBg.previewImageUrl
                              ? {
                                  backgroundImage: `url(${activeBg.previewImageUrl})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                  backgroundRepeat: "no-repeat",
                                }
                              : {
                                  backgroundColor: activeBg.baseColorHex ?? "#ffffff",
                                }
                          }
                        />
                      )}
                      {/* Scaled-down real slide preview (0.135× of 1280-wide canvas) */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          transform: "scale(0.135)",
                          transformOrigin: "top left",
                          width:  `${100 / 0.135}%`,
                          height: `${100 / 0.135}%`,
                          pointerEvents: "none",
                        }}
                      >
                        <SlideRenderer slide={slide} branding={branding} isEditing />
                      </div>
                    </div>
                  );
                })()}
              </button>

              {/* ── Meta row: number + type + enable dot ───────────────── */}
              <div
                className="flex items-center justify-between"
                style={{ padding: "3px 2px 1px" }}
              >
                <div className="flex items-center gap-1 truncate">
                  <span style={{ fontSize: 9 }}>{TYPE_ICON[slide.type]}</span>
                  <span
                    className="truncate font-medium"
                    style={{
                      fontSize: 10,
                      color: isActive ? branding.textColor : "#6B7280",
                    }}
                  >
                    {index + 1}. {SLIDE_TYPE_LABELS[slide.type]}
                    {locked && (
                      <span style={{ color: "#C4C4BF", marginLeft: 2 }}>·</span>
                    )}
                  </span>
                </div>

                {/* Enable/disable dot */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleEnabled(slide.id); }}
                  title={slide.isEnabled ? "Disable slide" : "Enable slide"}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: slide.isEnabled ? branding.accentColor : "#D1D5DB",
                    border: "none",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              </div>

              {/* ── Up / Down arrows ────────────────────────────────────── */}
              <div
                className="flex justify-end gap-0.5"
                style={{ padding: "0 2px 2px" }}
              >
                <button
                  onClick={() => move(index, -1)}
                  disabled={!upOk}
                  className="rounded"
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    background: "transparent",
                    color: upOk ? "#6B7280" : "#D1D5DB",
                    border: "none",
                    cursor: upOk ? "pointer" : "default",
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={!downOk}
                  className="rounded"
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    background: "transparent",
                    color: downOk ? "#6B7280" : "#D1D5DB",
                    border: "none",
                    cursor: downOk ? "pointer" : "default",
                  }}
                >
                  ▼
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

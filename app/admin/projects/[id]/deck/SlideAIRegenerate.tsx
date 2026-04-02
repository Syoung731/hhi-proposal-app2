"use client";

/**
 * SlideAIRegenerate
 * ─────────────────
 * Inspector panel section that lets the user generate an AI background image
 * for the active slide via POST /api/deck/generate-background.
 *
 * Rendering contract (3-layer model):
 *   Layer 0  aiBackground  CSS background-image on the slide container
 *   Layer 1  backgroundId  Brand overlay (z-index 1)
 *   Layer 2  slide content (z-index 2)
 *   Layer 100 HHI logo
 *
 * CRITICAL: onAccept never sets isUserModified — the parent must bypass
 *   updateSlide and call setSlides directly (via onAiBackgroundChange).
 */

import { useState } from "react";
import { buildSlideImagePrompt } from "@/app/lib/deck/gemini-slide-prompts";
import type { SlideType } from "@/app/lib/deck/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLE_PRESETS = [
  "NotebookLM Light",
  "HHI Dark",
  "Blueprint",
  "Minimal",
] as const;

type StylePreset = (typeof STYLE_PRESETS)[number];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  slideType: string;
  slideId: string;
  projectId: string;
  /** URL of the currently active AI background, or null if none. */
  currentAiBackground: string | null;
  /** Called when user clicks ✓ Accept with the new URL, or null to clear. */
  onAccept: (imageUrl: string | null) => void;
  /** Called when user clicks ✕ Discard — no state changes expected. */
  onDiscard: () => void;
}

// ─── Shared primitive styles matching InspectorPanel ─────────────────────────

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6B7280",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  border: "1px solid #D1D5DB",
  color: "#111827",
  background: "#fff",
  outline: "none",
  borderRadius: 4,
  width: "100%",
  boxSizing: "border-box",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SlideAIRegenerate({
  slideType,
  slideId,
  projectId,
  currentAiBackground,
  onAccept,
  onDiscard,
}: Props) {
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>("NotebookLM Light");
  const [isExpanded, setIsExpanded] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(
    () => buildSlideImagePrompt(slideType as SlideType, "NotebookLM Light")
  );
  const [promptEdited, setPromptEdited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // When preset changes, refresh the prompt unless the user already edited it manually.
  function handlePresetChange(preset: StylePreset) {
    setSelectedPreset(preset);
    if (!promptEdited) {
      setCustomPrompt(buildSlideImagePrompt(slideType as SlideType, preset));
    }
  }

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);
    setPreviewUrl(null);

    try {
      const res = await fetch("/api/deck/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideType,
          stylePreset: selectedPreset,
          projectId,
          slideId,
          customPrompt: promptEdited ? customPrompt : undefined,
        }),
      });

      const data = (await res.json()) as { imageUrl?: string; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      if (data.imageUrl) {
        setPreviewUrl(data.imageUrl);
      } else {
        setError("No image URL returned from server.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error during generation.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleAccept() {
    if (previewUrl) {
      onAccept(previewUrl);
      setPreviewUrl(null);
    }
  }

  function handleDiscard() {
    setPreviewUrl(null);
    onDiscard();
  }

  return (
    <div>
      {/* Section label */}
      <p
        className="uppercase tracking-widest font-semibold"
        style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}
      >
        AI Background
      </p>

      {/* Style preset */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ ...fieldLabelStyle, display: "block", marginBottom: 4 }}>
          Style Preset
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value as StylePreset)}
          disabled={isLoading}
          style={inputStyle}
        >
          {STYLE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Expandable prompt editor */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setIsExpanded((v) => !v)}
          style={{
            fontSize: 11,
            color: "#6B7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ›
          </span>
          Edit Prompt
        </button>

        {isExpanded && (
          <textarea
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              setPromptEdited(true);
            }}
            placeholder="Edit the prompt above before regenerating — your changes will be sent directly to Gemini."
            rows={6}
            className="resize-y"
            style={{
              ...inputStyle,
              marginTop: 6,
              fontSize: 11,
              lineHeight: 1.5,
            }}
          />
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="w-full rounded text-left font-medium"
        style={{
          fontSize: 12,
          padding: "6px 10px",
          background: isLoading ? "#F3F4F6" : "#EEF2FF",
          color: isLoading ? "#9CA3AF" : "#4338CA",
          border: `1px solid ${isLoading ? "#E5E7EB" : "#C7D2FE"}`,
          cursor: isLoading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {isLoading ? (
          <>
            {/* Inline spinner via CSS animation */}
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                border: "2px solid #C7D2FE",
                borderTopColor: "#4338CA",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
                flexShrink: 0,
              }}
            />
            Generating…
          </>
        ) : (
          "✦ Regenerate with AI"
        )}
      </button>

      {/* Inline error */}
      {error && (
        <p
          style={{
            fontSize: 11,
            color: "#DC2626",
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {error}
        </p>
      )}

      {/* Preview + Accept / Discard */}
      {previewUrl && (
        <div style={{ marginTop: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Generated background preview"
            style={{
              width: 160,
              height: "auto",
              display: "block",
              borderRadius: 4,
              border: "1px solid #E5E7EB",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              onClick={handleAccept}
              className="rounded"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                background: "#D1FAE5",
                color: "#065F46",
                border: "1px solid #6EE7B7",
                cursor: "pointer",
                flex: 1,
                fontWeight: 500,
              }}
            >
              ✓ Accept
            </button>
            <button
              onClick={handleDiscard}
              className="rounded"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                background: "#F3F4F6",
                color: "#6B7280",
                border: "1px solid #E5E7EB",
                cursor: "pointer",
                flex: 1,
              }}
            >
              ✕ Discard
            </button>
          </div>
        </div>
      )}

      {/* Current AI background thumbnail + clear button */}
      {currentAiBackground && !previewUrl && (
        <div style={{ marginTop: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentAiBackground}
            alt="Current AI background"
            style={{
              width: 160,
              height: "auto",
              display: "block",
              borderRadius: 4,
              border: "1px solid #E5E7EB",
              opacity: 0.75,
            }}
          />
          <button
            onClick={() => onAccept(null)}
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "#9CA3AF",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            × Clear AI Background
          </button>
        </div>
      )}

      {/* Keyframe for the spinner — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

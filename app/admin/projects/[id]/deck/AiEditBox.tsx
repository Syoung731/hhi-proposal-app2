"use client";

import { useState } from "react";
import type { ProposalSlide, DeckBranding } from "@/app/lib/deck/types";
import { aiEditSlideAction } from "./actions";

/**
 * Universal "AI Edit" smart box, shown on every slide that has an AI-Edit
 * descriptor. The user types a plain-language instruction; the server engine
 * infers intent (copy / style / layout / icons / background / photo) and returns
 * a patch. We snapshot the slide first (via pushUndo) so the change is undoable,
 * then apply the patch through the inspector's normal onUpdate (autosave +
 * isUserModified). Undo pops the most recent snapshot.
 */
export function AiEditBox({
  slide,
  branding,
  onUpdate,
  pushUndo,
  onUndo,
  canUndo,
}: {
  slide: ProposalSlide;
  branding: DeckBranding;
  onUpdate: (s: ProposalSlide) => void;
  /** Snapshot the slide BEFORE applying an AI edit (for undo). */
  pushUndo: (s: ProposalSlide) => void;
  /** Restore the most recent snapshot for this slide. */
  onUndo: () => void;
  /** Whether there's a snapshot to undo. */
  canUndo: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function run() {
    const instruction = prompt.trim();
    if (!instruction) {
      setMsg({ kind: "err", text: "Type what you'd like changed." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await aiEditSlideAction({ slideId: slide.id, prompt: instruction });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      // Snapshot the pre-edit slide so the user can undo, then apply the patch.
      pushUndo(slide);
      const next: ProposalSlide = {
        ...slide,
        content: { ...(slide.content ?? {}), ...res.contentPatch },
        isUserModified: true,
      };
      if (res.headline !== null) next.headline = res.headline;
      if (res.subheadline !== null) next.subheadline = res.subheadline;
      // Engine validated layoutKey against the slide type's allowed layouts.
      if (res.layoutKey !== null) next.layoutKey = res.layoutKey as ProposalSlide["layoutKey"];
      onUpdate(next);
      setMsg({ kind: "ok", text: res.note ?? "Slide updated." });
      setPrompt("");
    } catch {
      setMsg({ kind: "err", text: "AI edit failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${branding.accentColor}55`,
        background: branding.accentColor + "0E",
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: branding.textColor }}>✦ AI Edit</span>
        <button
          onClick={onUndo}
          disabled={!canUndo || busy}
          title={canUndo ? "Undo the last AI change to this slide" : "Nothing to undo"}
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            cursor: canUndo && !busy ? "pointer" : "default",
            background: canUndo && !busy ? "#fff" : "#F3F4F6",
            color: canUndo && !busy ? "#374151" : "#9CA3AF",
            border: `1px solid ${canUndo && !busy ? "#D1D5DB" : "#E5E7EB"}`,
          }}
        >
          ↶ Undo
        </button>
      </div>
      <p style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>
        Describe the change in plain language — copy, colors, layout, icons, a new
        background, or swapping the photo. The AI figures out what you mean.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. shorten every line, make the panel navy, and generate a coastal twilight background…"
        rows={3}
        style={{
          width: "100%",
          fontSize: 11,
          padding: "6px 8px",
          border: "1px solid #D1D5DB",
          borderRadius: 4,
          background: "#fff",
          color: "#374151",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <button
        onClick={run}
        disabled={busy}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "8px 10px",
          background: busy ? "#9CA3AF" : branding.accentColor,
          color: "#FFFFFF",
          border: "none",
          borderRadius: 5,
          cursor: busy ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {busy ? "Working…" : "Apply AI Edit"}
      </button>
      {busy && (
        <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6, lineHeight: 1.4 }}>
          Working… image/background generation can take ~30s.
        </p>
      )}
      {msg && (
        <p style={{ fontSize: 10, lineHeight: 1.4, marginTop: 6, color: msg.kind === "ok" ? "#15803D" : "#DC2626" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ObjectivePageConfig } from "@/app/lib/layout-config";
import {
  getTemplateBDividerColor,
  getTemplateBUnderlineColor,
} from "@/app/lib/layout-config";
import { TEMPLATE_B_LAYOUT } from "./template-b-layout";

const DEBUG_LAYOUT_STORAGE_KEY = "objectiveTemplateBDebug";

type Bounds = { width: number; height: number; top: number; left: number };

function useDebugLayoutEnabled(): boolean {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const fromQuery = searchParams.get("debugLayout") === "1";
    let fromStorage = false;
    try {
      fromStorage = localStorage.getItem(DEBUG_LAYOUT_STORAGE_KEY) === "1";
    } catch {
      // ignore
    }
    setEnabled(fromQuery || fromStorage);
  }, [mounted, searchParams]);

  return mounted && enabled;
}

export type ObjectiveTemplateBProps = {
  config: ObjectivePageConfig;
  onChange?: (next: ObjectivePageConfig) => void;
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Branding accent color (e.g. CompanySettings.primaryColorHex). Underline defaults to this when templateB.underlineColor is unset. */
  brandingAccentColor?: string | null;
  /** When provided (e.g. in admin preview), called after mount when statement overflows its container. */
  onStatementOverflow?: (overflow: boolean) => void;
};

function parseCommitment(text: string): { heading: string; body: string } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { heading: "", body: "" };
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline !== -1) {
    return {
      heading: trimmed.slice(0, firstNewline).trim(),
      body: trimmed.slice(firstNewline + 1).trim(),
    };
  }
  const dashSep = trimmed.indexOf(" - ");
  if (dashSep !== -1) {
    return {
      heading: trimmed.slice(0, dashSep).trim(),
      body: trimmed.slice(dashSep + 3).trim(),
    };
  }
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) {
    return {
      heading: trimmed.slice(0, colonIdx).trim(),
      body: trimmed.slice(colonIdx + 1).trim(),
    };
  }
  return { heading: trimmed, body: "" };
}

/** Muted "ink" color for headline/statement (NotebookLM-style). */
const INK_COLOR_CLASS = "text-zinc-800 dark:text-zinc-200";

const DEBUG_LABELS: Record<string, string> = {
  headline: "Headline",
  underline: "Underline",
  statement: "Statement",
  pillarsRow: "Pillars row",
  pillar0: "Pillar 1",
  pillar1: "Pillar 2",
  pillar2: "Pillar 3",
};

function LayoutDebugOverlay({
  canvasBounds,
  elementBounds,
  stackUsedHeight,
}: {
  canvasBounds: Bounds;
  elementBounds: Record<string, Bounds>;
  stackUsedHeight: number | null;
}) {
  const remaining = canvasBounds.height - (stackUsedHeight ?? 0);
  return (
    <>
      {/* Outlines and labels: positioned relative to canvas (overlay is inset-0 over canvas) */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        aria-hidden
      >
        {Object.entries(elementBounds).map(([key, b]) => (
          <div
            key={key}
            className="absolute border-2 border-amber-500/70 bg-amber-500/10"
            style={{
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
            }}
          >
            <span className="absolute left-0 top-0 z-10 whitespace-nowrap bg-amber-900/95 px-1 py-0.5 font-mono text-[10px] text-amber-100">
              {DEBUG_LABELS[key] ?? key}: {b.width}×{b.height}px · top: {b.top}px
            </span>
          </div>
        ))}
        {/* Divider lines (vertical) at left edge of pillar1 and pillar2 */}
        {elementBounds.pillar1 && elementBounds.pillarsRow && (
          <div
            className="absolute top-0 w-0 border-l-2 border-dashed border-cyan-500/80"
            style={{
              left: elementBounds.pillar1.left,
              top: elementBounds.pillarsRow.top,
              height: elementBounds.pillarsRow.height,
            }}
            title="Divider"
          />
        )}
        {elementBounds.pillar2 && elementBounds.pillarsRow && (
          <div
            className="absolute top-0 w-0 border-l-2 border-dashed border-cyan-500/80"
            style={{
              left: elementBounds.pillar2.left,
              top: elementBounds.pillarsRow.top,
              height: elementBounds.pillarsRow.height,
            }}
            title="Divider"
          />
        )}
      </div>
      {/* HUD: fixed in top-right of canvas */}
      <div
        className="pointer-events-none absolute right-2 top-2 z-20 min-w-[140px] rounded border border-amber-600/80 bg-amber-950/95 px-2 py-1.5 font-mono text-[11px] text-amber-100 shadow-lg"
        aria-hidden
      >
        <div>container: {canvasBounds.width}×{canvasBounds.height}px</div>
        <div>stack used: {stackUsedHeight != null ? `${stackUsedHeight}px` : "—"}</div>
        <div>remaining: {remaining >= 0 ? `${remaining}px` : "—"}</div>
      </div>
    </>
  );
}

/** Statement text for Template B: prefer Template-B-fit override when set. */
function getTemplateBStatementText(config: ObjectivePageConfig): string {
  const override = (config.objectiveTextB ?? "").trim();
  if (override) return override;
  return (config.objectiveText ?? "").trim();
}

export function ObjectiveTemplateB({
  config,
  brandingAccentColor,
  onStatementOverflow,
}: ObjectiveTemplateBProps) {
  const title = config.title ?? "Project Objective";
  const statementText = getTemplateBStatementText(config);
  const commitments = (config.commitments && config.commitments.length
    ? config.commitments
    : ["", "", ""]
  ).slice(0, 3);
  while (commitments.length < 3) commitments.push("");

  const underlineColor = getTemplateBUnderlineColor(config, brandingAccentColor);
  const dividerColor = getTemplateBDividerColor(config);

  const debugOn = useDebugLayoutEnabled();
  const canvasRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const underlineRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLParagraphElement>(null);
  const pillarsContainerRef = useRef<HTMLElement>(null);
  const pillarRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const [canvasBounds, setCanvasBounds] = useState<Bounds | null>(null);
  const [elementBounds, setElementBounds] = useState<Record<string, Bounds>>({});
  const [stackUsedHeight, setStackUsedHeight] = useState<number | null>(null);

  const updateMeasurements = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const canvasTop = canvasRect.top;
    const canvasLeft = canvasRect.left;

    const toRelative = (el: Element | null): Bounds | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top - canvasTop),
        left: Math.round(r.left - canvasLeft),
      };
    };

    setCanvasBounds({
      width: Math.round(canvasRect.width),
      height: Math.round(canvasRect.height),
      top: 0,
      left: 0,
    });

    const headline = toRelative(headlineRef.current);
    const underline = toRelative(underlineRef.current);
    const statement = toRelative(statementRef.current);
    const pillars = toRelative(pillarsContainerRef.current);
    const p0 = toRelative(pillarRefs[0].current);
    const p1 = toRelative(pillarRefs[1].current);
    const p2 = toRelative(pillarRefs[2].current);

    const next: Record<string, Bounds> = {};
    if (headline) next.headline = headline;
    if (underline) next.underline = underline;
    if (statement) next.statement = statement;
    if (pillars) next.pillarsRow = pillars;
    if (p0) next.pillar0 = p0;
    if (p1) next.pillar1 = p1;
    if (p2) next.pillar2 = p2;
    setElementBounds(next);

    // Total used height by main stack: from first section top to bottom of pillars (or last measured)
    const firstTop = headline?.top ?? 0;
    const lastBottom = pillars ? pillars.top + pillars.height : headline ? headline.top + headline.height : 0;
    const used = lastBottom - firstTop;
    setStackUsedHeight(used >= 0 ? used : null);
  }, []);

  useEffect(() => {
    if (!debugOn) return;
    const canvas = canvasRef.current;
    const elements = [
      canvas,
      headlineRef.current,
      underlineRef.current,
      statementRef.current,
      pillarsContainerRef.current,
      pillarRefs[0].current,
      pillarRefs[1].current,
      pillarRefs[2].current,
    ].filter(Boolean) as Element[];

    updateMeasurements();
    const ro = new ResizeObserver(() => updateMeasurements());
    elements.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [debugOn, updateMeasurements]);

  // Overflow detection for admin: after mount, report if statement overflows (for Template B fit flow).
  useEffect(() => {
    if (!onStatementOverflow) return;
    const el = statementRef.current;
    if (!el) return;
    const check = () => {
      const overflow = el.scrollHeight > el.clientHeight;
      onStatementOverflow(overflow);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onStatementOverflow, statementText]);

  /** When using the B-fit override, no clamp; otherwise safety clamp to avoid overflow. */
  const hasFitStatement = !!((config.objectiveTextB ?? "").trim());
  const statementClampStyle = hasFitStatement
    ? undefined
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical" as const,
        WebkitLineClamp: TEMPLATE_B_LAYOUT.statement.clampLines,
        overflow: "hidden",
      };

  const pillarBodyClampStyle = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: TEMPLATE_B_LAYOUT.pillars.bodyClampLines,
    overflow: "hidden",
  };

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Page canvas: fixed 1200×675 design space, scaled by parent frames */}
      <div
        ref={canvasRef}
        className="mx-auto h-full w-full"
        style={{
          maxWidth: TEMPLATE_B_LAYOUT.canvas.w,
          paddingLeft: TEMPLATE_B_LAYOUT.paddingX,
          paddingRight: TEMPLATE_B_LAYOUT.paddingX,
          paddingTop: TEMPLATE_B_LAYOUT.paddingTop,
          paddingBottom: TEMPLATE_B_LAYOUT.paddingBottom,
        }}
      >
        <div className="flex h-full flex-col">
          {/* TOP – Headline + underline */}
          <section className="shrink-0 text-center">
            <h2
              ref={headlineRef}
              className={`mx-auto font-serif font-normal tracking-[0.02em] ${INK_COLOR_CLASS}`}
              style={{
                fontSize: TEMPLATE_B_LAYOUT.headline.fontSize,
                lineHeight: TEMPLATE_B_LAYOUT.headline.lineHeight,
                marginBottom: TEMPLATE_B_LAYOUT.headline.marginBottom,
                maxWidth: TEMPLATE_B_LAYOUT.headline.maxWidth,
              }}
            >
              {title.trim() || "Project Objective"}
            </h2>
            <div
              ref={underlineRef}
              className="mx-auto shrink-0"
              style={{
                height: TEMPLATE_B_LAYOUT.underline.height,
                width: `${TEMPLATE_B_LAYOUT.underline.widthPct * 100}%`,
                marginBottom: TEMPLATE_B_LAYOUT.underline.marginBottom,
                backgroundColor: underlineColor,
              }}
              aria-hidden
            />
          </section>

          {/* MIDDLE – Statement */}
          <section className="shrink-0">
            <p
              ref={statementRef}
              className={`mx-auto text-center font-serif italic ${INK_COLOR_CLASS}`}
              style={{
                fontSize: TEMPLATE_B_LAYOUT.statement.fontSize,
                lineHeight: TEMPLATE_B_LAYOUT.statement.lineHeight,
                maxWidth: `${TEMPLATE_B_LAYOUT.statement.maxWidthPct * 100}%`,
                marginBottom: TEMPLATE_B_LAYOUT.statement.marginBottom,
                ...statementClampStyle,
              }}
            >
              {statementText ||
                "Add a focused, client-facing objective statement. It will appear here in an editorial style."}
            </p>
          </section>

          {/* BOTTOM – Pillars row anchored to bottom band */}
          <section
            ref={pillarsContainerRef}
            className="mt-auto shrink-0"
            style={{ marginTop: TEMPLATE_B_LAYOUT.pillars.rowTopGap }}
          >
            <div
              className="grid min-h-0 grid-cols-1 gap-y-10 sm:grid-cols-3"
              style={{ columnGap: TEMPLATE_B_LAYOUT.pillars.colGap }}
            >
              {commitments.map((raw, idx) => {
                const { heading, body } = parseCommitment(raw);
                const isEmpty = !heading && !body;

                return (
                  <div
                    key={idx}
                    ref={pillarRefs[idx]}
                    className="flex min-w-0 flex-col px-6 text-center"
                    style={
                      idx > 0
                        ? {
                            paddingLeft: TEMPLATE_B_LAYOUT.pillars.colGap / 2,
                            borderLeftColor: dividerColor,
                            borderLeftWidth: TEMPLATE_B_LAYOUT.pillars.dividerWidth,
                            borderLeftStyle: "solid",
                          }
                        : { paddingRight: TEMPLATE_B_LAYOUT.pillars.colGap / 2 }
                    }
                  >
                    <p
                      className={`mb-3 shrink-0 font-sans font-bold ${
                        isEmpty
                          ? "text-zinc-400 dark:text-zinc-500"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                      style={{
                        fontSize: TEMPLATE_B_LAYOUT.pillars.titleFontSize,
                        lineHeight: TEMPLATE_B_LAYOUT.pillars.titleLineHeight,
                      }}
                    >
                      {heading || `Commitment ${idx + 1}`}
                    </p>
                    {body ? (
                      <p
                        className="min-h-0 font-sans text-zinc-600 dark:text-zinc-400"
                        style={{
                          fontSize: TEMPLATE_B_LAYOUT.pillars.bodyFontSize,
                          lineHeight: TEMPLATE_B_LAYOUT.pillars.bodyLineHeight,
                          ...pillarBodyClampStyle,
                        }}
                      >
                        {body}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Layout Debug Overlay – client-only, only when debugLayout=1 or localStorage objectiveTemplateBDebug=1 */}
      {debugOn && canvasBounds !== null && (
        <LayoutDebugOverlay
          canvasBounds={canvasBounds}
          elementBounds={elementBounds}
          stackUsedHeight={stackUsedHeight}
        />
      )}
    </div>
  );
}

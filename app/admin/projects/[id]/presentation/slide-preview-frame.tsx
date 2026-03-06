"use client";

import { useRef, useState, useLayoutEffect } from "react";

const LABEL_CLASS =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export type SlidePreviewFrameProps = {
  /** Design canvas width (e.g. 1200). */
  designW: number;
  /** Design canvas height (e.g. 675 for 16:9). */
  designH: number;
  children: React.ReactNode;
  /** Section wrapper class (e.g. "mt-8"). */
  sectionClassName?: string;
  /** Heading above the frame (default "Live Preview"). */
  label?: string;
};

/**
 * Shared 16:9 live-preview frame used by Cover, Objective, Why Us, and Section
 * in the presentation editor. Keeps a fixed aspect ratio, scales the inner
 * design to fit, and prevents overflow/scrollbars.
 */
export function SlidePreviewFrame({
  designW,
  designH,
  children,
  sectionClassName = "mt-8",
  label = "Live Preview",
}: SlidePreviewFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / designW, h / designH, 1);
        setScale(s);
      }
    };
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();
    return () => ro.disconnect();
  }, [designW, designH]);

  return (
    <section className={sectionClassName}>
      <h3 className={LABEL_CLASS}>{label}</h3>
      {/* Aspect-ratio frame: always 16:9, no overflow when browser zooms */}
      <div
        className="relative mt-2 w-full max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
        style={{
          aspectRatio: "16 / 9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Inner wrapper: exactly 100% of frame; preview scales inside it */}
        <div
          ref={frameRef}
          className="absolute inset-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div
            className="absolute left-1/2 top-1/2 origin-center"
            style={{
              width: designW,
              height: designH,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

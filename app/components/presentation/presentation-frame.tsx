"use client";

import type { PresentationSettings } from "@/app/lib/layout-config";

const BACKGROUND_CLASSES: Record<
  NonNullable<PresentationSettings["background"]>,
  string
> = {
  light: "bg-zinc-50 dark:bg-zinc-950",
  dark: "bg-zinc-900 dark:bg-zinc-950",
  warm: "bg-amber-50/80 dark:bg-zinc-950",
  imageOverlay: "bg-zinc-100 dark:bg-zinc-900",
};

const SPEED_DURATION: Record<NonNullable<PresentationSettings["speed"]>, string> = {
  slow: "duration-500",
  normal: "duration-300",
  fast: "duration-150",
};

const TRANSITION_CLASSES: Record<
  NonNullable<PresentationSettings["transition"]>,
  string
> = {
  none: "",
  fade: "animate-in fade-in",
  slide: "animate-in slide-in-from-right-4",
};

type PresentationFrameProps = {
  /** Live-view settings (background, transition, speed). */
  settings?: PresentationSettings | null;
  /** Current page key; change triggers transition. */
  pageKey: string;
  children: React.ReactNode;
};

const DEFAULT_BACKGROUND = "light";
const DEFAULT_TRANSITION = "fade";
const DEFAULT_SPEED = "normal";

export function PresentationFrame({
  settings,
  pageKey,
  children,
}: PresentationFrameProps) {
  const background = settings?.background ?? DEFAULT_BACKGROUND;
  const transition = settings?.transition ?? DEFAULT_TRANSITION;
  const speed = settings?.speed ?? DEFAULT_SPEED;

  const bgClass = BACKGROUND_CLASSES[background] ?? BACKGROUND_CLASSES.light;
  const speedClass = SPEED_DURATION[speed] ?? SPEED_DURATION.normal;
  const transitionClass = TRANSITION_CLASSES[transition] ?? TRANSITION_CLASSES.fade;
  const animClass = [transitionClass, speedClass].filter(Boolean).join(" ");

  return (
    <div className={`min-h-full ${bgClass}`}>
      <div key={pageKey} className={animClass.trim() || undefined}>
        {children}
      </div>
    </div>
  );
}

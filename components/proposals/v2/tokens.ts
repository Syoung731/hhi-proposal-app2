/**
 * V2 proposal design tokens.
 * Use these class names for consistent, quiet-luxury styling.
 */

export const tokens = {
  // Rounded corners
  radius: {
    card: "rounded-xl",
    image: "rounded-lg",
    badge: "rounded-md",
    button: "rounded-lg",
  },

  // Borders — subtle, not heavy
  border: {
    default: "border border-zinc-200/80 dark:border-zinc-700/80",
    subtle: "border border-zinc-100 dark:border-zinc-800",
    accent: "border-zinc-300 dark:border-zinc-600",
  },

  // Spacing scale (section rhythm)
  section: {
    gap: "space-y-20 md:space-y-28",
    inner: "px-6 sm:px-8 md:px-10",
    block: "space-y-6",
    tight: "space-y-3",
  },

  // Max width for main content
  container: "max-w-4xl mx-auto",

  // Heading scale
  heading: {
    h1: "text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
    h2: "text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
    h3: "text-xl md:text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100",
    h4: "text-lg font-medium text-zinc-800 dark:text-zinc-200",
  },

  // Muted / secondary text
  muted: "text-zinc-500 dark:text-zinc-400",
  mutedStrong: "text-zinc-600 dark:text-zinc-400",

  // Accent — use sparingly
  accent: {
    text: "text-zinc-800 dark:text-zinc-200",
    border: "border-zinc-300 dark:border-zinc-600",
    bg: "bg-zinc-50 dark:bg-zinc-800/50",
  },

  // Cards
  card: "rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900/50 p-6 md:p-8",
  cardSoft: "rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-6 md:p-8",
} as const;

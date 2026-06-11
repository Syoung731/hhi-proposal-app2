/**
 * Committed DEFAULT isometric icons for the Why Us "Guarantee Grid" pillars.
 *
 * These PNGs live in /public/why-us-icons and are matched to a pillar by keywords
 * in its title — so the standard HHI guarantee pillars get on-brand isometric
 * icons with ZERO clicks and no AI generation, and (because they're committed to
 * the repo, not the DB/R2) they survive a database wipe.
 *
 * Client-safe: no server imports, so it can be used from the slide renderer and
 * the inspector alike. Generated via scripts/prep-why-us-icons.ts.
 */

const RULES: { test: RegExp; file: string }[] = [
  { test: /change[\s-]*order/i,                  file: "/why-us-icons/change-order.png" },
  { test: /mark[\s-]*up|markup/i,                file: "/why-us-icons/markup.png" },
  { test: /freedom|design ownership|own your/i,  file: "/why-us-icons/design-freedom.png" },
  { test: /real[\s-]*world|designs? that work/i, file: "/why-us-icons/real-world.png" },
];

/** Best committed default icon for a pillar title, or null if none matches. */
export function whyUsDefaultIcon(title: string | null | undefined): string | null {
  const t = (title ?? "").toLowerCase();
  if (!t) return null;
  for (const r of RULES) if (r.test.test(t)) return r.file;
  return null;
}

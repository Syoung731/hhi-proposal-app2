export function normalizeBackgroundKey(nameOrSlug: string | null | undefined): string {
  if (!nameOrSlug) return "";

  let s = nameOrSlug.toString().trim().toLowerCase();
  if (!s) return "";

  s = s.replace(/&/g, "and");
  s = s.replace(/['"`’“”]/g, "");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, "-").replace(/^-+|-+$/g, "");

  return s;
}


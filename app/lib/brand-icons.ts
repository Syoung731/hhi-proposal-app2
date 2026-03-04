export function normalizeIconKey(nameOrSlug: string | null | undefined): string {
  if (!nameOrSlug) return "";

  // Lowercase + trim
  let s = nameOrSlug.toString().trim().toLowerCase();

  if (!s) return "";

  // Replace "&" with "and"
  s = s.replace(/&/g, "and");

  // Remove most punctuation but keep letters/numbers and whitespace
  // (apostrophes, quotes, etc. become nothing; other non-word characters → space)
  s = s.replace(/['"`’“”]/g, "");
  s = s.replace(/[^a-z0-9]+/g, " ");

  // Collapse whitespace to single "-" and trim any leading/trailing separators
  s = s.replace(/\s+/g, "-").replace(/^-+|-+$/g, "");

  return s;
}


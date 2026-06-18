/**
 * Shared room-name → Room Template auto-matcher.
 *
 * Single source of truth for the Rooms tab (`rooms-tab.tsx`) and the bulk
 * review/estimate modal (`bulk-review-and-estimate-modal.tsx`) so the powder /
 * full-bath and exterior rules never drift between copies (CLAUDE.md: "When
 * adding shared logic, extract into reusable utilities — never duplicate").
 *
 * Matches by the room's name, with an optional section category that lets
 * exterior/addition rooms prefer an exterior template when one exists.
 */
export interface AutoMatchTemplateOption {
  id: string;
  name: string;
}

export function autoMatchTemplate(
  roomName: string,
  templates: ReadonlyArray<AutoMatchTemplateOption>,
  sectionCategory?: string | null,
): string | null {
  const lower = roomName.toLowerCase();

  // Exterior / addition rooms: prefer a template whose name suggests exterior
  // work if one exists. Forward-compatible — exterior templates aren't authored
  // yet, so this is a no-op until they are, then it short-circuits the keyword
  // rules below. Falls through to the normal rules + Standard Room default when
  // no exterior-flavored template is present.
  const cat = sectionCategory?.toUpperCase() ?? null;
  if (cat === "EXTERIOR" || cat === "ADDITION") {
    const ext = templates.find((t) => {
      const n = t.name.toLowerCase();
      return (
        n.includes("exterior") ||
        n.includes("porch") ||
        n.includes("deck") ||
        n.includes("addition")
      );
    });
    if (ext) return ext.id;
  }

  // Powder / half-bath rooms must match a "Powder Room" template, NOT a full
  // bath. This rule runs FIRST and the generic bath rule below intentionally
  // excludes "powder" so a "Powder Room" never falls through to "Bathroom - Full".
  const powderKeywords = ["powder", "half bath", "half-bath", "1/2 bath"];
  if (powderKeywords.some((kw) => lower.includes(kw))) {
    const powder = templates.find((t) => t.name.toLowerCase().includes("powder"));
    if (powder) return powder.id;
    // No dedicated powder template — fall through to the generic rules so a
    // half bath still lands on a (full) bath template rather than nothing.
  }

  // Non-powder bath rooms: prefer a full-bath template ("Bathroom - Full"),
  // but degrade to any non-powder bath template if "full" isn't in the name.
  if (lower.includes("bath") || lower.includes("bathroom")) {
    const fullBath = templates.find((t) => {
      const n = t.name.toLowerCase();
      return n.includes("bath") && n.includes("full");
    });
    if (fullBath) return fullBath.id;
    const anyBath = templates.find((t) => {
      const n = t.name.toLowerCase();
      return n.includes("bath") && !n.includes("powder");
    });
    if (anyBath) return anyBath.id;
  }

  const rules: [string[], string][] = [
    [["kitchen"], "kitchen"],
    [["laundry", "mud room", "mudroom"], "laundry"],
    [["closet"], "closet"],
    [["cope", "admin", "project execution", "overhead"], "cope"],
  ];
  for (const [keywords, match] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const t = templates.find((t) => t.name.toLowerCase().includes(match));
      if (t) return t.id;
    }
  }

  // Default: Standard Room for everything else.
  return (
    templates.find((t) => {
      const n = t.name.toLowerCase();
      return n.includes("standard") || n === "general" || n === "standard room";
    })?.id ?? null
  );
}

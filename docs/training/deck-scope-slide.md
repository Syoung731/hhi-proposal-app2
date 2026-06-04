# Training: The Project Scope Slide

The **Project Scope** slide is the part of the proposal that tells the client, in
one clean screen, *what we're going to build*. This guide covers everything you
can do with it.

---

## 1. Where it lives

**In the app:** open a project → **Deck** tab → click the **Scope Overview**
slide (usually slide 3) in the left rail. The big editing canvas shows the slide;
the panel on the right (the **Inspector**) is where you change everything.

---

## 2. Two ways to fill it in

You almost never start from a blank slide. There are two ways to get content:

### A) Draft the whole deck at once (fastest start)

**In the app:** **Build Presentation** tab → **"Draft slide copy with AI"**.

This reads the project's rooms and scopes and fills in the Scope slide (and other
slides) automatically — it writes the scope items, picks a layout, pulls in a
hero photo, and assigns an icon to each line. Use this once at the beginning.

### B) AI Edit one slide (best for fine-tuning)

**In the app:** select the Scope slide → the **✦ AI Edit** box at the top of the
Inspector.

Type what you want in plain English and click **Apply AI Edit**. This is the
main way you'll shape an individual slide. See [Section 7](#7-ai-edit-the-main-tool)
for details.

> **Tip:** Use *Draft slide copy* once to get a strong first draft, then use
> *AI Edit* to polish.

---

## 3. Choosing a layout

The Scope slide has several **layouts** — the same content, arranged differently.

**In the app:** Inspector → **Layout** buttons.

| Layout | What it looks like | Good for |
|--------|--------------------|----------|
| **Editorial Split** | Dark panel on the left with the title + a clean list, large framed photo on the right, small "Vision" caption card | The premium, magazine-style look. Great default. |
| **Blueprint + Icons** | Photo on the left, "drafting paper" panel on the right with grid lines, an icon next to every line, and an orange stat headline | Technical/architectural feel; shows an icon per scope item |
| **Numbered + Photo** | Photo left, numbered orange chips on the right | Step-by-step / sequenced scope |
| **Checklist + Photo** | Orange checkmarks on the left, photo on the right | "Here's everything included" feel |
| **Gallery + Grid** | A row of up to 3 photos across the top, a 2×2 grid of titled items below | When you have several good photos |
| **Split Panel** | Title on one side, photo(s) on the other (classic) | Simple, photo-forward |
| **Image Row** | Title up top, a row of photos below | Photo-forward, wide |

> **Tip:** Switching layouts never loses your text or photos — try a few and keep
> the one that looks best.

---

## 4. Content: bullet items vs. paragraph

Every layout can show your scope as either **bullet items** or a **paragraph**.

**In the app:** Inspector → **Content** → choose **Bullet items** or **Paragraph**.

- **Bullet items** — the structured list (each line has a short title + detail).
  This is what the modern layouts use by default.
- **Paragraph** — one flowing block of text (the classic style). The Split Panel
  and Image Row layouts use this by default.

You can mix and match — e.g. keep the Split Panel look but feed it bullet items,
or put a paragraph on the Blueprint layout.

---

## 5. Editing the scope items (the bullets)

**In the app:** Inspector → **Scope Items** section.

Each item has:

- **Title** — a short bold lead (e.g. *Primary Bath*, *Custom Cabinetry*).
- **Detail** — one supporting line.
- **Icon** — a dropdown to pick the icon shown next to it (Blueprint & Editorial
  layouts).

Controls:

- **+ Add Scope Item** — add a new line.
- **↑ / ↓** — reorder an item.
- **Remove** — delete an item.

There are also two optional fields:

- **Intro** — a short framing sentence. On Editorial Split it appears in the
  floating "Vision" card.
- **Stat subtitle** — a bold orange headline number (e.g. *"300 square feet of
  new composite deck"*). Mainly used on the Blueprint layout.

> **Tip:** Keep titles to 2–4 words and details to one line. Short reads as
> confident and is easier for the client to scan.

---

## 6. Icons

Icons appear on the **Blueprint + Icons** and **Editorial Split** layouts.

### Where icons come from

There are two sources, and the app prefers the first:

1. **Your AI icon library** (`BrandIcon`) — custom, on-brand icons.
2. **Built-in icons** — a fixed set of ~35 simple line icons used as a fallback.

### The library grows itself

When the AI needs an icon it doesn't have (say "composite deck"), it **generates
a new one, tags it, and saves it to your library** so it's reused everywhere
forever. You don't have to do anything — the library fills out as you build decks.

**In the app:** see and manage them at **Settings → Branding → Icon Library**.

### Keeping icons consistent (line-art)

Scope icons are generated as clean **monochrome line-art** so they look uniform
and work on both light and dark layouts.

**In the app:** if older icons look full-color, go to **Settings → Branding →
Icon Library → "Scope icons → line-art"** to re-generate them all in the clean
style. (This runs several image generations; do it from your computer and give it
a minute.)

### Sizing & turning icons on/off

**In the app (Inspector):**

- **Icon Size** slider — make the icons bigger/smaller (independent of the text).
- **Show item icons** (Editorial only) — turn icons off if a slide looks cleaner
  without them.

> **Heads-up:** If you change an item's icon manually in the dropdown, that
> overrides the AI-picked one for that item.

---

## 7. AI Edit (the main tool)

The **✦ AI Edit** box (top of the Inspector) lets you redesign the slide by
typing instructions — like editing a photo by describing the change.

**In the app:** type your instruction → choose what it's allowed to change →
**Apply AI Edit**.

### The two checkboxes

- **Change copy & items** — lets the AI rewrite the headline, intro, stat, and
  the scope items (text **and** their icons).
- **Change layout & style** — lets the AI switch the layout and toggle the
  blueprint background.

Check **one or both**, depending on what you want it to touch. Leaving a box
unchecked protects that part from changes.

### Example prompts

| You want… | Check | Type something like |
|-----------|-------|---------------------|
| A full redesign to the blueprint look | both | "Make this blueprint style with icons and pull the square footage into an orange subtitle" |
| Tighter wording only | Copy | "Tighten every line to under 12 words and pick better icons" |
| Just a different layout | Layout | "Switch to the numbered layout" |
| Better icons only | Copy | "Refresh the icons to better match each item" |

After it runs, a small note tells you what it changed. If it says *"icons were
already present,"* that's normal — it confirmed they're correct.

> **Heads-up:** AI Edit applies to the **Scope slide** today. Other slide types
> will get it over time.

---

## 8. Sizing & typography

**In the app (Inspector):**

- **Title** → Size slider — scales the big slide title ("Project Scope").
- **Item Text Size** slider — scales the bullet copy.
- **Icon Size** slider — scales the icons.

These are independent, so you can balance big icons with tight text, or vice
versa.

---

## 9. Photos

**In the app:** Inspector → **Photos** → **Choose Photos**.

- Each layout has a photo limit (the Inspector tells you how many).
- Click a chosen photo's **Position & Zoom** to pan/zoom it inside its frame.
- *Draft slide copy* and AI Edit will auto-pull a project hero photo when one is
  available, but you can always swap it here.

---

## 10. Quick start checklist

1. Open the project → **Build Presentation** → **Draft slide copy with AI**.
2. Go to **Deck** → **Scope Overview** slide.
3. Pick a **Layout** (try Editorial Split or Blueprint + Icons).
4. Set **Content** to Bullet items (or Paragraph).
5. Tidy the **Scope Items** (titles, details, icons, order).
6. Use **AI Edit** to polish wording or restyle.
7. Adjust **Item Text Size** / **Icon Size** to taste.
8. Confirm the **photo** looks good.

---

*Part of the [HHI Proposal App Training Library](./README.md).*

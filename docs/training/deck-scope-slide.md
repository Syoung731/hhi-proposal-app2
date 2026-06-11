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

**In the app:** **Deck** tab → **"Generate Deck"** → **AI Fill → "Draft slide copy"**.

This reads the project's rooms and scopes and fills in the Scope slide (and other
slides) automatically — it writes the scope items, picks a layout, pulls in a
hero photo, and assigns an icon to each line. Use this once at the beginning.
(Illustrations/Blueprint icons come from the **"Generate illustrations"** button
in the same modal.)

### B) AI Edit one slide (best for fine-tuning)

**In the app:** select the Scope slide → the **✦ AI Edit** box at the top of the
Inspector.

Type what you want in plain English and click **Apply AI Edit**. This is the
main way you'll shape an individual slide. See [Section 7](#7-ai-edit-the-main-tool)
for details.

> **Tip:** Use *Draft slide copy* once to get a strong first draft, then use
> *AI Edit* to polish.

---

## 2.5 Choosing a deck theme

The whole deck has a **visual theme** that sets the overall look — fonts, colors,
and surfaces — so every slide feels like one designed system.

**In the app:** Deck toolbar (top right) → the **Theme** dropdown.

- **Blueprint** — clean bold sans-serif, white/graph-paper feel, slate panels.
  The technical/architectural look.
- **Editorial** — Cormorant serif headlines, warm linen background, navy panels.
  The luxury look.

Pick whichever suits the client/project; it's saved automatically and applies to
the whole deck. (Today it visibly changes the **Scope** slide; the other slide
types adopt it as they're updated.)

> **Tip:** Try flipping the theme with the Scope slide open — the title font,
> background, and panel color all change live.

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

> **Tip:** Switching layouts never loses your text or photos — try a few and keep
> the one that looks best.

---

## 4. Content: bullet items vs. paragraph

Every layout can show your scope as either **bullet items** or a **paragraph**.

**In the app:** Inspector → **Content** → choose **Bullet items** or **Paragraph**.

- **Bullet items** — the structured list (each line has a short title + detail).
  This is the default for every layout.
- **Paragraph** — one flowing block of text. Any layout can switch to this.

You can mix and match — e.g. keep the Blueprint look but feed it a paragraph.

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

There are also two optional fields that only appear on the layout that uses them
(so the Inspector stays uncluttered):

- **"Vision" card text** — *Editorial Split only.* A short framing sentence shown
  in the floating card over the photo.
- **Stat subtitle** — *Blueprint only.* A bold orange headline number (e.g.
  *"300 square feet of new composite deck"*).

> **Tip:** Keep titles to 2–4 words and details to one line. Short reads as
> confident and is easier for the client to scan.

> **Heads-up:** The **Description** controls (the paragraph + its font/size/color)
> only appear when **Content** is set to **Paragraph**. In Bullet-items mode they
> stay hidden, since they're not used.

### Editorial Split — panel colors

The Editorial Split layout's dark left column is fully recolorable.

**In the app (Inspector, Editorial Split only):**

- **Panel Background** — the color of the left column (defaults to the theme's
  panel color).
- **Panel Text** — the color of the title + item text inside it (defaults to
  white). Secondary lines are derived automatically so they stay legible.

Both have a **Reset** to return to the theme default.

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

### Blueprint markers & colors

The **Blueprint + Icons** layout has extra controls (Inspector, Blueprint only):

- **Item marker** — choose **Icons**, **Check marks**, or **Off** for the marker
  before each scope line.
- **Icon / Check mark color** — color the markers on their own.
- **Item title color** — color the bold lead of each bullet on its own.

These are **independent of the slide title color**, so you can, for example, keep
a navy title, orange check marks, and charcoal item titles. The Title's own
**Color** (under the Title section) now only affects the big title.

---

## 7. AI Edit (the main tool)

The **✦ AI Edit** box (top of the Inspector) lets you change the slide by typing
instructions in plain English — like editing a photo by describing the change.
It's a **smart box**: you don't pick categories, you just say what you want and
the AI figures out whether you mean copy, colors, layout, icons, a new
background, or swapping the photo.

**In the app:** type your instruction → **Apply AI Edit**.

### Example prompts

| You want… | Type something like |
|-----------|---------------------|
| A full redesign to the blueprint look | "Make this blueprint style with icons and pull the square footage into an orange subtitle" |
| Tighter wording | "Tighten every line to under 12 words" |
| A different layout | "Switch to the numbered layout" |
| Better icons | "Refresh the icons to better match each item" |
| Recolor the panel | "Make the left panel navy with cream text" |
| A new background | "Generate a soft coastal-twilight background" |
| Swap the photo | "Use the kitchen after-photo" |

After it runs, a small note tells you what it changed. Generating a background
image takes ~30s; everything else is quick.

### Undo

Next to "AI Edit" is an **↶ Undo** button. If the AI's change isn't what you
wanted, click it to step back to how the slide was before — and click again to
undo earlier AI edits in this session. (Undo history clears if you reload.)

> **Heads-up:** The AI Edit box is on the **Cover, Objective, and Scope** slides
> today; the other slide types get it as we build each one out.

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

**In the app:** Inspector → **Photo(s)** → **Choose Photo(s)**.

- Each layout has a photo limit (the Inspector tells you how many). Single-photo
  layouts label the section **Photo**; multi-photo layouts label it **Photos**.
- Click a chosen photo's **Position & Zoom** to pan/zoom it inside its frame.
- *Draft slide copy* and AI Edit will auto-pull a project hero photo when one is
  available, but you can always swap it here.

---

## 10. Quick start checklist

1. **Deck** tab → **Generate Deck** → **Draft slide copy** (then **Generate illustrations**).
2. Click the **Scope Overview** slide.
3. Pick a **Layout** (try Editorial Split or Blueprint + Icons).
4. Set **Content** to Bullet items (or Paragraph).
5. Tidy the **Scope Items** (titles, details, icons, order).
6. Use **AI Edit** to polish wording or restyle.
7. Adjust **Item Text Size** / **Icon Size** to taste.
8. Confirm the **photo** looks good.

---

*Part of the [HHI Proposal App Training Library](./README.md).*

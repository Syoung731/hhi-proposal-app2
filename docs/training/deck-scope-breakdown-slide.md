# Training: The Scope Breakdown Slide

The **Scope Breakdown** slide covers the **additional rooms that don't get a
before/after render** — the "Additional Areas Included." It summarizes each of
those spaces with a short scope line so nothing in the project goes unmentioned.

---

## 1. Where it lives & how it fills itself

**In the app:** open a project → **Deck** tab → the **Scope Breakdown** slide(s)
sit right after the Before/After section.

It builds **automatically**: every room that has **no AI render** (and isn't the
COPE/overhead room) is pulled in, with its description auto-filled from the room's
scope. If there are many rooms, they paginate across multiple slides. Each room
has an **include** toggle so you can hide one without deleting it.

---

## 2. Choose a layout

**In the app:** Inspector → **Layout**. Four options:

| Layout | Looks like | Best for |
|--------|-----------|----------|
| **Text Grid** | Clean accent-ruled columns of room name + description | The simple default |
| **Dark Table** | Navy background, room name ↔ description rows | A premium, editorial feel |
| **Utility Grid** | Bordered cells, each with an **icon** + name + description | A tidy "utility spaces" summary (the 94-Coggins / Dolphin look) |
| **Blueprint** | Dark graph-paper background with **line-art illustrations** + accent room names | Architectural, high-impact (the "Zone 2 & 3" look) |

---

## 3. Per-room artwork (Utility Grid & Blueprint)

These two layouts show art per room. By default they use a sensible built-in
icon (guessed from the room name) or a line-art house. To make them
**project-specific**:

**In the app:** ✦ **AI Edit** → e.g. *"generate icons for each room"* (Utility
Grid) or *"draw a line-art illustration for each room"* (Blueprint).

- **Icons** come from the self-growing icon library (matched or generated, then
  reused across decks).
- **Illustrations** are bespoke monochrome line-art, tinted to read on the dark
  blueprint background.

> **Heads-up:** Generating art for several rooms takes ~30s (one image per room).
> Re-runnable; **↶ Undo** reverts it.

---

## 4. Editing the rooms & copy

**In the app (Inspector):**

- **Title** / **Intro** — the slide heading + optional framing line.
- **Rooms** — edit each room's **name** and **description**, or toggle
  **include** off to hide it.
- **Art Size** (Utility Grid / Blueprint) — each room has an **Icon/Illustration
  Size** slider to scale its art up or down.
- **Lock sections together** — a checkbox above the sections. When on, adjusting
  one room's **size or text style** applies to **all** rooms (so they stay
  consistent); each room's wording stays its own. Turn it off to size/style rooms
  individually.
- **AI Edit** can rewrite the title, intro, and every room description at once
  (e.g. *"tighten each room to one sentence"*) — it preserves each room's
  include setting.

---

## 5. Quick-start checklist

1. Render the major rooms in the Studio → the rest auto-appear here as
   "Additional Areas Included."
2. Pick a **Layout** (Utility Grid or Blueprint for the most polish).
3. If using Utility Grid / Blueprint, run **AI Edit → generate icons /
   illustrations** for project-specific art.
4. Tidy room **names/descriptions**; toggle **include** off for any you don't
   want shown.

---

*Part of the [HHI Proposal App Training Library](./README.md).*

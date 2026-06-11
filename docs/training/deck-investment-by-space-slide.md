# Training: The Investment by Space Slide

The **Investment by Space** slide breaks the project budget down per space —
one line per room group plus **Cost of Project Execution (COPE)** — with
ranges synced live from the **Investment tab**. It pairs with the **Overall
Investment** slide (the retainer story + final total); this one is the
breakdown conversation.

---

## 1. Where the data comes from (important!)

Line items sync from the project's **Investment tab** (rooms, display groups,
overrides, ordering). The retainer amount (used by some layouts) syncs from
the project's **retainer settings**.

**In the app:** edit amounts, grouping, and labels on the **Investment tab**,
then use **↺ Re-sync from Investment Tab** in the slide inspector if the slide
has been hand-edited (editing a slide pauses its auto-sync).

---

## 2. Choose a layout

**In the app:** Inspector → **Layout**. Four options:

| Layout | Looks like | Money anchor |
|--------|-----------|--------------|
| **Table** (default) | Clean bordered table: space + range, optional "Includes" sub-lines | None (anchor-free) |
| **Range Bars** | Chunky navy bars over gridlines, length proportional to value; circular guarantee badge | Orange full-width bar |
| **Stacked Blocks** | Isometric tower — largest space at the base, COPE as the orange cap; optional retainer foundation | Curly brace + total |
| **Blueprint Breakdown** | One segmented bar with dimension arrows, build-zones list; optional orange retainer segment + callout | Framed navy totals box |

> **Tip:** the two-tone treatment on Range Bars is the range itself — solid to
> the low end, lighter to the high end.

---

## 3. The money anchor (Construction Subtotal)

The three visual layouts can end on a money anchor — the **sum of every line
shown** (rooms + COPE). **In the app:** Inspector → **Construction Subtotal**
— toggle it and edit the label.

- Without the retainer shown: label defaults to **"Projected Construction
  Investment."**
- Stacked Blocks / Blueprint with the retainer shown: the retainer is added
  and the label defaults to **"Total Projected Investment."**

> **Heads-up:** COPE is *not* the total — it's the line for items that don't
> belong to a room (permits, dumpsters, supervision). The anchor is the sum of
> all lines.

---

## 4. The retainer (Stacked Blocks & Blueprint Breakdown)

**In the app:** Inspector → **Retainer** → "Show the retainer…".

- **Stacked Blocks** → a dark **foundation block** under the tower with the
  amount + an editable caption.
- **Blueprint Breakdown** → the **orange lead segment** of the bar with "The
  Immediate Step" callout box.
- The amount **syncs from the project's retainer settings** (it can't be typed
  here), and checking the box pulls the data automatically if it hasn't synced
  yet. Hidden automatically when the retainer is disabled on the project.

---

## 5. Styling & sizing

**In the app (Inspector):** every layout shares **Headline**, **Body Text**
(global size), and **Accent**; each layout adds its own:

- **Range Bars** — Bar Color picker (light tail + numbers follow), Guarantee
  Badge toggle/text, Bottom note, and sliders for Space labels, Range numbers,
  Bottom note, Badge size.
- **Stacked Blocks** — sliders for Block text, Tower width, Total text,
  Retainer text, plus **Bracket horizontal / vertical** to move the brace.
- **Blueprint Breakdown** — sliders for Zones text, Totals box text, Retainer
  callout text.
- **Table** — Table Header styling, Includes Text, Line Item Density.

---

## 6. Quick‑start checklist

1. Confirm amounts + grouping on the **Investment tab**; re-sync if needed.
2. Pick a **Layout** (Table for dense projects; Stacked Blocks for the wow).
3. Check the **Construction Subtotal** toggle + label.
4. On Stacked Blocks / Blueprint: decide on the **Retainer** element.
5. Size to taste with the layout's sliders.

---

*Part of the [HHI Proposal App Training Library](./README.md).*

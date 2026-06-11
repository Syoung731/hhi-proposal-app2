# Training: The Timeline Slide

The **Timeline** slide shows the client the projected path of the project —
two kickoff milestones (*Sign Initial Contract*, *Start of Architectural,
Design & Feasibility*) followed by the three measured phases (*Architectural
Design*, *Pre‑Construction*, *Construction*). There's one Timeline slide per
deck, included by default.

---

## 1. Where the data comes from (important!)

Phase **names, descriptions, and durations sync from the project's Timeline
tab** every time the deck loads.

**In the app:** open the project → **Timeline** tab → edit the phase name /
description overrides and the three duration ranges there.

> **Heads‑up:** the slide inspector also shows Name / Duration / Description
> text boxes per phase — but anything you type there is **overwritten by the
> Timeline tab on the next load**. Use the Timeline tab for wording and
> durations; use the slide inspector for **styling and placement** (those
> stick).

---

## 2. Choose a layout

**In the app:** Inspector → **Layout**. Five options:

| Layout | Looks like | Milestones shown? |
|--------|-----------|-------------------|
| **Week Axis** (default) | One horizontal axis totaling the project weeks; proportional phase segments, boxes alternating above/below | ✅ diamonds on a dashed lead‑in at the front |
| **Chevron Phases** | Bold arrow chevrons in a row (orange → orange → navy) | ✅ slim light lead‑in chevrons |
| **Horizon Wave** | A smooth dark wave with orange dots, labels alternating above/below | ✅ on the wave |
| **Roadmap Cards** | Navy line across the top, white icon cards hanging below ("Phase 1/2/3") | ✅ slim lead‑in cards |
| **Vertical Dot** | Classic vertical list with dots (linen, editorial) | ✅ inline |

**Week Axis math:** each phase's segment width comes from the **upper bound**
of its range ("4 to 8 weeks" → 8), and the tick labels show the running total
(0 → 8 → 13 → 29 wks with the defaults). Change a duration on the Timeline tab
and the axis re‑proportions automatically.

---

## 3. Placement on the timeline (Week Axis & Horizon Wave)

Each phase's inspector card starts with:

- **Placement: Auto / Above / Below** — Auto alternates; Above/Below forces
  that entry's box to one side of the line.
- **Nudge (−20% … +20%)** — slides the box left/right along the timeline,
  1% per step, in both directions on every entry.

> **Tip:** use Nudge to separate boxes that crowd each other after you change
> durations, or to pull the first/last box off the slide edge.

---

## 4. Styling & sizing

**In the app (Inspector):**

- **Headline** — text, font, size, style, color, outline (top of inspector).
- **Section Label** — the small eyebrow ("YOUR PROJECT"), with show/hide.
- **Per phase (Phases → Phase 1…5):** Name font/size/style/color/outline,
  Duration styling, Description font/size/style/color. **Lock styles
  together** applies Phase 1's styling to all.
- **Dot Size** — Vertical Dot and Horizon Wave only.
- **Footnote** — optional bottom line with full styling.
- **Reset to Defaults** restores the canonical HHI phases and labels.

---

## 5. AI Edit

**In the app:** the **✦ AI Edit** box at the top of the inspector. Plain
English — e.g. *"add a subtle blueprint background,"* *"make the accents
bronze,"* *"switch to roadmap cards,"* or *"add a footnote that the start date
depends on contract signing."* **↶ Undo** reverts the last change.

> **Heads‑up:** AI Edit deliberately does **not** rewrite phase wording — that
> would be overwritten by the Timeline‑tab sync. Change phase wording on the
> Timeline tab.

---

## 6. Quick‑start checklist

1. Confirm durations + wording on the project's **Timeline tab**.
2. Open the **Timeline** slide → pick a **Layout** (try **Week Axis**).
3. Check the boxes don't crowd — use **Placement / Nudge** where needed.
4. Size the **Names** and **Descriptions** to taste (Phases section).
5. Optional: **Footnote** (e.g. "Start date is fluid based on contract
   signing.") and a background via **✦ AI Edit**.

---

*Part of the [HHI Proposal App Training Library](./README.md).*

# Training: The Floor Plan Map Slide

The **Floor Plan Map** ("Project Footprint") slide puts the renovation zones
on the client's *actual floor plan* — numbered pins, orange highlights, and
square-footage callout cards. It's the scope-to-price spine: every zone the
client sees here matches a line on the Investment slide, and the SF figures
come from the same room dimensions that drive pricing.

**In the app:** deck toolbar → **+ Add** → Optional → **+ Floor Plan Map**.
(It's optional because it needs the client's plan image — it isn't seeded
into every deck automatically.)

---

## 1. The 3-step setup

1. **Plan image** — if the project is linked to a Rendr space (Rendr tab),
   just click **Import plan from Rendr**: it pulls the space's floor-plan
   PDF, converts it to an image, and drops it in — one click, done. The
   small **p. 1–4** selector picks which PDF page to import (multi-floor
   scans). No Rendr link? **Pick from library** works with any plan photo
   or scan. A built-in blueprint sheet is the placeholder until then.

   Three cleanup tools for the imported sheet:
   - **✦ Auto-crop to plan (AI)** — finds the drawing area (the grid with
     the walls) and crops the image to exactly that, cutting off the Rendr
     logo, address block, and legend. It cuts real pixels — the linework is
     untouched. Usually the only crop step you need.
   - **✦ Remove dimensions & labels (AI)** — erases the measurement chips
     and any remaining text from the drawing itself. Re-import to get the
     original back.
   - **Manual Trim** sliders — shave a percentage off the top/bottom/left/
     right edges for fine-tuning; the view zooms to what's left. Set the
     trim *before* placing pins.
2. **Zones** — when you add the slide, zones are pre-seeded from the
   project's rooms. Each zone has a **Room dropdown** (the rooms from the
   Sections area): pick one and the label, square footage (length × width —
   the same numbers the estimate uses), and a one-line description fill in
   automatically. All three stay editable, and "Custom (no room)" covers
   zones that aren't a priced room. **Pull rooms & SF** refreshes every
   zone's numbers at once *and* has AI rewrite each description into a
   tight one-to-two-sentence blurb that fits the callout card.
3. **Pins** — for each zone, check **Pin on plan** and walk the X/Y sliders
   until the numbered pin sits on the right room. Optionally add a
   **Highlight box** (X/Y/width/height) to tint the zone like the reference
   decks.

---

## 2. Layouts

| Layout | Looks like | Best for |
|--------|-----------|----------|
| **Callout Map** (default) | Plan center, SF callout cards on both sides, leader lines from card to pin | The full "Mapping the Project Footprint" treatment |
| **Side Ledger** | Plan left, numbered zone ledger stacked right, total band below | When pins are tight or the plan is busy — numerals do the tying, no lines needed |

A **total-footprint band** (sum of zone SF, e.g. "Total renovation
footprint — 200 SF across 3 zones") shows automatically when SF is filled;
toggle it off in **Display**.

---

## 3. Controls

- **Display:** Show SF, Show total, Total label, Zone Highlight Color,
  Zone Text + Pin Size sliders.
- **Per zone:** label, square feet, one-line description, pin X/Y,
  highlight box, card side (Callout Map), reorder, remove.
- **AI Edit** can rewrite zone labels/descriptions and the headline/intro —
  it can **never** touch square footage, pins, or boxes (those are
  measurements, not copy).

> **Heads-up:** if you edit room dimensions later, hit **Pull rooms & SF**
> again — zones keep your labels and pins and just refresh the numbers.

---

## 4. Quick-start checklist

1. Add the slide → pick the client's **plan image**.
2. **Pull rooms & SF**.
3. Place a **pin** per zone (boxes optional but worth it).
4. Tighten the **labels** ("Zone 1: The Kitchen") and add one-line scope
   notes.
5. Check it against the Investment slide — same spaces, same story.

---

*Module status: ✅ Ready — matches the app as of 2026-06-11.*

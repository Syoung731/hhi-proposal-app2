# Slide Editor Adjustment Recommendations

## Group 1 Reference Pattern

These 7 slides already have visual adjustment controls. This table is the baseline
for what Group 2 slides are missing.

| Control Category | Cover | Objective | Scope Overview | Before/After | Scope Breakdown | Why Us | Risk Brief |
|---|---|---|---|---|---|---|---|
| **Layout selector** | 5 layouts | 4 layouts | 2 layouts | 2 layouts | 1 layout | 4 layouts | 2 layouts |
| **Headline text** | Yes | Yes | Yes | - | Yes | - | Yes |
| **Headline size** | - | Slider 0.5-3.0 | - | Slider 0.5-3.0 | - | - | Slider 0.5-3.0 |
| **Headline color** | - | ColorRow + reset | - | ColorRow + hex | - | - | ColorRow |
| **Headline outline** | - | OutlineRow | - | - | - | - | OutlineRow |
| **Body/statement size** | - | Slider 0.5-3.0 | Slider 0.5-3.0 | Slider 0.5-3.0 | - | - | Slider 0.5-3.0 |
| **Body/statement color** | - | ColorRow | ColorRow | ColorRow + hex | - | - | ColorRow |
| **Body outline** | - | OutlineRow | - | - | - | - | OutlineRow |
| **Bullet color** | - | ColorRow | - | - | - | - | - |
| **Text X position** | - | Slider 0-100% | Slider 0-100% | - | - | - | - |
| **Text Y position** | - | Slider 0-100% | Slider 0-100% | - | - | - | - |
| **Text width** | - | Slider 10-100% | - | - | - | - | - |
| **Card show/hide** | - | Toggle | - | - | - | - | - |
| **Card color** | - | ColorRow | - | - | - | - | - |
| **Card opacity** | - | Slider 0-100% | - | - | - | - | - |
| **Box colors** | - | - | - | - | - | - | 2x ColorRow (L/R) |
| **Box header size** | - | - | - | - | - | - | Slider 0.5-3.0 |
| **Box header color** | - | - | - | - | - | - | ColorRow |
| **Box header outline** | - | - | - | - | - | - | OutlineRow |
| **Icon size** | - | - | - | - | - | - | Slider 0.5-3.0 |
| **Icon colors** | - | - | - | - | - | - | 2x ColorRow (cross/check) |
| **Icon outline** | - | - | - | - | - | - | OutlineRow |
| **Bottom text size** | - | - | - | - | - | - | Slider 0.5-3.0 |
| **Bottom text color** | - | - | - | - | - | - | ColorRow |
| **Bottom text outline** | - | - | - | - | - | - | OutlineRow |
| **Row labels toggle** | - | - | - | - | - | - | Custom toggle |
| **Logo position** | Slider x/y/scale | - | - | Slider x/y + size + variant | - | - | - |
| **Panel/card position** | Button toggle | - | - | - | - | - | - |
| **Photo picker** | - | - | LibraryMediaPicker (2-4) | Room media grid | LibraryMediaPicker (4) | - | - |
| **Content items** | - | 3 bullets | - | - | Room toggles | Pillar toggles | 3+3 bullets + labels |

**Key takeaway:** Objective and Risk Brief are the most fully featured. Most Group 1
slides have headline/body size + color controls. Only Cover and Before/After have
logo controls. Only Objective has text positioning and card overlay controls.

---

## Full Slide Audit -- All 18 Slides

### 1. Cover

**A -- Current controls:**
- Layout selector (5 layouts)
- Headline, subheadline, preparedFor, date text fields
- Panel position toggle (right-panel-overlay layout)
- Card position toggle (bottom-card-overlay layout)
- Logo X/Y position sliders (0-100%), scale slider (0.5-5.0), reset button

**B -- Missing controls (matched to Group 1):**
- Headline size slider -- useful for tuning title prominence per project
- Headline color picker -- useful when brand background makes default color hard to read
- Body/subheadline color -- same reason

**C -- Additional suggested controls:**
- Overlay opacity slider (for split-editorial and bottom-card layouts with photo backgrounds)
- Font family selector for headline (serif vs. sans options)
- Tagline font size preset (Small / Medium / Large)

**D -- Priority: Medium**
Cover already has strong controls. Overlay opacity would be the highest-value addition.

---

### 2. Objective

**A -- Current controls:**
- Layout selector (4 layouts)
- Headline, subheadline, statement, supporting text, 3 bullets
- Headline size/color/outline
- Statement size/color/outline
- Supporting text size/color
- Bullet color
- Text X/Y position, text width
- Card show/hide + color + opacity

**B -- Missing controls (matched to Group 1):**
- None -- this is the most complete inspector

**C -- Additional suggested controls:**
- Font family selector for headline
- Bullet icon style (dot / dash / arrow / none)
- Statement text alignment (left / center)

**D -- Priority: Low**
Already the most feature-rich editor. Font family would be nice-to-have.

---

### 3. Investment

**A -- Current controls:**
- Layout selector (1 layout)
- Re-sync button
- Retainer label, amount (numeric), description text fields
- Status display (line item count)

**B -- Missing controls (matched to Group 1):**
- Headline size -- table headings could use size control
- Headline color -- brand color override
- Body text color -- for line item text

**C -- Additional suggested controls:**
- Table header background color
- Retainer box accent color (currently gold, could override)
- Show/hide retainer section toggle
- Line item text size preset (Compact / Normal / Spacious)

**D -- Priority: Medium**
Investment slide is data-driven but lacks any visual tuning.

---

### 4. Why Us

**A -- Current controls:**
- Layout selector (4 layouts)
- Section title text field
- Pillar visibility toggles (multi-select checkbox grid)

**B -- Missing controls (matched to Group 1):**
- Headline size -- important for fitting long titles
- Headline color -- useful with photo backgrounds
- Body text size -- pillar description readability
- Body text color -- same reason

**C -- Additional suggested controls:**
- Section label show/hide toggle
- Card background color (for editorial-cards layout)
- Accent color override (gold dividers and accents)

**D -- Priority: High**
This slide has 4 layouts but almost no visual tuning controls.

---

### 5. Scope Overview

**A -- Current controls:**
- Layout selector (2 layouts)
- Headline, description text fields
- Photo picker (LibraryMediaPicker, 2 or 4 photos)
- Title size/color, X/Y position
- Copy size/color, X/Y position

**B -- Missing controls (matched to Group 1):**
- Headline outline -- useful with photo backgrounds

**C -- Additional suggested controls:**
- Photo overlay opacity (when text overlaps photos)
- Font family selector for title

**D -- Priority: Low**
Already well-equipped with position and color controls.

---

### 6. Before / After

**A -- Current controls:**
- Layout selector (2 layouts)
- Room selection dropdown
- Before photo grid picker
- After/render photo grid picker
- Caption text field
- Heading font size / color (with hex input)
- Caption font size / color
- Logo variant toggle (light/dark), size, X/Y position

**B -- Missing controls (matched to Group 1):**
- Heading outline -- for legibility on photo backgrounds

**C -- Additional suggested controls:**
- Label style for "Before" / "After" text (show/hide, custom text)
- Overlay opacity on after-emphasis layout

**D -- Priority: Low**
Comprehensive controls already.

---

### 7. Scope Breakdown

**A -- Current controls:**
- Layout selector (1 layout)
- Headline, intro text
- Per-room include/exclude toggle + description
- Photo picker (LibraryMediaPicker, up to 4)

**B -- Missing controls (matched to Group 1):**
- Headline size -- for fitting varying title lengths
- Headline color -- brand override
- Body text size -- room description readability
- Body text color

**C -- Additional suggested controls:**
- Section divider show/hide
- Room card spacing preset (Compact / Normal)

**D -- Priority: Medium**
Functional but no visual tuning at all.

---

### 8. Our Process

**A -- Current controls:**
- Layout selector (1 layout -- "three-stages")
- Headline text field
- Per-stage: name + bullets (TextArea)
- Bottom statement

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size (stage descriptions)
- Body text color

**C -- Additional suggested controls:**
- Stage card background color
- Connector arrow color (currently gold)
- Bottom statement size/color
- Section label show/hide (currently no section label at all)

**D -- Priority: High**
Content-only editor with zero visual controls.

---

### 9. Core Values

**A -- Current controls:**
- Layout selector (4 layouts)
- Section label text field
- Headline text field
- Per-value: name, descriptor, description, reorder
- Reset to defaults

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size
- Body text color
- Section label color (currently always gold)

**C -- Additional suggested controls:**
- Card background color / opacity (for cards-row layout)
- Watermark show/hide toggle
- Value card border style (None / Subtle / Gold accent)
- Accent color override

**D -- Priority: High**
4 layouts but no visual tuning beyond content editing.

---

### 10. Project Timeline

**A -- Current controls:**
- Layout selector (3 layouts)
- Section label, headline, footnote text fields
- Per-phase: name, duration, description, note (optional)
- Add/remove/reorder phases
- Reset to defaults

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size
- Body text color

**C -- Additional suggested controls:**
- Phase node color (currently gold)
- Connector line style (solid / dashed)
- Footnote size / color
- Accent color override

**D -- Priority: Medium**
Solid content editor, needs visual tuning.

---

### 11. COPE Page

**A -- Current controls:**
- Layout selector (3 layouts)
- Section label, headline, subheadline text fields
- Per-item: title, description, icon (TemplateCIconPicker), callout label, bullets
- Add/remove/reorder items
- Reset to defaults

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size
- Body text color

**C -- Additional suggested controls:**
- Icon size preset (Small / Medium / Large)
- Column divider show/hide
- Section label show/hide toggle
- Card spacing preset (Compact / Normal)

**D -- Priority: Medium**
Good content editor, needs visual controls.

---

### 12. Visual Inspiration

**A -- Current controls:**
- Layout selector (3 layouts)
- Headline (layouts A, C), subtitle (layout A), caption (layouts B, C)
- Hero photo picker (layout A)
- Photos list with add/remove/reorder + count guidance warnings

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Caption size / color

**C -- Additional suggested controls:**
- Photo gap size (None / Tight / Normal)
- Overlay gradient opacity (for hero text legibility in layout A)
- Caption position (bottom-left / bottom-center / bottom-right for layout B)

**D -- Priority: Medium**
Photo-focused slide, visual controls would refine presentation.

---

### 13. Design-Build Advantage

**A -- Current controls:**
- Layout selector (4 layouts)
- Headline, subheadline text fields
- Background style toggle (dark/light, layout B)
- Background photo picker (layouts A, B, C)
- Footer note (layout B)
- Pillars: icon (TemplateCIconPicker), title, description, add/remove/reorder (layouts A, C)
- Guarantees: title, description, add/remove (layout B)
- Diagram nodes: labels, add/remove (layout D)
- Support columns: title, description, add/remove/reorder (layout D)
- Settings link

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size
- Body text color

**C -- Additional suggested controls:**
- Guarantee title size (currently large 42px -- may need tuning)
- Overlay opacity slider (for photo background layouts)
- Diagram node color override
- Diagram arrow color override

**D -- Priority: Medium**
Content-rich editor but lacks visual tuning.

---

### 14. Client Testimonials

**A -- Current controls:**
- Layout selector (3 layouts)
- Headline, subheadline text fields
- Show stars toggle
- Background photo picker
- Testimonial picker (from library, 1-4, reorderable)
- Settings link

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size (quote text)
- Body text color

**C -- Additional suggested controls:**
- Card background color / opacity
- Quote mark size / color override
- Star color override
- Card border style (None / Subtle / Shadow)

**D -- Priority: Medium**
Good content workflow, needs visual tuning for premium feel.

---

### 15. Design Retainer

**A -- Current controls:**
- Layout selector (3 layouts)
- Headline, tagline, retainer amount, description (layout B), note/fine print
- Background image URL text input (layout C) -- NOTE: should be photo picker
- Benefits list with add/remove/reorder
- Reset to defaults

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size
- Body text color

**C -- Additional suggested controls:**
- Retainer amount size preset (Medium / Large / Display)
- Background image should use LibraryMediaPicker (currently plain URL input)
- Card background color / opacity (layout C)
- Overlay opacity slider (layout C)

**D -- Priority: High**
Background image still uses plain URL input (not photo library picker).
No visual tuning controls.

---

### 16. Next Steps

**A -- Current controls:**
- Layout selector (4 layouts)
- Section label, headline text fields
- Contact email, phone, show address toggle
- Right photo picker (LibraryMediaPicker, layouts A, D)
- Per-step: number, title, description, photo URL (layout B)
- Add/remove/reorder steps
- Reset to defaults

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size (step descriptions)
- Body text color

**C -- Additional suggested controls:**
- Step number color override (currently gold)
- Step number size preset
- Step photo should use LibraryMediaPicker (layout B currently uses URL input)
- Contact footer show/hide toggle

**D -- Priority: Medium**
Step photo in layout B still uses plain URL input. No visual tuning.

---

### 17. Closing

**A -- Current controls:**
- Layout selector (3 layouts)
- Headline, tagline, subheadline text fields
- Logo preview (read-only, from branding)
- Contact email, phone, address text fields
- Validity note text field
- Background color text input (layout A)
- Background photo picker (layouts A, C)

**B -- Missing controls (matched to Group 1):**
- Headline size slider
- Headline color picker
- Body text size (tagline, contact info)
- Body text color

**C -- Additional suggested controls:**
- Logo size preset (Small / Medium / Large / Prominent)
- Logo dark/light variant toggle (currently auto per layout)
- Background color picker (currently plain text hex input)
- Overlay opacity slider (layouts A, C with photo)
- Validity note show/hide toggle

**D -- Priority: Medium**
Background color is a text input instead of color picker. No visual tuning.

---

### 18. (Not a separate slide -- no 18th)

Note: The count of 18 includes all slide types currently in the SlideType union.
All 18 are covered above (slides 1-17 map to the types, with Investment as #3).

Wait -- let me recount. The SlideType union has:
cover, objective, investment, why-us, scope-overview, before-after, scope-breakdown,
risk-brief, process, core-values, project-timeline, cope-page, design-retainer,
next-steps, closing-slide, visual-inspiration, client-testimonials, design-build-advantage

That is exactly 18 types. All are covered above as slides 1-17 with Investment
included under #3.

Corrected slide numbering for 18 types:
1. Cover, 2. Objective, 3. Scope Overview, 4. Before/After, 5. Scope Breakdown,
6. Why Us, 7. Risk Brief, 8. Process, 9. Core Values, 10. Investment,
11. Timeline, 12. COPE, 13. Visual Inspiration, 14. Design-Build,
15. Testimonials, 16. Design Retainer, 17. Next Steps, 18. Closing

All 18 are audited above.

---

## Logo Control Audit

### Current State

| # | Slide Type | Shows Logo? | Position | Size | From Branding? | Inspector Toggle? | Dark/Light Variant? |
|---|---|---|---|---|---|---|---|
| 1 | Cover | Yes | Configurable (x/y/scale) | Slider 0.5-5.0 | Yes (logoLightUrl/logoDarkUrl) | No (always shown) | Auto per layout |
| 2 | Objective | No | - | - | - | No | No |
| 3 | Investment | No | - | - | - | No | No |
| 4 | Why Us | No | - | - | - | No | No |
| 5 | Scope Overview | No | - | - | - | No | No |
| 6 | Before/After | Yes | Configurable (x/y) | Slider 0.5-8.0 | Yes | No (always shown) | Yes (toggle) |
| 7 | Scope Breakdown | No | - | - | - | No | No |
| 8 | Risk Brief | No | - | - | - | No | No |
| 9 | Process | No | - | - | - | No | No |
| 10 | Core Values | No | - | - | - | No | No |
| 11 | Timeline | No | - | - | - | No | No |
| 12 | COPE | No | - | - | - | No | No |
| 13 | Visual Inspiration | No | - | - | - | No | No |
| 14 | Design-Build | No | - | - | - | No | No |
| 15 | Testimonials | No | - | - | - | No | No |
| 16 | Design Retainer | No | - | - | - | No | No |
| 17 | Next Steps | No | - | - | - | No | No |
| 18 | Closing | Yes | Fixed per layout | Fixed per layout | Yes | No | Auto per layout |

### Recommended Standard Logo Control

Every slide should have:
- **Toggle:** Show Logo (on/off) -- default ON for Cover, Before/After, Closing; OFF for all others
- **Variant:** Light Background / Dark Background -- selects logoLightUrl or logoDarkUrl
- **Source:** Always from /admin/settings/branding -- never per-slide upload
- **Fallback:** If no logo URL set in branding, render nothing (no broken placeholder)
- **Position:** Fixed default per slide type (top-right for most, custom for Cover/Before-After)
- **Size:** Small fixed size for content slides, configurable for Cover/Before-After

### Slides needing updates:
- **Cover:** Add show/hide toggle (currently always shows)
- **Before/After:** Add show/hide toggle
- **Closing:** Add show/hide toggle + dark/light variant selector (currently auto)
- **All other 15 slides:** Add optional logo rendering with show/hide toggle (default OFF)

---

## Consistency Issues

### 1. Padding inconsistency
**Issue:** Padding varies from "3% 6%" to "8% 12%" across slides.
**Affected:** All 18 slides.
**Standard:** Establish 2-3 standard padding tiers:
- Content slides: `5% 6%`
- Centered/CTA slides: `6% 10%`
- Photo-heavy slides: `3% 4%`

### 2. Section label font size inconsistency
**Issue:** Section labels use 0.5em, 0.55em, or 0.6em across different slides.
**Affected:** CoreValues (0.6em), NextSteps (0.5em), DesignRetainer (0.55em), Timeline (0.55em).
**Standard:** Standardize to `0.55em` for all section labels.

### 3. Overlay opacity varies widely
**Issue:** Photo overlay opacity ranges from 0.35 to 0.85 with no consistency.
**Affected:** Cover (0.62), CoreValues (0.78), Closing (0.35-0.6), Testimonials (0.5-0.55), DesignBuild (0.55-0.6).
**Standard:** Standardize to 3 presets:
- Light overlay: 0.35 (photo-forward)
- Medium overlay: 0.55 (balanced)
- Heavy overlay: 0.75 (text-forward)
Better yet: make this an editor control (overlay opacity slider).

### 4. Watermark usage inconsistent
**Issue:** Only 4 of 18 slides render the architectural watermark.
**Affected:** DesignRetainer, NextSteps, VisualInspiration, DesignBuild have it. 14 others don't.
**Standard:** Add watermark to all slides with a show/hide toggle. Default ON for content slides on linen background, OFF for photo-heavy and dark-background slides.

### 5. Card shadow/border treatment varies
**Issue:** Card shadows range from "0 2px 8px rgba(0,0,0,0.07)" to "0 8px 40px rgba(0,0,0,0.5)".
**Affected:** ProcessSlide, CoreValues, ClientTestimonials, RiskBrief, Cover.
**Standard:** Standardize to 3 shadow presets:
- Subtle: `0 1px 4px rgba(0,0,0,0.06)`
- Normal: `0 2px 8px rgba(0,0,0,0.08)`
- Elevated: `0 4px 16px rgba(0,0,0,0.12)`

### 6. TitleAccentRule width varies
**Issue:** Width varies between "2em", "2.5em", and "3em" across slides.
**Affected:** Most slides default to "3em", DesignRetainer and Closing use "2.5em".
**Standard:** Standardize to `3em` unless the slide has a significantly narrower text container, then `2.5em`.

### 7. Background color input inconsistency
**Issue:** ClosingSlide uses a plain text input for background color hex. Other slides with
color controls use ColorRow component with a proper color picker.
**Affected:** ClosingSlide (backgroundColor field).
**Standard:** All color inputs should use ColorRow for consistent UX.

### 8. Photo URL text inputs still exist
**Issue:** DesignRetainerSlide (backgroundImage) and NextStepsSlide (step photos in layout B)
still accept raw URL text inputs instead of using LibraryMediaPicker.
**Affected:** DesignRetainerSlide layout C, NextStepsSlide layout B step photos.
**Standard:** All photo selection should use LibraryMediaPicker consistently.

### 9. Font loading gap
**Issue:** Slides reference 'Cormorant Garamond' and 'Jost' in inline styles but these
fonts are not loaded via next/font. Only Geist Sans and Geist Mono are loaded in layout.tsx.
These fonts likely load from a Google Fonts link elsewhere or are expected to be
available from the browser/system, which could cause rendering issues.
**Standard:** Verify fonts are loaded. If relying on Google Fonts CDN link, document it.
If not loaded, add them to the font stack.

---

## Proposed Standard Adjustment Set

### TIER 1 -- Baseline controls every slide should have

These controls make sense universally across all 18 slides:

1. **Layout selector** -- Already present on all multi-layout slides. No change needed.

2. **Headline size preset**
   - Control: Dropdown with 4 options
   - Options: Small (0.8x) / Medium (1.0x, default) / Large (1.2x) / Display (1.5x)
   - Applies to: slide headline element
   - Value stored as multiplier on base font size

3. **Headline color**
   - Control: ColorRow with reset button
   - Default: Navy (#1B2A4A) on light backgrounds, white on dark
   - Applies to: slide headline element

4. **Body text size preset**
   - Control: Dropdown with 3 options
   - Options: Small (0.85x) / Medium (1.0x, default) / Large (1.15x)
   - Applies to: main body/description text

5. **Body text color**
   - Control: ColorRow with reset button
   - Default: Muted navy (#4A5568)
   - Applies to: main body/description text

6. **Accent color override**
   - Control: ColorRow with reset button
   - Default: Gold (#B8860B)
   - Applies to: section labels, accent rules, dividers, icons

7. **Section label show/hide** (where applicable)
   - Control: Toggle/checkbox
   - Default: ON for slides that have section labels
   - Applies to: section label element above headline

8. **Watermark show/hide**
   - Control: Toggle/checkbox
   - Default: ON for linen-background slides, OFF for photo/dark slides
   - Applies to: architectural compass watermark top-right

9. **Logo visibility**
   - Control: Toggle/checkbox
   - Default: ON for Cover, Before/After, Closing; OFF for all others
   - Variant: Light Background / Dark Background selector
   - Source: Always from branding settings

10. **Font family selector**

    Curated shortlist of 4 fonts (all already referenced in the codebase):

    | Display Label | Font Family | Character |
    |---|---|---|
    | Classic Serif | Cormorant Garamond | Elegant, editorial, luxury |
    | Clean Sans | Jost | Modern, readable, neutral |
    | Geometric | Geist Sans | Technical, contemporary |
    | Monospace | Geist Mono | Architectural, distinctive |

    Application per element:
    - **Headline font:** Dropdown, default "Classic Serif" (Cormorant Garamond)
    - **Body font:** Dropdown, default "Clean Sans" (Jost)
    - Section labels always use Jost (not configurable)

    Same options across all 18 slides for consistency.

### TIER 2 -- Conditional controls by slide category

#### Photo-heavy slides (Cover, Scope Overview, Before/After, Visual Inspiration, Closing layout C)
- Overlay opacity slider (0-100%, step 5)
- Photo border radius toggle (Sharp / Slightly rounded)

#### Card-based slides (Core Values, Process, COPE, Design-Build, Testimonials, Risk Brief)
- Card background color with opacity
- Card border style (None / Subtle / Gold accent)
- Card shadow preset (None / Subtle / Elevated)
- Card spacing density (Compact / Normal / Spacious)

#### Text-heavy / editorial slides (Objective, Scope Breakdown, Investment, Timeline)
- Text alignment (Left / Center)
- Line spacing preset (Tight / Normal / Relaxed)

#### CTA / closing slides (Design Retainer, Next Steps, Closing)
- Contact info show/hide toggle
- Footer note show/hide toggle

#### Comparison slides (Risk Brief)
- Already well-covered. Icon size/color controls are specific to this slide.

---

## Implementation Scope Estimate

### Quick Wins (toggle / show-hide, simple additions)
- Add watermark show/hide toggle to all 18 slides (consistent prop + content field)
- Add section label show/hide toggle where section labels exist
- Add logo show/hide toggle to 15 slides that currently lack it
- Convert DesignRetainer backgroundImage URL input to LibraryMediaPicker
- Convert NextSteps step photo URL input to LibraryMediaPicker
- Convert Closing backgroundColor text input to ColorRow picker
- Add accent color override field to all slide content types

**Estimated: ~15 slides touched, 1-2 controls each, mostly inspector changes**

### Medium Effort (new control types, per-element selectors)
- Add headline size preset dropdown to 11 Group 2 slides
- Add headline color picker to 11 Group 2 slides
- Add body text size preset to 11 Group 2 slides
- Add body text color picker to 11 Group 2 slides
- Add overlay opacity slider to 6 photo-heavy slides
- Add card styling controls (bg color, border, shadow) to 6 card-based slides
- Add font family selector to all 18 slides (2 dropdowns: headline + body)

**Estimated: Content type changes + inspector UI + slide renderer reads. ~18 slides, 3-5 controls each**

### Complex (structural changes, cross-slide refactors)
- Standardize logo rendering across all 18 slides (shared LogoOverlay component)
- Standardize watermark rendering (shared component with show/hide + opacity)
- Standardize overlay handling (shared component or utility)
- Normalize padding tiers across all layouts
- Font loading verification and fix (ensure Cormorant Garamond + Jost are properly loaded)
- Create shared style preset system (so controls like "card shadow" resolve to consistent CSS)

**Estimated: Shared component extraction, cross-slide refactor, testing all 50+ layouts**

---

## Remaining URL Input Issues

These fields still use plain text URL inputs and should be converted to LibraryMediaPicker:

| Slide | Field | Current | Should Be |
|---|---|---|---|
| Design Retainer (layout C) | backgroundImage | TextInput URL | LibraryMediaPicker |
| Next Steps (layout B) | step.photo | TextInput URL | LibraryMediaPicker |

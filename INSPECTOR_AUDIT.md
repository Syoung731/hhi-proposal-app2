# Inspector Panel Audit Report

Generated: 2026-04-08
Source: `app/admin/projects/[id]/deck/InspectorPanel.tsx` (5,614 lines)

---

## Step 1 — Control Presence Matrix

### Legend
- **P** = Present (uses shared component correctly)
- **M** = Missing
- **C** = Custom implementation (not using shared component)
- **n/a** = Not applicable for this slide category

### Universal Controls (ALL 18 slides)

| # | Slide | Layout Selector | Logo Section | Headline Font | Body Font | Accent Color | Section Label Toggle |
|---|-------|----------------|--------------|---------------|-----------|--------------|---------------------|
| 1 | Cover | P | C (dual: LogoPositionSection + SharedLogoSection) | P | P | P | M |
| 2 | Objective | P | P | P | P | P | M |
| 3 | Investment | P | P | P | P | P | M |
| 4 | Why Us | P | P | P | P | P | M |
| 5 | Scope Overview | P | P | P | P | P | M |
| 6 | Before/After | P | C (custom inline logo controls) | P | P | P | M |
| 7 | Scope Breakdown | P | P | P | P | P | M |
| 8 | Risk Brief | P | P | P | P | P | M |
| 9 | Process | P | P | P | P | P | M |
| 10 | Core Values | P | P | P | P | P | P |
| 11 | Project Timeline | P | P | P | P | P | P |
| 12 | COPE Page | P | P | P | P | P | P |
| 13 | Design Retainer | P | P | P | P | P | P |
| 14 | Next Steps | P | P | P | P | P | P |
| 15 | Closing | P | P (hidePosSliders=true) | P | P | P | M |
| 16 | Visual Inspiration | P | P | P | P | P | M |
| 17 | Client Testimonials | P | P | P | P | P | M |
| 18 | Design-Build Advantage | P | P | P | P | P | M |

### Group 2 Typography Controls (showSizeControls=true)

| # | Slide | Headline Size | Headline Color | Body Size | Body Color | showSizeControls passed? |
|---|-------|--------------|----------------|-----------|------------|--------------------------|
| 1 | Cover | M | M | M | M | No (Group 1) |
| 2 | Objective | M | M | M | M | No (Group 1) |
| 3 | Investment | P | P | P | P | Yes |
| 4 | Why Us | M | M | M | M | No (Group 1) |
| 5 | Scope Overview | M | M | M | M | No (Group 1) |
| 6 | Before/After | M | M | M | M | No (Group 1) |
| 7 | Scope Breakdown | M | M | M | M | No (Group 1) |
| 8 | Risk Brief | M | M | M | M | No (Group 1) |
| 9 | Process | P | P | P | P | Yes |
| 10 | Core Values | P | P | P | P | Yes |
| 11 | Project Timeline | P | P | P | P | Yes |
| 12 | COPE Page | P | P | P | P | Yes |
| 13 | Design Retainer | P | P | P | P | Yes |
| 14 | Next Steps | P | P | P | P | Yes |
| 15 | Closing | P | P | P | P | Yes |
| 16 | Visual Inspiration | P | P | P | P | Yes |
| 17 | Client Testimonials | P | P | P | P | Yes |
| 18 | Design-Build Advantage | P | P | P | P | Yes |

### Photo Overlay Controls

| # | Slide | Overlay Opacity | Notes |
|---|-------|----------------|-------|
| 1 | Cover | P | Via LogoPositionSection tail |
| 5 | Scope Overview | P | |
| 15 | Closing | P | |
| 16 | Visual Inspiration | P | |
| 17 | Client Testimonials | P | |
| 18 | Design-Build Advantage | P | |
| 2 | Objective | M | Has photo backgrounds in some layouts |
| 6 | Before/After | M | Photo-heavy slide with no overlay control |

### Card Style Controls

| # | Slide | Card Border | Card Shadow | Card Spacing | Notes |
|---|-------|------------|-------------|--------------|-------|
| 8 | Risk Brief | P | P | P | |
| 9 | Process | P | P | P | |
| 10 | Core Values | P | P | P | |
| 12 | COPE Page | P | P | P | |
| 17 | Client Testimonials | P | P | P | |
| 18 | Design-Build Advantage | P | P | P | |
| 4 | Why Us | M | M | M | Has card-based layouts (editorial-cards) |

### Text Layout Controls (Editorial slides)

| # | Slide | Text Alignment | Line Spacing | Notes |
|---|-------|---------------|-------------|-------|
| 2 | Objective | P | P | |
| 3 | Investment | P | P | |
| 7 | Scope Breakdown | P | P | |
| 11 | Project Timeline | P | P | |

### CTA Controls

| # | Slide | Show Contact Info | Show Footer Note | Notes |
|---|-------|------------------|-----------------|-------|
| 13 | Design Retainer | P | P | |
| 14 | Next Steps | P | P | |
| 15 | Closing | P | P | |

### Investment-Specific Controls

| Control | Present? | Notes |
|---------|----------|-------|
| Table Header Color (BrandingColorRow) | P | `tableHeaderBgColor` field |
| Show Retainer Section toggle | P | `showRetainerSection` field |
| Line Item Density selector | P | `lineItemSizePreset` field |
| Retainer Accent Color (BrandingColorRow) | P | `retainerAccentColor` field |

---

## Step 2 — Consistency Issues

### SharedLogoSection

| Issue | Slides Affected |
|-------|----------------|
| **Cover uses dual logo system**: Both `LogoPositionSection` (custom, with `logoOverride` containing x/y/scale at 0–100/0.5–5.0) AND `SharedLogoSection` (with `showLogo/logoVariant/logoSize/logoX/logoY`). Two separate logo controls appear in the same inspector. | Cover |
| **Before/After uses fully custom inline logo controls** instead of SharedLogoSection. Logo variant toggle, size slider (0.5–8.0 range vs 0.5–4.0), and position sliders (0–100 as fractions 0.0–1.0 vs integers 0–100) are all reimplemented inline. | Before/After |
| **Before/After logo size range is 0.5–8.0** vs SharedLogoSection's 0.5–4.0 | Before/After |
| **Before/After position sliders use 0.0–1.0 fractions** (stored as `content.logoX * 100`) vs SharedLogoSection's integer 0–100 | Before/After |
| **"Logo managed in Settings → Branding" link** is present in SharedLogoSection but not in Cover's LogoPositionSection or Before/After's custom controls | Cover, Before/After |
| **All 5 sub-controls**: SharedLogoSection has: toggle, variant, size slider (with S/M/L/XL ticks), X slider, Y slider, reset button. All present where SharedLogoSection is used. | — |
| **Slider ranges correct**: Size 0.5–4.0, X/Y 0–100 (integer) in SharedLogoSection. Correct. | — |
| **X/Y sliders hidden for ClosingSlide**: Yes, `hidePosSliders={true}` passed. Correct. | — |

### SharedTypographySection

| Issue | Slides Affected |
|-------|----------------|
| All slides use SharedTypographySection. Correct. | — |
| Both font dropdowns use `SLIDE_FONTS` options. Correct. | — |
| Group 1/2 distinction applied via `showSizeControls` prop. Correct. | — |
| **No consistency issues found** with SharedTypographySection usage. | — |

### BrandingColorRow

| Issue | Slides Affected |
|-------|----------------|
| **Scope Overview `titleColor`** uses plain `<input type="color">` + hex span + reset button instead of BrandingColorRow | Scope Overview |
| **Scope Overview `copyColor`** uses plain `<input type="color">` + hex span + reset button instead of BrandingColorRow | Scope Overview |
| **Before/After `headingColor`** uses plain `<input type="color">` + hex text input instead of BrandingColorRow | Before/After |
| **Before/After `captionColor`** uses plain `<input type="color">` + hex text input instead of BrandingColorRow | Before/After |
| **Closing Slide `backgroundColor`** uses plain `<input type="color">` instead of BrandingColorRow | Closing Slide |
| All other color controls correctly use BrandingColorRow with reset buttons | — |

### Slider Value Display

| Issue | Slides Affected |
|-------|----------------|
| All SharedLogoSection sliders show current value in label. Correct. | — |
| All slide-specific sliders show current value. Correct. | — |

### Section Label Toggle

| Issue | Slides Affected |
|-------|----------------|
| **SharedSectionLabelToggle only used on 5 slides**: Core Values, Project Timeline, COPE Page, Design Retainer, Next Steps | — |
| **Missing on 13 slides** that may render section labels: Cover, Objective, Investment, Why Us, Scope Overview, Before/After, Scope Breakdown, Risk Brief, Process, Closing, Visual Inspiration, Client Testimonials, Design-Build Advantage | 13 slides |

---

## Step 3 — Data Flow Issues

### Cover

| Issue | Severity |
|-------|----------|
| **Dual logo systems**: `LogoPositionSection` writes to `content.logoOverride` (x/y/scale), while `SharedLogoSection` writes to `content.showLogo/logoVariant/logoSize/logoX/logoY`. Both appear in the inspector simultaneously. The slide renderer may only read one set, making the other set of controls disconnected. | Critical |
| `SharedTypographySection` is called from inside `LogoPositionSection` — unusual nesting, but functionally correct. | Polish |

### Objective

| Issue | Severity |
|-------|----------|
| Has custom `headlineSize`, `headlineColor`, `statementSize`, `statementColor`, `supportingSize`, `supportingColor`, `bulletColor` fields that are **separate from SharedSlideFields**. These are slide-specific ObjectiveContent fields, not the shared `headlineSizeScale`/`headlineColor`/etc. SharedTypographySection also provides `headlineFont` and `bodyFont` controls. The shared `headlineFont` and body-font-specific `headlineColor` are distinct from the objective-specific `headlineColor`. **Potential field collision**: Both ObjectiveContent and SharedSlideFields define `headlineColor`. | Medium |

### Before/After

| Issue | Severity |
|-------|----------|
| Logo position sliders write `content.logoX` and `content.logoY` as **0.0–1.0 fractions** (`Number(e.target.value) / 100`), but SharedLogoSection and LogoOverlay read them as **0–100 integers**. If the user adjusts position in the custom controls, the logo may render at ~1% instead of the intended position. | Critical |
| Logo size slider range is **0.5–8.0** but SharedSlideFields and LogoOverlay cap at **0.5–4.0**. Values above 4.0 may behave unpredictably. | Medium |

### Scope Overview

| Issue | Severity |
|-------|----------|
| `titleColor` defaults to `branding.textColor` rather than the standard `#1B2A4A` used in SharedTypographySection. Minor inconsistency. | Polish |
| `copyColor` defaults to `#4B5563` rather than `#4A5568` (SharedSlideFields default). Minor inconsistency. | Polish |

### All slides

| Issue | Severity |
|-------|----------|
| `resolvedAccent = content.accentColor ?? GOLD` pattern: SharedAccentColorSection uses `defaultVal="#B8860B"` consistently. No slide uses `branding.accentColor` for accent elements except Risk Brief (`rightBoxColor` defaults to `branding.accentColor` which is correct as it's a different field). | — |
| **Deprecated fields** (`logoPosition`, `logoSizePreset`): Not read or written anywhere in InspectorPanel.tsx. No issues found. | — |

---

## Step 4 — Control Order Issues

### Expected order (per audit spec):
1. Layout selector
2. Slide-specific content
3. Typography
4. Logo
5. Slide-category controls (Card/Overlay/CTA/Table)
6. Accent Color

### Actual order per slide:

| # | Slide | Actual Order | Deviations |
|---|-------|-------------|------------|
| 1 | Cover | Content → LogoPositionSection → [Typography, Overlay, Logo, Accent] | LogoPositionSection nests Typography+Overlay+Logo+Accent inside it. Logo section appears twice (once in LogoPositionSection and once as SharedLogoSection). |
| 2 | Objective | Content → Headline Style → Statement Style → Supporting Style → Bullets Style → Text Position → Card → **Typography → TextLayout → Logo → Accent** | Mostly correct. Custom style controls before shared ones. |
| 3 | Investment | Retainer → **Table Style → Typography → TextLayout → Logo → Accent** | Table Style appears before Typography — should be after. |
| 4 | Why Us | Content → Pillars → **Typography → Logo → Accent** | Correct (no category controls needed). |
| 5 | Scope Overview | Content → Photos → Title → Copy → **Typography → Overlay → Logo → Accent** | Correct. |
| 6 | Before/After | Content → Typography (custom) → Logo (custom) → Room → Caption → Photos → **SharedTypography → SharedLogo → Accent** | Custom typography and logo controls before content fields. Shared sections at end but custom ones intermixed with content. |
| 7 | Scope Breakdown | Content → Sections → Photos → **Typography → TextLayout → Logo → Accent** | Correct. |
| 8 | Risk Brief | Title → Left Column → Right Column → Box Header → Row Labels → Box Body → Box Colors → Box Icons → Bottom Statement → **Typography → CardStyle → Logo → Accent** | Correct. |
| 9 | Process | Title → Stages → Bottom Statement → **Typography(+size) → CardStyle → Logo → Accent** | Correct. |
| 10 | Core Values | SectionLabel → Headline → Values → **Typography(+size) → CardStyle → Logo → Accent → Reset** | Correct. |
| 11 | Project Timeline | SectionLabel → Headline → Footnote → Phases → **Typography(+size) → TextLayout → Logo → Accent → Reset** | Correct. |
| 12 | COPE Page | SectionLabel → Headline → Items → **Typography(+size) → CardStyle → Logo → Accent → Reset** | Correct. |
| 13 | Design Retainer | SectionLabel → Headline → Retainer → BgImage → Benefits → **Typography(+size) → CTA → Logo → Accent → Reset** | Correct. |
| 14 | Next Steps | SectionLabel → Headline → Contact → Photo → Steps → **Typography(+size) → CTA → Logo → Accent → Reset** | Correct. |
| 15 | Closing | Headline → Contact Info → BgColor → BgPhoto → **Typography(+size) → Overlay → CTA → Logo → Accent** | Correct. |
| 16 | Visual Inspiration | Headline → Photos → **Typography(+size) → Overlay → Logo → Accent** | Correct. |
| 17 | Client Testimonials | Headline → BgPhoto → Testimonials → **Typography(+size) → CardStyle → Overlay → Logo → Accent** | Correct. |
| 18 | Design-Build Advantage | Headline → BgStyle → BgPhoto → Content → **Typography(+size) → CardStyle → Overlay → Logo → Accent** | Correct. |

### Order violations:
1. **Cover**: Logo controls appear twice — LogoPositionSection + SharedLogoSection
2. **Before/After**: Custom typography/logo mixed into content section before shared sections
3. **Investment**: Table Style before Typography (should be after)

---

## Step 5 — UX Issues

### Cover

| Issue | Type |
|-------|------|
| **Two separate logo controls** in the same inspector panel. User sees LogoPositionSection (X/Y/Scale sliders for `logoOverride`) and then SharedLogoSection (show toggle, variant, size, X/Y) — confusing and likely one set is disconnected. | Critical — Duplicate controls |
| `SharedOverlaySection` always shows regardless of whether the current layout has a photo background. Only hero-image and right-panel-overlay layouts use photos. | Medium — Missing conditional visibility |

### Objective

| Issue | Type |
|-------|------|
| Overlay Opacity control is missing but some layouts (blueprint-overlay) use photo backgrounds. | Medium — Missing control |
| `headlineColor` exists as both an ObjectiveContent-specific field and a SharedSlideFields field. The custom one (defaulting to `#ffffff`) and the shared one may conflict. | Medium — Potential field collision |

### Before/After

| Issue | Type |
|-------|------|
| Custom logo controls use different value ranges than SharedLogoSection (0–1.0 fractions vs 0–100 integers; 0.5–8.0 vs 0.5–4.0 scale). User will experience broken logo positioning. | Critical — Data type mismatch |
| Color pickers for headingColor and captionColor use raw `<input type="color">` + hex text input instead of BrandingColorRow. No branding swatches available. | Medium — Missing BrandingColorRow |
| No SharedSectionLabelToggle despite having a section label on the slide. | Medium — Missing control |

### Scope Overview

| Issue | Type |
|-------|------|
| `titleColor` and `copyColor` use raw `<input type="color">` instead of BrandingColorRow. No branding swatches. | Medium — Missing BrandingColorRow |
| No SharedSectionLabelToggle. | Medium — Missing control |

### Investment

| Issue | Type |
|-------|------|
| Table Style section appears before Typography — inconsistent with standard order. | Polish — Ordering |
| No SharedSectionLabelToggle. | Medium — Missing control |

### Why Us

| Issue | Type |
|-------|------|
| Missing SharedCardStyleSection despite having card-based layouts (editorial-cards). | Medium — Missing control |
| No SharedSectionLabelToggle. | Medium — Missing control |

### Risk Brief

| Issue | Type |
|-------|------|
| No SharedSectionLabelToggle. | Medium — Missing control |
| Many custom OutlineRow controls using raw `<input type="color">` instead of BrandingColorRow for outline colors. However OutlineRow has a different purpose (enabling/disabling outlines) so this is a design choice. | Polish |

### Process

| Issue | Type |
|-------|------|
| No SharedSectionLabelToggle. | Medium — Missing control |

### Closing

| Issue | Type |
|-------|------|
| `backgroundColor` uses raw `<input type="color">` instead of BrandingColorRow. | Medium — Missing BrandingColorRow |
| No SharedSectionLabelToggle. | Medium — Missing control |
| Overlay section always shows even when layout is `light-logo-centered` which has no photo background. | Medium — Missing conditional visibility |

### Visual Inspiration

| Issue | Type |
|-------|------|
| No SharedSectionLabelToggle. | Medium — Missing control |
| Overlay section always shows even for `masonry-grid` layout which may not benefit from overlay. | Polish — Conditional visibility |

### Client Testimonials

| Issue | Type |
|-------|------|
| No SharedSectionLabelToggle. | Medium — Missing control |

### Design-Build Advantage

| Issue | Type |
|-------|------|
| No SharedSectionLabelToggle. | Medium — Missing control |

### Label Naming Inconsistencies

| Control | Variants Found | Slides |
|---------|---------------|--------|
| Headline size | "Size — X×" (Objective custom), "Headline Size" (SharedTypography), "Title Size — X×" (Scope Overview, Risk Brief custom) | Mixed |
| Body text size | "Body Text Size" (SharedTypography), "Caption Size" (Before/After), "Copy Size" (Scope Overview) | Mixed |
| Text color | "Headline Color" (SharedTypography), "Color" (Objective custom), "Heading Color" (Before/After), "Title Text Color" (Risk Brief) | Mixed |

---

## Summary

| Category | Count |
|----------|-------|
| **Missing controls** | 22 |
| **Partial / Custom implementations** | 7 |
| **Consistency issues** | 8 |
| **Data flow issues** | 4 |
| **Control order issues** | 3 |
| **UX issues** | 14 |
| **Total issues** | 58 |

---

## Priority Fix List

### Critical (broken / disconnected — 3 issues)

1. **Cover: Dual logo system** — LogoPositionSection AND SharedLogoSection both render in the same inspector, writing to different fields (`logoOverride` vs `showLogo/logoX/logoY/logoSize`). One set of controls is likely disconnected from the renderer. **Fix**: Remove LogoPositionSection and unify on SharedLogoSection, or vice versa.

2. **Before/After: Logo position data type mismatch** — Custom inline logo controls write `logoX`/`logoY` as 0.0–1.0 fractions, but SharedSlideFields and LogoOverlay expect 0–100 integers. Logo renders at wrong position. **Fix**: Convert Before/After to use SharedLogoSection, or fix the value mapping.

3. **Before/After: Logo size range exceeds spec** — Custom slider goes 0.5–8.0 but LogoOverlay and SharedSlideFields cap at 0.5–4.0. **Fix**: Align range or convert to SharedLogoSection.

### Medium (missing but not broken — 18 issues)

4. **13 slides missing SharedSectionLabelToggle** — Cover, Objective, Investment, Why Us, Scope Overview, Before/After, Scope Breakdown, Risk Brief, Process, Closing, Visual Inspiration, Client Testimonials, Design-Build Advantage. **Fix**: Add SharedSectionLabelToggle to all slides that render a section label.

5. **Scope Overview: 2 color pickers not using BrandingColorRow** — `titleColor` and `copyColor` use raw `<input type="color">`. **Fix**: Replace with BrandingColorRow.

6. **Before/After: 2 color pickers not using BrandingColorRow** — `headingColor` and `captionColor` use raw `<input type="color">` + hex text input. **Fix**: Replace with BrandingColorRow.

7. **Closing Slide: backgroundColor not using BrandingColorRow** — Uses raw `<input type="color">`. **Fix**: Replace with BrandingColorRow.

8. **Why Us: Missing SharedCardStyleSection** — Has card-based layouts (editorial-cards) but no card styling controls. **Fix**: Add SharedCardStyleSection.

9. **Objective: Missing overlay control** — blueprint-overlay layout uses photo backgrounds but no overlay opacity control. **Fix**: Add SharedOverlaySection conditionally for photo layouts.

10. **Cover: Overlay section shows for non-photo layouts** — SharedOverlaySection appears even for split-editorial and split-dark-editorial which don't have photo backgrounds. **Fix**: Conditionally show only for hero-image, right-panel-overlay, bottom-card-overlay layouts.

11. **Closing: Overlay section shows for light-logo-centered layout** — This layout has no photo background. **Fix**: Conditionally show only for dark-centered and photo-white-card layouts.

12. **Objective: headlineColor field collision** — Both ObjectiveContent and SharedSlideFields define `headlineColor` with different defaults (#ffffff vs #1B2A4A). **Fix**: Rename the Objective-specific one or ensure clear precedence.

### Polish (ordering, labeling, UX improvements — 8 issues)

13. **Investment: Table Style section order** — Appears before Typography. Should be after per standard order. **Fix**: Move Table Style section after Logo section.

14. **Before/After: Custom controls mixed with content** — Custom typography and logo controls appear before room/photo selectors, breaking the expected flow. **Fix**: Refactor to use SharedLogoSection and move shared controls to standard position.

15. **Cover: LogoPositionSection nests shared sections** — Typography, Overlay, Logo, and Accent are all called from within LogoPositionSection instead of from CoverInspector directly. **Fix**: Move shared section calls to CoverInspector body.

16. **Label inconsistency: "Size" vs "Title Size" vs "Headline Size"** — Custom slides use different labels for the same concept. **Fix**: Standardize to "Headline Size" for all headline size controls.

17. **Label inconsistency: "Caption Size" vs "Body Text Size" vs "Copy Size"** — **Fix**: Standardize to "Body Text Size" for all body-level text size controls.

18. **Label inconsistency: "Color" vs "Heading Color" vs "Headline Color" vs "Title Text Color"** — **Fix**: Standardize to "Headline Color" for headline color and "Body Text Color" for body text color.

19. **Visual Inspiration: Overlay on masonry-grid** — Overlay control shows for all layouts but masonry-grid may not use photo overlay. Minor. **Fix**: Consider conditional visibility.

20. **Before/After: Missing "Logo managed in Settings" link** — Custom logo section doesn't include the settings link present in SharedLogoSection. **Fix**: Add link or convert to SharedLogoSection.

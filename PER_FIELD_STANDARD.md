# Per-Field Control Standard

Standardized per-field control pattern for the HHI Builders deck editor.
Read this document at the start of every batch prompt to ensure consistency
across all 17 slide types.

---

## 1. Overview

Every text field in every slide inspector gets the same stack of controls
directly beneath it. There are no separate "Headline Style" or "Typography"
sections scattered elsewhere in the inspector — all controls for a field
live with that field.

This applies to:
- Every slide type (all 17)
- Every text field (headline, subheadline, statement, description, etc.)
- Every card item title and description (core values, COPE items, etc.)
- Every repeating element (bullets, steps, phases, etc.)

Cover and Objective slides are already implemented and serve as the
reference implementation.

---

## 2. The Standard Control Stack

Every text field gets these 6 controls in this exact order:

### 2.1 Text Input or Textarea

- The actual content field (already exists on all slides)
- Full width
- Label above input as small ALL-CAPS sub-header (e.g. "HEADLINE")

### 2.2 Font Family Dropdown

- Uses `SLIDE_FONTS` from `lib/slide-constants.ts`
- Shows all 10 fonts with display labels:
  - Classic Serif (Cormorant Garamond, serif)
  - Refined Serif (Playfair Display, serif)
  - Editorial Bold (DM Serif Display, serif)
  - Architectural (Libre Baskerville, serif)
  - Warm Humanist (Lora, serif)
  - Luxury Minimal (Raleway, sans-serif)
  - Clean Sans (Jost, sans-serif)
  - Modern Sans (Inter, sans-serif)
  - Geometric (Geist Sans, sans-serif)
  - Monospace (Geist Mono, monospace)
- Full width dropdown below the text input
- **Defaults by field type:**
  - Headline fields: Classic Serif (Cormorant Garamond)
  - Body/description fields: Clean Sans (Jost)
  - Label/section fields: Clean Sans (Jost)
  - Card title fields: Classic Serif (Cormorant Garamond)
  - Card description fields: Clean Sans (Jost)

### 2.3 Font Size Slider

- Range: 0.5 to 4.0, step: 0.1
- Display current value beside slider (e.g. "1.5x")
- Tick mark labels at these positions:
  - 0.5 = XS
  - 1.0 = S
  - 1.5 = M
  - 2.0 = L
  - 3.0 = XL
  - 4.0 = Display
- **Defaults by field type:**
  - Headline fields: 2.0 (L)
  - Subheadline fields: 1.0 (S)
  - Body/description fields: 1.0 (S)
  - Card title fields: 1.2 (between S and M)
  - Card description fields: 0.9 (between XS and S)
  - Section label fields: 0.8 (between XS and S)
  - Footer/fine print fields: 0.7

### 2.4 Style Button Group [B] [I] [U]

- Three compact buttons in a horizontal row
- B = Bold (font-weight: 700)
- I = Italic (font-style: italic)
- U = Underline (text-decoration: underline)
- Each button: 28px x 28px minimum touch target
- Active state: filled navy (#1B2A4A) background, white label
- Inactive state: white background, navy border, navy label
- Buttons are toggles — click to activate, click again to deactivate
- **Defaults by field type:**
  - Headline fields: Bold ON, Italic OFF, Underline OFF
  - Card title fields: Bold ON, Italic OFF, Underline OFF
  - All other fields: Bold OFF, Italic OFF, Underline OFF

### 2.5 Color Picker

- Uses `BrandingColorRow` component from `components/ui/BrandingColorRow.tsx`
- First row: branding color swatches from branding settings
- Below swatches: hex color input
- Reset button restores field default color
- **Defaults by field type:**
  - Headline fields on light backgrounds: #1B2A4A (navy)
  - Headline fields on dark backgrounds: #FFFFFF (white)
  - Body fields on light backgrounds: #4A5568 (muted navy)
  - Body fields on dark backgrounds: #E2E8F0 (light gray)
  - Card title fields: #1B2A4A (navy)
  - Card description fields: #4A5568 (muted navy)
  - Section label fields: use resolvedAccent (gold default #B8860B)
  - Footer fields: #6B7280 (muted gray)

### 2.6 Outline Toggle

- Uses `OutlineRow` component (already exists in codebase)
- Enables/disables text outline on the field
- Outline color defaults to white on dark backgrounds, navy on light backgrounds
- Default: OFF for all fields unless previously enabled

---

## 3. TypeScript Field Naming Convention

All new fields added to slide content interfaces in `app/lib/deck/types.ts`.

### Simple text fields

For a field named `headline`:

```ts
headlineFont?: string           // font family value string
headlineSize?: number           // 0.5-4.0 multiplier
headlineBold?: boolean          // default: true for headlines
headlineItalic?: boolean        // default: false
headlineUnderline?: boolean     // default: false
headlineColor?: string          // hex color string
headlineOutline?: string        // outline color hex, null = no outline
```

For a field named `description`:

```ts
descriptionFont?: string
descriptionSize?: number
descriptionBold?: boolean       // default: false
descriptionItalic?: boolean     // default: false
descriptionUnderline?: boolean  // default: false
descriptionColor?: string
descriptionOutline?: string     // outline color hex, null = no outline
```

### Card item arrays

For card items with index (e.g. core value card):

```ts
values: Array<{
  id: string
  name: string
  description: string
  nameFont?: string
  nameSize?: number
  nameBold?: boolean            // default: true
  nameItalic?: boolean
  nameUnderline?: boolean
  nameColor?: string
  nameOutline?: string
  descriptionFont?: string
  descriptionSize?: number
  descriptionBold?: boolean
  descriptionItalic?: boolean
  descriptionUnderline?: boolean
  descriptionColor?: string
  descriptionOutline?: string
  // ... other existing fields
}>
```

### Rules

- All new fields are optional with `?` — never required
- Always fall back to sensible defaults in the slide component if the field is not set (undefined/null)
- Use `| null` on fields that need explicit null (matching existing convention in ObjectiveContent)

---

## 4. Slide Component Implementation

How slide components (e.g. `CoreValuesSlide.tsx`) should read and apply per-field values.

### Pattern for a headline element

```tsx
const headlineFontFamily = content.headlineFont
  ?? SLIDE_FONTS.defaults.headline;
const headlineFontSize = content.headlineSize ?? 2.0;
const headlineStyle: React.CSSProperties = {
  fontFamily: headlineFontFamily,
  fontSize: `${headlineFontSize}em`,
  fontWeight: content.headlineBold !== false ? 700 : 400,
  fontStyle: content.headlineItalic ? 'italic' : 'normal',
  textDecoration: content.headlineUnderline ? 'underline' : 'none',
  color: content.headlineColor ?? '#1B2A4A',
  textShadow: makeOutlineShadow(content.headlineOutline),
};

// Applied as:
<h1 style={headlineStyle}>{content.headline}</h1>
```

### Pattern for card item fields (array)

```tsx
{content.values.map((value, index) => {
  const nameFontFamily = value.nameFont
    ?? SLIDE_FONTS.defaults.headline;
  const nameStyle: React.CSSProperties = {
    fontFamily: nameFontFamily,
    fontSize: `${value.nameSize ?? 1.2}em`,
    fontWeight: value.nameBold !== false ? 700 : 400,
    fontStyle: value.nameItalic ? 'italic' : 'normal',
    textDecoration: value.nameUnderline ? 'underline' : 'none',
    color: value.nameColor ?? '#1B2A4A',
    textShadow: makeOutlineShadow(value.nameOutline),
  };
  return <h3 key={value.id} style={nameStyle}>{value.name}</h3>;
})}
```

### Important rules

- Always use `??` (nullish coalescing) not `||` for defaults so that empty string and `0` are treated as valid values
- `headlineBold !== false` (not `headlineBold === true`) so that `undefined` defaults to bold for headline fields
- Never hardcode font families — always read from content field with `SLIDE_FONTS` fallback
- Apply all 6 style properties together as a single style object — never partially apply them
- Use the existing `makeOutlineShadow()` helper for outline rendering (multi-shadow approach)

---

## 5. Inspector Panel Implementation

How inspector panels should render the per-field control stack.

### Visual grouping

Each field group has:
- Small ALL-CAPS sub-header label (e.g. "HEADLINE")
- Subtle divider line separating it from the previous field group
- All 6 controls stacked vertically below the label
- 8px gap between controls within the group
- 20px gap (divider) between field groups

### Code pattern for each field group

```tsx
{/* ── HEADLINE ─────────────────────────────────── */}
<SectionLabel>Headline</SectionLabel>

{/* Text input */}
<FieldGroup label="Text">
  <TextInput
    value={slide.headline ?? ''}
    onChange={(v) => onUpdate({ ...slide, headline: v })}
    placeholder="e.g. Project Objective"
  />
</FieldGroup>

{/* Font family */}
<FieldGroup label="Font">
  <FontSelect
    value={content.headlineFont ?? SLIDE_FONTS.defaults.headline}
    onChange={(v) => updateContent({ headlineFont: v })}
  />
</FieldGroup>

{/* Font size slider */}
<FieldGroup label={`Size — ${(content.headlineSize ?? 2.0).toFixed(1)}x`}>
  <SizeSlider
    value={content.headlineSize ?? 2.0}
    onChange={(v) => updateContent({ headlineSize: v })}
  />
</FieldGroup>

{/* B / I / U buttons */}
<StyleButtons
  bold={content.headlineBold}
  italic={content.headlineItalic}
  underline={content.headlineUnderline}
  onBold={(v) => updateContent({ headlineBold: v })}
  onItalic={(v) => updateContent({ headlineItalic: v })}
  onUnderline={(v) => updateContent({ headlineUnderline: v })}
/>

{/* Color picker */}
<div style={{ marginTop: 8 }}>
  <FieldGroup label="Color">
    <BrandingColorRow
      branding={branding}
      value={content.headlineColor}
      defaultVal="#1B2A4A"
      onChange={(v) => updateContent({ headlineColor: v })}
      onReset={() => updateContent({ headlineColor: null })}
    />
  </FieldGroup>
</div>

{/* Outline toggle */}
<FieldGroup label="Outline">
  <OutlineRow
    value={content.headlineOutline}
    onChangeFn={(v) => updateContent({ headlineOutline: v })}
  />
</FieldGroup>

{groupDivider}
```

### Helper components

The Objective inspector defines reusable helpers that should be extracted
or re-defined in each inspector:

- `FontSelect` — dropdown with all 10 fonts from `SLIDE_FONTS`
- `SizeSlider` — range 0.5-4.0 with tick labels (XS/S/M/L/XL/Display)
- `StyleButtons` — B/I/U toggle buttons with active/inactive state
- `OutlineRow` — None button + color picker for text outline

### Card item arrays

For card item arrays, the same pattern applies but reads from and writes
to the array item:

```tsx
updateContent({
  values: content.values.map((v, i) =>
    i === index ? { ...v, nameFont: newFont } : v
  )
})
```

---

## 6. What Does NOT Get Per-Field Controls

Fields that should NOT get the full 6-control stack:

- **Toggle fields** (show/hide booleans) — no typography controls
- **Number fields** (amounts, counts, percentages) — no typography controls
- **Date fields** — no typography controls
- **Photo/image picker fields** — no typography controls
- **Dropdown selector fields** — no typography controls
- **URL fields** — no typography controls
- **Section Label field** — gets font dropdown and color only:
  - No size slider (size controlled by `SECTION_LABEL_SIZE` constant)
  - No B/I/U (section labels are always uppercase small caps)

---

## 7. Batch Application Order

Each batch prompt should apply the per-field pattern to the listed slides.

### Batch 1 — Simple text slides
- Scope Overview
- Scope Breakdown
- Our Process

### Batch 2 — Card-based slides
- Core Values
- COPE Page
- Design-Build Advantage
- Risk Brief

### Batch 3 — Data and timeline slides
- Investment
- Project Timeline
- Next Steps

### Batch 4 — Media and testimonial slides
- Before/After
- Visual Inspiration
- Client Testimonials

### Batch 5 — CTA and closing slides
- Design Retainer
- Why Us
- Closing

**Note:** Cover and Objective are already done and serve as the reference
implementation. Read their inspector and slide component code before
starting each batch to understand how the pattern was applied in practice.

---

## 8. Reference Implementation Files

Read these files before starting any batch:

### Inspector reference
- `app/admin/projects/[id]/deck/InspectorPanel.tsx` — find the
  `ObjectiveInspector` and Cover inspector sections to see the
  per-field pattern in a complete implementation

### Slide component reference
- `app/admin/projects/[id]/deck/slides/ObjectiveSlide.tsx`
- `app/admin/projects/[id]/deck/slides/CoverSlide.tsx`

### Shared components
- `components/ui/BrandingColorRow.tsx` — color picker with branding swatches
- `components/slides/shared/LogoOverlay.tsx` — logo overlay
- `app/lib/slide-constants.ts` — `SLIDE_FONTS`, `SECTION_LABEL_SIZE`, all constants
- `app/lib/deck/types.ts` — `SharedSlideFields`, all content interfaces

---

## 9. Quality Checklist

Verify before completing each batch:

For each slide in the batch confirm:

- [ ] Every text field has all 6 controls in the correct order
- [ ] Font dropdown uses `SLIDE_FONTS` from `slide-constants.ts`
- [ ] Size slider range is 0.5-4.0 step 0.1 with tick labels
- [ ] B/I/U buttons show correct active/inactive states
- [ ] Bold defaults correctly (ON for headlines, OFF for body)
- [ ] Color picker uses `BrandingColorRow` with reset button
- [ ] Outline toggle uses `OutlineRow` component
- [ ] All new TypeScript fields follow naming convention from Section 3
- [ ] Slide component reads all new fields with `??` fallbacks
- [ ] No hardcoded font families remain in the slide component
- [ ] Card item arrays apply per-item field controls correctly
- [ ] `tsc --noEmit` passes with zero errors

# Cover Generation – Deliverables

## Summary

- **Cover invariant**: `project.coverHeroImageId` always points to a Media row with `type=RENDERING`, `kind=COVER`, `roomId=null`. Non-rendering and room renderings cannot be set as the cover.
- **Front Page** can pick cover **sources** from: Front Page Photos, Section Existing Photos, Section Rendered Photos. Selecting one sets `activeSourceMediaId`. "Update (Render New)" creates a new COVER rendering from any of these sources.
- **Versions UI** on Front Page matches room Rendered Photos: one box per source (Concept grouping), with controls: Selected for Proposal, Clear Selected, Update (Render New), Download, Delete.
- **Unassigned** filters by `placement=UNASSIGNED` and "Assign to…" includes **Front Page**; moving to Front Page sets `placement=FRONT_PAGE` and `roomId=null` so items leave Unassigned.

---

## File list (changed/added)

| Path | Change |
|------|--------|
| `prisma/schema.prisma` | Added `MediaPlacement` enum and `placement` on `Media`; index `[projectId, placement]`. |
| `prisma/migrations/20260301133602_add_media_placement/migration.sql` | Create enum, add column, backfill `SECTION` where `roomId IS NOT NULL`, create index. |
| `app/admin/projects/[id]/media/actions.ts` | Cover invariant in `setProjectHeroMediaAction`; `startHeroRenderAction` accepts any source; `createMediaAction` placement + FRONT_PAGE; `updateMediaRoomAction` placement (FRONT_PAGE/SECTION/UNASSIGNED); `setHeroAction` no longer sets `coverHeroImageId`. |
| `app/admin/projects/[id]/media/front-page-hero-editor.tsx` | Eligible sources = Front Page + Section Existing + Section Rendered; versions grouped by source (concept boxes); no “set cover” on source; `handleUpdateForSource`; Front Page upload sets `placement=FRONT_PAGE`. |
| `app/admin/projects/[id]/media/media-tab.tsx` | Unassigned filter uses `placement=UNASSIGNED` (with legacy fallback); “Assign to…” includes “Front Page”; `handleMoveToFrontPage` passes `"FRONT_PAGE"`. |
| `app/admin/projects/[id]/presentation/page-editor.tsx` | Cover hero picker shows only COVER renderings (no Existing). |
| `app/admin/projects/[id]/presentation/actions.ts` | `savePresentationLayoutAction` syncs `project.coverHeroImageId` from `config.pages.cover.heroMediaId` when it’s a valid COVER rendering; clear when hero is cleared. |
| `docs/COVER_GENERATION_DELIVERABLES.md` | This file. |

---

## Migration command

From project root:

```bash
npx prisma migrate deploy
```

For a fresh dev DB:

```bash
npx prisma migrate dev
```

Backfill in the migration: rows with `roomId IS NOT NULL` get `placement = 'SECTION'`; others stay `UNASSIGNED`. Front Page uploads and “Move to Front Page” set `placement = 'FRONT_PAGE'`.

---

## 3-step test checklist

### 1) Cover invariant and Front Page sources

- [ ] **Media → Front Page**: Upload a Front Page photo. Select it as source; click “Update (Render New)” to create a COVER version.
- [ ] **Media → Front Page**: In a room that has Existing or Rendered photos, ensure those appear in “Cover sources” (with room label). Select a section photo as source and run “Update (Render New)”; a new COVER version is created from that source.
- [ ] **Selected for Proposal**: In a concept box, click “Selected for Proposal” on a completed version. Confirm `project.coverHeroImageId` points to that COVER media (e.g. draft/preview shows it). Try setting cover to a **source** (e.g. “Set as proposal cover” on the Before image); that path is removed—only versions can be selected.
- [ ] **Presentation → Cover**: Hero Image picker shows only COVER renderings. Select one and save; confirm `project.coverHeroImageId` updates (and matches the selected hero when it’s a valid COVER).

### 2) Versions UI and controls

- [ ] **Concept grouping**: Create COVER versions from two different sources (e.g. one Front Page photo, one section photo). Confirm two separate boxes (“From: Front Page”, “From: Kitchen”) with their own version thumbnails.
- [ ] **Controls**: In each box use: “Selected for Proposal”, “Clear Selected”, “Update (Render New)” (when &lt; 3 versions), “Download”, “Delete”. Confirm behavior matches the room Rendered Photos pattern (one box per source, same actions).

### 3) Unassigned and Front Page placement

- [ ] **Unassigned**: Add a new upload without assigning a room (or use existing unassigned media). Confirm it appears under “Unassigned Media”.
- [ ] **Assign to Front Page**: In Unassigned, choose “Front Page” in “Assign to…” and click Assign (or use “Move to Front Page Photos”). Confirm the item disappears from Unassigned and appears in Front Page “Cover sources” (project-level, `roomId` null, `placement=FRONT_PAGE`).
- [ ] **Front Page uploads**: Upload via “Upload Front Page Photo(s)”. Confirm those items do **not** appear in Unassigned (they have `placement=FRONT_PAGE`).

---

## Optional: Placement enum (implemented)

- **Schema**: `Media.placement` enum `SECTION | FRONT_PAGE | UNASSIGNED` (default `UNASSIGNED`).
- **Backfill**: Migration sets `placement = 'SECTION'` where `roomId IS NOT NULL`.
- **Front Page uploads**: `createMediaAction` with `placement=FRONT_PAGE` when uploading from Front Page.
- **Unassigned**: Filter `placement === 'UNASSIGNED'` (with fallback when `placement` is missing).
- **Assign to Front Page**: “Assign to…” includes “Front Page”; assigns `roomId=null` and `placement=FRONT_PAGE` so the item leaves Unassigned.

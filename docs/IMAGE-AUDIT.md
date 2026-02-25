# next/image Audit – Prevent "Invalid src prop hostname is not configured"

## 1) Files where next/image is used and URL origins

| File | Usage | URL origin |
|------|--------|------------|
| `app/admin/projects/[id]/media/media-tab.tsx` | Hero image (1), MediaGrid items (2), UnassignedRow (3) | `MediaItem.url` from DB (project media); values can be R2 public URL (`pub-*.r2.dev` or custom domain), legacy `blob.vercel-storage.com`, placeholder (e.g. placehold.co), or empty. |

**No other files use `next/image`.**  
`draft-proposal-view.tsx` and `proposal-from-snapshot.tsx` render cover/room images with plain `<img>` and already guard with `isBadPlaceholderUrl`.

---

## 2) Confirmation: no code path passes a bad URL to `<Image>`

- **media-tab.tsx** (all three `<Image>` call sites):
  1. **Hero**: Renders placeholder div if `isBadPlaceholderUrl(hero.url)`; else `<img>` if `isLegacyBlobUrl(hero.url)` or `!isAllowedHostForNextImage(hero.url)`; else `<Image src={hero.url}>`.
  2. **MediaGrid**: Same logic with `m.url`.
  3. **UnassignedRow**: Same logic with `media.url`.

- **Guards used:**
  - `isBadPlaceholderUrl(url)`: true for empty/null/blank and known placeholder hosts (placehold.co, via.placeholder.com, dummyimage.com) → never passed to `<Image>`.
  - `isLegacyBlobUrl(url)`: true for `blob.vercel-storage.com` → rendered with `<img>` per requirement.
  - `isAllowedHostForNextImage(url)`: true only for allowlisted hostnames (and relative/blob handled separately) → `<Image>` is used only when this is true.

So **no code path** can call `<Image src={...}>` with a blank, placeholder, or unconfigured remote hostname.

---

## 3) next.config.ts remotePatterns

- **Before:** `pub-2d4238639a274f32ba8641274e00f39c.r2.dev` only.
- **After:** Added `media.hhi-builders.com` for custom media domain.  
- **Runtime:** `app/lib/media.ts` defines `ALLOWED_IMAGE_HOSTS`; `isAllowedHostForNextImage()` uses it so any URL not in the list is rendered with `<img>` instead of `<Image>`, avoiding hostname errors if a new host is used before updating next.config.

---

## 4) Helper / wrapper

- **app/lib/media.ts**
  - `isBadPlaceholderUrl(url)` – do not use URL for next/image or img; show "No image" placeholder.
  - `isAllowedHostForNextImage(url)` – safe to pass to next/image only when true (and not legacy blob).
- **media-tab.tsx**
  - `isLegacyBlobUrl(url)` – use `<img>` for blob.vercel-storage.com (legacy behavior).

No other wrapper components around next/image were found.

---

## 5) Media uploads – multi-select

Media tab (Existing Photos and Renderings per room) supports selecting and uploading **multiple images at once**. The file input uses `multiple` and `accept="image/*"`. Files are uploaded sequentially with progress ("Uploading 3/8…"); the list is refreshed once after all uploads; a summary is shown for successes and any per-file failures (with filenames). Single-file selection still works as before. Hero upload remains single-file only.

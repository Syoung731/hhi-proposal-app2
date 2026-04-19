# Legacy Preview/Publish + Vibe Renderer Audit
Date: 2026-04-19

## Executive Summary

Most of the existing publish/preview/PDF infrastructure is **functional but legacy-shaped** — it operates on the old data model (Project + Rooms + Media + InvestmentLineItems + TimelinePhases) and has **zero awareness of the new `ProposalDeck` / `DeckSlide` models**. Specifically: (a) the `Publish` action and `PublishedSnapshot` versioning model already do exactly what the new "version-lock when sent" requirement needs, but the snapshot payload doesn't include deck slides; (b) the Playwright-based PDF route is generic and trivially repointable at any URL; (c) the `/p/[id]` public route tree is the current Vibe surface (the Publish tab links to `/p/[id]?mode=present&draft=1` as "Open fullscreen draft preview"), but every page renders legacy data via `components/public/*`, not the deck. There is **no email infrastructure of any kind** in the repo (no nodemailer / resend / sendgrid / googleapis / google-auth-library), and the `Employee` model has no fields for OAuth tokens, send timestamps, or service-account delegation. **Recommendation: hybrid** — extend the snapshot/versioning + PDF + Publish UI to carry deck data, sunset the legacy `/admin/.../presentation` editor tab in favor of the Deck Builder, build a single new deck-render public route (replacing the page-by-page `/p/[id]/cover|objective|...` tree), and greenfield the email path using Google Workspace Domain-Wide Delegation.

---

## 1. Preview & Publish Tab

### Files
- [app/admin/projects/[id]/preview/page.tsx](app/admin/projects/[id]/preview/page.tsx) — Admin preview surface.
- [app/admin/projects/[id]/publish/publish-tab.tsx](app/admin/projects/[id]/publish/publish-tab.tsx) — UI with confirm modal.
- [app/admin/projects/[id]/publish/actions.ts](app/admin/projects/[id]/publish/actions.ts) — `publishProjectAction` server action.

### What works
- **Publish flow is real and operational.** `publishProjectAction` reads the live Project + Rooms + Media + TimelinePhases + InvestmentLineItems, builds a `SnapshotData` JSON payload, and writes it to `PublishedSnapshot` with a monotonically increasing `version` (handled in a single `prisma.$transaction`). It also flips `Project.status` to `PUBLISHED`, bumps `Project.publishedVersion`, upserts a `Proposal` row with `isPublic: true`, and revalidates `/p/${proposal.id}` and `/p/${proposal.id}/pdf`.
- **Preview tab reads from the snapshot, not live data.** [preview/page.tsx](app/admin/projects/[id]/preview/page.tsx) loads the latest `PublishedSnapshot` and renders via `<ProposalPublicPage>`. If no snapshot exists, it shows a "Go to Publish" CTA — sensible empty state.
- **Draft preview link** in Publish tab opens `/p/${proposalId}?mode=present&draft=1` in a new tab (the Vibe view).
- The "Share link" displayed to the user is `/p/${proposalId}` — that's the public-facing URL.

### Data shape
The snapshot is the **legacy shape** — see [actions.ts:37-77](app/admin/projects/[id]/publish/actions.ts:37):

```
SnapshotData {
  version, project (title/subtitle/address/clients/coverHeroImageId/objective),
  rooms[], media[], timelinePhases[], investmentLineItems[]
}
```

**No `DeckSlide` data is captured.** The new Deck Builder is invisible to the publish action.

### Salvageability
- The publish UX (confirm modal, version display, share link, draft preview link) is solid and reusable.
- The snapshot transaction pattern is exactly the "frozen version when sent to client" model the human asked for — `version` is already monotonic, `@@unique([projectId, version])` already enforced.
- Trivial wiring change: extend the `SnapshotData` payload to include serialized deck slides, and the existing flow continues to work.

---

## 2. /admin/projects/[id]/presentation (Vibe surface?)

### Files
- [app/admin/projects/[id]/presentation/page.tsx](app/admin/projects/[id]/presentation/page.tsx)
- [app/admin/projects/[id]/presentation/presentation-tab.tsx](app/admin/projects/[id]/presentation/presentation-tab.tsx) (~600 LOC client component)
- [app/admin/projects/[id]/presentation/actions.ts](app/admin/projects/[id]/presentation/actions.ts)
- ...plus 8 sibling files (page-list, page-editor, settings-tab, section-page-editor, additional-sections-editor, types, slide-preview-frame, why-us/WhyUsContentEditor)

### What it actually is
**Not a renderer. Not a Vibe surface. It's a config-editor admin tab** that lets you pick which rooms get section pages on the legacy `/p/[id]` site, choose layout variants (split / templateA / templateB / templateC), pick a featured concept render per room, configure the Why Us page, set rollup behavior for "Additional Sections," and toggle which rooms publish. All of this writes to `Proposal.publicLayoutConfig` (a Json column) — see [presentation/actions.ts:71-131](app/admin/projects/[id]/presentation/actions.ts:71).

The Vibe presentation itself is rendered at `/p/[id]?mode=present` (see Section 3).

### Salvageability
- **Low.** Every concept this tab manages — page list, layout variants, section enable/disable, rollup config — is now expressed differently in the Deck Builder (`DeckSlide` rows with `type` + `layoutKey` + `content` JSON, ordered by `order`, with `isUserHidden` for enable/disable).
- The two systems express the same intent in different shapes. Trying to bridge them would be more work than just sunsetting this tab once the deck is the source of truth.

---

## 3. /p/[id] Public Proposal Routes

### Files (17 total)
```
app/p/[id]/
├── layout.tsx                  ← loads snapshot via getProposalSnapshotForViewer, wraps in ProposalShell
├── page.tsx                    ← redirects to /cover
├── ProposalContext.tsx         ← React context with snapshot + sections + layoutConfig + presentationSettings
├── cover/page.tsx
├── objective/page.tsx
├── difference/page.tsx         ← "Why Us"
├── scope/page.tsx
├── scope/[roomSlug]/page.tsx
├── section/[roomId]/page.tsx
├── additional-sections/page.tsx
├── timeline/page.tsx
├── investment/page.tsx
├── next-steps/page.tsx
├── closing/page.tsx
├── view-v2/page.tsx            ← experimental composer
├── pdf/route.ts                ← Playwright PDF (see Section 4)
└── [pageId]/page.tsx           ← catch-all → notFound()
```

### Architecture
- **It IS the Vibe surface today.** ProposalShell wraps everything in `PresentationFrame` and adds `ProposalDrawerNav`, `ProposalProgressDots`, `ProposalPrevNext`. The "present" mode is toggled via `?mode=present` query param OR a localStorage flag (`proposal-present-mode`). See [components/public/ProposalShell.tsx:1-40](components/public/ProposalShell.tsx).
- `/p/[id]` redirects to `/p/[id]/cover` — there is no consolidated single-page renderer.
- Each subroute is a standalone page that pulls the snapshot from React context (or directly via `getPublicProposalSnapshot`) and renders its own slice via shared `components/public/*` (CoverRenderer, etc.).
- **Snapshot loading dual-pathway** (in [app/lib/public-proposal.ts:55-153](app/lib/public-proposal.ts:55)):
  - `getProposalSnapshotForViewer` returns the latest `PublishedSnapshot` if proposal is public.
  - **Admin draft fallback:** if no snapshot exists, but the viewer is admin, it builds a synthetic snapshot from live project data (this is what `?draft=1` exercises). Non-admins get null → 404.
- Section pages are dynamic by `roomId` — `/p/[id]/section/[roomId]/page.tsx`. The Scope route also has `/p/[id]/scope/[roomSlug]/page.tsx` for slug-based access.
- The `[pageId]` catch-all is a defensive 404 for unknown segments — not a generic page renderer.

### What renders the new deck?
**Nothing in `/p/[id]`.** A grep for `DeckSlide|ProposalDeck` returns ZERO matches under `app/p/` or `components/`. The deck (`prisma/schema.prisma:875` `DeckSlide`, plus `ProposalDeck`) is rendered exclusively in the admin Deck Editor at [app/admin/projects/[id]/deck/page.tsx](app/admin/projects/[id]/deck/page.tsx). No public surface knows about it.

### `/p/[id]/view-v2`
- A **separate experimental render path.** Loads the same snapshot, but renders via `ProposalViewV2Composer` (`components/proposals/v2/`) using a "page-composer system with DEV-ONLY builder UI." The page comments say _"TODO: Replace getMockProposalPages() with real config for persistence."_
- Not linked from the publish tab. Appears to be a half-finished alternate composer that didn't ship. Independent of `/p/[id]/cover|objective|...`.
- There is also `/proposals/[proposalId]/view-v2/page.tsx` (a sibling under a different route family) — again, experimental v2 surface.

### Versioning / snapshot semantics
- `/p/[id]` always reads the **latest** `PublishedSnapshot` (orderBy `version` desc, take 1). There is no concept of "this URL shows v3" vs "v4" — re-publishing replaces what visitors see.
- This is a gap relative to the human's stated goal (client sees v3 even after Steve edits to v4). The data model supports per-version reads (see Section 5), but the routes don't.

### Salvageability
- **Low for direct extension to the new deck.** The page-by-page subroute structure is hardcoded around the legacy section list. Each subroute's content component reads legacy fields from snapshot.
- **Medium for shell reuse.** `ProposalShell`, `PresentationFrame`, `ProposalDrawerNav`, `ProposalProgressDots`, `ProposalPrevNext`, present-mode handling, hash-based deep-linking — these are general-purpose presentation chrome and could wrap a deck-slide renderer with light adapter work.
- The `getProposalSnapshotForViewer` admin-draft-fallback pattern is worth preserving in any new version-aware route.

---

## 4. /p/[id]/pdf PDF Export Route

### File
- [app/p/[id]/pdf/route.ts](app/p/[id]/pdf/route.ts) (66 lines)

### What it does
- Loads `Proposal` by id, requires `isPublic === true`, requires a `PublishedSnapshot` to exist — otherwise returns 404.
- Dynamically imports `playwright`, launches headless chromium with `--no-sandbox`, navigates to `${BASE_URL}/p/${id}?print=1`, calls `page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" } })`, returns the buffer with `Content-Type: application/pdf` and a `Content-Disposition: attachment` header.
- BASE_URL falls back through `NEXT_PUBLIC_APP_URL` → `https://${VERCEL_URL}` → `http://localhost:3000`.

### Output shape
- **A4 multi-page** (Playwright auto-paginates the rendered HTML).
- The PDF is whatever `/p/[id]?print=1` renders — i.e., the legacy `/p/[id]/cover` redirect target. The `?print=1` flag is consumed by `ProposalShell` / inner pages to disable interactive nav (worth verifying separately, but the convention is clear).
- Multi-page is determined by the rendered DOM length, not by explicit page-break logic.

### Limitations (visible)
- Hard-coded 30s `waitUntil: networkidle` timeout — could fail for image-heavy decks.
- No way to request a specific snapshot version — always renders whatever `/p/[id]` currently serves (i.e., the latest snapshot).
- Requires `playwright` installed at runtime (it's in `devDependencies` — would need to move to `dependencies` for Vercel/production).
- Single sandboxed chromium per request — no warm pool, could be slow on cold starts.

### Salvageability
- **High.** The engine is route-agnostic. To produce PDFs of the new deck, point this at a deck-render URL (e.g., `/proposals/[snapshotId]/deck-print` or similar). The Playwright wiring stays.

---

## 5. Data Model — Snapshot/Versioning Support

### `Proposal` ([schema.prisma:140-149](prisma/schema.prisma:140))
```
Proposal {
  id String @id @default(cuid())
  projectId String @unique          ← one proposal per project
  isPublic Boolean @default(false)
  publicLayoutConfig Json?          ← legacy presentation tab config
  ...
}
```

### `PublishedSnapshot` ([schema.prisma:344-354](prisma/schema.prisma:344))
```
PublishedSnapshot {
  id String @id @default(cuid())
  projectId String
  version Int
  snapshotJson Json
  createdAt DateTime @default(now())
  @@unique([projectId, version])
  @@index([projectId])
}
```

Plus `Project.publishedVersion: Int` (current cursor).

### What this gives us for the version-lock-on-send requirement
- ✅ **Versioning exists.** Every publish creates a new immutable row. Old versions are retained.
- ✅ **Frozen snapshot at publish time.** The full `SnapshotData` is serialized into `snapshotJson`, so even if the project is edited later, the historical row is unchanged.
- ❌ **No "Sent to Client" metadata.** Nothing on `PublishedSnapshot` indicates whether/when/to-whom a version was sent. No date, no recipient, no sender (Employee), no "this is the version the client has."
- ❌ **No way to address a specific version from the public route.** `/p/[id]` always reads `orderBy: { version: "desc" }, take: 1` ([public-proposal.ts:32-35](app/lib/public-proposal.ts:32)). To meet the human's "client sees v3 even when Steve edits to v4" goal, either (a) add a `Project.clientFacingVersion` cursor that publish increments only when the human says "send," or (b) introduce snapshot-id-addressed URLs (e.g., `/proposals/[snapshotId]`) so the link sent to the client never moves.

### Recommended additions (if extending, not rebuilding)
On `PublishedSnapshot`, add:
- `sentAt: DateTime?` — null until first send
- `sentByEmployeeId: String?` → `Employee.id` (FK, SetNull)
- `sentToEmail: String?` (or a small `SnapshotRecipient` join table if multiple recipients per send)
- `label: String?` (e.g., "Sent to Client" badge)
- `parentSnapshotId: String?` for explicit predecessor linking (optional)

On `Project`:
- `clientFacingVersion: Int?` — the version the public link should resolve to (nullable so the route can fall back to "latest" until first send).

### `Employee` ([schema.prisma:442-456](prisma/schema.prisma:442))
```
Employee {
  id, firstName, lastName, roleTitle, email (unique),
  phone, isActive, isAdmin, sortOrder, createdAt, updatedAt
}
```

**Confirmed: no email-auth metadata.** No OAuth refresh tokens, no service-account delegation flag, no last-sent-at, no per-user send quota. The model is purely a directory.

### Migration concerns
- Existing published proposals at `/p/[id]/...` continue to work — new fields would be additive nullable columns. No breaking migration required.
- No legacy data needs to be moved out of `PublishedSnapshot` — the legacy snapshot shape can coexist with future deck-aware snapshots (either by version-stamping the schema with a `snapshotJson.version` field or by adding a discriminator column).

---

## 6. Email Infrastructure Check

### Dependencies (all of [package.json](package.json) checked)
- ❌ `nodemailer` — not present
- ❌ `@sendgrid/mail` — not present
- ❌ `resend` — not present
- ❌ `postmark` — not present
- ❌ `mailgun-js` / `mailgun.js` — not present
- ❌ `googleapis` — not present
- ❌ `google-auth-library` — not present
- ❌ `@google-cloud/*` — not present
- ✅ `@google/genai` and `@google/generative-ai` — present, **but for AI generation only** (Gemini), not Workspace.

### Existing Google integrations (none Workspace-related)
- [app/integrations/gemini.ts](app/integrations/gemini.ts) — AI text/image generation
- [app/integrations/google-reviews.ts](app/integrations/google-reviews.ts) — Google Places reviews sync
- [app/integrations/google-places.ts](app/integrations/google-places.ts) — Places API for address autocomplete
- [app/api/google-reviews/sync/route.ts](app/api/google-reviews/sync/route.ts) — sync endpoint
- [app/api/settings/google-places-key/route.ts](app/api/settings/google-places-key/route.ts) — API key management

None of these establish a Workspace OAuth or service-account pattern that could be reused for Gmail send.

### Existing send / email handlers
- ❌ No "Send to Client" button anywhere — grep for `Send.*to.*Client|sendToClient|emailProposal|deliver.*proposal` returns zero matches.
- ❌ No `sendEmail`, `sendMail`, `mailer` helpers anywhere.

### Employees admin UI
- [app/admin/settings/employees-tab.tsx](app/admin/settings/employees-tab.tsx) — fully functional admin CRUD: name, role title, email, phone, active flag, admin flag. Uses `createEmployee` / `updateEmployee` / `toggleEmployeeActive` / `toggleEmployeeAdmin` / `deleteEmployee` from `actions.ts` (sibling).
- Backed by the `Employee` model (no email-auth fields).

### Domain-Wide Delegation feasibility
- The repo's only Google deps are AI-side. Adding `googleapis` + `google-auth-library` to dependencies is additive and would not conflict with existing `@google/genai` / `@google/generative-ai`.
- DWD requires: a Google Workspace service account, the Workspace admin (someone at hhi-builders.com) toggling domain-wide delegation in the Admin console, and adding the `gmail.send` scope to the service account's allowed scopes.
- Server-side flow at send time: load Employee by `email`, mint a JWT with `subject: employee.email`, exchange for an access token, call `gmail.users.messages.send` impersonating that employee. No per-user OAuth, no refresh-token storage. The user perception matches the human's stated goal: "from Dalton@hhi-builders.com" without picking a sender.
- Per-user OAuth fallback would require: Google OAuth client + redirect, store refresh token per Employee row, refresh-token rotation handling, consent screen UX.

---

## 7. Salvage Assessment Table

| Area | Usable As-Is for new deck (1-5) | Salvageable engine/infra (1-5) | Effort to wire new deck |
| --- | --- | --- | --- |
| 1. Preview & Publish tab | 4 — UX shell, confirm modal, version display, draft link all reusable | 5 — snapshot model + transaction is exactly right | **M** — extend `SnapshotData` to include deck slides; rest is unchanged |
| 2. `/admin/.../presentation` editor | 1 — manages legacy layout config that the deck doesn't use | 1 — concept-incompatible with `DeckSlide` rows | **XL** — better to sunset, deck editor replaces it |
| 3. `/p/[id]` public route tree | 1 for content, **3 for shell** — page-by-page rendering hard-codes legacy fields; nav chrome is reusable | 3 — `ProposalShell` + `PresentationFrame` + nav (drawer / dots / prev-next) + present-mode + hash deep-linking | **L** — replace inner page components with deck-slide renderer, keep shell |
| 4. PDF route | 4 — Playwright pipeline is route-agnostic | 5 — engine layer reusable as-is | **S** — point at new deck-render URL (still need to move `playwright` to `dependencies` for prod) |
| 5. Data model — snapshot/versioning | 4 — versioning + snapshot pattern correct | 4 — extend, don't replace | **S/M** — add `sentAt` / `sentBy` / `sentTo` on `PublishedSnapshot`; add `Project.clientFacingVersion` cursor; extend `snapshotJson` to carry deck data |
| 6. Email infrastructure | 1 — none exists | N/A — greenfield | **M** — add `googleapis` + `google-auth-library`, build send module, wire to Send-to-Client action; depends on Workspace admin enabling DWD |

---

## 8. Recommendation

### Overall approach: **Hybrid**

| Keep | Replace | Build new |
| --- | --- | --- |
| `PublishedSnapshot` model + publish transaction pattern | `/admin/.../presentation` editor (sunset; Deck Editor is the source of truth) | Email send module (DWD-based) |
| Publish UI shell (confirm modal, version display, draft preview link, share link) | Page-by-page `/p/[id]/cover|objective|...` route tree | Single deck-render public route (e.g., `/proposals/[snapshotId]`) for the version-locked URL |
| Playwright PDF engine (just repoint at new deck URL) | `getProposalSnapshotForViewer`'s "latest snapshot" semantics — make it version-aware via `Project.clientFacingVersion` | "Sent to Client" tracking columns on `PublishedSnapshot` |
| `ProposalShell` + `PresentationFrame` + nav chrome (drawer/dots/prev-next) — wraps the new deck renderer with light adapter | Legacy `Proposal.publicLayoutConfig` for new decks (still read for legacy `/p/[id]` viewers) | Email-auth metadata fields on `Employee` (none today) |

### First concrete step (recommended path)

**Extend `SnapshotData` to carry deck slides.**

Change [app/lib/snapshot.ts](app/lib/snapshot.ts) (the type) and [app/admin/projects/[id]/publish/actions.ts](app/admin/projects/[id]/publish/actions.ts) (the writer) to include serialized `ProposalDeck` + `DeckSlide` rows in `snapshotJson`. Add a new public route `app/proposals/[snapshotId]/page.tsx` that loads a specific snapshot by id (not by latest) and renders deck slides using existing slide components from `app/admin/projects/[id]/deck/slides/`.

**Estimated effort: 1–2 days** for that first step (data + route + minimum-viable slide renderer reuse). The Playwright PDF rewire is another half-day on top. Email integration is its own multi-day track once Workspace DWD is enabled.

### Snapshot/versioning model: **Extend existing**

`PublishedSnapshot` already gives us immutable versions. Add:

- `sentAt: DateTime?`, `sentByEmployeeId: String? → Employee`, `sentToEmail: String?` (or a `SnapshotRecipient` join), `label: String?`
- `Project.clientFacingVersion: Int?` (nullable cursor; route resolves to latest when null)
- Bonus: tag a `snapshotJson.schema: "v1-legacy" | "v2-deck"` discriminator so legacy and new snapshots coexist cleanly.

No need for a new model. The schema additions are additive nullable columns + one nullable int — single migration.

### Email send path: **Google Workspace Domain-Wide Delegation, with `Employee` as identity source**

- **Identity:** `Employee.email` is the single source of truth for who can send and from what address. No "pick a sender" dropdown — the logged-in user maps to an Employee row, the send uses that Employee's email as the impersonated subject.
- **Auth:** Domain-Wide Delegation. Single service account, configured once in Google Workspace Admin console (requires hhi-builders.com Workspace admin to grant `https://www.googleapis.com/auth/gmail.send` scope to the service account's client ID). Server mints a JWT per send with `sub: employee.email`, exchanges for token, calls `gmail.users.messages.send`. No per-user OAuth, no refresh-token storage to manage.
- **Required Employee additions for DWD path:** None strictly required to send — DWD does not store tokens per user. But for tracking/quotas, add: `lastSentAt: DateTime?`, `dailySentCount: Int @default(0)`, `dailySentResetAt: DateTime?` (or compute from a `SentLog` table).
- **Fallback to per-user OAuth** if DWD is blocked by hhi-builders.com Workspace admin: would require adding `gmailOauthRefreshToken: String?`, `gmailOauthScope: String?`, `gmailOauthUpdatedAt: DateTime?` to `Employee` plus an OAuth redirect flow at `/admin/settings/employees/[id]/connect-gmail`. This is the heavier path — recommend confirming DWD is feasible before building it.

---

## 9. Open Questions

1. **Old `/p/[id]/...` URLs — keep or break?** Existing `PublishedSnapshot` rows render fine through the legacy route tree. Once new decks publish to a new route (`/proposals/[snapshotId]`), do legacy URLs need to keep working in perpetuity (treat as immutable shipped artifacts), or is it OK to redirect them to the new viewer with a "this proposal has been migrated" notice? **Decision affects whether the legacy `components/public/*` and `app/components/presentation/*` stay maintained.**

2. **Vibe UX parity check.** The legacy `/p/[id]?mode=present` provides drawer nav, progress dots, prev/next, hash deep-linking, and present-mode toggle (localStorage-backed). Does the new Deck Builder have an equivalent set of presentation chrome, or does it need to inherit `ProposalShell`'s? **If yes to inheriting, the L-effort estimate above is realistic; if Deck Builder has its own already, it shrinks.**

3. **Per-salesperson branding / signature data.** Should the new email "from" line and PDF footer reflect the sending employee's signature (photo, contact block)? `Employee` has phone but no headshot, no signature HTML, no email-footer template. **Need to know if this is in scope before building, since it means more `Employee` fields.**

4. **`view-v2` route fate.** Both `/p/[id]/view-v2` and `/proposals/[proposalId]/view-v2` are half-finished experimental composers (DEV-ONLY builder UI, mock page config). Are these abandoned and should be deleted in a cleanup pass, or are they intentional scaffolding for the new deck-public-render route? **Worth confirming before either path proceeds.**

5. **PDF for unpublished drafts.** Today the PDF route 404s if there's no `PublishedSnapshot`. With the new "client-facing version" cursor, do we want a "preview PDF" path for admins on the current draft (e.g., `?draft=1` like the existing draft preview link)? Common ask in proposal tools.

6. **`playwright` in `devDependencies`.** Currently in `devDependencies`, but the PDF route uses it at runtime. Either it must be moved to `dependencies` for production, or the PDF route must be refactored to use a hosted browser service (Browserless, Playwright Cloud). **Worth verifying whether this currently works in production or has been broken since the last deploy.**

7. **Workspace admin access.** Domain-Wide Delegation for hhi-builders.com requires a Workspace admin (probably Steve or whoever has the super-admin role) to add the service account client ID + scopes in admin.google.com. **Confirm who that is and whether they'll grant access before building the email path.**

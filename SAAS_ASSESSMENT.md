# SaaS Readiness Assessment — HHI Proposal App

**Date:** 2026-04-08
**Assessor:** Claude (automated codebase audit)
**Codebase:** HHI Builders Proposal App (Next.js 16 / React / TypeScript / Prisma / PostgreSQL)
**Branch:** proposal-v2

---

## SECTION 1 — Multi-Tenancy Assessment

### Current State: Single-Tenant

The application is built as a **single-tenant internal tool** for HHI Builders. There is no concept of tenancy anywhere in the codebase.

#### Is there an Organization or Tenant model?

**No.** The schema has no `Organization`, `Tenant`, `Account`, or `Workspace` model. The closest analogs are two singleton models:

- **`CompanySettings`** — one row for the entire app instance (branding, logos, colors, defaults, AI model config)
- **`Company`** — one row used only for value pillars / "Why Us" defaults
- **`CompanyContext`** — one row for AI estimation context (market, finish tier, markup structure)

All three are explicitly documented as singletons (`findFirst` with auto-create-if-missing).

#### Are data models scoped to an organization?

**No model has an `organizationId` or `tenantId` field.** Every table is either:

1. **Project-scoped** (Room, Media, TimelinePhase, InvestmentLineItem, DeckSlide, AIEstimate, etc.) — scoped to a Project but Projects themselves have no tenant scope
2. **Global singletons** (CompanySettings, Company, CompanyContext) — shared across the entire instance
3. **Global libraries** (SectionType, RoomType, RoomTemplate, PricingCatalogItem, BrandIcon, BrandBackground, LibraryMedia, Testimonial, Employee, Integration) — shared across everything

#### Tables that should be per-tenant but are currently global

| Table | Current Scope | Risk |
|-------|--------------|------|
| `CompanySettings` | Singleton | Company A's logo would appear on Company B's proposals |
| `CompanyContext` | Singleton | Company A's market/pricing assumptions used for Company B |
| `Company` + `ValuePillar` | Singleton | Shared value propositions across tenants |
| `WhyUsDefaults` | Singleton | Shared "Why Us" content |
| `Employee` | Global | All companies would see each other's employees |
| `Integration` | Global | Shared JobTread credentials — Company A could use Company B's API keys |
| `Testimonial` | Global | Customer testimonials visible to all tenants |
| `SectionType` | Global | Pricing profiles shared — Company A's $50/SF kitchen rate applies to Company B |
| `RoomType` | Global | Room type pricing shared |
| `LibraryMedia` + `LibraryTag` | Global | Past-work photo library shared between competitors |
| `BrandIcon` + `BrandBackground` | Global | Brand assets shared |
| `PricingCatalogItem` | Global | Full cost/price catalog visible to all tenants |
| `RoomTemplate` | Global | Templates shared |
| `StylePreset` | Global | Style presets shared |
| `SyncedBudgetJob` + rows | Global | JobTread budget data from one company visible to all |
| `PricingSourceJob/Room/Trade` | Global | Pricing intelligence shared between competitors |
| `CatalogSuggestion` | Global | AI-learned pricing shared |
| `Project` | No tenant field | Any authenticated user sees all projects |

#### Do API routes scope data to the authenticated user's organization?

**No.** All queries use `prisma.model.findMany()` without any tenant filter. Every data fetch returns all data in the database regardless of who is asking. Example from settings:

```typescript
// Returns THE singleton settings row — same data for every user
const settings = await prisma.companySettings.findFirst();
```

#### Estimated effort to add full multi-tenancy

**Very Large (8-12 weeks)**

Required work:
1. Create `Organization` model with billing, branding, and config fields
2. Add `organizationId` foreign key to ~25 models
3. Create database migration (complex — must backfill existing data)
4. Add tenant resolution middleware (subdomain, header, or session-based)
5. Modify every data query to filter by `organizationId` (~100+ query locations)
6. Split singleton tables (`CompanySettings`, `CompanyContext`, `Company`) into per-tenant records
7. Add tenant isolation tests
8. Audit all API routes for data leakage
9. Handle cross-tenant data like shared brand backgrounds vs. per-tenant customizations

---

## SECTION 2 — Authentication, Authorization & Role-Based Access Control

### Part A — Authentication Basics

#### What auth system is in use?

**Clerk is integrated but completely disabled.** The `@clerk/nextjs@^6.9.0` package is installed and environment variables exist, but the auth layer has been replaced with a development stub:

```typescript
// app/lib/auth.ts — THE ENTIRE FILE
const DEV_USER = { user: null as unknown, email: "dev@hhi-builders.com", userId: "dev-user" };

export async function checkIsAdmin(): Promise<boolean> {
  return true;  // ALWAYS returns true
}

export async function requireAdmin() {
  return DEV_USER;  // ALWAYS succeeds
}
```

**Every auth check in the application unconditionally passes.** There is no actual authentication.

#### Is there a User model with organization membership?

The `User` model exists but is bare:

```prisma
model User {
  id          String   @id @default(cuid())
  clerkUserId String   @unique
  email       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

No organization membership, no role field, no permissions. The model is effectively unused since auth is stubbed.

#### Are API routes protected?

**No.** Routes fall into two categories:

1. **Routes that call `requireAdmin()`** — these exist in server actions but the function always returns `true`, so the check is meaningless
2. **Routes that don't even attempt auth** — ~34 API endpoints have zero auth calls

#### Completely unprotected API routes (no auth call at all)

```
/api/admin/backfill-cope
/api/ai-estimate (all sub-routes)
/api/ai-review (all sub-routes)
/api/cope-estimate
/api/extension/connection/verify
/api/extension/import-zillow-photos
/api/extension/redeem-pair-code
/api/health/db
/api/qstash/test
/api/settings/ai-pricing/stats
/api/settings/anthropic-models
/api/settings/catalog/* (all sub-routes)
/api/settings/context
/api/settings/gemini-models
/api/settings/google-places-key
/api/settings/templates/* (all sub-routes)
/api/storage/health
```

### Part B — Multi-user Organization Model

| Question | Answer |
|----------|--------|
| Is there an Organization concept? | No |
| Can multiple Users belong to one Organization? | No |
| Is there a user invitation flow? | No |
| Is there a user management UI? | No — `Employee` model exists but is for proposal display, not auth |
| Can a new employee be added to the company account? | No mechanism exists |

### Part C — Role-Based Access Control (RBAC)

**RBAC is completely absent.**

| Question | Answer |
|----------|--------|
| Does the model support multiple users per org? | No |
| Is RBAC implemented at any level? | No — only `Employee.isAdmin` boolean exists (display only, not enforced) |
| Can a Member access /admin/settings/? | Yes — everyone can access everything |
| Can a Member access /admin/settings/integrations (API keys)? | **Yes — critical security issue** |
| Is there middleware enforcing role boundaries? | **No middleware exists at all** |
| Which sensitive routes are accessible to all? | All of them |

#### Sensitive routes currently accessible to everyone

| Route | Sensitivity | Impact |
|-------|------------|--------|
| `/admin/settings/integrations` | **Critical** | Exposes and allows modification of all API keys (JobTread, Anthropic, Gemini, Google Places) |
| `/admin/settings/branding` | High | Anyone can change company logo, colors, branding |
| `/admin/settings/` (all tabs) | High | Full company configuration access |
| `/api/settings/catalog/*` | High | Full cost/price catalog with margins exposed |
| `/api/settings/context` | High | Market pricing assumptions, markup structure |
| `/api/ai-estimate/*` | Medium | Can trigger expensive AI API calls |
| `/admin/projects/*` | Medium | Can view, edit, or delete any project |

### Report Summary

- **Current auth:** Clerk installed but disabled; dev stub grants universal access
- **Multi-user orgs:** Not supported
- **RBAC:** Completely missing — no roles, no permissions, no enforcement
- **Effort estimate:** Large (4-6 weeks) for full RBAC:
  - Re-enable Clerk with org support (1 week)
  - Add Organization + UserOrganization models (1 week)
  - Implement role enum (Owner/Admin/Member/Viewer) and middleware (1-2 weeks)
  - Add route guards to all admin routes and API endpoints (1-2 weeks)
  - Build user management UI (invite, assign roles, remove) (1 week)

---

## SECTION 3 — Data Model & Schema Assessment

### Schema Overview

- **1,065 lines** of hand-crafted Prisma schema
- **38 models**, **14 enums**
- **85+ migrations** indicating active development
- Well-indexed with **47+ composite indexes** and numerous single-field indexes

### Normalization

The schema is well-normalized for a single-tenant app. Key hierarchies:

```
Project → Room → RoomSubArea
Project → Media
Project → TimelinePhase
Project → InvestmentLineItem
Project → ProposalDeck → DeckSlide
Room → AIEstimate → EstimateLineItem → PriceCorrection
SyncedBudgetJob → SyncedBudgetRow
PricingSourceJob → PricingSourceRoom → PricingSourceTrade
RoomTemplate → RoomTemplateTradeGroup → RoomTemplateItem
```

However, normalization for multi-tenancy is completely absent — the `organizationId` field would need to be added to the Project model (and possibly others) as the primary tenant boundary.

### Missing Indexes

| Model | Field | Issue |
|-------|-------|-------|
| `BrandBackground` | `overlayIconId` | Foreign key to BrandIcon, no index |
| `ValuePillar` | `brandIconId` | Foreign key to BrandIcon, no index |

These are low-traffic tables so the impact is minor, but they should be indexed for completeness.

### Soft Delete

**Not implemented anywhere.** No model has a `deletedAt` field. All deletes are hard deletes with `onDelete: Cascade` propagation.

Impact for SaaS:
- No ability to recover accidentally deleted projects, rooms, or media
- No audit trail of deletions
- No "trash" or "recently deleted" functionality
- Cascade deletes mean deleting a project instantly removes all rooms, media, slides, estimates, and timeline phases

### Timestamps

Most models have `createdAt` and `updatedAt`. Notable exceptions:

| Model | Missing Field |
|-------|--------------|
| `Proposal` | Missing `createdAt`, `updatedAt` |
| `ExtensionPairCode` | Missing `updatedAt` |
| `ZillowBrowserConnection` | Missing `updatedAt` |
| `Media` | Missing `updatedAt` |
| `PublishedSnapshot` | Missing `updatedAt` |
| `PriceCorrection` | Missing `updatedAt` |

### Scale Concerns

1. **JSON blob fields**: `CompanySettings` stores `integrationsJson`, `coreValuesDefaultsJson`, `copeDefaultsJson`, `nextStepsDefaultsJson`, `designBuildDefaultsJson` as `Json?` — these are unindexable and hard to query/migrate
2. **`DeckSlide.content`** is `Json?` storing arbitrary slide content — type-safe at the TypeScript level but not at the database level
3. **`SyncedBudgetRow.rawPayloadJson`** stores the full JobTread API response per row — could grow large
4. **No partitioning strategy** for what would become multi-tenant data
5. **`RoomType.name` is not unique** — potential data consistency issue

### Neon PostgreSQL Setup

The connection strings in `.env` show:
- Pooled connection via `-pooler` endpoint (correct for serverless)
- SSL mode with `sslmode=verify-full` and `channel_binding=require` (good security)
- Separate `DIRECT_URL` for migrations (correct Prisma pattern)

For multi-tenant SaaS, Neon's branch-per-tenant model could be considered but row-level multi-tenancy is more practical at this scale.

### Report Summary

- **Strengths:** Well-structured schema, comprehensive indexing, proper cascading relationships
- **Weaknesses:** No soft delete, missing timestamps on 6 models, JSON blobs for complex config, no multi-tenant fields
- **Effort estimate:** Medium (2-3 weeks) for schema hardening (soft delete, missing timestamps, multi-tenant fields, missing indexes)

---

## SECTION 4 — API & Security Assessment

### Authentication on API Routes

**No API route is effectively authenticated.** While many server actions call `requireAdmin()`, the function is a no-op that always succeeds. API route handlers (under `/api/`) mostly don't even call it.

### Input Validation

**Inconsistent.** Some routes validate required fields manually:

```typescript
if (!body.projectId || !body.sectionId) {
  return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
}
```

But there is no systematic validation framework (no Zod, no Joi). Specific gaps:
- No range validation on numeric fields (square footage, prices could be negative)
- `/api/settings/catalog/seed` accepts arbitrary JSON without schema validation
- `/api/settings/templates/import` doesn't validate template structure
- No URL validation on external URLs passed to fetch operations

### API Key & Secret Storage

**Mixed.**

**Good:**
- Integration secrets (JobTread) are encrypted with AES-256-GCM via `app/lib/integration-secrets.ts`
- Encryption key loaded from `INTEGRATION_ENCRYPTION_KEY` environment variable
- All external API keys (Anthropic, Gemini, Google Places) stored in environment variables, not in code

**Concerning:**
- The `.env` file in the project root contains plaintext database credentials with the Neon password visible
- `.env` is in `.gitignore` but may have been committed at some point
- No key rotation mechanism for the encryption key
- `ADMIN_EMAILS` is a hardcoded CSV in environment variables

### Rate Limiting

**None.** Zero rate limiting on any endpoint. Search for `rateLimit`, `rate-limit`, `Ratelimit`, `upstash` returned zero results.

Endpoints vulnerable to abuse:
- `/api/ai-estimate/*` — triggers expensive Claude API calls
- `/api/settings/google-places-key` — proxies Google Places API (costs money)
- `/api/settings/gemini-models` — fetches from Google API
- `/api/extension/redeem-pair-code` — pair codes could be brute-forced
- `/api/deck/generate-background` — triggers Gemini image generation (costs money)

### File Upload Validation

- Server action body size limit set to `5MB` in `next.config.ts`
- R2 uploads use presigned URLs with content-type restrictions
- No explicit virus/malware scanning
- No file type validation beyond what the presigned URL enforces

### CORS

**Overly permissive on extension routes:**

```typescript
// Three routes set:
"Access-Control-Allow-Origin": "*"
```

Routes affected: `/api/extension/connection/verify`, `/api/extension/redeem-pair-code`, `/api/extension/import-zillow-photos`

This allows any website to call these endpoints.

### Integration API Keys

All integration API keys (Google Places, JobTread, Anthropic, Gemini) are stored and accessed **server-side only** via environment variables or the encrypted `Integration` model. No API keys are exposed to client-side code. This is correct.

### Data Exposure

- `/api/settings/catalog/items` — returns ALL pricing catalog items (cost and price) to any caller
- `/api/settings/context` — returns market profile, markup structure, pricing ranges to any caller
- `/api/settings/ai-pricing/stats` — returns AI cost statistics to any caller

### Web Vulnerability Protection

- **SQL Injection:** Prisma ORM provides parameterized queries. One `$executeRaw` usage found but uses tagged template literals (safe)
- **XSS:** React's default escaping provides baseline protection; no `dangerouslySetInnerHTML` found in data-display contexts
- **CSRF:** No explicit CSRF protection. Next.js Server Actions provide some protection via the `Origin` header check, but API routes (`/api/*`) have none

### Report Summary

| Category | Status |
|----------|--------|
| Authentication | Not functional (stubbed) |
| Authorization | Not implemented |
| Input validation | Inconsistent, no framework |
| Secret storage | Good (encrypted in DB, env vars) |
| Rate limiting | None |
| File upload validation | Basic |
| CORS | Overly permissive on 3 routes |
| API key exposure | Server-side only (good) |
| Data exposure | 3 routes expose sensitive pricing data |
| SQL injection | Protected by Prisma |
| XSS | Protected by React |
| CSRF | Partial (server actions only) |

**Effort estimate:** Medium-Large (3-4 weeks) for security hardening:
- Re-enable auth and protect all routes (1 week, overlaps with RBAC work)
- Add rate limiting with Upstash or similar (3-5 days)
- Add Zod validation to all API routes (1 week)
- Fix CORS, add CSRF protection (2-3 days)
- Add audit logging (3-5 days)

---

## SECTION 5 — Performance & Scalability Assessment

### Expensive Queries

Several page loads execute multiple unbounded `findMany` queries:

- **Deck editor page** (`app/admin/projects/[id]/deck/page.tsx`): Loads ALL brand backgrounds, ALL rooms with nested media, ALL value pillars, and ALL company settings in a single page load — no pagination or lazy loading
- **Settings actions** (`app/admin/settings/actions.ts`): `getOrCreateCompanySettings()` is called on nearly every admin page load
- **Photo library**: Has pagination (`take: pageSize` with cursor) — good
- **Projects list**: No pagination — would grow unbounded with tenants creating many projects

### Image Optimization

**Good:**
- Next.js `<Image>` component used in 26+ files
- `next.config.ts` configured for AVIF format
- Remote image patterns whitelisted for R2 and custom domains
- Thumbnails generated for library media

**Gaps:**
- Some legacy blob URLs rendered as raw `<img>` tags
- No CDN in front of R2 (Cloudflare R2 has built-in CDN but it may not be enabled)

### React Optimization

- `useCallback` used extensively in key components (DeckEditorClient, media components)
- **No `useMemo` or `React.memo` usage found** — large components with complex state transformations may re-render unnecessarily
- InspectorPanel at 5,496 lines renders massive amounts of UI — each keystroke could trigger expensive re-renders

### Background Jobs / Async Processing

**None.** No job queue system exists (no Bull, QStash, BullMQ, or similar).

Operations that should be async but run synchronously:
- JobTread budget sync (`sync-budget.ts` — 1,074 lines of bulk DB operations)
- AI background image generation (waits for external API)
- AI estimate generation (calls Claude API synchronously)
- Photo library bulk operations

### Concurrent Editing

**No protection.** No version fields, no optimistic locking, no `updatedAt` checks before writes.

If two users edit the same deck simultaneously, the last save wins silently. This is a critical issue for multi-user organizations where team members may work on the same proposal.

### Client-Side State

- Media arrays loaded fully into component state (potentially large for photo-heavy projects)
- Deck editor loads all slides into memory
- No virtualization on long lists (room lists, media grids)

### Large Files (All files over 500 lines)

| File | Lines | Split Recommendation |
|------|-------|---------------------|
| `InspectorPanel.tsx` | 5,496 | **Critical** — Split into per-slide-type inspector modules |
| `page-editor.tsx` (presentation) | 4,137 | **Critical** — Extract section editors, toolbar, preview |
| `media-tab.tsx` | 2,955 | **High** — Extract upload, gallery, Zillow, render sub-components |
| `actions.ts` (settings) | 2,938 | **High** — Split by settings domain (branding, pricing, templates) |
| `rooms-tab.tsx` | 2,754 | **High** — Extract room card, measurement panel, estimate panel |
| `photo-library-tab.tsx` | 1,976 | **Medium** — Extract upload, grid, filter sub-components |
| `BackgroundLibraryClient.tsx` | 1,780 | **Medium** — Extract generator, picker, preview |
| `IconLibraryClient.tsx` | 1,655 | **Medium** — Extract upload, grid, tag management |
| `actions.ts` (rooms) | 1,655 | **Medium** — Split by operation type |
| `jobtread-pricing.ts` | 1,586 | **Medium** — Extract sync, normalization, mapping |
| `actions.ts` (media) | 1,522 | **Medium** — Split upload, render, import |
| `sources/actions.ts` (pricing) | 1,500 | **Medium** — Split by pricing source type |
| `backgrounds/actions.ts` | 1,455 | **Medium** — Extract generation, CRUD, preview |
| `integrations-tab.tsx` | 1,365 | **Low** — One tab per integration could help |
| `debug/page.tsx` (pricing) | 1,230 | **Low** — Debug page, lower priority |
| `types.ts` (deck) | 1,106 | **Low** — Type definitions, acceptable size |
| `sync-budget.ts` | 1,074 | **Medium** — Extract parsing, normalization, writing |
| `db.ts` (deck) | 1,018 | **Medium** — Extract by operation (sync, CRUD, content) |
| `ai-estimate-panel.tsx` | 985 | **Medium** |
| `section-page-editor.tsx` | 966 | **Medium** |
| `DeckEditorClient.tsx` | 929 | **Medium** |
| `bulk-review-and-estimate-modal.tsx` | 926 | **Medium** |
| `overview-tab.tsx` | 922 | **Medium** |
| `JobTreadSourcesClient.tsx` | 894 | **Medium** |
| `WhyUsSlide.tsx` | 884 | **Low** — Slide components are leaf nodes |
| `pricing-staging.ts` | 787 | **Low** |
| `room-types-tab.tsx` | 781 | **Low** |
| `CoverSlide.tsx` | 766 | **Low** |
| `CoreValuesSlide.tsx` | 759 | **Low** |
| `NextStepsSlide.tsx` | 745 | **Low** |
| `pricing-staging-diagnostic.ts` | 701 | **Low** |
| `ObjectiveSlide.tsx` | 689 | **Low** |
| `front-page-hero-editor.tsx` | 678 | **Low** |
| `ZillowConnectModal.tsx` | 669 | **Low** |
| `ProjectTimelineSlide.tsx` | 653 | **Low** |
| `RiskBriefSlide.tsx` | 636 | **Low** |
| `pricing-tree-grid.tsx` | 634 | **Low** |

**Total files over 500 lines: 36+** (excluding generated Prisma files)

### Report Summary

- **Performance risks:** Unbounded queries on deck/settings pages, no React memoization, 5,496-line component
- **Caching:** Only Next.js native `revalidatePath` — no Redis, no request-level caching
- **Async/queue candidates:** Budget sync, AI generation, image rendering, bulk operations
- **Concurrent editing:** Last-write-wins with no conflict detection — critical for multi-user
- **Effort estimate:** Large (4-6 weeks) — background job system, query optimization, component splitting, concurrent editing

---

## SECTION 6 — Billing & Plan Gating Assessment

### Current State

**No billing infrastructure exists.** There is:
- No Stripe, Paddle, or any payment processor integration
- No `Plan`, `Subscription`, `Invoice`, or `Payment` model in the schema
- No usage tracking or limit enforcement
- No feature flags or plan gating
- `stripe` is not in `package.json`
- No billing-related environment variables in `.env.example`

### Recommended Plan Structure

| Feature | Starter | Pro | Agency |
|---------|---------|-----|--------|
| **Price** | $49/mo | $149/mo | $349/mo |
| **Users** | 2 | 5 | Unlimited |
| **Projects** | 5 active | Unlimited | Unlimited |
| **Slide types** | Basic 5 | All | All |
| **AI backgrounds** | 0/mo | 20/mo | 100/mo |
| **AI estimates** | 0/mo | 10/mo | 50/mo |
| **Photo library** | 100 images | 1,000 images | 10,000 images |
| **JobTread integration** | No | Yes | Yes |
| **Custom branding** | Logo only | Full | Full + white-label |
| **Google Reviews sync** | No | Yes | Yes |
| **PDF export** | Watermarked | Clean | Clean |
| **Public proposal links** | 5 active | Unlimited | Unlimited |
| **Role-based access** | No | No | Yes |
| **Priority support** | No | No | Yes |

### Feature Gates Needed

Usage limits that need tracking and enforcement:
1. Active project count per organization
2. Monthly AI background generation count
3. Monthly AI estimate generation count
4. Photo library storage (image count or total MB)
5. User count per organization
6. Active public proposal link count

Feature toggles needed:
1. JobTread integration enabled/disabled
2. AI features enabled/disabled
3. Advanced slide types enabled/disabled
4. White-label/custom branding level
5. Google Reviews sync enabled/disabled

### Recommended Billing Provider

**Stripe** is the clear choice because:
- Industry standard for SaaS billing
- Supports subscription management, usage-based billing, and metered features
- Customer portal for self-service plan changes and invoice management
- Webhook system for real-time subscription lifecycle events
- Tax calculation (Stripe Tax) important for US SaaS
- Strong fraud prevention
- Excellent developer documentation and Next.js integration examples
- Supports free trials, coupons, and custom pricing for design partners

### Effort Estimate

**Large (4-6 weeks)**

1. Stripe integration and webhook handlers (1-2 weeks)
2. Plan/Subscription/UsageRecord schema models (3-5 days)
3. Feature flag system with plan-based gating (1 week)
4. Usage tracking middleware (AI calls, storage, project count) (1 week)
5. Billing settings UI (plan selection, payment method, invoices) (1 week)
6. Upgrade/downgrade flows and grace periods (3-5 days)

---

## SECTION 7 — Onboarding & Setup Assessment

### Current State: None

There is no onboarding flow. A new user lands directly on the admin dashboard.

### New Customer First 10 Minutes (Today)

1. **Minute 0-1:** User signs up (hypothetically — Clerk auth is disabled). Lands on `/admin` dashboard.
2. **Minute 1-2:** Sees a "System Status" card showing:
   - Branding: "Missing" (no logo)
   - Colors: "Missing" (no accent color)
   - Pricing Profiles: "0"
   - Media Storage: status check
3. **Minute 2-3:** User must independently discover they need to go to Settings. No guidance, no arrows, no "Getting Started" prompt.
4. **Minute 3-5:** Settings page shows 16 tabs. User has no idea which to configure first. They must figure out on their own that Company Profile → Branding → Section Types → Employees is the logical order.
5. **Minute 5-7:** They might try to create a project. The project creation form works but:
   - No rooms have pricing profiles (SectionTypes not seeded)
   - No templates exist (RoomTemplates not seeded)
   - No employees exist for assignment
   - Slides will show fallback "HHI Builders" branding
6. **Minute 7-10:** The proposal deck would render with:
   - Missing logo (placeholder or empty)
   - Default colors (may look generic)
   - No testimonials
   - No value pillars
   - No "Why Us" content
   - No AI estimation capability (no context configured)

**The app is not useful until significant manual configuration is completed.** A new customer would likely give up or contact support within 5 minutes.

### Minimum Setup Required Before First Professional Proposal

1. Company name and contact info
2. Logo upload (light and dark variants)
3. Accent and text colors
4. At least one Section Type with pricing
5. At least one Employee
6. Company context for AI (market, finish tier)
7. Value pillars / "Why Us" content
8. At least one testimonial

### Missing Empty States and Guidance

| Area | Current Empty State | Needed |
|------|-------------------|--------|
| Projects list | "No projects yet. Create one to get started." | Acceptable |
| Rooms in project | Implied empty | "Add your first room to start scoping" |
| Photo library | Unknown | "Upload your first project photos" with drag-drop |
| Testimonials | Unknown | "Add your first client testimonial" |
| Section Types | Empty table | "Seed defaults or create your first pricing profile" |
| Employees | Unknown | "Add your team members" |
| Integrations | Status cards | "Connect your tools to unlock features" |
| Value Pillars | Unknown | "Define what makes your company unique" |
| AI Context | Unknown | "Tell us about your market for accurate AI estimates" |

### In-App Help

**None.** No tooltips, no contextual guidance, no help links, no documentation, no onboarding checklist, no progress indicator.

### Report Summary

- **Current state:** None — no onboarding exists
- **Rating:** 1/10
- **Effort estimate:** Medium (2-3 weeks):
  - Setup wizard (company info → branding → first project) (1 week)
  - Dashboard checklist with completion tracking (3-5 days)
  - Empty states with contextual guidance throughout (3-5 days)
  - Seed data option ("Start with sample data") (2-3 days)
  - Welcome email + getting started guide (2-3 days)

---

## SECTION 8 — Code Quality & Maintainability Assessment

### Large Files

See Section 5 for the full list. **36+ files exceed 500 lines**, with the top 5 ranging from 2,754 to 5,496 lines.

### Duplicated Logic

**Minimal.** The codebase follows DRY principles well:

- **Pricing calculation:** Centralized in `computeRoomPriceRange()` (single source of truth)
- **Media uploads:** Centralized in `app/lib/s3.ts`
- **Branding:** Centralized via `adaptBrandingForDeck()` in `app/lib/deck/branding-adapter.ts`
- **Slide constants:** Extracted to `app/lib/slide-constants.ts` (imported by 20+ slide components)
- **Settings fetch:** Single `getOrCreateCompanySettings()` function

One area of minor duplication: AI system prompts in `/api/ai-review/route.ts` and `/api/ai-review/batch/route.ts` both define similar `ROOM_REVIEW_SYSTEM_PROMPT` constants.

### TypeScript Quality

**Strict mode is enforced.** `tsconfig.json` has `strict: true`.

- **`any` usage:** 33 occurrences across 4 files — concentrated in legacy JobTread debug code (29 in one file)
- **`@ts-expect-error`:** 1 occurrence (AWS SDK type variance — justified)
- **`as unknown as`:** 8 occurrences across 5 files (type narrowing — acceptable)

**Rating: Strict** — TypeScript discipline is good. The `any` usage in the pricing debug file should be cleaned up but doesn't affect production code quality.

### Dead Code

- **Commented-out code:** Minimal — no large blocks of dead code found
- **TODO/FIXME/HACK:** 8 occurrences across 5 files (minor, mostly in mock/test adapters)
- **Unused imports:** Not systematically present (strict mode would flag these)

### Error Handling

**Consistent pattern across server actions:**

```typescript
export async function someAction(...) {
  await requireAdmin();
  try {
    // ... business logic
    revalidatePath("/admin/...");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { error: message };
  }
}
```

12+ action files follow this pattern. API route handlers are less consistent but generally catch errors.

**Rating:** Good — consistent in server actions, less consistent in API routes.

### Hardcoded Values

**Company-specific hardcodes found (30+ occurrences of "HHI"):**

| File | Hardcode | Issue |
|------|----------|-------|
| `app/layout.tsx` | `title: "HHI Builders Proposal App"` | Page title |
| `app/page.tsx` | `HHI Builders Proposal App` | Homepage heading |
| `AdminLayoutChrome.tsx` | `"HHI Admin"` | Admin sidebar title |
| `branding-adapter.ts` | `companyName: "HHI Builders"` | Fallback company name |
| `proposal-from-snapshot.tsx` | `Why HHI Builders` | Section heading |
| `draft-proposal-view.tsx` | `Why HHI Builders` (×2) | Section heading |
| `branding-tab.tsx` | `HHI Builders` | Preview placeholder |
| `core-values/page.tsx` | `HHI_DEFAULTS` | HHI-specific defaults |
| `cope-items/page.tsx` | `HHI_COPE_DEFAULTS` | HHI-specific defaults |
| `next-steps/page.tsx` | `HHI_NEXT_STEPS_DEFAULTS` | HHI-specific defaults |
| `design-build/page.tsx` | `HHI_DESIGN_BUILD_DEFAULTS` | HHI-specific defaults |
| `section-types-tab.tsx` | `"Seed HHI defaults"` (×2) | Button label |
| `view-v2/page.tsx` | `title: "Proposal \| HHI Builders"` | Public page title |
| `google-places-key/route.ts` | `HHI_LAT = 32.2163`, `HHI_LNG = -80.7526` | Hardcoded Hilton Head coordinates |
| `ai-review/route.ts` | `"HHI Builders, a luxury residential renovation company on Hilton Head Island"` | AI system prompts |
| `ai-review/batch/route.ts` | Same as above | AI system prompts |
| `auth.ts` | `dev@hhi-builders.com` | Dev auth stub |
| `constants.ts` | `SUPER_ADMIN_EMAIL = "syoung@hhi-builders.com"` | Super admin |

These must all be replaced with dynamic values from CompanySettings/CompanyContext for multi-tenant operation.

### Component Structure

**Well-organized.** Slide components follow a consistent pattern:

```
app/admin/projects/[id]/deck/slides/
  ├── CoverSlide.tsx
  ├── ObjectiveSlide.tsx
  ├── ProcessSlide.tsx
  ├── WhyUsSlide.tsx
  ├── ... (18+ slide types)
  └── SlideRenderer.tsx (dispatcher)
```

Each slide receives `{ slide, branding, hasAiBackground }` props and renders independently. Shared utilities are properly extracted into `app/lib/slide-constants.ts` and `app/lib/deck/`.

### Test Suite

**No tests exist.**

- Zero `.test.ts`, `.spec.ts`, or `__tests__/` directories
- No Jest or Vitest configuration
- Playwright is in `devDependencies` but has no test scripts or test files
- No test command in `package.json`
- No GitHub Actions workflows

### CI/CD

- No GitHub Actions workflows (`.github/workflows/` is empty or missing)
- Vercel deployment configured (`.vercel/project.json` exists) — likely auto-deploys on push
- `build` and `lint` scripts exist in `package.json` but no automated test step
- No pre-commit hooks for linting or type checking

### Report Summary

| Metric | Rating |
|--------|--------|
| Files over 500 lines | 36+ (5 critical, 10 high priority) |
| Duplicated logic | Minimal — good extraction patterns |
| TypeScript quality | **Strict** — `strict: true` enforced, minimal `any` |
| Dead code | Minimal (~8 TODOs) |
| Error handling consistency | Good in server actions, inconsistent in API routes |
| Hardcoded values | **30+ HHI-specific hardcodes** — must be parameterized |
| Test coverage | **0%** — no tests at all |
| CI/CD | **Minimal** — Vercel auto-deploy only, no test/lint gates |
| **Overall maintainability** | **6/10** — good architecture and patterns, undermined by massive files, zero tests, and no CI |

---

## SECTION 9 — SaaS Readiness Scorecard

| Area | Current State | Target State | Gap Size | Effort |
|------|--------------|--------------|----------|--------|
| Multi-tenancy | Single-tenant, no org model | Full row-level multi-tenancy | **Critical** | Very Large (8-12 wks) |
| Authentication | Disabled (dev stub) | Clerk with org support | **Critical** | Medium (1-2 wks) |
| Multi-user Orgs + RBAC | Not implemented | Owner/Admin/Member/Viewer roles | **Critical** | Large (4-6 wks) |
| Data Model | Well-structured for single tenant | Tenant-scoped with soft delete | **Large** | Medium (2-3 wks) |
| API Security | No auth, no rate limits, no validation | Full auth + rate limits + validation | **Critical** | Medium-Large (3-4 wks) |
| Performance | Unbounded queries, no caching, massive files | Paginated, cached, split components | **Medium** | Large (4-6 wks) |
| Billing | Nothing exists | Stripe + plan gating + usage tracking | **Critical** | Large (4-6 wks) |
| Onboarding | Nothing exists | Setup wizard + checklist + empty states | **Large** | Medium (2-3 wks) |
| Code Quality | Good patterns, zero tests, HHI hardcodes | Tests, CI, parameterized values | **Medium** | Medium (3-4 wks) |

### Overall SaaS Readiness Score: 2/10

The application is a well-built single-tenant internal tool with strong domain logic, clean component architecture, and solid TypeScript discipline. However, it is **not close to being a sellable SaaS product.** The foundational requirements for multi-tenancy — tenant isolation, authentication, authorization, and billing — are completely absent. Every piece of data in the system is globally accessible to any visitor with no authentication whatsoever. The 30+ hardcoded references to "HHI Builders" permeate the codebase from page titles to AI system prompts. There are zero automated tests, no CI pipeline, and no way for a second company to use the application without seeing HHI's data, branding, pricing, and API credentials. The path from here to a production SaaS product is significant but achievable — the core product functionality (proposal deck building, AI estimation, JobTread integration, media management) is genuinely strong and would provide real value to design-build remodeling companies. The work ahead is primarily infrastructure and isolation, not product features.

---

## SECTION 10 — Recommended Roadmap

### PHASE A — Must Fix Before Any Paying Customers (Blocking)

These items would cause data breaches, privacy violations, or complete failure in a multi-tenant environment.

#### A1. Re-enable Authentication
- **What:** Replace the `auth.ts` stub with real Clerk authentication. Add `ClerkProvider` to root layout. Add middleware to redirect unauthenticated users from `/admin/*` to sign-in.
- **Why:** Currently anyone can access all data, all settings, and all API keys without logging in. This is a non-negotiable blocker.
- **Effort:** 3-5 days

#### A2. Add Organization Model and Multi-Tenancy
- **What:** Create `Organization` model. Add `organizationId` to `Project`, `CompanySettings` (convert from singleton), `CompanyContext` (convert from singleton), `Employee`, `Integration`, `Testimonial`, `SectionType`, `RoomType`, `LibraryMedia`, `LibraryTag`, `BrandIcon`, `BrandBackground`, `PricingCatalogItem`, `RoomTemplate`, `StylePreset`, `ValuePillar`, `WhyUsDefaults`, `Company`, `CatalogSuggestion`, and all JobTread sync tables. Modify every query to filter by the authenticated user's organization.
- **Why:** Without this, Company A sees Company B's projects, proposals, pricing, photos, API keys, and customer testimonials. A competitor could view your entire pricing catalog and cost structure. **This is a company-ending event.**
- **Effort:** 6-8 weeks

#### A3. Protect All API Routes
- **What:** Add authentication checks to all 34+ unprotected API routes. Verify the caller belongs to the organization that owns the resource being accessed.
- **Why:** Currently, anyone with knowledge of a URL can create AI estimates (costing you money), access pricing catalogs, modify company settings, and import photos.
- **Effort:** 1-2 weeks

#### A4. Implement Role-Based Access Control
- **What:** Add `UserOrganization` junction table with role enum (Owner/Admin/Member/Viewer). Add middleware that checks role before allowing access to settings, integrations, user management, and billing routes.
- **Why:** Without RBAC, every user in a company can see API keys, change branding, delete projects, and access billing. A salesperson could accidentally (or intentionally) modify pricing profiles that affect all proposals.
- **Effort:** 3-4 weeks

#### A5. Add Rate Limiting
- **What:** Implement rate limiting on all API routes, with stricter limits on expensive operations (AI generation, JobTread sync, Google Places proxy).
- **Why:** Without rate limiting, a single bad actor could exhaust your AI API budget, abuse your Google Places API quota, or DoS the application.
- **Effort:** 3-5 days

#### A6. Remove Hardcoded HHI References
- **What:** Replace all 30+ hardcoded "HHI Builders" references with dynamic values from `CompanySettings`/`CompanyContext`. This includes page titles, AI system prompts, fallback company names, hardcoded coordinates, default seed data labels, and the super-admin email.
- **Why:** A paying customer's proposals, admin UI, and AI interactions should reference their company, not HHI Builders.
- **Effort:** 1-2 weeks

#### A7. Add Billing System
- **What:** Integrate Stripe. Add `Subscription`, `Plan`, and usage tracking models. Gate features by plan level. Add billing settings page for plan management.
- **Why:** You cannot charge customers without a billing system. You cannot limit usage without plan gating.
- **Effort:** 4-6 weeks

---

### PHASE B — Must Fix Before Public Launch (Important)

These would cause poor customer experience or support burden but not data loss or security issues.

#### B1. Build Onboarding Flow
- **What:** Create a setup wizard that guides new organizations through: company name → logo upload → color selection → first employee → (optional) JobTread connection → first project.
- **Why:** Without onboarding, new customers will be confused by 16 unconfigured settings tabs and produce ugly proposals with missing branding on their first attempt.
- **Effort:** 1-2 weeks

#### B2. Add Soft Delete
- **What:** Add `deletedAt` field to `Project`, `Room`, `Media`, `DeckSlide`, and other critical models. Implement "trash" with 30-day retention.
- **Why:** A paying customer who accidentally deletes a project with months of work will churn immediately if there's no recovery option.
- **Effort:** 1-2 weeks

#### B3. Add Concurrent Editing Protection
- **What:** Add version field to `DeckSlide` and `Room`. Implement optimistic locking — reject updates where the version doesn't match.
- **Why:** Multi-user organizations will have team members editing the same proposal. Silent data loss from last-write-wins will cause frustration and support tickets.
- **Effort:** 1-2 weeks

#### B4. Add Input Validation Framework
- **What:** Add Zod schemas for all API route inputs. Validate types, ranges, and required fields consistently.
- **Why:** Invalid data will cause confusing errors deep in the system rather than clear validation messages at the boundary.
- **Effort:** 1 week

#### B5. Fix CORS on Extension Routes
- **What:** Restrict `Access-Control-Allow-Origin` from `*` to specific Chrome extension IDs.
- **Why:** The wildcard allows any website to call extension endpoints, which is a potential abuse vector.
- **Effort:** 1 day

#### B6. Add Missing Timestamps
- **What:** Add `updatedAt` to `Proposal`, `Media`, `PublishedSnapshot`, `PriceCorrection`, `ExtensionPairCode`.
- **Why:** Audit trails and change tracking require knowing when records were last modified.
- **Effort:** 2-3 days

#### B7. Build User Management UI
- **What:** Create an admin page where org Owners/Admins can invite users by email, assign roles, and remove team members.
- **Why:** Customers need to manage their team without contacting your support.
- **Effort:** 1-2 weeks

---

### PHASE C — Should Fix in First 90 Days Post-Launch (Growth)

#### C1. Split Large Components
- **What:** Break `InspectorPanel.tsx` (5,496 lines), `page-editor.tsx` (4,137), `media-tab.tsx` (2,955), `rooms-tab.tsx` (2,754), and `settings/actions.ts` (2,938) into smaller modules.
- **Why:** These files are unmaintainable and slow to load/parse. They create merge conflicts when multiple developers work on the same feature area.
- **Effort:** 2-3 weeks

#### C2. Add Background Job System
- **What:** Implement a job queue (QStash, Inngest, or Bull) for AI generation, JobTread sync, image rendering, and bulk operations.
- **Why:** Synchronous AI calls block request threads and cause timeouts at scale. Background jobs enable retry logic and progress tracking.
- **Effort:** 2-3 weeks

#### C3. Add Automated Tests
- **What:** Set up Vitest for unit tests and Playwright for E2E tests. Prioritize testing: pricing calculation, investment rollup, auth middleware, tenant isolation, API route protection.
- **Why:** Zero test coverage means every deployment is a risk. Tenant isolation bugs are the kind of thing that must be caught by tests, not customers.
- **Effort:** 3-4 weeks (ongoing)

#### C4. Add CI/CD Pipeline
- **What:** GitHub Actions workflow: lint → type-check → unit tests → build → deploy. Block merges that fail any check.
- **Why:** Without CI, broken code can ship to production. Type errors and lint failures should be caught before deployment.
- **Effort:** 2-3 days

#### C5. Add Query Pagination
- **What:** Add pagination to project lists, media galleries, room lists, and background libraries. Implement cursor-based pagination for large collections.
- **Why:** A tenant with 200+ projects and 5,000+ photos will see degraded performance without pagination.
- **Effort:** 1-2 weeks

#### C6. Add Caching Layer
- **What:** Implement Redis (Upstash) for caching frequently accessed data: company settings, brand backgrounds, section types, pricing catalog.
- **Why:** Every page load currently hits the database for settings. At 100+ concurrent users across tenants, this creates unnecessary load.
- **Effort:** 1 week

#### C7. Add Monitoring and Error Tracking
- **What:** Integrate Sentry for error tracking, add structured logging (Pino), and add basic APM metrics.
- **Why:** In production, you need to know when things break before customers report them.
- **Effort:** 3-5 days

---

### PHASE D — Nice to Have (Backlog)

#### D1. Custom Domains
- **What:** Allow Agency-tier customers to serve proposals from their own domain (e.g., proposals.theircompany.com).
- **Why:** White-label value for premium customers.
- **Effort:** 1-2 weeks

#### D2. Audit Log
- **What:** Create an `AuditEvent` model tracking who changed what and when across all sensitive operations.
- **Why:** Enterprise customers expect audit trails for compliance and accountability.
- **Effort:** 1-2 weeks

#### D3. Webhook System
- **What:** Allow customers to receive webhooks when proposals are published, viewed, or when estimates are completed.
- **Why:** Enables integration with CRM systems and internal workflows.
- **Effort:** 1-2 weeks

#### D4. API Access
- **What:** Provide a REST or GraphQL API for customers to programmatically create projects and retrieve proposal data.
- **Why:** Power users and agencies will want to automate proposal creation from their CRM or project management tools.
- **Effort:** 3-4 weeks

#### D5. Real-Time Collaboration
- **What:** Add WebSocket-based real-time sync for deck editing (show cursors, live changes, conflict resolution).
- **Why:** Team collaboration on proposals would be a significant competitive differentiator.
- **Effort:** 4-6 weeks

#### D6. Template Marketplace
- **What:** Allow customers to share or sell slide templates and section type configurations.
- **Why:** Network effects and community building that increase stickiness.
- **Effort:** 4-6 weeks

#### D7. React Memoization Audit
- **What:** Add `useMemo` and `React.memo` to expensive computations and frequently re-rendered components, especially in the deck editor.
- **Why:** Performance improvement for complex proposals with many slides and media.
- **Effort:** 3-5 days

#### D8. Database Row-Level Security
- **What:** Implement PostgreSQL RLS policies as a defense-in-depth layer for tenant isolation, in addition to application-level filtering.
- **Why:** Defense in depth — even if application code has a bug, the database enforces tenant boundaries.
- **Effort:** 1-2 weeks

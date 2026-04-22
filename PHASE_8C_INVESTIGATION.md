# Phase 8C — COPE Auto-Trigger + Bulk Button Investigation

**Date:** 2026-04-21
**Branch:** proposal-v2
**Scope:** Read-only mapping of the COPE generation pipeline in preparation for Phase 8C (auto-trigger on EstimateJob completion + a banner/rooms-tab button).

---

## 1. Executive Summary

- **COPE is a single project-level estimate, not per-room.** The spec's "generate COPE for every room that received an estimate" premise is wrong — there's exactly ONE COPE estimate per project, written to a dedicated `isProjectOverhead: true` room created by `ensureCopeRoom()`. All 20 rooms in a project share one COPE estimate. Phase 8C's "auto-trigger" and "bulk button" both reduce to firing ONE call to `POST /api/cope-estimate` per project.
- **COPE reads aggregated fresh data on every call** — no cached state. It pulls the latest `AIEstimate` per room via `prisma.aIEstimate.findFirst({ orderBy: { createdAt: "desc" } })` inside `getProjectAggregateData`, so auto-trigger at job-completion-time will see all the fresh estimates without race conditions, as long as the EstimateJob reaches COMPLETED / PARTIAL before the call fires.
- **No `CopeJob`/queue infrastructure is needed.** COPE is a single HTTP call that takes ~60–120s (same `streamClaude max_tokens: 64000` shape as per-room estimates). Wrapping it in QStash adds complexity without a parallelism benefit (there's nothing to parallelize — it's one call). Auto-trigger can simply publish ONE worker message after the EstimateJob rolls up to terminal.
- **No `copeStatus`/`copeGeneratedAt` field exists.** The "is COPE generated?" signal is: does an `AIEstimate` row exist for the project's COPE room (`sectionId = copeRoom.id`). Overwrite semantics: every regen creates a new AIEstimate row; the UI reads the latest by `createdAt desc`. Idempotency guards must be added — today, re-clicking "Regenerate COPE Only" produces a new (duplicate) AIEstimate row every time.
- **The existing "Regenerate COPE Only" button uses a weak gate.** `otherRoomsHaveEstimates` = `rooms.some(r => !r.isProjectOverhead && r.pricingTier === "AI_ESTIMATE")` — that checks configuration intent, not whether any estimate actually exists ([rooms-tab.tsx:1861](app/admin/projects/[id]/rooms/rooms-tab.tsx:1861)). The server-side check at [cope-estimate/route.ts:78](app/api/cope-estimate/route.ts:78) is the authoritative one: `roomsWithEstimates === 0` → 400.

---

## 2. Entry Points & Trigger Flow

### 2a. UI entry points (currently one)

**`CopeRoomCard` → "Regenerate COPE Only" button** — [rooms-tab.tsx:1853](app/admin/projects/[id]/rooms/rooms-tab.tsx:1853), button click handler at [rooms-tab.tsx:1985–2005](app/admin/projects/[id]/rooms/rooms-tab.tsx:1985):

```ts
async function handleGenerateCope() {
  setGenerating(true);
  setError(null);
  try {
    const res = await fetch("/api/cope-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) { ... }
    onEstimateGenerated();
  } ...
}
```

Button disabled when `generating || !otherRoomsHaveEstimates`. Gate is at [rooms-tab.tsx:1861](app/admin/projects/[id]/rooms/rooms-tab.tsx:1861):

```ts
otherRoomsHaveEstimates={rooms.some(
  (r) => !r.isProjectOverhead && r.pricingTier === "AI_ESTIMATE"
)}
```

**Note:** `pricingTier` is a ROOM-level configuration field ("how this room is priced"), set manually or when a template is applied. It does NOT reflect whether an estimate has been generated for that room. So the button is enabled as soon as ANY room is tagged `AI_ESTIMATE`, regardless of whether estimates exist. The server-side validation at [cope-estimate/route.ts:78](app/api/cope-estimate/route.ts:78) catches the "no actual estimates yet" case with a 400.

### 2b. Legacy UI entry points (removed)

- `bulk-ai-estimate-modal.tsx` had an `includeCope` checkbox — deleted in Phase 8B.
- `bulk-review-and-estimate-modal.tsx` had the same checkbox — Phase 8B also stripped it and moved the intent note into [bulk-review-and-estimate-modal.tsx:340–350](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:340) JSDoc: *"COPE retains its existing per-COPE-room generator on the rooms tab, run after the banner reports COMPLETED."*

### 2c. API route

**Only one:** `POST /api/cope-estimate` at [app/api/cope-estimate/route.ts](app/api/cope-estimate/route.ts).

- `POST` accepts `{ projectId }` only
- `GET` at [cope-estimate/route.ts:225](app/api/cope-estimate/route.ts:225) reads the latest COPE estimate for a project — used by the UI to display the COPE room's current estimate (same as room estimates).

No server action wrapper — client fetches the route directly.

### 2d. No bulk COPE endpoint exists

There is no "generate COPE for all projects" or "regen N COPE estimates" endpoint. The concept doesn't exist — COPE is one-per-project.

---

## 3. Generation Flow — Server Side

Sequence inside `POST /api/cope-estimate` ([app/api/cope-estimate/route.ts:13–221](app/api/cope-estimate/route.ts:13)):

1. **Validate** — `projectId` required; 400 otherwise.
2. **Find COPE room** — [cope-estimate/route.ts:26](app/api/cope-estimate/route.ts:26): `prisma.room.findFirst({ where: { projectId, isProjectOverhead: true } })`. If missing → 400. (The COPE room is normally created at project creation time by `ensureCopeRoom()` at [app/lib/ensure-cope-room.ts:3](app/lib/ensure-cope-room.ts:3).)
3. **Load COPE template** — [cope-estimate/route.ts:37](app/api/cope-estimate/route.ts:37): `prisma.roomTemplate.findFirst({ where: { isProjectOverhead: true, active: true } })` with nested `tradeGroups.items.catalogItem`. If missing → 500.
4. **Load `CompanyContext`** — 500 if missing.
5. **Load project** — only `defaultCeilingHeightFt` and `projectQA`.
6. **Aggregate project data** — `getProjectAggregateData(projectId, defaultCeilingHeightFt)` at [app/lib/cope-aggregate-data.ts:5](app/lib/cope-aggregate-data.ts:5). This is the heart of COPE's "project-level" reasoning:
   - Loads all non-COPE rooms ([cope-aggregate-data.ts:10](app/lib/cope-aggregate-data.ts:10))
   - For each room: finds the most recent `AIEstimate` with all line items ([cope-aggregate-data.ts:26–35](app/lib/cope-aggregate-data.ts:26))
   - Aggregates line items across every estimate by trade group ([cope-aggregate-data.ts:38–51](app/lib/cope-aggregate-data.ts:38))
   - Sums `estimate.totalPrice` and `estimate.totalCost` into `totalEstimatedPrice`/`totalEstimatedCost` ([cope-aggregate-data.ts:54–61](app/lib/cope-aggregate-data.ts:54))
   - Computes `totalEffectiveSqFt` via `getEffectiveProjectSF` (sums room SF + sub-areas) ([cope-aggregate-data.ts:64](app/lib/cope-aggregate-data.ts:64))
   - Flags scope characteristics (`hasFraming`, `hasPlumbing`, `hasElectrical`, `hasWindows`) from trade-group presence + line-item name scanning ([cope-aggregate-data.ts:71–82](app/lib/cope-aggregate-data.ts:71))
   - Pre-calculates permit fees via `calculatePermitFee()` ([cope-aggregate-data.ts:85](app/lib/cope-aggregate-data.ts:85))
7. **Guard: refuse to run if no estimates exist** — [cope-estimate/route.ts:78](app/api/cope-estimate/route.ts:78):
   ```ts
   if (aggregateData.roomsWithEstimates === 0) {
     return NextResponse.json({ error: "Generate room estimates first before generating COPE." }, { status: 400 });
   }
   ```
   A **partial** set of room estimates is acceptable — COPE runs on whatever is there.
8. **Build prompt** — `buildCopeUserPrompt(aggregateData, copeTemplate, companyContext, projectQA)` at [app/lib/cope-estimate-prompt.ts:162](app/lib/cope-estimate-prompt.ts:162). Includes room-by-room summary (uses `r.totalTarget` for each room's price in the text, falling back to "no estimate" — interestingly this reads `Room.totalTarget` which is only set once an estimate is ACCEPTED, but `totalEstimatedPrice` uses `estimate.totalPrice` directly, so the math is correct even if display text shows "no estimate" for un-accepted rooms).
9. **Call Claude** — `streamClaude({ max_tokens: 64000, temperature: 0.2, system: COPE_SYSTEM_PROMPT, messages: [...] })` ([cope-estimate/route.ts:97](app/api/cope-estimate/route.ts:97)). Same wrapper + retry/fallback as per-room. **Not using the prompt-caching array format** — plain string for both system and user messages. Caching opportunity flagged in §11.
10. **Parse** — `parseEstimateResponse(rawText, catalogItems)` — same parser as per-room.
11. **Persist** — [cope-estimate/route.ts:129–167](app/api/cope-estimate/route.ts:129): creates a new `AIEstimate` row with `sectionId = copeRoom.id` plus nested `lineItems`. **No upsert** — every call creates a NEW AIEstimate row. Previous ones remain; the UI uses `findFirst({ orderBy: createdAt desc })` to pick the latest.
12. **Recompute rollups** — [cope-estimate/route.ts:170](app/api/cope-estimate/route.ts:170): `await recomputeInvestmentRollups(projectId)`. This is COPE-specific (the per-room estimate route does NOT call this; it's only called on estimate acceptance + COPE generation + direct room pricing edits).
13. **Track catalog suggestions** — per `AI_PRICED` line item, the same non-atomic pattern the per-room route had pre-Phase-8B ([cope-estimate/route.ts:174–200](app/api/cope-estimate/route.ts:174)) — **this has the same race condition the Phase 8B atomic UPSERT fixed, but it's not on the parallel path** so for now it's safe. Would be worth aligning to `upsertCatalogSuggestion()` in a cleanup pass.
14. **Respond** — `{ estimate, aggregateData: { totalEstimatedPrice, roomCount, roomsWithEstimates }, warnings, usage }`.

**No file/R2 operations, no email, no webhook.**

---

## 4. Data Dependencies & Stale-Data Risk

### 4a. COPE reads fresh data every call

Every `POST /api/cope-estimate` call re-runs the full query pipeline in `getProjectAggregateData`. No caching layer, no memoization. This is good — auto-trigger at job-completion time sees the freshly-written `AIEstimate` rows.

### 4b. Does COPE depend on all rooms being done, or can it run per-room?

**COPE is a project-level calculation.** It doesn't make sense to "run COPE per room". The prompt's reasoning depends on aggregate signals:
- `totalEstimatedPrice` across all rooms (drives permit fees, supervision hours, dumpster count)
- `tradeBreakdown` across all line items (drives HOA, waste, protection math)
- `totalEffectiveSqFt` across all rooms (drives cleaning + floor protection SF)

Running COPE when only 3 of 20 rooms have estimates would produce a COPE that under-counts permit fees and supervision — because `totalEstimatedPrice` would be $50K instead of $300K, and the prompt's tiered logic would kick into the wrong bracket (under $50K = 4–8 weeks, versus $300K = 24–36 weeks).

### 4c. Does COPE tolerate a partial set of room estimates?

Yes — it refuses only the all-zero case (`roomsWithEstimates === 0`). For auto-trigger this means:
- **EstimateJob COMPLETED** (all rooms succeeded): fire COPE — will see all estimates, produce correct numbers.
- **EstimateJob PARTIAL** (some failed): fire COPE but the numbers will under-count. Might be better UX to SKIP auto-trigger on PARTIAL and let the user retry failed rooms, THEN run COPE. (Recommendation §11.)
- **EstimateJob FAILED** (all failed): server-side 400 would fire — nothing to COPE over.

### 4d. Race timing — is the fresh-read window guaranteed?

The EstimateJob's `rollUpJobStatus` ([estimate-job.ts:98](app/lib/ai/estimate-job.ts:98)) sets status to COMPLETED inside the SAME transaction as the final `JobItem`'s status flip. After that transaction commits, any subsequent `prisma.aIEstimate.findFirst` sees all the writes. So an auto-trigger fired FROM the worker (after the transaction) or FROM a polling client (after seeing COMPLETED) is guaranteed to read fresh estimates. No explicit barrier needed.

---

## 5. Status Tracking & Idempotency

### 5a. No explicit COPE status fields

Searched `prisma/schema.prisma` for `copeGeneratedAt`, `copeStatus`, `copeStaleReason` — **none exist**.

The "has COPE been generated?" signal is derived:

```ts
// Pseudo
const copeRoom = await prisma.room.findFirst({ where: { projectId, isProjectOverhead: true } });
const latestCope = await prisma.aIEstimate.findFirst({
  where: { sectionId: copeRoom.id, projectId },
  orderBy: { createdAt: "desc" },
});
const hasCope = !!latestCope;
```

This is how `GET /api/cope-estimate?projectId=...` works ([cope-estimate/route.ts:225–266](app/api/cope-estimate/route.ts:225)) — returns `{ estimate: null }` if no AIEstimate exists yet.

### 5b. Overwrite / idempotency behavior

**Every call creates a new AIEstimate row.** There is no deduplication, no "already exists" guard, no version-bumping. Running COPE twice in a row yields two AIEstimate rows; the GET always returns the newest.

Implications for auto-trigger:
- If the EstimateJob worker auto-triggers COPE AND the user also clicks "Regenerate COPE Only" → two AIEstimate rows created; latest wins. Not destructive, but wasteful (120s of Anthropic tokens).
- If a user clicks the banner's "Generate COPE for all" button multiple times rapidly → duplicate rows.

**Phase 8C must add a guard.** Recommended: an in-flight lock (see §11).

### 5c. No stale-COPE signal

For per-room estimates, `Room.estimateStaleReason` exists to flag "your dimensions changed, regenerate". There's no equivalent for COPE. If a user regenerates all room estimates, there's currently no visual indicator that the existing COPE is now stale until they hit regenerate — even though its `totalEstimatedPrice` is almost certainly outdated.

This is out-of-scope for 8C build but worth noting as an observability gap.

---

## 6. Timing Estimates

### 6a. Per-call wall-clock

- **Model & params:** `streamClaude` with `claude-sonnet-4-6` (or tenant-configured), `max_tokens: 64000`, `temperature: 0.2` ([cope-estimate/route.ts:97–102](app/api/cope-estimate/route.ts:97)).
- **Prompt size:** The system prompt alone is ~5,000 characters (~1,250 tokens). The user prompt includes the full catalog section + room summary + aggregated line items. For a 10-room project with ~40 line items each, the user prompt is likely ~8,000–15,000 tokens.
- **Output:** COPE templates typically yield 30–50 line items (similar to a room estimate). At Sonnet 4.6's streaming throughput (~50–100 tokens/s), that's roughly **60–120 seconds** per call.
- **Real-world reference:** the Phase 8B smoke test showed a Primary Bedroom estimate running 108.9s with 7,155 output tokens. COPE should land in the same band.

### 6b. Parallel scenarios

**Not applicable.** COPE is one call per project. Concurrency is 1 by definition.

### 6c. Vercel timeout risk

`POST /api/cope-estimate` has **no `maxDuration` export** — it inherits Next.js default (~10s Hobby, ~60s Pro, up to 900s on higher plans). At 60–120s per call, **this route will time out on Hobby/Pro plans** when auto-trigger fires for a large project.

Mitigation options for Phase 8C:
1. Add `export const maxDuration = 300;` to the route (requires Vercel Pro+).
2. Route auto-trigger through a QStash worker (same pattern as Phase 8B's `/api/jobs/estimate-room`) — worker runs with its own `maxDuration = 300`. This is the safer path if there's any chance of deploying to a plan without extended duration.

### 6d. Cost estimate

Input tokens ~10,000 uncached + output ~6,000 = at current Sonnet pricing roughly $0.03–$0.08 per COPE call. Not cost-sensitive at one call per project; adding prompt caching for the system prompt + catalog section would shave ~60% off input cost on repeat regenerations.

---

## 7. Failure Handling

### 7a. Current state — none

- **No retries.** `streamClaude`'s built-in 3-retry loop + fallback-to-Sonnet is the only safety net. If it exhausts those, the route returns 500 to the client.
- **No partial-result tolerance.** Parse failures are all-or-nothing — either all COPE line items write, or none (single transaction via `prisma.aIEstimate.create({ ... lineItems: { create: [...] } })`).
- **Max-tokens truncation is a hard 502.** [cope-estimate/route.ts:114–119](app/api/cope-estimate/route.ts:114):
  ```ts
  if (response.stop_reason === "max_tokens") {
    return NextResponse.json({ error: "AI response was truncated (max_tokens reached)." }, { status: 502 });
  }
  ```
  Unlike per-room estimate, COPE does NOT attempt a repair parse. Max-tokens = user must regenerate. (Probably fine since COPE output is normally well under 64K tokens.)
- **Client-side UI handling:** `CopeRoomCard` sets local `error` state, displays it inline red ([rooms-tab.tsx:1999–2003](app/admin/projects/[id]/rooms/rooms-tab.tsx:1999)). No toast, no retry button.

### 7b. Gap for Phase 8C auto-trigger

If auto-trigger fires and COPE fails silently (worker route returns 500), there's no existing user-facing signal. The banner shows the EstimateJob as COMPLETED but COPE never ran.

Recommendation §11 proposes: fold COPE success/failure into the existing progress banner's terminal state, or add a second small surface.

---

## 8. Existing Bulk Support

**None.** There is only `POST /api/cope-estimate` which operates on exactly one project. No endpoint accepts a list of project IDs or iterates across projects.

This is fine for Phase 8C because the "bulk" framing in the spec (§8C Goal #2) is actually "one project, one COPE call" — the button name "Generate COPE for all" is misleading. There's only ever one COPE to generate per project.

Recommendation §11: rename the button to something like **"Generate project overhead"** or **"Calculate COPE"** — the "for all" suffix implies a loop that doesn't exist and would confuse future maintainers.

---

## 9. Banner Integration Options

### 9a. Current banner terminal-state structure

`<EstimateJobProgressBanner />` at [app/admin/_estimate-job/progress-banner.tsx](app/admin/_estimate-job/progress-banner.tsx) has three terminal-state blocks:

- `status === "COMPLETED"` at [progress-banner.tsx:215–228](app/admin/_estimate-job/progress-banner.tsx:215)
- `status === "PARTIAL"` at [progress-banner.tsx:229–241](app/admin/_estimate-job/progress-banner.tsx:229)
- `status === "FAILED"` at [progress-banner.tsx:242–255](app/admin/_estimate-job/progress-banner.tsx:242)

Each is a `<p>` with a summary sentence and a "Open project" / "Review & retry" link. Adding a button is straightforward — same indentation as the current link, e.g.:

```tsx
{status === "COMPLETED" && (
  <div className="mt-1 text-xs text-zinc-600 ...">
    All {total} estimates ready.{" "}
    {projectId && (<Link href={...}>Open project</Link>)}
    {copeAllowed && <button onClick={handleGenerateCope} ...>Generate project overhead</button>}
  </div>
)}
```

### 9b. Which terminal states get the button?

- **COMPLETED:** Button is the happy path. Include it.
- **PARTIAL:** Button could show with a warning tooltip ("Project overhead will be based on {N} of {total} rooms; retry failed rooms first for more accurate numbers"). OR: hide the button and only show "Review & retry" until the job is fully COMPLETED. The latter is cleaner; the former is more flexible.
- **FAILED:** No estimates exist → COPE would 400. Hide the button entirely.

### 9c. Button → banner state transition

When the button is clicked, the banner has two options for representing COPE progress:

1. **Reuse the banner as-is** by creating a new `EstimateJob` with `totalItems = 1` and a synthetic JobItem that wraps COPE. This shoehorns COPE into the existing progress UX but pollutes the EstimateJob table with 1-item jobs.
2. **Add a light COPE-specific UI state** to the banner — e.g., the COMPLETED state flips to "Generating project overhead..." with its own spinner, then to "All estimates + project overhead ready". This is cleaner.

Recommendation §11 covers this.

### 9d. Rooms-tab entry point (ad-hoc button)

The spec wants a button "on the rooms tab for ad-hoc use". Two options:

- **Replace `CopeRoomCard`'s "Regenerate COPE Only" button** with a banner-tied version so clicks surface progress in the same UI as auto-trigger. Removes one UX divergence.
- **Keep both** — the CopeRoomCard retains its inline generator for users who want to operate just on the COPE row, and the rooms-tab gains an additional top-level button that triggers via the banner. Redundant but backwards-compatible.

The first is cleaner. The second is less risky.

---

## 10. Relevant Schema

**Read during COPE generation:**

- `Room` (find COPE room + all non-COPE rooms + per-room metadata)
- `AIEstimate` (latest per room, with nested `lineItems`)
- `EstimateLineItem` (aggregation source for trade breakdown)
- `RoomTemplate` + `RoomTemplateTradeGroup` + `RoomTemplateItem` + `PricingCatalogItem` (COPE template catalog for the prompt)
- `CompanyContext` (market, finish tier, markup notes, price range pcts)
- `Project` (defaultCeilingHeightFt, projectQA, rooms relation for sub-area SF)
- `RoomSubArea` (via `getEffectiveProjectSF`)

**Written during COPE generation:**

- `AIEstimate` (one new row with `sectionId = copeRoom.id`)
- `EstimateLineItem` (nested create — typically 30–50 rows)
- `CatalogSuggestion` (upsert for each `AI_PRICED` line item — same non-atomic pattern that was fixed for per-room estimates)
- `InvestmentLineItem` (via `recomputeInvestmentRollups`)

**Relevant to auto-trigger:**

- `EstimateJob.status` (drives the "fire now?" decision)
- `EstimateJob.completedItems` (the auto-trigger should fire only when status rolls to COMPLETED or PARTIAL)
- No `CopeJob` model needed — see §11.

---

## 11. Recommendations for Phase 8C Build

Ordered by priority:

### 11a. Correct the spec's "for every room" premise

The spec repeatedly says "generate COPE for every room that received an estimate". **There is no per-room COPE.** Both triggers reduce to firing ONE `POST /api/cope-estimate` call per project. Rename the button and doc language accordingly — suggest **"Calculate project overhead"** or **"Generate project COPE"** over "Generate COPE for all".

### 11b. Auto-trigger should fire on `COMPLETED` only, not `PARTIAL`

A PARTIAL job means some rooms failed. COPE on partial data under-counts permits, supervision, cleaning SF — materially wrong outputs. Better UX: show the "Retry failed rooms" bar (already exists from Phase 8B's RetryFailedRoomsBar), let the user fix the partial set, and auto-trigger COPE only when the job is cleanly COMPLETED. The user retains the manual button for "I don't care, give me COPE anyway" override.

Implement: inside `rollUpJobStatus` ([estimate-job.ts:98](app/lib/ai/estimate-job.ts:98)), or immediately after, check `finalStatus === "COMPLETED"` and publish a one-shot QStash message to a new `/api/jobs/generate-cope` worker (NOT the existing estimate-room worker; COPE is a different workload).

### 11c. Route the call through QStash — don't add a CopeJob model

The straight path is:

```ts
// Inside the estimate-room worker's completion transaction (or a follow-up step):
if (finalStatus === "COMPLETED") {
  await publishCopeWorkerMessage(projectId, estimateJobId);
}
```

And a new worker route `POST /api/jobs/generate-cope` that:
1. `verifySignatureAppRouter` — reuse existing QStash signing
2. `export const maxDuration = 300;`
3. Reads `{ projectId, estimateJobId }` from the body
4. Checks for an in-flight COPE lock (see §11d)
5. Calls the existing `POST /api/cope-estimate` logic inline (extract to `app/lib/ai/generate-project-cope.ts` service, same shape as Phase 8B's `generate-room-estimate.ts`)
6. Persists status to... where?

The "where" is the question. Three options:

1. **New `ProjectCopeJob` model** — tiny table: `{ id, projectId, estimateJobId?, status, error?, startedAt, finishedAt }`. Clean, observable. Moderate new surface area.
2. **Add `copeStatus`/`copeGeneratedAt`/`copeError` fields on `Project`** — simplest. Schema change but no new model. Loses history (only shows the most-recent run).
3. **Just poll the AIEstimate count on the COPE room** — no new schema, but no "in-flight" signal; UI can't distinguish "never run" from "running right now".

**Recommendation: option 2 (Project fields)** — the banner needs to show transient progress, not long-term history. If deeper observability is needed later, we can migrate to option 1 with back-fill.

### 11d. Idempotency / in-flight lock

Add a field `Project.copeStatus String?` with values `{ null | "running" | "completed" | "failed" }`. The worker:
- Checks `copyStatus === "running"` → return early with `{ status: "already_running" }`
- Sets to `"running"` at start, `"completed"` on success, `"failed"` on error with `copeError` message
- Optional: short TTL (reset `running` to null if `copeStartedAt` is older than 10 min to self-heal after a crashed worker)

This handles all three idempotency cases from §10:
- Double-click the button → second click sees `"running"` and no-ops
- Auto-trigger + manual click → whichever fires second sees `"running"` and no-ops
- QStash re-delivery of the same webhook → worker sees own `"running"` flag (or prior `"completed"`) and no-ops

### 11e. Banner state for COPE

Keep the EstimateJob as the primary progress surface. Add two small things:

1. A `copeStatus` sidecar block below the terminal state text — e.g. after "All 20 estimates ready", show "Generating project overhead..." then "Project overhead complete".
2. The `GET /api/jobs/[id]` endpoint should be extended to include `project.copeStatus` + `copeGeneratedAt` so the banner doesn't need to poll a second endpoint.

This keeps the UX coherent: one banner, one dismiss-click, one persistence story.

### 11f. Ad-hoc button placement

Put the manual button on the banner's terminal state (COMPLETED or PARTIAL) AND update `CopeRoomCard` to use the same server action. Reduces divergence.

For the COMPLETED state:
- Before COPE has run: show "Generate project overhead" button
- While COPE is running: show inline spinner, "Generating project overhead..."
- After COPE has run: show "Project overhead complete — $X,XXX" or similar

### 11g. Prompt caching (quick win, same as Phase 8B)

The COPE route still sends `system: COPE_SYSTEM_PROMPT` as a plain string and the user prompt as one long string. Mirror the per-room refactor: split the user prompt into a `staticBlock` (catalog section + required JSON format) + `dynamicBlock` (aggregate data + room summary + project QA) and add `cache_control: ephemeral` to the system block and the static user block. ~60% input-token savings on regeneration. Can be deferred to a cleanup PR if 8C is getting too big.

### 11h. Fix the same race condition Phase 8B fixed

[cope-estimate/route.ts:174–200](app/api/cope-estimate/route.ts:174) still has the old non-atomic `CatalogSuggestion` upsert-then-update pattern. Swap in `upsertCatalogSuggestion()` from `app/lib/ai/generate-room-estimate.ts`. Safe on the single-threaded COPE path today, but it would diverge from the new standard. Low-effort alignment.

### 11i. Concurrency for COPE

N/A — one call per project. No flow-control key needed (or use a trivial `cope-worker` key with parallelism 1 if we want visible rate-limit guard-railing).

---

## 12. Open Questions

1. **Should auto-trigger fire on PARTIAL jobs, or wait for the user to retry to COMPLETED?** My recommendation in §11b is to fire only on COMPLETED, but a user who KNOWS they won't fix the partial set (e.g., one room failed due to permanently-missing data) might want COPE to run anyway. Two flows: (a) COMPLETED only, manual button for PARTIAL; (b) COMPLETED + PARTIAL with a warning. Steve to pick.

2. **Project fields vs new CopeJob model?** Option 2 in §11c is my recommendation — less surface area, simpler. But if we anticipate wanting COPE history (auditing, comparing versions over time) in Phase 8D+, option 1 is cheaper to add now than to retrofit later.

3. **Should the `CopeRoomCard` "Regenerate COPE Only" button be replaced or kept?** §11f proposes converting it to fire through the banner. Alternative: keep it inline for users who prefer operating on the COPE row and don't want the banner's overlay. Low-stakes UX question.

4. **Should we prompt-cache COPE in Phase 8C, or defer?** §11g is a clear win but adds scope. Given that COPE runs ~once per project per day, the cost saving is modest. Defer if 8C is getting long.

5. **Max duration on `/api/cope-estimate`?** If we keep the existing direct-fetch button, we need `maxDuration = 300` on the HTTP route OR route all COPE through the QStash worker and make the HTTP route a thin wrapper that publishes + returns immediately (like Phase 8B's bulk route). The latter is cleaner but requires more UI plumbing to show "queued".

6. **Should auto-trigger be opt-in via settings?** A power user might want the raw EstimateJob completion WITHOUT an auto-COPE (e.g., they want to inspect the estimates first). Adding `CompanySettings.copeAutoTrigger Boolean @default(true)` is a 5-minute addition and gives us an escape hatch. Recommended.

7. **Should a stale-COPE warning be added to `Room.estimateStaleReason`-style flags?** Out of scope for 8C but worth flagging — when a room's estimate regenerates after COPE exists, COPE is now based on old data. Today there's no indicator.

---

**End of report.**

# Phase 8A — AI Estimate Generation Pipeline Investigation

**Date:** 2026-04-21
**Branch:** proposal-v2
**Scope:** Read-only mapping of the estimate-generation pipeline in preparation for Phase 8B (background job processing + parallelization).

---

## 1. Executive Summary

- **Bulk estimates are driven by a client-side sequential `for` loop**, not by server-side orchestration. Each room makes a round-trip HTTP POST to `/api/ai-estimate`, and the next room does not start until the previous finishes. This is the core bottleneck.
- **Each room estimate does exactly one Claude streaming call** (`streamClaude`, `max_tokens: 64000`). Review-question generation (pre-estimate) is a second call per room but is *already* parallelized server-side via `Promise.all`.
- **There is no server-side job model, no progress tracking in the DB, no retry orchestration, and no resumability.** Progress lives only in client React state. A page refresh loses in-flight state (completed rooms persist because each is its own DB write).
- **No `maxDuration` is configured on any AI route.** On Vercel Hobby this caps at 10s, Pro at 60s; on Node self-host the socket idle determines it. 20-room kitchens with 60–180s per room fundamentally will not complete in a single request, regardless.
- **Infrastructure for background jobs is partially present.** `@upstash/qstash` is installed and there is a working `/api/qstash/test` verification route. No job schema or orchestration exists yet.

---

## 2. Entry Point & Trigger Flow

### 2a. Bulk trigger (primary user path)

UI entry → [app/admin/projects/[id]/rooms/rooms-tab.tsx:1830](app/admin/projects/[id]/rooms/rooms-tab.tsx:1830) renders `<BulkReviewAndEstimateModal />` when the user clicks the bulk-estimate button.

The modal has four phases:

1. **Select** — pick rooms + templates.
2. **Review** — calls `POST /api/ai-review/batch` ([app/api/ai-review/batch/route.ts:109](app/api/ai-review/batch/route.ts:109)) — one request that fans out Claude calls in parallel server-side.
3. **Generating** — saves QA answers in parallel, then runs **estimate generation sequentially** (see §3), calling `POST /api/ai-estimate` per room.
4. After all rooms, optionally `POST /api/cope-estimate` for the project-overhead COPE room.

A second older entry point exists at [app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx:51](app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx:51) (`BulkAiEstimateModal`). Same sequential pattern. It appears to be legacy — the unified `BulkReviewAndEstimateModal` is what [rooms-tab.tsx:1830](app/admin/projects/[id]/rooms/rooms-tab.tsx:1830) now renders. **Open Question 11.1**: confirm `BulkAiEstimateModal` is dead.

### 2b. Per-room trigger

`<AIEstimatePanel />` at [app/admin/projects/[id]/rooms/ai-estimate-panel.tsx](app/admin/projects/[id]/rooms/ai-estimate-panel.tsx) — the right-hand inspector for a single selected room. Calls the same `POST /api/ai-estimate` for a single room, or `POST /api/ai-estimate/[estimateId]/regenerate` on retry.

### 2c. Server-side chain (single room)

[app/api/ai-estimate/route.ts:13](app/api/ai-estimate/route.ts:13) `POST` →
- Loads `RoomTemplate` + `tradeGroups` + `catalogItem` ([ai-estimate/route.ts:38](app/api/ai-estimate/route.ts:38))
- Loads `CompanyContext`, `Room`, `Project`
- `getEffectiveRoomMetrics()` ([ai-estimate/route.ts:98](app/api/ai-estimate/route.ts:98)) — reads Rendr / sub-area data
- `getCorrectionHistory(roomTemplateId)` ([app/lib/ai-estimate-prompt.ts:185](app/lib/ai-estimate-prompt.ts:185)) — reads `PriceCorrection` table
- `buildUserPrompt(...)` ([ai-estimate/route.ts:109](app/api/ai-estimate/route.ts:109))
- `streamClaude({ max_tokens: 64000, temperature: 0.2, system: SYSTEM_PROMPT, messages: [...] })` ([ai-estimate/route.ts:124](app/api/ai-estimate/route.ts:124)) — the **only** Claude call
- `parseEstimateResponse(rawText, catalogItems)` ([ai-estimate/route.ts:148](app/api/ai-estimate/route.ts:148))
- `prisma.aIEstimate.create({ ...lineItems: { create: [...] } })` ([ai-estimate/route.ts:155](app/api/ai-estimate/route.ts:155))
- Clears `Room.estimateStaleReason` ([ai-estimate/route.ts:196](app/api/ai-estimate/route.ts:196))
- For every `AI_PRICED` item, upserts into `CatalogSuggestion` with a raw running-average UPDATE ([ai-estimate/route.ts:202–233](app/api/ai-estimate/route.ts:202))

### 2d. COPE flow

[app/api/cope-estimate/route.ts:13](app/api/cope-estimate/route.ts:13) — same shape. Additionally calls `recomputeInvestmentRollups(projectId)` after the estimate is persisted ([cope-estimate/route.ts:170](app/api/cope-estimate/route.ts:170)).

---

## 3. Iteration Pattern — **SEQUENTIAL**

**Verdict:** Fully sequential client-side. This is the single most impactful finding for Phase 8B.

### 3a. `BulkReviewAndEstimateModal` (primary path)

[app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:412–450](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:412):

```ts
for (let i = 0; i < toProcess.length; i++) {
  const row = toProcess[i]!;
  setGenProgress({ current: i + 1, total: toProcess.length });

  setGenRows((prev) =>
    prev.map((r) => (r.roomId === row.roomId ? { ...r, status: "generating" } : r)),
  );

  try {
    const room = estimateRooms.find((r) => r.id === row.roomId);
    const res = await fetch("/api/ai-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        sectionId: row.roomId,
        roomTemplateId: row.templateId,
        scopeNarrative: room?.scopeNarrative ?? "",
      }),
    });
    ...
  } catch (err) { ... }
}
```

`await` on every `fetch`. No `Promise.all`, no concurrency, no throttle.

### 3b. `BulkAiEstimateModal` (legacy)

Same pattern at [app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx:121–163](app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx:121).

### 3c. The *review* step is already parallel

Worth noting — we already have a parallel pattern in the codebase. [app/api/ai-review/batch/route.ts:127–145](app/api/ai-review/batch/route.ts:127):

```ts
const roomPromises = roomIds.map(async (roomId) => {
  try {
    const questions = await generateRoomQuestions(roomId, projectId);
    return { roomId, questions, error: null };
  } catch (err) {
    return { roomId, questions: [], error: err instanceof Error ? err.message : "Failed" };
  }
});

const [roomResults, projectResult] = await Promise.all([
  Promise.all(roomPromises),
  projectPromise,
]);
```

This is unbounded concurrency — no `p-limit` or semaphore. Fine for 4k-max-token review calls but not the pattern we want to reuse unchanged for 64k-max-token estimate calls.

### 3d. Anthropic calls per room

- **1 Claude call** per room *estimate* (`streamClaude`, `max_tokens: 64000`).
- **1 Claude call** per room *review* (`callClaude`, `max_tokens: 4000`) — happens before the estimate in the review-and-generate flow but is wrapped in `Promise.all` already.
- **1 Claude call** per project (COPE `streamClaude`, `max_tokens: 64000`) — runs after all rooms.

No retries, tool-use loops, or chained calls inside a single estimate request — it's a one-shot completion.

### 3e. Inter-room dependencies

**None.** Rooms are fully independent during estimate generation. `CatalogSuggestion` upserts at [ai-estimate/route.ts:202–233](app/api/ai-estimate/route.ts:202) do write to a shared table, but the upsert is keyed by `itemName` and uses a raw `UPDATE ... WHERE "itemName" = ...`, so two rooms hitting the same item name at the same time could race on the running-average math. Low-risk but worth noting.

**COPE does depend on rooms finishing** — [cope-estimate/route.ts:78](app/api/cope-estimate/route.ts:78) aborts if `aggregateData.roomsWithEstimates === 0`, and its prompt reads room totals.

---

## 4. Per-Room Workflow (Step-by-Step)

For one room, the full server-side sequence:

1. **Auth / validation** — `projectId`, `sectionId`, `roomTemplateId`, `scopeNarrative` required. ([ai-estimate/route.ts:20–35](app/api/ai-estimate/route.ts:20))
2. **DB reads (serial)** — `RoomTemplate` (deep include), `CompanyContext`, `Room` (with `scopeQA`/`roomDetail`), `Project`. ~4 queries.
3. **Compute room metrics** — `getEffectiveRoomMetrics()` reads sub-areas + Rendr context.
4. **Correction history** — `getCorrectionHistory(roomTemplateId)` reads `PriceCorrection` rows.
5. **Prompt assembly** — `buildUserPrompt(...)`. Includes catalog items (all of them for that template, typically 40–200 items), scope narrative, QA answers, fixture data, dimensions. Typical prompt size is likely 15k–40k input tokens (not measured here — see Open Question 11.3).
6. **Claude API call** — `streamClaude({ max_tokens: 64000, temperature: 0.2 })`. Uses `.finalMessage()` to block until the full stream completes. ([ai-estimate/route.ts:124](app/api/ai-estimate/route.ts:124))
7. **Parse** — `parseEstimateResponse(rawText, catalogItems)`. Includes JSON-repair for truncated responses. Validates source tags and catalog matches.
8. **Persist** — Single `prisma.aIEstimate.create({ lineItems: { create: [...] } })`. One transaction per room. ([ai-estimate/route.ts:155](app/api/ai-estimate/route.ts:155))
9. **Side effects:**
   - Clear `Room.estimateStaleReason` ([ai-estimate/route.ts:196](app/api/ai-estimate/route.ts:196))
   - For each `AI_PRICED` line item: `CatalogSuggestion.upsert` + raw `UPDATE` to recompute running-avg price/cost. ([ai-estimate/route.ts:202–233](app/api/ai-estimate/route.ts:202))

**No file/R2 operations.** **No email / webhook.** **`recomputeInvestmentRollups` is NOT called from `/api/ai-estimate`** — it's only called from `/api/cope-estimate` and the estimate-accept PATCH does not call it either (it sets Room totals directly).

**Critical side-effect observation:** Creating an AI estimate does **not** automatically update `Room.totalLow/Target/High`. Those fields are only written when the estimate is **accepted** via `PATCH /api/ai-estimate/[estimateId]/accept` ([app/api/ai-estimate/[estimateId]/accept/route.ts:30–38](app/api/ai-estimate/[estimateId]/accept/route.ts:30)). So the investment rollup is not touched during generation at all. This is a clean boundary.

---

## 5. Rate Limiting & Error Handling

### 5a. Retry logic — SDK-level only

[app/lib/ai/model.ts:38–95](app/lib/ai/model.ts:38):

```ts
try {
  const anthropic = new Anthropic({ apiKey, maxRetries: 3 });
  return await anthropic.messages.create({ ...params, model: primaryModel });
} catch (err) {
  if (!isOverloadedError(err) || primaryModel === FALLBACK_CLAUDE_MODEL) throw err;
  console.warn(`[callClaude] ${primaryModel} overloaded after 3 retries — falling back to ${FALLBACK_CLAUDE_MODEL}`);
  const anthropic = new Anthropic({ apiKey, maxRetries: 2 });
  return await anthropic.messages.create({ ...params, model: FALLBACK_CLAUDE_MODEL });
}
```

- SDK handles retry backoff automatically (`maxRetries: 3`).
- On `529` / `overloaded_error` after 3 retries, falls back to Sonnet 4.6 with another 2 retries.
- No retry for 429 rate-limit errors beyond the SDK default (the SDK does retry 429 as well, so this is OK).
- No retry for 500/502 beyond the SDK default.
- No retry for parse failures in our code.

### 5b. Concurrency throttling

**None.** Bulk estimate loop is sequential; no semaphore, no `p-limit`. The `ai-review/batch` route has unbounded `Promise.all` concurrency.

### 5c. Partial failure behavior

If a single room fails, the `try/catch` inside the client loop ([bulk-review-and-estimate-modal.tsx:441–449](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:441)) marks that row `status: "error"` and **continues** with the next room. The per-room error is stored only in React state (`row.error`). No DB record of the failure.

The COPE step at the end runs regardless of how many room errors occurred ([bulk-review-and-estimate-modal.tsx:462](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:462)) — it depends only on `roomsWithEstimates > 0` server-side. If *every* room fails, COPE will also fail.

### 5d. Anthropic tier limits (not empirically measured)

Default Claude tier-1 API limits (per Anthropic docs as of cutoff):
- Requests/min: ~50
- Input tokens/min: ~20k–50k
- Output tokens/min: ~8k

A 64k-max-output estimate call that uses, say, 20k output tokens is already 2.5× the per-minute output budget. Bursting 10+ rooms into `Promise.all` will hit a 429 very quickly on a low tier. **Open Question 11.2** — what tier are we on?

---

## 6. Progress & State Tracking

Entirely client-side. No DB status field tracks in-flight generation.

- `rows: SelectRow[]` / `genRows: RoomGenRow[]` — React state in the modal with `status: "pending" | "generating" | "done" | "error" | "skipped"`.
- `genProgress: { current, total }` — numeric counter for the footer.
- UI elements: per-row spinner ([bulk-review-and-estimate-modal.tsx:783–786](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:783)), checkmark on done, red X on error, "skip" tag on skipped.

**Done signal:** The `handleConfirmAndGenerate` async function resolves; `setPhase("done")` at [line 483](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:483).

**No polling.** **No websocket / SSE.** The client reads success directly from the POST response body.

---

## 7. Failure & Recovery Behavior

### 7a. Page refresh mid-generation

- Completed rooms persist (each AIEstimate is committed at the end of its own POST).
- In-flight room(s): the HTTP request is cancelled when the page unloads. If Claude's call had already completed and the DB write was still pending, **might** leave an `AIEstimate` row but the client never sees the response. Otherwise the entire in-flight room is lost and the user has to manually re-trigger.
- Unprocessed rooms: silently dropped. The next time the user opens the modal, they'll re-do the "does an estimate exist?" check at [bulk-review-and-estimate-modal.tsx:166–176](app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx:166) and see which ones are still missing.

### 7b. Timeout

No `maxDuration` is set on any of: `/api/ai-estimate`, `/api/ai-estimate/[estimateId]/regenerate`, `/api/cope-estimate`, `/api/ai-review`, `/api/ai-review/batch`. Next.js default on Vercel is 10s Hobby / 60s Pro — single 64k-output Claude calls will routinely exceed 60s.

The only `maxDuration` in the codebase is on `/proposals/[snapshotId]/pdf/route.ts` (60s). Phase 8B will need to address this for any Inngest step fn that wraps a Claude call.

### 7c. Partial results

Saved at room granularity. All-or-nothing is at the *line item* level inside a single room (the nested `create` is one transaction — if parse fails, nothing is saved for that room).

---

## 8. Relevant Schema

### 8a. Writes during estimate generation

[prisma/schema.prisma:1029](prisma/schema.prisma:1029) — `AIEstimate`:

```prisma
model AIEstimate {
  id               String             @id @default(cuid())
  projectId        String
  sectionId        String
  roomTemplateId   String?
  status           String             @default("draft")
  totalCost        Float?
  totalPrice       Float?
  promptTokens     Int?
  completionTokens Int?
  rawResponse      String?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  roomTemplate     RoomTemplate?      @relation(...)
  lineItems        EstimateLineItem[]
  priceCorrections PriceCorrection[]
  ...
}
```

[prisma/schema.prisma:1052](prisma/schema.prisma:1052) — `EstimateLineItem` — one row per line.

[prisma/schema.prisma:1127](prisma/schema.prisma:1127) — `CatalogSuggestion` — one row per unique item name, running-avg pricing.

### 8b. Reads

- `RoomTemplate` + `RoomTemplateTradeGroup` + `RoomTemplateItem` + `PricingCatalogItem` (for catalog-matching)
- `CompanyContext` (market, finish tier, markup, price-range pcts)
- `Room` (dimensions, `scopeQA`, `roomDetail`, `sectionType`)
- `Project` (`defaultCeilingHeightFt`, `projectQA`)
- `RoomSubArea`
- `PriceCorrection` (for feedback loop in `getCorrectionHistory`)

### 8c. Fields on `Room` relevant to generation state

[prisma/schema.prisma:206–207](prisma/schema.prisma:206):

```prisma
scopeQA                    Json?
estimateStaleReason        String?
```

[prisma/schema.prisma:77](prisma/schema.prisma:77):

```prisma
projectQA                  Json?
```

**There is no existing per-room `estimateStatus` field, no `EstimateJob` model, no `Job` / `Task` / `Queue` model.** Phase 8B will need to introduce one.

---

## 9. Anthropic Client Setup

### 9a. Shared wrappers

All estimate-generation paths go through [app/lib/ai/model.ts](app/lib/ai/model.ts):
- `callClaude(params)` — non-streaming, for short JSON responses (review questions, trade updates).
- `streamClaude(params)` — streaming, used for the big estimate calls. Returns `stream.finalMessage()`.

Both:
- Fetch the API key fresh from the encrypted DB store on every call via `getAnthropicApiKey()` ([app/integrations/anthropic.ts:78](app/integrations/anthropic.ts:78) → `getDecryptedIntegrationSecret` at [app/lib/integrations/service.ts:61](app/lib/integrations/service.ts:61)).
- Instantiate a **new `Anthropic` client per call** ([model.ts:46](app/lib/ai/model.ts:46), [model.ts:55](app/lib/ai/model.ts:55), [model.ts:73](app/lib/ai/model.ts:73), [model.ts:83](app/lib/ai/model.ts:83)).
- Pull the model name from `CompanySettings.anthropicModel` (DB-backed, user-configurable). Default fallback `claude-sonnet-4-6` ([model.ts:6](app/lib/ai/model.ts:6)).

### 9b. Direct SDK usage (bypassing the wrapper)

- `app/integrations/anthropic.ts:96` — connection test.
- `app/api/settings/anthropic-models/route.ts:58` — model list.
- `app/api/rendr/match-rooms/route.ts:35` — Rendr room matching. **Not in the estimate pipeline but shares the API key.**

### 9c. Models

Primary model: `claude-sonnet-4-6` ([model.ts:6](app/lib/ai/model.ts:6), `DEFAULT_CLAUDE_MODEL`). Can be overridden per-tenant in `CompanySettings.anthropicModel`.

No prompt caching, no batch API, no thinking blocks — plain streaming completion.

### 9d. Patterns worth preserving

- The API-key lookup + `Anthropic` client instantiation pattern. Phase 8B should either (a) continue instantiating per-call, or (b) cache the client in a module-scoped variable keyed on API key. (a) is fine for low-frequency work; if we go fully parallel at scale, (b) saves ~50ms/call.
- The retry/fallback envelope. Worth keeping intact so background workers get the same overload-handling behavior.

---

## 10. Time Estimates (10-room example)

**Assumptions** (see Open Questions 11.2, 11.3 — none of these are measured):
- Avg room estimate call: **60–120s** end-to-end (Claude latency dominated by 64k max_tokens ceiling; actual output is usually 4k–15k tokens, Sonnet 4.6 streaming roughly 50–100 tokens/s = 40–300s at the extremes).
- Avg review call: **8–15s** (4k max_tokens).

### Current sequential behavior

| Rooms | Review (parallel) | Estimates (sequential) | COPE | Total |
|-------|-------------------|------------------------|------|-------|
| 5     | ~15s              | 5 × 90s = 7.5 min      | 90s  | **~9 min**  |
| 10    | ~15s              | 10 × 90s = 15 min      | 90s  | **~17 min** |
| 20    | ~15s              | 20 × 90s = 30 min      | 90s  | **~32 min** |
| 30    | ~15s              | 30 × 90s = 45 min      | 90s  | **~47 min** |

With the p90 case (~120s/room) the 20-room number stretches to **40–45 min**, matching the user-reported 20–60 min window.

### Theoretical parallel behavior

Assuming a sufficient API tier:

| Rooms | Concurrency 3 | Concurrency 5 | Concurrency 10 |
|-------|---------------|---------------|----------------|
| 10    | ~5.5 min      | ~3.5 min      | ~2 min         |
| 20    | ~10.5 min     | ~6.5 min      | ~3.5 min       |
| 30    | ~15.5 min     | ~9.5 min      | ~5 min         |

### Rate limit concerns

A concurrency of 10 running 20k-output-token calls in parallel = **200k output tokens in flight** inside a 60s window. That is well above the tier-1 output-tokens/min limit (~8k/min) and likely above tier-2 (~16k/min). Even tier-3 (~80k/min) would bottleneck. **The realistic parallel ceiling is probably 3–5 concurrent unless we request a rate-limit increase or use prompt caching + the Batches API.**

Recommended first step in Phase 8B: **concurrency 3–5 with exponential backoff on 429**, not a naive `Promise.all`.

---

## 11. Recommendations for Phase 8B

Ordered roughly by dependency:

1. **Introduce an `EstimateJob` / `EstimateJobItem` schema.**
   - `EstimateJob`: `id`, `projectId`, `status` (`queued | running | partial | done | failed | cancelled`), `createdAt`, `startedAt`, `finishedAt`, `totalRooms`, `completedRooms`, `failedRooms`, `triggeredBy`, `includesCope Boolean`.
   - `EstimateJobItem`: `id`, `jobId`, `roomId`, `roomTemplateId`, `status`, `estimateId?`, `startedAt`, `finishedAt`, `attempts`, `lastError?`.
   - This becomes the single source of truth the UI polls and that workers update.

2. **Introduce a background worker.** QStash is already installed — the simplest shape is:
   - A "planner" endpoint receives `projectId + roomIds[]`, creates the `EstimateJob` + `EstimateJobItem[]` in `queued` state, fans out one QStash message per room (with `rate` or `parallelism` set).
   - A "worker" endpoint (`POST /api/jobs/estimate-room`) processes one room, updates its `EstimateJobItem`, and increments the parent counters.
   - COPE is a terminal step that is enqueued only after the parent's `completedRooms + failedRooms === totalRooms` check.
   - Inngest is a cleaner alternative if durable workflow state / `step.run` / automatic retries are desired. Both are viable — QStash is already paid for.

3. **Keep the `/api/ai-estimate` POST route working as today** for the single-room path and for backward compatibility. The bulk path switches to the job API. This limits the blast radius.

4. **Concurrency control.** Start at 3–5, exposed as a settings value. Do NOT start with unbounded `Promise.all`.

5. **Respect the existing retry/fallback in `streamClaude`.** The worker should reuse [`app/lib/ai/model.ts`](app/lib/ai/model.ts) unchanged. On a final failure, increment `attempts`, move the item back to `queued` with a delay if `attempts < 3`, otherwise mark `failed`.

6. **UI changes:** Modal becomes "start job", then polls `GET /api/jobs/estimate/[jobId]` every 2–5s showing per-room status. User can close the modal and come back — the job keeps running.

7. **Set `maxDuration = 300` (or per Vercel plan ceiling) on the per-room worker route.** The planner/fan-out route can stay short.

8. **Gotchas to watch:**
   - **`CatalogSuggestion` running-avg race condition** ([ai-estimate/route.ts:224](app/api/ai-estimate/route.ts:224)): two concurrent workers can both read `occurrenceCount = N` and compute different running averages. Wrap this in a `prisma.$transaction` with `SERIALIZABLE` isolation, or rewrite the raw UPDATE to compute the new average atomically in SQL.
   - **Clearing `estimateStaleReason`** is currently done once per room at the end of a successful estimate — still fine in a worker.
   - **COPE depends on room totals** being present. `recomputeInvestmentRollups` isn't called during room generation today; only during COPE generation and estimate-accept. Confirm the job flow does not need to trigger it per room (it doesn't, per §4).
   - **API key per call.** If we parallelize, 10 concurrent workers means 10 simultaneous DB reads of the encrypted secret. Cheap, but worth noting — trivial cache if needed.
   - **`BulkAiEstimateModal` dead code** (see §2a) — delete or migrate when the new flow ships, whichever the user prefers.
   - **Review step is already parallel server-side.** Don't regress this — the review API should remain a single HTTP call to the client.
   - **Prompt size.** We include the full `RoomTemplate` trade group + catalog items in every prompt. With 200 catalog items × 20 rooms, we're re-sending ~200k input tokens per project. **Prompt caching** (5-min TTL) on the system prompt + catalog would cut input cost by ~80% after the first call and likely improve latency. Consider as a Phase 8B-adjacent optimization, not a blocker.

---

## 12. Open Questions

1. **Is `BulkAiEstimateModal` ([bulk-ai-estimate-modal.tsx](app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx)) still reachable from any UI path?** Grep shows it's not imported by `rooms-tab.tsx` — the unified `BulkReviewAndEstimateModal` is what's rendered. If it's dead, Phase 8B should delete it rather than duplicate the job wiring.

2. **What Anthropic API tier are we on?** This determines the safe concurrency ceiling. Tier 1 will struggle above concurrency 2; Tier 4 can comfortably do 10+. If Steve doesn't know off the top of his head, we can derive it from the Anthropic console or by probing with a careful burst test on a throwaway project.

3. **Do we have any logged per-room wall-clock timing for a recent generation?** The 20–60 min UX complaint in the task description is our baseline, but no server logs currently record per-room duration. Phase 8B should add structured timing (`estimateJobItem.startedAt/finishedAt`) from day one so we can validate the parallelization gain.

4. **QStash vs. Inngest?** QStash is installed and the `@upstash/qstash` test route works. Inngest would give durable step functions and automatic retries with less glue code but adds a new vendor. Steve should pick — both are fine.

5. **Job cancellation UX?** If a user starts a 30-room job and realizes one room has the wrong template, do they want a "cancel remaining" button, or is fire-and-forget acceptable? Affects whether we need an in-flight signal check inside the worker.

6. **Should a single-room retry from `AIEstimatePanel` go through the new job system, or stay synchronous?** A single-room estimate takes 60–120s, which is within Vercel Pro's 60–300s range and might be fine to keep synchronous for UX simplicity (user is actively watching).

7. **Is there a concurrency limit upstream?** If Postgres connection count is already tight on Neon's starter tier, 10 concurrent workers each holding a connection during Claude's 90s call could exhaust the pool. Verify the Neon plan's connection limit before choosing a concurrency value.

---

**End of report.**

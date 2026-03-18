# Budget Source Migration: Diagnosis & Plan

**Purpose:** Architectural recommendation to treat **budget-projection data** (e.g. DataX `jobtread_get_job_budget`) as the correct source of truth, and to stop using the raw JobTread cost graph for budget totals. **Diagnosis and planning only**—no production sync changes yet.

---

## 1. Exact Current Raw Sync Path

### Where raw costGroups are fetched

| Step | File | Function / location |
|------|------|----------------------|
| Page fetch | `app/integrations/jobtread-pricing.ts` | `fetchJobCostGroupsPage(creds, jobId, page)` — GraphQL query for `costGroups.nodes` (paginated) |
| Full fetch | `app/integrations/jobtread-pricing.ts` | `fetchAllJobCostGroups(creds, jobId)` — loops pages until no `nextPage` |

### Where raw costItems are fetched

| Step | File | Function / location |
|------|------|----------------------|
| Page fetch | `app/integrations/jobtread-pricing.ts` | `fetchJobCostItemsPage(creds, jobId, page)` — GraphQL query for `costItems.nodes` (paginated) |
| Full fetch | `app/integrations/jobtread-pricing.ts` | `fetchAllJobCostItems(creds, jobId)` — loops pages until no `nextPage` |

### Where they are normalized (to the shape passed to sync)

- **File:** `app/integrations/jobtread-pricing.ts`
- **Flow:** Inside `fetchBuildJobsWithDetails()`:
  - For each build job, `fetchAllJobCostGroups(creds, id)` and `fetchAllJobCostItems(creds, id)` are called (lines ~696–697).
  - Raw group/item arrays are normalized with **local** helpers:
    - `normalizeCostGroupsFromArray(groupsRaw)` → `NormalizedCostGroup[]` (id, name, parentId from `parentCostGroup.id`).
    - `normalizeCostItemsFromArray(itemsRaw)` → `NormalizedCostItem[]` (id, name, quantity, unitPrice, unitCost, costGroupId from `costGroup.id`).
  - No use of `app/lib/jobtread/budget-adapter.ts` in this path; the integration does **not** pass `extendedCost` / `extendedPrice` into the budget object.

### Where they are turned into the object passed to sync (flattened into “canonical” input shape)

- **File:** `app/integrations/jobtread-pricing.ts`
- **Location:** `syncJobTreadPricing()` loop (lines ~794–815).
- For each job, a **plain budget object** is built and passed to `syncNormalizedJobBudget(budget)`:
  - `jobId`, `jobName`, `jobNumber: null`, `stage`, `location: null`
  - `groups`: `job.costGroups.map(g => ({ id, name, parentId }))`
  - `items`: `job.costItems.map(i => ({ id, name, groupId: i.costGroupId, quantity, unitCost, unitPrice }))` — **no extCost/extSell**
  - `sourceSummarySell: null`, `sourceSummaryCost: null`

So the **current production path** is: **raw API → local normalizers in jobtread-pricing → inline budget object (NormalizedJobBudget shape) → sync**.

### Where canonical rows are built and staging totals are built

| Step | File | Function / location |
|------|------|----------------------|
| Flatten to canonical rows | `app/lib/jobtread/sync-budget.ts` | `flattenBudgetToCanonicalRows(budget)` — iterates `budget.items`, resolves group/parent from `budget.groups`, produces `CanonicalBudgetRowInput[]`; `extCost`/`extSell` from `rowExtCost`/`rowExtSell` (quantity×unit when ext not present) |
| Row payload for DB | `app/lib/jobtread/sync-budget.ts` | `buildSyncedBudgetRowPayload(rows)` — maps canonical rows to Prisma `SyncedBudgetRow`-shaped objects |
| Sync entrypoint | `app/lib/jobtread/sync-budget.ts` | `syncNormalizedJobBudget(budget)` — calls `flattenBudgetToCanonicalRows`, `computeOfficialTotalsFromRows(rows)`, `buildSyncedBudgetRowPayload`, then transaction: `upsertSyncedBudgetJob`, `syncedBudgetRow.deleteMany` + `createMany` |
| Staging totals | `app/lib/jobtread/pricing-staging.ts` | `rebuildPricingStaging()` — reads `SyncedBudgetJob` with `include: { rows: true }`, uses `rows` and `rawBudgetJson.groups` to derive room/trade and aggregate `totalCost`/`totalSell` into `PricingSourceJob` / `PricingSourceRoom` / `PricingSourceTrade` |

So: **staging and UI consume SyncedBudgetJob + SyncedBudgetRow**. The only place that needs to change to fix the numbers is **where the `NormalizedJobBudget` input to `syncNormalizedJobBudget` comes from** (today: inline build in jobtread-pricing from raw costGroups/costItems).

---

## 2. Every Existing Budget-Shaped Adapter / Parser / Seam

### 2.1 Types (`app/lib/jobtread/budget-types.ts`)

- **NormalizedJobBudget:** `jobId`, `jobName`, `jobNumber`, `stage`, `location`, `groups`, `items`, `sourceSummarySell`, `sourceSummaryCost`.
- **NormalizedBudgetGroup:** `id`, `name`, `parentId`.
- **NormalizedBudgetItem:** `id`, `name`, `groupId`, `groupName`, `costCode`, `costCodeName`, `costType`, `unit`, `quantity`, `unitCost`, `unitPrice`, `extCost`, `extSell`, `description`, `rawLine`.
- **CanonicalBudgetRowInput:** one row for DB (jobId, jobName, externalBudgetItemId, groupName, costGroupId, parentCostGroupId, parentCostGroupName, itemName, costCode, costCodeName, costType, unit, quantity, unitCost, unitPrice, extCost, extSell, rawPayloadJson).

All budget-shaped code ultimately produces or consumes these types.

### 2.2 Raw-API → NormalizedJobBudget adapter

- **File:** `app/lib/jobtread/budget-adapter.ts`
- **Contract:** `RawJobBudgetInput`: `{ jobNode, groupsRaw, itemsRaw, sourceTotalPrice?, sourceTotalCost? }`.
- **Export:** `normalizeRawJobBudget(input): NormalizedJobBudget`.
- **Expectations:** Raw groups with `id`, `name`, `parentCostGroup.id`. Raw items with `id`, `name`, `quantity`, `unitPrice`, `unitCost`, `costGroup`, optional `unit`, `costCode`/`code`, `extendedCost`, `extendedPrice`. Uses ext when present; otherwise sync layer computes from qty×unit.
- **Usage:** Not used by the current production sync (production builds the budget object inline in jobtread-pricing). Available for any path that has raw JobTread API responses and wants to produce NormalizedJobBudget.

### 2.3 Formatted text (DataX-style export) → NormalizedJobBudget parser

- **File:** `app/lib/jobtread/budget-text-parser.ts`
- **Export:** `parseBudgetExportText(text: string): NormalizedJobBudget`.
- **Expectations:** Lines with `Job: id | name | number`, `Summary: totalCost | totalPrice`, group headings (non-`-` lines), item lines starting with `-` and key/value segments; parses ext as cost/sell or single value.
- **Usage:** Used by `sync-budget.fetchNormalizedJobBudget(jobId)` (which calls `getJobTreadBudgetExportText` → parse). Also used by admin “paste budget text” in `app/admin/settings/actions.ts`: `parseAndSyncBudgetTextAction` → `parseBudgetExportText` → `syncNormalizedJobBudget(budget)`.

### 2.4 Fetch + sync (parser path)

- **File:** `app/lib/jobtread/sync-budget.ts`
- **getJobTreadBudgetExportText(jobId):** Throws with “Budget export fetch not wired”; single intended seam for “get formatted budget text for job”.
- **fetchNormalizedJobBudget(jobId):** Calls `getJobTreadBudgetExportText(jobId)` then `parseBudgetExportText(text)` → returns `NormalizedJobBudget | null`.
- **syncJobBudget(jobId):** Fetches via `fetchNormalizedJobBudget(jobId)` then `syncNormalizedJobBudget(budget)`. Used by `POST /api/admin/jobtread/sync-budget` (currently fails at fetch for real JobTread because fetch is not implemented).

### 2.5 Sync core (unchanged by source)

- **File:** `app/lib/jobtread/sync-budget.ts`
- **syncNormalizedJobBudget(budget):** Accepts any `NormalizedJobBudget`; flattens to canonical rows, computes totals, writes SyncedBudgetJob + SyncedBudgetRow. **No knowledge of where budget came from.**

### 2.6 Staging (consumes sync output only)

- **File:** `app/lib/jobtread/pricing-staging.ts`
- **Expectations:** Reads `SyncedBudgetJob` (with `rows`) and `rawBudgetJson.groups` (NormalizedJobBudget-style groups) for room/trade resolution. Does not care whether budget came from raw API, DataX, or pasted text.

### Summary table

| Piece | Expects | In repo |
|-------|--------|--------|
| budget-types | groups + items, extCost/extSell optional | Yes |
| budget-adapter | Raw job + groupsRaw + itemsRaw → NormalizedJobBudget | Yes, not used by prod sync |
| budget-text-parser | Formatted text → NormalizedJobBudget | Yes; used by fetch path + paste |
| sync-budget (flatten/sync) | NormalizedJobBudget only | Yes |
| getJobTreadBudgetExportText | (jobId → text) — not implemented | Stub throws |
| fetchNormalizedJobBudget | jobId → NormalizedJobBudget (via text) | Yes |
| syncJobBudget | jobId → sync (via fetchNormalizedJobBudget) | Yes |
| pricing-staging | SyncedBudgetJob + rows + rawBudgetJson.groups | Yes |

---

## 3. Best Replacement Seam

**Recommendation: treat `NormalizedJobBudget` as the single input contract and swap only how it is produced.**

- **Downstream (sync + staging + UI)** already depend only on:
  - `syncNormalizedJobBudget(budget: NormalizedJobBudget)` and
  - The shape of SyncedBudgetJob / SyncedBudgetRow / rawBudgetJson.

So the **cleanest replacement seam** is:

1. **Single contract:** Everything that wants to “sync a job budget” must produce a **NormalizedJobBudget** (or a type that can be converted to it in one place).
2. **Single entrypoint:** Keep `syncNormalizedJobBudget(budget)` as the only writer to SyncedBudgetJob + SyncedBudgetRow. No change to flattening, row payload, or staging.
3. **Source swap at the producer:**
   - **Current production:** `app/integrations/jobtread-pricing.ts` builds budget from `job.costGroups` + `job.costItems` (raw graph).
   - **Target:** Build the same `NormalizedJobBudget` from one of:
     - A **real JobTread budget endpoint** (when available), or
     - A **DataX-style budget JSON** (e.g. `jobtread_get_job_budget(jobId)` response), or
     - **Pasted/imported budget export text** (already supported via `parseBudgetExportText` → `syncNormalizedJobBudget` in admin).

The **minimal change** is: **in jobtread-pricing, stop building the budget from raw costGroups/costItems; instead, obtain a NormalizedJobBudget from a new “budget source” layer** that can be implemented as:
- an adapter from DataX budget JSON → NormalizedJobBudget, or
- a fetch of formatted text + parseBudgetExportText, or
- a future JobTread budget API client.

So the “replacement seam” is: **anywhere we currently construct the object passed to `syncNormalizedJobBudget`**. That is exactly one place in production: the loop in `syncJobTreadPricing()` in `app/integrations/jobtread-pricing.ts` (lines ~794–833). Replace that construction with a call to a **budget source function** that returns `NormalizedJobBudget` (or null to skip that job).

---

## 4. Concrete Migration Plan

### Smallest safe refactor

- **Goal:** Keep all existing behavior except where the budget payload is produced. Staging and UI remain unchanged.
- **Principle:** Introduce a **budget source abstraction** that returns `NormalizedJobBudget | null` for a job; production sync calls that instead of building from raw costGroups/costItems.

### Files to touch

| File | Change |
|------|--------|
| `app/lib/jobtread/budget-types.ts` | Optional: add a shared type alias or doc for “budget input contract” if you want it explicit. No structural change required. |
| **New:** `app/lib/jobtread/budget-source.ts` (or equivalent) | New module: **getNormalizedJobBudget(jobId, options?): Promise<NormalizedJobBudget \| null>**. Implement one strategy (e.g. “DataX budget API” or “fetch text + parse”) and/or a small registry. This is the **temporary adapter contract** (see below). |
| `app/integrations/jobtread-pricing.ts` | In `syncJobTreadPricing()`: for each job, replace the inline budget object (from costGroups/costItems) with a call to the new budget source. If it returns null, skip sync for that job (or treat as “no budget available”). Remove or gate the old path (e.g. behind a flag or delete once DataX path is trusted). |
| `app/lib/jobtread/sync-budget.ts` | Optional: have `getJobTreadBudgetExportText` call into the same budget source if the “export text” path is implemented as “fetch JSON then serialize to text” for compatibility; or leave as separate path for paste-only. No change to `syncNormalizedJobBudget` or flattening. |

### What stays the same

- **sync-budget.ts:** `flattenBudgetToCanonicalRows`, `computeOfficialTotalsFromRows`, `buildSyncedBudgetRowPayload`, `syncNormalizedJobBudget`, `computeBudgetFingerprint`, transaction and SyncedBudgetJob/SyncedBudgetRow writes.
- **pricing-staging.ts:** `rebuildPricingStaging`, room/trade resolution from `rawBudgetJson.groups`, aggregation logic.
- **budget-types.ts:** NormalizedJobBudget, NormalizedBudgetGroup, NormalizedBudgetItem, CanonicalBudgetRowInput.
- **Admin paste flow:** `parseAndSyncBudgetTextAction` → `parseBudgetExportText` → `syncNormalizedJobBudget` (unchanged).
- **API route:** `POST /api/admin/jobtread/sync-budget` can stay calling `syncJobBudget(jobId)`; only the implementation of `fetchNormalizedJobBudget` (or a new fetch that returns NormalizedJobBudget) needs to be wired to the chosen source.

### What gets replaced

- **In jobtread-pricing:** The construction of `budget` from `job.costGroups` and `job.costItems` inside the sync loop. Replaced by: get `NormalizedJobBudget` from the new budget source (e.g. DataX adapter or fetch-normalize pipeline).
- Optionally: the **raw costGroups/costItems** fetch in `fetchBuildJobsWithDetails` for the purpose of building the sync budget (could be removed or kept only for non-budget use cases like diagnostics).

### Temporary adapter contract (budget source)

- **Name:** e.g. `getNormalizedJobBudget(jobId: string, context?: { credentials?, jobMeta? }): Promise<NormalizedJobBudget | null>`.
- **Returns:** NormalizedJobBudget with `groups` and `items` that match the **budget projection** (e.g. 141 groups / 686 items and ~865k sell / ~532k cost for 125 South Shore), not the full raw graph.
- **Implementations to add:**
  1. **DataX:** Call DataX `jobtread_get_job_budget(jobId)` (or equivalent), then map the response to NormalizedJobBudget (groups + items, with extCost/extSell and hierarchy). This becomes the default for sync when available.
  2. **Paste/import:** Already covered: text → `parseBudgetExportText` → NormalizedJobBudget; no change.
  3. **Future JobTread budget API:** Same contract: fetch → map to NormalizedJobBudget.

So the **temporary adapter contract** is: **any source that can provide a NormalizedJobBudget for a given job**. The only new code is the DataX (or other) mapper from their JSON shape to NormalizedJobBudget; the rest of the app already consumes that shape.

---

## 5. Proposed Normalized Budget Input Contract (Ideal Interface)

The app should rely on a **single normalized budget input contract**. Below is the ideal interface for that contract (no code changes in this doc).

### Job summary

- `jobId: string`
- `jobName: string`
- `jobNumber?: string | null`
- `stage?: string | null`
- `location?: string | null`
- `sourceSummarySell?: number | null` — optional summary sell from source (for comparison)
- `sourceSummaryCost?: number | null` — optional summary cost from source (for comparison)

### Top-level groups (e.g. rooms)

- List of: `{ id: string, name: string, parentId?: string | null }`
- Top-level: `parentId == null` (or missing). Represent rooms/areas.

### Child trade groups

- Same shape: `{ id: string, name: string, parentId: string | null }`
- Child: `parentId` references a top-level (or another parent) group. Represent trades under a room.

### Leaf budget items

- List of:  
  `id`, `name`, `groupId`, `groupName?`, `costCode?`, `costCodeName?`, `costType?`, `unit?`, `quantity?`, `unitCost?`, `unitPrice?`, **`extCost?`**, **`extSell?`**, `description?`, optional `rawLine` for debugging.
- **Item IDs and group IDs** must be stable so that:
  - Rows can be keyed for deduping and fingerprinting.
  - Staging can resolve room/trade from group hierarchy (group id → parent id → names).

### Financial semantics

- **extCost / extSell:** When present, they are the extended cost and extended sell for the line; when absent, the pipeline may derive from quantity × unitCost and quantity × unitPrice.
- **Totals:** Official job totals are computed by summing **extCost** and **extSell** over all items (as in `computeOfficialTotalsFromRows`). Source summary fields are for comparison only.

This is exactly the existing **NormalizedJobBudget** (+ NormalizedBudgetGroup + NormalizedBudgetItem) in `app/lib/jobtread/budget-types.ts`. No extension is required for the migration; the contract is already the right one. The only change is to **feed it from a budget-projection source** (e.g. DataX) instead of from the raw cost graph.

---

## Summary

- **Current raw path:** jobtread-pricing fetches raw costGroups/costItems, normalizes them locally, builds an inline NormalizedJobBudget (without extCost/extSell), and calls syncNormalizedJobBudget. Flattening and staging are in sync-budget and pricing-staging; they already depend only on NormalizedJobBudget and DB shape.
- **Existing seams:** budget-adapter (raw → NormalizedJobBudget), budget-text-parser (text → NormalizedJobBudget), fetchNormalizedJobBudget (jobId → text → parse), syncNormalizedJobBudget (NormalizedJobBudget → DB). None of these need to change except how the budget is **obtained** in the integration.
- **Replacement seam:** In `syncJobTreadPricing()`, replace the inline budget built from costGroups/costItems with a **budget source** that returns NormalizedJobBudget (e.g. DataX adapter). Keep syncNormalizedJobBudget and everything downstream unchanged.
- **Migration:** Add a budget-source module (e.g. DataX → NormalizedJobBudget); switch jobtread-pricing to use it; leave staging and UI as-is.
- **Contract:** The existing NormalizedJobBudget (and group/item types) is the ideal normalized budget input contract; use it for real JobTread budget endpoint, DataX JSON, or pasted export so the app does not need to rewrite staging or UI.

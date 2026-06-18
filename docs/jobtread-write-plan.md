# JobTread Write — Build Plan (authoritative spec, read first)

_Created 2026-06-17 in a planning session. This is the spec for the **"push estimate → JobTread budget + job"** chapter. Build starts 2026-06-18. No code written yet. Companion: the engineering-KB work is done/shipped (`engineering-kb-status.md`)._

## Goal
From a project's estimate, **push a complete budget into JobTread** — creating/locating the customer + job as needed — so the estimator reviews it in JobTread. The budget must include the **full room template** for each room (every trade + Material/Install line) even when the estimate didn't use a line (those land at **quantity 0**), so nothing is silently missed. Eventually two-way-aware, but this chapter is **app → JobTread (write)**.

> ⚠️ **Policy:** JobTread is READ-ONLY by default (CLAUDE.md). Every write below requires explicit authorization, a dry-run-first posture, and testing against a throwaway job before live use.

## Feasibility — green light
The existing read client **`jobTreadRequest()`** (`app/lib/jobtread/client.ts`) carries writes **verbatim**: same endpoint `https://api.jobtread.com/pave`, same envelope `{ query: { $: { grantKey }, ...yourQuery } }`, tolerant `root.data?.X ?? root.X` parsing. Pave writes are just **named operation nodes** (`createAccount`, `createLocation`, `createJob`, `createCostItem`, `createCostGroup`, `createDocument`, `updateJob`…) with **inputs in `$`** and **return fields as siblings** (always request `id`). No "mutation" keyword, no special operator. **Zero** write code exists today — the path is greenfield but the transport is reused as-is.

---

## Confirmed facts from the LIVE account (introspected 2026-06-17)

**Org:** HHI Builders = `22P3uKaSn7Ca` (resolve via `getOrgId()` in `app/lib/jobtread/catalog-api.ts`; hardcoded fallback exists too).

**CostTypes (5):** `Labor`=`22P3uKbGc5bQ`, `Materials`=`22P3uKbGc5bR`, `Other`=`22P3uKbGc5bT`, `Subcontractor`=`22P3uzGUUpfc`, `Sub Labor / Materials`=`22P3uzMrn5TF`.

**CostCodes (~100+):** named `<Trade> - <Type>` — e.g. `Framing - Material`, `Framing - Labor`, `Framing - Subcontract`, `Footings - …`, `Foundation - …`, `Demolition - …`. Fetch all: `{ organization: { $:{id}, costCodes: { $:{size:200}, nodes:{ id:{}, name:{}, number:{} } } } }`.

**"Design" stage** = the **`Job Stage` custom field**, id `22P5KyX5Me24`, free-text values incl. `"Design Contract"` and `"Build"`. Set via `customFieldValues` on `createJob`/`updateJob`. (Get the full value list before building the create-job dropdown.)

**`where` clauses use ARRAY form:** `["type","customer"]`, `["number","26"]` (not `{field:value}`).

**Create ops return `createdX`:** `createdJob`, `createdAccount`, `createdLocation`, `createdDocument`, `createdCostItem`, `createdCostGroup`.

**Customer → job traversal works** (the modal's backbone):
```json
{ "organization": { "$": { "id": "22P3uKaSn7Ca" },
  "accounts": { "$": { "size": 25, "where": ["type","customer"] },
    "nodes": { "id":{}, "name":{},
      "locations": { "nodes": { "id":{}, "name":{},
        "jobs": { "nodes": { "id":{}, "name":{}, "number":{} } } } } } } } }
```
Account naming today = owner / `LastName - Address` (e.g. "Stewart - 132 Timber Lane"); Location = the address; jobs hang off a Location. The "customer exists, no job" case is real ("Miller - 129 Harbour Passage" → `jobs: []`). The Design/Build split is real (separate jobs, same customer).

**`createJob` inputs** (confirmed): `locationId` (REQUIRED), `name` (**max 30 chars!**), `number` (job number; natural upsert key), `areas` (default `["General"]`), `lineItems` (array, **max 1500**), `priceType` (default `fixed`), `description`, `customFieldValues`, `copyCostsFromJobId`, `copyTasksFromJobId`, `coverPhoto`, `specificationsDescription/Footer`, `defaultRetainagePercentage`, `qbo*`, `scheduleIsPublished`, `useSimpleSelections`, `closedOn`. `lineItems[]` is `oneOf { newCostGroup, existingCostGroup, newCostItem, existingCostItem }`, and `newCostGroup` itself has a nested `lineItems` → **whole Room>Trade>Item budget in one call.**

**`createCostItem` inputs** (confirmed): `name` (req, ≤250), `description` (≤4096), `quantity`, `quantityFormula`, `unitCost`, `unitCostFormula`, `unitPrice`, `unitPriceFormula`, `unitId`, `costCodeId`, `costTypeId`, `allowanceType`, `isTaxable` (default true), `isSelected`, `isSpecification`, `jobArea`, `customFieldValues`, `sourceCostItemId` / `organizationCostItemId` / `jobCostItemId` (catalog links), targeting via `costGroupId` / `documentId` / `jobId` / `organizationId`, `positionAfter`.

**`createAccount`:** `name`, `type` (`customer`|`vendor`), `organizationId`. **`createLocation`:** `accountId`, `name`, `address?`. **`createContact`:** under `accountId` (+ name/email/phone — we lack email/phone).

**Budget target:** write to the **job budget** (cost items with `documentId = null`), NOT a Document — the read/sync path treats `documentId == null` as "the real budget" (`app/lib/jobtread/budget-source.ts`). Writing there keeps push & sync consistent.

---

## The push flow (the modal — your design)
A single, customer-first modal:
1. **Find customer** — type-ahead over `accounts` (`where ["type","customer"]`).
2. **Pick or create the job:** select an existing job under the customer's location(s) to push into; **or** create a job under the existing customer (set `Job Stage`); **or**, if the customer doesn't exist, **create customer → location → job**, then push.
3. Persist the chosen/created `jobId` (+ `accountId`, `locationId`, `number`) on the Project.

## Source of truth: TEMPLATE-OVERLAY MERGE (the key model)
Per room, the pushed budget = **template scaffold ⊕ estimate actuals ⊕ extras**:
1. **Scaffold** — load the room's assigned `RoomTemplate` → every `RoomTemplateTradeGroup` → every `RoomTemplateItem`, created with the template's `costCode`/`costType`, **quantity 0, $0**.
2. **Overlay** — match each `EstimateLineItem` to its template item (`catalogItemId` → `jobtreadItemId` → name) and fill **quantity, unitCost, unitPrice**.
3. **Extras** — estimate lines with no template match (custom AI items, engineering-assembly lines) appended under their trade group.

→ JobTread shows the **full template** (e.g. Framing Material + Install at qty 0 even when nothing was framed) = a complete estimator checklist. Templates were imported **from** JobTread (`app/api/settings/templates/import/route.ts:79-105`), so `RoomTemplateTradeGroup.jobtreadGroupId`, `RoomTemplateItem.jobtreadItemId`, `costCode`, `costType` are **populated and JobTread-aligned**.

## Room → template → JobTread naming (intent confirmed 2026-06-18)
A Room carries **two independent axes** plus a name (all three matter to the push):
- **`Room.sectionType`** = pricing profile, carries the **`category`** (INTERIOR / EXTERIOR / ADDITION). → **this is how the push detects interior vs exterior**, NOT the template.
- **`Room.roomTemplate`** = the trade/item **scaffold** pushed to JobTread (the *type*: Kitchen, Standard Room…). Auto-matched by room name (`autoMatchTemplate`, `bulk-review-and-estimate-modal.tsx:100-120`), estimator-overridable, saved as `Room.roomTemplateId`. Estimate generation requires it.
- **`Room.name`** = the specific label ("Primary Bedroom", "Hall 1", "Entry Closet"). → **becomes the JobTread cost-group NAME.** The template name is NOT used for the group name.

So: **each Room → one JobTread cost group named `Room.name`**, scaffolded from its template *type*. Multiple rooms sharing the "Standard Room" template become multiple distinct cost groups.

**Template semantics (from Steve, authoritative):**
| Template | Means |
|---|---|
| Powder Room | bathroom **without** a shower (½ bath) |
| Bathroom – Full | bathroom **with** a shower |
| Standard Room | no appliances/cabinetry/fixtures — Entry, Hall, Living, Dining, Bedrooms, Closets… (room named specifically) |
| Kitchen / Laundry / Stairway / COPE | as named |

**No EXTERIOR templates exist today** → `autoMatchTemplate` defaults any unmatched name (e.g. a porch) to **Standard Room** (interior scaffold) — wrong for exterior. Addressed by the Template Builder (below). Detect exterior via `sectionType.category`, not the template.

**Auto-match bug to fix:** "Powder Room" currently matches **Bathroom – Full** (the rule searches for "bath"; "Powder Room" has no "bath"). Fix: route powder/½-bath names → Powder Room; stop exterior names silently defaulting to Standard Room (use `sectionType.category` + exterior templates).

## NEW IN SCOPE: Template Builder + push-template-to-JobTread (Steve's call 2026-06-18)
Extend the existing templates admin (`/admin/settings/ai-pricing/templates`, today import-only) to **author/edit RoomTemplates in-app** (trade groups + Material/Install items) and **push a template TO JobTread's org catalog** (`createCostGroup` + `createCostItem` with `organizationId` — the inverse of the existing import, closing the loop). Use it to create the missing **exterior templates** (e.g. Porch/Deck, Addition, Exterior) so exterior rooms scaffold properly. Reusable for any future area type.

## Data mapping
| Our model | JobTread |
|---|---|
| Project (client name + site address) | **Account** (customer) + **Location** |
| Room / section | top-level **CostGroup** (`parentCostGroup = null`) |
| Trade (`RoomTemplateTradeGroup` / `EstimateLineItem.tradeGroup`) | child **CostGroup** under the room |
| Template/estimate line | **CostItem**: `name`, `quantity`, `unitId`, `unitCost`, `unitPrice`, `costCodeId`, `costTypeId`, `allowanceType` |
| `- Material` / `- Install` suffix + template `costType` | `costTypeId` (Materials / Labor / Subcontractor) |
| `source = "ALLOWANCE"` | `allowanceType` on the item |

Read-path semantics to mirror (`app/lib/jobtread/sync-budget.ts`): `parentCostGroupName` = ROOM, `groupName` = TRADE. Budget source = `app/lib/budget-export/assemble.ts` `assembleProjectBudget()` (estimate side), now MERGED with the template.

## Locked decisions
- **Job handling:** customer-first modal — look up customer → find/create job → push; create customer+location+job as needed.
- **Cost-code mapping:** template items pre-fill cost code from the template (authoritative); **estimate-only extras** get **fuzzy-matched with a per-line verify/override** step in the push UI. (Stretch: persist confirmed overrides to pre-fill next push — self-improving, like the icon library.)
- **Re-push:** **push-once-then-lock**; unlock requires a warning, then choose **Append** (add to existing JobTread budget) or **Overwrite** (replace only the cost groups/items WE created — track their IDs — leaving manual JobTread additions untouched).
- **Template requirement:** always push the full room template (qty 0 for unused lines). Cost-group name = `Room.name`; scaffold = the template *type*.
- **Template Builder IN SCOPE:** author/edit RoomTemplates in-app + push templates to JobTread's org catalog; create exterior templates with it. Fix `autoMatchTemplate` (powder→Powder Room; exterior via `sectionType.category`).

## Schema changes (one additive migration ⚠️ — same safe pattern as engineering KB)
On `Project`: `jobtreadJobId String? @unique`, `jobtreadJobNumber String?`, `jobtreadAccountId String?`, `jobtreadLocationId String?`, `jobtreadBudgetLockedAt DateTime?`. Plus a small table (or JSON) tracking the JobTread cost-group/cost-item IDs we created per push (for Overwrite). All additive; no alter/drop of existing tables.

## Phasing
- **Phase 1 (NO writes):** linkage migration; the **template-overlay merge transform** (pure function: `RoomTemplate ⊕ AIEstimate` → JobTread budget tree); the fuzzy cost-code matcher for extras; **Template Builder — local authoring/edit** of RoomTemplates (CRUD over trade groups + items); **`autoMatchTemplate` fix** (powder→Powder Room, exterior via `sectionType.category`); author the **exterior templates** locally; a **dry-run that renders the exact Pave payload without sending**. Eyeball real output safely.
- **Phase 2 (writes, gated):** the push modal (customer/location/job lookup+create), per-line verify table, budget push (`createJob` w/ `lineItems` for new jobs; `createCostGroup`+`createCostItem` batches for existing), linkage persistence; **push-template-to-JobTread** (org-catalog `createCostGroup`+`createCostItem` with `organizationId`). Dry-run toggle → throwaway-job test → enable.
- **Phase 3:** unlock + Append/Overwrite mechanics, allowance/alternate conventions, retry/backoff (429 unknown — assume throttling, honor Retry-After, `notify:false`), audit log.

## Open confirmations before Phase 2 writes (read-only, quick)
1. Full **`Job Stage`** value list (have "Design Contract", "Build").
2. **`sourceCostItemId` behavior** on `createCostItem` — does it auto-fill name/cost code, and does our explicit `unitCost`/`unitPrice` override the catalog? (throwaway-job test)
3. **Append vs Overwrite** mechanics (how cleanly we can delete/replace only our own cost items).
4. **Contact** creation — Account+Location only (we can fully populate) vs also a Contact (needs email/phone we don't store on Project). Leaning Account+Location now.
5. Job **`name` max 30 chars** — confirm a naming/truncation convention.

## Gaps (non-blocking)
- No customer **email/phone** on Project (only name + site address) → Account+Location creatable; Contact optional/later.
- Per-line **price ranges** (low/high) have no JobTread equivalent → push target price.
- Rooms **without an AIEstimate** are excluded by the export. Rooms **without a proper template** (exterior, until the Builder authors them) fall back to estimate-only — flag in the push summary; the Template Builder is the fix.

## Key files
- Reuse: `app/lib/jobtread/client.ts` (`jobTreadRequest`), `catalog-api.ts` (`getOrgId`, TRADE_PREFIX_MAP), `queries.ts`/`catalog-queries.ts` (read builders for the lookup/existence queries).
- Source data: `app/lib/budget-export/assemble.ts` (`assembleProjectBudget`), `prisma/schema.prisma` (RoomTemplate:1101 / TradeGroup:1117 / Item:1131, AIEstimate:1154, EstimateLineItem:1179, Project:39, PricingCatalogItem:1075).
- Template import reference: `app/api/settings/templates/import/route.ts`.
- New (to build): the merge transform + Pave write builders + the push API route + the modal/verify UI + the linkage migration.

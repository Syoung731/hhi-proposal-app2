# Budget Paste/Import Path: Flow, Format, and Temporary Workflow

This document traces the admin paste/import path end-to-end, documents the exact format the parser expects, recommends a safe temporary operating procedure, and suggests the smallest improvement to make importing easier.

---

## 1. Exact Current Import Flow (End-to-End)

### Where pasted text enters

| Step | Location | What happens |
|------|----------|--------------|
| UI | `app/admin/settings/integrations-tab.tsx` | **Dev-only:** A section "Paste JobTread budget export (Dev Only)" is rendered when `isDev` (i.e. `process.env.NODE_ENV === "development"`). User types or pastes into a `<textarea>` bound to `budgetTextDraft`. Placeholder: "Paste DataX-style export (Job: ... Summary: ... group headings and - item lines)". Draft is optionally persisted to `localStorage` under `BUDGET_TEXT_DRAFT_STORAGE_KEY` in dev. |
| Submit | Same file, `handlePasteSync()` | On "Parse & sync budget text" click: builds `FormData`, sets `budgetText` to `budgetTextDraft`, calls `parseAndSyncBudgetTextAction(formData)`. |

### How it is parsed

| Step | Location | What happens |
|------|----------|--------------|
| Action | `app/admin/settings/actions.ts`, `parseAndSyncBudgetTextAction` | Reads `budgetText` from `formData.get("budgetText")`, trims it. If empty, returns `{ ok: false, error: "Budget text is required." }`. |
| Parse | `app/lib/jobtread/budget-text-parser.ts`, `parseBudgetExportText(text)` | Parses the string line-by-line (split on `\r?\n`, trimmed). No try/catch inside the parser itself; exceptions bubble to the action. |

### How it becomes NormalizedJobBudget

- **Parser output:** `parseBudgetExportText` returns a `NormalizedJobBudget`:
  - **Job:** From first `Job:` line: `jobId`, `jobName`, `jobNumber` (optional).
  - **Summary:** From `Summary:` lines: `sourceSummaryCost`, `sourceSummarySell` (optional).
  - **Groups:** Built from unique non-item, non-Job/Summary, non–cost-code lines in order of first appearance. Each group is `{ id: \`g-${i}\`, name, parentId: null }` — **flat list, no hierarchy**.
  - **Items:** From lines starting with `- `: key/value pairs parsed; each item gets `groupId: null`, `groupName: currentGroupName` (the last preceding group heading). extCost/extSell from `ext` or derived from qty×cost, qty×price.

### How it reaches syncNormalizedJobBudget

| Step | Location | What happens |
|------|----------|--------------|
| Validation | `app/admin/settings/actions.ts` | After parse: if `!budget.jobId || !budget.jobName` → `{ ok: false, error: "Parsed budget must have jobId and jobName (from Job: line)." }`. If `!budget.items?.length` → `{ ok: false, error: "Parsed budget must have at least one item row." }`. |
| Sync | Same file | `syncNormalizedJobBudget(budget)` is called. |
| Downstream | `app/lib/jobtread/sync-budget.ts` | `syncNormalizedJobBudget` flattens via `flattenBudgetToCanonicalRows(budget)`, computes totals, writes `SyncedBudgetJob` + `SyncedBudgetRow`. Same path as any other NormalizedJobBudget source. |

### Validations / errors that already exist

- **Empty text:** "Budget text is required."
- **Parse throw:** Caught in action; returns "Failed to parse budget text." or the thrown message.
- **Missing job identity:** "Parsed budget must have jobId and jobName (from Job: line)."
- **No items:** "Parsed budget must have at least one item row."
- **Sync failure:** If `syncNormalizedJobBudget` returns `status: "error"`, returns `{ ok: false, error: result.message ?? "Sync failed." }`.

---

## 2. Exact Input Format the Parser Expects Today

### Line types and order

1. **Job line (recommended first)**  
   - Format: `Job:` followed by key/value segments separated by ` | ` (space-pipe-space).  
   - Keys: `id`, `name`, `number` (optional).  
   - Example: `Job: id: 22PJXd2cjdhN | name: 125 South Shore | number: 1302`

2. **Summary line (optional)**  
   - Format: `Summary:` then key/value segments.  
   - Keys: `totalCost`, `totalPrice`.  
   - Example: `Summary: totalCost: 532318.79 | totalPrice: 865121.50`

3. **Group heading**  
   - Any non-empty line that does **not** start with `Job:`, `Summary:`, or `- ` (dash space), and does **not** match cost-code heuristics (e.g. "43M Interior Paint - Material", "06S Dumpster / Port-a-Let - Subcontract").  
   - The **last** such line before an item line is the "current group" for subsequent item lines.  
   - No key/value format; the entire line is the group name.  
   - Example: `Kitchen` or `Bath - Phase 1`

4. **Item line**  
   - Must start with `- ` (dash space). Rest is key/value segments separated by ` | `.  
   - **Required:** `id`, `name` (both non-empty after trim, or the line is skipped).  
   - **Optional:** `qty`, `cost`, `price`, `ext`, `code`, `type`, `unit`, `desc`.  
   - `ext`: one number (used for both extCost and extSell) or `cost/sell` (slash-separated).  
   - Example: `- id: abc123 | name: Install cabinets | qty: 1 | cost: 5000 | price: 7500 | ext: 5000/7500`

### Hierarchy shape

- **Groups:** Single level only. Parser emits `groups[i] = { id: \`g-${i}\`, name, parentId: null }`. There is **no room → trade** hierarchy in the text format; every group is top-level.
- **Items:** Each item has `groupId: null` and `groupName: currentGroupName`. So items are associated to a group by **name** only; staging later uses `groupName` (and null `parentCostGroupId`) to set room = groupName, trade = null.

### Optional vs required

| Element | Required | Notes |
|--------|----------|--------|
| Job line | Effectively yes | jobId/jobName default to "unknown"/"Unknown" if never set; action then rejects if missing. So at least one `Job:` line with `id` and `name` is required for sync. |
| Summary line | No | Only sets sourceSummaryCost/sourceSummarySell for comparison. |
| Group headings | No | If none, all items get groupName "Uncategorized". |
| Item lines | At least one | Action rejects if `!budget.items?.length`. |
| Per item: id, name | Yes | Lines without both are skipped. |
| Per item: qty, cost, price, ext, code, type, unit, desc | No | ext can be one number or "cost/sell"; if missing, extCost/extSell derived from qty×cost and qty×price when possible. |

### Totals / extCost / extSell

- **Summary:** Optional. `Summary: totalCost: X | totalPrice: Y` sets source summary; used only for comparison in sync (warning if row-sum totals differ from source summary).
- **Item ext:** Optional. Key `ext` can be a single number (used for both extCost and extSell) or `cost/sell`. If absent, parser uses `qty * cost` and `qty * price` when present.
- **Official totals:** Always computed downstream by summing row-level extCost/extSell (in `computeOfficialTotalsFromRows`), not from the Summary line.

---

## 3. Safest Temporary Operating Procedure (Using Paste as Budget Source)

**Goal:** Use the existing admin paste path as the temporary way to feed correct budget-shaped data into the app (one job at a time), without re-enabling raw JobTread costGroups/costItems sync.

### What a person would paste

- A single job’s budget in the **exact text format** above:
  - One `Job: id: <jobId> | name: <jobName> | number: <number>` line (number optional).
  - Optionally one `Summary: totalCost: X | totalPrice: Y` line.
  - One or more group headings (plain lines, no leading `- `).
  - One or more item lines: each starting with `- ` and containing at least `id: ... | name: ...`, plus optional `qty`, `cost`, `price`, `ext`, `code`, `type`, `unit`, `desc`.

### Where they would paste it

- **Admin → Settings → Integrations** (or the tab that renders the JobTread section).
- In **development only:** the "Paste JobTread budget export (Dev Only)" textarea.  
- In production this section is **not rendered** (`isDev` is false), so paste is **not available in production** unless the UI is changed (e.g. show paste in production or behind a feature flag).

### What the app would do with it

1. User clicks "Parse & sync budget text".
2. Server parses text → NormalizedJobBudget, validates jobId/jobName and at least one item, then runs `syncNormalizedJobBudget(budget)`.
3. SyncedBudgetJob and SyncedBudgetRow are written; staging can be run (e.g. via "Sync JobTread pricing" which currently skips all jobs due to no budget source, or via a separate "Rebuild staging" that runs `rebuildPricingStaging`). So after paste:
   - **Sync:** Done by the paste action.
   - **Staging:** User may need to trigger rebuild staging for that job (or all jobs) so PricingSourceJob/Room/Trade are updated from the new rows.

### Limitations

- **Dev-only UI:** Paste textarea is hidden in production.
- **One job per paste:** Each paste overwrites SyncedBudgetJob + rows for that job’s `jobId`; no merge.
- **No room → trade hierarchy:** All groups are top-level; staging will show room = group name, trade = null.
- **Manual copy/paste:** User must obtain the text elsewhere (e.g. export from DataX or a script) and paste; no file upload or JSON import yet.
- **Format strictness:** Wrong line prefixes or key names (e.g. missing `Job:`, or `- ` for items) cause skipped lines or parse failures; no schema doc in-app.

---

## 4. Recommendation: Keep Text Paste, Add JSON Import, or Adapt for DataX?

- **Keep using text paste as-is:** Yes. It already works, is the only wired path that writes budget-shaped data into the app without raw cost graph, and is suitable as the temporary operational workflow for one job at a time in dev.
- **Add a JSON import path alongside it:** Recommended. A **JSON import** that produces the same NormalizedJobBudget (or a DTO that maps 1:1 to it) would:
  - Allow DataX-style budget JSON (or any backend that returns structured budget) to be pasted or uploaded without hand-converting to the pipe-delimited text format.
  - Reduce formatting errors (no need to get `Job:`, `- `, ` | ` right).
  - Reuse the same downstream path: validate → `syncNormalizedJobBudget` → staging.
- **Adapt the parser to accept DataX export “more directly”:** Depends on what “DataX-style export” is. If it’s **already** the pipe-delimited text above, the parser is already aligned. If it’s **JSON**, then a separate JSON path (or a parser that detects JSON vs text) is cleaner than overloading the text parser. Prefer a small **JSON adapter** that maps DataX JSON → NormalizedJobBudget and a separate action/UI (e.g. "Paste or upload budget JSON") so that:
  - Text format stays as the documented, human-editable format.
  - JSON format is the machine-friendly option and can match DataX `jobtread_get_job_budget` response shape.

**Summary:** Keep text paste; add an optional **JSON import path** that outputs NormalizedJobBudget and reuses the same sync + staging pipeline. Optionally adapt the JSON path to accept DataX-style budget JSON directly.

---

## 5. Return Summary

| Question | Answer |
|----------|--------|
| **Exact current import flow** | User pastes in dev-only textarea (integrations tab) → `handlePasteSync` → `parseAndSyncBudgetTextAction(formData)` → `parseBudgetExportText(budgetText)` → validate jobId/jobName/items → `syncNormalizedJobBudget(budget)` → revalidate integrations path. |
| **Current expected format** | Lines: `Job: id: ... \| name: ... \| number: ...`; optional `Summary: totalCost: ... \| totalPrice: ...`; group headings (plain lines); item lines `- id: ... \| name: ... \| [qty,cost,price,ext,code,type,unit,desc]`. Key/value segments separated by ` \| `. Groups flat (no parentId). Items require id and name; ext optional (single number or cost/sell). |
| **Safest temporary operating procedure** | In dev: obtain budget in the text format above (e.g. from DataX or script); paste into "Paste JobTread budget export (Dev Only)"; click "Parse & sync budget text". Then trigger rebuild staging if needed so pricing staging reflects the new rows. One job per paste. |
| **Smallest improvement to make importing easier and less error-prone** | Add a **JSON import path** alongside text: accept a JSON payload that matches (or can be mapped to) NormalizedJobBudget (e.g. DataX `jobtread_get_job_budget` shape), validate same as paste (jobId, jobName, at least one item), then call `syncNormalizedJobBudget`. Expose in UI as "Paste budget JSON" or "Upload budget JSON" so users can paste/upload DataX (or other) JSON without hand-formatting the pipe-delimited text. Optionally add a short in-app format hint (e.g. collapsible "Expected text format" with a minimal example) next to the textarea to reduce paste errors. |

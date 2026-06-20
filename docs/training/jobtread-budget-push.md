# Training: Push a Budget to JobTread

Once a project's estimate is built, you can send the whole budget into JobTread —
creating (or updating) the customer, the Design job, and every cost line — without
any copy/paste. This guide covers the **Push to JobTread** flow end to end.

> **Heads-up:** This writes real data into JobTread. Take the few seconds the
> Verify step gives you to check the lines before you push.

---

## 1. Where it lives

**In the app:** open a project → **Rooms** tab → the **"Push to JobTread"**
button (orange) in the toolbar. That opens the push window.

You need a finished estimate first (the rooms priced via AI Estimate). The push
reads the latest estimate for each room.

---

## 2. What gets pushed

For every room, the push sends the room's **full template** as the budget
structure — organized **Room → Trade → Line item** — so JobTread shows the
complete estimator checklist:

- Lines the estimate used get their **quantity and pricing**.
- Lines the template includes but the estimate didn't use are still sent at
  **quantity 0**, so nothing is silently dropped — you can see what wasn't needed.
- The AI **notes** for each line land in that cost item's **"Internal Notes"**
  field in JobTread.

---

## 3. The three steps

### Step 1 — Customer

**In the app:** pick an existing customer (type to search — it only lists active
customers with open jobs) **or** choose **"+ New customer"** and confirm the
name/address (pre-filled from the project).

### Step 2 — Job

**In the app:** pick an existing job under that customer, **or** create a new one.
New jobs default to the **Design** stage and a name like *"123 Main St - Design"*.

> **Tip:** JobTread caps job names at 30 characters — the field shows the limit.

> **Heads-up:** When you create a **new job** for an existing customer who has
> **more than one location**, the push attaches it to the customer's **first
> location**. If that customer has multiple properties, create the job directly
> in JobTread under the right location first, then come back and pick it as an
> *existing* job here.

### Step 3 — Verify (the important one)

This shows the whole budget as **Room → Trade → Line**. Two things to do here:

**a) Resolve any flagged lines.** Lines the template coded automatically are
ready. Lines highlighted **amber** ("flagged") need you to pick a **Cost Code**
and **Cost Group**:

- The **Cost Code** box is **searchable** — type "trim" to find both
  *Interior Trim* and *Exterior Trim*; type "elec sub" for *Electrical -
  Subcontract*.
- The **Cost Group** lets you re-home a line into any Room → Trade.
- Click **"Confirm this line"** when it's right. The **Push** button stays
  disabled until every flagged line is resolved.

> **Tip — it learns.** The cost code you pick for a line is **remembered**. Next
> time you push a line with the same name, it's pre-filled and tagged
> **"learned"** (no flag, no re-picking). You can still change it.

**b) Choose what to push (checkboxes).** Every room, trade, and line has a
checkbox. Uncheck anything you don't want to send — at the room level
("Screened Porch"), the trade level ("Demo"), or a single line. The header shows
**"Pushing X of Y lines."** This is especially handy when you only want to add a
few items (see Append below).

---

## 4. Pushing

Click **Push to JobTread**. The push runs **in the background** with a progress
bar ("X / Y line items") — large budgets take a minute or two. When it finishes
you get a success panel with a link straight to the job in JobTread.

> **Heads-up:** If a push fails partway, it **cleans up after itself** — it won't
> leave a half-built budget on the job. Just fix the issue and push again.

---

## 5. Pushing again (re-push)

If a project was already pushed, the window opens to a **re-push** choice instead
of duplicating:

- **Overwrite** — deletes the lines *this app* created last time and replaces
  them with the current estimate. **Manual edits you made in JobTread are kept.**
  Use this when the estimate changed and you want JobTread to match.
- **Append** — adds the currently-checked lines into the same job *alongside*
  what's already there. Use this (with the checkboxes in Step 3) to add a handful
  of new items. Watch for duplicates.
- **Start over** — only if you deleted the job in JobTread. This forgets the old
  link so you can push fresh.

---

## 6. Good to know

- **Material vs labor.** Material lines map to the trade's *"- Material"* code;
  install/labor lines map to *"- Subcontract"* (HHI subs its trade labor).
  Demolition and Construction Clean default to Subcontract too.
- **Allowances.** Estimate allowance lines are pushed as JobTread allowances.
- **One push at a time** per project, and the same push can't run twice — safe to
  click once and wait for the bar.

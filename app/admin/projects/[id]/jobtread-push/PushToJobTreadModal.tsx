"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  preparePush,
  listCustomerLocationsJobs,
  createCustomerAction,
  createLocationAction,
  createJobAction,
  pushBudgetAction,
  type PreparedPush,
  type CodeOption,
} from "@/app/lib/jobtread/budget-push/push-actions";
import type {
  JobTreadBudgetTree,
  JTCostItem,
} from "@/app/lib/jobtread/budget-push/types";
import type {
  JTCustomerLite,
  JTLocationLite,
  JTJobLite,
} from "@/app/lib/jobtread/budget-push/push-service";

/**
 * Push-to-JobTread modal. Walks an admin through three steps:
 *   1. pick (or create) a customer,
 *   2. pick (or create) a job under that customer,
 *   3. verify the resolved budget tree — every line that isn't a `template-exact`
 *      cost-code match must be actively resolved (cost code + cost group), with
 *      the ability to re-home a line into any room → trade in the tree.
 * Then it orchestrates the create-customer / create-location / create-job /
 * push-budget server actions, applying the in-modal verify edits to the tree
 * before sending it. JobTread writes happen only from this admin-gated flow.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

const overlay =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
const panel =
  "flex w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900";
const input =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";

function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** A line is flagged when its cost code wasn't an exact template match. */
function isFlagged(item: JTCostItem): boolean {
  return item.costCodeMatchKind !== "template-exact";
}

/** Stable key for a single line within the whole tree. */
function lineKey(roomIdx: number, tradeIdx: number, itemIdx: number): string {
  return `${roomIdx}:${tradeIdx}:${itemIdx}`;
}

/** Identifies a target room → trade for the Cost Group re-home select. */
function groupKey(roomIdx: number, tradeIdx: number): string {
  return `${roomIdx}|${tradeIdx}`;
}

interface GroupOption {
  key: string;
  roomIdx: number;
  tradeIdx: number;
  label: string;
}

// ── component ─────────────────────────────────────────────────────────────────

export function PushToJobTreadModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [prepared, setPrepared] = useState<PreparedPush | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The tree lives in local state so verify edits (re-homed lines + chosen
  // codes) are reflected before we hand it to pushBudgetAction.
  const [tree, setTree] = useState<JobTreadBudgetTree | null>(null);

  // step machine
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── STEP 1: customer ────────────────────────────────────────────────────────
  const [custMode, setCustMode] = useState<"existing" | "new">("existing");
  const [custSearch, setCustSearch] = useState("");
  const [selCustomer, setSelCustomer] = useState<JTCustomerLite | null>(null);
  // new customer form
  const [newCustName, setNewCustName] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");

  // ── STEP 2: job ─────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState<JTLocationLite[] | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [jobMode, setJobMode] = useState<"existing" | "new">("new");
  const [selJob, setSelJob] = useState<{ job: JTJobLite; locationId: string } | null>(
    null,
  );
  // new job form
  const [newJobName, setNewJobName] = useState("");
  const [newJobStage, setNewJobStage] = useState("Design");

  // ── STEP 3: verify ──────────────────────────────────────────────────────────
  // Per-flagged-line "resolved" set, keyed by lineKey.
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  // Which template-exact groups are expanded (collapsed by default).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── push state ──────────────────────────────────────────────────────────────
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    jobId: string;
    jobNumber: string | null;
    groupCount: number;
    itemCount: number;
  } | null>(null);

  // Load the prepared push on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    preparePush(projectId)
      .then((p) => {
        if (cancelled) return;
        setPrepared(p);
        setTree(p.tree);
        setNewCustName(p.defaultCustomerName);
        setNewCustAddress(p.defaultAddress);
        setNewJobName(p.defaultJobName);
        if (p.jobStageOptions.includes("Design")) setNewJobStage("Design");
        else if (p.jobStageOptions.length > 0) setNewJobStage(p.jobStageOptions[0]);
        if (p.customers.length === 0) setCustMode("new");
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to prepare the push."),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Every room → trade in the tree, for the Cost Group re-home select.
  const groupOptions = useMemo<GroupOption[]>(() => {
    if (!tree) return [];
    const opts: GroupOption[] = [];
    tree.rooms.forEach((room, ri) => {
      room.trades.forEach((trade, ti) => {
        opts.push({
          key: groupKey(ri, ti),
          roomIdx: ri,
          tradeIdx: ti,
          label: `${room.roomName} › ${trade.tradeName}`,
        });
      });
    });
    return opts;
  }, [tree]);

  // Flagged lines that haven't been resolved yet.
  const unresolvedFlaggedCount = useMemo(() => {
    if (!tree) return 0;
    let n = 0;
    tree.rooms.forEach((room, ri) => {
      room.trades.forEach((trade, ti) => {
        trade.items.forEach((item, ii) => {
          if (isFlagged(item) && !resolved[lineKey(ri, ti, ii)]) n += 1;
        });
      });
    });
    return n;
  }, [tree, resolved]);

  const allFlaggedResolved = unresolvedFlaggedCount === 0;

  // Whether a customer + job target has been chosen.
  const customerChosen =
    custMode === "existing" ? selCustomer !== null : newCustName.trim().length > 0;
  const jobChosen =
    jobMode === "existing" ? selJob !== null : newJobName.trim().length > 0;
  const targetChosen = customerChosen && jobChosen;

  const canPush = targetChosen && allFlaggedResolved && !pushing && !success;

  // Re-home a line to a different room → trade. Re-keys the resolved map so the
  // line keeps its "resolved" flag at its new coordinates.
  function moveLine(
    fromRi: number,
    fromTi: number,
    fromIi: number,
    targetKey: string,
  ) {
    const prev = tree;
    if (!prev) return;
    const target = groupOptions.find((g) => g.key === targetKey);
    if (!target) return;
    if (target.roomIdx === fromRi && target.tradeIdx === fromTi) return;

    // Deep-clone the rooms/trades/items we touch.
    const rooms = prev.rooms.map((r) => ({
      ...r,
      trades: r.trades.map((t) => ({ ...t, items: [...t.items] })),
    }));
    const [moved] = rooms[fromRi].trades[fromTi].items.splice(fromIi, 1);
    if (!moved) return;
    rooms[target.roomIdx].trades[target.tradeIdx].items.push(moved);

    // Re-home shifts every line's index, so the index-keyed `resolved` map is
    // stale. Rebuild it by item identity: every previously-resolved line keeps
    // its flag at its new coordinates, and the moved line is marked resolved
    // (the person just interacted with it).
    const movedWasResolved = resolved[lineKey(fromRi, fromTi, fromIi)];
    setResolved(rekeyResolved(prev, rooms, resolved, moved, movedWasResolved));
    setTree({ ...prev, rooms });
  }

  // Mark a flagged line resolved once the person interacts with it.
  function markResolved(ri: number, ti: number, ii: number) {
    setResolved((r) => ({ ...r, [lineKey(ri, ti, ii)]: true }));
  }

  // Set the cost code on a line from a CodeOption; derive cost type if a
  // matching cost-type option exists for the chosen code's name, else leave it.
  function setLineCostCode(
    ri: number,
    ti: number,
    ii: number,
    codeId: string,
  ) {
    if (!prepared) return;
    const opt = prepared.costCodeOptions.find((o) => o.id === codeId);
    setTree((prev) => {
      if (!prev) return prev;
      const rooms = prev.rooms.map((r) => ({
        ...r,
        trades: r.trades.map((t) => ({ ...t, items: [...t.items] })),
      }));
      const item = rooms[ri].trades[ti].items[ii];
      if (!item) return prev;
      const next: JTCostItem = {
        ...item,
        costCodeId: opt ? opt.id : null,
        costCodeName: opt ? opt.name : null,
      };
      // Try to derive a cost type from a same-named cost-type option.
      if (opt) {
        const ct = deriveCostType(opt.name, prepared.costTypeOptions);
        if (ct) {
          next.costTypeId = ct.id;
          next.costTypeName = ct.name;
        }
      }
      rooms[ri].trades[ti].items[ii] = next;
      return { ...prev, rooms };
    });
    markResolved(ri, ti, ii);
  }

  // Load a selected existing customer's locations + jobs for STEP 2.
  async function loadLocations(accountId: string) {
    setLocLoading(true);
    setError(null);
    try {
      const locs = await listCustomerLocationsJobs(accountId);
      setLocations(locs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs.");
    } finally {
      setLocLoading(false);
    }
  }

  // STEP 1 → STEP 2 transition.
  async function goToJobStep() {
    setError(null);
    if (custMode === "existing") {
      if (!selCustomer) {
        setError("Select a customer first.");
        return;
      }
      setJobMode("new"); // default; they can switch to existing once locations load
      setStep(2);
      await loadLocations(selCustomer.id);
    } else {
      if (!newCustName.trim()) {
        setError("Customer name is required.");
        return;
      }
      // New customer → only a new job is possible.
      setLocations(null);
      setJobMode("new");
      setStep(2);
    }
  }

  // STEP 2 → STEP 3 transition.
  function goToVerifyStep() {
    setError(null);
    if (jobMode === "existing") {
      if (!selJob) {
        setError("Select a job first.");
        return;
      }
    } else if (!newJobName.trim()) {
      setError("Job name is required.");
      return;
    }
    setStep(3);
  }

  // Orchestrate the push.
  async function handlePush() {
    if (!tree) return;
    setPushing(true);
    setPushError(null);
    try {
      let accountId: string | null = null;
      let locationId: string | null = null;
      let jobId: string;
      let jobNumber: string | null = null;

      if (custMode === "existing") {
        accountId = selCustomer?.id ?? null;
      } else {
        const c = await createCustomerAction(newCustName.trim());
        accountId = c.accountId;
        const l = await createLocationAction(
          accountId,
          newCustName.trim(),
          newCustAddress.trim(),
        );
        locationId = l.locationId;
      }

      if (jobMode === "existing" && selJob) {
        jobId = selJob.job.id;
        locationId = selJob.locationId;
        jobNumber = selJob.job.number;
      } else {
        // New job. For an existing customer + new job, we need a location: pick
        // the first existing location, else create one.
        if (!locationId) {
          if (custMode === "existing" && accountId) {
            const firstLoc = (locations ?? []).find((l) => l.id)?.id ?? null;
            if (firstLoc) {
              locationId = firstLoc;
            } else {
              const l = await createLocationAction(
                accountId,
                selCustomer?.name ?? newCustName.trim(),
                newCustAddress.trim(),
              );
              locationId = l.locationId;
            }
          }
        }
        if (!locationId) throw new Error("Could not determine a location for the new job.");
        const created = await createJobAction(locationId, newJobName.trim(), newJobStage);
        jobId = created.jobId;
        jobNumber = created.jobNumber;
      }

      const res = await pushBudgetAction(projectId, jobId, tree, {
        accountId,
        locationId,
        jobNumber,
      });

      setSuccess({
        jobId,
        jobNumber,
        groupCount: res.groupCount,
        itemCount: res.itemCount,
      });
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Push failed.");
    } finally {
      setPushing(false);
    }
  }

  // Customer type-ahead filter.
  const filteredCustomers = useMemo(() => {
    if (!prepared) return [];
    const q = custSearch.trim().toLowerCase();
    if (!q) return prepared.customers;
    return prepared.customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [prepared, custSearch]);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={panel}
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Push budget to JobTread
            </h3>
            {prepared && !success && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {prepared.projectTitle} — {prepared.stats.roomCount} rooms,{" "}
                {prepared.stats.lineItemCount} lines
                {prepared.stats.flaggedCount > 0
                  ? `, ${prepared.stats.flaggedCount} flagged`
                  : ""}
              </p>
            )}
          </div>
          {!success && !loading && (
            <Stepper step={step} />
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Preparing the push…
            </p>
          ) : error && !prepared ? (
            <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : success ? (
            <SuccessPanel success={success} onClose={onClose} />
          ) : !prepared || !tree ? (
            <p className="py-12 text-center text-sm text-zinc-500">No data.</p>
          ) : (
            <>
              {error && (
                <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </p>
              )}

              {step === 1 && (
                <CustomerStep
                  prepared={prepared}
                  custMode={custMode}
                  setCustMode={(m) => {
                    setCustMode(m);
                    setError(null);
                  }}
                  custSearch={custSearch}
                  setCustSearch={setCustSearch}
                  filteredCustomers={filteredCustomers}
                  selCustomer={selCustomer}
                  setSelCustomer={setSelCustomer}
                  newCustName={newCustName}
                  setNewCustName={setNewCustName}
                  newCustAddress={newCustAddress}
                  setNewCustAddress={setNewCustAddress}
                />
              )}

              {step === 2 && (
                <JobStep
                  prepared={prepared}
                  isExistingCustomer={custMode === "existing"}
                  locations={locations}
                  locLoading={locLoading}
                  jobMode={jobMode}
                  setJobMode={(m) => {
                    setJobMode(m);
                    setError(null);
                  }}
                  selJob={selJob}
                  setSelJob={setSelJob}
                  newJobName={newJobName}
                  setNewJobName={setNewJobName}
                  newJobStage={newJobStage}
                  setNewJobStage={setNewJobStage}
                />
              )}

              {step === 3 && (
                <VerifyStep
                  prepared={prepared}
                  tree={tree}
                  resolved={resolved}
                  expanded={expanded}
                  toggleExpanded={(k) =>
                    setExpanded((e) => ({ ...e, [k]: !e[k] }))
                  }
                  groupOptions={groupOptions}
                  unresolvedFlaggedCount={unresolvedFlaggedCount}
                  onPickCostCode={setLineCostCode}
                  onMoveLine={moveLine}
                  onMarkResolved={markResolved}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && !loading && prepared && tree && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
            <button
              onClick={step === 1 ? onClose : () => setStep((s) => (s === 3 ? 2 : 1))}
              disabled={pushing}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {step === 1 ? "Cancel" : "Back"}
            </button>

            <div className="flex items-center gap-3">
              {pushError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  {pushError}
                </span>
              )}
              {step === 1 && (
                <button
                  onClick={goToJobStep}
                  disabled={!customerChosen}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Next: Job
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={goToVerifyStep}
                  disabled={!jobChosen}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Next: Verify
                </button>
              )}
              {step === 3 && (
                <button
                  onClick={handlePush}
                  disabled={!canPush}
                  title={
                    !targetChosen
                      ? "Choose a customer and job first."
                      : !allFlaggedResolved
                        ? `${unresolvedFlaggedCount} flagged line(s) still need a cost code + group.`
                        : undefined
                  }
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {pushing ? "Pushing…" : "Push to JobTread"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels: Array<[1 | 2 | 3, string]> = [
    [1, "Customer"],
    [2, "Job"],
    [3, "Verify"],
  ];
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {labels.map(([n, label], i) => (
        <span key={n} className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              step === n
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : step > n
                  ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                  : "text-zinc-400"
            }`}
          >
            {n}. {label}
          </span>
          {i < labels.length - 1 && <span className="text-zinc-300">›</span>}
        </span>
      ))}
    </div>
  );
}

// ── STEP 1: Customer ──────────────────────────────────────────────────────────

function CustomerStep({
  prepared,
  custMode,
  setCustMode,
  custSearch,
  setCustSearch,
  filteredCustomers,
  selCustomer,
  setSelCustomer,
  newCustName,
  setNewCustName,
  newCustAddress,
  setNewCustAddress,
}: {
  prepared: PreparedPush;
  custMode: "existing" | "new";
  setCustMode: (m: "existing" | "new") => void;
  custSearch: string;
  setCustSearch: (v: string) => void;
  filteredCustomers: JTCustomerLite[];
  selCustomer: JTCustomerLite | null;
  setSelCustomer: (c: JTCustomerLite | null) => void;
  newCustName: string;
  setNewCustName: (v: string) => void;
  newCustAddress: string;
  setNewCustAddress: (v: string) => void;
}) {
  const toggleBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className={toggleBtn(custMode === "existing")}
          onClick={() => setCustMode("existing")}
          disabled={prepared.customers.length === 0}
        >
          Existing customer
        </button>
        <button
          className={toggleBtn(custMode === "new")}
          onClick={() => setCustMode("new")}
        >
          + New customer
        </button>
      </div>

      {custMode === "existing" ? (
        <div className="space-y-2">
          <input
            className={`w-full ${input}`}
            placeholder="Search customers…"
            value={custSearch}
            onChange={(e) => setCustSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {filteredCustomers.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-zinc-500">
                No matching customers.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredCustomers.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelCustomer(c)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        selCustomer?.id === c.id
                          ? "bg-zinc-100 font-medium dark:bg-zinc-800"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <span>{c.name}</span>
                      {selCustomer?.id === c.id && (
                        <span className="text-xs text-zinc-500">selected</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-500">
              Customer name
            </span>
            <input
              className={`mt-1 w-full ${input}`}
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Customer name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-500">
              Address (optional)
            </span>
            <input
              className={`mt-1 w-full ${input}`}
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              placeholder="123 Main St, Hilton Head Island, SC 29928"
            />
          </label>
          <p className="text-xs text-zinc-400">
            We&apos;ll create the customer account and a location, then a new job
            on the next step.
          </p>
        </div>
      )}
    </div>
  );
}

// ── STEP 2: Job ───────────────────────────────────────────────────────────────

function JobStep({
  prepared,
  isExistingCustomer,
  locations,
  locLoading,
  jobMode,
  setJobMode,
  selJob,
  setSelJob,
  newJobName,
  setNewJobName,
  newJobStage,
  setNewJobStage,
}: {
  prepared: PreparedPush;
  isExistingCustomer: boolean;
  locations: JTLocationLite[] | null;
  locLoading: boolean;
  jobMode: "existing" | "new";
  setJobMode: (m: "existing" | "new") => void;
  selJob: { job: JTJobLite; locationId: string } | null;
  setSelJob: (j: { job: JTJobLite; locationId: string } | null) => void;
  newJobName: string;
  setNewJobName: (v: string) => void;
  newJobStage: string;
  setNewJobStage: (v: string) => void;
}) {
  const toggleBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  const hasAnyJobs =
    (locations ?? []).some((l) => l.jobs.length > 0) && isExistingCustomer;

  return (
    <div className="space-y-4">
      {isExistingCustomer && (
        <div className="flex gap-2">
          <button
            className={toggleBtn(jobMode === "existing")}
            onClick={() => setJobMode("existing")}
            disabled={!hasAnyJobs}
            title={!hasAnyJobs ? "This customer has no jobs yet." : undefined}
          >
            Existing job
          </button>
          <button
            className={toggleBtn(jobMode === "new")}
            onClick={() => setJobMode("new")}
          >
            + New job
          </button>
        </div>
      )}

      {isExistingCustomer && jobMode === "existing" ? (
        locLoading ? (
          <p className="py-6 text-center text-sm text-zinc-500">Loading jobs…</p>
        ) : !locations || locations.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            No locations / jobs found for this customer.
          </p>
        ) : (
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                <div className="border-b border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:border-zinc-800">
                  {loc.name ?? "(unnamed location)"}
                </div>
                {loc.jobs.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-400">
                    No jobs at this location.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {loc.jobs.map((j) => (
                      <li key={j.id}>
                        <button
                          onClick={() => setSelJob({ job: j, locationId: loc.id })}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                            selJob?.job.id === j.id
                              ? "bg-zinc-100 font-medium dark:bg-zinc-800"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          <span>
                            {j.name}
                            {j.number ? (
                              <span className="ml-2 text-xs text-zinc-400">
                                #{j.number}
                              </span>
                            ) : null}
                          </span>
                          {j.closedOn && (
                            <span className="text-xs text-zinc-400">closed</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-500">Job name</span>
            <input
              className={`mt-1 w-full ${input}`}
              value={newJobName}
              maxLength={30}
              onChange={(e) => setNewJobName(e.target.value)}
              placeholder="Address - Design"
            />
            <span className="mt-1 block text-xs text-zinc-400">
              JobTread caps job names at 30 characters.
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-500">Job stage</span>
            <select
              className={`mt-1 w-full ${input}`}
              value={newJobStage}
              onChange={(e) => setNewJobStage(e.target.value)}
            >
              {prepared.jobStageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

// ── STEP 3: Verify ────────────────────────────────────────────────────────────

function VerifyStep({
  prepared,
  tree,
  resolved,
  expanded,
  toggleExpanded,
  groupOptions,
  unresolvedFlaggedCount,
  onPickCostCode,
  onMoveLine,
  onMarkResolved,
}: {
  prepared: PreparedPush;
  tree: JobTreadBudgetTree;
  resolved: Record<string, boolean>;
  expanded: Record<string, boolean>;
  toggleExpanded: (k: string) => void;
  groupOptions: GroupOption[];
  unresolvedFlaggedCount: number;
  onPickCostCode: (ri: number, ti: number, ii: number, codeId: string) => void;
  onMoveLine: (ri: number, ti: number, ii: number, targetKey: string) => void;
  onMarkResolved: (ri: number, ti: number, ii: number) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {unresolvedFlaggedCount > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {unresolvedFlaggedCount} flagged line
          {unresolvedFlaggedCount === 1 ? "" : "s"} need a cost code + group.
          Resolve each highlighted line below before pushing.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          All lines resolved. Ready to push.
        </div>
      )}

      {(tree.roomsWithoutTemplate.length > 0 ||
        tree.roomsWithoutEstimate.length > 0) && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/40">
          {tree.roomsWithoutTemplate.length > 0 && (
            <p>
              Estimate-only (no template):{" "}
              {tree.roomsWithoutTemplate.join(", ")}
            </p>
          )}
          {tree.roomsWithoutEstimate.length > 0 && (
            <p>Skipped (no estimate): {tree.roomsWithoutEstimate.join(", ")}</p>
          )}
        </div>
      )}

      {/* Tree: Room → Trade → items */}
      <div className="space-y-4">
        {tree.rooms.map((room, ri) => (
          <div
            key={`${room.roomId}-${ri}`}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700"
          >
            <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {room.roomName}
              </span>
              {room.isProjectOverhead && (
                <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  COPE
                </span>
              )}
              {!room.hasTemplate && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  no template
                </span>
              )}
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {room.trades.map((trade, ti) => {
                const flaggedItems = trade.items
                  .map((it, ii) => ({ it, ii }))
                  .filter(({ it }) => isFlagged(it));
                const exactItems = trade.items
                  .map((it, ii) => ({ it, ii }))
                  .filter(({ it }) => !isFlagged(it));
                const groupExpKey = `${ri}:${ti}`;
                const isExp = !!expanded[groupExpKey];

                return (
                  <div key={`${trade.tradeName}-${ti}`} className="px-3 py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {trade.tradeName}
                      </span>
                      {exactItems.length > 0 && (
                        <button
                          onClick={() => toggleExpanded(groupExpKey)}
                          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          {isExp ? "Hide" : "Show"} {exactItems.length} matched
                        </button>
                      )}
                    </div>

                    {/* Flagged items first — always visible, require resolution */}
                    {flaggedItems.map(({ it, ii }) => (
                      <FlaggedLine
                        key={`f-${ii}`}
                        item={it}
                        ri={ri}
                        ti={ti}
                        ii={ii}
                        resolved={!!resolved[lineKey(ri, ti, ii)]}
                        currentGroupKey={groupKey(ri, ti)}
                        groupOptions={groupOptions}
                        costCodeOptions={prepared.costCodeOptions}
                        onPickCostCode={onPickCostCode}
                        onMoveLine={onMoveLine}
                        onMarkResolved={onMarkResolved}
                      />
                    ))}

                    {/* Matched (template-exact) items — read-only, collapsible */}
                    {isExp &&
                      exactItems.map(({ it, ii }) => (
                        <ExactLine key={`e-${ii}`} item={it} />
                      ))}

                    {trade.items.length === 0 && (
                      <p className="py-1 text-xs text-zinc-400">No lines.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One read-only template-exact line.
function ExactLine({ item }: { item: JTCostItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">
        {item.name}
      </span>
      <span className="w-20 text-right text-xs text-zinc-400">
        {item.quantity} {item.unit}
      </span>
      <span className="w-24 text-right text-xs text-zinc-500">
        {usd(item.unitPrice)}
      </span>
      <span className="w-40 truncate text-right text-xs text-zinc-400">
        {item.costCodeName ?? "—"}
      </span>
    </div>
  );
}

/**
 * Searchable single-select combobox for long option lists (e.g. the 155-entry
 * cost-code catalog). Type any substring(s) to filter — "trim" surfaces both
 * "36S - Interior Trim" and "20M - Exterior Trim". Inline-expanding (renders the
 * list in-flow, not as an absolute overlay) so it never gets clipped by the
 * modal body's `overflow-y-auto`. Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 */
function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  placeholder?: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const terms = q.split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const n = o.name.toLowerCase();
      return terms.every((t) => n.includes(t));
    });
  }, [options, query]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setActiveIdx(0);
        }}
        className={`mt-0.5 flex w-full items-center justify-between gap-2 text-left ${input}`}
      >
        <span className={`truncate ${selected ? "" : "text-zinc-400"}`}>
          {selected ? selected.name : placeholder ?? "— select —"}
        </span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="mt-1 rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const o = filtered[activeIdx];
                if (o) choose(o.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setQuery("");
              }
            }}
            placeholder="Type to search…"
            className="w-full border-b border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
          />
          <ul className="max-h-52 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-sm text-zinc-400">No matches</li>
            ) : (
              filtered.map((o, idx) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => choose(o.id)}
                    className={`block w-full truncate px-2 py-1.5 text-left text-sm ${
                      idx === activeIdx
                        ? "bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200"
                        : "text-zinc-700 dark:text-zinc-200"
                    } ${o.id === value ? "font-semibold" : ""}`}
                  >
                    {o.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// One flagged line — requires a cost code + cost group choice.
function FlaggedLine({
  item,
  ri,
  ti,
  ii,
  resolved,
  currentGroupKey,
  groupOptions,
  costCodeOptions,
  onPickCostCode,
  onMoveLine,
  onMarkResolved,
}: {
  item: JTCostItem;
  ri: number;
  ti: number;
  ii: number;
  resolved: boolean;
  currentGroupKey: string;
  groupOptions: GroupOption[];
  costCodeOptions: CodeOption[];
  onPickCostCode: (ri: number, ti: number, ii: number, codeId: string) => void;
  onMoveLine: (ri: number, ti: number, ii: number, targetKey: string) => void;
  onMarkResolved: (ri: number, ti: number, ii: number) => void;
}) {
  return (
    <div
      className={`my-1 rounded-lg border p-2 ${
        resolved
          ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          : "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/15"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {item.name}
        </span>
        <span className="text-xs text-zinc-400">
          {item.quantity} {item.unit} · {usd(item.unitPrice)}
        </span>
        {resolved ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            resolved
          </span>
        ) : (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-800/50 dark:text-amber-200">
            {item.costCodeMatchKind ?? "flagged"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="block">
          <span className="text-[10px] font-medium uppercase text-zinc-400">
            Cost code
          </span>
          <SearchableSelect
            value={item.costCodeId ?? ""}
            options={costCodeOptions}
            placeholder="— select cost code —"
            onChange={(id) => onPickCostCode(ri, ti, ii, id)}
          />
        </div>

        <label className="block">
          <span className="text-[10px] font-medium uppercase text-zinc-400">
            Cost group (room › trade)
          </span>
          <select
            className={`mt-0.5 w-full ${input}`}
            value={currentGroupKey}
            onChange={(e) => onMoveLine(ri, ti, ii, e.target.value)}
          >
            {groupOptions.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!resolved && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => onMarkResolved(ri, ti, ii)}
            className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
          >
            Confirm this line
          </button>
        </div>
      )}
    </div>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

function SuccessPanel({
  success,
  onClose,
}: {
  success: {
    jobId: string;
    jobNumber: string | null;
    groupCount: number;
    itemCount: number;
  };
  onClose: () => void;
}) {
  const url = `https://app.jobtread.com/jobs/${success.jobId}`;
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
        ✓
      </div>
      <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Budget pushed to JobTread
      </h4>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Created {success.groupCount} cost group
        {success.groupCount === 1 ? "" : "s"} and {success.itemCount} line item
        {success.itemCount === 1 ? "" : "s"}
        {success.jobNumber ? ` on job #${success.jobNumber}` : ""}.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-orange-600 hover:underline dark:text-orange-400"
      >
        Open job in JobTread →
      </a>
      <button
        onClick={onClose}
        className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Close
      </button>
    </div>
  );
}

// ── Pure helpers (cost-type derivation + resolved re-keying) ───────────────────

/**
 * Derive a cost type from a chosen cost code's name. Cost codes in JobTread are
 * commonly named "<Trade> - <Type>" (e.g. "Framing - Material"); we try to find
 * a cost-type option whose name appears in the code name. Returns null when no
 * confident derivation is possible (the caller then leaves the cost type alone).
 */
function deriveCostType(
  codeName: string,
  costTypeOptions: CodeOption[],
): CodeOption | null {
  const lower = codeName.toLowerCase();
  // Prefer the longest matching cost-type name to avoid partial collisions.
  const matches = costTypeOptions
    .filter((ct) => ct.name && lower.includes(ct.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  if (matches.length > 0) return matches[0];
  // Common suffix heuristics.
  if (/\bmaterial/.test(lower)) {
    const m = costTypeOptions.find((ct) =>
      /material/i.test(ct.name),
    );
    if (m) return m;
  }
  if (/\b(install|labor|labour)/.test(lower)) {
    const m = costTypeOptions.find((ct) => /labor|labour/i.test(ct.name));
    if (m) return m;
  }
  if (/\bsub/.test(lower)) {
    const m = costTypeOptions.find((ct) => /sub/i.test(ct.name));
    if (m) return m;
  }
  return null;
}

/**
 * Rebuild the per-line "resolved" map after a line is moved between trade
 * groups. We can't track item identity by index across the move, so we use the
 * moved item's object reference (`movedRef`, stable across the splice) to find
 * its new coordinates and preserve / set its resolved flag, while carrying every
 * other previously-resolved flagged line forward by matching the unchanged
 * positions in the rebuilt tree against the old tree.
 */
function rekeyResolved(
  oldTree: JobTreadBudgetTree,
  newRooms: JobTreadBudgetTree["rooms"],
  oldResolved: Record<string, boolean>,
  movedRef: JTCostItem,
  movedWasResolved: boolean | undefined,
): Record<string, boolean> {
  // Map from item object reference → its OLD resolved flag.
  const oldFlagByRef = new Map<JTCostItem, boolean>();
  oldTree.rooms.forEach((room, ri) => {
    room.trades.forEach((trade, ti) => {
      trade.items.forEach((it, ii) => {
        oldFlagByRef.set(it, !!oldResolved[lineKey(ri, ti, ii)]);
      });
    });
  });

  const next: Record<string, boolean> = {};
  newRooms.forEach((room, ri) => {
    room.trades.forEach((trade, ti) => {
      trade.items.forEach((it, ii) => {
        const key = lineKey(ri, ti, ii);
        if (it === movedRef) {
          // The person just interacted with this line by moving it.
          next[key] = true;
          void movedWasResolved;
        } else {
          const was = oldFlagByRef.get(it);
          if (was) next[key] = true;
        }
      });
    });
  });
  return next;
}

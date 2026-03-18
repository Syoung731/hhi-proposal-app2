'use client';

import { useState } from 'react';
import {
  reconcileAppVsBudget,
  type BudgetRow,
  type AppVsBudgetReconciliation,
} from '../sources/actions';

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const JOB_ID = '22PJXd2cjdhN';

export function AppVsBudgetReconciliation() {
  const [budgetJson, setBudgetJson] = useState('');
  const [result, setResult] = useState<AppVsBudgetReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    setError(null);
    setResult(null);
    let rows: BudgetRow[];
    try {
      rows = JSON.parse(budgetJson) as BudgetRow[];
      if (!Array.isArray(rows)) throw new Error('JSON must be an array of budget rows');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    setLoading(true);
    try {
      const out = await reconcileAppVsBudget(JOB_ID, rows);
      setResult(out ?? null);
      if (!out) setError('Project not found for job ' + JOB_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconciliation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        App vs JobTread budget (125 South Shore #1302)
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Paste JSON array of budget rows from jobtread_get_job_budget (DataX). Each row: groupPath?, roomKey?, name,
        quantity, unitPrice, unitCost, costCode?, type? Match is by path + normalized name + qty + unit price + unit cost.
        Validation: Living Room &gt; Electrical &gt; [ELE] Run 110 - Residential Romex Wiring (qty 150, ext cost 750, ext
        price 1973.68) should exist once in budget and match the single deduped app row.
      </p>
      <textarea
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        rows={6}
        placeholder='[{"name":"...","quantity":1,"unitPrice":0,"unitCost":0,"groupPath":"Living Room > Electrical",...}]'
        value={budgetJson}
        onChange={(e) => setBudgetJson(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? 'Running…' : 'Run reconciliation'}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">App (deduped)</div>
              <div className="mt-1">
                {result.appRowCount} rows · Sell {formatCurrency(result.appSellTotal)} · Cost{' '}
                {formatCurrency(result.appCostTotal)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Budget</div>
              <div className="mt-1">
                {result.budgetRowCount} rows · Sell {formatCurrency(result.budgetSellTotal)} · Cost{' '}
                {formatCurrency(result.budgetCostTotal)}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
              Unmatched app rows (in app but not in budget)
            </div>
            <div className="mt-1 font-semibold text-amber-700 dark:text-amber-400">
              {result.unmatchedAppRows.length} rows · Sell {formatCurrency(result.unmatchedSellSubtotal)} · Cost{' '}
              {formatCurrency(result.unmatchedCostSubtotal)}
            </div>
          </div>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
            <strong>Recommendation:</strong> {result.recommendation}
          </p>
          {result.subtotalsByRoom.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Unmatched subtotals by room
              </h3>
              <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Room path</th>
                      <th className="px-2 py-1.5 text-right">Rows</th>
                      <th className="px-2 py-1.5 text-right">Sell</th>
                      <th className="px-2 py-1.5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {result.subtotalsByRoom.slice(0, 15).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{r.roomPath}</td>
                        <td className="px-2 py-1.5 text-right">{r.rowCount}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.sellSubtotal)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.costSubtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.subtotalsByGroup.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Unmatched subtotals by group
              </h3>
              <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Group</th>
                      <th className="px-2 py-1.5 text-right">Rows</th>
                      <th className="px-2 py-1.5 text-right">Sell</th>
                      <th className="px-2 py-1.5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {result.subtotalsByGroup.slice(0, 15).map((g, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{g.groupName}</td>
                        <td className="px-2 py-1.5 text-right">{g.rowCount}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(g.sellSubtotal)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(g.costSubtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.groupedUnmatched.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Unmatched by group / room / cost code / type (top cost)
              </h3>
              <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Group</th>
                      <th className="px-2 py-1.5 text-left">Room path</th>
                      <th className="px-2 py-1.5 text-right">Rows</th>
                      <th className="px-2 py-1.5 text-right">Sell</th>
                      <th className="px-2 py-1.5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {result.groupedUnmatched.slice(0, 20).map((g, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{g.groupName}</td>
                        <td className="px-2 py-1.5">{g.roomPath}</td>
                        <td className="px-2 py-1.5 text-right">{g.rowCount}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(g.sellSubtotal)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(g.costSubtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.topCostContributors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Top cost contributors (unmatched app rows)
              </h3>
              <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Name</th>
                      <th className="px-2 py-1.5 text-left">Path</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Extended cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {result.topCostContributors.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5">{r.groupPath}</td>
                        <td className="px-2 py-1.5 text-right">{r.quantity}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.extendedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

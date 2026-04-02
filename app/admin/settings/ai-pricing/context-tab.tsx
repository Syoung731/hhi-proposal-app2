"use client";

import { useState, useEffect } from "react";

type CompanyContext = {
  id: string;
  market: string;
  marketNotes: string | null;
  clientProfile: string | null;
  defaultFinishTier: string;
  standardInclusions: string | null;
  markupStructure: string | null;
  notes: string | null;
  estimationAssumptions: string | null;
  priceRangeLowPct: number | null;
  priceRangeHighPct: number | null;
};

const inputClass =
  "w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const textareaClass =
  "w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 min-h-[80px]";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const FINISH_TIERS = ["standard", "high-end", "luxury"] as const;

export function CompanyContextTab() {
  const [ctx, setCtx] = useState<CompanyContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [market, setMarket] = useState("");
  const [marketNotes, setMarketNotes] = useState("");
  const [clientProfile, setClientProfile] = useState("");
  const [defaultFinishTier, setDefaultFinishTier] = useState("high-end");
  const [standardInclusions, setStandardInclusions] = useState("");
  const [markupStructure, setMarkupStructure] = useState("");
  const [notes, setNotes] = useState("");
  const [estimationAssumptions, setEstimationAssumptions] = useState("");
  const [priceRangeLowPct, setPriceRangeLowPct] = useState("-10");
  const [priceRangeHighPct, setPriceRangeHighPct] = useState("10");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/context");
        const data = await res.json();
        setCtx(data);
        setMarket(data.market ?? "");
        setMarketNotes(data.marketNotes ?? "");
        setClientProfile(data.clientProfile ?? "");
        setDefaultFinishTier(data.defaultFinishTier ?? "high-end");
        setStandardInclusions(data.standardInclusions ?? "");
        setMarkupStructure(data.markupStructure ?? "");
        setNotes(data.notes ?? "");
        setEstimationAssumptions(data.estimationAssumptions ?? "");
        setPriceRangeLowPct(String(data.priceRangeLowPct ?? -10));
        setPriceRangeHighPct(String(data.priceRangeHighPct ?? 10));
      } catch {
        // Leave defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/settings/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          marketNotes: marketNotes || null,
          clientProfile: clientProfile || null,
          defaultFinishTier,
          standardInclusions: standardInclusions || null,
          markupStructure: markupStructure || null,
          notes: notes || null,
          estimationAssumptions: estimationAssumptions || null,
          priceRangeLowPct: parseFloat(priceRangeLowPct) || -10,
          priceRangeHighPct: parseFloat(priceRangeHighPct) || 10,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus("error");
        setErrorMessage(data.error);
        return;
      }
      setCtx(data);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          This context is sent to the AI with every estimate request. It helps the model understand your market, pricing, and client expectations.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="ctx-market" className={labelClass}>Market</label>
          <input
            id="ctx-market"
            type="text"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ctx-marketNotes" className={labelClass}>Market Notes</label>
          <textarea
            id="ctx-marketNotes"
            value={marketNotes}
            onChange={(e) => setMarketNotes(e.target.value)}
            className={textareaClass}
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="ctx-clientProfile" className={labelClass}>Client Profile</label>
          <textarea
            id="ctx-clientProfile"
            value={clientProfile}
            onChange={(e) => setClientProfile(e.target.value)}
            className={textareaClass}
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="ctx-finishTier" className={labelClass}>Default Finish Tier</label>
          <select
            id="ctx-finishTier"
            value={defaultFinishTier}
            onChange={(e) => setDefaultFinishTier(e.target.value)}
            className={inputClass + " max-w-xs"}
          >
            {FINISH_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ctx-inclusions" className={labelClass}>Standard Inclusions</label>
          <textarea
            id="ctx-inclusions"
            value={standardInclusions}
            onChange={(e) => setStandardInclusions(e.target.value)}
            className={textareaClass}
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="ctx-markup" className={labelClass}>Markup Structure</label>
          <textarea
            id="ctx-markup"
            value={markupStructure}
            onChange={(e) => setMarkupStructure(e.target.value)}
            className={textareaClass}
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="ctx-notes" className={labelClass}>Additional Notes</label>
          <textarea
            id="ctx-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={textareaClass}
            rows={3}
          />
        </div>

        <div>
          <label className={labelClass}>Price Range</label>
          <div className="flex items-center gap-4 max-w-xl">
            <div className="flex-1">
              <label htmlFor="ctx-rangeLow" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                Low (%)
              </label>
              <input
                id="ctx-rangeLow"
                type="number"
                step="1"
                value={priceRangeLowPct}
                onChange={(e) => setPriceRangeLowPct(e.target.value)}
                className={inputClass + " max-w-[120px]"}
              />
              <p className="mt-0.5 text-[11px] text-zinc-400">e.g. -10 = 10% below</p>
            </div>
            <div className="flex-1">
              <label htmlFor="ctx-rangeHigh" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                High (%)
              </label>
              <input
                id="ctx-rangeHigh"
                type="number"
                step="1"
                value={priceRangeHighPct}
                onChange={(e) => setPriceRangeHighPct(e.target.value)}
                className={inputClass + " max-w-[120px]"}
              />
              <p className="mt-0.5 text-[11px] text-zinc-400">e.g. 10 = 10% above</p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="ctx-assumptions" className={labelClass}>Estimation Assumptions</label>
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
            Rules the AI follows when generating estimates. One assumption per line.
          </p>
          <textarea
            id="ctx-assumptions"
            value={estimationAssumptions}
            onChange={(e) => setEstimationAssumptions(e.target.value)}
            className={textareaClass + " min-h-[240px] font-mono text-xs"}
            rows={12}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={status === "saving"}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          {status === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400">Saved successfully.</span>
          )}
          {status === "error" && errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">{errorMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
}

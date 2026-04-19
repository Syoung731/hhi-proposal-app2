"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────

type LineItem = {
  id: string;
  tradeGroup: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  totalPriceLow?: number;
  totalPriceHigh?: number;
  source: string;
  confidence?: number | null;
  notes?: string | null;
  sortOrder: number;
};

type Estimate = {
  id: string;
  projectId: string;
  sectionId: string;
  roomTemplateId?: string | null;
  status: string;
  totalCost?: number | null;
  totalPrice?: number | null;
  lineItems: LineItem[];
  createdAt: string;
};

type RoomTemplate = {
  id: string;
  name: string;
  displayName?: string | null;
  active: boolean;
};

type TradeUpdateProposalShape = {
  summary: string;
  add: Array<{ name: string; quantity: number; unit: string; unitCost: number; unitPrice: number; catalogItemId?: string | null; reason: string }>;
  update: Array<{ id: string; quantity?: number; unit?: string; unitCost?: number; unitPrice?: number; name?: string; reason: string }>;
  delete: Array<{ id: string; reason: string }>;
};

// ─── Constants ─────────────────────────────────────────────────────

const TRADE_ORDER = [
  "Demo", "Framing", "Electrical", "Plumbing", "HVAC", "Insulation",
  "Drywall", "Paint", "Doors", "Windows", "Flooring", "Tile",
  "Trim", "Cabinets", "Appliances", "Countertops", "Hardware",
];

function tradeSort(a: string, b: string): number {
  const ai = TRADE_ORDER.findIndex((t) => a.toLowerCase().startsWith(t.toLowerCase()));
  const bi = TRADE_ORDER.findIndex((t) => b.toLowerCase().startsWith(t.toLowerCase()));
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

const INSTALL_RE = /[-–]\s*(install|installation|labor)\s*$/i;

/**
 * Sort items so Material items are immediately followed by their matching Install items.
 * Items without a pair appear after all paired items.
 */
function sortMaterialInstallPairs(items: LineItem[]): LineItem[] {
  const MATERIAL_RE = /[-–]\s*(material|materials)\s*$/i;

  function baseName(name: string): string {
    return name.replace(MATERIAL_RE, "").replace(INSTALL_RE, "").trim().toLowerCase();
  }

  const materialItems: LineItem[] = [];
  const installItems = new Map<string, LineItem>();
  const otherItems: LineItem[] = [];

  for (const item of items) {
    if (MATERIAL_RE.test(item.name)) {
      materialItems.push(item);
    } else if (INSTALL_RE.test(item.name)) {
      installItems.set(baseName(item.name), item);
    } else {
      otherItems.push(item);
    }
  }

  const result: LineItem[] = [];
  const usedInstallIds = new Set<string>();

  for (const mat of materialItems) {
    result.push(mat);
    const inst = installItems.get(baseName(mat.name));
    if (inst) {
      result.push(inst);
      usedInstallIds.add(inst.id);
    }
  }

  for (const [, inst] of installItems) {
    if (!usedInstallIds.has(inst.id)) {
      result.push(inst);
    }
  }

  result.push(...otherItems);
  return result;
}

const CURRENCY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function fmtMoney(n: number): string {
  return CURRENCY_FMT.format(n);
}

/** Convert hex color to rgba string for subtle tinting. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(244, 114, 22, ${alpha})`; // fallback to #F47216
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmtMoneyWhole(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Source Badge (compact) ────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const base = "inline-flex items-center rounded px-1 py-px text-[10px] font-semibold leading-none";
  switch (source) {
    case "CATALOG":
      return <span className={`${base} bg-green-50 text-green-700 border border-green-200`}>CAT</span>;
    case "ALLOWANCE":
      return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>ALW</span>;
    case "AI_PRICED":
      return <span className={`${base} border text-brand-accent`} style={{ backgroundColor: "var(--brand-accent-lighter)", borderColor: "var(--brand-accent-spinner-track)" }}>AI</span>;
    case "CALC":
      return <span className={`${base} bg-indigo-50 text-indigo-700 border border-indigo-200`}>CALC</span>;
    case "MANUAL":
      return <span className={`${base} bg-blue-50 text-blue-700 border border-blue-200`}>MAN</span>;
    default:
      return <span className={`${base} bg-zinc-50 text-zinc-500 border border-zinc-200`}>{source}</span>;
  }
}

// ─── Confidence Dot ────────────────────────────────────────────────

function ConfidenceDot({ confidence }: { confidence?: number | null }) {
  if (confidence == null || confidence >= 0.5) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
      title={`Low confidence: ${Math.round(confidence * 100)}%`}
    />
  );
}

// ─── Notes Tooltip ─────────────────────────────────────────────────

function NotesTooltip({ notes }: { notes?: string | null }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setShow(false), 200);
  };
  useEffect(() => () => cancelClose(), []);

  const btnRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node && show) {
        const rect = node.getBoundingClientRect();
        setPos({ x: rect.left, y: rect.bottom });
      }
    },
    [show]
  );
  if (!notes) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="shrink-0 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-500 hover:text-brand-accent transition-colors"
        onMouseEnter={() => { cancelClose(); setShow(true); }}
        onMouseLeave={scheduleClose}
        onClick={() => setShow((s) => !s)}
      >
        i
      </button>
      {show && pos && (
        <div
          className="rounded-md border border-zinc-200 bg-white text-[11px] leading-relaxed text-zinc-600 shadow-xl"
          style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, width: 320, maxHeight: 240, paddingTop: 6 }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="px-2.5 pt-1.5" style={{ maxHeight: 228, overflowY: "auto" }}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">AI Notes</div>
            <div className="pb-2.5">{notes}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Inline Editable Number ────────────────────────────────────────

function InlineNumber({
  value,
  onSave,
  prefix,
  className,
}: {
  value: number;
  onSave: (val: number) => void;
  prefix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = useCallback(() => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0) {
      onSave(parsed);
    }
    setEditing(false);
  }, [draft, onSave]);

  if (editing) {
    return (
      <input
        type="number"
        step="any"
        min="0"
        className={`w-16 rounded border border-zinc-300 px-1 py-px text-[11px] text-right ${className ?? ""}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`cursor-pointer rounded px-0.5 py-px text-[11px] hover:bg-zinc-100 ${className ?? ""}`}
      title="Click to edit"
    >
      {prefix}{typeof value === "number" ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
    </button>
  );
}

// ─── Add Item Form ─────────────────────────────────────────────────

type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
  unitPrice: number | null;
  trade: string | null;
  costType: string | null;
};

function AddItemForm({
  tradeGroup,
  onAdd,
  onCancel,
}: {
  tradeGroup: string;
  onAdd: (item: { tradeGroup: string; name: string; quantity: number; unit: string; unitCost: number; unitPrice: number; catalogItemId?: string | null }) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"catalog" | "manual">("catalog");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("EA");
  const [cost, setCost] = useState("0");
  const [price, setPrice] = useState("0");

  // Debounced catalog search
  useEffect(() => {
    if (mode !== "catalog") return;
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/settings/catalog/items?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) setResults((data.items ?? []).slice(0, 20));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, mode]);

  const selectCatalogItem = (item: CatalogItem) => {
    setSelected(item);
    setName(item.name);
    setUnit(item.unit || "EA");
    setCost(String(item.unitCost ?? 0));
    setPrice(String(item.unitPrice ?? 0));
    setResults([]);
    setSearch(item.name);
  };

  const handleSubmit = () => {
    const itemName = (mode === "catalog" ? (selected?.name ?? name) : name).trim();
    if (!itemName) return;
    onAdd({
      tradeGroup,
      name: itemName,
      quantity: parseFloat(qty) || 1,
      unit,
      unitCost: parseFloat(cost) || 0,
      unitPrice: parseFloat(price) || 0,
      catalogItemId: mode === "catalog" ? selected?.id ?? null : null,
    });
  };

  const switchMode = (next: "catalog" | "manual") => {
    setMode(next);
    setSelected(null);
    if (next === "manual") {
      setResults([]);
    }
  };

  return (
    <div className="py-2 pl-6 pr-2 bg-zinc-50 border-t border-zinc-100 space-y-1">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => switchMode("catalog")}
          className={`rounded px-2 py-0.5 ${mode === "catalog" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
        >
          Search catalog
        </button>
        <button
          type="button"
          onClick={() => switchMode("manual")}
          className={`rounded px-2 py-0.5 ${mode === "manual" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
        >
          Manual entry
        </button>
        <span className="ml-auto text-zinc-400">{mode === "catalog" && selected ? "Catalog item selected" : ""}</span>
      </div>

      {mode === "catalog" && (
        <div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search catalog by name (min 2 chars)…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-xs"
              autoFocus
            />
            {loading && <span className="absolute right-2 top-1.5 text-[10px] text-zinc-400">searching…</span>}
          </div>
          {results.length > 0 && !selected && (
            <div className="mt-0.5 w-full max-h-56 overflow-y-auto rounded border border-zinc-300 bg-white shadow-sm">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectCatalogItem(item)}
                  className="flex w-full items-center gap-2 border-b border-zinc-100 px-2 py-1 text-left text-xs hover:bg-orange-50 last:border-b-0"
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-[10px] text-zinc-500">{item.trade ?? "—"}</span>
                  <span className="w-8 text-right text-[10px] text-zinc-500">{item.unit}</span>
                  <span className="w-16 text-right tabular-nums">
                    ${(item.unitPrice ?? 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quantity / unit / cost / price — editable in both modes (catalog selection pre-fills) */}
      <div className="flex items-center gap-2">
        {mode === "manual" && (
          <input
            type="text"
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 rounded border border-zinc-300 px-2 py-0.5 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
          />
        )}
        {mode === "catalog" && <div className="flex-1" />}
        <input
          type="number"
          placeholder="Qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-xs text-right"
          title="Quantity"
        />
        <input
          type="text"
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-10 rounded border border-zinc-300 px-1 py-0.5 text-xs"
          title="Unit"
        />
        <input
          type="number"
          placeholder="Cost"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-xs text-right"
          title="Unit Cost"
        />
        <input
          type="number"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-xs text-right"
          title="Unit Price"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={mode === "catalog" && !selected && !name.trim()}
          className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          Add
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Trade Group Section ───────────────────────────────────────────

const GRID_COLS = "36px 1fr 50px 32px 70px 70px 80px 20px";

function TradeGroupSection({
  tradeGroup,
  items,
  collapsed,
  onToggleCollapsed,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  accentColor,
  estimateId,
  onReplaceEstimate,
}: {
  tradeGroup: string;
  items: LineItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onUpdateItem: (itemId: string, field: "quantity" | "unitCost" | "unitPrice", value: number) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (item: { tradeGroup: string; name: string; quantity: number; unit: string; unitCost: number; unitPrice: number; catalogItemId?: string | null }) => void;
  accentColor: string;
  estimateId: string | null;
  onReplaceEstimate: (estimate: Estimate) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<TradeUpdateProposalShape | null>(null);
  const [applying, setApplying] = useState(false);

  const sortedItems = useMemo(() => sortMaterialInstallPairs(items), [items]);
  const groupTotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const groupRangeLow = items.reduce((sum, i) => sum + (i.totalPriceLow ?? i.totalPrice), 0);
  const groupRangeHigh = items.reduce((sum, i) => sum + (i.totalPriceHigh ?? i.totalPrice), 0);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const runAiUpdate = async () => {
    if (!estimateId || !aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiProposal(null);
    try {
      const res = await fetch(`/api/ai-estimate/${estimateId}/update-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeGroup, instruction: aiInstruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI update failed");
      setAiProposal(data.proposal as TradeUpdateProposalShape);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI update failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyProposal = async () => {
    if (!estimateId || !aiProposal) return;
    setApplying(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/ai-estimate/${estimateId}/apply-trade-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeGroup, proposal: aiProposal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      onReplaceEstimate(data.estimate as Estimate);
      setAiProposal(null);
      setAiInstruction("");
      setShowAiPanel(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const cancelProposal = () => {
    setAiProposal(null);
    setAiError(null);
  };

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      {/* Trade group header — darker accent tint */}
      <div
        className="flex w-full items-center gap-2 px-3 py-2 text-xs border-b border-zinc-200"
        style={{ backgroundColor: hexToRgba(accentColor, 0.15) }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 flex-1 hover:brightness-95 text-left"
        >
          <span className="text-zinc-500 text-[10px] w-3 shrink-0">
            {collapsed ? "▶" : "▼"}
          </span>
          <span className="font-bold text-zinc-900 text-xs">
            {tradeGroup}
          </span>
          <span className="text-[10px] text-zinc-500">
            ({items.length})
          </span>
        </button>
        {estimateId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAiPanel((v) => !v); }}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${showAiPanel ? "bg-orange-500 text-white" : "bg-white border border-orange-300 text-orange-600 hover:bg-orange-50"}`}
            title="Update this trade group with AI"
          >
            ✨ AI
          </button>
        )}
        <span className="font-bold text-zinc-900 tabular-nums text-xs"
          title={groupRangeLow !== groupRangeHigh ? `Range: ${fmtMoney(groupRangeLow)} – ${fmtMoney(groupRangeHigh)}` : undefined}
        >
          {fmtMoney(groupTotal)}
        </span>
      </div>

      {/* AI Update Panel */}
      {showAiPanel && (
        <div className="px-3 py-2 bg-orange-50/50 border-b border-orange-200 space-y-2">
          {!aiProposal && (
            <>
              <textarea
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder={`E.g., "Add Range Hood and Microwave to the install items"`}
                className="w-full rounded border border-orange-300 px-2 py-1 text-xs bg-white resize-y min-h-[48px]"
                disabled={aiLoading}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runAiUpdate}
                  disabled={!aiInstruction.trim() || aiLoading}
                  className="rounded bg-orange-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-orange-600 disabled:opacity-40"
                >
                  {aiLoading ? "Generating…" : "Submit"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAiPanel(false); setAiInstruction(""); setAiError(null); }}
                  className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                {aiError && <span className="text-[11px] text-red-600">{aiError}</span>}
              </div>
            </>
          )}

          {/* Preview of diff */}
          {aiProposal && (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-700"><span className="font-semibold">Proposed changes:</span> {aiProposal.summary}</div>
              {aiProposal.add?.length > 0 && (
                <div className="rounded border border-green-300 bg-green-50 px-2 py-1">
                  <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Add ({aiProposal.add.length})</div>
                  {aiProposal.add.map((op, idx) => {
                    const isZero = (op.unitPrice ?? 0) === 0 && (op.quantity ?? 0) > 0;
                    return (
                      <div key={`add-${idx}`} className={`mt-0.5 text-[11px] ${isZero ? "text-red-700" : "text-zinc-700"}`}>
                        + <span className="font-medium">{op.name}</span> — {op.quantity} {op.unit} @ ${op.unitPrice.toFixed(2)} = ${(op.quantity * op.unitPrice).toFixed(2)}
                        {isZero && <span className="ml-2 inline-block rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">⚠ $0 PRICE — cannot apply</span>}
                        <div className="pl-3 text-[10px] text-zinc-500">{op.reason}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {aiProposal.update?.length > 0 && (
                <div className="rounded border border-blue-300 bg-blue-50 px-2 py-1">
                  <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">Update ({aiProposal.update.length})</div>
                  {aiProposal.update.map((op, idx) => {
                    const existing = itemsById.get(op.id);
                    return (
                      <div key={`upd-${idx}`} className="mt-0.5 text-[11px] text-zinc-700">
                        ~ <span className="font-medium">{existing?.name ?? op.id}</span>
                        {op.quantity != null && existing && ` | qty ${existing.quantity} → ${op.quantity}`}
                        {op.unitCost != null && existing && ` | cost $${existing.unitCost} → $${op.unitCost}`}
                        {op.unitPrice != null && existing && ` | price $${existing.unitPrice} → $${op.unitPrice}`}
                        <div className="pl-3 text-[10px] text-zinc-500">{op.reason}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {aiProposal.delete?.length > 0 && (
                <div className="rounded border border-red-300 bg-red-50 px-2 py-1">
                  <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Remove ({aiProposal.delete.length})</div>
                  {aiProposal.delete.map((op, idx) => {
                    const existing = itemsById.get(op.id);
                    return (
                      <div key={`del-${idx}`} className="mt-0.5 text-[11px] text-zinc-700">
                        − <span className="font-medium line-through">{existing?.name ?? op.id}</span>
                        <div className="pl-3 text-[10px] text-zinc-500">{op.reason}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {aiProposal.add?.length === 0 && aiProposal.update?.length === 0 && aiProposal.delete?.length === 0 && (
                <div className="text-[11px] text-zinc-500 italic">No changes proposed.</div>
              )}
              {(() => {
                const hasZeroAdds = aiProposal.add.some((op) => (op.unitPrice ?? 0) === 0 && (op.quantity ?? 0) > 0);
                const isEmpty = aiProposal.add.length === 0 && aiProposal.update.length === 0 && aiProposal.delete.length === 0;
                return (
                  <div className="space-y-1 pt-1">
                    {hasZeroAdds && (
                      <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                        One or more items have $0 price. Reject and try rewording your instruction (e.g., ask for specific pricing).
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={applyProposal}
                        disabled={applying || isEmpty || hasZeroAdds}
                        className="rounded bg-orange-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-orange-600 disabled:opacity-40"
                      >
                        {applying ? "Applying…" : "Apply changes"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelProposal}
                        className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                      >
                        Reject / Try again
                      </button>
                      {aiError && <span className="text-[11px] text-red-600">{aiError}</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
      {!collapsed && (
        <div className="pb-0.5">
          {/* Column headers — once per trade group */}
          <div
            className="items-center px-3 py-1 border-b border-zinc-200 text-[10px] font-medium text-zinc-500 uppercase tracking-wider select-none"
            style={{ display: "grid", gridTemplateColumns: GRID_COLS, columnGap: "4px", backgroundColor: hexToRgba(accentColor, 0.06) }}
          >
            <span>Src</span>
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit $</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {/* Line items — one row each */}
          {sortedItems.map((item) => {
            const isInstall = INSTALL_RE.test(item.name);
            return (
              <div
                key={item.id}
                className="group items-center px-3 border-b border-zinc-100 hover:bg-zinc-50"
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  columnGap: "4px",
                  minHeight: "30px",
                  backgroundColor: "white",
                }}
              >
                <div className="flex items-center gap-0.5 overflow-hidden min-w-0">
                  <SourceBadge source={item.source} />
                  <ConfidenceDot confidence={item.confidence} />
                </div>
                <div className={`flex items-center gap-1 min-w-0 ${isInstall ? "pl-3" : ""}`}>
                  <span className="truncate text-[11px] text-zinc-700" title={item.name}>
                    {item.name}
                  </span>
                  {item.notes && <NotesTooltip notes={item.notes} />}
                </div>
                <InlineNumber
                  value={item.quantity}
                  onSave={(v) => onUpdateItem(item.id, "quantity", v)}
                  className="text-right tabular-nums"
                />
                <span className="text-[10px] text-zinc-400 truncate">{item.unit}</span>
                <InlineNumber
                  value={item.unitPrice}
                  onSave={(v) => onUpdateItem(item.id, "unitPrice", v)}
                  prefix="$"
                  className="text-right tabular-nums"
                />
                <span className="text-right tabular-nums text-[11px] text-zinc-400 truncate">
                  {fmtMoney(item.unitCost)}
                </span>
                <span
                  className="text-right tabular-nums text-[11px] font-semibold text-zinc-800 truncate"
                  title={item.totalPriceLow && item.totalPriceHigh && item.totalPriceLow !== item.totalPriceHigh
                    ? `Range: ${fmtMoney(item.totalPriceLow)} – ${fmtMoney(item.totalPriceHigh)}`
                    : undefined}
                >
                  {fmtMoney(item.totalPrice)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Remove this item from the estimate?")) {
                      onDeleteItem(item.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-xs leading-none"
                  title="Delete item"
                >
                  ✕
                </button>
              </div>
            );
          })}
          {showAddForm ? (
            <AddItemForm
              tradeGroup={tradeGroup}
              onAdd={(item) => { onAddItem(item); setShowAddForm(false); }}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="ml-3 mt-0.5 mb-0.5 text-[10px] text-zinc-400 hover:text-zinc-600"
            >
              + Add item
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────

export function AIEstimatePanel({
  projectId,
  roomId,
  roomName,
  scopeNarrative,
  squareFootage,
  selectedTemplateId,
  templates,
  refreshKey,
  estimateStaleReason,
  onTemplateChange,
  onReviewScope,
  hasScopeQA,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
  scopeNarrative: string;
  squareFootage: number | null;
  selectedTemplateId: string | null;
  templates: RoomTemplate[];
  refreshKey?: number;
  estimateStaleReason?: string | null;
  /** Callback when template selection changes */
  onTemplateChange?: (templateId: string | null) => void;
  /** Callback to open scope review modal */
  onReviewScope?: () => void;
  /** Whether this room already has scope QA answers */
  hasScopeQA?: boolean;
}) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Track which trade groups are collapsed (default: all collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Price range settings + accent color from CompanyContext
  const [rangeSettings, setRangeSettings] = useState<{ lowPct: number; highPct: number }>({ lowPct: -10, highPct: 10 });
  const [accentColor, setAccentColor] = useState("#F47216");

  // Fetch settings once
  useEffect(() => {
    fetch("/api/settings/context")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setRangeSettings({
            lowPct: data.priceRangeLowPct ?? -10,
            highPct: data.priceRangeHighPct ?? 10,
          });
          if (data.accentColor) setAccentColor(data.accentColor);
        }
      })
      .catch(() => {});
  }, []);

  const fetchEstimate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-estimate?projectId=${projectId}&sectionId=${roomId}`);
      const data = await res.json();
      if (data.estimate) {
        setEstimate(data.estimate);
        setExpanded(true);
      } else {
        setEstimate(null);
      }
    } catch {
      // silently fail — no estimate yet
    } finally {
      setLoading(false);
    }
  }, [projectId, roomId, refreshKey]);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  const handleRegenerate = useCallback(async () => {
    if (!estimate) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai-estimate/${estimate.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeNarrative,
          squareFootage: squareFootage ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setEstimate(data.estimate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate estimate");
    } finally {
      setGenerating(false);
    }
  }, [estimate, scopeNarrative, squareFootage]);

  const handleUpdateItem = useCallback(
    async (itemId: string, field: "quantity" | "unitCost" | "unitPrice", value: number) => {
      if (!estimate) return;
      try {
        const res = await fetch(`/api/ai-estimate/${estimate.id}/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error("Failed to update item");
        const data = await res.json();

        setEstimate((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalCost: data.totalCost,
            totalPrice: data.totalPrice,
            lineItems: prev.lineItems.map((li) =>
              li.id === itemId ? { ...li, ...data.item } : li
            ),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      }
    },
    [estimate]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!estimate) return;
      try {
        const res = await fetch(`/api/ai-estimate/${estimate.id}/items/${itemId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete item");
        const data = await res.json();

        setEstimate((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalCost: data.totalCost,
            totalPrice: data.totalPrice,
            lineItems: prev.lineItems.filter((li) => li.id !== itemId),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [estimate]
  );

  const handleAddItem = useCallback(
    async (item: { tradeGroup: string; name: string; quantity: number; unit: string; unitCost: number; unitPrice: number; catalogItemId?: string | null }) => {
      if (!estimate) return;
      try {
        const res = await fetch(`/api/ai-estimate/${estimate.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok) throw new Error("Failed to add item");
        const data = await res.json();

        setEstimate((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalCost: data.totalCost,
            totalPrice: data.totalPrice,
            lineItems: [...prev.lineItems, data.item],
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item");
      }
    },
    [estimate]
  );

  // Group items by trade
  const tradeGroups = useMemo(() => {
    if (!estimate) return [];
    const groups = new Map<string, LineItem[]>();
    for (const item of estimate.lineItems) {
      const list = groups.get(item.tradeGroup) ?? [];
      list.push(item);
      groups.set(item.tradeGroup, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => tradeSort(a, b));
  }, [estimate]);

  // Source counts
  const sourceCounts = useMemo(() => {
    if (!estimate) return { total: 0, catalog: 0, allowance: 0, ai: 0, manual: 0, calc: 0 };
    const items = estimate.lineItems;
    return {
      total: items.length,
      catalog: items.filter((i) => i.source === "CATALOG").length,
      allowance: items.filter((i) => i.source === "ALLOWANCE").length,
      ai: items.filter((i) => i.source === "AI_PRICED").length,
      manual: items.filter((i) => i.source === "MANUAL").length,
      calc: items.filter((i) => i.source === "CALC").length,
    };
  }, [estimate]);

  // Range totals — use stored per-item ranges, or fall back to settings %
  const rangeTotals = useMemo(() => {
    if (!estimate) return { low: 0, high: 0 };
    let low = estimate.lineItems.reduce((sum, i) => sum + (i.totalPriceLow ?? 0), 0);
    let high = estimate.lineItems.reduce((sum, i) => sum + (i.totalPriceHigh ?? 0), 0);
    const total = estimate.totalPrice ?? 0;
    // If stored ranges are zero/equal (legacy data), compute from settings
    if ((low <= 0 || high <= 0 || low === high) && total > 0) {
      low = Math.round(total * (1 + rangeSettings.lowPct / 100));
      high = Math.round(total * (1 + rangeSettings.highPct / 100));
    }
    return { low, high };
  }, [estimate, rangeSettings]);

  if (loading) return null;

  // No estimate yet — show placeholder
  if (!estimate) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-2">
        <p className="text-xs text-zinc-400">No AI estimate yet — use <strong>Generate AI Estimates</strong> in the toolbar above.</p>
      </div>
    );
  }

  // Estimate exists — show panel
  const hasRange = rangeTotals.low > 0 && rangeTotals.high > 0 && rangeTotals.low !== rangeTotals.high;

  // Source count string
  const sourceCountParts: string[] = [];
  if (sourceCounts.catalog > 0) sourceCountParts.push(`${sourceCounts.catalog} catalog`);
  if (sourceCounts.allowance > 0) sourceCountParts.push(`${sourceCounts.allowance} allowance`);
  if (sourceCounts.calc > 0) sourceCountParts.push(`${sourceCounts.calc} calc`);
  if (sourceCounts.ai > 0) sourceCountParts.push(`${sourceCounts.ai} AI`);
  if (sourceCounts.manual > 0) sourceCountParts.push(`${sourceCounts.manual} manual`);

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-white overflow-hidden">
      {/* Panel Header */}
      <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200">
        {/* Top row: template + review/regenerate button */}
        <div className="flex items-center gap-2 mb-1.5">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-zinc-400 hover:text-zinc-700 text-[10px] shrink-0"
          >
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
          {onTemplateChange && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-zinc-400">Template:</span>
              <select
                value={selectedTemplateId ?? ""}
                onChange={(e) => onTemplateChange(e.target.value || null)}
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <option value="">Select...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName || t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1" />
          {onReviewScope && (
            <button
              type="button"
              onClick={onReviewScope}
              disabled={generating}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                hasScopeQA
                  ? "border text-brand-accent"
                  : "text-white"
              } disabled:opacity-50`}
              style={hasScopeQA
                ? { borderColor: "var(--brand-accent-spinner-track)", backgroundColor: "var(--brand-accent-lighter)" }
                : { backgroundColor: "var(--brand-accent)" }
              }
            >
              {generating ? "Generating..." : hasScopeQA ? "Review Questions" : "Review & Estimate"}
            </button>
          )}
          {!onReviewScope && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={generating}
              className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
              title="Regenerate estimate"
            >
              {generating ? "..." : "\u21BB"}
            </button>
          )}
        </div>
        {/* Price summary */}
        <div className="flex items-start gap-3 pl-4">
          <div className="flex-1 min-w-0">
            {/* Line 1: Range (prominent) */}
            <div className="text-base font-bold text-zinc-900 tabular-nums leading-tight">
              {hasRange
                ? `${fmtMoneyWhole(rangeTotals.low)} \u2013 ${fmtMoneyWhole(rangeTotals.high)}`
                : fmtMoneyWhole(estimate.totalPrice ?? 0)
              }
            </div>
            {/* Line 2: Target + items + time */}
            <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
              {hasRange && <>Target: {fmtMoneyWhole(estimate.totalPrice ?? 0)} &middot; </>}
              {sourceCounts.total} items &middot; {timeAgo(estimate.createdAt)}
              {estimateStaleReason && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-700 font-medium">
                  &mdash; Stale
                </span>
              )}
            </div>
            {/* Line 3: Source breakdown */}
            <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
              {sourceCountParts.join(", ")}
            </div>
          </div>
        </div>
      </div>

      {/* Panel Body — trade groups */}
      {expanded && (
        <div>
          {/* Expand All / Collapse All bar */}
          <div className="flex items-center gap-2 px-3 py-1 border-b border-zinc-100" style={{ backgroundColor: hexToRgba(accentColor, 0.04) }}>
            <button
              type="button"
              onClick={() => {
                const allExpanded: Record<string, boolean> = {};
                for (const [trade] of tradeGroups) allExpanded[trade] = false;
                setCollapsedGroups(allExpanded);
              }}
              className="text-[10px] font-medium text-brand-accent hover:opacity-80"
            >
              Expand All
            </button>
            <span className="text-zinc-300">|</span>
            <button
              type="button"
              onClick={() => {
                const allCollapsed: Record<string, boolean> = {};
                for (const [trade] of tradeGroups) allCollapsed[trade] = true;
                setCollapsedGroups(allCollapsed);
              }}
              className="text-[10px] font-medium text-brand-accent hover:opacity-80"
            >
              Collapse All
            </button>
          </div>
          {tradeGroups.map(([trade, items]) => (
            <TradeGroupSection
              key={trade}
              tradeGroup={trade}
              items={items}
              collapsed={collapsedGroups[trade] ?? true}
              onToggleCollapsed={() => setCollapsedGroups((prev) => ({ ...prev, [trade]: !(prev[trade] ?? true) }))}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              accentColor={accentColor}
              estimateId={estimate?.id ?? null}
              onReplaceEstimate={(e) => setEstimate(e)}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Estimate Price Badge (for room card — three-tier) ─────────────

export type EstimateData = {
  totalPrice: number;
  totalPriceLow?: number;
  totalPriceHigh?: number;
  status: string;
} | null;

export function EstimatePriceBadge({
  projectId,
  roomId,
}: {
  projectId: string;
  roomId: string;
}) {
  const [estimate, setEstimate] = useState<EstimateData>(null);

  useEffect(() => {
    // Fetch both the estimate and current price range settings in parallel
    Promise.all([
      fetch(`/api/ai-estimate?projectId=${projectId}&sectionId=${roomId}`).then((r) => r.json()),
      fetch("/api/settings/context").then((r) => r.json()).catch(() => null),
    ])
      .then(([estData, ctxData]) => {
        if (!estData.estimate) return;
        const est = estData.estimate;
        const lineItems: LineItem[] = est.lineItems ?? [];

        // Sum stored per-item ranges
        let low = lineItems.reduce((sum: number, i: LineItem) => sum + (i.totalPriceLow ?? 0), 0);
        let high = lineItems.reduce((sum: number, i: LineItem) => sum + (i.totalPriceHigh ?? 0), 0);

        // If stored ranges are zero (legacy estimate), compute from settings
        if ((low <= 0 || high <= 0 || low === high) && est.totalPrice > 0) {
          const lowPct = ctxData?.priceRangeLowPct ?? -10;
          const highPct = ctxData?.priceRangeHighPct ?? 10;
          low = Math.round(est.totalPrice * (1 + lowPct / 100));
          high = Math.round(est.totalPrice * (1 + highPct / 100));
        }

        setEstimate({
          totalPrice: est.totalPrice,
          totalPriceLow: low,
          totalPriceHigh: high,
          status: est.status,
        });
      })
      .catch(() => {});
  }, [projectId, roomId]);

  if (!estimate) return null;

  const hasRange = estimate.totalPriceLow != null && estimate.totalPriceHigh != null
    && estimate.totalPriceLow > 0 && estimate.totalPriceHigh > 0
    && estimate.totalPriceLow !== estimate.totalPriceHigh;

  if (estimate.status === "accepted") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
        AI: {hasRange
          ? `${fmtMoneyWhole(estimate.totalPriceLow!)} – ${fmtMoneyWhole(estimate.totalPriceHigh!)}`
          : fmtMoneyWhole(estimate.totalPrice)
        }
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
      AI Draft: {hasRange
        ? `${fmtMoneyWhole(estimate.totalPriceLow!)} – ${fmtMoneyWhole(estimate.totalPriceHigh!)}`
        : fmtMoneyWhole(estimate.totalPrice)
      }
    </span>
  );
}

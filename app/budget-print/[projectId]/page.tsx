/**
 * Print-only HTML view of a project's AI budget.
 *
 * Driven by `app/api/projects/[id]/budget-export/pdf/route.ts` — that
 * route mints a short-lived pdfToken, drives headless Chromium to this
 * URL with `?print=1&pdfToken=...`, and waits for
 * `[data-print-ready="true"]` before calling `page.pdf()`.
 *
 * # Why this lives at /budget-print/ instead of /admin/.../budget-print
 * Pages under /admin/ inherit AdminLayoutChrome, which renders Clerk's
 * <UserButton> and other auth-aware components. The headless Chromium
 * browser the PDF route uses has no Clerk session, so those components
 * throw UnauthorizedError during SSR and the page renders an error
 * boundary — never flips data-print-ready. Hoisting this route to the
 * top level skips the admin chrome entirely; it only inherits the root
 * layout (ClerkProvider + fonts), which is passive.
 *
 * Layout: landscape Letter. Each room renders as a section with
 * trade-grouped tables; group + room subtotals shown inline. COPE room
 * appears last with a tinted header so the human flipping pages sees
 * which section is project overhead.
 *
 * Auth: Clerk-gated by proxy.ts. The PDF route's pdfToken bypass
 * (which checks the projectId field of the token against the URL
 * projectId) lets the headless browser through.
 */

import { notFound } from "next/navigation";
import {
  assembleProjectBudget,
  BudgetExportProjectNotFoundError,
  type BudgetExport,
  type BudgetExportRoom,
} from "@/app/lib/budget-export/assemble";
import { PrintReadySignal } from "./print-ready";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function BudgetPrintPage({ params }: PageProps) {
  const { projectId } = await params;

  let exp: BudgetExport;
  try {
    exp = await assembleProjectBudget(projectId);
  } catch (err) {
    if (err instanceof BudgetExportProjectNotFoundError) {
      notFound();
    }
    throw err;
  }

  return (
    <>
      <style
        // Inline so it survives independent of the global stylesheet pipeline.
        // Landscape Letter (11" × 8.5") with 0.4" margins — fits 12 columns
        // at 8pt comfortably. `print-color-adjust: exact` preserves the
        // navy/orange brand fills in the rasterized PDF.
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: letter landscape; margin: 0.4in; }
            html, body { margin: 0; padding: 0; background: white; color: #1A2332; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 9pt; line-height: 1.35; }
            .page-break-before { break-before: page; }
            h1, h2, h3 { margin: 0; color: #1A2332; }
            h1 { font-size: 18pt; }
            h2 { font-size: 13pt; }
            h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.04em; }
            .accent-rule { height: 2px; width: 60px; background: #F47216; margin: 4px 0 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 8pt; }
            th { background: #1A2332; color: white; text-align: left; padding: 4px 6px; font-weight: 600; font-size: 8pt; }
            td { padding: 3px 6px; border-bottom: 1px solid #E4E4E7; vertical-align: top; }
            tr.group-header td { background: #F4F4F5; font-weight: 600; padding: 5px 6px; border-bottom: 1px solid #D4D4D8; }
            tr.subtotal td { background: #FAFAFA; font-weight: 600; border-top: 1px solid #E4E4E7; }
            tr.room-total td { font-weight: 700; border-top: 2px solid #1A2332; padding-top: 6px; background: white; }
            .right { text-align: right; }
            .muted { color: #6B7280; font-size: 8pt; }
            .meta { color: #6B7280; font-size: 8pt; margin-top: 2px; }
            .cope-badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 1px 8px; border-radius: 3px; font-size: 7pt; font-weight: 600; letter-spacing: 0.05em; vertical-align: middle; margin-left: 8px; }
            .room { break-inside: avoid-page; }
            .room + .room { margin-top: 18px; }
          `,
        }}
      />
      <main>
        {/* Title page */}
        <section>
          <h1>{exp.project.title}</h1>
          <div className="accent-rule" />
          <div className="muted">Project Budget</div>
          <div className="meta">
            {exp.project.clientName ? <>Client: {exp.project.clientName} · </> : null}
            {[exp.project.addressLine1, exp.project.city, exp.project.state, exp.project.zip]
              .filter(Boolean)
              .join(", ") || null}
          </div>
          <div className="meta">
            Exported {formatDate(exp.exportedAt)} · Range bands {fmtPct(exp.rangeLowPct)} / {fmtPct(exp.rangeHighPct)}
          </div>

          <h2 style={{ marginTop: "18pt" }}>Summary</h2>
          <div className="accent-rule" />
          <table>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Room</th>
                <th className="right" style={{ width: "10%" }}>Items</th>
                <th className="right" style={{ width: "15%" }}>Low</th>
                <th className="right" style={{ width: "15%" }}>Target</th>
                <th className="right" style={{ width: "15%" }}>High</th>
                <th style={{ width: "5%" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {exp.rooms.map((room) => (
                <tr key={room.id}>
                  <td>
                    {room.name}
                    {room.isProjectOverhead ? <span className="cope-badge">COPE</span> : null}
                  </td>
                  <td className="right">{room.totals.itemCount}</td>
                  <td className="right">{fmtMoney(room.totals.low)}</td>
                  <td className="right">{fmtMoney(room.totals.target)}</td>
                  <td className="right">{fmtMoney(room.totals.high)}</td>
                  <td className="muted">{room.estimateStatus}</td>
                </tr>
              ))}
              <tr className="room-total">
                <td>TOTAL</td>
                <td className="right">{exp.totals.itemCount}</td>
                <td className="right">{fmtMoney(exp.totals.low)}</td>
                <td className="right">{fmtMoney(exp.totals.target)}</td>
                <td className="right">{fmtMoney(exp.totals.high)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          {exp.skippedRoomNames.length > 0 && (
            <p className="muted" style={{ marginTop: "8pt", fontStyle: "italic" }}>
              Excluded (no AI estimate yet): {exp.skippedRoomNames.join(", ")}
            </p>
          )}
        </section>

        {/* Per-room detail pages */}
        {exp.rooms.map((room) => (
          <RoomSection key={room.id} room={room} />
        ))}
      </main>
      <PrintReadySignal />
    </>
  );
}

function RoomSection({ room }: { room: BudgetExportRoom }) {
  return (
    <section className="room page-break-before">
      <h2>
        {room.name}
        {room.isProjectOverhead ? <span className="cope-badge">COPE</span> : null}
      </h2>
      <div className="accent-rule" />
      <div className="meta">
        Estimate {room.estimateStatus} · created {formatDate(room.estimateCreatedAt)} ·{" "}
        {room.totals.itemCount} items · target {fmtMoney(room.totals.target)} · range{" "}
        {fmtMoney(room.totals.low)}–{fmtMoney(room.totals.high)}
      </div>

      <table style={{ marginTop: "8pt" }}>
        <thead>
          <tr>
            <th style={{ width: "32%" }}>Item</th>
            <th className="right" style={{ width: "6%" }}>Qty</th>
            <th style={{ width: "6%" }}>Unit</th>
            <th className="right" style={{ width: "10%" }}>Unit Price</th>
            <th className="right" style={{ width: "12%" }}>Total</th>
            <th className="right" style={{ width: "18%" }}>Range</th>
            <th style={{ width: "8%" }}>Source</th>
            <th style={{ width: "8%" }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {room.tradeGroups.map((g) => (
            <RoomTradeGroup key={g.tradeGroup} group={g} />
          ))}
          <tr className="room-total">
            <td>Room Total</td>
            <td colSpan={3} />
            <td className="right">{fmtMoney(room.totals.target)}</td>
            <td className="right">
              {fmtMoney(room.totals.low)}–{fmtMoney(room.totals.high)}
            </td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function RoomTradeGroup({ group }: { group: BudgetExportRoom["tradeGroups"][number] }) {
  return (
    <>
      <tr className="group-header">
        <td colSpan={8}>{group.tradeGroup}</td>
      </tr>
      {group.items.map((item) => (
        <tr key={item.id}>
          <td>
            {item.name}
            {item.description ? <div className="muted">{item.description}</div> : null}
          </td>
          <td className="right">{fmtQty(item.quantity)}</td>
          <td>{item.unit}</td>
          <td className="right">{fmtMoney(item.unitPrice)}</td>
          <td className="right">{fmtMoney(item.totalPrice)}</td>
          <td className="right">
            {fmtMoney(item.totalPriceLow)}–{fmtMoney(item.totalPriceHigh)}
          </td>
          <td className="muted">{item.source}</td>
          <td className="muted">{item.notes ?? ""}</td>
        </tr>
      ))}
      <tr className="subtotal">
        <td>Subtotal — {group.tradeGroup}</td>
        <td colSpan={3} />
        <td className="right">{fmtMoney(group.totals.target)}</td>
        <td className="right">
          {fmtMoney(group.totals.low)}–{fmtMoney(group.totals.high)}
        </td>
        <td colSpan={2} />
      </tr>
    </>
  );
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const MONEY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
function fmtMoney(n: number): string {
  return MONEY_FMT.format(Math.round(n));
}
function fmtQty(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

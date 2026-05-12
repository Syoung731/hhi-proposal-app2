/**
 * GET /api/projects/{id}/budget-export.xlsx
 *
 * Exports a project's AI-budgeted line items as an Excel workbook:
 *   - Summary sheet: project header + per-room totals roll-up + grand total
 *   - One sheet per non-COPE room with trade-grouped line items
 *   - Last sheet: COPE (Project Overhead) — tab tinted to set it apart
 *
 * Auth: Clerk-gated by proxy.ts. No additional check here — the route is
 * not on the public allowlist, so production requests without a valid
 * session return 404 at the middleware layer.
 *
 * Performance: pure CPU work after the single DB round-trip in the
 * assembler. A 100-item / 5-room project builds in ~50ms locally; the
 * workbook itself is typically < 50 KB.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  assembleProjectBudget,
  BudgetExportProjectNotFoundError,
  type BudgetExport,
  type BudgetExportRoom,
  type BudgetExportTradeGroup,
  type BudgetExportLineItem,
} from "@/app/lib/budget-export/assemble";
import { buildXlsxFilename } from "@/app/lib/budget-export/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Brand styling constants ─────────────────────────────────────────────────

const BRAND_NAVY_ARGB = "FF1A2332";
const BRAND_ORANGE_ARGB = "FFF47216";
const ZINC_50_ARGB = "FFFAFAFA";
const ZINC_100_ARGB = "FFF4F4F5";
const ZINC_200_ARGB = "FFE4E4E7";
const COPE_TINT_ARGB = "FFFEF3C7"; // amber-100 — flags the COPE sheet tab

const CURRENCY_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00';
const CURRENCY_WHOLE_FMT = '"$"#,##0;[Red]-"$"#,##0';
const QTY_FMT = "#,##0.##";

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;

  let exp: BudgetExport;
  try {
    exp = await assembleProjectBudget(projectId);
  } catch (err) {
    if (err instanceof BudgetExportProjectNotFoundError) {
      return new NextResponse("Project not found", { status: 404 });
    }
    console.error("budget-export.xlsx assemble failure:", err);
    return NextResponse.json(
      { error: "Failed to assemble budget data" },
      { status: 500 },
    );
  }

  const workbook = buildWorkbook(exp);
  const buffer = await workbook.xlsx.writeBuffer();

  const filename = buildXlsxFilename(exp.project.title, exp.exportedAt);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ─── Workbook builder ────────────────────────────────────────────────────────

function buildWorkbook(exp: BudgetExport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HHI Builders Proposal App";
  wb.created = exp.exportedAt;
  wb.title = `Budget — ${exp.project.title}`;

  addSummarySheet(wb, exp);
  for (const room of exp.rooms) {
    addRoomSheet(wb, exp, room);
  }
  return wb;
}

// ─── Summary sheet ───────────────────────────────────────────────────────────

function addSummarySheet(wb: ExcelJS.Workbook, exp: BudgetExport): void {
  const ws = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { tabColor: { argb: BRAND_ORANGE_ARGB } },
  });

  ws.columns = [
    { width: 32 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
  ];

  // Title block
  const titleRow = ws.addRow([`Project Budget — ${exp.project.title}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 6);
  titleRow.getCell(1).style = {
    font: { name: "Calibri", size: 16, bold: true, color: { argb: BRAND_NAVY_ARGB } },
    alignment: { vertical: "middle" },
  };
  titleRow.height = 24;

  const metaLines: string[] = [];
  if (exp.project.clientName) metaLines.push(`Client: ${exp.project.clientName}`);
  const addrParts = [exp.project.addressLine1, exp.project.city, exp.project.state, exp.project.zip]
    .filter(Boolean)
    .join(", ");
  if (addrParts) metaLines.push(`Address: ${addrParts}`);
  metaLines.push(`Exported: ${formatDateTime(exp.exportedAt)}`);
  metaLines.push(
    `Range bands: ${exp.rangeLowPct > 0 ? "+" : ""}${exp.rangeLowPct}% / ${exp.rangeHighPct > 0 ? "+" : ""}${exp.rangeHighPct}%`,
  );
  for (const line of metaLines) {
    const r = ws.addRow([line]);
    ws.mergeCells(r.number, 1, r.number, 6);
    r.getCell(1).style = {
      font: { name: "Calibri", size: 10, color: { argb: "FF6B7280" } },
    };
  }
  ws.addRow([]); // spacer

  // Per-room rollup table
  const headerRow = ws.addRow([
    "Room",
    "Items",
    "Low",
    "Target",
    "High",
    "Status",
  ]);
  styleHeaderRow(headerRow);

  for (const room of exp.rooms) {
    const r = ws.addRow([
      room.isProjectOverhead ? `${room.name}  [COPE]` : room.name,
      room.totals.itemCount,
      room.totals.low,
      room.totals.target,
      room.totals.high,
      room.estimateStatus,
    ]);
    r.getCell(2).numFmt = QTY_FMT;
    r.getCell(3).numFmt = CURRENCY_WHOLE_FMT;
    r.getCell(4).numFmt = CURRENCY_WHOLE_FMT;
    r.getCell(5).numFmt = CURRENCY_WHOLE_FMT;
    if (room.isProjectOverhead) {
      r.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COPE_TINT_ARGB },
        };
      });
    }
  }

  // Grand total
  const totalRow = ws.addRow([
    "TOTAL",
    exp.totals.itemCount,
    exp.totals.low,
    exp.totals.target,
    exp.totals.high,
    "",
  ]);
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_NAVY_ARGB } };
    cell.border = { top: { style: "double", color: { argb: BRAND_NAVY_ARGB } } };
    if (colNumber === 2) cell.numFmt = QTY_FMT;
    if (colNumber >= 3 && colNumber <= 5) cell.numFmt = CURRENCY_WHOLE_FMT;
  });

  if (exp.skippedRoomNames.length > 0) {
    ws.addRow([]);
    const skipRow = ws.addRow([
      `Rooms without AI estimates (excluded): ${exp.skippedRoomNames.join(", ")}`,
    ]);
    ws.mergeCells(skipRow.number, 1, skipRow.number, 6);
    skipRow.getCell(1).style = {
      font: { name: "Calibri", size: 9, italic: true, color: { argb: "FF6B7280" } },
    };
  }
}

// ─── Room sheet ──────────────────────────────────────────────────────────────

function addRoomSheet(
  wb: ExcelJS.Workbook,
  exp: BudgetExport,
  room: BudgetExportRoom,
): void {
  const sheetName = sanitizeSheetName(
    room.isProjectOverhead ? `[COPE] ${room.name}` : room.name,
  );
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: room.isProjectOverhead
      ? { tabColor: { argb: COPE_TINT_ARGB } }
      : undefined,
  });

  // Columns: Item, Description, Qty, Unit, UnitCost, UnitPrice, TotalCost,
  //          TotalPrice, Low, High, Source, Notes
  ws.columns = [
    { width: 36 }, // 1 Item
    { width: 40 }, // 2 Description
    { width: 8 },  // 3 Qty
    { width: 8 },  // 4 Unit
    { width: 12 }, // 5 UnitCost
    { width: 12 }, // 6 UnitPrice
    { width: 14 }, // 7 TotalCost
    { width: 14 }, // 8 TotalPrice
    { width: 14 }, // 9 Low
    { width: 14 }, // 10 High
    { width: 12 }, // 11 Source
    { width: 30 }, // 12 Notes
  ];

  // Title block
  const titleRow = ws.addRow([`${exp.project.title} — ${room.name}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 12);
  titleRow.getCell(1).style = {
    font: { name: "Calibri", size: 14, bold: true, color: { argb: BRAND_NAVY_ARGB } },
  };
  titleRow.height = 20;

  const metaRow = ws.addRow([
    `Estimate ${room.estimateStatus} · created ${formatDateTime(room.estimateCreatedAt)} · ${room.totals.itemCount} items`,
  ]);
  ws.mergeCells(metaRow.number, 1, metaRow.number, 12);
  metaRow.getCell(1).style = {
    font: { name: "Calibri", size: 10, color: { argb: "FF6B7280" }, italic: true },
  };

  ws.addRow([]); // spacer (this is the frozen-pane boundary at row 4)

  const headerRow = ws.addRow([
    "Item",
    "Description",
    "Qty",
    "Unit",
    "Unit Cost",
    "Unit Price",
    "Total Cost",
    "Total Price",
    "Low",
    "High",
    "Source",
    "Notes",
  ]);
  styleHeaderRow(headerRow);

  for (const group of room.tradeGroups) {
    addTradeGroupRows(ws, group);
  }

  // Room total row
  const totalRow = ws.addRow([
    "ROOM TOTAL",
    "",
    "",
    "",
    "",
    "",
    room.totals.cost,
    room.totals.target,
    room.totals.low,
    room.totals.high,
    "",
    "",
  ]);
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_NAVY_ARGB } };
    cell.border = { top: { style: "double", color: { argb: BRAND_NAVY_ARGB } } };
    if (colNumber >= 7 && colNumber <= 10) cell.numFmt = CURRENCY_FMT;
  });
}

function addTradeGroupRows(
  ws: ExcelJS.Worksheet,
  group: BudgetExportTradeGroup,
): void {
  // Trade-group header
  const groupRow = ws.addRow([group.tradeGroup]);
  ws.mergeCells(groupRow.number, 1, groupRow.number, 12);
  groupRow.getCell(1).style = {
    font: { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_NAVY_ARGB } },
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ZINC_100_ARGB },
    },
    alignment: { vertical: "middle" },
  };
  groupRow.height = 18;

  for (const item of group.items) {
    addLineItemRow(ws, item);
  }

  // Trade-group subtotal
  const subtotalRow = ws.addRow([
    `Subtotal — ${group.tradeGroup}`,
    "",
    "",
    "",
    "",
    "",
    group.totals.cost,
    group.totals.target,
    group.totals.low,
    group.totals.high,
    "",
    "",
  ]);
  subtotalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_NAVY_ARGB } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ZINC_50_ARGB },
    };
    cell.border = { top: { style: "thin", color: { argb: ZINC_200_ARGB } } };
    if (colNumber >= 7 && colNumber <= 10) cell.numFmt = CURRENCY_FMT;
  });
  ws.addRow([]); // visual gap between trade groups
}

function addLineItemRow(ws: ExcelJS.Worksheet, item: BudgetExportLineItem): void {
  const row = ws.addRow([
    item.name,
    item.description ?? "",
    item.quantity,
    item.unit,
    item.unitCost,
    item.unitPrice,
    item.totalCost,
    item.totalPrice,
    item.totalPriceLow,
    item.totalPriceHigh,
    item.source,
    item.notes ?? "",
  ]);
  row.getCell(3).numFmt = QTY_FMT;
  row.getCell(5).numFmt = CURRENCY_FMT;
  row.getCell(6).numFmt = CURRENCY_FMT;
  row.getCell(7).numFmt = CURRENCY_FMT;
  row.getCell(8).numFmt = CURRENCY_FMT;
  row.getCell(9).numFmt = CURRENCY_FMT;
  row.getCell(10).numFmt = CURRENCY_FMT;
  row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  row.getCell(12).alignment = { wrapText: true, vertical: "top" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_NAVY_ARGB },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: BRAND_NAVY_ARGB } } };
  });
  row.height = 18;
}

/**
 * Excel sheet names: max 31 chars, no `: \ / ? * [ ]`. Cap and replace
 * forbidden characters with hyphens so room names like
 * "Kitchen / Dining" don't blow up the workbook write.
 */
function sanitizeSheetName(raw: string): string {
  const cleaned = raw.replace(/[:\\/?*\[\]]/g, "-").trim();
  if (cleaned.length <= 31) return cleaned || "Room";
  return cleaned.slice(0, 28) + "...";
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


import "server-only";
import ExcelJS from "exceljs";
import { UserFacingError } from "@/lib/errors";

// Reads the branch's monthly inventory workbook (one tab per month). Each tab:
// row with the dates, a header row "ITEMS | START IN OUT TRANSFER END | …"
// (five columns per day), then item rows grouped under section rows such as
// SAUCES or KITCHEN SUPPLIES. Everything from "SALES VS INVENTORY" down is ignored.

export type SheetDay = { start: number | null; in: number | null; out: number | null; transfer: number | null; end: number | null };
export type SheetItem = { name: string; section: string; days: SheetDay[] };
export type InventorySheet = { tab: string; dates: string[]; items: SheetItem[] };

const pad = (n: number) => String(n).padStart(2, "0");

function raw(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return raw(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

function num(v: ExcelJS.CellValue): number | null {
  const r = raw(v);
  if (typeof r === "number" && Number.isFinite(r)) return Math.round(r * 10000) / 10000;
  if (typeof r === "string" && /^-?\d+(\.\d+)?$/.test(r.trim())) return Number(r.trim());
  return null;
}

const text = (v: ExcelJS.CellValue) => {
  const r = raw(v);
  return r === null || r === undefined ? "" : String(r).trim();
};

const SECTIONS = /^(ITEMS|SAUCES|KITCHEN ITEMS|DINING SUPPLIES|KITCHEN SUPPLIES|KITCHEN UTENSILS)$/i;

export async function readWorkbookTabs(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new UserFacingError("Couldn't read this file. Upload the Excel (.xlsx) download of the sheet.");
  }
  return wb;
}

export function parseInventoryTab(ws: ExcelJS.Worksheet): InventorySheet {
  // Find the header row (first cell "ITEMS") and the date row above it.
  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    if (/^items$/i.test(text(ws.getRow(r).getCell(1).value))) {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new UserFacingError(`Tab "${ws.name}" has no ITEMS header row.`);
  const header = ws.getRow(headerRow);
  const dayCols: number[] = [];
  for (let c = 2; c <= ws.columnCount; c++) if (/^start$/i.test(text(header.getCell(c).value))) dayCols.push(c);
  const dates: string[] = [];
  for (const c of dayCols) {
    let d: unknown = null;
    for (let r = headerRow - 1; r >= 1 && !(d instanceof Date); r--) d = raw(ws.getRow(r).getCell(c).value);
    if (!(d instanceof Date)) throw new UserFacingError(`Tab "${ws.name}": no date above column ${c}.`);
    dates.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }

  const items: SheetItem[] = [];
  const seen = new Map<string, number>();
  let section = "ITEMS";
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(1).value).replace(/:$/, "").replace(/\s+/g, " ");
    if (!name) continue;
    if (/^sales vs inventory/i.test(name)) break;
    if (SECTIONS.test(name)) {
      section = name.toUpperCase();
      continue;
    }
    if (/^every \w+day$/i.test(name)) continue;
    const days = dayCols.map((c) => ({
      start: num(row.getCell(c).value),
      in: num(row.getCell(c + 1).value),
      out: num(row.getCell(c + 2).value),
      transfer: num(row.getCell(c + 3).value),
      end: num(row.getCell(c + 4).value),
    }));
    if (!days.some((d) => d.start || d.in || d.end || d.transfer)) continue; // never stocked this month
    // The same name twice in a tab (e.g. two "Cheese" rows) becomes "Cheese (2)".
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    items.push({ name: n > 1 ? `${name} (${n})` : name, section, days });
  }
  return { tab: ws.name, dates, items };
}

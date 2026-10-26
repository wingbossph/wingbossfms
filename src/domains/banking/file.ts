import "server-only";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { UserFacingError } from "@/lib/errors";

const pad = (n: number) => String(n).padStart(2, "0");

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    return "";
  }
  return String(v);
}

/** Reads an uploaded statement (CSV or Excel) into a table of strings. */
export async function readStatementTable(fileName: string, bytes: Buffer): Promise<string[][]> {
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new UserFacingError("The workbook has no sheets.");
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value).trim());
      rows.push(cells);
    });
    return rows;
  }
  if (/\.(csv|txt)$/i.test(fileName) || !/\.[a-z]+$/i.test(fileName)) {
    const text = bytes.toString("utf8").replace(/^﻿/, "");
    return Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
  }
  throw new UserFacingError("Upload the statement as CSV or Excel (.xlsx). For a PDF statement, export or convert it to CSV first.");
}

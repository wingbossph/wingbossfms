import "server-only";
import ExcelJS from "exceljs";
import { toCsv } from "@/lib/csv";
import { formatCell, rawCell, reportToRows, type ReportColumn, type ReportDoc, type ReportRow } from "@/domains/reports/doc";

export async function toXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wingboss FMS";
  const ws = wb.addWorksheet(doc.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([doc.title]).font = { bold: true, size: 14 };
  if (doc.subtitle) ws.addRow([doc.subtitle]).font = { italic: true };
  ws.addRow([]);

  const addTable = (columns: ReportColumn[], rows: ReportRow[]) => {
    const header = ws.addRow(columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } }));
    for (const r of rows) {
      const row = ws.addRow(columns.map((c) => rawCell(r.cells[c.key] ?? null, c.kind)));
      columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.kind === "money") cell.numFmt = "#,##0.00;(#,##0.00)";
        if (c.kind === "pct") cell.numFmt = "0.0%";
        if (c.kind === "qty") cell.numFmt = "#,##0.###";
        if (i === 0 && r.indent) cell.alignment = { indent: r.indent };
      });
      if (r.style === "section" || r.style === "subtotal" || r.style === "total") row.font = { bold: true };
      if (r.style === "total") row.eachCell((cell) => (cell.border = { top: { style: "thin" }, bottom: { style: "double" } }));
    }
  };
  addTable(doc.columns, doc.rows);
  for (const s of doc.sections ?? []) {
    ws.addRow([]);
    ws.addRow([s.title]).font = { bold: true };
    addTable(s.columns, s.rows);
  }
  for (const n of doc.notes ?? []) ws.addRow([n]).font = { italic: true, size: 9 };

  doc.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? (i === 0 ? 40 : 16)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsvText(doc: ReportDoc): string {
  return toCsv(reportToRows(doc));
}

/** PDF via react-pdf (A4, landscape when the table is wide). */
export async function toPdf(doc: ReportDoc): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ReportPdf } = await import("./report-pdf");
  return renderToBuffer(ReportPdf({ doc }));
}

export { formatCell };

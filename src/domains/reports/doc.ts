// A report is data: columns + rows. The same ReportDoc renders as an HTML
// table, and exports to CSV, Excel and PDF, so totals are identical everywhere.

export type CellKind = "text" | "money" | "pct" | "number" | "qty";
export type CellValue = string | number | bigint | null;

export type ReportColumn = { key: string; label: string; kind: CellKind; width?: number };

export type RowStyle = "normal" | "section" | "subtotal" | "total" | "muted";

export type ReportRow = {
  cells: Record<string, CellValue>;
  style?: RowStyle;
  indent?: number;
  /** Drill-down link for the row (e.g. the account's general ledger). */
  href?: string;
};

export type ReportDoc = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  notes?: string[];
  /** Extra tables (e.g. KPIs under a P&L). */
  sections?: { title: string; columns: ReportColumn[]; rows: ReportRow[] }[];
};

/** numerator ÷ denominator as a percentage (32.5 = 32.5%), or null when dividing by zero. */
export function pct(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  return Number((numerator * 100000n) / denominator) / 1000;
}

export function formatCell(v: CellValue, kind: CellKind): string {
  if (v === null || v === undefined || v === "") return "";
  switch (kind) {
    case "money": {
      const cents = typeof v === "bigint" ? v : BigInt(Math.round(Number(v)));
      const neg = cents < 0n;
      const abs = neg ? -cents : cents;
      const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const s = `${whole}.${(abs % 100n).toString().padStart(2, "0")}`;
      return neg ? `(${s})` : s;
    }
    case "pct":
      return `${Number(v).toFixed(1)}%`;
    case "number":
      return Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 });
    case "qty":
      return Number(v).toLocaleString("en-PH", { maximumFractionDigits: 3 });
    default:
      return String(v);
  }
}

/** Plain value for spreadsheets: pesos as numbers, percentages as fractions. */
export function rawCell(v: CellValue, kind: CellKind): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (kind === "money") return Number(typeof v === "bigint" ? v : BigInt(Math.round(Number(v)))) / 100;
  if (kind === "pct") return Number(v) / 100;
  if (kind === "number" || kind === "qty") return Number(v);
  return String(v);
}

export function reportToRows(doc: ReportDoc): (string | number | null)[][] {
  const out: (string | number | null)[][] = [[doc.title], ...(doc.subtitle ? [[doc.subtitle]] : []), []];
  const add = (columns: ReportColumn[], rows: ReportRow[]) => {
    out.push(columns.map((c) => c.label));
    for (const r of rows) {
      out.push(columns.map((c, i) => {
        const raw = rawCell(r.cells[c.key] ?? null, c.kind);
        return i === 0 && r.indent && typeof raw === "string" ? `${"  ".repeat(r.indent)}${raw}` : raw;
      }));
    }
  };
  add(doc.columns, doc.rows);
  for (const s of doc.sections ?? []) {
    out.push([], [s.title]);
    add(s.columns, s.rows);
  }
  for (const n of doc.notes ?? []) out.push([], [n]);
  return out;
}

// What the import wizard can bring in from the old Google Sheets, and how a
// spreadsheet row becomes typed values. Pure: lookups and writes happen in
// service.ts.

import { normHeader } from "@/lib/csv-parse";
import { parseStatementAmount, parseStatementDate, type DateOrder } from "@/domains/banking/formats";

export type ImportKind = "ITEMS" | "OPENING_STOCK" | "ACCOUNTS" | "OPENING_BALANCES" | "EMPLOYEES" | "SALES_HISTORY" | "EXPENSES_HISTORY";
export type FieldType = "text" | "money" | "qty" | "date" | "bool" | "int";
export type FieldDef = { key: string; label: string; type: FieldType; required?: boolean; aliases: string[]; example: string; help?: string };
export type KindDef = { kind: ImportKind; title: string; description: string; fields: FieldDef[] };

const f = (key: string, label: string, type: FieldType, example: string, aliases: string[] = [], opts: { required?: boolean; help?: string } = {}): FieldDef => ({ key, label, type, example, aliases, ...opts });

export const KINDS: KindDef[] = [
  {
    kind: "ITEMS",
    title: "Inventory items",
    description: "The items master: what you stock, its unit and category, and where it is kept.",
    fields: [
      f("sku", "SKU / code", "text", "PRO-WING", ["code", "item code"]),
      f("name", "Item name", "text", "Chicken wings (raw)", ["item", "description", "item name"], { required: true }),
      f("category", "Category", "text", "Raw protein", ["group", "type"], { required: true, help: "Existing category name, or a new one (then give the account codes)." }),
      f("baseUnit", "Unit", "text", "kg", ["uom", "unit of measure", "base unit"], { required: true }),
      f("purchaseUnit", "Purchase unit", "text", "box", ["buying unit"]),
      f("purchaseToBase", "Units per purchase unit", "qty", "10", ["conversion", "per box"]),
      f("countFrequency", "Count (daily / weekly / monthly)", "text", "daily", ["count", "frequency"]),
      f("stockedAt", "Stocked at (location codes)", "text", "MAT, LAN, COM", ["locations", "branches"], { help: "Comma-separated location codes. Blank = every branch." }),
      f("inventoryAccount", "Inventory account code", "text", "1220", ["asset account"]),
      f("consumptionAccount", "Usage / COGS account code", "text", "5010", ["cogs account", "expense account"]),
    ],
  },
  {
    kind: "OPENING_STOCK",
    title: "Opening inventory",
    description: "Stock on hand and its cost at go-live, per location. Posts to opening balance equity.",
    fields: [
      f("date", "Date", "date", "2026-10-31", ["as of"], { required: true }),
      f("location", "Location code or name", "text", "MAT", ["branch", "store"], { required: true }),
      f("item", "Item SKU or name", "text", "PRO-WING", ["sku", "item name"], { required: true }),
      f("qty", "Quantity (item unit)", "qty", "42.5", ["quantity", "on hand", "count"], { required: true }),
      f("unitCost", "Cost per unit (₱)", "money", "185.00", ["cost", "unit cost", "price"], { required: true }),
    ],
  },
  {
    kind: "ACCOUNTS",
    title: "Chart of accounts",
    description: "Add accounts (or rename existing ones by code) under the standard account groups.",
    fields: [
      f("code", "Account code", "text", "6215", ["account code", "no"], { required: true }),
      f("name", "Account name", "text", "Generator fuel", ["account", "account name", "title"], { required: true }),
      f("group", "Group (code or name)", "text", "UTILITIES", ["account group", "category", "type"], { required: true }),
      f("parent", "Parent account code", "text", "", ["parent code", "under"]),
    ],
  },
  {
    kind: "OPENING_BALANCES",
    title: "Opening balances",
    description: "Balances at go-live: cash and banks, receivables, payables, loans, equity. Enter normal balances (assets positive, liabilities positive).",
    fields: [
      f("date", "As of date", "date", "2026-10-31", ["as of"], { required: true }),
      f("location", "Location code or name", "text", "HO", ["branch"], { required: true }),
      f("account", "Account code or money account name", "text", "BPI Bank", ["account code", "money account"], { required: true }),
      f("amount", "Balance (₱)", "money", "250,000.00", ["balance", "amount"], { required: true }),
    ],
  },
  {
    kind: "EMPLOYEES",
    title: "Employees",
    description: "Staff list with location, pay rate and government numbers.",
    fields: [
      f("code", "Employee code", "text", "EMP-0007", ["id", "employee id"]),
      f("firstName", "First name", "text", "Juan", ["first", "given name"], { required: true }),
      f("lastName", "Last name", "text", "Dela Cruz", ["last", "surname", "family name"], { required: true }),
      f("position", "Position", "text", "Server", ["job", "title", "role"], { required: true }),
      f("location", "Location code or name", "text", "MAT", ["branch"], { required: true }),
      f("rateType", "Paid per (day / month)", "text", "day", ["rate type", "basis"], { required: true }),
      f("rate", "Rate (₱)", "money", "600.00", ["daily rate", "monthly rate", "salary"], { required: true }),
      f("startDate", "Start date", "date", "2024-03-01", ["date hired", "hired"], { required: true }),
      f("sssNo", "SSS no.", "text", "34-1234567-8", ["sss"]),
      f("philhealthNo", "PhilHealth no.", "text", "", ["philhealth", "phic"]),
      f("pagibigNo", "Pag-IBIG no.", "text", "", ["pagibig", "hdmf"]),
      f("tin", "TIN", "text", "", []),
      f("minimumWage", "Minimum wage earner (yes/no)", "bool", "yes", ["mwe"]),
    ],
  },
  {
    kind: "SALES_HISTORY",
    title: "Historical daily sales",
    description: "Past daily sales per location. Several rows per day are added up (e.g. one row per package or per payment channel).",
    fields: [
      f("date", "Date", "date", "2026-09-30", ["business date", "day"], { required: true }),
      f("location", "Location code or name", "text", "LAN", ["branch", "store"], { required: true }),
      f("product", "Package / product", "text", "Unlimited Wings", ["package", "item"], { help: "Blank = the historical sales product." }),
      f("qty", "Quantity", "qty", "35", ["count", "covers"]),
      f("pax", "Pax", "qty", "35", ["guests", "heads"]),
      f("gross", "Gross sales (₱)", "money", "17,465.00", ["sales", "amount", "gross sales"]),
      f("discount", "Discounts (₱)", "money", "349.30", ["discounts", "less"]),
      f("channel", "Payment channel", "text", "Cash", ["payment", "payment type", "mop"], { help: "Blank = Cash." }),
      f("payment", "Payment amount (₱)", "money", "17,115.70", ["paid", "collected"], { help: "Blank = gross − discount." }),
    ],
  },
  {
    kind: "EXPENSES_HISTORY",
    title: "Historical expenses",
    description: "Past expenses, one per row. They are posted as approved and paid.",
    fields: [
      f("date", "Date", "date", "2026-09-30", ["date paid"], { required: true }),
      f("location", "Location code or name", "text", "MAT", ["branch"], { required: true }),
      f("category", "Category (account code or name)", "text", "Electricity", ["account", "expense type", "type"], { required: true }),
      f("amount", "Amount (₱)", "money", "8,450.00", ["total", "cost"], { required: true }),
      f("description", "Description", "text", "Davao Light September", ["particulars", "details", "notes"]),
      f("supplier", "Supplier", "text", "Davao Light", ["payee", "vendor"]),
      f("paidFrom", "Paid from (money account)", "text", "Petty cash", ["paid by", "source", "fund"], { help: "Blank = the location's petty cash." }),
      f("receiptNo", "Receipt / OR no.", "text", "OR 12345", ["or", "receipt", "invoice no"]),
    ],
  },
];

export const kindDef = (k: string) => KINDS.find((x) => x.kind === k);

/** Best guess of which column holds each field. */
export function autoMap(def: KindDef, headers: readonly string[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  const names = (field: FieldDef) => [field.key, field.label, ...field.aliases].map(normHeader);
  // Exact names first for every field, so "Discounts" isn't taken by a field whose alias is "count".
  for (const field of def.fields) {
    const hit = headers.find((h) => !used.has(h) && names(field).includes(normHeader(h)));
    out[field.key] = hit ?? "";
    if (hit) used.add(hit);
  }
  for (const field of def.fields) {
    if (out[field.key]) continue;
    const hit = headers.find((h) => !used.has(h) && names(field).some((n) => n.length > 4 && normHeader(h).startsWith(n)));
    out[field.key] = hit ?? "";
    if (hit) used.add(hit);
  }
  return out;
}

export type ParsedRow = { rowNo: number; values: Record<string, string | bigint | boolean | number | null> };
export type RowError = { row: number; message: string };

function parseValue(type: FieldType, raw: string, order: DateOrder): { ok: true; value: string | bigint | boolean | number | null } | { ok: false; message: string } {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  switch (type) {
    case "money": {
      const v = parseStatementAmount(s);
      return v === "invalid" ? { ok: false, message: `"${s}" is not an amount` } : { ok: true, value: v };
    }
    case "date": {
      const v = parseStatementDate(s, order);
      return v ? { ok: true, value: v } : { ok: false, message: `"${s}" is not a date` };
    }
    case "qty": {
      const c = s.replace(/,/g, "");
      return /^-?\d+(\.\d{1,4})?$/.test(c) ? { ok: true, value: c } : { ok: false, message: `"${s}" is not a quantity` };
    }
    case "int":
      return /^-?\d+$/.test(s) ? { ok: true, value: Number(s) } : { ok: false, message: `"${s}" is not a whole number` };
    case "bool":
      if (/^(y|yes|true|1|oo)$/i.test(s)) return { ok: true, value: true };
      if (/^(n|no|false|0|hindi)$/i.test(s)) return { ok: true, value: false };
      return { ok: false, message: `"${s}" should be yes or no` };
    default:
      return { ok: true, value: s };
  }
}

/** Applies the mapping to every data row: typed values plus per-row errors. */
export function readRows(def: KindDef, table: string[][], mapping: Record<string, string>, opts: { headerRow?: number; dateOrder?: DateOrder } = {}) {
  const headerRow = opts.headerRow ?? 0;
  const header = (table[headerRow] ?? []).map((h) => (h ?? "").trim());
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  for (const field of def.fields) if (field.required && !mapping[field.key]) errors.push({ row: 0, message: `Choose the column for "${field.label}".` });
  if (errors.length) return { rows, errors };
  const idx = Object.fromEntries(def.fields.map((fd) => [fd.key, mapping[fd.key] ? header.indexOf(mapping[fd.key]) : -1]));
  table.slice(headerRow + 1).forEach((cells, i) => {
    const rowNo = headerRow + i + 2;
    if (cells.every((c) => !String(c ?? "").trim())) return;
    const values: ParsedRow["values"] = {};
    let bad = false;
    for (const field of def.fields) {
      const raw = idx[field.key] >= 0 ? String(cells[idx[field.key]] ?? "") : "";
      const p = parseValue(field.type, raw, opts.dateOrder ?? "MDY");
      if (!p.ok) {
        errors.push({ row: rowNo, message: `${field.label}: ${p.message}` });
        bad = true;
        continue;
      }
      if (field.required && p.value === null) {
        errors.push({ row: rowNo, message: `${field.label} is required` });
        bad = true;
        continue;
      }
      values[field.key] = p.value;
    }
    if (!bad) rows.push({ rowNo, values });
  });
  return { rows, errors };
}

/** A CSV template with the headers and one example row. */
export function templateCsv(def: KindDef) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `${def.fields.map((x) => q(x.label)).join(",")}\n${def.fields.map((x) => q(x.example)).join(",")}\n`;
}

// Parses Loyverse back-office CSV exports. Pure: no database access.
// Supported: "Receipts", "Receipts by item", "Sales by payment type",
// "Sales by item" and "Sales summary". Headers are matched loosely so small
// wording or language-setting differences don't break the import.

import { parseCsv, parseLocalDateTime, pickHeader } from "@/lib/csv-parse";
import { manilaDateString } from "@/lib/dates";
import { parsePeso } from "@/lib/money";

export type LoyverseKind = "RECEIPTS" | "RECEIPTS_BY_ITEM" | "SALES_BY_PAYMENT_TYPE" | "SALES_BY_ITEM" | "SALES_SUMMARY";

export type ParsedLine = { itemName: string; variantName: string | null; qty: string; grossCents: bigint; discountCents: bigint };

export type ParsedReceipt = {
  receiptNumber: string;
  receiptAt: Date;
  businessDate: string;
  isRefund: boolean;
  grossCents: bigint;
  discountCents: bigint;
  netCents: bigint;
  /** As shown in Loyverse; may list several types for split payments. */
  paymentType: string;
  store: string | null;
  cashierName: string | null;
  posDevice: string | null;
  lines: ParsedLine[];
  /** Exact split per payment type (API sync); CSV exports only give the joined names. */
  payments?: { name: string; amountCents: string }[];
};

export type ParsedSummaryRow = {
  name: string;
  qty?: string;
  grossCents: bigint;
  discountCents?: bigint;
  refundCents?: bigint;
  netCents: bigint;
  /** Sales summary exported by day: the row's business date (YYYY-MM-DD). */
  date?: string;
};

export type ParseResult = {
  kind: LoyverseKind;
  receipts: ParsedReceipt[];
  /** For summary exports (no receipt numbers). */
  summary: ParsedSummaryRow[];
  stores: string[];
  errors: string[];
};

function money(raw: string | undefined): bigint | null {
  if (raw === undefined || raw.trim() === "") return 0n;
  const v = raw.trim().replace(/^\((.*)\)$/, "-$1");
  return parsePeso(v.replace(/[^\d.,\-₱ ]/g, ""));
}

function qty(raw: string | undefined): string {
  const n = Number((raw ?? "1").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "0";
  return Math.abs(n).toFixed(2).replace(/\.00$/, "");
}

export function detectKind(headers: readonly string[]): LoyverseKind | null {
  const has = (...c: string[]) => !!pickHeader(headers, ...c);
  const receiptNo = has("Receipt number", "Receipt no", "Receipt #");
  const item = has("Item", "Item name");
  if (receiptNo && item) return "RECEIPTS_BY_ITEM";
  if (receiptNo) return "RECEIPTS";
  if (has("Payment type") && has("Payment amount", "Net amount", "Amount")) return "SALES_BY_PAYMENT_TYPE";
  if (item && has("Items sold", "Quantity", "Qty")) return "SALES_BY_ITEM";
  if (has("Date") && has("Net sales")) return "SALES_SUMMARY";
  return null;
}

export function parseLoyverseCsv(text: string, opts: { dateOrder?: "MDY" | "DMY" } = {}): ParseResult | { error: string } {
  const { headers, rows, errors } = parseCsv(text);
  const kind = detectKind(headers);
  if (!kind) return { error: "This doesn't look like a Loyverse export. Supported: Receipts, Receipts by item, Sales by payment type, Sales by item, Sales summary." };

  const h = {
    date: pickHeader(headers, "Date", "Date/time", "Created"),
    receipt: pickHeader(headers, "Receipt number", "Receipt no", "Receipt #"),
    type: pickHeader(headers, "Receipt type", "Type"),
    gross: pickHeader(headers, "Gross sales", "Gross"),
    discounts: pickHeader(headers, "Discounts", "Discount"),
    net: pickHeader(headers, "Net sales", "Total collected", "Net amount", "Total"),
    payment: pickHeader(headers, "Payment type", "Payment method", "Payment"),
    store: pickHeader(headers, "Store", "Store name"),
    cashier: pickHeader(headers, "Cashier name", "Employee", "Cashier"),
    pos: pickHeader(headers, "POS", "POS device"),
    item: pickHeader(headers, "Item", "Item name"),
    variant: pickHeader(headers, "Variants", "Variant"),
    qty: pickHeader(headers, "Quantity", "Items sold", "Qty"),
    status: pickHeader(headers, "Status"),
    paymentAmount: pickHeader(headers, "Payment amount", "Net amount", "Amount"),
    refundAmount: pickHeader(headers, "Refund amount", "Refunds"),
  };

  const out: ParseResult = { kind, receipts: [], summary: [], stores: [], errors: [...errors] };
  const stores = new Set<string>();

  if (kind === "RECEIPTS" || kind === "RECEIPTS_BY_ITEM") {
    const byNumber = new Map<string, ParsedReceipt>();
    rows.forEach((row, i) => {
      const rowNo = i + 2;
      if (h.status && /cancel|void/i.test(row[h.status] ?? "")) return;
      const number = (row[h.receipt!] ?? "").trim();
      const at = h.date ? parseLocalDateTime(row[h.date] ?? "", opts.dateOrder) : null;
      const gross = money(h.gross ? row[h.gross] : undefined);
      const disc = money(h.discounts ? row[h.discounts] : undefined);
      const net = money(h.net ? row[h.net] : undefined);
      if (!number) return out.errors.push(`Row ${rowNo}: missing receipt number`);
      if (!at) return out.errors.push(`Row ${rowNo}: can't read the date "${h.date ? row[h.date] : ""}"`);
      if (gross === null || disc === null || net === null) return out.errors.push(`Row ${rowNo}: can't read an amount`);
      const isRefund = /refund/i.test(h.type ? row[h.type] ?? "" : "") || (net < 0n && gross <= 0n);
      const store = h.store ? (row[h.store] ?? "").trim() || null : null;
      if (store) stores.add(store);

      let receipt = byNumber.get(number);
      if (!receipt) {
        receipt = {
          receiptNumber: number,
          receiptAt: at,
          businessDate: manilaDateString(at),
          isRefund,
          grossCents: 0n,
          discountCents: 0n,
          netCents: 0n,
          paymentType: h.payment ? (row[h.payment] ?? "").trim() : "",
          store,
          cashierName: h.cashier ? (row[h.cashier] ?? "").trim() || null : null,
          posDevice: h.pos ? (row[h.pos] ?? "").trim() || null : null,
          lines: [],
        };
        byNumber.set(number, receipt);
      }
      const absGross = gross < 0n ? -gross : gross;
      const absDisc = disc < 0n ? -disc : disc;
      const absNet = net < 0n ? -net : net;
      receipt.grossCents += absGross;
      receipt.discountCents += absDisc;
      receipt.netCents += absNet;
      if (kind === "RECEIPTS_BY_ITEM") {
        receipt.lines.push({
          itemName: (row[h.item!] ?? "").trim(),
          variantName: h.variant ? (row[h.variant] ?? "").trim() || null : null,
          qty: qty(h.qty ? row[h.qty] : "1"),
          grossCents: absGross,
          discountCents: absDisc,
        });
      }
    });
    out.receipts = [...byNumber.values()];
  } else {
    rows.forEach((row, i) => {
      const name = ((kind === "SALES_BY_PAYMENT_TYPE" ? row[h.payment!] : kind === "SALES_BY_ITEM" ? row[h.item!] : row[h.date!]) ?? "").trim();
      if (!name || /^total$/i.test(name)) return;
      const gross = money(kind === "SALES_BY_PAYMENT_TYPE" ? row[h.paymentAmount!] : h.gross ? row[h.gross] : undefined);
      const net = money(kind === "SALES_BY_PAYMENT_TYPE" ? row[h.net ?? h.paymentAmount!] : h.net ? row[h.net] : undefined);
      const refund = money(h.refundAmount ? row[h.refundAmount] : undefined);
      const disc = money(h.discounts ? row[h.discounts] : undefined);
      if (gross === null || net === null || refund === null || disc === null) return out.errors.push(`Row ${i + 2}: can't read an amount`);
      out.summary.push({
        name,
        qty: kind === "SALES_BY_ITEM" ? qty(h.qty ? row[h.qty] : "0") : undefined,
        grossCents: gross,
        discountCents: disc,
        refundCents: refund < 0n ? -refund : refund,
        netCents: net,
        date: kind === "SALES_SUMMARY" ? summaryDate(name, opts.dateOrder) : undefined,
      });
    });
  }
  out.stores = [...stores];
  return out;
}

function summaryDate(raw: string, order?: "MDY" | "DMY"): string | undefined {
  const d = parseLocalDateTime(raw, order);
  return d ? manilaDateString(d) : undefined;
}

/** A Sales summary exported with one row per day (Date column holds dates). */
export function isDailySummary(p: ParseResult): boolean {
  return p.kind === "SALES_SUMMARY" && p.summary.length > 0 && p.summary.every((s) => s.date);
}

/** Split payments ("Cash, GCash") can't be allocated from the Receipts export alone. */
export function isSplitPayment(paymentType: string): boolean {
  return /[,;+/]/.test(paymentType);
}

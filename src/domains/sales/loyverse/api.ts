// Loyverse API sync: pulls receipts for a store and feeds them through the
// same import as the CSV exports (mapping, de-duplication, draft rebuild).
// Docs: https://developer.loyverse.com/docs/ (GET /v1.0/receipts, /v1.0/employees)

import { manilaDateString } from "@/lib/dates";
import { parsePeso } from "@/lib/money";
import type { ParseResult, ParsedReceipt } from "./parse";

const BASE = "https://api.loyverse.com/v1.0";

export type ApiReceipt = {
  receipt_number: string;
  receipt_type: "SALE" | "REFUND";
  receipt_date?: string;
  created_at: string;
  cancelled_at?: string | null;
  store_id?: string;
  employee_id?: string | null;
  pos_device_id?: string | null;
  total_money: number;
  total_discount?: number;
  line_items: { item_name: string; variant_name?: string | null; quantity: number; gross_total_money?: number; total_money?: number; total_discount?: number }[];
  payments?: { name?: string; type?: string; money_amount: number }[];
};

const toCents = (n: number | undefined) => parsePeso((n ?? 0).toFixed(2)) ?? 0n;

/** API receipts → the importer's parsed shape. Cancelled receipts are skipped. */
export function apiToParse(receipts: readonly ApiReceipt[], employees: ReadonlyMap<string, string> = new Map()): ParseResult {
  const out: ParsedReceipt[] = [];
  const errors: string[] = [];
  for (const r of receipts) {
    if (r.cancelled_at) continue;
    const at = new Date(r.receipt_date ?? r.created_at);
    if (Number.isNaN(at.getTime())) {
      errors.push(`Receipt ${r.receipt_number}: unreadable date`);
      continue;
    }
    const lines = (r.line_items ?? []).map((l) => {
      const discount = toCents(l.total_discount);
      const gross = l.gross_total_money !== undefined ? toCents(l.gross_total_money) : toCents(l.total_money) + discount;
      return { itemName: l.item_name, variantName: l.variant_name || null, qty: String(l.quantity), grossCents: gross, discountCents: discount };
    });
    const net = toCents(r.total_money);
    const discount = toCents(r.total_discount);
    const payments = (r.payments ?? []).map((p) => ({ name: p.name || p.type || "Other", amountCents: toCents(p.money_amount).toString() }));
    out.push({
      receiptNumber: r.receipt_number,
      receiptAt: at,
      businessDate: manilaDateString(at),
      isRefund: r.receipt_type === "REFUND",
      grossCents: lines.reduce((a, l) => a + l.grossCents, 0n) || net + discount,
      discountCents: discount,
      netCents: net,
      paymentType: payments.map((p) => p.name).join(", "),
      store: null,
      cashierName: r.employee_id ? (employees.get(r.employee_id) ?? null) : null,
      posDevice: r.pos_device_id ?? null,
      lines,
      payments: payments.length > 1 ? payments : undefined,
    });
  }
  return { kind: "RECEIPTS_BY_ITEM", receipts: out, summary: [], stores: [], errors };
}

async function get<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Loyverse API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Every receipt of a store created in [since, until), following the cursor. */
export async function fetchReceipts(token: string, storeId: string, since: Date, until: Date) {
  const receipts: ApiReceipt[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const body = await get<{ receipts: ApiReceipt[]; cursor?: string }>(token, "/receipts", { store_id: storeId, created_at_min: since.toISOString(), created_at_max: until.toISOString(), limit: "250", ...(cursor ? { cursor } : {}) });
    receipts.push(...body.receipts);
    if (!body.cursor) break;
    cursor = body.cursor;
  }
  return receipts;
}

export async function fetchEmployees(token: string) {
  const body = await get<{ employees: { id: string; name: string }[] }>(token, "/employees", { limit: "250" });
  return new Map(body.employees.map((e) => [e.id, e.name]));
}

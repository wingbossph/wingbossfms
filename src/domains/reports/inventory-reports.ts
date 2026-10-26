import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { varianceReport } from "@/domains/inventory/analytics";
import type { ReportDoc, ReportRow } from "./doc";
import { fmtDate, fmtRange } from "./params";

type Scope = { ids: string[]; locations: { id: string; name: string; type: string }[]; label: string };

export async function stockOnHand(scope: Scope, asOf: string): Promise<ReportDoc> {
  // Quantity and value as of a date = sum of movements up to that date.
  const rows = await db.stockMovement.groupBy({
    by: ["itemId", "locationId"],
    where: { locationId: { in: scope.ids }, businessDate: { lte: toDbDate(asOf) } },
    _sum: { qty: true, valueCents: true },
  });
  const items = await db.item.findMany({ include: { category: true } });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const locName = new Map(scope.locations.map((l) => [l.id, l.name]));
  const out: ReportRow[] = [];
  let total = 0n;
  const sorted = rows
    .filter((r) => Number(r._sum.qty ?? 0) !== 0 || (r._sum.valueCents ?? 0n) !== 0n)
    .sort((a, b) => (locName.get(a.locationId) ?? "").localeCompare(locName.get(b.locationId) ?? "") || (itemById.get(a.itemId)?.name ?? "").localeCompare(itemById.get(b.itemId)?.name ?? ""));
  let lastLoc = "";
  for (const r of sorted) {
    if (r.locationId !== lastLoc && scope.ids.length > 1) {
      out.push({ cells: { item: locName.get(r.locationId) ?? "" }, style: "section" });
      lastLoc = r.locationId;
    }
    const item = itemById.get(r.itemId)!;
    const qty = Number(r._sum.qty ?? 0);
    const value = r._sum.valueCents ?? 0n;
    total += value;
    out.push({
      cells: { item: item.name, category: item.category.name, qty, unit: item.baseUnit, avg: qty ? Math.round(Number(value) / qty) : null, value },
      indent: scope.ids.length > 1 ? 1 : 0,
    });
  }
  out.push({ cells: { item: "Total inventory value", value: total }, style: "total" });
  return {
    title: "Stock on hand & valuation",
    subtitle: `${scope.label} · as of ${fmtDate(asOf)} · weighted-average cost`,
    columns: [
      { key: "item", label: "Item", kind: "text", width: 34 },
      { key: "category", label: "Category", kind: "text" },
      { key: "qty", label: "Quantity", kind: "qty" },
      { key: "unit", label: "Unit", kind: "text", width: 8 },
      { key: "avg", label: "Avg cost / unit", kind: "money" },
      { key: "value", label: "Value", kind: "money" },
    ],
    rows: out,
    notes: ["Inventory value here equals the inventory accounts on the balance sheet."],
  };
}

const MOVE_LABEL: Record<string, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchased",
  TRANSFER_IN: "Transfers in",
  TRANSFER_OUT: "Transfers out",
  PRODUCTION_CONSUME: "Used in production",
  PRODUCTION_OUTPUT: "Produced",
  WASTE: "Waste",
  STAFF_MEAL: "Staff meals",
  ADJUSTMENT: "Adjustments",
  COUNT_USAGE: "Usage (from counts)",
  TRANSFER_LOSS: "Transfer loss",
};

/** Beginning + in − out − waste − usage = ending, per item. */
export async function usageReport(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const [before, during, items] = await Promise.all([
    db.stockMovement.groupBy({ by: ["itemId"], where: { locationId: { in: scope.ids }, businessDate: { lt: toDbDate(from) } }, _sum: { qty: true } }),
    db.stockMovement.groupBy({ by: ["itemId", "type"], where: { locationId: { in: scope.ids }, businessDate: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { qty: true, valueCents: true } }),
    db.item.findMany({ orderBy: { name: "asc" } }),
  ]);
  const begin = new Map(before.map((b) => [b.itemId, Number(b._sum.qty ?? 0)]));
  const by = (itemId: string, types: string[]) => during.filter((d) => d.itemId === itemId && types.includes(d.type)).reduce((a, d) => a + Number(d._sum.qty ?? 0), 0);
  const usageValue = (itemId: string) => -during.filter((d) => d.itemId === itemId && d.type === "COUNT_USAGE").reduce((a, d) => a + (d._sum.valueCents ?? 0n), 0n);
  const rows: ReportRow[] = [];
  for (const i of items) {
    const b = begin.get(i.id) ?? 0;
    const inQ = by(i.id, ["OPENING", "PURCHASE", "TRANSFER_IN", "PRODUCTION_OUTPUT"]);
    const outQ = -by(i.id, ["TRANSFER_OUT", "PRODUCTION_CONSUME"]);
    const waste = -by(i.id, ["WASTE", "STAFF_MEAL"]);
    const usage = -by(i.id, ["COUNT_USAGE"]);
    const adj = by(i.id, ["ADJUSTMENT"]);
    const end = b + inQ - outQ - waste - usage + adj;
    if ([b, inQ, outQ, waste, usage, adj].every((v) => v === 0)) continue;
    rows.push({ cells: { item: i.name, unit: i.baseUnit, begin: b, in: inQ, out: outQ, waste, usage, end, value: usageValue(i.id) } });
  }
  return {
    title: "Inventory usage",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "item", label: "Item", kind: "text", width: 30 },
      { key: "unit", label: "Unit", kind: "text", width: 8 },
      { key: "begin", label: "Beginning", kind: "qty" },
      { key: "in", label: "Received / produced", kind: "qty" },
      { key: "out", label: "Sent / used in production", kind: "qty" },
      { key: "waste", label: "Waste & staff meals", kind: "qty" },
      { key: "usage", label: "Usage (counted)", kind: "qty" },
      { key: "end", label: "Ending", kind: "qty" },
      { key: "value", label: "Usage cost", kind: "money" },
    ],
    rows,
    notes: ["Usage = beginning + received + transfers in − transfers out − waste − ending count."],
  };
}

export async function varianceDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const rows: ReportRow[] = [];
  for (const loc of scope.locations) {
    const v = await varianceReport(db, loc.id, from, to);
    if (!v.length) continue;
    if (scope.locations.length > 1) rows.push({ cells: { date: loc.name }, style: "section" });
    for (const r of v) {
      rows.push({
        cells: {
          date: fmtDate(r.date),
          item: r.item,
          pax: r.pax,
          actual: r.actualQty,
          theoretical: r.theoreticalQty,
          variance: r.varianceQty,
          pct: r.variancePct,
          perPax: r.perPax,
          value: r.varianceValueCents,
          flag: r.flagged ? "⚠ over tolerance" : r.theoreticalQty === null ? "no standard set" : "",
        },
        style: r.flagged ? "subtotal" : "normal",
      });
    }
  }
  return {
    title: "Usage variance (actual vs theoretical)",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "date", label: "Count date", kind: "text", width: 14 },
      { key: "item", label: "Item", kind: "text", width: 24 },
      { key: "pax", label: "Pax", kind: "number" },
      { key: "actual", label: "Actual", kind: "qty" },
      { key: "theoretical", label: "Theoretical", kind: "qty" },
      { key: "variance", label: "Variance", kind: "qty" },
      { key: "pct", label: "Variance %", kind: "pct" },
      { key: "perPax", label: "Per pax", kind: "qty" },
      { key: "value", label: "Variance ₱", kind: "money" },
      { key: "flag", label: "", kind: "text", width: 16 },
    ],
    rows,
    notes: [
      "Theoretical = pax × each package's per-pax standard + à la carte recipes. Usage between two counts is compared with sales over the same days.",
      "Bold rows are beyond the tolerance (default ±5%, set per item and location).",
    ],
  };
}

export async function wasteReport(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const moves = await db.stockMovement.findMany({
    where: { locationId: { in: scope.ids }, type: { in: ["WASTE", "STAFF_MEAL", "TRANSFER_LOSS"] }, businessDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: { item: true, location: true },
    orderBy: { businessDate: "desc" },
  });
  const rows: ReportRow[] = moves.map((m) => ({
    cells: { date: fmtDate(m.businessDate.toISOString().slice(0, 10)), location: m.location.name, type: MOVE_LABEL[m.type], item: m.item.name, qty: -Number(m.qty), unit: m.item.baseUnit, value: -m.valueCents, reason: m.reason ?? "" },
  }));
  rows.push({ cells: { date: "Total", value: moves.reduce((a, m) => a - m.valueCents, 0n) }, style: "total" });
  return {
    title: "Waste & staff meals",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "date", label: "Date", kind: "text", width: 14 },
      { key: "location", label: "Location", kind: "text" },
      { key: "type", label: "Type", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "qty", label: "Qty", kind: "qty" },
      { key: "unit", label: "Unit", kind: "text", width: 8 },
      { key: "value", label: "Cost", kind: "money" },
      { key: "reason", label: "Reason", kind: "text", width: 30 },
    ],
    rows,
  };
}

const TRANSFER_STATUS: Record<string, string> = { DRAFT: "Draft", DISPATCHED: "In transit", RECEIVED: "Received", RECEIVED_WITH_DISCREPANCY: "Received (short)", CANCELLED: "Cancelled" };

export async function transfersReport(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const transfers = await db.transfer.findMany({
    where: {
      OR: [{ fromLocationId: { in: scope.ids } }, { toLocationId: { in: scope.ids } }],
      createdAt: { gte: new Date(`${from}T00:00:00+08:00`), lt: new Date(Date.parse(`${to}T00:00:00+08:00`) + 86_400_000) },
      status: { not: "CANCELLED" },
    },
    include: { fromLocation: true, toLocation: true, lines: { include: { item: true } } },
    orderBy: { number: "desc" },
  });
  const rows: ReportRow[] = [];
  for (const t of transfers) {
    rows.push({ cells: { no: `#${t.number}`, route: `${t.fromLocation.name} → ${t.toLocation.name}`, status: TRANSFER_STATUS[t.status], cost: t.costCents, value: t.valueCents }, style: "subtotal", href: `/commissary/transfers/${t.id}` });
    for (const l of t.lines) {
      rows.push({
        cells: { no: "", route: l.item.name, status: `${Number(l.qtySent)} sent${l.qtyReceived !== null ? ` · ${Number(l.qtyReceived)} received` : ""} ${l.item.baseUnit}${l.discrepancyReason ? ` · ${l.discrepancyReason}` : ""}`, cost: l.costCents, value: l.valueCents },
        indent: 1,
      });
    }
  }
  return {
    title: "Transfers",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "no", label: "Transfer", kind: "text", width: 10 },
      { key: "route", label: "Route / item", kind: "text", width: 34 },
      { key: "status", label: "Status / quantities", kind: "text", width: 34 },
      { key: "cost", label: "Cost", kind: "money" },
      { key: "value", label: "Transfer value", kind: "money" },
    ],
    rows,
  };
}

/** What each branch received from a supplying location, its value, and what is owed. */
export async function commissaryStatement(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const suppliers = scope.locations.filter((l) => l.type === "COMMISSARY");
  const sources = suppliers.length ? suppliers : await db.location.findMany({ where: { type: "COMMISSARY" } });
  const receivable = await db.account.findUniqueOrThrow({ where: { systemKey: "INTERCO_RECEIVABLE" } });
  const rows: ReportRow[] = [];
  for (const src of sources) {
    const received = await db.transfer.groupBy({
      by: ["toLocationId"],
      where: { fromLocationId: src.id, status: { in: ["RECEIVED", "RECEIVED_WITH_DISCREPANCY"] }, receivedAt: { gte: new Date(`${from}T00:00:00+08:00`), lt: new Date(Date.parse(`${to}T00:00:00+08:00`) + 86_400_000) } },
      _sum: { costCents: true, valueCents: true },
      _count: true,
    });
    const settled = await db.intercoSettlement.groupBy({ by: ["payerLocationId"], where: { payeeLocationId: src.id, date: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { amountCents: true } });
    const owed = await db.journalLine.groupBy({ by: ["counterpartyLocationId"], where: { accountId: receivable.id, locationId: src.id, date: { lte: toDbDate(to) } }, _sum: { debitCents: true, creditCents: true } });
    const branchIds = new Set([...received.map((r) => r.toLocationId), ...owed.flatMap((o) => (o.counterpartyLocationId ? [o.counterpartyLocationId] : []))]);
    const names = await db.location.findMany({ where: { id: { in: [...branchIds] } } });
    rows.push({ cells: { branch: `From ${src.name}` }, style: "section" });
    let tCost = 0n,
      tValue = 0n,
      tSettled = 0n,
      tOwed = 0n;
    for (const b of names) {
      if (scope.locations.length && !scope.ids.includes(b.id) && !scope.ids.includes(src.id)) continue;
      const r = received.find((x) => x.toLocationId === b.id);
      const s = settled.find((x) => x.payerLocationId === b.id)?._sum.amountCents ?? 0n;
      const o = owed.find((x) => x.counterpartyLocationId === b.id);
      const balance = (o?._sum.debitCents ?? 0n) - (o?._sum.creditCents ?? 0n);
      tCost += r?._sum.costCents ?? 0n;
      tValue += r?._sum.valueCents ?? 0n;
      tSettled += s;
      tOwed += balance;
      rows.push({ cells: { branch: b.name, count: r?._count ?? 0, cost: r?._sum.costCents ?? 0n, value: r?._sum.valueCents ?? 0n, settled: s, owed: balance }, indent: 1 });
    }
    rows.push({ cells: { branch: "Total", cost: tCost, value: tValue, settled: tSettled, owed: tOwed }, style: "total" });
  }
  return {
    title: "Commissary statement",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "branch", label: "Branch", kind: "text", width: 30 },
      { key: "count", label: "Deliveries", kind: "number" },
      { key: "cost", label: "Cost of goods received", kind: "money" },
      { key: "value", label: "Transfer value", kind: "money" },
      { key: "settled", label: "Settled in period", kind: "money" },
      { key: "owed", label: `Owed as of ${fmtDate(to)}`, kind: "money" },
    ],
    rows,
    notes: ["Transfers are priced at cost unless a markup is turned on. Amounts owed between locations cancel out in consolidated reports."],
  };
}

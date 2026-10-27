import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import type { ReportDoc, ReportRow } from "./doc";
import { pct } from "./doc";
import { fmtDate, fmtRange } from "./params";

type Scope = { ids: string[]; locations: { id: string; name: string }[]; label: string };

const inRange = (from: string, to: string) => ({ gte: toDbDate(from), lte: toDbDate(to) });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One row per day (and location): gross, discounts, refunds, net, pax, spend per pax. */
export async function dailySalesDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const reports = await db.salesReport.findMany({ where: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to) }, include: { location: true, cashCount: true }, orderBy: [{ businessDate: "asc" }, { location: { sortOrder: "asc" } }, { shiftNo: "asc" }] });
  const rows: ReportRow[] = [];
  const t = { gross: 0n, discount: 0n, refund: 0n, sc: 0n, net: 0n, pax: 0, overShort: 0n };
  for (const r of reports) {
    const pax = Number(r.pax);
    rows.push({
      cells: { date: fmtDate(ymd(r.businessDate)), location: `${r.location.name}${r.shiftNo > 1 ? ` (shift ${r.shiftNo})` : ""}`, gross: r.grossCents, discount: -r.discountCents, refund: -r.refundCents, sc: r.serviceChargeCents, net: r.netCents, pax, perPax: pax > 0 ? BigInt(Math.round(Number(r.netCents) / pax)) : null, overShort: r.cashCount?.overShortCents ?? null },
      href: `/sales/${r.id}`,
    });
    t.gross += r.grossCents;
    t.discount += r.discountCents;
    t.refund += r.refundCents;
    t.sc += r.serviceChargeCents;
    t.net += r.netCents;
    t.pax += pax;
    t.overShort += r.cashCount?.overShortCents ?? 0n;
  }
  rows.push({ cells: { date: "Total", gross: t.gross, discount: -t.discount, refund: -t.refund, sc: t.sc, net: t.net, pax: t.pax, perPax: t.pax > 0 ? BigInt(Math.round(Number(t.net) / t.pax)) : null, overShort: t.overShort }, style: "total" });
  return {
    title: "Daily sales summary",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "date", label: "Date", kind: "text", width: 14 },
      { key: "location", label: "Location", kind: "text", width: 18 },
      { key: "gross", label: "Gross", kind: "money" },
      { key: "discount", label: "Discounts", kind: "money" },
      { key: "refund", label: "Refunds", kind: "money" },
      { key: "sc", label: "Service charge", kind: "money" },
      { key: "net", label: "Net sales", kind: "money" },
      { key: "pax", label: "Pax", kind: "number" },
      { key: "perPax", label: "Per pax", kind: "money" },
      { key: "overShort", label: "Cash over/short", kind: "money" },
    ],
    rows,
  };
}

/** Packages and other products: quantity, pax and sales. */
export async function salesByPackageDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const lines = await db.salesLine.groupBy({ by: ["productId"], where: { report: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to) } }, _sum: { qty: true, pax: true, grossCents: true } });
  const products = await db.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
  const total = lines.reduce((a, l) => a + (l._sum.grossCents ?? 0n), 0n);
  const rows: ReportRow[] = lines
    .map((l) => ({ l, p: products.find((p) => p.id === l.productId)! }))
    .sort((a, b) => ((b.l._sum.grossCents ?? 0n) > (a.l._sum.grossCents ?? 0n) ? 1 : -1))
    .map(({ l, p }) => ({ cells: { product: p.name, type: p.type === "PACKAGE" ? "Package" : p.type.toLowerCase().replace("_", " "), qty: Number(l._sum.qty ?? 0), pax: Number(l._sum.pax ?? 0), gross: l._sum.grossCents ?? 0n, share: pct(l._sum.grossCents ?? 0n, total) } }));
  rows.push({ cells: { product: "Total", qty: lines.reduce((a, l) => a + Number(l._sum.qty ?? 0), 0), pax: lines.reduce((a, l) => a + Number(l._sum.pax ?? 0), 0), gross: total, share: total ? 100 : null }, style: "total" });
  return {
    title: "Sales by package",
    subtitle: `${scope.label} · ${fmtRange(from, to)} · before discounts`,
    columns: [
      { key: "product", label: "Package / product", kind: "text", width: 30 },
      { key: "type", label: "Type", kind: "text", width: 12 },
      { key: "qty", label: "Qty", kind: "number" },
      { key: "pax", label: "Pax", kind: "number" },
      { key: "gross", label: "Gross sales", kind: "money" },
      { key: "share", label: "Share", kind: "pct" },
    ],
    rows,
  };
}

/** Payments per channel, one column per location plus the total. */
export async function salesByChannelDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const pays = await db.salesPayment.findMany({ where: { report: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to) } }, include: { channel: { include: { moneyAccount: true } }, report: { select: { locationId: true } } } });
  const locs = scope.locations.filter((l) => pays.some((p) => p.report.locationId === l.id));
  const channels = new Map<string, { name: string; personal: boolean; by: Map<string, bigint> }>();
  for (const p of pays) {
    const c = channels.get(p.channelId) ?? { name: p.channel.name, personal: !!p.channel.moneyAccount?.isPersonal, by: new Map() };
    c.by.set(p.report.locationId, (c.by.get(p.report.locationId) ?? 0n) + p.amountCents);
    channels.set(p.channelId, c);
  }
  const total = pays.reduce((a, p) => a + p.amountCents, 0n);
  const rows: ReportRow[] = [...channels.values()]
    .map((c) => ({ c, sum: [...c.by.values()].reduce((a, b) => a + b, 0n) }))
    .sort((a, b) => (b.sum > a.sum ? 1 : -1))
    .map(({ c, sum }) => ({ cells: { channel: `${c.name}${c.personal ? " (personal)" : ""}`, ...Object.fromEntries(locs.map((l) => [l.id, c.by.get(l.id) ?? 0n])), total: sum, share: pct(sum, total) } }));
  rows.push({ cells: { channel: "Total", ...Object.fromEntries(locs.map((l) => [l.id, pays.filter((p) => p.report.locationId === l.id).reduce((a, p) => a + p.amountCents, 0n)])), total, share: total ? 100 : null }, style: "total" });
  return {
    title: "Sales by payment channel",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [{ key: "channel", label: "Channel", kind: "text", width: 26 }, ...(locs.length > 1 ? locs.map((l) => ({ key: l.id, label: l.name, kind: "money" as const })) : []), { key: "total", label: "Total", kind: "money" }, { key: "share", label: "Share", kind: "pct" }],
    rows,
  };
}

/** Net sales by cashier: Loyverse receipts when imported, otherwise who entered the day. */
export async function salesByCashierDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const receipts = await db.loyverseReceipt.groupBy({ by: ["cashierName", "locationId"], where: { locationId: { in: scope.ids }, businessDate: inRange(from, to), report: { status: "POSTED" } }, _sum: { netCents: true }, _count: true });
  const reports = await db.salesReport.groupBy({ by: ["cashierUserId", "locationId"], where: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to), receipts: { none: {} } }, _sum: { netCents: true, pax: true }, _count: true });
  const users = await db.user.findMany({ where: { id: { in: reports.map((r) => r.cashierUserId) } }, select: { id: true, name: true } });
  const locName = new Map(scope.locations.map((l) => [l.id, l.name]));
  const rows: ReportRow[] = [
    ...receipts.map((r) => ({ cells: { cashier: r.cashierName ?? "(not recorded)", location: locName.get(r.locationId) ?? "", source: "Loyverse receipts", count: r._count, net: r._sum.netCents ?? 0n } })),
    ...reports.map((r) => ({ cells: { cashier: users.find((u) => u.id === r.cashierUserId)?.name ?? "", location: locName.get(r.locationId) ?? "", source: "Manual entry (days)", count: r._count, net: r._sum.netCents ?? 0n } })),
  ].sort((a, b) => ((b.cells.net as bigint) > (a.cells.net as bigint) ? 1 : -1));
  rows.push({ cells: { cashier: "Total", net: rows.reduce((a, r) => a + (r.cells.net as bigint), 0n) }, style: "total" });
  return {
    title: "Sales by cashier",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "cashier", label: "Cashier", kind: "text", width: 24 },
      { key: "location", label: "Location", kind: "text", width: 18 },
      { key: "source", label: "From", kind: "text", width: 18 },
      { key: "count", label: "Receipts / days", kind: "number" },
      { key: "net", label: "Net sales", kind: "money" },
    ],
    rows,
  };
}

/** Busiest weekdays (all sales) and hours (Loyverse receipts carry the time). */
export async function salesByTimeDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const reports = await db.salesReport.findMany({ where: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to) }, select: { businessDate: true, netCents: true, pax: true } });
  const wd = WEEKDAYS.map(() => ({ net: 0n, pax: 0, days: new Set<string>() }));
  for (const r of reports) {
    const w = wd[r.businessDate.getUTCDay()];
    w.net += r.netCents;
    w.pax += Number(r.pax);
    w.days.add(ymd(r.businessDate));
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows: ReportRow[] = order.map((i) => ({ cells: { when: WEEKDAYS[i], days: wd[i].days.size, net: wd[i].net, avg: wd[i].days.size ? wd[i].net / BigInt(wd[i].days.size) : null, pax: wd[i].pax, avgPax: wd[i].days.size ? Math.round((wd[i].pax / wd[i].days.size) * 10) / 10 : null } }));
  const receipts = await db.loyverseReceipt.findMany({ where: { locationId: { in: scope.ids }, businessDate: inRange(from, to), isRefund: false }, select: { receiptAt: true, netCents: true, businessDate: true } });
  const hours = new Map<number, { net: bigint; count: number }>();
  for (const r of receipts) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Manila" }).format(r.receiptAt)) % 24;
    const cur = hours.get(h) ?? { net: 0n, count: 0 };
    cur.net += r.netCents;
    cur.count++;
    hours.set(h, cur);
  }
  const days = new Set(receipts.map((r) => ymd(r.businessDate))).size || 1;
  const hourRows: ReportRow[] = [...hours.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) => ({ cells: { when: `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`, days: v.count, net: v.net, avg: v.net / BigInt(days) } }));
  return {
    title: "Sales by weekday and hour",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "when", label: "Weekday", kind: "text", width: 20 },
      { key: "days", label: "Days", kind: "number" },
      { key: "net", label: "Net sales", kind: "money" },
      { key: "avg", label: "Average per day", kind: "money" },
      { key: "pax", label: "Pax", kind: "number" },
      { key: "avgPax", label: "Pax per day", kind: "number" },
    ],
    rows,
    sections: [
      {
        title: "By hour (Loyverse receipts)",
        columns: [
          { key: "when", label: "Hour", kind: "text", width: 20 },
          { key: "days", label: "Receipts", kind: "number" },
          { key: "net", label: "Net sales", kind: "money" },
          { key: "avg", label: "Average per day", kind: "money" },
        ],
        rows: hourRows.length ? hourRows : [{ cells: { when: "Import Loyverse receipts to see sales by hour." }, style: "muted" }],
      },
    ],
  };
}

/** Every discount given, with the SC/PWD customer details BIR asks for. */
export async function discountsLogDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const discounts = await db.salesDiscount.findMany({ where: { report: { locationId: { in: scope.ids }, status: "POSTED", businessDate: inRange(from, to) } }, include: { discountType: true, report: { include: { location: true } } }, orderBy: [{ report: { businessDate: "asc" } }] });
  const byType = new Map<string, bigint>();
  const rows: ReportRow[] = discounts.map((d) => {
    byType.set(d.discountType.name, (byType.get(d.discountType.name) ?? 0n) + d.amountCents);
    return { cells: { date: fmtDate(ymd(d.report.businessDate)), location: d.report.location.name, type: d.discountType.name, customer: d.customerName ?? "", id: d.idNumber ?? "", receipt: d.receiptNo ?? "", amount: d.amountCents }, href: `/sales/${d.reportId}` };
  });
  for (const [name, cents] of byType) rows.push({ cells: { date: `Total ${name}`, amount: cents }, style: "subtotal" });
  rows.push({ cells: { date: "Total discounts", amount: discounts.reduce((a, d) => a + d.amountCents, 0n) }, style: "total" });
  return {
    title: "Discounts and SC/PWD log",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "date", label: "Date", kind: "text", width: 14 },
      { key: "location", label: "Location", kind: "text", width: 14 },
      { key: "type", label: "Discount", kind: "text", width: 16 },
      { key: "customer", label: "Customer", kind: "text", width: 18 },
      { key: "id", label: "SC/PWD ID no.", kind: "text", width: 14 },
      { key: "receipt", label: "Receipt", kind: "text", width: 10 },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows,
  };
}

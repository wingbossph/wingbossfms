import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { reconciliationPreview } from "@/domains/banking/service";
import type { ReportDoc, ReportRow } from "./doc";
import { fmtDate, fmtRange } from "./params";

type Scope = { ids: string[]; label: string };

/** Bank reconciliation statement for one account as of a date. */
export async function bankReconciliationDoc(moneyAccountId: string, asOf: string, statementBalance?: bigint | null): Promise<ReportDoc> {
  const p = await reconciliationPreview(db, moneyAccountId, asOf, statementBalance);
  const rows: ReportRow[] = [];
  const item = (date: string, text: string, amount: bigint): ReportRow => ({ cells: { item: `${fmtDate(date)}  ${text}`, amount }, indent: 1, style: "muted" });
  rows.push({ cells: { item: "Balance per statement", amount: p.statementBalance }, style: "subtotal" });
  rows.push({ cells: { item: "Add: deposits in transit (in the books, not yet on the statement)", amount: p.outstandingDeposits } });
  p.deposits.forEach((d) => rows.push(item(d.date, d.text, d.amountCents)));
  rows.push({ cells: { item: "Less: outstanding withdrawals / cheques", amount: -p.outstandingWithdrawals } });
  p.withdrawals.forEach((d) => rows.push(item(d.date, d.text, d.amountCents)));
  rows.push({ cells: { item: "Adjusted bank balance", amount: p.adjustedBank }, style: "total" });
  rows.push({ cells: { item: "" } });
  rows.push({ cells: { item: "Balance per books", amount: p.book }, style: "subtotal" });
  rows.push({ cells: { item: "Add/less: statement items not yet in the books", amount: p.adjustedBook - p.book } });
  p.notInBooks.forEach((d) => rows.push(item(d.date, `${d.text}${d.status === "IGNORED" ? " (ignored)" : ""}`, d.amountCents)));
  rows.push({ cells: { item: "Adjusted book balance", amount: p.adjustedBook }, style: "total" });
  rows.push({ cells: { item: p.difference === 0n ? "Difference ✓" : "Difference", amount: p.difference }, style: "total" });
  return {
    title: "Bank reconciliation",
    subtitle: `${p.moneyAccount.name} · as of ${fmtDate(asOf)}${p.moneyAccount.lockedThrough ? ` · locked through ${fmtDate(p.moneyAccount.lockedThrough.toISOString().slice(0, 10))}` : ""}`,
    columns: [
      { key: "item", label: "", kind: "text", width: 60 },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows,
    notes: p.statementBalance === null ? ["No statement balance yet: import a statement with a balance column or enter the balance on the Reconcile tab."] : undefined,
  };
}

/** Card/QR/Grab payouts: expected vs actually received, and the real fee rate. */
export async function channelSettlementsDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const rows = await db.channelSettlement.findMany({
    where: { locationId: { in: scope.ids }, businessDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: { channel: true, location: true },
    orderBy: [{ channel: { name: "asc" } }, { businessDate: "asc" }],
  });
  const out: ReportRow[] = [];
  const pctOf = (fee: bigint | null, gross: bigint) => (fee === null || gross === 0n ? null : Number((fee * 100000n) / gross) / 1000);
  const totals = { gross: 0n, expFee: 0n, expNet: 0n, net: 0n, fee: 0n, settledGross: 0n };
  let channel = "";
  const today = new Date();
  for (const s of rows) {
    if (s.channel.name !== channel) {
      channel = s.channel.name;
      out.push({ cells: { date: channel }, style: "section" });
    }
    const overdue = s.status === "EXPECTED" && s.expectedOn < today;
    out.push({
      cells: {
        date: fmtDate(s.businessDate.toISOString().slice(0, 10)),
        location: s.location.name,
        gross: s.grossCents,
        expFee: s.expectedFeeCents,
        expNet: s.expectedNetCents,
        net: s.actualNetCents,
        fee: s.actualFeeCents,
        rate: pctOf(s.actualFeeCents, s.grossCents),
        status: s.status === "EXPECTED" ? (overdue ? `Overdue (due ${fmtDate(s.expectedOn.toISOString().slice(0, 10))})` : "Expected") : s.status.toLowerCase(),
      },
    });
    totals.gross += s.grossCents;
    totals.expFee += s.expectedFeeCents;
    totals.expNet += s.expectedNetCents;
    if (s.actualNetCents !== null) {
      totals.net += s.actualNetCents;
      totals.fee += s.actualFeeCents ?? 0n;
      totals.settledGross += s.grossCents;
    }
  }
  out.push({ cells: { date: "Total", gross: totals.gross, expFee: totals.expFee, expNet: totals.expNet, net: totals.net, fee: totals.fee, rate: pctOf(totals.fee, totals.settledGross) }, style: "total" });
  return {
    title: "Card, QR and Grab payouts",
    subtitle: `${scope.label} · sales ${fmtRange(from, to)}`,
    columns: [
      { key: "date", label: "Sales date", kind: "text", width: 16 },
      { key: "location", label: "Location", kind: "text", width: 16 },
      { key: "gross", label: "Gross", kind: "money" },
      { key: "expFee", label: "Expected fee", kind: "money" },
      { key: "expNet", label: "Expected payout", kind: "money" },
      { key: "net", label: "Received", kind: "money" },
      { key: "fee", label: "Actual fee", kind: "money" },
      { key: "rate", label: "Fee %", kind: "pct" },
      { key: "status", label: "Status", kind: "text", width: 18 },
    ],
    rows: out,
  };
}

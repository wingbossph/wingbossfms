import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { cr, dr, key, acct, type DraftLine } from "@/domains/ledger/lines";
import { locationMoneyAccount, postEntry, reverseEntry } from "@/domains/ledger/post";
import { getSetting } from "@/domains/admin/settings";
import { cashCount, computeSalesTotals, countDenominations, expectedSettlement, lineGross, linePaxHundredths } from "./calc";
import type { SalesDraftInput } from "./schemas";

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** Active price per product for a location on a date (location list beats the default list). */
export async function priceMap(tx: Tx, locationId: string, ymd: string): Promise<Map<string, bigint>> {
  const date = toDbDate(ymd);
  const lists = await tx.priceList.findMany({
    where: {
      OR: [{ locationId }, { locationId: null }],
      effectiveFrom: { lte: date },
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }],
    },
    include: { items: true },
    orderBy: { effectiveFrom: "desc" },
  });
  // Location-specific lists first, then newest first.
  lists.sort((a, b) => (a.locationId === b.locationId ? 0 : a.locationId ? -1 : 1));
  const prices = new Map<string, bigint>();
  for (const list of lists) for (const item of list.items) if (!prices.has(item.productId)) prices.set(item.productId, item.priceCents);
  return prices;
}

/** Menu item that carries a day's sales entered (or imported) as one total instead of by item. */
export const CONSOLIDATED_PRODUCT = "Consolidated sales";

export async function consolidatedProductId(tx: Tx): Promise<string> {
  const found = await tx.product.findFirst({ where: { name: CONSOLIDATED_PRODUCT }, select: { id: true } });
  if (found) return found.id;
  const revenue = await tx.account.findFirstOrThrow({ where: { systemKey: "REV_UNLIMITED" }, select: { id: true } });
  const p = await tx.product.create({ data: { name: CONSOLIDATED_PRODUCT, type: "OTHER", paxPerUnit: 0, revenueAccountId: revenue.id, sortOrder: 9999 } });
  return p.id;
}

export async function openDraft(tx: Tx, args: { locationId: string; ymd: string; shiftNo: number; userId: string }) {
  const existing = await tx.salesReport.findUnique({
    where: { locationId_businessDate_shiftNo: { locationId: args.locationId, businessDate: toDbDate(args.ymd), shiftNo: args.shiftNo } },
  });
  if (existing) return existing;
  const report = await tx.salesReport.create({
    data: { locationId: args.locationId, businessDate: toDbDate(args.ymd), shiftNo: args.shiftNo, cashierUserId: args.userId },
  });
  await writeAudit(tx, { actorId: args.userId, action: "CREATE", entityType: "SalesReport", entityId: report.id, locationId: args.locationId, after: { businessDate: args.ymd, shiftNo: args.shiftNo } });
  return report;
}

async function loadDraft(tx: Tx, reportId: string) {
  const report = await tx.salesReport.findUniqueOrThrow({ where: { id: reportId } });
  if (report.status !== "DRAFT") throw new UserFacingError("This sales report is already submitted. Request a correction instead.");
  return report;
}

/** Recomputes and stores report totals from its rows. */
export async function refreshTotals(tx: Tx, reportId: string) {
  const r = await tx.salesReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { lines: true, discounts: true, voids: true, payments: true },
  });
  const t = computeSalesTotals({
    lines: r.lines.map((l) => ({ grossCents: l.grossCents, paxHundredths: BigInt(Math.round(Number(l.pax) * 100)) })),
    discounts: r.discounts,
    refunds: r.voids.filter((v) => v.isRefund),
    serviceChargeCents: r.serviceChargeCents,
    payments: r.payments,
  });
  await tx.salesReport.update({
    where: { id: reportId },
    data: {
      grossCents: t.grossCents,
      discountCents: t.discountCents,
      refundCents: t.refundCents,
      voidCents: r.voids.filter((v) => !v.isRefund).reduce((a, v) => a + v.amountCents, 0n),
      netCents: t.netCents,
      paymentsCents: t.paymentsCents,
      pax: (Number(t.paxHundredths) / 100).toFixed(2),
    },
  });
  return t;
}

/** Saves the cashier's manual entries. Imported Loyverse lines are kept as they are. */
export async function saveDraft(tx: Tx, input: SalesDraftInput, actorId: string) {
  const report = await loadDraft(tx, input.reportId);
  const ymd = ymdOf(report.businessDate);
  const [prices, products, discountTypes, channels] = await Promise.all([
    priceMap(tx, report.locationId, ymd),
    tx.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } }),
    tx.discountType.findMany({ where: { id: { in: input.discounts.map((d) => d.discountTypeId) } } }),
    tx.paymentChannel.findMany({
      where: { id: { in: input.payments.map((p) => p.channelId) }, locations: { some: { locationId: report.locationId } } },
    }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const dtById = new Map(discountTypes.map((d) => [d.id, d]));
  if (channels.length !== new Set(input.payments.map((p) => p.channelId)).size) {
    throw new UserFacingError("A payment channel isn't enabled for this location.");
  }

  for (const d of input.discounts) {
    const type = dtById.get(d.discountTypeId);
    if (!type) throw new UserFacingError("Unknown discount type.");
    if (type.requiresIdentity && (!d.customerName || !d.idNumber)) {
      throw new UserFacingError(`${type.name}: enter the customer's name and ID number (BIR requirement).`);
    }
    if (d.amount <= 0n) throw new UserFacingError("Discount amounts must be more than zero.");
  }
  for (const v of input.voids) if (v.amount <= 0n) throw new UserFacingError("Void/refund amounts must be more than zero.");

  await tx.salesLine.deleteMany({ where: { reportId: report.id, source: "MANUAL" } });
  if (input.consolidated) {
    if (input.consolidated.gross < 0n) throw new UserFacingError("Gross sales can't be negative.");
    if (input.consolidated.gross > 0n) {
      await tx.salesLine.create({
        data: {
          reportId: report.id,
          productId: await consolidatedProductId(tx),
          qty: "1",
          pax: input.consolidated.pax,
          unitPriceCents: input.consolidated.gross,
          grossCents: input.consolidated.gross,
          source: "MANUAL",
        },
      });
    }
  }
  for (const l of input.consolidated ? [] : input.lines) {
    const product = productById.get(l.productId);
    if (!product) throw new UserFacingError("Unknown menu item.");
    if (Number(l.qty) === 0) continue;
    const price = prices.get(product.id) ?? 0n;
    await tx.salesLine.create({
      data: {
        reportId: report.id,
        productId: product.id,
        qty: l.qty,
        pax: (Number(linePaxHundredths(l.qty, product.paxPerUnit.toString())) / 100).toFixed(2),
        unitPriceCents: price,
        grossCents: lineGross(l.qty, price),
        source: "MANUAL",
      },
    });
  }

  await tx.salesDiscount.deleteMany({ where: { reportId: report.id } });
  if (input.discounts.length) {
    await tx.salesDiscount.createMany({
      data: input.discounts.map((d) => ({
        reportId: report.id,
        discountTypeId: d.discountTypeId,
        amountCents: d.amount,
        customerName: d.customerName || null,
        idNumber: d.idNumber || null,
        receiptNo: d.receiptNo || null,
        notes: d.notes || null,
      })),
    });
  }
  await tx.salesVoid.deleteMany({ where: { reportId: report.id } });
  if (input.voids.length) {
    await tx.salesVoid.createMany({
      data: input.voids.map((v) => ({ reportId: report.id, amountCents: v.amount, isRefund: v.isRefund, reason: v.reason, receiptNo: v.receiptNo || null })),
    });
  }
  await tx.salesPayment.deleteMany({ where: { reportId: report.id } });
  const merged = new Map<string, { amount: bigint; reference: string }>();
  for (const p of input.payments) {
    const prev = merged.get(p.channelId);
    merged.set(p.channelId, { amount: (prev?.amount ?? 0n) + p.amount, reference: p.reference || prev?.reference || "" });
  }
  for (const [channelId, p] of merged) {
    if (p.amount === 0n) continue;
    await tx.salesPayment.create({ data: { reportId: report.id, channelId, amountCents: p.amount, reference: p.reference || null } });
  }
  await tx.salesReport.update({
    where: { id: report.id },
    data: { serviceChargeCents: input.serviceCharge, mismatchExplanation: input.mismatchExplanation || null },
  });
  const totals = await refreshTotals(tx, report.id);
  await writeAudit(tx, {
    actorId,
    action: "UPDATE",
    entityType: "SalesReport",
    entityId: report.id,
    locationId: report.locationId,
    before: { netCents: report.netCents, paymentsCents: report.paymentsCents },
    after: { netCents: totals.netCents, paymentsCents: totals.paymentsCents },
  });
  return totals;
}

/** Builds the sales journal entry lines (pure apart from lookups passed in). */
export function salesEntryLines(args: {
  locationId: string;
  revenueByAccount: Map<string, bigint>;
  discounts: { contraAccountId: string; amountCents: bigint }[];
  refundCents: bigint;
  serviceChargeCents: bigint;
  serviceChargeToStaff: boolean;
  payments: { glAccountId: string; amountCents: bigint }[];
  differenceCents: bigint;
}): DraftLine[] {
  const L = args.locationId;
  const lines: DraftLine[] = [];
  for (const p of args.payments) lines.push(...dr(acct(p.glAccountId), L, p.amountCents));
  for (const d of args.discounts) lines.push(...dr(acct(d.contraAccountId), L, d.amountCents));
  lines.push(...dr(key("DISC_REFUNDS"), L, args.refundCents));
  for (const [accountId, amount] of args.revenueByAccount) lines.push(...cr(acct(accountId), L, amount));
  lines.push(...cr(key(args.serviceChargeToStaff ? "SERVICE_CHARGE_PAYABLE" : "REV_SERVICE_CHARGE"), L, args.serviceChargeCents));
  // Payments ≠ net sales (explained by the cashier): the difference is a cash over/short.
  lines.push(...cr(key("CASH_OVER_SHORT"), L, args.differenceCents));
  return lines;
}

/** Submits a draft: validates, posts to the ledger, and creates expected settlements. */
export async function submitReport(tx: Tx, reportId: string, actorId: string) {
  await loadDraft(tx, reportId);
  const totals = await refreshTotals(tx, reportId);
  const r = await tx.salesReport.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      lines: { include: { product: true } },
      discounts: { include: { discountType: true } },
      payments: { include: { channel: true } },
      location: true,
    },
  });
  if (r.lines.length === 0 && r.payments.length === 0) throw new UserFacingError("Nothing to submit: add sales or import from Loyverse.");
  if (totals.netCents < 0n) throw new UserFacingError("Net sales can't be negative.");

  if (totals.differenceCents !== 0n) {
    const block = await getSetting(tx, "sales.requirePaymentsMatch", r.locationId);
    if (block) throw new UserFacingError("Payments must add up exactly to net sales.");
    if (!r.mismatchExplanation) {
      throw new UserFacingError("Payments don't add up to net sales. Fix them, or explain the difference before submitting.");
    }
  }

  const drawer = r.payments.some((p) => p.channel.kind === "CASH") ? await locationMoneyAccount(tx, r.locationId, "CASH_DRAWER") : null;
  const moneyAccounts = await tx.moneyAccount.findMany({
    where: { id: { in: r.payments.flatMap((p) => (p.channel.moneyAccountId ? [p.channel.moneyAccountId] : [])) } },
  });
  const maById = new Map(moneyAccounts.map((m) => [m.id, m]));
  const payments = r.payments.map((p) => {
    const ma = p.channel.kind === "CASH" ? drawer! : p.channel.moneyAccountId ? maById.get(p.channel.moneyAccountId) : null;
    if (!ma) throw new UserFacingError(`${p.channel.name} has no money account set. Fix it in Admin → Payments.`);
    return { glAccountId: ma.glAccountId, amountCents: p.amountCents };
  });

  const revenueByAccount = new Map<string, bigint>();
  for (const l of r.lines) revenueByAccount.set(l.product.revenueAccountId, (revenueByAccount.get(l.product.revenueAccountId) ?? 0n) + l.grossCents);

  const ymd = ymdOf(r.businessDate);
  const entryId = await postEntry(tx, {
    date: ymd,
    source: "SALES_REPORT",
    sourceId: r.id,
    memo: `Sales ${r.location.code} ${ymd}${r.shiftNo > 1 ? ` shift ${r.shiftNo}` : ""}`,
    postedById: actorId,
    lines: salesEntryLines({
      locationId: r.locationId,
      revenueByAccount,
      discounts: r.discounts.map((d) => ({ contraAccountId: d.discountType.contraAccountId, amountCents: d.amountCents })),
      refundCents: totals.refundCents,
      serviceChargeCents: totals.serviceChargeCents,
      serviceChargeToStaff: await getSetting(tx, "sales.serviceChargeToStaff", r.locationId),
      payments,
      differenceCents: totals.differenceCents,
    }),
  });

  for (const p of r.payments) {
    if (!p.channel.isDeferred || p.amountCents <= 0n) continue;
    const exp = expectedSettlement(p.amountCents, p.channel);
    const expectedOn = new Date(r.businessDate.getTime() + p.channel.settlementDelayDays * 86_400_000);
    await tx.channelSettlement.create({
      data: {
        salesPaymentId: p.id,
        channelId: p.channelId,
        locationId: r.locationId,
        businessDate: r.businessDate,
        expectedOn,
        grossCents: p.amountCents,
        expectedFeeCents: exp.feeCents,
        expectedWhtCents: exp.whtCents,
        expectedNetCents: exp.netCents,
      },
    });
  }

  await tx.salesReport.update({
    where: { id: r.id },
    data: { status: "POSTED", journalEntryId: entryId, submittedAt: new Date() },
  });
  await writeAudit(tx, {
    actorId,
    action: "SUBMIT",
    entityType: "SalesReport",
    entityId: r.id,
    locationId: r.locationId,
    after: { netCents: totals.netCents, paymentsCents: totals.paymentsCents, pax: totals.paxHundredths },
  });
}

/** Cash sales and cash paid out of this drawer for the report's day. */
export async function drawerActivity(tx: Tx, reportId: string) {
  const r = await tx.salesReport.findUniqueOrThrow({ where: { id: reportId }, include: { payments: { include: { channel: true } } } });
  const drawer = await tx.moneyAccount.findFirst({ where: { locationId: r.locationId, kind: "CASH_DRAWER", isActive: true } });
  const cashSales = r.payments.filter((p) => p.channel.kind === "CASH").reduce((a, p) => a + p.amountCents, 0n);
  let cashExpenses = 0n;
  if (drawer) {
    const paid = await tx.expensePayment.aggregate({
      _sum: { amountCents: true },
      where: {
        moneyAccountId: drawer.id,
        // Expenses linked to this shift; unlinked same-day ones count against shift 1.
        expense: {
          status: "POSTED",
          OR: [{ salesReportId: r.id }, ...(r.shiftNo === 1 ? [{ salesReportId: null, date: r.businessDate }] : [])],
        },
      },
    });
    cashExpenses = paid._sum.amountCents ?? 0n;
  }
  return { report: r, drawer, cashSalesCents: cashSales, cashExpensesCents: cashExpenses };
}

/** Shift close: counts the drawer, moves cash sales to undeposited cash, books over/short. */
export async function closeShift(
  tx: Tx,
  input: { reportId: string; bills: Record<string, number>; coins: bigint; otherCashIn: bigint; otherCashOut: bigint; reason: string },
  actorId: string,
) {
  const { report, drawer, cashSalesCents, cashExpensesCents } = await drawerActivity(tx, input.reportId);
  if (report.status !== "POSTED") throw new UserFacingError("Submit the sales first, then close the shift.");
  if (await tx.cashCount.findUnique({ where: { reportId: report.id } })) throw new UserFacingError("This shift is already closed.");
  if (!drawer) throw new UserFacingError("This location has no cash drawer account.");
  const location = await tx.location.findUniqueOrThrow({ where: { id: report.locationId } });
  const undeposited = await locationMoneyAccount(tx, report.locationId, "UNDEPOSITED_CASH");

  const counted = countDenominations(input.bills, input.coins);
  const float = location.drawerFloatCents;
  const { expectedCents, overShortCents } = cashCount({
    openingFloatCents: float,
    cashSalesCents,
    cashExpensesCents,
    otherCashInCents: input.otherCashIn,
    otherCashOutCents: input.otherCashOut,
    countedCents: counted,
  });
  if (overShortCents !== 0n && input.reason.length < 3) {
    throw new UserFacingError("The count is over or short. Give a reason before closing.");
  }

  const cc = await tx.cashCount.create({
    data: {
      reportId: report.id,
      openingFloatCents: float,
      cashSalesCents,
      cashExpensesCents,
      otherCashInCents: input.otherCashIn,
      otherCashOutCents: input.otherCashOut,
      expectedCents,
      countedCents: counted,
      overShortCents,
      denominations: { ...input.bills, coinsCents: input.coins.toString() },
      reason: input.reason || null,
      countedById: actorId,
    },
  });

  // Drawer keeps the float; the rest of the counted cash waits for deposit.
  const L = report.locationId;
  const lines: DraftLine[] = [
    ...dr(acct(undeposited.glAccountId), L, counted - float),
    ...cr(acct(drawer.glAccountId), L, expectedCents - float),
    ...cr(key("CASH_OVER_SHORT"), L, overShortCents),
  ];
  if (lines.length >= 2) {
    await postEntry(tx, {
      date: ymdOf(report.businessDate),
      source: "CASH_COUNT",
      sourceId: cc.id,
      memo: `Shift close ${location.code} ${ymdOf(report.businessDate)}`,
      postedById: actorId,
      lines,
    });
  }
  await writeAudit(tx, {
    actorId,
    action: "POST",
    entityType: "CashCount",
    entityId: cc.id,
    locationId: L,
    after: { expectedCents, countedCents: counted, overShortCents, reason: input.reason },
  });
  return { expectedCents, countedCents: counted, overShortCents };
}

/**
 * Reopens a submitted report for correction (approved adjustment request):
 * reverses its postings, removes unmatched settlements and the cash count.
 */
export async function reopenReport(tx: Tx, reportId: string, actorId: string, reason: string, todayYmd: string) {
  const r = await tx.salesReport.findUniqueOrThrow({ where: { id: reportId }, include: { cashCount: true, payments: { include: { settlement: true } } } });
  if (r.status !== "POSTED") throw new UserFacingError("Only submitted reports can be reopened.");
  if (r.payments.some((p) => p.settlement && p.settlement.status !== "EXPECTED")) {
    throw new UserFacingError("A card/QR/Grab settlement for this report is already matched to the bank. Unmatch it first.");
  }
  if (r.cashCount) {
    const ccEntry = await tx.journalEntry.findFirst({ where: { source: "CASH_COUNT", sourceId: r.cashCount.id, status: "POSTED" } });
    if (ccEntry) await reverseEntry(tx, ccEntry.id, { postedById: actorId, todayYmd, memo: `Reopen shift close: ${reason}` });
    await tx.cashCount.delete({ where: { id: r.cashCount.id } });
  }
  if (r.journalEntryId) await reverseEntry(tx, r.journalEntryId, { postedById: actorId, todayYmd, memo: `Reopen sales: ${reason}` });
  await tx.channelSettlement.deleteMany({ where: { salesPaymentId: { in: r.payments.map((p) => p.id) } } });
  await tx.salesReport.update({ where: { id: r.id }, data: { status: "DRAFT", journalEntryId: null, submittedAt: null, approvedAt: null, approvedById: null } });
  await writeAudit(tx, { actorId, action: "VOID", entityType: "SalesReport", entityId: r.id, locationId: r.locationId, reason, before: { status: "POSTED", netCents: r.netCents }, after: { status: "DRAFT" } });
}

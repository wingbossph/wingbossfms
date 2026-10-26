import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeShift, openDraft, reopenReport, saveDraft, submitReport } from "@/domains/sales/service";
import { recordMoneyTransfer } from "@/domains/cash/service";
import { postEntry } from "@/domains/ledger/post";
import { cr, dr, key } from "@/domains/ledger/lines";
import { db, fixtures, glBalance, setPrice, systemAccount, trialBalanceDifference, tx, ymd } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;

beforeAll(async () => {
  f = await fixtures();
  await setPrice("Unlimited Wings", 49900n);
  await setPrice("Bottomless iced tea", 9900n);
});
afterAll(() => db.$disconnect());

describe("sales → shift close → deposit (Lanang cashier flow)", () => {
  const date = ymd(3);
  let reportId: string;

  it("saves a draft with a payment split across every channel", async () => {
    const r = await tx((t) => openDraft(t, { locationId: f.lanang.id, ymd: date, shiftNo: 1, userId: f.cashierLanang.id }));
    reportId = r.id;
    // 10 × 499 + 5 × 99 = 5,485.00; SC discount 99.80 → net 5,385.20
    const totals = await tx((t) =>
      saveDraft(
        t,
        {
          reportId,
          lines: [
            { productId: f.product("Unlimited Wings").id, qty: "10" },
            { productId: f.product("Bottomless iced tea").id, qty: "5" },
          ],
          discounts: [{ discountTypeId: f.discount("SC").id, amount: 9980n, customerName: "Juan Dela Cruz", idNumber: "SC-123", receiptNo: "1001", notes: "" }],
          voids: [{ amount: 49900n, isRefund: false, reason: "Ordered by mistake", receiptNo: "" }],
          serviceCharge: 0n,
          payments: [
            { channelId: f.channel("Cash").id, amount: 300000n, reference: "" },
            { channelId: f.channel("Maya Card").id, amount: 100000n, reference: "" },
            { channelId: f.channel("GCash 1").id, amount: 50000n, reference: "" },
            { channelId: f.channel("GCash 2").id, amount: 30000n, reference: "" },
            { channelId: f.channel("Bank transfer (BPI)").id, amount: 20000n, reference: "" },
            { channelId: f.channel("GrabFood").id, amount: 38520n, reference: "" },
          ],
          mismatchExplanation: "",
        },
        f.cashierLanang.id,
      ),
    );
    expect(totals.grossCents).toBe(548500n);
    expect(totals.netCents).toBe(538520n);
    expect(totals.differenceCents).toBe(0n);
    expect(totals.paxHundredths).toBe(1000n);
  });

  it("requires SC/PWD name and ID", async () => {
    await expect(
      tx((t) =>
        saveDraft(
          t,
          {
            reportId,
            lines: [],
            discounts: [{ discountTypeId: f.discount("PWD").id, amount: 1000n, customerName: "", idNumber: "", receiptNo: "", notes: "" }],
            voids: [],
            serviceCharge: 0n,
            payments: [],
            mismatchExplanation: "",
          },
          f.cashierLanang.id,
        ),
      ),
    ).rejects.toThrow(/name and ID/);
  });

  it("posts a balanced entry and creates expected Maya/Grab settlements on submit", async () => {
    await tx((t) => submitReport(t, reportId, f.cashierLanang.id));
    const report = await db.salesReport.findUniqueOrThrow({ where: { id: reportId }, include: { payments: { include: { settlement: true, channel: true } } } });
    expect(report.status).toBe("POSTED");
    expect(await trialBalanceDifference()).toBe(0n);

    const rev = await systemAccount("REV_UNLIMITED");
    expect(await glBalance(rev.id, f.lanang.id)).toBe(-499000n);
    const sc = await systemAccount("DISC_SC_PWD");
    expect(await glBalance(sc.id, f.lanang.id)).toBe(9980n);

    const maya = report.payments.find((p) => p.channel.name === "Maya Card")!;
    expect(maya.settlement?.expectedFeeCents).toBe(2500n); // 2.5% of ₱1,000
    expect(maya.settlement?.expectedNetCents).toBe(97500n);
    const grab = report.payments.find((p) => p.channel.name === "GrabFood")!;
    expect(grab.settlement?.expectedNetCents).toBe(38520n - 11556n); // 30% commission
    expect(report.payments.find((p) => p.channel.name === "Cash")!.settlement).toBeNull();
  });

  it("can't be edited after submit", async () => {
    await expect(
      tx((t) => saveDraft(t, { reportId, lines: [], discounts: [], voids: [], serviceCharge: 0n, payments: [], mismatchExplanation: "" }, f.cashierLanang.id)),
    ).rejects.toThrow(/already submitted/);
  });

  it("closes the shift: float stays, cash sales move to undeposited, shortage is booked", async () => {
    // Float ₱2,000 + cash sales ₱3,000 = ₱5,000 expected; counted ₱4,950 → short ₱50.
    const overShort = await systemAccount("CASH_OVER_SHORT");
    const osBefore = await glBalance(overShort.id, f.lanang.id);
    const res = await tx((t) =>
      closeShift(t, { reportId, bills: { "1000": 4, "500": 1, "200": 2, "100": 0, "50": 1, "20": 0 }, coins: 0n, otherCashIn: 0n, otherCashOut: 0n, reason: "Wrong change given" }, f.cashierLanang.id),
    );
    expect(res.expectedCents).toBe(500000n);
    expect(res.countedCents).toBe(495000n);
    expect(res.overShortCents).toBe(-5000n);
    const undeposited = f.locMoney(f.lanang.id, "UNDEPOSITED_CASH");
    const drawer = f.locMoney(f.lanang.id, "CASH_DRAWER");
    expect(await glBalance(undeposited.glAccountId)).toBe(295000n);
    // Cash sales went into the drawer; the close moved them (expected − float) out again.
    expect(await glBalance(drawer.glAccountId)).toBe(0n);
    expect((await glBalance(overShort.id, f.lanang.id)) - osBefore).toBe(5000n);
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("deposits undeposited cash to BPI", async () => {
    const undeposited = f.locMoney(f.lanang.id, "UNDEPOSITED_CASH");
    const bpiBefore = await glBalance(f.money("BPI Bank").glAccountId, f.lanang.id);
    await tx((t) =>
      recordMoneyTransfer(
        t,
        { type: "CASH_DEPOSIT", date, locationId: f.lanang.id, fromAccountId: undeposited.id, toAccountId: f.money("BPI Bank").id, amountCents: 295000n, feeCents: 0n, reference: "DS-1", notes: "" },
        f.owner.id,
      ),
    );
    expect(await glBalance(undeposited.glAccountId)).toBe(0n);
    expect((await glBalance(f.money("BPI Bank").glAccountId, f.lanang.id)) - bpiBefore).toBe(295000n);
  });

  it("reopening reverses the sales and shift-close postings", async () => {
    await tx((t) => reopenReport(t, reportId, f.owner.id, "Wrong GCash split", ymd(0)));
    const report = await db.salesReport.findUniqueOrThrow({ where: { id: reportId }, include: { cashCount: true } });
    expect(report.status).toBe("DRAFT");
    expect(report.cashCount).toBeNull();
    expect(await db.channelSettlement.count({ where: { salesPayment: { reportId } } })).toBe(0);
    const rev = await systemAccount("REV_UNLIMITED");
    expect(await glBalance(rev.id, f.lanang.id)).toBe(0n);
    expect(await trialBalanceDifference()).toBe(0n);
  });
});

describe("ledger integrity", () => {
  it("rejects an unbalanced entry in code", async () => {
    await expect(
      tx((t) =>
        postEntry(t, { date: ymd(0), source: "MANUAL", memo: "bad", postedById: null, lines: [...dr(key("BANK_CHARGES"), f.lanang.id, 100n), ...cr(key("OWNER_CAPITAL"), f.lanang.id, 90n)] }),
      ),
    ).rejects.toThrow(/not balanced/);
  });

  it("the database itself rejects an unbalanced entry", async () => {
    const period = await db.accountingPeriod.findFirstOrThrow();
    const account = await systemAccount("BANK_CHARGES");
    await expect(
      db.journalEntry.create({
        data: {
          date: period.startsOn,
          periodId: period.id,
          source: "MANUAL",
          memo: "raw unbalanced",
          lines: { create: [{ accountId: account.id, locationId: f.lanang.id, debitCents: 100n, creditCents: 0n, date: period.startsOn }] },
        },
      }),
    ).rejects.toThrow();
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("blocks edits to posted lines and postings into a closed period", async () => {
    const line = await db.journalLine.findFirstOrThrow();
    await expect(db.journalLine.update({ where: { id: line.id }, data: { debitCents: line.debitCents + 1n } })).rejects.toThrow();

    await db.accountingPeriod.upsert({
      where: { year_month: { year: 2020, month: 1 } },
      create: { year: 2020, month: 1, startsOn: new Date("2020-01-01"), endsOn: new Date("2020-01-31"), status: "CLOSED" },
      update: { status: "CLOSED" },
    });
    await expect(
      tx((t) =>
        postEntry(t, { date: "2020-01-15", source: "MANUAL", memo: "late", postedById: null, lines: [...dr(key("BANK_CHARGES"), f.lanang.id, 100n), ...cr(key("OWNER_CAPITAL"), f.lanang.id, 100n)] }),
      ),
    ).rejects.toThrow(/closed/);
  });
});

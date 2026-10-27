import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveExpense, payBill, runRecurring, saveExpense, submitExpense, voidExpense } from "@/domains/expenses/service";
import { closeShift, openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { loadAccess } from "@/server/auth/access";
import { getBalance } from "@/domains/inventory/stock";
import { db, fixtures, glBalance, systemAccount, trialBalanceDifference, tx, ymd } from "./helpers";
import type { ExpenseInput } from "@/domains/expenses/schemas";

let f: Awaited<ReturnType<typeof fixtures>>;
const actor = async (userId: string) => {
  const { access } = await loadAccess(db, userId);
  return { id: userId, can: (p: string, l: string) => access.can(p, l) };
};
const account = (code: string) => db.account.findUniqueOrThrow({ where: { code } });
const base = (over: Partial<ExpenseInput>): ExpenseInput => ({
  locationId: f.lanang.id,
  date: ymd(5),
  supplierId: "",
  newSupplierName: "",
  terms: "PAID_NOW",
  paidFromMoneyAccountId: "",
  dueDate: "",
  receiptNo: "",
  isVatInvoice: false,
  vat: 0n,
  notes: "",
  lines: [],
  attachmentIds: [],
  submit: false,
  ...over,
});

beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("expenses & payables", () => {
  it("cashier submits a petty-cash expense; it waits for an admin", async () => {
    const cashier = await actor(f.cashierLanang.id);
    const cleaning = await account("6310");
    const petty = f.locMoney(f.lanang.id, "PETTY_CASH");
    const { id } = await tx((t) =>
      saveExpense(t, base({ paidFromMoneyAccountId: petty.id, receiptNo: "OR-55", lines: [{ accountId: cleaning.id, itemId: "", qty: "", unit: "BASE", description: "Bleach", amount: 30000n }] }), cashier),
    );
    expect(await tx((t) => submitExpense(t, id, cashier))).toBe("SUBMITTED");
    await expect(tx((t) => approveExpense(t, id, cashier))).rejects.toThrow(/can't approve/);

    const admin = await actor((await db.user.findFirstOrThrow({ where: { email: "admin@wingboss.ph" } })).id);
    await tx((t) => approveExpense(t, id, admin));
    expect(await glBalance(cleaning.id, f.lanang.id)).toBe(30000n);
    expect(await glBalance(petty.glAccountId)).toBe(-30000n);
  });

  it("amounts of ₱5,000+ need the Owner; an approver's correction is audited before/after", async () => {
    const admin = await actor((await db.user.findFirstOrThrow({ where: { email: "admin@wingboss.ph" } })).id);
    const owner = await actor(f.owner.id);
    const rent = await account("6110");
    const input = base({ terms: "ON_ACCOUNT", newSupplierName: "Lanang Landlord Inc.", lines: [{ accountId: rent.id, itemId: "", qty: "", unit: "BASE", description: "Rent", amount: 2500000n }] });
    const { id } = await tx((t) => saveExpense(t, input, admin));
    expect(await tx((t) => submitExpense(t, id, admin))).toBe("SUBMITTED");
    await expect(tx((t) => approveExpense(t, id, admin))).rejects.toThrow(/Owner/);

    // The owner corrects the amount before approving.
    await tx((t) => saveExpense(t, { ...input, id, lines: [{ ...input.lines[0], amount: 2400000n }] }, owner));
    const log = await db.auditLog.findFirstOrThrow({ where: { entityType: "Expense", entityId: id, action: "UPDATE" }, orderBy: { at: "desc" } });
    expect(log.userId).toBe(f.owner.id);
    expect((log.before as { totalCents: string }).totalCents).toBe("2500000");
    expect((log.after as { totalCents: string }).totalCents).toBe("2400000");

    await tx((t) => approveExpense(t, id, owner));
    const ap = await systemAccount("ACCOUNTS_PAYABLE");
    expect(await glBalance(ap.id, f.lanang.id)).toBe(-2400000n);

    // Partial payment from BPI.
    await tx((t) => payBill(t, { expenseId: id, date: ymd(2), moneyAccountId: f.money("BPI Bank").id, amountCents: 1000000n, reference: "CHK-1" }, f.owner.id));
    expect(await glBalance(ap.id, f.lanang.id)).toBe(-1400000n);
    const e = await db.expense.findUniqueOrThrow({ where: { id } });
    expect(e.paidCents).toBe(1000000n);
    await expect(tx((t) => payBill(t, { expenseId: id, date: ymd(1), moneyAccountId: f.money("BPI Bank").id, amountCents: 1500000n, reference: "" }, f.owner.id))).rejects.toThrow(/balance due/);
  });

  it("buying an inventory item brings stock in at cost (2 boxes = 20 kg)", async () => {
    const owner = await actor(f.owner.id);
    const wings = await db.item.findFirstOrThrow({ where: { sku: "PRO-WING" } });
    const { id } = await tx((t) =>
      saveExpense(t, base({ terms: "ON_ACCOUNT", newSupplierName: "Davao Poultry", lines: [{ accountId: "", itemId: wings.id, qty: "2", unit: "PURCHASE", description: "", amount: 520000n }] }), owner),
    );
    expect(await tx((t) => submitExpense(t, id, owner))).toBe("POSTED");
    const bal = await tx((t) => getBalance(t, wings.id, f.lanang.id));
    expect(bal.qty4).toBe(200000n); // 20.0000 kg
    expect(bal.valueCents).toBe(520000n);
    expect(await glBalance(wings.inventoryAccountId, f.lanang.id)).toBe(520000n);

    // Voiding reverses the bill and takes the stock back out.
    await tx((t) => voidExpense(t, id, f.owner.id, "Wrong supplier invoice", ymd(0)));
    expect(await glBalance(wings.inventoryAccountId, f.lanang.id)).toBe(0n);
    expect((await tx((t) => getBalance(t, wings.id, f.lanang.id))).qty4).toBe(0n);
  });

  it("refuses drawer expenses after that day's shift is closed", async () => {
    const owner = await actor(f.owner.id);
    const date = ymd(9);
    const r = await tx((t) => openDraft(t, { locationId: f.lanang.id, ymd: date, shiftNo: 1, userId: f.owner.id }));
    await tx((t) =>
      saveDraft(t, { reportId: r.id, lines: [], discounts: [], voids: [], serviceCharge: 0n, payments: [{ channelId: f.channel("GCash 1").id, amount: 10000n, reference: "" }], mismatchExplanation: "No items: test" }, f.owner.id),
    );
    await tx((t) => submitReport(t, r.id, f.owner.id));
    await tx((t) => closeShift(t, { reportId: r.id, bills: { "1000": 2 }, coins: 0n, otherCashIn: 0n, otherCashOut: 0n, reason: "" }, f.owner.id));
    const drawer = f.locMoney(f.lanang.id, "CASH_DRAWER");
    const ice = await account("6330");
    const { id } = await tx((t) => saveExpense(t, base({ date, paidFromMoneyAccountId: drawer.id, lines: [{ accountId: ice.id, itemId: "", qty: "", unit: "BASE", description: "Ice", amount: 5000n }] }), owner));
    await expect(tx((t) => submitExpense(t, id, owner))).rejects.toThrow(/already closed/);
  });

  it("creates recurring drafts for every missed period", async () => {
    const rent = await account("6110");
    await db.recurringExpense.create({
      data: { name: "Matina rent", locationId: f.matina.id, accountId: rent.id, amountCents: 3000000n, terms: "ON_ACCOUNT", frequency: "MONTHLY", dayOfMonth: 5, nextRunOn: new Date(`${ymd(70)}T00:00:00Z`) },
    });
    const created = await tx((t) => runRecurring(t, ymd(0), f.owner.id));
    expect(created).toBeGreaterThanOrEqual(2);
    const drafts = await db.expense.count({ where: { notes: "Recurring: Matina rent", status: "DRAFT" } });
    expect(drafts).toBe(created);
    expect(await tx((t) => runRecurring(t, ymd(0), f.owner.id))).toBe(0);
  });

  it("the trial balance still balances", async () => {
    expect(await trialBalanceDifference()).toBe(0n);
  });
});

describe("expense categories", () => {
  it("include accounts without a system key (rent, electricity)", async () => {
    const { expenseCategories } = await import("@/domains/expenses/queries");
    const names = (await expenseCategories()).flatMap((g) => g.accounts.map((a) => a.name));
    expect(names).toEqual(expect.arrayContaining(["Rental", "Electricity", "Cleaning supplies"]));
    expect(names).not.toContain("Accumulated depreciation");
    expect(names).not.toContain("Cash drawers");
  });
});

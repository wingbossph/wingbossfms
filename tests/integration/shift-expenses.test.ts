import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drawerActivity, openDraft } from "@/domains/sales/service";
import { saveExpense, submitExpense } from "@/domains/expenses/service";
import { expenseSchema } from "@/domains/expenses/schemas";
import { ensureExpenseSources, resolveExpenseSource } from "@/domains/expenses/sources";
import { db, fixtures, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("expenses entered on the sales screen", () => {
  it("are normal posted expenses linked to the shift, and count against the drawer", async () => {
    const report = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: "2026-09-20", shiftNo: 1, userId: f.owner.id }));
    const drawer = f.locMoney(f.matina.id, "CASH_DRAWER");
    const ice = await db.account.findFirstOrThrow({ where: { group: { section: "OPERATING_EXPENSE" }, isPostable: true } });
    const actor = { id: f.owner.id, can: () => true };
    const id = await tx(async (t) => {
      const saved = await saveExpense(
        t,
        expenseSchema.parse({ locationId: f.matina.id, date: "2026-09-20", terms: "PAID_NOW", paidFromMoneyAccountId: drawer.id, lines: [{ accountId: ice.id, description: "Ice", amount: "150" }] }),
        actor,
      );
      await t.expense.update({ where: { id: saved.id }, data: { salesReportId: report.id } });
      await submitExpense(t, saved.id, actor);
      return saved.id;
    });
    const e = await db.expense.findUniqueOrThrow({ where: { id } });
    expect(e.status).toBe("POSTED");
    expect(e.totalCents).toBe(15000n);
    const activity = await tx((t) => drawerActivity(t, report.id));
    expect(activity.cashExpensesCents).toBe(15000n);
  });

  it("resolves paid-by sources: drawer and petty cash per branch, shared accounts created once", async () => {
    const drawer = f.locMoney(f.matina.id, "CASH_DRAWER");
    expect(await tx((t) => resolveExpenseSource(t, "DRAWER", f.matina.id))).toBe(drawer.id);
    const globe = await tx((t) => resolveExpenseSource(t, "GCASH_GLOBE", f.matina.id));
    const acct = await db.moneyAccount.findUniqueOrThrow({ where: { id: globe } });
    expect(acct).toMatchObject({ name: "Personal GCash Globe", kind: "EWALLET", isPersonal: true, locationId: null });
    expect(await tx((t) => ensureExpenseSources(t))).toBe(0);
    expect(await db.moneyAccount.count({ where: { name: { in: ["Personal GCash TNT", "BPI Checking", "BPI Savings", "Eastwest", "Others"] }, locationId: null } })).toBe(5);
    expect(await tx((t) => resolveExpenseSource(t, "EASTWEST", f.lanang.id))).toBe(await tx((t) => resolveExpenseSource(t, "EASTWEST", f.matina.id)));
  });

  it("keeps the shift link for expenses paid from other sources", async () => {
    const report = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: "2026-09-21", shiftNo: 1, userId: f.owner.id }));
    const ice = await db.account.findFirstOrThrow({ where: { group: { section: "OPERATING_EXPENSE" }, isPostable: true } });
    const actor = { id: f.owner.id, can: () => true };
    const id = await tx(async (t) => {
      const bpi = await resolveExpenseSource(t, "BPI_CHECKING", f.matina.id);
      const saved = await saveExpense(t, expenseSchema.parse({ locationId: f.matina.id, date: "2026-09-21", terms: "PAID_NOW", paidFromMoneyAccountId: bpi, lines: [{ accountId: ice.id, description: "Supplies", amount: "500" }] }), actor);
      await t.expense.update({ where: { id: saved.id }, data: { salesReportId: report.id } });
      await submitExpense(t, saved.id, actor);
      return saved.id;
    });
    expect((await db.expense.findUniqueOrThrow({ where: { id } })).salesReportId).toBe(report.id);
    expect((await tx((t) => drawerActivity(t, report.id))).cashExpensesCents).toBe(0n);
  });
});

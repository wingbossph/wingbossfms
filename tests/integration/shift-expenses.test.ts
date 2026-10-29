import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drawerActivity, openDraft } from "@/domains/sales/service";
import { saveExpense, submitExpense } from "@/domains/expenses/service";
import { expenseSchema } from "@/domains/expenses/schemas";
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
});

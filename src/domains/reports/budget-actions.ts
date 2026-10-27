"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { requireActor } from "@/server/auth/session";
import { pesoField } from "@/domains/admin/schemas";

const schema = z.object({
  locationId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  rows: z.array(z.object({ accountId: z.string().min(1), months: z.array(z.string().trim().max(20)).length(12) })).max(400),
});

/** Replaces the budget of one location and year. Blank or zero cells are removed. */
export async function saveBudgetAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    if (!user.isOwner) throw new UserFacingError("Only the Owner sets budgets.");
    const input = schema.parse(raw);
    const cells = input.rows.flatMap((r) => r.months.map((m, i) => ({ accountId: r.accountId, month: i + 1, amountCents: m ? pesoField.parse(m) : 0n }))).filter((c) => c.amountCents !== 0n);
    await db.$transaction(async (tx) => {
      const before = await tx.budgetLine.aggregate({ where: { locationId: input.locationId, year: input.year }, _sum: { amountCents: true }, _count: true });
      await tx.budgetLine.deleteMany({ where: { locationId: input.locationId, year: input.year } });
      if (cells.length) await tx.budgetLine.createMany({ data: cells.map((c) => ({ ...c, locationId: input.locationId, year: input.year })) });
      await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "Budget", entityId: `${input.locationId}:${input.year}`, locationId: input.locationId, before: { lines: before._count, totalCents: before._sum.amountCents ?? 0n }, after: { lines: cells.length, totalCents: cells.reduce((a, c) => a + c.amountCents, 0n) } });
    });
    revalidatePath("/reports/budget");
    return { ok: true, message: "Budget saved." };
  });
}

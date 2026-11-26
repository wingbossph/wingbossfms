import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";

// A day's Fund: cash brought into the drawer to pay expenses, taken from the
// cash on hand of earlier sales days. Each part records its amount and the
// day or days it came from, so the days needn't be consecutive. It adds to
// the day's cash on hand; it isn't a sale and isn't posted to the ledger.

export type FundPart = { from: string; to: string; amountCents: bigint };

/** Replaces the day's fund with these parts (none removes it). */
export async function saveFund(tx: Tx, input: { locationId: string; date: string; parts: FundPart[] }, actorId: string) {
  for (const p of input.parts) {
    if (p.amountCents <= 0n) throw new UserFacingError("Each fund amount must be more than zero.");
    if (p.from > p.to) throw new UserFacingError("A fund's covered dates end before they start.");
    if (p.to > input.date) throw new UserFacingError("A fund can only come from this day or earlier.");
  }
  const where = { locationId_businessDate: { locationId: input.locationId, businessDate: toDbDate(input.date) } };
  const before = await tx.salesFund.findUnique({ where, include: { sources: true } });
  if (before) await tx.salesFund.delete({ where });
  if (input.parts.length) {
    await tx.salesFund.create({
      data: {
        locationId: input.locationId,
        businessDate: toDbDate(input.date),
        updatedById: actorId,
        sources: { create: input.parts.map((p) => ({ fromDate: toDbDate(p.from), toDate: toDbDate(p.to), amountCents: p.amountCents })) },
      },
    });
  }
  const total = (parts: { amountCents: bigint }[]) => parts.reduce((a, p) => a + p.amountCents, 0n);
  await writeAudit(tx, {
    actorId,
    action: "UPDATE",
    entityType: "SalesFund",
    entityId: `${input.locationId}:${input.date}`,
    locationId: input.locationId,
    before: { totalCents: before ? total(before.sources) : 0n },
    after: { totalCents: total(input.parts), parts: input.parts.map((p) => ({ ...p, amountCents: p.amountCents.toString() })) },
  });
}

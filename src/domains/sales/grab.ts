import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";

// Grab sales are tracked beside the sales reports, never in net sales, cash
// on hand or the ledger: the gross per day, and the payouts Grab remits
// after its fees, each with the sales days it covers.

type Reader = Pick<Tx, "grabDailySale" | "grabRemittance">;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function setGrabDailySale(tx: Tx, input: { locationId: string; date: string; grossCents: bigint }, actorId: string) {
  if (input.grossCents < 0n) throw new UserFacingError("Grab sales can't be negative.");
  const where = { locationId_businessDate: { locationId: input.locationId, businessDate: toDbDate(input.date) } };
  const before = await tx.grabDailySale.findUnique({ where });
  if (input.grossCents === 0n) {
    if (before) await tx.grabDailySale.delete({ where });
  } else {
    await tx.grabDailySale.upsert({
      where,
      create: { locationId: input.locationId, businessDate: toDbDate(input.date), grossCents: input.grossCents, updatedById: actorId },
      update: { grossCents: input.grossCents, updatedById: actorId },
    });
  }
  await writeAudit(tx, { actorId, action: "UPDATE", entityType: "GrabDailySale", entityId: `${input.locationId}:${input.date}`, locationId: input.locationId, before: { grossCents: before?.grossCents ?? 0n }, after: { grossCents: input.grossCents } });
}

export async function addGrabRemittance(
  tx: Tx,
  input: { locationId: string; remittedOn: string; periodFrom: string; periodTo: string; amountCents: bigint; reference: string; notes: string },
  actorId: string,
) {
  if (input.amountCents <= 0n) throw new UserFacingError("Enter the amount Grab remitted.");
  if (input.periodFrom > input.periodTo) throw new UserFacingError("The covered period ends before it starts.");
  const r = await tx.grabRemittance.create({
    data: {
      locationId: input.locationId,
      remittedOn: toDbDate(input.remittedOn),
      periodFrom: toDbDate(input.periodFrom),
      periodTo: toDbDate(input.periodTo),
      amountCents: input.amountCents,
      reference: input.reference || null,
      notes: input.notes || null,
      createdById: actorId,
    },
  });
  await writeAudit(tx, { actorId, action: "CREATE", entityType: "GrabRemittance", entityId: r.id, locationId: input.locationId, after: { ...input, amountCents: input.amountCents } });
  return r;
}

export async function deleteGrabRemittance(tx: Tx, id: string, actorId: string) {
  const r = await tx.grabRemittance.delete({ where: { id } });
  await writeAudit(tx, { actorId, action: "DELETE", entityType: "GrabRemittance", entityId: id, locationId: r.locationId, before: { amountCents: r.amountCents, periodFrom: ymd(r.periodFrom), periodTo: ymd(r.periodTo) } });
}

/** Grab gross sales by day, and remittances received in the range with the gross of the days each one covers. */
export async function grabSummary(db: Reader, locationIds: string[], from: string, to: string) {
  const days = await db.grabDailySale.findMany({ where: { locationId: { in: locationIds }, businessDate: { gte: toDbDate(from), lte: toDbDate(to) } } });
  const remittances = await db.grabRemittance.findMany({
    where: { locationId: { in: locationIds }, remittedOn: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: { location: true },
    orderBy: [{ remittedOn: "desc" }, { createdAt: "desc" }],
  });
  const rows = [];
  for (const r of remittances) {
    const covered = await db.grabDailySale.aggregate({ where: { locationId: r.locationId, businessDate: { gte: r.periodFrom, lte: r.periodTo } }, _sum: { grossCents: true } });
    const gross = covered._sum.grossCents ?? 0n;
    rows.push({
      id: r.id,
      locationId: r.locationId,
      location: r.location.name,
      remittedOn: ymd(r.remittedOn),
      periodFrom: ymd(r.periodFrom),
      periodTo: ymd(r.periodTo),
      amountCents: r.amountCents,
      coveredGrossCents: gross,
      // What Grab kept (commission and other deductions), when the covered days have Grab sales entered.
      deductedCents: gross > 0n ? gross - r.amountCents : null,
      reference: r.reference,
      notes: r.notes,
    });
  }
  return {
    grossCents: days.reduce((a, d) => a + d.grossCents, 0n),
    days: days.length,
    remittedCents: rows.reduce((a, r) => a + r.amountCents, 0n),
    remittances: rows,
  };
}

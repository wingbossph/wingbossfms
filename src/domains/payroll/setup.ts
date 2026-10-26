// Seeds government tables and holidays (seed and first use). No server-only import.

import type { Tx } from "@/server/db";
import { DEFAULT_HOLIDAYS, DEFAULT_TABLES } from "./tables";

const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export async function ensurePayrollSetup(tx: Pick<Tx, "contributionTable" | "holiday" | "location">) {
  if ((await tx.contributionTable.count()) === 0) {
    for (const t of DEFAULT_TABLES) {
      await tx.contributionTable.create({
        data: {
          kind: t.kind,
          name: t.name,
          effectiveFrom: d(t.effectiveFrom),
          basis: t.basis,
          brackets: {
            create: t.brackets.map((b) => ({
              minCents: b.minCents,
              maxCents: b.maxCents,
              excessOverCents: b.excessOverCents ?? 0n,
              eeFixedCents: b.eeFixedCents ?? 0n,
              eeRateBp: b.eeRateBp ?? 0,
              erFixedCents: b.erFixedCents ?? 0n,
              erRateBp: b.erRateBp ?? 0,
              ecFixedCents: b.ecFixedCents ?? 0n,
              meta: b.meta ? (b.meta as object) : undefined,
            })),
          },
        },
      });
    }
  }
  if ((await tx.holiday.count()) === 0) {
    const davao = await tx.location.findMany({ where: { address: { contains: "Davao", mode: "insensitive" } }, select: { id: true } });
    for (const h of DEFAULT_HOLIDAYS) {
      if (h.davaoOnly) for (const l of davao) await tx.holiday.create({ data: { date: d(h.date), name: h.name, type: h.type, locationId: l.id } });
      else await tx.holiday.create({ data: { date: d(h.date), name: h.name, type: h.type } });
    }
  }
}

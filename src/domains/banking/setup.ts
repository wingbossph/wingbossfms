// Shared by the seed and the app (no server-only import).

import type { Tx } from "@/server/db";
import { SYSTEM_FORMATS } from "./formats";

/** Creates the built-in statement formats if missing (seed and first use). */
export async function ensureStatementFormats(tx: Pick<Tx, "statementFormat" | "moneyAccount">) {
  for (const f of SYSTEM_FORMATS) {
    await tx.statementFormat.upsert({ where: { name: f.name }, create: { name: f.name, institution: f.institution, isSystem: true, config: f.config }, update: {} });
  }
  const formats = await tx.statementFormat.findMany({ where: { isSystem: true } });
  const accounts = await tx.moneyAccount.findMany({ where: { defaultStatementFormatId: null, institution: { not: null } } });
  for (const a of accounts) {
    const f = formats.find((x) => x.institution === a.institution);
    if (f) await tx.moneyAccount.update({ where: { id: a.id }, data: { defaultStatementFormatId: f.id } });
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, requireActor, type CurrentUser } from "@/server/auth/session";
import { pesoField } from "@/domains/admin/schemas";
import { manilaDateString } from "@/lib/dates";
import { readStatementTable } from "./file";
import { guessConfig, headerOf, parseStatement, type StatementConfig } from "./formats";
import {
  clearBeforeStatements,
  completeReconciliation,
  createFromStatementLine,
  deleteStatement,
  ensureStatementFormats,
  importStatement,
  manualMatch,
  runAutoMatch,
  setStatementLineStatus,
  settleChannelPayout,
  undoReconciliation,
  unmatch,
} from "./service";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1);

async function accountFor(user: CurrentUser, moneyAccountId: string, permission = "banking:reconcile") {
  const ma = await db.moneyAccount.findUniqueOrThrow({ where: { id: moneyAccountId } });
  if (ma.locationId) assertCan(user, permission, ma.locationId);
  else assertCanAnywhere(user, permission);
  return ma;
}

const refresh = (moneyAccountId?: string) => {
  revalidatePath("/banking");
  if (moneyAccountId) revalidatePath(`/banking/${moneyAccountId}`);
};

// ── Import ──────────────────────────────────────────────────────────────────

const configSchema: z.ZodType<StatementConfig> = z.object({
  skipRows: z.number().int().min(0).max(50),
  dateOrder: z.enum(["MDY", "DMY", "YMD"]),
  columns: z.object({
    date: z.string().min(1),
    description: z.string().min(1),
    reference: z.string().optional(),
    debit: z.string().optional(),
    credit: z.string().optional(),
    amount: z.string().optional(),
    balance: z.string().optional(),
  }),
  sign: z.enum(["inflowPositive", "inflowNegative"]),
});

const fileSchema = z.object({
  moneyAccountId: id,
  fileName: z.string().min(1).max(200),
  /** base64 file content */
  content: z.string().min(1).max(14_000_000),
  formatId: z.string().optional(),
  config: configSchema.optional(),
});

const clean = (c: StatementConfig): StatementConfig => ({
  ...c,
  columns: Object.fromEntries(Object.entries(c.columns).filter(([, v]) => v)) as StatementConfig["columns"],
});

async function loadFile(raw: unknown) {
  const user = await requireActor();
  const input = fileSchema.parse(raw);
  await accountFor(user, input.moneyAccountId);
  const table = await readStatementTable(input.fileName, Buffer.from(input.content, "base64"));
  let config = input.config ? clean(input.config) : undefined;
  if (!config && input.formatId) {
    const f = await db.statementFormat.findUnique({ where: { id: input.formatId } });
    config = f?.config as StatementConfig | undefined;
  }
  config ??= guessConfig(headerOf(table, { skipRows: 0 }));
  return { user, input, table, config };
}

export type StatementPreview = {
  headers: string[];
  config: StatementConfig;
  errors: string[];
  count: number;
  inflowCents: string;
  outflowCents: string;
  from?: string;
  to?: string;
  sample: { date: string; description: string; reference: string | null; amountCents: string; balanceCents: string | null }[];
};

export async function previewStatementAction(raw: unknown): Promise<ActionState & { preview?: StatementPreview }> {
  let preview: StatementPreview | undefined;
  const res = await handleAction(async () => {
    const { table, config } = await loadFile(raw);
    const { lines, errors } = parseStatement(table, config);
    preview = {
      headers: headerOf(table, config),
      config,
      errors: errors.slice(0, 15),
      count: lines.length,
      inflowCents: lines.reduce((a, l) => a + (l.amountCents > 0n ? l.amountCents : 0n), 0n).toString(),
      outflowCents: lines.reduce((a, l) => a + (l.amountCents < 0n ? -l.amountCents : 0n), 0n).toString(),
      from: lines[0]?.txnDate,
      to: lines[lines.length - 1]?.txnDate,
      sample: lines.slice(0, 12).map((l) => ({ date: l.txnDate, description: l.description, reference: l.reference, amountCents: l.amountCents.toString(), balanceCents: l.balanceCents?.toString() ?? null })),
    };
  });
  return { ...res, ok: !!res?.ok, preview };
}

export async function importStatementAction(raw: unknown): Promise<ActionState & { statementId?: string }> {
  let statementId: string | undefined;
  const res = await handleAction(async () => {
    const extra = z.object({ saveFormatAs: z.string().trim().max(80).optional().default(""), autoMatch: z.boolean().default(true) }).parse(raw);
    const { user, input, table, config } = await loadFile(raw);
    const { lines, errors } = parseStatement(table, config);
    if (errors.length) throw new UserFacingError(`Fix the mapping first: ${errors[0]}`);
    const out = await db.$transaction(
      async (tx) => {
        await ensureStatementFormats(tx);
        const imp = await importStatement(tx, { moneyAccountId: input.moneyAccountId, formatId: input.formatId, config, saveFormatAs: extra.saveFormatAs || undefined, lines }, { id: user.id });
        const auto = extra.autoMatch ? await runAutoMatch(tx, input.moneyAccountId, { id: user.id }) : null;
        return { ...imp, auto };
      },
      { timeout: 60_000 },
    );
    statementId = out.statementId;
    refresh(input.moneyAccountId);
    const parts = [`Imported ${out.imported} line(s)`];
    if (out.duplicates) parts.push(`${out.duplicates} already imported`);
    if (out.lockedSkipped) parts.push(`${out.lockedSkipped} in a reconciled period skipped`);
    if (out.auto) parts.push(`auto-matched ${out.auto.matched} of ${out.auto.open}`);
    return { ok: true, message: `${parts.join(", ")}.` };
  });
  return { ...res, ok: !!res?.ok, statementId };
}

export async function deleteStatementAction(statementId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const st = await db.bankStatement.findUniqueOrThrow({ where: { id: statementId } });
    await accountFor(user, st.moneyAccountId);
    await db.$transaction((tx) => deleteStatement(tx, statementId, { id: user.id }));
    refresh(st.moneyAccountId);
    return { ok: true, message: "Statement removed." };
  });
}

// ── Matching ────────────────────────────────────────────────────────────────

export async function autoMatchAction(moneyAccountId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    await accountFor(user, moneyAccountId);
    const r = await db.$transaction((tx) => runAutoMatch(tx, moneyAccountId, { id: user.id }), { timeout: 60_000 });
    refresh(moneyAccountId);
    return { ok: true, message: r.open ? `Matched ${r.matched} of ${r.open} open line(s)${r.settlements ? `, including ${r.settlements} card/Grab payout(s)` : ""}.` : "Nothing left to match." };
  });
}

const matchSchema = z.object({ moneyAccountId: id, statementLineIds: z.array(id).max(500), journalLineIds: z.array(id).max(500) });

export async function manualMatchAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = matchSchema.parse(raw);
    await accountFor(user, input.moneyAccountId);
    if (input.statementLineIds.length === 0) {
      await db.$transaction((tx) => clearBeforeStatements(tx, { moneyAccountId: input.moneyAccountId, journalLineIds: input.journalLineIds }, { id: user.id }));
      refresh(input.moneyAccountId);
      return { ok: true, message: "Marked as cleared." };
    }
    await db.$transaction((tx) => manualMatch(tx, input, { id: user.id }));
    refresh(input.moneyAccountId);
    return { ok: true, message: "Matched." };
  });
}

export async function unmatchAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ moneyAccountId: id, matchId: id }).parse(raw);
    await accountFor(user, input.moneyAccountId);
    await db.$transaction((tx) => unmatch(tx, input.matchId, { id: user.id }, manilaDateString()));
    refresh(input.moneyAccountId);
    return { ok: true, message: "Unmatched." };
  });
}

export async function settlePayoutAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ moneyAccountId: id, statementLineId: id, settlementIds: z.array(id).min(1).max(200) }).parse(raw);
    await accountFor(user, input.moneyAccountId);
    await db.$transaction((tx) => settleChannelPayout(tx, { statementLineId: input.statementLineId, settlementIds: input.settlementIds, method: "MANUAL" }, { id: user.id }));
    refresh(input.moneyAccountId);
    revalidatePath("/banking/settlements");
    return { ok: true, message: "Payout matched and the actual fee posted." };
  });
}

export async function createFromLineAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ moneyAccountId: id, statementLineId: id, accountId: id, locationId: id, memo: z.string().trim().max(200).optional().default("") }).parse(raw);
    await accountFor(user, input.moneyAccountId);
    assertCan(user, "banking:reconcile", input.locationId);
    await db.$transaction((tx) => createFromStatementLine(tx, input, { id: user.id }));
    refresh(input.moneyAccountId);
    return { ok: true, message: "Booked and matched." };
  });
}

export async function setLineStatusAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ moneyAccountId: id, statementLineId: id, status: z.enum(["UNMATCHED", "IGNORED", "INVESTIGATE"]), note: z.string().trim().max(200).optional() }).parse(raw);
    await accountFor(user, input.moneyAccountId);
    await db.$transaction((tx) => setStatementLineStatus(tx, input, { id: user.id }));
    refresh(input.moneyAccountId);
    return { ok: true };
  });
}

// ── Reconciliation ──────────────────────────────────────────────────────────

export async function completeReconciliationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ moneyAccountId: id, asOf: ymd, statementBalance: z.string().trim().min(1) }).parse(raw);
    const balance = pesoField.parse(input.statementBalance.replace(/^-/, ""));
    const signed = input.statementBalance.trim().startsWith("-") ? -balance : balance;
    if (input.asOf > manilaDateString()) throw new UserFacingError("The date can't be in the future.");
    const ma = await accountFor(user, input.moneyAccountId);
    await db.$transaction((tx) => completeReconciliation(tx, { moneyAccountId: input.moneyAccountId, asOf: input.asOf, statementBalanceCents: signed }, { id: user.id }));
    refresh(input.moneyAccountId);
    return { ok: true, message: `${ma.name} reconciled and locked through ${input.asOf}.` };
  });
}

export async function undoReconciliationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ reconciliationId: id }).parse(raw);
    const rec = await db.reconciliation.findUniqueOrThrow({ where: { id: input.reconciliationId } });
    await accountFor(user, rec.moneyAccountId, "ledger:period:close");
    await db.$transaction((tx) => undoReconciliation(tx, input.reconciliationId, { id: user.id }));
    refresh(rec.moneyAccountId);
    return { ok: true, message: "Reconciliation undone; the period is unlocked." };
  });
}

import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { applyRateBp } from "@/lib/money";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key, type DraftLine } from "@/domains/ledger/lines";
import { postEntry } from "@/domains/ledger/post";
import { getSetting } from "@/domains/admin/settings";
import { moveStock } from "./stock";
import { fromMicro, fromQty4, toQty4, unitCostOf, valueAt } from "./wac";

type Actor = { id: string };

// ── Production ──────────────────────────────────────────────────────────────

/**
 * Records a batch: ingredients leave commissary stock at weighted-average
 * cost, the output comes in at ingredients + (optional) overhead per unit.
 */
export async function recordProduction(
  tx: Tx,
  input: { locationId: string; recipeId: string; date: string; outputQty: string; inputs?: { itemId: string; qty: string }[]; lotCode?: string; expiresOn?: string },
  actor: Actor,
) {
  const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: input.recipeId }, include: { lines: { include: { item: true } }, outputItem: true } });
  if (recipe.kind !== "PRODUCTION" || !recipe.outputItem || !recipe.outputQty) throw new UserFacingError("Choose a production recipe.");
  const location = await tx.location.findUniqueOrThrow({ where: { id: input.locationId } });
  const out4 = toQty4(input.outputQty);
  if (out4 <= 0n) throw new UserFacingError("Output quantity must be more than zero.");
  const scale = (q: string) => (toQty4(q) * out4) / toQty4(recipe.outputQty!.toString());

  const batch = await tx.productionBatch.create({
    data: {
      locationId: input.locationId,
      recipeId: recipe.id,
      outputItemId: recipe.outputItem.id,
      batchDate: toDbDate(input.date),
      outputQty: fromQty4(out4),
      ingredientCents: 0n,
      totalCostCents: 0n,
      unitCost: "0",
      lotCode: input.lotCode || null,
      expiresOn: input.expiresOn ? toDbDate(input.expiresOn) : null,
      producedById: actor.id,
    },
  });
  const L = input.locationId;
  const lines: DraftLine[] = [];
  let ingredients = 0n;
  for (const rl of recipe.lines) {
    const standard4 = scale(rl.qty.toString());
    const override = input.inputs?.find((i) => i.itemId === rl.itemId);
    const actual4 = override ? toQty4(override.qty) : standard4;
    let value = 0n;
    let unit = 0n;
    if (actual4 > 0n) {
      const res = await moveStock(tx, { itemId: rl.itemId, locationId: L, date: input.date, type: "PRODUCTION_CONSUME", qty4: actual4, sourceType: "ProductionBatch", sourceId: batch.id, createdById: actor.id });
      value = res.valueCents;
      unit = res.unitMicro;
      lines.push(...cr(acct(rl.item.inventoryAccountId), L, value));
    }
    ingredients += value;
    await tx.productionBatchInput.create({
      data: { batchId: batch.id, itemId: rl.itemId, standardQty: fromQty4(standard4), actualQty: fromQty4(actual4), unitCost: fromMicro(unit), valueCents: value },
    });
  }
  const overhead = valueAt(out4, recipe.overheadPerUnitCents * 1_000_000n);
  const total = ingredients + overhead;
  await moveStock(tx, { itemId: recipe.outputItem.id, locationId: L, date: input.date, type: "PRODUCTION_OUTPUT", qty4: out4, valueCents: total, sourceType: "ProductionBatch", sourceId: batch.id, createdById: actor.id });
  lines.push(...dr(acct(recipe.outputItem.inventoryAccountId), L, total), ...cr(key("OVERHEAD_ABSORBED"), L, overhead));
  const entryId = lines.length >= 2
    ? await postEntry(tx, { date: input.date, source: "PRODUCTION", sourceId: batch.id, memo: `Production ${location.code}: ${fromQty4(out4)} ${recipe.outputItem.baseUnit} ${recipe.outputItem.name}`, postedById: actor.id, lines })
    : null;
  await tx.productionBatch.update({
    where: { id: batch.id },
    data: { ingredientCents: ingredients, overheadCents: overhead, totalCostCents: total, unitCost: fromMicro(unitCostOf(total, out4)), status: "POSTED", journalEntryId: entryId },
  });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "ProductionBatch", entityId: batch.id, locationId: L, after: { recipe: recipe.name, outputQty: fromQty4(out4), totalCostCents: total } });
  return batch.id;
}

// ── Transfers ───────────────────────────────────────────────────────────────

export async function saveTransfer(tx: Tx, input: { id?: string; fromLocationId: string; toLocationId: string; notes: string; lines: { itemId: string; qty: string }[] }, actor: Actor) {
  if (input.fromLocationId === input.toLocationId) throw new UserFacingError("Choose a different receiving location.");
  const lines = input.lines.filter((l) => l.qty && toQty4(l.qty) > 0n);
  if (!lines.length) throw new UserFacingError("Add at least one item with a quantity.");
  const data = {
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    notes: input.notes || null,
    lines: { create: lines.map((l) => ({ itemId: l.itemId, qtySent: fromQty4(toQty4(l.qty)), unitCost: "0", unitPrice: "0", valueCents: 0n })) },
  };
  if (input.id) {
    const t = await tx.transfer.findUniqueOrThrow({ where: { id: input.id } });
    if (t.status !== "DRAFT") throw new UserFacingError("Only draft transfers can be edited.");
    await tx.transferLine.deleteMany({ where: { transferId: t.id } });
    await tx.transfer.update({ where: { id: t.id }, data });
    return t.id;
  }
  const t = await tx.transfer.create({ data: { ...data, createdById: actor.id } });
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "Transfer", entityId: t.id, locationId: input.fromLocationId, after: { to: input.toLocationId, lines } });
  return t.id;
}

/**
 * Dispatch: stock leaves the sender at weighted-average cost and becomes an
 * inter-location receivable (in transit) until the receiver confirms.
 */
export async function dispatchTransfer(tx: Tx, transferId: string, date: string, actor: Actor) {
  const t = await tx.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: { include: { item: true } }, fromLocation: true, toLocation: true } });
  if (t.status !== "DRAFT") throw new UserFacingError("This transfer was already dispatched.");
  const markupOn = await getSetting(tx, "transfer.markupEnabled");
  const markupBp = markupOn ? await getSetting(tx, "transfer.markupBp") : 0;
  const L = t.fromLocationId;
  const lines: DraftLine[] = [];
  let cost = 0n;
  let value = 0n;
  for (const l of t.lines) {
    const qty4 = toQty4(l.qtySent.toString());
    const res = await moveStock(tx, { itemId: l.itemId, locationId: L, date, type: "TRANSFER_OUT", qty4, sourceType: "Transfer", sourceId: t.id, createdById: actor.id });
    const lineValue = res.valueCents + applyRateBp(res.valueCents, markupBp);
    await tx.transferLine.update({
      where: { id: l.id },
      data: { unitCost: fromMicro(res.unitMicro), unitPrice: fromMicro(unitCostOf(lineValue, qty4)), valueCents: lineValue, costCents: res.valueCents },
    });
    lines.push(...cr(acct(l.item.inventoryAccountId), L, res.valueCents));
    cost += res.valueCents;
    value += lineValue;
  }
  lines.push(...dr(key("INTERCO_RECEIVABLE"), L, cost, { counterpartyLocationId: t.toLocationId }));
  // Items with no recorded cost yet move at ₱0: nothing to post.
  const entryId = lines.length < 2 ? null : await postEntry(tx, {
    date,
    source: "TRANSFER_DISPATCH",
    sourceId: t.id,
    memo: `Transfer #${t.number} ${t.fromLocation.code} → ${t.toLocation.code} dispatched`,
    postedById: actor.id,
    lines,
  });
  await tx.transfer.update({
    where: { id: t.id },
    data: { status: "DISPATCHED", costCents: cost, valueCents: value, markupBp, dispatchedAt: new Date(`${date}T12:00:00+08:00`), dispatchedById: actor.id, dispatchJournalEntryId: entryId },
  });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "Transfer", entityId: t.id, locationId: L, after: { status: "DISPATCHED", costCents: cost } });
}

/**
 * Receive: the receiver confirms quantities. Received stock enters the
 * receiver's inventory at cost (+ inter-location payable); any markup is
 * booked as eliminated income/charges; shortages are a transfer loss for
 * the sender (default) or the receiver.
 */
export async function receiveTransfer(tx: Tx, transferId: string, date: string, received: { lineId: string; qty: string; reason?: string }[], actor: Actor) {
  const t = await tx.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: { include: { item: true } }, fromLocation: true, toLocation: true } });
  if (t.status !== "DISPATCHED") throw new UserFacingError("Only dispatched transfers can be received.");
  const chargeTo = await getSetting(tx, "transfer.shortageChargedTo");
  const S = t.fromLocationId;
  const R = t.toLocationId;
  const lines: DraftLine[] = [];
  let discrepancy = false;
  let receivedCost = 0n;
  let markupTotal = 0n;
  let shortage = 0n;

  for (const l of t.lines) {
    const got = received.find((r) => r.lineId === l.id);
    const sent4 = toQty4(l.qtySent.toString());
    const recv4 = got ? toQty4(got.qty) : sent4;
    if (recv4 < 0n) throw new UserFacingError("Received quantities can't be negative.");
    if (recv4 > sent4) throw new UserFacingError(`More ${l.item.name} received than was sent. Record the extra as a separate transfer.`);
    if (recv4 !== sent4) {
      discrepancy = true;
      if (!got?.reason || got.reason.trim().length < 3) throw new UserFacingError(`Explain the difference for ${l.item.name}.`);
    }
    const lineCost = l.costCents;
    const recvCost = recv4 === sent4 ? lineCost : (lineCost * recv4) / sent4;
    const recvValue = recv4 === sent4 ? l.valueCents : (l.valueCents * recv4) / sent4;
    const markup = recvValue - recvCost;
    if (recv4 > 0n) {
      await moveStock(tx, { itemId: l.itemId, locationId: R, date, type: "TRANSFER_IN", qty4: recv4, valueCents: recvCost, sourceType: "Transfer", sourceId: t.id, createdById: actor.id });
      lines.push(...dr(acct(l.item.inventoryAccountId), R, recvCost));
    }
    receivedCost += recvCost;
    markupTotal += markup;
    shortage += lineCost - recvCost;
    await tx.transferLine.update({ where: { id: l.id }, data: { qtyReceived: fromQty4(recv4), discrepancyReason: got?.reason || null } });
  }
  // Receiver owes the sender for what arrived (at value incl. markup).
  lines.push(...dr(key("INTERCO_MARKUP_CHARGES"), R, markupTotal), ...cr(key("INTERCO_PAYABLE"), R, receivedCost + markupTotal, { counterpartyLocationId: S }));
  lines.push(...dr(key("INTERCO_RECEIVABLE"), S, markupTotal, { counterpartyLocationId: R }), ...cr(key("INTERCO_MARKUP_INCOME"), S, markupTotal));
  if (shortage > 0n) {
    if (chargeTo === "RECEIVER") {
      lines.push(...dr(key("COGS_TRANSFER_LOSS"), R, shortage), ...cr(key("INTERCO_PAYABLE"), R, shortage, { counterpartyLocationId: S }));
    } else {
      lines.push(...dr(key("COGS_TRANSFER_LOSS"), S, shortage), ...cr(key("INTERCO_RECEIVABLE"), S, shortage, { counterpartyLocationId: R }));
    }
  }
  const entryId = lines.length < 2 ? null : await postEntry(tx, {
    date,
    source: "TRANSFER_RECEIVE",
    sourceId: t.id,
    memo: `Transfer #${t.number} ${t.fromLocation.code} → ${t.toLocation.code} received${discrepancy ? " (with discrepancy)" : ""}`,
    postedById: actor.id,
    lines,
  });
  await tx.transfer.update({
    where: { id: t.id },
    data: { status: discrepancy ? "RECEIVED_WITH_DISCREPANCY" : "RECEIVED", receivedAt: new Date(`${date}T12:00:00+08:00`), receivedById: actor.id, receiveJournalEntryId: entryId },
  });
  await writeAudit(tx, { actorId: actor.id, action: "APPROVE", entityType: "Transfer", entityId: t.id, locationId: R, after: { status: discrepancy ? "RECEIVED_WITH_DISCREPANCY" : "RECEIVED", receivedCost, shortage } });
}

export async function cancelTransfer(tx: Tx, transferId: string, actor: Actor) {
  const t = await tx.transfer.findUniqueOrThrow({ where: { id: transferId } });
  if (t.status !== "DRAFT") throw new UserFacingError("Only drafts can be cancelled. A dispatched transfer must be received (enter 0 for items that didn't arrive).");
  await tx.transfer.update({ where: { id: t.id }, data: { status: "CANCELLED" } });
  await writeAudit(tx, { actorId: actor.id, action: "VOID", entityType: "Transfer", entityId: t.id, locationId: t.fromLocationId });
}

/** The receiving location settles what it owes the sender (moves money between locations' books). */
export async function settleInterco(tx: Tx, input: { date: string; payerLocationId: string; payeeLocationId: string; amountCents: bigint; moneyAccountId: string; notes: string }, actor: Actor) {
  if (input.amountCents <= 0n) throw new UserFacingError("Amount must be more than zero.");
  if (input.payerLocationId === input.payeeLocationId) throw new UserFacingError("Choose two different locations.");
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  const s = await tx.intercoSettlement.create({
    data: { date: toDbDate(input.date), payerLocationId: input.payerLocationId, payeeLocationId: input.payeeLocationId, amountCents: input.amountCents, moneyAccountId: ma.id, notes: input.notes || null, createdById: actor.id },
  });
  const P = input.payerLocationId;
  const Q = input.payeeLocationId;
  const entryId = await postEntry(tx, {
    date: input.date,
    source: "INTERCO_SETTLEMENT",
    sourceId: s.id,
    memo: `Inter-location settlement via ${ma.name}`,
    postedById: actor.id,
    lines: [
      ...dr(key("INTERCO_PAYABLE"), P, input.amountCents, { counterpartyLocationId: Q }),
      ...cr(acct(ma.glAccountId), P, input.amountCents),
      ...dr(acct(ma.glAccountId), Q, input.amountCents),
      ...cr(key("INTERCO_RECEIVABLE"), Q, input.amountCents, { counterpartyLocationId: P }),
    ],
  });
  await tx.intercoSettlement.update({ where: { id: s.id }, data: { journalEntryId: entryId } });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "IntercoSettlement", entityId: s.id, locationId: P, after: input });
}

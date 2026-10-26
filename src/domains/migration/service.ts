import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { postAdjustment } from "@/domains/inventory/documents";
import { postOpeningBalances } from "@/domains/ledger/service";
import { accountTypeForGroup } from "@/domains/ledger/coa-template";
import { approveExpense, saveExpense, submitExpense } from "@/domains/expenses/service";
import { submitReport } from "@/domains/sales/service";
import { saveEmployee } from "@/domains/payroll/service";
import { getSetting } from "@/domains/admin/settings";
import type { ImportKind, ParsedRow, RowError } from "./kinds";

type Actor = { id: string; can: (permission: string, locationId: string) => boolean };
type V = ParsedRow["values"];
const str = (v: V[string]) => (v === null || v === undefined ? "" : String(v));
const cents = (v: V[string]) => (typeof v === "bigint" ? v : 0n);
const low = (s: string) => s.trim().toLowerCase();

export type ImportOutcome = { created: number; updated: number; errors: RowError[] };

/** Thrown to roll a dry run back after it ran every write. */
class DryRun extends Error {
  constructor(public outcome: ImportOutcome) {
    super("dry run");
  }
}

/**
 * Validates every row against the database, then writes them all in the
 * caller's transaction. With `dryRun`, the writes run and are rolled back,
 * so the check catches everything a real import would hit.
 */
export async function runImport(db: { $transaction: <T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }) => Promise<T> }, kind: ImportKind, rows: ParsedRow[], actor: Actor, opts: { dryRun: boolean }): Promise<ImportOutcome> {
  try {
    return await db.$transaction(
      async (tx) => {
        const out = await IMPORTERS[kind](tx, rows, actor);
        if (out.errors.length) throw new DryRun(out);
        if (opts.dryRun) throw new DryRun(out);
        return out;
      },
      { timeout: 120_000 },
    );
  } catch (e) {
    if (e instanceof DryRun) return e.outcome;
    if (e instanceof UserFacingError) return { created: 0, updated: 0, errors: [{ row: 0, message: e.message }] };
    throw e;
  }
}

async function lookups(tx: Tx) {
  const [locations, accounts, moneyAccounts, items, groups] = await Promise.all([
    tx.location.findMany(),
    tx.account.findMany({ include: { group: true } }),
    tx.moneyAccount.findMany(),
    tx.item.findMany({ include: { category: true } }),
    tx.accountGroup.findMany(),
  ]);
  return {
    location: (s: string) => locations.find((l) => low(l.code) === low(s) || low(l.name) === low(s) || low(l.name).replace(/^wingboss\s+/, "") === low(s)),
    account: (s: string) => accounts.find((a) => a.code === s.trim()) ?? accounts.find((a) => low(a.name) === low(s)),
    moneyAccount: (s: string) => moneyAccounts.find((m) => low(m.name) === low(s)),
    moneyAccounts,
    item: (s: string) => items.find((i) => (i.sku && low(i.sku) === low(s)) || low(i.name) === low(s)),
    group: (s: string) => groups.find((g) => low(g.code) === low(s) || low(g.name) === low(s)),
    accounts,
    items,
  };
}

const IMPORTERS: Record<ImportKind, (tx: Tx, rows: ParsedRow[], actor: Actor) => Promise<ImportOutcome>> = {
  async ITEMS(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    const branches = (await tx.location.findMany({ where: { type: "BRANCH", isActive: true } })).map((l) => l.id);
    let created = 0,
      updated = 0;
    for (const { rowNo, values: v } of rows) {
      const freq = (str(v.countFrequency) || "weekly").toUpperCase();
      if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) {
        errors.push({ row: rowNo, message: "Count must be daily, weekly or monthly" });
        continue;
      }
      const locIds: string[] = [];
      for (const code of str(v.stockedAt).split(/[,;/]+/).map((x) => x.trim()).filter(Boolean)) {
        const loc = L.location(code);
        if (!loc) errors.push({ row: rowNo, message: `No location "${code}"` });
        else locIds.push(loc.id);
      }
      let category = await tx.itemCategory.findFirst({ where: { name: { equals: str(v.category), mode: "insensitive" } } });
      const sample = category ? L.items.find((i) => i.categoryId === category!.id) : undefined;
      const inv = v.inventoryAccount ? L.account(str(v.inventoryAccount)) : sample ? { id: sample.inventoryAccountId } : undefined;
      const use = v.consumptionAccount ? L.account(str(v.consumptionAccount)) : sample ? { id: sample.consumptionAccountId } : undefined;
      if (!inv || !use) {
        errors.push({ row: rowNo, message: v.inventoryAccount || v.consumptionAccount ? "Unknown account code" : `New category "${str(v.category)}": give the inventory and usage account codes` });
        continue;
      }
      if (errors.some((e) => e.row === rowNo)) continue;
      category ??= await tx.itemCategory.create({ data: { name: str(v.category) } });
      const data = {
        name: str(v.name),
        categoryId: category.id,
        costClass: category.defaultCostClass,
        baseUnit: str(v.baseUnit),
        purchaseUnit: str(v.purchaseUnit) || null,
        purchaseToBase: str(v.purchaseToBase) || "1",
        countFrequency: freq as "DAILY" | "WEEKLY" | "MONTHLY",
        inventoryAccountId: inv.id,
        consumptionAccountId: use.id,
      };
      const existing = L.item(str(v.sku) || str(v.name));
      const item = existing ? await tx.item.update({ where: { id: existing.id }, data }) : await tx.item.create({ data: { ...data, sku: str(v.sku) || null } });
      if (existing) updated++;
      else created++;
      for (const locationId of locIds.length ? locIds : existing ? [] : branches) {
        await tx.itemLocationSetting.upsert({ where: { itemId_locationId: { itemId: item.id, locationId } }, create: { itemId: item.id, locationId }, update: { isStocked: true } });
      }
    }
    if (!errors.length) await writeAudit(tx, { actorId: actor.id, action: "IMPORT", entityType: "Item", entityId: "import", after: { created, updated } });
    return { created, updated, errors };
  },

  async OPENING_STOCK(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    const groups = new Map<string, { locationId: string; date: string; lines: { itemId: string; qty: string; direction: "IN"; unitCost: string }[] }>();
    for (const { rowNo, values: v } of rows) {
      const loc = L.location(str(v.location));
      const item = L.item(str(v.item));
      if (!loc) errors.push({ row: rowNo, message: `No location "${str(v.location)}"` });
      if (!item) errors.push({ row: rowNo, message: `No item "${str(v.item)}"` });
      if (Number(str(v.qty)) <= 0) errors.push({ row: rowNo, message: "Quantity must be more than zero" });
      if (cents(v.unitCost) < 0n) errors.push({ row: rowNo, message: "Cost can't be negative" });
      if (!loc || !item) continue;
      const k = `${loc.id}|${str(v.date)}`;
      const g = groups.get(k) ?? { locationId: loc.id, date: str(v.date), lines: [] };
      g.lines.push({ itemId: item.id, qty: str(v.qty), direction: "IN", unitCost: (Number(cents(v.unitCost)) / 100).toFixed(2) });
      groups.set(k, g);
    }
    if (errors.length) return { created: 0, updated: 0, errors };
    for (const g of groups.values()) await postAdjustment(tx, { ...g, type: "OPENING", reason: "Opening stock (import)" }, { id: actor.id });
    return { created: rows.length, updated: 0, errors };
  },

  async ACCOUNTS(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    let created = 0,
      updated = 0;
    for (const { rowNo, values: v } of rows) {
      const group = L.group(str(v.group));
      if (!group) {
        errors.push({ row: rowNo, message: `No account group "${str(v.group)}"` });
        continue;
      }
      const parent = v.parent ? L.accounts.find((a) => a.code === str(v.parent)) : null;
      if (v.parent && !parent) {
        errors.push({ row: rowNo, message: `No parent account ${str(v.parent)}` });
        continue;
      }
      const existing = L.accounts.find((a) => a.code === str(v.code));
      if (existing) {
        if (existing.groupId !== group.id) errors.push({ row: rowNo, message: `Account ${existing.code} already exists in ${existing.group.name}` });
        else if (existing.name !== str(v.name)) {
          await tx.account.update({ where: { id: existing.id }, data: { name: str(v.name) } });
          updated++;
        }
        continue;
      }
      const sample = L.accounts.find((a) => a.groupId === group.id && a.isPostable);
      let type;
      try {
        type = sample?.type ?? accountTypeForGroup(group.code);
      } catch {
        type = "EXPENSE" as const;
      }
      const a = await tx.account.create({ data: { code: str(v.code), name: str(v.name), type, groupId: group.id, parentId: parent?.id ?? null } });
      L.accounts.push({ ...a, group });
      created++;
    }
    if (!errors.length) await writeAudit(tx, { actorId: actor.id, action: "IMPORT", entityType: "Account", entityId: "import", after: { created, updated } });
    return { created, updated, errors };
  },

  async OPENING_BALANCES(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    const byDate = new Map<string, { accountId: string; locationId: string; amountCents: bigint }[]>();
    for (const { rowNo, values: v } of rows) {
      const loc = L.location(str(v.location));
      const ma = L.moneyAccount(str(v.account));
      const acc = ma ? { id: ma.glAccountId } : L.account(str(v.account));
      if (!loc) errors.push({ row: rowNo, message: `No location "${str(v.location)}"` });
      if (!acc) errors.push({ row: rowNo, message: `No account or money account "${str(v.account)}"` });
      if (!loc || !acc) continue;
      const list = byDate.get(str(v.date)) ?? [];
      list.push({ accountId: acc.id, locationId: loc.id, amountCents: cents(v.amount) });
      byDate.set(str(v.date), list);
    }
    if (errors.length) return { created: 0, updated: 0, errors };
    for (const [date, lines] of byDate) await postOpeningBalances(tx, { date, lines }, actor);
    return { created: rows.length, updated: 0, errors };
  },

  async EMPLOYEES(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    let created = 0,
      updated = 0;
    for (const { rowNo, values: v } of rows) {
      const loc = L.location(str(v.location));
      const rt = low(str(v.rateType));
      const rateType = /^(d|day|daily)/.test(rt) ? "DAILY" : /^(m|month)/.test(rt) ? "MONTHLY" : null;
      if (!loc) errors.push({ row: rowNo, message: `No location "${str(v.location)}"` });
      if (!rateType) errors.push({ row: rowNo, message: "Paid per must be day or month" });
      if (cents(v.rate) <= 0n) errors.push({ row: rowNo, message: "Rate must be more than zero" });
      if (!loc || !rateType || cents(v.rate) <= 0n) continue;
      const existing = v.code ? await tx.employee.findUnique({ where: { code: str(v.code) } }) : null;
      const input = {
        code: str(v.code) || undefined,
        firstName: str(v.firstName),
        lastName: str(v.lastName),
        position: str(v.position),
        status: "ACTIVE" as const,
        startDate: str(v.startDate),
        sssNo: str(v.sssNo),
        philhealthNo: str(v.philhealthNo),
        pagibigNo: str(v.pagibigNo),
        tin: str(v.tin),
        isMinimumWageEarner: v.minimumWage === null || v.minimumWage === undefined ? true : !!v.minimumWage,
      };
      if (existing) {
        await saveEmployee(tx, { ...input, id: existing.id }, actor);
        updated++;
      } else {
        await saveEmployee(tx, { ...input, homeLocationId: loc.id, rateType, rateCents: cents(v.rate) }, actor);
        created++;
      }
    }
    return { created, updated, errors };
  },

  async SALES_HISTORY(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    const [products, channels, links] = await Promise.all([tx.product.findMany(), tx.paymentChannel.findMany(), tx.paymentChannelLocation.findMany()]);
    const discountType = await tx.discountType.findUnique({ where: { code: await getSetting(tx, "loyverse.defaultDiscountCode") } });
    let fallback = products.find((p) => p.name === "Historical sales (imported)");
    type Day = { locationId: string; date: string; lines: Map<string, { qty: number; pax: number; gross: bigint }>; discount: bigint; payments: Map<string, bigint> };
    const days = new Map<string, Day>();
    for (const { rowNo, values: v } of rows) {
      const loc = L.location(str(v.location));
      if (!loc) {
        errors.push({ row: rowNo, message: `No location "${str(v.location)}"` });
        continue;
      }
      const product = v.product ? products.find((p) => low(p.name) === low(str(v.product))) : null;
      if (v.product && !product) {
        errors.push({ row: rowNo, message: `No product "${str(v.product)}" (add it in Menu & prices, or leave blank)` });
        continue;
      }
      const channelName = str(v.channel) || "Cash";
      const channel = channels.find((c) => low(c.name) === low(channelName));
      if (!channel) {
        errors.push({ row: rowNo, message: `No payment channel "${channelName}"` });
        continue;
      }
      if (!links.some((x) => x.channelId === channel.id && x.locationId === loc.id)) {
        errors.push({ row: rowNo, message: `${channel.name} isn't enabled at ${loc.name}` });
        continue;
      }
      const k = `${loc.id}|${str(v.date)}`;
      const d: Day = days.get(k) ?? { locationId: loc.id, date: str(v.date), lines: new Map(), discount: 0n, payments: new Map() };
      const gross = cents(v.gross);
      const disc = cents(v.discount);
      if (gross > 0n || v.qty || v.pax) {
        const pk = product?.id ?? "__fallback";
        const line = d.lines.get(pk) ?? { qty: 0, pax: 0, gross: 0n };
        line.qty += Number(str(v.qty) || (v.pax ? str(v.pax) : "1"));
        line.pax += Number(str(v.pax) || "0");
        line.gross += gross;
        d.lines.set(pk, line);
      }
      d.discount += disc;
      const pay = v.payment === null || v.payment === undefined ? gross - disc : cents(v.payment);
      if (pay !== 0n) d.payments.set(channel.id, (d.payments.get(channel.id) ?? 0n) + pay);
      days.set(k, d);
    }
    for (const d of days.values()) {
      const exists = await tx.salesReport.findFirst({ where: { locationId: d.locationId, businessDate: new Date(`${d.date}T00:00:00Z`) } });
      if (exists) errors.push({ row: 0, message: `${L.location(d.locationId)?.name ?? ""} ${d.date} already has sales in the system` });
      if (d.discount > 0n && !discountType) errors.push({ row: 0, message: "Set the default discount type (Payments & settings) before importing discounts" });
    }
    if (errors.length) return { created: 0, updated: 0, errors };
    if ([...days.values()].some((d) => d.lines.has("__fallback")) && !fallback) {
      const rev = await tx.account.findUniqueOrThrow({ where: { systemKey: "REV_UNLIMITED" } });
      fallback = await tx.product.create({ data: { name: "Historical sales (imported)", type: "OTHER", revenueAccountId: rev.id, isActive: false, sortOrder: 999 } });
    }
    for (const d of days.values()) {
      const report = await tx.salesReport.create({
        data: {
          locationId: d.locationId,
          businessDate: new Date(`${d.date}T00:00:00Z`),
          shiftNo: 1,
          cashierUserId: actor.id,
          mismatchExplanation: "Imported from the old sales sheet",
          lines: {
            create: [...d.lines.entries()].map(([pid, l]) => ({ productId: pid === "__fallback" ? fallback!.id : pid, qty: String(l.qty), pax: String(l.pax), unitPriceCents: l.qty ? BigInt(Math.round(Number(l.gross) / l.qty)) : l.gross, grossCents: l.gross })),
          },
          discounts: d.discount > 0n ? { create: [{ discountTypeId: discountType!.id, amountCents: d.discount, notes: "Imported total" }] } : undefined,
          payments: { create: [...d.payments.entries()].map(([channelId, amountCents]) => ({ channelId, amountCents })) },
        },
      });
      await submitReport(tx, report.id, actor.id);
    }
    await writeAudit(tx, { actorId: actor.id, action: "IMPORT", entityType: "SalesReport", entityId: "import", after: { days: days.size, rows: rows.length } });
    return { created: days.size, updated: 0, errors };
  },

  async EXPENSES_HISTORY(tx, rows, actor) {
    const L = await lookups(tx);
    const errors: RowError[] = [];
    const suppliers = await tx.supplier.findMany();
    const plan: { rowNo: number; input: Parameters<typeof saveExpense>[1] }[] = [];
    for (const { rowNo, values: v } of rows) {
      const loc = L.location(str(v.location));
      const acc = L.account(str(v.category));
      const paid = v.paidFrom ? L.moneyAccount(str(v.paidFrom)) : L.moneyAccounts.find((m) => m.locationId === loc?.id && m.kind === "PETTY_CASH") ?? L.moneyAccounts.find((m) => m.kind === "BANK");
      if (!loc) errors.push({ row: rowNo, message: `No location "${str(v.location)}"` });
      if (!acc) errors.push({ row: rowNo, message: `No category or account "${str(v.category)}"` });
      else if (!["COGS", "LABOR", "OPERATING_EXPENSE", "OTHER_INCOME_EXPENSE"].includes(acc.group.section) && acc.type !== "ASSET") errors.push({ row: rowNo, message: `${acc.name} isn't an expense account` });
      if (!paid) errors.push({ row: rowNo, message: `No money account "${str(v.paidFrom)}"` });
      if (cents(v.amount) <= 0n) errors.push({ row: rowNo, message: "Amount must be more than zero" });
      if (!loc || !acc || !paid || cents(v.amount) <= 0n) continue;
      const supplier = v.supplier ? suppliers.find((s) => low(s.name) === low(str(v.supplier))) : undefined;
      plan.push({
        rowNo,
        input: {
          locationId: loc.id,
          date: str(v.date),
          supplierId: supplier?.id ?? "",
          newSupplierName: supplier ? "" : str(v.supplier),
          terms: "PAID_NOW",
          paidFromMoneyAccountId: paid.id,
          dueDate: "",
          receiptNo: str(v.receiptNo),
          isVatInvoice: false,
          vat: undefined,
          notes: "Imported from the old expense sheet",
          lines: [{ accountId: acc.id, itemId: "", qty: "", unit: "BASE", description: str(v.description), amount: cents(v.amount) }],
          attachmentIds: [],
          submit: false,
        },
      });
    }
    if (errors.length) return { created: 0, updated: 0, errors };
    for (const p of plan) {
      const { id } = await saveExpense(tx, p.input, actor);
      if (p.input.newSupplierName) suppliers.push(...(await tx.supplier.findMany({ where: { name: p.input.newSupplierName } })));
      await submitExpense(tx, id, actor);
      const e = await tx.expense.findUniqueOrThrow({ where: { id } });
      if (e.status === "SUBMITTED") await approveExpense(tx, id, actor);
    }
    return { created: plan.length, updated: 0, errors };
  },
};


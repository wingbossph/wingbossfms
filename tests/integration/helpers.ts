import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** Runs fn in a transaction (like the server actions do). */
export function tx<T>(fn: (t: Tx) => Promise<T>) {
  return db.$transaction(fn, { timeout: 60_000 });
}

export async function fixtures() {
  const [locations, users, channels, moneyAccounts, products, discountTypes] = await Promise.all([
    db.location.findMany(),
    db.user.findMany(),
    db.paymentChannel.findMany(),
    db.moneyAccount.findMany(),
    db.product.findMany(),
    db.discountType.findMany(),
  ]);
  const loc = (code: string) => locations.find((l) => l.code === code)!;
  const user = (name: string) => users.find((u) => u.name === name)!;
  return {
    matina: loc("MAT"),
    lanang: loc("LAN"),
    commissary: loc("COM"),
    office: loc("HO"),
    owner: users.find((u) => u.isOwner)!,
    cashierLanang: user("Lito Lanang"),
    commissaryStaff: user("Ben Commissary"),
    channel: (name: string) => channels.find((c) => c.name === name)!,
    money: (name: string) => moneyAccounts.find((m) => m.name === name)!,
    locMoney: (locationId: string, kind: string) => moneyAccounts.find((m) => m.locationId === locationId && m.kind === kind)!,
    product: (name: string) => products.find((p) => p.name === name)!,
    discount: (code: string) => discountTypes.find((d) => d.code === code)!,
  };
}

/** Sum of all debits − credits across the ledger (must always be 0). */
export async function trialBalanceDifference() {
  const agg = await db.journalLine.aggregate({ _sum: { debitCents: true, creditCents: true } });
  return (agg._sum.debitCents ?? 0n) - (agg._sum.creditCents ?? 0n);
}

/** GL balance (debit − credit) of one account, optionally for one location. */
export async function glBalance(accountId: string, locationId?: string) {
  const agg = await db.journalLine.aggregate({
    where: { accountId, ...(locationId ? { locationId } : {}) },
    _sum: { debitCents: true, creditCents: true },
  });
  return (agg._sum.debitCents ?? 0n) - (agg._sum.creditCents ?? 0n);
}

export async function systemAccount(key: string) {
  return db.account.findUniqueOrThrow({ where: { systemKey: key } });
}

export async function setPrice(productName: string, cents: bigint) {
  const product = await db.product.findFirstOrThrow({ where: { name: productName } });
  await db.priceListItem.updateMany({ where: { productId: product.id }, data: { priceCents: cents } });
}

export const ymd = (daysAgo = 0) => new Date(Date.now() + 8 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);

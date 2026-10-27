// 60 days of believable activity so dashboards and reports have data:
// daily sales with split payments, shift closes, deposits, purchases,
// counts (with one wings spike over standard), sauce production and
// transfers, monthly bills, payroll, and a BPI statement to reconcile.
// Every entry goes through the same services the app uses.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { openDraft, saveDraft, submitReport, closeShift, drawerActivity } from "@/domains/sales/service";
import { recordMoneyTransfer } from "@/domains/cash/service";
import { saveExpense, submitExpense, approveExpense, payBill } from "@/domains/expenses/service";
import { postAdjustment, saveCount, postCount } from "@/domains/inventory/documents";
import { getBalance } from "@/domains/inventory/stock";
import { fromQty4 } from "@/domains/inventory/wac";
import { recordProduction, saveTransfer, dispatchTransfer, receiveTransfer } from "@/domains/inventory/commissary";
import { postOpeningBalances } from "@/domains/ledger/service";
import { saveEmployee, saveAttendance, setSheetStatus, createRun, approveRun, payRun } from "@/domains/payroll/service";
import { cutoffOf, datesBetween } from "@/domains/payroll/compute";

const DAYS = 60;
const P = (pesos: number) => BigInt(Math.round(pesos * 100));
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** Deterministic random numbers, so every demo database looks the same. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRICES: Record<string, number> = {
  "Unlimited Wings": 499,
  "Unlimited Wings + Drinks": 549,
  "Kids Unlimited Wings": 299,
  "Promo Package": 449,
  "Wings 6 pcs (à la carte)": 189,
  "Wings 12 pcs (à la carte)": 349,
  "Extra rice": 35,
  Fries: 79,
  "Extra sauce cup": 25,
  "Bottomless iced tea": 69,
  "Softdrinks in can": 55,
  "Bottled water": 30,
  "Take-out Wings 12 pcs": 379,
  "Take-out Wings 24 pcs": 729,
};
/** Wings standard (kg per pax) for the demo packages; kids eat less. */
const KG_PER_PAX = 0.6;
const KIDS_KG = 0.35;
const NAMES = ["Lourdes Santos", "Ernesto Cruz", "Remedios Lim", "Antonio Reyes", "Felicidad Tan", "Rogelio Garcia", "Corazon Uy", "Danilo Mendoza"];

export async function seedDemo(db: PrismaClient) {
  const today = manilaDateString();
  const start = addDays(today, -DAYS);
  const end = addDays(today, -1);
  const r = rng(20261026);
  const owner = await db.user.findFirstOrThrow({ where: { isOwner: true } });
  const actor = { id: owner.id, can: () => true };
  const tx = <T>(fn: (t: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 120_000 });

  const loc = async (code: string) => db.location.findFirstOrThrow({ where: { code } });
  const [MAT, LAN, COM, HO] = await Promise.all(["MAT", "LAN", "COM", "HO"].map(loc));
  const branches = [
    { l: MAT, factor: 1, spikeDay: addDays(end, -9) },
    { l: LAN, factor: 0.8, spikeDay: "" },
  ];
  const money = async (name: string) => db.moneyAccount.findFirstOrThrow({ where: { name } });
  const locMoney = (locationId: string, kind: "CASH_DRAWER" | "UNDEPOSITED_CASH" | "PETTY_CASH") => db.moneyAccount.findFirstOrThrow({ where: { locationId, kind } });
  const bpi = await money("BPI Bank");
  const channels = await db.paymentChannel.findMany();
  const ch = (name: string) => channels.find((c) => c.name === name)!;
  const products = await db.product.findMany();
  const prod = (name: string) => products.find((p) => p.name === name)!;
  const items = await db.item.findMany();
  const item = (sku: string) => items.find((i) => i.sku === sku)!;
  const acc = async (key: string) => (await db.account.findUniqueOrThrow({ where: { systemKey: key } })).id;
  const code = async (c: string) => (await db.account.findUniqueOrThrow({ where: { code: c } })).id;
  const disc = await db.discountType.findMany();

  // ── Demo prices, wings standard, reorder points ───────────────────────────
  await db.priceList.updateMany({ data: { name: "Demo prices (replace with real prices)" } });
  for (const [name, price] of Object.entries(PRICES)) await db.priceListItem.updateMany({ where: { productId: prod(name).id }, data: { priceCents: P(price) } });
  const standards = await db.recipe.findMany({ where: { kind: "PACKAGE_PER_PAX" }, include: { product: true } });
  for (const s of standards) await db.recipeLine.updateMany({ where: { recipeId: s.id }, data: { qty: s.product?.name.startsWith("Kids") ? String(KIDS_KG) : String(KG_PER_PAX) } });
  for (const b of [MAT, LAN]) {
    await db.itemLocationSetting.updateMany({ where: { locationId: b.id, itemId: item("PRO-WING").id }, data: { reorderPoint: "60", parLevel: "160" } });
    await db.itemLocationSetting.updateMany({ where: { locationId: b.id, itemId: item("PKG-BOX").id }, data: { reorderPoint: "150", parLevel: "500" } });
  }

  // ── Opening balances and stock (the day before the demo starts) ───────────
  const opening = addDays(start, -1);
  await tx(async (t) =>
    postOpeningBalances(
      t,
      {
        date: opening,
        lines: [
          { accountId: bpi.glAccountId, locationId: HO.id, amountCents: P(650_000) },
          { accountId: (await money("GCash 1")).glAccountId, locationId: HO.id, amountCents: P(12_000) },
          ...(await Promise.all([MAT, LAN].map(async (b) => ({ accountId: (await locMoney(b.id, "CASH_DRAWER")).glAccountId, locationId: b.id, amountCents: b.drawerFloatCents })))),
          ...(await Promise.all([MAT, LAN, COM].map(async (b) => ({ accountId: (await locMoney(b.id, "PETTY_CASH")).glAccountId, locationId: b.id, amountCents: P(5_000) })))),
        ],
      },
      actor,
    ),
  );
  const OPENING_BRANCH: [string, string, number][] = [
    ["PRO-WING", "150", 185],
    ["DRY-OIL", "54", 95],
    ["DRY-RICE", "100", 52],
    ["DRY-FRIES", "40", 160],
    ["BEV-WATER", "240", 12],
    ["BEV-SODACAN", "240", 28],
    ["PKG-BOX", "500", 8],
    ["PKG-CUP", "1000", 1.5],
    ["PKG-BAG", "500", 3],
    ["SAU-01", "10", 180],
    ["SAU-02", "10", 210],
    ["SAU-03", "10", 190],
    ["SAU-04", "10", 200],
  ];
  const OPENING_COM: [string, string, number][] = [
    ["ING-BUTTER", "20", 400],
    ["ING-GARLIC", "10", 150],
    ["ING-PARM", "6", 900],
    ["ING-HONEY", "15", 350],
    ["ING-HOT", "24", 220],
    ["ING-SOY", "10", 90],
    ["ING-SUGAR", "20", 75],
    ["ING-EGG", "60", 12],
    ["PKG-TUB", "100", 25],
    ["SAU-01", "12", 180],
    ["SAU-02", "12", 210],
    ["SAU-03", "8", 190],
    ["SAU-04", "8", 200],
  ];
  for (const [l, list] of [
    [MAT, OPENING_BRANCH],
    [LAN, OPENING_BRANCH],
    [COM, OPENING_COM],
  ] as const) {
    await tx((t) => postAdjustment(t, { locationId: l.id, date: opening, type: "OPENING", reason: "Opening stock (demo)", lines: list.map(([sku, qty, cost]) => ({ itemId: item(sku).id, qty, direction: "IN" as const, unitCost: cost.toFixed(2) })) }, actor));
  }

  // ── Sauce recipes ─────────────────────────────────────────────────────────
  const RECIPES: [string, [string, string][]][] = [
    ["SAU-01", [["ING-BUTTER", "2"], ["ING-HOT", "6"]]],
    ["SAU-02", [["ING-BUTTER", "2"], ["ING-GARLIC", "1"], ["ING-PARM", "1"]]],
    ["SAU-03", [["ING-HONEY", "4"], ["ING-GARLIC", "1"], ["ING-SOY", "2"]]],
    ["SAU-04", [["ING-HOT", "3"], ["ING-SUGAR", "2"], ["ING-SOY", "1"]]],
  ];
  const recipes: { id: string }[] = [];
  for (const [sku, lines] of RECIPES) {
    recipes.push(
      await db.recipe.create({
        data: { name: `${item(sku).name} (10 L batch)`, kind: "PRODUCTION", outputItemId: item(sku).id, outputQty: "10", effectiveFrom: new Date(`${opening}T00:00:00Z`), lines: { create: lines.map(([s, q]) => ({ itemId: item(s).id, qty: q })) } },
      }),
    );
  }

  // ── Employees ─────────────────────────────────────────────────────────────
  const STAFF: [string, string, string, typeof MAT, "DAILY" | "MONTHLY", number, boolean, number][] = [
    ["Ramon", "Villanueva", "Branch manager", MAT, "MONTHLY", 24_000, false, 0],
    ["Jessa", "Morales", "Cook", MAT, "DAILY", 620, true, 1],
    ["Paolo", "Domingo", "Cook", MAT, "DAILY", 610, true, 2],
    ["Kristine", "Bautista", "Server", MAT, "DAILY", 590, true, 3],
    ["Mark", "Aquino", "Server", MAT, "DAILY", 590, true, 4],
    ["Carlo", "Matina", "Cashier", MAT, "DAILY", 600, true, 5],
    ["Mika", "Matina", "Cashier", MAT, "DAILY", 600, true, 1],
    ["Jun", "Salazar", "Dishwasher", MAT, "DAILY", 560, true, 2],
    ["Rhea", "Pascual", "Server", MAT, "DAILY", 590, true, 6],
    ["Grace", "Ocampo", "Branch manager", LAN, "MONTHLY", 22_000, false, 1],
    ["Dennis", "Ramos", "Cook", LAN, "DAILY", 610, true, 2],
    ["Ivy", "Castillo", "Server", LAN, "DAILY", 590, true, 3],
    ["Lito", "Lanang", "Cashier", LAN, "DAILY", 600, true, 4],
    ["Joy", "Lanang", "Cashier", LAN, "DAILY", 600, true, 5],
    ["Arnel", "Gomez", "Cook", LAN, "DAILY", 610, true, 6],
    ["Liza", "Rivera", "Server", LAN, "DAILY", 590, true, 0],
    ["Ben", "Commissary", "Commissary cook", COM, "DAILY", 620, true, 0],
    ["Nora", "Fernandez", "Commissary helper", COM, "DAILY", 580, true, 3],
    ["Teresa", "Navarro", "Bookkeeper", HO, "MONTHLY", 20_000, false, 0],
  ];
  const staff = [];
  for (const [first, last, position, l, rateType, rate, mwe, restDay] of STAFF) {
    const id = await tx((t) => saveEmployee(t, { firstName: first, lastName: last, position, status: "ACTIVE", startDate: addDays(start, -200), isMinimumWageEarner: mwe, homeLocationId: l.id, rateType, rateCents: P(rate), sssNo: `34-${String(1000000 + staff.length * 7919).slice(0, 7)}-${staff.length}` }, actor));
    staff.push({ id, l, restDay, rateType });
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const supplier = async (name: string, termsDays: number) => db.supplier.create({ data: { name, termsDays } });
  const poultry = await supplier("Davao Poultry Supply", 7);
  const grocer = await supplier("Agdao Wholesale Grocery", 0);
  const landlordMat = await supplier("Matina Town Square (rent)", 5);
  const landlordLan = await supplier("Lanang Business Park (rent)", 5);
  const dlpc = await supplier("Davao Light & Power", 10);
  const dcwd = await supplier("Davao City Water District", 10);
  const pldt = await supplier("PLDT Fibr", 10);

  const bills: { id: string; due: string; total: bigint }[] = [];
  async function expense(t: Tx, input: { locationId: string; date: string; supplierId?: string; terms: "PAID_NOW" | "ON_ACCOUNT"; paidFrom?: string; due?: string; receiptNo?: string; notes?: string; lines: { accountId?: string; itemId?: string; qty?: string; description?: string; amount: bigint }[] }) {
    const { id } = await saveExpense(
      t,
      {
        locationId: input.locationId,
        date: input.date,
        supplierId: input.supplierId ?? "",
        newSupplierName: "",
        terms: input.terms,
        paidFromMoneyAccountId: input.paidFrom ?? "",
        dueDate: input.due ?? "",
        receiptNo: input.receiptNo ?? "",
        isVatInvoice: false,
        vat: undefined,
        notes: input.notes ?? "",
        lines: input.lines.map((l) => ({ accountId: l.accountId ?? "", itemId: l.itemId ?? "", qty: l.qty ?? "", unit: "BASE" as const, description: l.description ?? "", amount: l.amount })),
        attachmentIds: [],
        submit: false,
      },
      actor,
    );
    await submitExpense(t, id, actor);
    if ((await t.expense.findUniqueOrThrow({ where: { id } })).status === "SUBMITTED") await approveExpense(t, id, actor);
    if (input.terms === "ON_ACCOUNT") bills.push({ id, due: input.due ?? input.date, total: input.lines.reduce((a, l) => a + l.amount, 0n) });
    return id;
  }

  const ACC = {
    rent: await code("6110"),
    power: await code("6210"),
    water: await code("6220"),
    internet: await code("6230"),
    supplies: await acc("SUP_CLEANING"),
    lpg: await acc("COGS_LPG"),
    ice: await acc("COGS_BEVERAGES"),
    bankCharges: await acc("BANK_CHARGES"),
  };

  // ── Day by day ────────────────────────────────────────────────────────────
  const undeposited = new Map<string, bigint>();
  const paxWeek = new Map<string, number>();
  const soldWeek = new Map<string, Map<string, number>>();
  let slip = 7100;
  const allDays = datesBetween(start, end);
  for (const day of allDays) {
    const wd = weekday(day);
    for (const { l: B, factor, spikeDay } of branches) {
      const base = wd === 0 || wd === 6 ? 95 : wd === 5 ? 70 : 42;
      const pax = Math.max(20, Math.round(base * factor * (0.85 + r() * 0.3)));
      const mix: [string, number][] = [
        ["Unlimited Wings", Math.round(pax * 0.55)],
        ["Unlimited Wings + Drinks", Math.round(pax * 0.25)],
        ["Kids Unlimited Wings", Math.round(pax * 0.08)],
      ];
      mix.push(["Promo Package", pax - mix.reduce((a, [, q]) => a + q, 0)]);
      const extras: [string, number][] = [
        ["Wings 6 pcs (à la carte)", Math.round(2 + r() * 5)],
        ["Wings 12 pcs (à la carte)", Math.round(1 + r() * 3)],
        ["Extra rice", Math.round(pax * 0.3)],
        ["Fries", Math.round(pax * 0.15)],
        ["Bottomless iced tea", Math.round(pax * 0.2)],
        ["Softdrinks in can", Math.round(pax * 0.1)],
        ["Bottled water", Math.round(pax * 0.05)],
      ];
      const takeout: [string, number][] = [
        ["Take-out Wings 12 pcs", Math.round(2 + r() * 5)],
        ["Take-out Wings 24 pcs", Math.round(r() * 3)],
      ];
      const lines = [...mix, ...extras, ...takeout].filter(([, q]) => q > 0);
      const gross = lines.reduce((a, [n, q]) => a + P(PRICES[n]) * BigInt(q), 0n);
      const grab = takeout.reduce((a, [n, q]) => a + P(PRICES[n]) * BigInt(q), 0n);
      const sc = Math.floor(r() * 4);
      const discounts = Array.from({ length: sc }, () => {
        const who = NAMES[Math.floor(r() * NAMES.length)];
        const pwd = r() < 0.3;
        return { discountTypeId: disc.find((d) => d.code === (pwd ? "PWD" : "SC"))!.id, amount: P(499 * 0.2), customerName: who, idNumber: `${pwd ? "PWD" : "OSCA"}-${Math.floor(10000 + r() * 89999)}`, receiptNo: "", notes: "" };
      });
      const net = gross - discounts.reduce((a, d) => a + d.amount, 0n);
      const rest = net - grab;
      const share = (bp: number) => (rest * BigInt(bp)) / 10_000n;
      const pays: [string, bigint][] = [
        ["GrabFood", grab],
        ["Maya Card", share(1600)],
        ["Maya QR / QR Ph", share(800)],
        ["GCash 1", share(1200)],
        ["GCash 2", share(900)],
        ["Bank transfer (BPI)", share(300)],
      ];
      pays.push(["Cash", net - pays.reduce((a, [, v]) => a + v, 0n)]);

      const cashier = await db.user.findFirstOrThrow({ where: { name: B.code === "MAT" ? "Carlo Matina" : "Lito Lanang" } });
      await tx(async (t) => {
        const rep = await openDraft(t, { locationId: B.id, ymd: day, shiftNo: 1, userId: cashier.id });
        await saveDraft(t, { reportId: rep.id, lines: lines.map(([n, q]) => ({ productId: prod(n).id, qty: String(q) })), discounts, voids: [], serviceCharge: 0n, payments: pays.filter(([, v]) => v > 0n).map(([n, v]) => ({ channelId: ch(n).id, amount: v, reference: "" })), mismatchExplanation: "" }, cashier.id);
        await submitReport(t, rep.id, cashier.id);
        const act = await drawerActivity(t, rep.id);
        const expected = B.drawerFloatCents + act.cashSalesCents - act.cashExpensesCents;
        // Mostly exact; now and then a little short; one bad day.
        const off = day === addDays(end, -4) && B.code === "LAN" ? -P(520) : r() < 0.12 ? -P(Math.round(20 + r() * 130)) : 0n;
        const counted = expected + off;
        await closeShift(t, { reportId: rep.id, bills: { "1000": Number(counted / 100_000n) }, coins: counted % 100_000n, otherCashIn: 0n, otherCashOut: 0n, reason: off ? "Short after counting twice" : "" }, cashier.id);
        undeposited.set(B.id, (undeposited.get(B.id) ?? 0n) + counted - B.drawerFloatCents);
      });
      paxWeek.set(B.id, (paxWeek.get(B.id) ?? 0) + pax);
      const sold = soldWeek.get(B.id) ?? new Map<string, number>();
      for (const [n, q] of lines) sold.set(n, (sold.get(n) ?? 0) + q);
      soldWeek.set(B.id, sold);

      // Deposits every other day (and on the last day), slip number in the reference.
      if (allDays.indexOf(day) % 2 === 1 || day === end) {
        const amount = undeposited.get(B.id) ?? 0n;
        if (amount > 0n) {
          await tx(async (t) => recordMoneyTransfer(t, { type: "CASH_DEPOSIT", date: day, locationId: B.id, fromAccountId: (await locMoney(B.id, "UNDEPOSITED_CASH")).id, toAccountId: bpi.id, amountCents: amount, feeCents: 0n, reference: `DS${slip++}`, notes: "" }, owner.id));
          undeposited.set(B.id, 0n);
        }
      }

      // Wings in twice a week (Mon, Thu), on 7-day terms.
      if (wd === 1 || wd === 4) {
        const kg = B.code === "MAT" ? 150 : 125;
        await tx((t) => expense(t, { locationId: B.id, date: day, supplierId: poultry.id, terms: "ON_ACCOUNT", due: addDays(day, 7), receiptNo: `DPS-${day.replaceAll("-", "")}-${B.code}`, lines: [{ itemId: item("PRO-WING").id, qty: String(kg), description: "Chicken wings", amount: P(kg * (182 + Math.round(r() * 8))) }] }));
      }
      // Daily wings count: usage within ±2% of standard; one spike day 15% over.
      const kids = mix.find(([n]) => n.startsWith("Kids"))![1];
      const standard = (pax - kids) * KG_PER_PAX + kids * KIDS_KG;
      const usage = standard * (day === spikeDay ? 1.15 : 0.98 + r() * 0.04);
      await tx(async (t) => {
        const bal = await getBalance(t, item("PRO-WING").id, B.id);
        const counted = Math.max(0, Number(fromQty4(bal.qty4)) - usage).toFixed(2);
        const id = await saveCount(t, { locationId: B.id, date: day, type: "DAILY", lines: [{ itemId: item("PRO-WING").id, counted }], notes: "" }, actor);
        await postCount(t, id, actor);
      });
      // Ice and small items from petty cash.
      await tx(async (t) => expense(t, { locationId: B.id, date: day, supplierId: grocer.id, terms: "PAID_NOW", paidFrom: (await locMoney(B.id, "PETTY_CASH")).id, lines: [{ accountId: ACC.ice, description: "Ice", amount: P(150 + Math.round(r() * 100)) }] }));

      // Sunday: weekly count of the other stock, then Monday restock.
      if (wd === 0) {
        const pw = paxWeek.get(B.id) ?? 0;
        const sw = soldWeek.get(B.id) ?? new Map();
        const use: [string, number][] = [
          ["DRY-OIL", pw * 0.06],
          ["DRY-RICE", (sw.get("Extra rice") ?? 0) * 0.2 + pw * 0.05],
          ["DRY-FRIES", (sw.get("Fries") ?? 0) * 0.15],
          ["BEV-SODACAN", sw.get("Softdrinks in can") ?? 0],
          ["BEV-WATER", sw.get("Bottled water") ?? 0],
          ["PKG-BOX", (sw.get("Take-out Wings 12 pcs") ?? 0) + (sw.get("Take-out Wings 24 pcs") ?? 0) * 2],
          ["PKG-CUP", pw * 0.5],
          ["SAU-01", pw * 0.012],
          ["SAU-02", pw * 0.01],
          ["SAU-03", pw * 0.008],
          ["SAU-04", pw * 0.006],
        ];
        await tx(async (t) => {
          const countLines = [];
          for (const [sku, u] of use) {
            const bal = await getBalance(t, item(sku).id, B.id);
            countLines.push({ itemId: item(sku).id, counted: Math.max(0, Number(fromQty4(bal.qty4)) - u).toFixed(2) });
          }
          const id = await saveCount(t, { locationId: B.id, date: day, type: "WEEKLY", lines: countLines, notes: "" }, actor);
          await postCount(t, id, actor);
        });
        paxWeek.set(B.id, 0);
        soldWeek.set(B.id, new Map());
      }
      if (wd === 1) {
        await tx(async (t) => {
          const restock: [string, number, number][] = [
            ["DRY-OIL", 54, 95],
            ["DRY-RICE", 100, 52],
            ["DRY-FRIES", 40, 160],
            ["BEV-SODACAN", 240, 28],
            ["BEV-WATER", 240, 12],
            ["PKG-BOX", 500, 8],
            ["PKG-CUP", 1000, 1.5],
          ];
          const lines2 = [];
          for (const [sku, par, cost] of restock) {
            const have = Number(fromQty4((await getBalance(t, item(sku).id, B.id)).qty4));
            const buy = Math.ceil(par - have);
            if (buy > 0) lines2.push({ itemId: item(sku).id, qty: String(buy), description: item(sku).name, amount: P(buy * cost) });
          }
          if (lines2.length) await expense(t, { locationId: B.id, date: day, supplierId: grocer.id, terms: "PAID_NOW", paidFrom: bpi.id, receiptNo: `AWG-${day.replaceAll("-", "")}-${B.code}`, lines: lines2 });
          await expense(t, { locationId: B.id, date: day, supplierId: grocer.id, terms: "PAID_NOW", paidFrom: (await locMoney(B.id, "PETTY_CASH")).id, lines: [{ accountId: ACC.supplies, description: "Dishwashing liquid, sanitizer, trash bags", amount: P(650) }, { accountId: ACC.lpg, description: "LPG refill", amount: P(1_150) }] });
          // Top up petty cash from BPI.
          await recordMoneyTransfer(t, { type: "PETTY_REPLENISH", date: day, locationId: B.id, fromAccountId: bpi.id, toAccountId: (await locMoney(B.id, "PETTY_CASH")).id, amountCents: P(4_000), feeCents: 0n, reference: "", notes: "Weekly petty cash" }, owner.id);
        });
      }
    }

    // Commissary: Monday buys ingredients and cooks; Tuesday and Friday deliver.
    if (wd === 1) {
      await tx(async (t) => {
        await expense(t, { locationId: COM.id, date: day, supplierId: grocer.id, terms: "PAID_NOW", paidFrom: bpi.id, receiptNo: `AWG-${day.replaceAll("-", "")}-COM`, lines: [["ING-BUTTER", 8, 400], ["ING-GARLIC", 4, 150], ["ING-PARM", 2, 900], ["ING-HONEY", 5, 350], ["ING-HOT", 12, 220], ["ING-SOY", 4, 90], ["ING-SUGAR", 3, 75]].map(([sku, qty, cost]) => ({ itemId: item(sku as string).id, qty: String(qty), description: item(sku as string).name, amount: P((qty as number) * (cost as number)) })) });
        for (const rec of recipes) await recordProduction(t, { locationId: COM.id, recipeId: rec.id, date: day, outputQty: "12" }, actor);
      });
    }
    if (wd === 2 || wd === 5) {
      for (const B of [MAT, LAN]) {
        await tx(async (t) => {
          const id = await saveTransfer(t, { fromLocationId: COM.id, toLocationId: B.id, notes: "", lines: ["SAU-01", "SAU-02", "SAU-03", "SAU-04"].map((sku, i) => ({ itemId: item(sku).id, qty: String([3, 3, 2, 2][i]) })) }, actor);
          await dispatchTransfer(t, id, day, actor);
          const tl = await t.transferLine.findMany({ where: { transferId: id } });
          await receiveTransfer(t, id, day, tl.map((x) => ({ lineId: x.id, qty: x.qtySent.toString() })), actor);
        });
      }
    }
    // Monthly bills on the 3rd; paid from BPI before they're due.
    if (day.endsWith("-03")) {
      for (const [l, rent, power, water] of [
        [MAT, 45_000, 28_000, 3_500],
        [LAN, 38_000, 22_000, 3_000],
        [COM, 15_000, 9_000, 1_500],
      ] as const) {
        await tx(async (t) => {
          await expense(t, { locationId: l.id, date: day, supplierId: (l === MAT ? landlordMat : l === LAN ? landlordLan : landlordMat).id, terms: "ON_ACCOUNT", due: addDays(day, 5), receiptNo: `RENT-${day.slice(0, 7)}-${l.code}`, lines: [{ accountId: ACC.rent, description: `Rent ${day.slice(0, 7)}`, amount: P(rent) }] });
          await expense(t, { locationId: l.id, date: day, supplierId: dlpc.id, terms: "ON_ACCOUNT", due: addDays(day, 12), receiptNo: `DLPC-${day.slice(0, 7)}-${l.code}`, lines: [{ accountId: ACC.power, description: "Electricity", amount: P(power + Math.round(r() * 3000)) }] });
          await expense(t, { locationId: l.id, date: day, supplierId: dcwd.id, terms: "ON_ACCOUNT", due: addDays(day, 12), lines: [{ accountId: ACC.water, description: "Water", amount: P(water) }] });
          await expense(t, { locationId: l.id, date: day, supplierId: pldt.id, terms: "ON_ACCOUNT", due: addDays(day, 12), lines: [{ accountId: ACC.internet, description: "Internet", amount: P(1_699) }] });
        });
      }
    }
    // Pay bills that fall due today (the latest ones stay open for the AP aging).
    for (const b of bills.filter((x) => x.due === day)) {
      await tx((t) => payBill(t, { expenseId: b.id, date: day, moneyAccountId: bpi.id, amountCents: b.total, reference: "" }, owner.id));
    }
  }

  // ── Payroll for every complete cut-off in the window ─────────────────────
  let c = cutoffOf(start);
  if (c.start < start) c = cutoffOf(addDays(c.end, 1));
  while (c.end <= end) {
    for (const L of [MAT, LAN, COM, HO]) {
      const mine = staff.filter((s) => s.l.id === L.id);
      if (!mine.length) continue;
      await tx(async (t) => {
        await saveAttendance(
          t,
          {
            locationId: L.id,
            periodStart: c.start,
            rows: mine.map((s, i) => ({
              employeeId: s.id,
              cells: Object.fromEntries(
                datesBetween(c.start, c.end).map((d, k) => {
                  if (weekday(d) === s.restDay) return [d, "R"];
                  if ((k + i) % 11 === 5) return [d, "P LT15"];
                  if ((k + i) % 9 === 4 && L.type === "BRANCH") return [d, "P OT2"];
                  if ((k + i) % 23 === 7) return [d, "A"];
                  return [d, "P"];
                }),
              ),
            })),
          },
          actor,
        );
        const sheet = await t.attendanceSheet.findFirstOrThrow({ where: { locationId: L.id, periodStart: new Date(`${c.start}T00:00:00Z`) } });
        await setSheetStatus(t, sheet.id, "APPROVED", actor);
      });
    }
    const payDate = c.half === 1 ? `${c.end.slice(0, 8)}20` : addDays(c.end, 5);
    await tx(async (t) => {
      const id = await createRun(t, { type: "REGULAR", periodStart: c.start, periodEnd: c.end, payDate }, actor);
      await approveRun(t, id, actor);
      if (payDate <= end) await payRun(t, id, { moneyAccountId: bpi.id, date: payDate }, actor);
    });
    c = cutoffOf(addDays(c.end, 1));
  }

  await writeSamples(db, { start, end, bpiId: bpi.id, bpiGl: bpi.glAccountId, today });
  return { start, end };
}

/**
 * Sample files: a BPI statement that mirrors the BPI postings plus the real
 * Maya/Grab payouts (at slightly different fees), bank charges and interest,
 * and a Loyverse "Receipts" export for each branch for today.
 */
async function writeSamples(db: PrismaClient, opts: { start: string; end: string; bpiId: string; bpiGl: string; today: string }) {
  const dir = path.join(process.cwd(), "samples");
  await mkdir(dir, { recursive: true });
  const r = rng(7);
  const lines = await db.journalLine.findMany({ where: { accountId: opts.bpiGl, date: { gte: new Date(`${opts.start}T00:00:00Z`) } }, include: { entry: true }, orderBy: [{ date: "asc" }] });
  type Row = { date: string; desc: string; ref: string; amount: bigint };
  const rows: Row[] = [];
  for (const l of lines) {
    const amt = l.debitCents - l.creditCents;
    const d = l.date.toISOString().slice(0, 10);
    const deposit = l.entry.source === "MONEY_TRANSFER" && amt > 0n;
    const ref = /DS\d+/.exec(l.entry.memo)?.[0] ?? "";
    rows.push({ date: deposit ? addDays(d, 1) : d, desc: deposit ? "CASH DEPOSIT" : amt > 0n ? "FUND TRANSFER CREDIT" : l.entry.source === "PAYROLL" ? "PAYROLL CREDIT TO EMPLOYEES" : l.entry.source === "MONEY_TRANSFER" ? "CASH WITHDRAWAL" : "CHECK / ONLINE PAYMENT", ref, amount: amt });
  }
  // Payouts: Maya next day net of ~2.2% (card) / 1.4% (QR); Grab a week later at 29.5%.
  const settlements = await db.channelSettlement.findMany({ where: { businessDate: { gte: new Date(`${opts.start}T00:00:00Z`) } }, include: { channel: true } });
  const payouts = new Map<string, { desc: string; amount: bigint }>();
  for (const s of settlements) {
    const d = s.expectedOn.toISOString().slice(0, 10);
    if (d > opts.end) continue;
    const rate = s.channel.kind === "CARD" ? 220 : s.channel.kind === "QR" ? 140 : 2950;
    const net = s.grossCents - (s.grossCents * BigInt(rate)) / 10_000n - s.expectedWhtCents;
    const k = `${d}|${s.channel.kind === "DELIVERY_PLATFORM" ? "GRAB" : "MAYA"}`;
    const cur = payouts.get(k) ?? { desc: s.channel.kind === "DELIVERY_PLATFORM" ? "GRAB PAYOUT" : "PAYMAYA SETTLEMENT", amount: 0n };
    cur.amount += net;
    payouts.set(k, cur);
  }
  for (const [k, v] of payouts) rows.push({ date: k.split("|")[0], desc: v.desc, ref: `PO${Math.floor(100000 + r() * 899999)}`, amount: v.amount });
  for (const d of datesBetween(opts.start, opts.end).filter((x) => x.endsWith("-28"))) {
    rows.push({ date: d, desc: "SERVICE CHARGE", ref: "", amount: -15_000n }, { date: d, desc: "INTEREST CREDIT", ref: "", amount: BigInt(800 + Math.floor(r() * 900)) });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const openingLine = await db.journalLine.aggregate({ where: { accountId: opts.bpiGl, date: { lt: new Date(`${opts.start}T00:00:00Z`) } }, _sum: { debitCents: true, creditCents: true } });
  let bal = (openingLine._sum.debitCents ?? 0n) - (openingLine._sum.creditCents ?? 0n);
  const peso = (c: bigint) => (Number(c) / 100).toFixed(2);
  const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
  const csvRows = rows
    .filter((x) => x.date <= opts.end)
    .map((x) => {
      bal += x.amount;
      return { "Transaction Date": mdY(x.date), Description: x.desc, "Reference Number": x.ref, Debit: x.amount < 0n ? peso(-x.amount) : "", Credit: x.amount > 0n ? peso(x.amount) : "", "Running Balance": peso(bal) };
    });
  // BPI lists the newest first.
  await writeFile(path.join(dir, "bpi-statement-demo.csv"), Papa.unparse(csvRows.reverse()));

  // Loyverse "Receipts" exports for today (one per branch), to try the importer.
  for (const [code, store, cashier] of [
    ["MAT", "Wingboss Matina", "Carlo"],
    ["LAN", "Wingboss Lanang", "Lito"],
  ]) {
    const receipts = [];
    for (let i = 0; i < 12; i++) {
      const pax = 1 + Math.floor(r() * 4);
      const gross = pax * 499 + (r() < 0.5 ? 69 * pax : 0);
      const pay = ["Cash", "Cash", "Maya Card", "GCash 1", "GCash 2"][Math.floor(r() * 5)];
      const hh = 11 + Math.floor(i * 0.8);
      receipts.push({
        Date: `${mdY(opts.today)} ${hh > 12 ? hh - 12 : hh}:${String(Math.floor(r() * 60)).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`,
        "Receipt number": `${code === "MAT" ? 2 : 1}-${2001 + i}`,
        "Receipt type": "Sale",
        "Gross sales": gross.toFixed(2),
        Discounts: "0.00",
        "Net sales": gross.toFixed(2),
        Taxes: "0.00",
        "Total collected": gross.toFixed(2),
        "Cost of goods": "0.00",
        "Gross profit": gross.toFixed(2),
        "Payment type": pay,
        Description: `${pax} x Unlimited Wings`,
        "Dining option": "Dine in",
        POS: "POS 1",
        Store: store,
        "Cashier name": cashier,
        "Customer name": "",
        "Customer contacts": "",
        Status: "Closed",
      });
    }
    await writeFile(path.join(dir, `loyverse-receipts-${code.toLowerCase()}-${opts.today}.csv`), Papa.unparse(receipts));
  }
}

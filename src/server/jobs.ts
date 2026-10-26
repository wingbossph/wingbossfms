import "server-only";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { runRecurring } from "@/domains/expenses/service";
import { getSetting } from "@/domains/admin/settings";
import { buildReport } from "@/domains/reports/registry";
import { kpis, moneyIn } from "@/domains/dashboard/metrics";
import { monthEnd } from "@/domains/reports/params";
import { loadAccess } from "@/server/auth/access";
import type { CurrentUser } from "@/server/auth/session";
import { emailHtml, sendEmail } from "@/server/email";
import { toPdf } from "@/server/export/render";
import { formatPeso } from "@/lib/money";
import { locationsWithLoyverseSync, syncLoyverse } from "@/domains/sales/loyverse/sync";

/** The Owner as a report reader (jobs have no session). */
async function ownerReader(): Promise<CurrentUser> {
  const owner = await db.user.findFirstOrThrow({ where: { isOwner: true, isActive: true } });
  const { access, activeLocations } = await loadAccess(db, owner.id);
  return { id: owner.id, name: owner.name, email: owner.email, isOwner: true, method: "password", deviceId: null, access, roleNames: ["Owner"], locations: activeLocations };
}

async function recipients(owner: CurrentUser) {
  const extra = (await getSetting(db, "reports.emailRecipients")).split(/[,;\s]+/).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
  return [...new Set([...(owner.email ? [owner.email] : []), ...extra])];
}

const dayBefore = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const appUrl = () => process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

// Scheduled jobs (Vercel Cron → /api/cron/<job>). Each run is logged in JobRun.

export const JOBS = {
  /** Creates draft expenses from recurring templates (rent, internet, …). */
  "recurring-expenses": async () => {
    const owner = await db.user.findFirstOrThrow({ where: { isOwner: true } });
    const created = await db.$transaction((tx) => runRecurring(tx, manilaDateString(), owner.id), { timeout: 60_000 });
    return { created };
  },
  /** Pulls Loyverse receipts for every branch with a store ID (needs LOYVERSE_API_TOKEN). */
  "loyverse-sync": async () => {
    if (!process.env.LOYVERSE_API_TOKEN) return { skipped: "no LOYVERSE_API_TOKEN" };
    const owner = await db.user.findFirstOrThrow({ where: { isOwner: true } });
    const results: Record<string, unknown> = {};
    for (const locationId of await locationsWithLoyverseSync()) {
      try {
        results[locationId] = await syncLoyverse(locationId, owner.id);
      } catch (e) {
        results[locationId] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return results;
  },
  /** Yesterday's sales for all locations, each morning. */
  "daily-sales-email": async () => {
    if (!(await getSetting(db, "reports.dailySalesEmail"))) return { skipped: "disabled" };
    const owner = await ownerReader();
    const to = await recipients(owner);
    if (!to.length) return { skipped: "no recipients" };
    const day = dayBefore(manilaDateString());
    const ids = owner.locations.map((l) => l.id);
    const [k, m, { doc }] = await Promise.all([kpis(ids, { from: day, to: day }), moneyIn(ids, { from: day, to: day }), buildReport("daily-sales", owner, { from: day, to: day })]);
    const lines: [string, string][] = [
      ["Net sales", formatPeso(k.netSales)],
      ["Pax", k.pax.toLocaleString("en-PH")],
      ["Spend per pax", k.avgPerPax === null ? "—" : formatPeso(k.avgPerPax)],
      ...m.buckets.filter((b) => b.cents !== 0n).map((b): [string, string] => [b.name, `${formatPeso(b.cents)}${b.pct === null ? "" : ` (${b.pct.toFixed(1)}%)`}`]),
      ["Undeposited cash", formatPeso(m.undeposited)],
    ];
    const res = await sendEmail({ to, subject: `Wingboss sales ${day}: ${formatPeso(k.netSales)}`, html: emailHtml(`Sales for ${day}`, lines, { text: "Open the dashboard", href: appUrl() ? `${appUrl()}/dashboard?preset=custom&from=${day}&to=${day}` : undefined }), attachments: [{ filename: `daily-sales-${day}.pdf`, content: await toPdf(doc) }] });
    return { day, to: to.length, ...res };
  },
  /** Last month's P&L (by location + consolidated) as a PDF, on the 1st. */
  "monthly-pnl-email": async () => {
    if (!(await getSetting(db, "reports.monthlyPnlEmail"))) return { skipped: "disabled" };
    const today = manilaDateString();
    if (!today.endsWith("-01") && !process.env.FORCE_MONTHLY_EMAIL) return { skipped: "not the 1st" };
    const owner = await ownerReader();
    const to = await recipients(owner);
    if (!to.length) return { skipped: "no recipients" };
    const last = dayBefore(`${today.slice(0, 8)}01`);
    const from = `${last.slice(0, 8)}01`;
    const ids = owner.locations.map((l) => l.id);
    const [k, { doc }] = await Promise.all([kpis(ids, { from, to: monthEnd(from) }), buildReport("pnl", owner, { from, to: monthEnd(from) })]);
    const lines: [string, string][] = [
      ["Net sales", formatPeso(k.netSales)],
      ["Net profit", `${formatPeso(k.netProfit)}${k.marginPct === null ? "" : ` (${k.marginPct.toFixed(1)}%)`}`],
      ["Food cost", k.foodCostPct === null ? "—" : `${k.foodCostPct.toFixed(1)}%`],
      ["Labor cost", k.laborCostPct === null ? "—" : `${k.laborCostPct.toFixed(1)}%`],
      ["Pax", k.pax.toLocaleString("en-PH")],
    ];
    const res = await sendEmail({ to, subject: `Wingboss P&L ${from.slice(0, 7)}: profit ${formatPeso(k.netProfit)}`, html: emailHtml(`Profit & loss for ${from.slice(0, 7)}`, lines, { text: "The full P&L is attached." }), attachments: [{ filename: `pnl-${from.slice(0, 7)}.pdf`, content: await toPdf(doc) }] });
    return { month: from.slice(0, 7), to: to.length, ...res };
  },
} satisfies Record<string, () => Promise<Record<string, unknown>>>;

export async function runJob(job: keyof typeof JOBS) {
  const run = await db.jobRun.create({ data: { job } });
  try {
    const details = await JOBS[job]();
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, details: JSON.parse(JSON.stringify(details, (_, v) => (typeof v === "bigint" ? v.toString() : v))) } });
    return { ok: true, job, ...details };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, details: { error: message } } });
    console.error(`Job ${job} failed`, e);
    return { ok: false, job, error: message };
  }
}

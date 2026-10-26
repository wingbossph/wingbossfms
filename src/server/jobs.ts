import "server-only";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { runRecurring } from "@/domains/expenses/service";

// Scheduled jobs (Vercel Cron → /api/cron/<job>). Each run is logged in JobRun.

export const JOBS = {
  /** Creates draft expenses from recurring templates (rent, internet, …). */
  "recurring-expenses": async () => {
    const owner = await db.user.findFirstOrThrow({ where: { isOwner: true } });
    const created = await db.$transaction((tx) => runRecurring(tx, manilaDateString(), owner.id), { timeout: 60_000 });
    return { created };
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

import "server-only";
import { db } from "@/server/db";
import { getSetting, setSetting } from "@/domains/admin/settings";
import { UserFacingError } from "@/lib/errors";
import { apiToParse, fetchEmployees, fetchReceipts } from "./api";
import { commitImport } from "./import";

/** Pulls new Loyverse receipts for one location (since the last sync, or yesterday 00:00). */
export async function syncLoyverse(locationId: string, actorId: string) {
  const token = process.env.LOYVERSE_API_TOKEN;
  if (!token) throw new UserFacingError("Loyverse API sync isn't set up: add LOYVERSE_API_TOKEN to the environment.");
  const storeId = await getSetting(db, "loyverse.storeId", locationId);
  if (!storeId) throw new UserFacingError("Set this branch's Loyverse store ID in Payments & branch settings.");
  const last = await getSetting(db, "loyverse.lastSyncAt", locationId);
  const until = new Date();
  // Overlap by an hour: receipts already imported are skipped by receipt number.
  const since = last ? new Date(Date.parse(last) - 3_600_000) : new Date(Date.now() - 2 * 86_400_000);
  const [receipts, employees] = await Promise.all([fetchReceipts(token, storeId, since, until), fetchEmployees(token).catch(() => new Map<string, string>())]);
  const parsed = apiToParse(receipts, employees);
  let result = { created: 0, enriched: 0, duplicates: 0, dates: [] as string[] };
  if (parsed.receipts.length) {
    const r = await db.$transaction((tx) => commitImport(tx, { locationId, parsed, fileName: "Loyverse API", actorId, source: "LOYVERSE_API" }), { timeout: 120_000 });
    result = { created: r.created, enriched: r.enriched, duplicates: r.duplicates, dates: r.rebuilt.map((x) => x.date) };
  }
  await db.$transaction((tx) => setSetting(tx, "loyverse.lastSyncAt", until.toISOString(), locationId, actorId));
  return { fetched: receipts.length, ...result };
}

export async function locationsWithLoyverseSync() {
  const rows = await db.setting.findMany({ where: { key: "loyverse.storeId", locationId: { not: null } } });
  return rows.filter((r) => typeof r.value === "string" && r.value).map((r) => r.locationId!);
}

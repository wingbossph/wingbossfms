"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, requireActor } from "@/server/auth/session";
import { manilaDateString } from "@/lib/dates";
import { cashCountSchema, openReportSchema, reopenSchema, salesDraftSchema } from "./schemas";
import { closeShift, openDraft, reopenReport, saveDraft, submitReport } from "./service";
import { commitImport, previewImport, type ImportPreview } from "./loyverse/import";
import { parseLoyverseCsv } from "./loyverse/parse";

async function reportFor(reportId: string, permission: string) {
  const actor = await requireActor();
  const report = await db.salesReport.findUnique({ where: { id: reportId } });
  if (!report) throw new UserFacingError("Sales report not found.");
  assertCan(actor, permission, report.locationId);
  return { actor, report };
}

export async function openReportAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    const input = openReportSchema.parse(raw);
    assertCan(actor, "sales:create", input.locationId);
    if (input.businessDate > manilaDateString()) throw new UserFacingError("The business date can't be in the future.");
    const report = await db.$transaction((tx) =>
      openDraft(tx, { locationId: input.locationId, ymd: input.businessDate, shiftNo: input.shiftNo, userId: actor.id }),
    );
    redirect(`/sales/${report.id}`);
  });
}

export async function saveDraftAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = salesDraftSchema.parse(raw);
    const { actor } = await reportFor(input.reportId, "sales:create");
    await db.$transaction((tx) => saveDraft(tx, input, actor.id));
    revalidatePath(`/sales/${input.reportId}`);
    return { ok: true, message: "Saved." };
  });
}

export async function submitReportAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = salesDraftSchema.parse(raw);
    const { actor } = await reportFor(input.reportId, "sales:create");
    await db.$transaction(async (tx) => {
      await saveDraft(tx, input, actor.id);
      await submitReport(tx, input.reportId, actor.id);
    });
    revalidatePath(`/sales/${input.reportId}`);
    return { ok: true, message: "Sales submitted. Now close the shift with a cash count." };
  });
}

export async function closeShiftAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = cashCountSchema.parse(raw);
    const { actor } = await reportFor(input.reportId, "cash:count");
    const result = await db.$transaction((tx) =>
      closeShift(tx, { reportId: input.reportId, bills: input.bills, coins: input.coins, otherCashIn: input.otherCashIn, otherCashOut: input.otherCashOut, reason: input.reason }, actor.id),
    );
    revalidatePath(`/sales/${input.reportId}`);
    const os = result.overShortCents;
    return { ok: true, message: os === 0n ? "Shift closed. Cash balanced." : `Shift closed. Cash ${os > 0n ? "over" : "short"} recorded.` };
  });
}

export async function markReviewedAction(reportId: string): Promise<ActionState> {
  return handleAction(async () => {
    const { actor, report } = await reportFor(reportId, "sales:approve");
    if (report.status !== "POSTED") throw new UserFacingError("Only submitted reports can be reviewed.");
    await db.$transaction(async (tx) => {
      await tx.salesReport.update({ where: { id: reportId }, data: { approvedById: actor.id, approvedAt: new Date() } });
      await writeAudit(tx, { actorId: actor.id, action: "APPROVE", entityType: "SalesReport", entityId: reportId, locationId: report.locationId });
    });
    revalidatePath(`/sales/${reportId}`);
    return { ok: true, message: "Marked as reviewed." };
  });
}

/** Staff can't edit a submitted report; they ask for a correction instead. */
export async function requestCorrectionAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = reopenSchema.parse(raw);
    const { actor, report } = await reportFor(input.reportId, "adjustments:request");
    if (report.status !== "POSTED") throw new UserFacingError("Only submitted reports need a correction request.");
    const pending = await db.adjustmentRequest.findFirst({ where: { entityType: "SalesReport", entityId: report.id, status: "PENDING" } });
    if (pending) throw new UserFacingError("A correction request is already waiting for approval.");
    await db.$transaction(async (tx) => {
      const req = await tx.adjustmentRequest.create({
        data: { entityType: "SalesReport", entityId: report.id, locationId: report.locationId, requestedById: actor.id, reason: input.reason, proposedChanges: { action: "REOPEN" } },
      });
      await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "AdjustmentRequest", entityId: req.id, locationId: report.locationId, after: { reportId: report.id, reason: input.reason } });
    });
    revalidatePath(`/sales/${report.id}`);
    return { ok: true, message: "Correction requested. An admin will reopen the report." };
  });
}

/** Owner/admin reopens a report directly (same effect as approving a request). */
export async function reopenReportAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = reopenSchema.parse(raw);
    const { actor } = await reportFor(input.reportId, "adjustments:approve");
    await db.$transaction(async (tx) => {
      await reopenReport(tx, input.reportId, actor.id, input.reason, manilaDateString());
      await tx.adjustmentRequest.updateMany({
        where: { entityType: "SalesReport", entityId: input.reportId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: input.reason },
      });
    });
    revalidatePath(`/sales/${input.reportId}`);
    return { ok: true, message: "Report reopened for correction. Its postings were reversed." };
  });
}

// ── Loyverse import ─────────────────────────────────────────────────────────

const importSchema = z.object({
  locationId: z.string().min(1),
  fileName: z.string().max(200),
  csv: z.string().min(1).max(11_000_000),
  summaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  dateOrder: z.enum(["MDY", "DMY"]).default("MDY"),
});

type PreviewResult = { ok: boolean; message?: string; preview?: Omit<ImportPreview, "grossCents" | "netCents"> & { grossCents: string; netCents: string } };

export async function previewImportAction(raw: unknown): Promise<PreviewResult> {
  let preview: PreviewResult["preview"];
  const res = await handleAction(async () => {
    const actor = await requireActor();
    const input = importSchema.parse(raw);
    assertCan(actor, "sales:import", input.locationId);
    const parsed = parseLoyverseCsv(input.csv, { dateOrder: input.dateOrder });
    if ("error" in parsed) throw new UserFacingError(parsed.error);
    const p = await db.$transaction((tx) => previewImport(tx, input.locationId, parsed, input.summaryDate));
    preview = { ...p, grossCents: p.grossCents.toString(), netCents: p.netCents.toString() };
  });
  return { ok: !!res?.ok, message: res?.message, preview };
}

export async function commitImportAction(raw: unknown): Promise<ActionState & { reportIds?: string[] }> {
  let reportIds: string[] = [];
  const res = await handleAction(async () => {
    const actor = await requireActor();
    const input = importSchema.parse(raw);
    assertCan(actor, "sales:import", input.locationId);
    const parsed = parseLoyverseCsv(input.csv, { dateOrder: input.dateOrder });
    if ("error" in parsed) throw new UserFacingError(parsed.error);
    const result = await db.$transaction(
      (tx) => commitImport(tx, { locationId: input.locationId, parsed, fileName: input.fileName, summaryDate: input.summaryDate, actorId: actor.id }),
      { timeout: 180_000 },
    );
    reportIds = result.rebuilt.filter((r) => r.reportId && !r.skipped).map((r) => r.reportId);
    const skipped = result.rebuilt.filter((r) => r.skipped).length;
    revalidatePath("/sales");
    revalidatePath("/dashboard");
    if ("daily" in result) {
      const notes = result.rebuilt.filter((r) => r.skipped && r.skipped !== "unchanged" && r.skipped !== "no sales").map((r) => `${r.date}: ${r.skipped}`);
      return {
        ok: true,
        message: `Sales summary: ${result.created} day(s) added, ${result.enriched} updated, ${result.duplicates} unchanged. Added and updated days are submitted.${notes.length ? ` Skipped ${notes.join("; ")}.` : ""}`,
      };
    }
    return {
      ok: true,
      message: `Imported ${result.created} new receipts${result.enriched ? `, updated ${result.enriched}` : ""}${result.duplicates ? `, skipped ${result.duplicates} already imported` : ""}.${skipped ? ` ${skipped} day(s) were already submitted.` : ""}`,
    };
  });
  return { ...(res ?? { ok: false }), reportIds };
}

export async function syncLoyverseAction(locationId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCan(user, "sales:import", locationId);
    const { syncLoyverse } = await import("./loyverse/sync");
    const r = await syncLoyverse(locationId, user.id);
    revalidatePath("/sales");
    return { ok: true, message: r.fetched ? `Fetched ${r.fetched} receipt(s): ${r.created} new, ${r.duplicates} already imported.` : "No new receipts in Loyverse." };
  });
}

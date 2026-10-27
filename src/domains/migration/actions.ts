"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCanAnywhere, requireActor } from "@/server/auth/session";
import { putObject } from "@/server/storage";
import { manilaDateString } from "@/lib/dates";
import { readStatementTable } from "@/domains/banking/file";
import { autoMap, kindDef, readRows, type ImportKind, type RowError } from "./kinds";
import { runImport } from "./service";

const schema = z.object({
  kind: z.enum(["ITEMS", "OPENING_STOCK", "ACCOUNTS", "OPENING_BALANCES", "EMPLOYEES", "SALES_HISTORY", "EXPENSES_HISTORY"]),
  fileName: z.string().min(1).max(200),
  content: z.string().min(1).max(14_000_000),
  mapping: z.record(z.string(), z.string()).optional(),
  headerRow: z.number().int().min(0).max(30).default(0),
  dateOrder: z.enum(["MDY", "DMY", "YMD"]).default("MDY"),
  commit: z.boolean().default(false),
});

export type ImportCheck = {
  headers: string[];
  mapping: Record<string, string>;
  rowCount: number;
  validRows: number;
  sample: Record<string, string>[];
  errors: RowError[];
  created?: number;
  updated?: number;
  committed?: boolean;
};

const show = (v: unknown) => (typeof v === "bigint" ? (Number(v) / 100).toFixed(2) : v === null || v === undefined ? "" : String(v));

/** Reads the file, applies the mapping, and runs the import as a dry run (or for real with `commit`). */
export async function checkImportAction(raw: unknown): Promise<ActionState & { check?: ImportCheck }> {
  let check: ImportCheck | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "settings:manage");
    if (!user.isOwner) throw new UserFacingError("Only the Owner can import data.");
    const input = schema.parse(raw);
    const def = kindDef(input.kind)!;
    const bytes = Buffer.from(input.content, "base64");
    const table = await readStatementTable(input.fileName, bytes);
    const headers = (table[input.headerRow] ?? []).map((h) => (h ?? "").trim()).filter(Boolean);
    const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : autoMap(def, headers);
    const parsed = readRows(def, table, mapping, { headerRow: input.headerRow, dateOrder: input.dateOrder });
    const rowCount = parsed.rows.length + new Set(parsed.errors.filter((e) => e.row > 0).map((e) => e.row)).size;
    const actor = { id: user.id, can: (p: string, l: string) => user.access.can(p, l) };
    const outcome = parsed.errors.length ? null : await runImport(db, input.kind as ImportKind, parsed.rows, actor, { dryRun: !input.commit });
    const errors = [...parsed.errors, ...(outcome?.errors ?? [])].sort((a, b) => a.row - b.row);
    check = {
      headers,
      mapping,
      rowCount,
      validRows: parsed.rows.length,
      sample: parsed.rows.slice(0, 8).map((r) => Object.fromEntries(def.fields.map((f) => [f.key, show(r.values[f.key])]))),
      errors: errors.slice(0, 200),
      created: outcome?.created,
      updated: outcome?.updated,
      committed: input.commit && !!outcome && outcome.errors.length === 0,
    };
    if (input.commit) {
      const storagePath = `imports/${manilaDateString().slice(0, 7)}/${randomUUID()}-${input.fileName.replace(/[^\w.-]+/g, "_")}`;
      const mimeType = /\.xlsx$/i.test(input.fileName) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
      await putObject(storagePath, bytes, mimeType);
      const att = await db.attachment.create({ data: { storagePath, fileName: input.fileName, mimeType, sizeBytes: bytes.length, entityType: "ImportJob", uploadedById: user.id } });
      await db.importJob.create({
        data: { kind: input.kind, attachmentId: att.id, mapping, status: check.committed ? "COMMITTED" : "FAILED", rowCount, errorCount: errors.length, errors: errors.length ? errors.slice(0, 200) : undefined, createdById: user.id, committedAt: check.committed ? new Date() : null },
      });
      revalidatePath("/admin/import");
    }
    if (input.commit && check.committed) return { ok: true, message: `Imported: ${check.created ?? 0} added, ${check.updated ?? 0} updated.` };
    if (errors.length) return { ok: true, message: `${errors.length} problem(s) to fix before importing.` };
    return { ok: true, message: `Dry run passed: ${parsed.rows.length} row(s) ready to import.` };
  });
  return { ...res, ok: !!res?.ok, check };
}

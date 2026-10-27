import JSZip from "jszip";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import Papa from "papaparse";
import { manilaDateString } from "@/lib/dates";

export const maxDuration = 300;

const SECRET = /hash|token|secret|password/i;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  return String(v);
}

/** Owner only: every table as CSV in one ZIP (passwords and PIN hashes left out). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.isOwner) return new NextResponse("Forbidden", { status: 403 });
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const model of Object.values(Prisma.ModelName)) {
    const delegate = (db as unknown as Record<string, { findMany: () => Promise<Record<string, unknown>[]> }>)[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate?.findMany) continue;
    const rows = await delegate.findMany();
    counts[model] = rows.length;
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !SECRET.test(k));
    zip.file(`${model}.csv`, `\uFEFF${Papa.unparse({ fields: keys, data: rows.map((r) => keys.map((k) => cell(r[k]))) })}`);
  }
  zip.file("README.txt", `Wingboss full export ${new Date().toISOString()}\nOne CSV per table. Amounts ending in "Cents" are centavos (divide by 100). Uploaded files (receipts, DTR photos) stay in storage.\n`);
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await db.$transaction((tx) => writeAudit(tx, { actorId: user.id, action: "EXPORT", entityType: "Everything", entityId: "all", after: { tables: Object.keys(counts).length, rows: Object.values(counts).reduce((a, b) => a + b, 0) } }));
  return new NextResponse(body as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="wingboss-export-${manilaDateString()}.zip"` } });
}

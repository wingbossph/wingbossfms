import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, AuthorizationError } from "@/server/auth/session";
import { buildReport, REPORTS } from "@/domains/reports/registry";
import { toCsvText, toPdf, toXlsx } from "@/server/export/render";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";

/** /api/export/report/<name>?format=xlsx|pdf|csv&<report params> */
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { name } = await params;
  if (!REPORTS[name]) return new NextResponse("Not found", { status: 404 });
  const p = Object.fromEntries(request.nextUrl.searchParams.entries());
  const format = p.format ?? "xlsx";
  try {
    const { doc } = await buildReport(name, user, p);
    const file = `${name}-${manilaDateString()}`;
    await db.$transaction((tx) => writeAudit(tx, { actorId: user.id, action: "EXPORT", entityType: "Report", entityId: name, after: { format, params: p } }));
    if (format === "csv") {
      return new NextResponse(`﻿${toCsvText(doc)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
    }
    if (format === "pdf") {
      const pdf = await toPdf(doc);
      return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}.pdf"` } });
    }
    const xlsx = await toXlsx(doc);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}.xlsx"` },
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return new NextResponse("Forbidden", { status: 403 });
    throw e;
  }
}

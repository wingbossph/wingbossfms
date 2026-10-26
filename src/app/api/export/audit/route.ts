import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { queryAudit, describeChange, type AuditFilters } from "@/domains/admin/audit-query";
import { toCsv } from "@/lib/csv";
import { formatDateTime, manilaDateString } from "@/lib/dates";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";

const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.access.canAnywhere("audit:view")) return new NextResponse("Forbidden", { status: 403 });

  const p = request.nextUrl.searchParams;
  const filters: AuditFilters = Object.fromEntries(
    ["from", "to", "location", "category", "action", "user", "entityId"].flatMap((k) => {
      const v = p.get(k);
      return v ? [[k, v]] : [];
    }),
  );

  const entries = await queryAudit(user, filters, MAX_ROWS);
  const csv = toCsv([
    ["When (Asia/Manila)", "Who", "Location", "Action", "Record type", "Record id", "Before", "After", "Change", "Reason", "IP"],
    ...entries.map((e) => [
      formatDateTime(e.at),
      e.user?.name ?? "System",
      e.location?.name ?? "",
      e.action,
      e.entityType,
      e.entityId,
      e.before ? JSON.stringify(e.before) : "",
      e.after ? JSON.stringify(e.after) : "",
      describeChange(e.before, e.after),
      e.reason ?? "",
      e.ip ?? "",
    ]),
  ]);

  await db.$transaction((tx) =>
    writeAudit(tx, {
      actorId: user.id,
      action: "EXPORT",
      entityType: "AuditLog",
      entityId: "export",
      after: { filters, rows: entries.length },
    }),
  );

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${manilaDateString()}.csv"`,
    },
  });
}

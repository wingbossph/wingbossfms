import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { kindDef, templateCsv } from "@/domains/migration/kinds";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const def = kindDef((await params).kind);
  if (!def) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(`﻿${templateCsv(def)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="wingboss-${def.kind.toLowerCase().replace(/_/g, "-")}-template.csv"` } });
}

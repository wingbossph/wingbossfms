import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, locationsWithAny } from "@/server/auth/session";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { getSetting } from "@/domains/admin/settings";
import { LOAN_LABEL } from "@/domains/payroll/compute";
import { formatDate } from "@/lib/dates";
import type { PayslipDoc } from "@/server/export/payslip-pdf";

/** /api/payroll/runs/<id>/payslips[?employee=<id>] → PDF, one page per employee. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const employeeId = request.nextUrl.searchParams.get("employee");
  const run = await db.payrollRun.findUnique({
    where: { id },
    include: { lines: { where: employeeId ? { employeeId } : {}, include: { employee: true, items: true }, orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }] } },
  });
  if (!run) return new NextResponse("Not found", { status: 404 });
  const allowed = locationsWithAny(user, "payroll:run", "payroll:approve", "reports:payroll:view");
  // Staff may download their own payslip once the run is approved.
  const lines = run.lines.filter((l) => (run.status === "POSTED" && l.employee.userId === user.id) || (l.items.length > 0 && l.items.every((i) => allowed.includes(i.locationId))));
  if (!lines.length) return new NextResponse("Forbidden", { status: 403 });

  const business = await getSetting(db, "business.name");
  const period = run.type === "THIRTEENTH_MONTH" ? `13th month pay ${run.periodStart.toISOString().slice(0, 4)}` : `${formatDate(run.periodStart)} to ${formatDate(run.periodEnd)}`;
  const group = (items: (typeof lines)[number]["items"], kind: string) => {
    const m = new Map<string, bigint>();
    for (const i of items.filter((x) => x.kind === kind)) {
      const label = i.code === "LOAN" ? (i.description ?? "Loan") : (i.description ?? i.code);
      m.set(label, (m.get(label) ?? 0n) + i.amountCents);
    }
    return [...m.entries()].map(([label, amount]) => ({ label, amount }));
  };
  const loans = await db.employeeLoan.findMany({ where: { id: { in: lines.flatMap((l) => l.items.flatMap((i) => (i.loanId ? [i.loanId] : []))) } } });
  const slips: PayslipDoc[] = lines.map((l) => {
    const snap = l.snapshot as { attendance?: { present: number; absent: number; paidLeave: number; lateMinutes: number; otMinutes: number }; notes?: string[]; note?: string; dailyRateCents?: string; rateType?: string };
    const a = snap.attendance;
    const e = l.employee;
    const loanNotes = loans.filter((x) => l.items.some((i) => i.loanId === x.id)).map((x) => `${LOAN_LABEL[x.type]} balance now: PHP ${(Number(x.balanceCents) / 100).toFixed(2)}`);
    return {
      business,
      period,
      payDate: formatDate(run.payDate),
      employee: { name: `${e.lastName}, ${e.firstName}${e.middleName ? ` ${e.middleName[0]}.` : ""}`, code: e.code, position: e.position, ids: [e.sssNo && `SSS ${e.sssNo}`, e.philhealthNo && `PhilHealth ${e.philhealthNo}`, e.pagibigNo && `Pag-IBIG ${e.pagibigNo}`, e.tin && `TIN ${e.tin}`].filter(Boolean).join(" · ") },
      attendance: a ? `Days worked ${Number(l.daysWorked)} · absent ${a.absent} · paid leave ${a.paidLeave} · late/undertime ${a.lateMinutes} min · OT ${(a.otMinutes / 60).toFixed(1)} h${snap.dailyRateCents ? ` · daily rate PHP ${(Number(snap.dailyRateCents) / 100).toFixed(2)}` : ""}` : (snap.note ?? ""),
      earnings: group(l.items, "EARNING"),
      deductions: group(l.items, "DEDUCTION"),
      employer: group(l.items, "EMPLOYER_SHARE"),
      gross: l.grossCents,
      totalDeductions: l.deductionsCents,
      net: l.netCents,
      notes: [...(snap.notes ?? []), ...loanNotes, ...(run.status === "DRAFT" ? ["DRAFT: not yet approved."] : [])],
    };
  });
  await db.$transaction((tx) => writeAudit(tx, { actorId: user.id, action: "EXPORT", entityType: "Payslip", entityId: run.id, after: { employees: slips.length } }));
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { PayslipsPdf } = await import("@/server/export/payslip-pdf");
  const pdf = await renderToBuffer(PayslipsPdf({ slips }));
  const name = employeeId && lines[0] ? `payslip-${lines[0].employee.code}-${run.periodEnd.toISOString().slice(0, 10)}` : `payslips-${run.periodEnd.toISOString().slice(0, 10)}`;
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` } });
}

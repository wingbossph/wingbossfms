import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { locationsWithAny, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDate, formatDateTime, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { RunActions } from "./run-actions";

export const metadata = { title: "Payroll run" };

const GROUPS: Record<string, string[]> = {
  basic: ["BASIC", "LATE_UT", "ABSENCE"],
  ot: ["OT", "ND"],
  premium: ["HOLIDAY", "RESTDAY"],
  other: ["ALLOWANCE", "ALLOWANCE_TX", "SERVICE_CHARGE", "THIRTEENTH"],
  sss: ["SSS_EE"],
  phic: ["PHIC_EE"],
  hdmf: ["HDMF_EE"],
  tax: ["WTAX"],
  loans: ["LOAN"],
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const run = await db.payrollRun.findUnique({
    where: { id },
    include: { lines: { include: { employee: true, items: { include: { location: true } } }, orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }] } },
  });
  if (!run) notFound();
  const allowed = locationsWithAny(user, "payroll:run", "reports:payroll:view", "payroll:approve");
  if (!allowed.length) redirect("/forbidden");
  const lines = run.lines.filter((l) => l.items.length === 0 || l.items.some((i) => allowed.includes(i.locationId)));
  const allInScope = run.lines.every((l) => l.items.every((i) => allowed.includes(i.locationId)));
  const sumOf = (items: { code: string; amountCents: bigint }[], codes: string[]) => items.filter((i) => codes.includes(i.code)).reduce((a, i) => a + i.amountCents, 0n);
  const total = (k: string) => lines.reduce((a, l) => a + sumOf(l.items, GROUPS[k]), 0n);

  const byLoc = new Map<string, { name: string; earnings: bigint; employer: bigint }>();
  for (const l of lines)
    for (const i of l.items) {
      const cur = byLoc.get(i.locationId) ?? { name: i.location.name, earnings: 0n, employer: 0n };
      if (i.kind === "EARNING") cur.earnings += i.amountCents;
      if (i.kind === "EMPLOYER_SHARE") cur.employer += i.amountCents;
      byLoc.set(i.locationId, cur);
    }
  const people = await db.user.findMany({ where: { id: { in: [run.preparedById, run.approvedById ?? ""] } }, select: { id: true, name: true } });
  const accounts = await db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["BANK", "EWALLET", "PETTY_CASH", "OWNER_PERSONAL", "UNDEPOSITED_CASH"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const can = (p: string) => allInScope && user.access.canAnywhere(p);
  const title = run.type === "THIRTEENTH_MONTH" ? `13th month pay ${formatDate(run.periodStart).slice(-4)}` : `Payroll ${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}`;

  return (
    <>
      <PageHeader
        title={title}
        description={`Pay date ${formatDate(run.payDate)} · prepared by ${people.find((p) => p.id === run.preparedById)?.name ?? "—"}${run.approvedById ? ` · approved by ${people.find((p) => p.id === run.approvedById)?.name}` : ""}${run.paidAt ? ` · paid ${formatDateTime(run.paidAt)}` : ""}`}
        actions={<Badge className="h-8 px-3 text-sm">{run.status === "DRAFT" ? "Draft" : run.status === "POSTED" ? (run.paidAt ? "Approved · paid" : "Approved · unpaid") : "Voided"}</Badge>}
      />
      <RunActions
        runId={run.id}
        status={run.status}
        paid={!!run.paidAt}
        canRun={can("payroll:run")}
        canApprove={can("payroll:approve")}
        canVoid={can("records:void")}
        accounts={accounts}
        today={manilaDateString()}
        payDate={run.payDate.toISOString().slice(0, 10)}
      />
      {run.status !== "DRAFT" && (
        <p className="no-print mb-4 text-sm">
          <a href={`/api/payroll/runs/${run.id}/payslips`} className="underline underline-offset-4">
            Download all payslips (PDF)
          </a>{" "}
          ·{" "}
          <Link href={`/reports/payroll-register?run=${run.id}`} className="underline underline-offset-4">
            Register report (Excel/PDF)
          </Link>
        </p>
      )}
      <SimpleTable
        head={["Employee", "Days", "Basic", "OT / ND", "Holiday / rest", "Allowances", "Gross", "SSS", "PhilHealth", "Pag-IBIG", "Tax", "Loans", "Net pay"]}
        rows={[
          ...lines.map((l) => {
            const notes = ((l.snapshot as { notes?: string[] }).notes ?? []).join(" ");
            return [
              <div key="e">
                <a href={`/api/payroll/runs/${run.id}/payslips?employee=${l.employeeId}`} className="font-semibold underline underline-offset-4">
                  {l.employee.lastName}, {l.employee.firstName}
                </a>
                <div className="text-xs text-muted-foreground">
                  {[...new Set(l.items.map((i) => i.location.code))].join(" + ")}
                  {notes ? ` · ${notes}` : ""}
                </div>
              </div>,
              Number(l.daysWorked),
              formatPeso(sumOf(l.items, GROUPS.basic), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.ot), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.premium), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.other), { symbol: false }),
              <strong key="g">{formatPeso(l.grossCents, { symbol: false })}</strong>,
              formatPeso(sumOf(l.items, GROUPS.sss), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.phic), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.hdmf), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.tax), { symbol: false }),
              formatPeso(sumOf(l.items, GROUPS.loans), { symbol: false }),
              <strong key="n">{formatPeso(l.netCents)}</strong>,
            ];
          }),
          [
            <strong key="t">Total ({lines.length})</strong>,
            "",
            formatPeso(total("basic"), { symbol: false }),
            formatPeso(total("ot"), { symbol: false }),
            formatPeso(total("premium"), { symbol: false }),
            formatPeso(total("other"), { symbol: false }),
            <strong key="g">{formatPeso(lines.reduce((a, l) => a + l.grossCents, 0n), { symbol: false })}</strong>,
            formatPeso(total("sss"), { symbol: false }),
            formatPeso(total("phic"), { symbol: false }),
            formatPeso(total("hdmf"), { symbol: false }),
            formatPeso(total("tax"), { symbol: false }),
            formatPeso(total("loans"), { symbol: false }),
            <strong key="n">{formatPeso(lines.reduce((a, l) => a + l.netCents, 0n))}</strong>,
          ],
        ]}
        empty="No payslips: nobody had attendance in this period."
      />
      <h2 className="mt-8 mb-2 text-2xl">Labor cost by location</h2>
      <SimpleTable
        head={["Location", "Pay", "Employer share & 13th month accrual", "Total labor cost"]}
        rows={[...byLoc.values()].map((v) => [v.name, formatPeso(v.earnings), formatPeso(v.employer), <strong key="t">{formatPeso(v.earnings + v.employer)}</strong>])}
      />
    </>
  );
}

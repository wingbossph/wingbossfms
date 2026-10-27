import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { allowancesOf } from "@/domains/payroll/service";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { EmployeeForm } from "../employee-form";
import { AssignmentForm, CompensationForm } from "./history-forms";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const e = await db.employee.findUnique({ where: { id }, include: { assignments: { include: { location: true }, orderBy: { effectiveFrom: "desc" } }, compensations: { orderBy: { effectiveFrom: "desc" } }, loans: { orderBy: { startDate: "desc" } } } });
  if (!e) notFound();
  const home = e.assignments[0]?.locationId;
  if (!home || !user.access.can("employees:view", home)) redirect("/forbidden");
  const canManage = user.access.can("employees:manage", home);
  const canSeePay = user.access.can("payroll:run", home) || user.access.can("reports:payroll:view", home);
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const manageLocs = user.locations.filter((l) => user.access.can("employees:manage", l.id)).map((l) => ({ id: l.id, name: l.name }));
  const payslips = canSeePay ? await db.payrollLine.findMany({ where: { employeeId: e.id, run: { status: "POSTED" } }, include: { run: true }, orderBy: { run: { periodEnd: "desc" } }, take: 24 }) : [];
  return (
    <>
      <PageHeader title={`${e.firstName} ${e.lastName}`} description={`${e.code} · ${e.position} · ${e.assignments[0]?.location.name ?? ""}`} />
      <div className="max-w-4xl space-y-10">
        {canManage ? (
          <EmployeeForm
            locations={manageLocs}
            today={manilaDateString()}
            initial={{ id: e.id, code: e.code, firstName: e.firstName, lastName: e.lastName, middleName: e.middleName ?? "", position: e.position, status: e.status, startDate: ymd(e.startDate), endDate: ymd(e.endDate), sssNo: e.sssNo ?? "", philhealthNo: e.philhealthNo ?? "", pagibigNo: e.pagibigNo ?? "", tin: e.tin ?? "", isMinimumWageEarner: e.isMinimumWageEarner, payoutMethod: e.payoutMethod ?? "Cash", payoutRef: e.payoutRef ?? "" }}
          />
        ) : (
          <p className="text-sm">
            Started {formatDate(e.startDate)} · {e.status.toLowerCase()} {e.isMinimumWageEarner ? "· minimum wage earner" : ""}
          </p>
        )}
        <section>
          <h2 className="mb-2 text-2xl">Location history</h2>
          <SimpleTable head={["From", "To", "Location"]} rows={e.assignments.map((a) => [formatDate(a.effectiveFrom), a.effectiveTo ? formatDate(a.effectiveTo) : "now", a.location.name])} />
          {canManage && <AssignmentForm employeeId={e.id} locations={manageLocs} today={manilaDateString()} />}
        </section>
        {canSeePay && (
          <section>
            <h2 className="mb-2 text-2xl">Pay rate history</h2>
            <SimpleTable
              head={["From", "Rate", "Days/year", "Allowances per cut-off"]}
              rows={e.compensations.map((c) => [formatDate(c.effectiveFrom), `${formatPeso(c.rateCents)} / ${c.rateType === "DAILY" ? "day" : "month"}`, c.daysPerYear, allowancesOf(c.allowances).map((a) => `${a.name} ${formatPeso(a.cents)}${a.taxable ? " (taxable)" : ""}`).join(", ") || "—"])}
            />
            {canManage && <CompensationForm employeeId={e.id} today={manilaDateString()} current={e.compensations[0] ? { rateType: e.compensations[0].rateType, rate: (Number(e.compensations[0].rateCents) / 100).toFixed(2), daysPerYear: e.compensations[0].daysPerYear, allowances: allowancesOf(e.compensations[0].allowances).map((a) => ({ name: a.name, amount: (Number(a.cents) / 100).toFixed(2), taxable: a.taxable })) } : null} />}
          </section>
        )}
        {canSeePay && (
          <section>
            <h2 className="mb-2 text-2xl">Payslips</h2>
            <SimpleTable
              head={["Period", "Gross", "Net", ""]}
              rows={payslips.map((p) => [`${formatDate(p.run.periodStart)} – ${formatDate(p.run.periodEnd)}${p.run.type === "THIRTEENTH_MONTH" ? " (13th month)" : ""}`, formatPeso(p.grossCents), formatPeso(p.netCents), <a key="d" href={`/api/payroll/runs/${p.runId}/payslips?employee=${e.id}`} className="underline underline-offset-4">PDF</a>])}
              empty="No approved payslips yet."
            />
          </section>
        )}
      </div>
    </>
  );
}

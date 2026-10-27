import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/domains/admin/settings";
import { cutoffOf, defaultPayDate, previousCutoff } from "@/domains/payroll/compute";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { NewRunForm } from "./new-run-form";

export const metadata = { title: "Payroll" };

const STATUS: Record<string, string> = { DRAFT: "Draft", POSTED: "Approved", VOIDED: "Voided" };

export default async function PayrollPage() {
  const user = await requireUser();
  const can = (p: string) => user.access.canAnywhere(p);
  if (!can("payroll:run") && !can("reports:payroll:view")) redirect(can("payroll:attendance") ? "/payroll/attendance" : "/payroll/employees");
  const runs = await db.payrollRun.findMany({ include: { lines: { select: { netCents: true, grossCents: true, employerCostCents: true } } }, orderBy: [{ periodStart: "desc" }, { type: "asc" }], take: 60 });
  const today = manilaDateString();
  const last = previousCutoff(today);
  const current = cutoffOf(today);
  const [p1, p2] = await Promise.all([getSetting(db, "payroll.firstPayDay"), getSetting(db, "payroll.secondPayDay")]);
  const options = [last, current].map((c) => ({ start: c.start, end: c.end, payDate: defaultPayDate(c, p1, p2) }));
  return (
    <>
      <PageHeader title="Payroll" description="Semi-monthly payroll from the DTRs: compute, review, approve (posts to the books), then mark paid." />
      {can("payroll:run") && <NewRunForm cutoffs={options} year={today.slice(0, 4)} serviceChargeToStaff={await getSetting(db, "sales.serviceChargeToStaff")} />}
      <h2 className="mt-8 mb-2 text-2xl">Runs</h2>
      <SimpleTable
        head={["Period", "Type", "Pay date", "Payslips", "Gross", "Net pay", "Labor cost", "Status"]}
        rows={runs.map((r) => [
          <Link key="p" href={`/payroll/runs/${r.id}`} className="font-semibold underline underline-offset-4">
            {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
          </Link>,
          r.type === "THIRTEENTH_MONTH" ? "13th month" : "Regular",
          formatDate(r.payDate),
          r.lines.length,
          formatPeso(r.lines.reduce((a, l) => a + l.grossCents, 0n)),
          formatPeso(r.lines.reduce((a, l) => a + l.netCents, 0n)),
          formatPeso(r.lines.reduce((a, l) => a + l.employerCostCents, 0n)),
          <Badge key="s" variant={r.status === "DRAFT" ? "destructive" : "outline"}>
            {STATUS[r.status]}
            {r.status === "POSTED" ? (r.paidAt ? " · paid" : " · unpaid") : ""}
          </Badge>,
        ])}
        empty="No payroll runs yet. Encode the DTR, approve it, then compute the payroll."
      />
    </>
  );
}

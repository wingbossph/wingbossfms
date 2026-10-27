import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { LOAN_LABEL } from "@/domains/payroll/compute";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { LoanForm, StopLoanButton } from "./loan-form";

export const metadata = { title: "Loans & advances" };

export default async function LoansPage() {
  const user = await requirePagePermission("payroll:run");
  const ids = locationsWithAny(user, "payroll:run");
  const [loans, employees, accounts] = await Promise.all([
    db.employeeLoan.findMany({ where: { employee: { assignments: { some: { locationId: { in: ids } } } } }, include: { employee: true }, orderBy: [{ isActive: "desc" }, { startDate: "desc" }] }),
    db.employee.findMany({ where: { status: "ACTIVE", assignments: { some: { locationId: { in: ids } } } }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["PETTY_CASH", "BANK", "EWALLET", "OWNER_PERSONAL", "CASH_DRAWER"] }, OR: [{ locationId: null }, { locationId: { in: ids } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Loans & cash advances" description="Deducted automatically from each payroll until paid off. SSS and Pag-IBIG loans are collected here and remitted with contributions." />
      <LoanForm employees={employees.map((e) => ({ id: e.id, name: `${e.lastName}, ${e.firstName}` }))} accounts={accounts} today={manilaDateString()} />
      <h2 className="mt-8 mb-2 text-2xl">All loans</h2>
      <SimpleTable
        head={["Employee", "Type", "Started", "Amount", "Per payroll", "Balance", ""]}
        rows={loans.map((l) => [
          `${l.employee.lastName}, ${l.employee.firstName}`,
          LOAN_LABEL[l.type],
          formatDate(l.startDate),
          formatPeso(l.principalCents),
          formatPeso(l.perPayrollCents),
          <strong key="b">{formatPeso(l.balanceCents)}</strong>,
          l.balanceCents > 0n ? <StopLoanButton key="s" loanId={l.id} active={l.isActive} /> : "Paid off",
        ])}
        empty="No loans or advances."
      />
    </>
  );
}

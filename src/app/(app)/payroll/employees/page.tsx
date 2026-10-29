import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { EmployeeForm } from "./employee-form";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ new?: string; show?: string; location?: string }> }) {
  const user = await requirePagePermission("employees:view");
  const sp = await searchParams;
  const allIds = locationsWithAny(user, "employees:view");
  // Top-bar location: staff whose current home location is that branch.
  const ids = sp.location && allIds.includes(sp.location) ? [sp.location] : allIds;
  const employees = await db.employee.findMany({
    where: { assignments: { some: { locationId: { in: ids } } }, ...(sp.show === "all" ? {} : { status: { in: ["ACTIVE", "ON_LEAVE"] } }) },
    include: { assignments: { include: { location: true }, orderBy: { effectiveFrom: "desc" }, take: 1 }, compensations: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const manageIds = locationsWithAny(user, "employees:manage");
  const canSeePay = user.access.canAnywhere("payroll:run") || user.access.canAnywhere("reports:payroll:view");
  return (
    <>
      <PageHeader title="Employees" description="Staff records, home location and pay rate. Rates and locations keep their history." />
      {manageIds.length > 0 && (
        <details className="mb-6 rounded-lg border p-4" open={sp.new === "1"}>
          <summary className="cursor-pointer font-semibold">Add an employee</summary>
          <div className="mt-4">
            <EmployeeForm locations={user.locations.filter((l) => manageIds.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))} today={manilaDateString()} />
          </div>
        </details>
      )}
      <p className="mb-2 text-sm">
        <Link href={sp.show === "all" ? "/payroll/employees" : "/payroll/employees?show=all"} className="underline underline-offset-4">
          {sp.show === "all" ? "Show active only" : "Show resigned too"}
        </Link>
      </p>
      <SimpleTable
        head={["Code", "Name", "Position", "Location", "Since", ...(canSeePay ? ["Rate"] : []), "Status"]}
        rows={employees.map((e) => [
          e.code,
          <Link key="n" href={`/payroll/employees/${e.id}`} className="font-semibold underline underline-offset-4">
            {e.lastName}, {e.firstName}
          </Link>,
          e.position,
          e.assignments[0]?.location.name ?? "—",
          formatDate(e.startDate),
          ...(canSeePay ? [e.compensations[0] ? `${formatPeso(e.compensations[0].rateCents)} / ${e.compensations[0].rateType === "DAILY" ? "day" : "month"}` : "—"] : []),
          <Badge key="s" variant={e.status === "ACTIVE" ? "outline" : "secondary"}>
            {e.status.replace("_", " ").toLowerCase()}
            {e.isMinimumWageEarner ? " · MWE" : ""}
          </Badge>,
        ])}
        empty="No employees yet."
      />
    </>
  );
}

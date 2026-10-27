import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { ensurePayrollSetup } from "@/domains/payroll/setup";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { DeleteHolidayButton, HolidayForm, TableEditor } from "./setup-forms";

export const metadata = { title: "Holidays & tables" };

const KIND_LABEL: Record<string, string> = { SSS: "SSS", PHILHEALTH: "PhilHealth", PAGIBIG: "Pag-IBIG", WITHHOLDING_TAX: "Withholding tax" };
const HOL: Record<string, string> = { REGULAR: "Regular holiday", SPECIAL_NON_WORKING: "Special non-working", SPECIAL_WORKING: "Special working" };
const pesos = (c: bigint | null) => (c === null ? "" : (Number(c) / 100).toFixed(2));

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requirePagePermission("payroll:run");
  await db.$transaction((tx) => ensurePayrollSetup(tx));
  const year = /^\d{4}$/.test((await searchParams).year ?? "") ? (await searchParams).year! : manilaDateString().slice(0, 4);
  const [holidays, tables] = await Promise.all([
    db.holiday.findMany({ where: { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } }, include: { location: true }, orderBy: { date: "asc" } }),
    db.contributionTable.findMany({ include: { brackets: true }, orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }] }),
  ]);
  const locs = user.locations.filter((l) => locationsWithAny(user, "payroll:run").includes(l.id)).map((l) => ({ id: l.id, name: l.name }));
  const latest = Object.keys(KIND_LABEL).map((k) => tables.find((t) => t.kind === k)).filter((t): t is NonNullable<typeof t> => !!t);
  return (
    <>
      <PageHeader title="Holidays & government tables" description="Holiday premiums and contributions are computed from these. Change them here when the government announces new dates or rates." />
      <section className="max-w-4xl">
        <h2 className="mb-2 text-2xl">Holidays {year}</h2>
        <p className="mb-2 text-sm text-muted-foreground">Islamic holidays (Eid&apos;l Fitr, Eid&apos;l Adha) and other proclaimed days are announced each year: add them when published.</p>
        <SimpleTable head={["Date", "Holiday", "Type", "Applies to", ""]} rows={holidays.map((h) => [formatDate(h.date), h.name, HOL[h.type], h.location?.name ?? "All locations", <DeleteHolidayButton key="d" id={h.id} />])} empty="No holidays for this year yet." />
        <HolidayForm locations={locs} year={year} />
      </section>
      <section className="mt-10 max-w-5xl space-y-8">
        <h2 className="text-2xl">Government tables in use</h2>
        {latest.map((t) => (
          <div key={t.id} className="space-y-2">
            <h3 className="text-lg font-semibold">
              {KIND_LABEL[t.kind]}: {t.name} <span className="text-sm font-normal text-muted-foreground">from {formatDate(t.effectiveFrom)}</span>
            </h3>
            <SimpleTable
              head={["From", "To", "Excess over", "Employee fixed", "Employee rate", "Employer fixed", "Employer rate", "EC"]}
              rows={[...t.brackets]
                .sort((a, b) => (a.minCents < b.minCents ? -1 : 1))
                .map((b) => [formatPeso(b.minCents), b.maxCents === null ? "and up" : formatPeso(b.maxCents), b.excessOverCents ? formatPeso(b.excessOverCents) : "", b.eeFixedCents ? formatPeso(b.eeFixedCents) : "", b.eeRateBp ? `${b.eeRateBp / 100}%` : "", b.erFixedCents ? formatPeso(b.erFixedCents) : "", b.erRateBp ? `${b.erRateBp / 100}%` : "", b.ecFixedCents ? formatPeso(b.ecFixedCents) : ""])}
            />
            {user.isOwner && (
              <TableEditor
                kind={t.kind}
                basis={t.basis as "MONTHLY" | "SEMI_MONTHLY"}
                today={manilaDateString()}
                rows={[...t.brackets]
                  .sort((a, b) => (a.minCents < b.minCents ? -1 : 1))
                  .map((b) => ({ min: pesos(b.minCents), max: pesos(b.maxCents), excessOver: pesos(b.excessOverCents), eeFixed: pesos(b.eeFixedCents), eeRateBp: String(b.eeRateBp), erFixed: pesos(b.erFixedCents), erRateBp: String(b.erRateBp), ecFixed: pesos(b.ecFixedCents) }))}
              />
            )}
          </div>
        ))}
      </section>
    </>
  );
}

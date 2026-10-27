import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { RemitForm } from "./remit-form";

export const metadata = { title: "Remittances" };

const KINDS = [
  { kind: "SSS", label: "SSS", key: "SSS_PAYABLE" },
  { kind: "PHILHEALTH", label: "PhilHealth", key: "PHIC_PAYABLE" },
  { kind: "PAGIBIG", label: "Pag-IBIG", key: "HDMF_PAYABLE" },
  { kind: "WITHHOLDING_TAX", label: "BIR withholding (1601-C)", key: "WTAX_COMP_PAYABLE" },
] as const;

export default async function RemittancesPage() {
  const user = await requirePagePermission("payroll:approve", "reports:payroll:view");
  const accounts = await db.account.findMany({ where: { systemKey: { in: KINDS.map((k) => k.key) } } });
  const bal = await db.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: accounts.map((a) => a.id) } }, _sum: { debitCents: true, creditCents: true } });
  const owed = (k: string) => {
    const a = accounts.find((x) => x.systemKey === k);
    const b = bal.find((x) => x.accountId === a?.id);
    return (b?._sum.creditCents ?? 0n) - (b?._sum.debitCents ?? 0n);
  };
  const money = await db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["BANK", "EWALLET", "PETTY_CASH", "OWNER_PERSONAL"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const month = manilaDateString().slice(0, 7);
  return (
    <>
      <PageHeader title="Government remittances" description="What payroll has withheld and the employer shares still to be paid to SSS, PhilHealth, Pag-IBIG and BIR." />
      <SimpleTable head={["Agency", "Still to remit"]} rows={KINDS.map((k) => [k.label, <strong key="o">{formatPeso(owed(k.key))}</strong>])} />
      <p className="mt-3 text-sm">
        Per-employee breakdown for the monthly forms:{" "}
        <Link href="/reports/payroll-remittances" className="underline underline-offset-4">
          Remittance report
        </Link>
      </p>
      {user.access.canAnywhere("payroll:approve") && (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-2xl">Record a payment</h2>
          <RemitForm accounts={money} today={manilaDateString()} month={month} owed={Object.fromEntries(KINDS.map((k) => [k.kind, (Number(owed(k.key)) / 100).toFixed(2)]))} />
        </section>
      )}
    </>
  );
}

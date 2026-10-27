import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { AttachmentList } from "@/components/forms/photo-input";
import { SimpleTable } from "@/components/data-table/simple-table";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { attachmentsFor } from "@/server/attachments";
import { expenseFormData } from "@/domains/expenses/form-data";
import { EXPENSE_STATUS_LABEL } from "@/domains/expenses/labels";
import { canApproveWith } from "@/domains/expenses/rules";
import { formatBusinessDate, formatDateTime, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { ExpenseForm } from "../expense-form";
import { ExpenseActions } from "./expense-actions";

export const metadata = { title: "Expense" };

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const e = await db.expense.findUnique({
    where: { id },
    include: {
      location: true,
      supplier: true,
      lines: { include: { account: true, item: true } },
      payments: { include: { moneyAccount: true }, orderBy: { date: "asc" } },
    },
  });
  if (!e) notFound();
  const can = (p: string) => user.access.can(p, e.locationId);
  const isOwn = e.submittedById === user.id;
  if (!can("expenses:view") && !(can("expenses:create") && isOwn)) redirect("/forbidden");

  const approver = canApproveWith(e.requiredApproval ?? "expenses:approve", can);
  const editable =
    ((e.status === "DRAFT" || e.status === "REJECTED") && (isOwn || can("expenses:approve")) && can("expenses:create")) ||
    (e.status === "SUBMITTED" && approver && edit === "1");

  const [files, people, paidFrom] = await Promise.all([
    attachmentsFor(db, "Expense", e.id),
    db.user.findMany({ where: { id: { in: [e.submittedById, e.approvedById ?? ""] } }, select: { id: true, name: true } }),
    e.paidFromMoneyAccountId ? db.moneyAccount.findUnique({ where: { id: e.paidFromMoneyAccountId } }) : null,
  ]);
  const name = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "—";

  if (editable) {
    const data = await expenseFormData(user);
    return (
      <>
        <PageHeader title={`Expense #${e.number}`} description={`${EXPENSE_STATUS_LABEL[e.status]} · ${e.location.name}`} />
        {e.status === "REJECTED" && e.notes && <p className="mb-4 whitespace-pre-line rounded-md border border-destructive p-3 text-sm">{e.notes}</p>}
        <ExpenseForm
          data={data}
          today={manilaDateString()}
          updatedAt={e.updatedAt.toISOString()}
          initial={{
            id: e.id,
            locationId: e.locationId,
            date: e.date.toISOString().slice(0, 10),
            supplierId: e.supplierId ?? "",
            newSupplierName: "",
            terms: e.terms,
            paidFromMoneyAccountId: e.paidFromMoneyAccountId ?? "",
            dueDate: e.dueDate?.toISOString().slice(0, 10) ?? "",
            receiptNo: e.receiptNo ?? "",
            notes: e.status === "REJECTED" ? "" : e.notes ?? "",
            lines: e.lines.map((l) => ({
              kind: l.itemId ? ("item" as const) : ("category" as const),
              accountId: l.itemId ? "" : l.accountId,
              itemId: l.itemId ?? "",
              qty: l.qty?.toString() ?? "",
              unit: l.item && l.unit === l.item.purchaseUnit && l.unit !== l.item.baseUnit ? ("PURCHASE" as const) : ("BASE" as const),
              description: l.description ?? "",
              amount: formatPeso(l.amountCents, { symbol: false }),
            })),
          }}
        />
        {files.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xl">Attached</h2>
            <AttachmentList files={files} />
          </section>
        )}
      </>
    );
  }

  const balance = e.totalCents - e.paidCents;
  const moneyAccounts = await db.moneyAccount.findMany({
    where: { isActive: true, kind: { in: ["BANK", "EWALLET", "PETTY_CASH", "CASH_DRAWER", "OWNER_PERSONAL"] }, OR: [{ locationId: null }, { locationId: e.locationId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader
        title={`Expense #${e.number}`}
        description={`${e.location.name} · ${formatBusinessDate(e.date)}`}
        actions={
          <>
            <Badge variant={e.status === "SUBMITTED" ? "destructive" : e.status === "POSTED" ? "default" : "outline"} className="h-8 px-3 text-sm">
              {EXPENSE_STATUS_LABEL[e.status]}
            </Badge>
            {can("audit:view") && (
              <Link href={`/admin/audit?entityId=${e.id}`} className="self-center text-sm underline underline-offset-4">
                Change history
              </Link>
            )}
          </>
        }
      />
      <div className="grid max-w-4xl gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Supplier</dt>
            <dd>{e.supplier?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Payment</dt>
            <dd>{e.terms === "PAID_NOW" ? `Paid from ${paidFrom?.name ?? "—"}` : `Bill due ${e.dueDate ? formatBusinessDate(e.dueDate) : "—"}`}</dd>
            <dt className="text-muted-foreground">Receipt no.</dt>
            <dd>{e.receiptNo ?? "—"}</dd>
            <dt className="text-muted-foreground">Entered by</dt>
            <dd>
              {name(e.submittedById)}
              {e.submittedAt ? ` · ${formatDateTime(e.submittedAt)}` : ""}
            </dd>
            <dt className="text-muted-foreground">Approved by</dt>
            <dd>{e.approvedById ? `${name(e.approvedById)} · ${formatDateTime(e.approvedAt!)}` : "—"}</dd>
          </dl>
          <SimpleTable
            head={["Category / item", "Qty", "Amount"]}
            rows={[
              ...e.lines.map((l) => [
                <span key="a">
                  {l.item ? l.item.name : l.account.name}
                  {l.description && l.description !== l.item?.name && <span className="block text-xs text-muted-foreground">{l.description}</span>}
                </span>,
                l.qty ? `${Number(l.qty)} ${l.unit ?? ""}` : "",
                <span key="m" className="tabular-nums">{formatPeso(l.amountCents)}</span>,
              ]),
              [<b key="t">Total</b>, "", <b key="v" className="tabular-nums">{formatPeso(e.totalCents)}</b>],
            ]}
          />
          {e.notes && <p className="whitespace-pre-line text-sm">{e.notes}</p>}
          {e.terms === "ON_ACCOUNT" && (
            <section>
              <h2 className="mb-2 text-xl">Payments</h2>
              <SimpleTable
                head={["Date", "From", "Reference", "Amount"]}
                rows={e.payments.map((p) => [formatBusinessDate(p.date), p.moneyAccount.name, p.reference ?? "", formatPeso(p.amountCents)])}
                empty="Not paid yet."
              />
              <p className="mt-2 text-sm">
                Balance due: <b>{formatPeso(balance)}</b>
              </p>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-xl">Receipt</h2>
            <AttachmentList files={files} />
          </section>
        </div>
        <ExpenseActions
          expenseId={e.id}
          status={e.status}
          today={manilaDateString()}
          canSubmit={(e.status === "DRAFT" || e.status === "REJECTED") && can("expenses:create")}
          canApprove={e.status === "SUBMITTED" && approver}
          needsOwner={e.requiredApproval === "expenses:approve:high"}
          canPay={e.status === "POSTED" && e.terms === "ON_ACCOUNT" && balance > 0n && can("payables:manage")}
          balance={formatPeso(balance, { symbol: false })}
          canVoid={e.status !== "VOIDED" && can("records:void")}
          moneyAccounts={moneyAccounts}
        />
      </div>
    </>
  );
}

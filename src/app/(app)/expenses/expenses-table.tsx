"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/data-table/data-table";
import { approveExpensesAction } from "@/domains/expenses/actions";
import { formatPeso } from "@/lib/money";

export type ExpenseRow = {
  id: string;
  number: number;
  date: string;
  ymd: string;
  location: string;
  supplier: string;
  category: string;
  amount: string;
  amountCents: number;
  terms: string;
  status: string;
  receipt: string;
  /** Awaiting approval and this user may approve it: gets a checkbox. */
  approvable?: boolean;
};

const columns: ColumnDef<ExpenseRow, unknown>[] = [
  {
    accessorKey: "number",
    header: "#",
    cell: ({ row }) => (
      <Link href={`/expenses/${row.original.id}`} className="font-semibold underline-offset-4 hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "ymd", header: "Date", cell: ({ row }) => row.original.date, meta: { exportValue: (r) => r.ymd } },
  { accessorKey: "location", header: "Location" },
  { accessorKey: "supplier", header: "Supplier" },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "amountCents", header: "Amount", cell: ({ row }) => row.original.amount, meta: { align: "right", exportValue: (r) => (r.amountCents / 100).toFixed(2) } },
  { accessorKey: "terms", header: "Payment" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "Posted" ? "default" : row.original.status === "Awaiting approval" ? "destructive" : "outline"}>{row.original.status}</Badge>
    ),
  },
  {
    accessorKey: "receipt",
    header: "Receipt",
    cell: ({ row }) => row.original.receipt || <span className="text-warning">None</span>,
  },
];

export function ExpensesTable({ data, emptyMessage = "No expenses in this range." }: { data: ExpenseRow[]; emptyMessage?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const approvable = useMemo(() => data.filter((r) => r.approvable), [data]);
  const picked = approvable.filter((r) => selected.has(r.id));

  const cols = useMemo<ColumnDef<ExpenseRow, unknown>[]>(() => {
    if (!approvable.length) return columns;
    const all = approvable.length > 0 && approvable.every((r) => selected.has(r.id));
    const toggle = (id: string, on: boolean) =>
      setSelected((s) => {
        const n = new Set(s);
        if (on) n.add(id);
        else n.delete(id);
        return n;
      });
    return [
      {
        id: "select",
        enableSorting: false,
        header: () => (
          <Checkbox
            checked={all}
            onCheckedChange={(c) => setSelected(c ? new Set(approvable.map((r) => r.id)) : new Set())}
            aria-label="Select all expenses awaiting approval"
          />
        ),
        cell: ({ row }) =>
          row.original.approvable ? <Checkbox checked={selected.has(row.original.id)} onCheckedChange={(c) => toggle(row.original.id, !!c)} aria-label={`Select expense #${row.original.number}`} /> : null,
      },
      ...columns,
    ];
  }, [approvable, selected]);

  function approve() {
    if (!picked.length) return;
    if (!confirm(`Approve and post ${picked.length} expense${picked.length === 1 ? "" : "s"} (${formatPeso(BigInt(picked.reduce((a, r) => a + r.amountCents, 0)))})?`)) return;
    start(async () => {
      const res = await approveExpensesAction(picked.map((r) => r.id));
      if (res?.ok) toast.success(res.message);
      else toast.error(res?.message ?? "Couldn't approve.");
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <>
      {approvable.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>
            {picked.length ? (
              <>
                <b>{picked.length}</b> selected · {formatPeso(BigInt(picked.reduce((a, r) => a + r.amountCents, 0)))}
              </>
            ) : (
              <>{approvable.length} awaiting your approval: tick them to approve several at once.</>
            )}
          </span>
          <Button size="sm" className="ml-auto" disabled={!picked.length || pending} onClick={approve}>
            <CheckCheck className="size-4" /> {pending ? "Approving…" : `Approve selected${picked.length ? ` (${picked.length})` : ""}`}
          </Button>
        </div>
      )}
      <DataTable columns={cols} data={data} exportFileName="expenses" emptyMessage={emptyMessage} />
    </>
  );
}

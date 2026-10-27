"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

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
  return <DataTable columns={columns} data={data} exportFileName="expenses" emptyMessage={emptyMessage} />;
}

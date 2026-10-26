"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

export type SalesRow = {
  id: string;
  date: string;
  ymd: string;
  location: string;
  shift: number;
  source: string;
  pax: number;
  net: string;
  netCents: number;
  status: string;
  cash: string;
  cashier: string;
};

const columns: ColumnDef<SalesRow, unknown>[] = [
  {
    accessorKey: "ymd",
    header: "Date",
    cell: ({ row }) => (
      <Link href={`/sales/${row.original.id}`} className="font-semibold underline-offset-4 hover:underline">
        {row.original.date}
      </Link>
    ),
    meta: { exportValue: (r) => r.ymd },
  },
  { accessorKey: "location", header: "Location" },
  { accessorKey: "shift", header: "Shift", meta: { align: "right" } },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "cashier", header: "Cashier" },
  { accessorKey: "pax", header: "Pax", meta: { align: "right" } },
  { accessorKey: "netCents", header: "Net sales", cell: ({ row }) => row.original.net, meta: { align: "right", exportValue: (r) => (r.netCents / 100).toFixed(2) } },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant={row.original.status === "Draft" ? "outline" : "default"}>{row.original.status}</Badge>,
  },
  {
    accessorKey: "cash",
    header: "Cash count",
    cell: ({ row }) => (
      <span className={row.original.cash.startsWith("Short") ? "font-semibold text-destructive" : row.original.cash.startsWith("Over") ? "text-warning" : ""}>{row.original.cash}</span>
    ),
  },
];

export function SalesTable({ data }: { data: SalesRow[] }) {
  return <DataTable columns={columns} data={data} exportFileName="sales" searchPlaceholder="Search…" emptyMessage="No sales in this range." />;
}

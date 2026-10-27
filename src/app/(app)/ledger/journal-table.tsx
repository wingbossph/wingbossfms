"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

type Row = { id: string; number: number; date: string; ymd: string; source: string; memo: string; locations: string; amount: string; amountCents: number; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: "number",
    header: "#",
    cell: ({ row }) => (
      <Link href={`/ledger/entries/${row.original.id}`} className="font-semibold underline-offset-4 hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "ymd", header: "Date", cell: ({ row }) => row.original.date, meta: { exportValue: (r) => r.ymd } },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "memo", header: "Description" },
  { accessorKey: "locations", header: "Locations" },
  { accessorKey: "amountCents", header: "Amount", cell: ({ row }) => row.original.amount, meta: { align: "right", exportValue: (r) => (r.amountCents / 100).toFixed(2) } },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "Posted" ? "outline" : "secondary"}>{row.original.status}</Badge> },
];

export function JournalTable({ data }: { data: Row[] }) {
  return <DataTable columns={columns} data={data} exportFileName="journal" pageSize={50} emptyMessage="No entries in this range." />;
}

"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";

type Row = { item: string; category: string; location: string; qty: number; unit: string; avg: string; value: string; valueCents: number };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "item", header: "Item", cell: ({ row }) => <span className="font-semibold">{row.original.item}</span> },
  { accessorKey: "category", header: "Category" },
  { accessorKey: "location", header: "Location" },
  { accessorKey: "qty", header: "On hand", cell: ({ row }) => `${row.original.qty.toLocaleString()} ${row.original.unit}`, meta: { align: "right" } },
  { accessorKey: "avg", header: "Avg cost / unit", meta: { align: "right" } },
  { accessorKey: "valueCents", header: "Value", cell: ({ row }) => row.original.value, meta: { align: "right", exportValue: (r) => (r.valueCents / 100).toFixed(2) } },
];

export function StockTable({ data }: { data: Row[] }) {
  return <DataTable columns={columns} data={data} exportFileName="stock-on-hand" emptyMessage="No stock recorded yet. Enter opening stock under Waste & adjustments." pageSize={50} />;
}

"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

export type LocationRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string;
  openedOn: string;
  moneyAccounts: number;
  staff: number;
  channels: number;
  isActive: boolean;
};

export function LocationsTable({ data, canEdit }: { data: LocationRow[]; canEdit: boolean }) {
  const columns: ColumnDef<LocationRow, unknown>[] = [
    { accessorKey: "code", header: "Code" },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) =>
        canEdit ? (
          <Link href={`/admin/locations/${row.original.id}`} className="font-semibold underline-offset-4 hover:underline">
            {row.original.name}
          </Link>
        ) : (
          <span className="font-semibold">{row.original.name}</span>
        ),
    },
    { accessorKey: "type", header: "Type" },
    { accessorKey: "address", header: "Address" },
    { accessorKey: "openedOn", header: "Opened" },
    { accessorKey: "moneyAccounts", header: "Money accounts", meta: { align: "right" } },
    { accessorKey: "channels", header: "Payment channels", meta: { align: "right" } },
    { accessorKey: "staff", header: "Staff", meta: { align: "right" } },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>,
      meta: { exportValue: (r) => (r.isActive ? "Active" : "Inactive") },
    },
  ];

  return <DataTable columns={columns} data={data} exportFileName="locations" searchPlaceholder="Search locations…" />;
}

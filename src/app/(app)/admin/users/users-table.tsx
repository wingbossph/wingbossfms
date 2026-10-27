"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  login: string;
  access: string;
  lastLogin: string;
  isActive: boolean;
};

export function UsersTable({ data, canEdit }: { data: UserRow[]; canEdit: boolean }) {
  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) =>
        canEdit ? (
          <Link href={`/admin/users/${row.original.id}`} className="font-semibold underline-offset-4 hover:underline">
            {row.original.name}
          </Link>
        ) : (
          <span className="font-semibold">{row.original.name}</span>
        ),
    },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "login", header: "Login" },
    { accessorKey: "access", header: "Roles @ locations" },
    { accessorKey: "lastLogin", header: "Last login" },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (row.original.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>),
      meta: { exportValue: (r) => (r.isActive ? "Active" : "Inactive") },
    },
  ];
  return <DataTable columns={columns} data={data} exportFileName="users" searchPlaceholder="Search users…" />;
}

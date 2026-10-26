"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";

export type AuditRow = {
  id: string;
  at: string;
  user: string;
  location: string;
  action: string;
  entity: string;
  entityId: string;
  change: string;
  reason: string;
};

const columns: ColumnDef<AuditRow, unknown>[] = [
  { accessorKey: "at", header: "When", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.at}</span> },
  { accessorKey: "user", header: "Who" },
  { accessorKey: "location", header: "Location" },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => <Badge variant={row.original.action === "VOID" || row.original.action === "DELETE" ? "destructive" : "outline"}>{row.original.action}</Badge>,
  },
  {
    accessorKey: "entity",
    header: "Record",
    cell: ({ row }) => (
      <span>
        {row.original.entity}
        <span className="block font-mono text-[11px] text-muted-foreground">{row.original.entityId}</span>
      </span>
    ),
  },
  {
    accessorKey: "change",
    header: "Before → after",
    cell: ({ row }) => <span className="block max-w-xl break-words font-mono text-xs">{row.original.change}</span>,
  },
  { accessorKey: "reason", header: "Reason" },
];

export function AuditTable({ data, exportHref }: { data: AuditRow[]; exportHref: string }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      exportFileName="audit-log"
      serverExportHref={exportHref}
      searchPlaceholder="Search within results…"
      pageSize={50}
      emptyMessage="No audit entries match these filters."
    />
  );
}

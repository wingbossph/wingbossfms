"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Plain value used for CSV export when the cell renders JSX. */
    exportValue?: (row: TData) => string | number | null | undefined;
    align?: "right";
  }
}

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  exportFileName: string;
  searchPlaceholder?: string;
  pageSize?: number;
  /** When set, Export downloads from the server (all matching rows) instead of the visible rows. */
  serverExportHref?: string;
  emptyMessage?: string;
};

export function DataTable<T>({
  columns,
  data,
  exportFileName,
  searchPlaceholder = "Search…",
  pageSize = 25,
  serverExportHref,
  emptyMessage = "Nothing here yet.",
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  function exportVisible() {
    const cols = table.getAllLeafColumns().filter((c) => c.id !== "actions");
    const header = cols.map((c) => (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id));
    const rows = table.getSortedRowModel().rows.map((r) =>
      cols.map((c) => {
        const exportValue = c.columnDef.meta?.exportValue;
        const v = exportValue ? exportValue(r.original) : r.getValue(c.id);
        return v === null || v === undefined ? "" : String(v);
      }),
    );
    downloadCsv(`${exportFileName}.csv`, toCsv([header, ...rows]));
  }

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search"
          className="h-10 max-w-xs"
        />
        <div className="ml-auto">
          {serverExportHref ? (
            <Button variant="outline" asChild>
              <a href={serverExportHref}>
                <Download className="size-4" /> Export
              </a>
            </Button>
          ) : (
            <Button variant="outline" onClick={exportVisible}>
              <Download className="size-4" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const align = h.column.columnDef.meta?.align === "right" ? "text-right" : "";
                  return (
                    <TableHead key={h.id} className={`text-xs font-semibold uppercase tracking-wider ${align}`}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" && <ArrowUp className="size-3" />}
                          {sorted === "desc" && <ArrowDown className="size-3" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.columnDef.meta?.align === "right" ? "text-right tabular-nums" : ""}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="no-print flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

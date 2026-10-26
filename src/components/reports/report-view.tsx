import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCell, type ReportColumn, type ReportDoc, type ReportRow } from "@/domains/reports/doc";
import { PrintButton } from "./print-button";

const STYLE: Record<string, string> = {
  section: "bg-muted/60 font-semibold uppercase tracking-wide text-xs",
  subtotal: "font-semibold",
  total: "font-bold border-t-2 border-foreground border-b-4 border-double",
  muted: "text-muted-foreground",
  normal: "",
};

function Table({ columns, rows }: { columns: ReportColumn[]; rows: ReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:overflow-visible print:border-0">
      <table className="w-full text-sm">
        <thead className="bg-foreground text-background">
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wider ${c.kind === "text" ? "text-left" : "text-right"} ${i === 0 ? "min-w-56" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t ${STYLE[r.style ?? "normal"]}`}>
              {columns.map((c, j) => {
                const text = formatCell(r.cells[c.key] ?? null, c.kind);
                const neg = c.kind === "money" && text.startsWith("(");
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 ${c.kind === "text" ? "text-left" : "text-right tabular-nums"} ${neg ? "text-destructive" : ""}`}
                    style={j === 0 && r.indent ? { paddingLeft: `${0.75 + r.indent * 1.25}rem` } : undefined}
                  >
                    {j === 0 && r.href ? (
                      <Link href={r.href} className="underline-offset-4 hover:underline">
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                No data for this selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Renders a ReportDoc with Excel / PDF / CSV export and print. */
export function ReportView({ doc, exportBase }: { doc: ReportDoc; exportBase?: string }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="hidden font-display text-lg tracking-widest print:block">WINGBOSS</p>
          <h2 className="text-2xl">{doc.title}</h2>
          {doc.subtitle && <p className="text-sm text-muted-foreground">{doc.subtitle}</p>}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {exportBase && (
            <>
              {(["xlsx", "pdf", "csv"] as const).map((fmt) => (
                <Button key={fmt} variant="outline" size="sm" asChild>
                  <a href={`${exportBase}${exportBase.includes("?") ? "&" : "?"}format=${fmt}`}>
                    <Download className="size-4" /> {fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
                  </a>
                </Button>
              ))}
            </>
          )}
          <PrintButton>
            <Printer className="size-4" /> Print
          </PrintButton>
        </div>
      </div>
      <Table columns={doc.columns} rows={doc.rows} />
      {(doc.sections ?? []).map((s) => (
        <section key={s.title} className="break-inside-avoid">
          <h3 className="mb-2 text-xl">{s.title}</h3>
          <Table columns={s.columns} rows={s.rows} />
        </section>
      ))}
      {(doc.notes ?? []).map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  );
}

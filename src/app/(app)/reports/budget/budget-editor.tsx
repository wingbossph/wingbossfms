"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveBudgetAction } from "@/domains/reports/budget-actions";

type Row = { accountId: string; name: string; group: string; months: string[] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function BudgetEditor(props: { canEdit: boolean; locations: { id: string; name: string }[]; locationId: string; year: number; rows: Row[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState(props.rows);
  const [onlyUsed, setOnlyUsed] = useState(props.rows.some((r) => r.months.some(Boolean)));
  const save = useAction(saveBudgetAction, { onSuccess: () => router.refresh() });
  const go = (q: Record<string, string>) => router.push(`${pathname}?${new URLSearchParams({ location: props.locationId, year: String(props.year), ...q })}`);
  const set = (i: number, m: number, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, months: r.months.map((x, k) => (k === m ? v : x)) } : r)));
  const fillRow = (i: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, months: r.months.map(() => r.months[0]) } : r)));
  const total = (r: Row) => r.months.reduce((a, m) => a + (Number(m.replace(/,/g, "")) || 0), 0);
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !onlyUsed || r.months.some(Boolean));
  let lastGroup = "";
  return (
    <div className="space-y-3 pb-20">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass + " w-auto"} value={props.locationId} onChange={(e) => go({ location: e.target.value })} aria-label="Location">
          {props.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => go({ year: String(props.year - 1) })} aria-label="Previous year">
          ←
        </Button>
        <span className="font-semibold">{props.year}</span>
        <Button variant="outline" onClick={() => go({ year: String(props.year + 1) })} aria-label="Next year">
          →
        </Button>
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} /> Only accounts with a budget
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="sticky left-0 z-10 min-w-56 bg-muted p-2 text-left">Account</th>
              {MONTHS.map((m) => (
                <th key={m} className="p-2">
                  {m}
                </th>
              ))}
              <th className="p-2">Year</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, i }) => {
              const head = r.group !== lastGroup;
              lastGroup = r.group;
              return [
                head && (
                  <tr key={`g-${r.group}`} className="border-t bg-muted/30">
                    <td colSpan={14} className="sticky left-0 p-2 text-xs font-semibold uppercase tracking-wider">
                      {r.group}
                    </td>
                  </tr>
                ),
                <tr key={r.accountId} className="border-t">
                  <td className="sticky left-0 z-10 bg-background p-2">
                    {r.name}
                    {props.canEdit && r.months[0] && (
                      <button type="button" className="ml-2 text-xs underline underline-offset-2" onClick={() => fillRow(i)}>
                        copy Jan →
                      </button>
                    )}
                  </td>
                  {r.months.map((m, k) => (
                    <td key={k} className="p-0.5">
                      <Input value={m} onChange={(e) => set(i, k, e.target.value)} disabled={!props.canEdit} inputMode="decimal" className="h-8 w-24 px-1 text-right text-xs" aria-label={`${r.name} ${MONTHS[k]}`} />
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">{total(r).toLocaleString("en-PH", { maximumFractionDigits: 0 })}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {props.canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64 md:px-8">
          <Button disabled={save.pending} onClick={() => save.run({ locationId: props.locationId, year: props.year, rows: rows.filter((r) => r.months.some(Boolean)).map((r) => ({ accountId: r.accountId, months: r.months })) })}>
            {save.pending ? "Saving…" : "Save budget"}
          </Button>
        </div>
      )}
    </div>
  );
}

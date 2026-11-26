"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveFundAction } from "@/domains/sales/actions";
import { formatPeso, parsePeso } from "@/lib/money";

type Part = { amount: string; from: string; to: string };

/**
 * The day's Fund: cash brought in (as petty cash for expenses) from the cash on
 * hand of other sales days. Each line is an amount and the date or dates it
 * came from, so the days don't have to be consecutive.
 */
export function FundBox({ locationId, date, initial, canEdit }: { locationId: string; date: string; initial: Part[]; canEdit: boolean }) {
  const router = useRouter();
  const empty: Part = { amount: "", from: "", to: "" };
  const [parts, setParts] = useState<Part[]>(initial.length ? initial : [empty]);
  const [pending, start] = useTransition();
  const total = parts.reduce((a, p) => a + (parsePeso(p.amount || "0") ?? 0n), 0n);
  const set = (i: number, patch: Partial<Part>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = () =>
    start(async () => {
      const filled = parts.filter((p) => p.amount || p.from);
      if (filled.some((p) => !p.amount || !p.from)) return void toast.error("Enter the amount and the date covered for each fund line.");
      const res = await saveFundAction({ locationId, date, parts: filled });
      if (res?.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res?.message ?? "Couldn't save the fund.");
    });

  return (
    <section aria-labelledby="fund" className="mb-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="fund" className="text-lg font-semibold">
          Fund <span className="text-xs font-normal text-muted-foreground">(petty cash for expenses, from other days&apos; cash on hand · added to today&apos;s cash on hand)</span>
        </h3>
        <span className="text-sm tabular-nums">
          Total <b>{formatPeso(total)}</b>
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {parts.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              <span>Fund amount ₱</span>
              <Input inputMode="decimal" placeholder="0.00" value={p.amount} disabled={!canEdit || pending} onChange={(e) => set(i, { amount: e.target.value })} className="h-11 w-40 text-right text-lg tabular-nums" aria-label={`Fund amount ${i + 1}`} />
            </label>
            <div className="space-y-1 text-sm font-medium">
              <span>Date covered</span>
              <div className="flex items-center gap-1">
                <Input type="date" max={date} value={p.from} disabled={!canEdit || pending} onChange={(e) => set(i, { from: e.target.value })} className="h-11 px-2" aria-label={`Fund ${i + 1} from date`} />
                <span className="text-muted-foreground">–</span>
                <Input type="date" max={date} value={p.to} disabled={!canEdit || pending} onChange={(e) => set(i, { to: e.target.value })} className="h-11 px-2" aria-label={`Fund ${i + 1} to date (optional)`} title="Leave blank for a single day" />
              </div>
            </div>
            {canEdit && parts.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="mb-0.5" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove fund line ${i + 1}`}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setParts((ps) => [...ps, empty])}>
            <Plus className="size-4" /> Add another date
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save fund"}
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">One day: fill only the first date. A range: fill both. Different, non-consecutive days: use “Add another date”.</p>
    </section>
  );
}

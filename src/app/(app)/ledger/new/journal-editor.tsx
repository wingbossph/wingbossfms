"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { postManualEntryAction } from "@/domains/ledger/actions";
import { formatPeso, parsePeso } from "@/lib/money";

type Option = { id: string; name: string };
type Line = { accountId: string; locationId: string; debit: string; credit: string; memo: string };

export function JournalEditor({ accounts, locations, today }: { accounts: Option[]; locations: Option[]; today: string }) {
  const router = useRouter();
  const blank = (): Line => ({ accountId: "", locationId: locations[0]?.id ?? "", debit: "", credit: "", memo: "" });
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const post = useAction(postManualEntryAction, {
    onSuccess: (s) => {
      const id = (s as { id?: string } | null)?.id;
      router.push(id ? `/ledger/entries/${id}` : "/ledger");
    },
  });
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const c = (v: string) => parsePeso(v || "0") ?? 0n;

  const byLocation = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const l of lines) m.set(l.locationId, (m.get(l.locationId) ?? 0n) + c(l.debit) - c(l.credit));
    return m;
  }, [lines]);
  const totalDebit = lines.reduce((a, l) => a + c(l.debit), 0n);
  const totalCredit = lines.reduce((a, l) => a + c(l.credit), 0n);
  const balanced = totalDebit === totalCredit && totalDebit > 0n && [...byLocation.values()].every((v) => v === 0n);

  return (
    <form
      className="max-w-5xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        post.run({ date, memo, lines: lines.filter((l) => l.accountId).map((l) => ({ ...l, debit: l.debit || "0", credit: l.credit || "0" })) });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field id="jdate" label="Date">
          <Input id="jdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="jmemo" label="Description" error={post.fieldError("memo")}>
          <Input id="jmemo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Accrue October electricity" required />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="p-2">Account</th>
              <th className="p-2">Location</th>
              <th className="p-2">Memo</th>
              <th className="w-32 p-2 text-right">Debit</th>
              <th className="w-32 p-2 text-right">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-1">
                  <select className={selectClass} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} aria-label={`Line ${i + 1} account`}>
                    <option value="">Choose…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <select className={selectClass} value={l.locationId} onChange={(e) => set(i, { locationId: e.target.value })} aria-label={`Line ${i + 1} location`}>
                    {locations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <Input value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} aria-label={`Line ${i + 1} memo`} />
                </td>
                <td className="p-1">
                  <Input inputMode="decimal" className="text-right" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} aria-label={`Line ${i + 1} debit`} />
                </td>
                <td className="p-1">
                  <Input inputMode="decimal" className="text-right" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} aria-label={`Line ${i + 1} credit`} />
                </td>
                <td className="p-1">
                  {lines.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="p-2" colSpan={3}>
                Totals
              </td>
              <td className="p-2 text-right tabular-nums">{formatPeso(totalDebit)}</td>
              <td className="p-2 text-right tabular-nums">{formatPeso(totalCredit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}>
        <Plus className="size-4" /> Add line
      </Button>
      {[...byLocation.entries()].some(([, v]) => v !== 0n) && (
        <p className="text-sm text-destructive">
          Each location must balance on its own. Off by:{" "}
          {[...byLocation.entries()]
            .filter(([, v]) => v !== 0n)
            .map(([loc, v]) => `${locations.find((o) => o.id === loc)?.name} ${formatPeso(v)}`)
            .join(", ")}
          . Use the inter-location receivable/payable accounts to move amounts between locations.
        </p>
      )}
      <Button type="submit" className="h-11 px-6" disabled={!balanced || post.pending}>
        {post.pending ? "Posting…" : "Post entry"}
      </Button>
    </form>
  );
}

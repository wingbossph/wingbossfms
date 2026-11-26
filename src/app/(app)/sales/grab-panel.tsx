"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/field";
import { addGrabRemittanceAction, deleteGrabRemittanceAction } from "@/domains/sales/actions";
import { formatPeso } from "@/lib/money";

type Remittance = { id: string; location: string; remittedOn: string; periodFrom: string; periodTo: string; amountCents: string; coveredGrossCents: string; deductedCents: string | null; reference: string | null };
type Option = { id: string; name: string };

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Grab gross sales and remittances for the range: shown beside the sales, never added to them. */
export function GrabPanel({
  grossCents,
  days,
  remittedCents,
  remittances,
  locations,
  defaultLocationId,
  today,
  canEdit,
}: {
  grossCents: string;
  days: number;
  remittedCents: string;
  remittances: Remittance[];
  locations: Option[];
  defaultLocationId: string;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const blank = { locationId: defaultLocationId, remittedOn: today, periodFrom: "", periodTo: "", amount: "", reference: "" };
  const [f, setF] = useState(blank);

  const add = () =>
    start(async () => {
      const res = await addGrabRemittanceAction(f);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save.");
      toast.success(res.message);
      setF(blank);
      setOpen(false);
      router.refresh();
    });
  const remove = (id: string) => {
    if (!confirm("Remove this remittance?")) return;
    start(async () => {
      const res = await deleteGrabRemittanceAction(id);
      if (res?.ok) toast.success(res.message);
      else toast.error(res?.message ?? "Couldn't remove.");
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="grab" className="mb-6 rounded-lg border border-dashed p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="grab" className="text-2xl">
            Grab
          </h2>
          <p className="text-sm text-muted-foreground">Tracked separately: not included in the sales totals (Grab deducts its fees before paying out).</p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setOpen((o) => !o)}>
            <Plus className="size-4" /> Add Grab remittance
          </Button>
        )}
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Grab daily sales (gross)</dt>
          <dd className="font-display text-2xl tabular-nums">{formatPeso(BigInt(grossCents))}</dd>
          <dd className="text-xs text-muted-foreground">{days} day(s) entered</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Grab remittance received</dt>
          <dd className="font-display text-2xl tabular-nums">{formatPeso(BigInt(remittedCents))}</dd>
          <dd className="text-xs text-muted-foreground">{remittances.length} payout(s) received in this range</dd>
        </div>
      </dl>

      {open && (
        <div className="mb-3 grid gap-2 rounded-md border p-3 sm:grid-cols-3 lg:grid-cols-6">
          {locations.length > 1 && (
            <label className="space-y-1 text-xs font-medium">
              <span>Branch</span>
              <select className={selectClass} value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs font-medium">
            <span>Received on</span>
            <Input type="date" max={today} value={f.remittedOn} onChange={(e) => setF({ ...f, remittedOn: e.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>Covers sales from</span>
            <Input type="date" max={today} value={f.periodFrom} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>to</span>
            <Input type="date" max={today} value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>Amount received ₱</span>
            <Input inputMode="decimal" placeholder="0.00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="text-right tabular-nums" />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>Reference (optional)</span>
            <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          </label>
          <div className="sm:col-span-3 lg:col-span-6">
            <Button onClick={add} disabled={pending || !f.periodFrom || !f.periodTo || !f.amount}>
              {pending ? "Saving…" : "Save remittance"}
            </Button>
          </div>
        </div>
      )}

      {remittances.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Grab remittances received in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="p-2">Received</th>
                <th className="p-2">Covers</th>
                {locations.length > 1 && <th className="p-2">Branch</th>}
                <th className="p-2 text-right">Grab sales covered</th>
                <th className="p-2 text-right">Remitted</th>
                <th className="p-2 text-right">Deducted by Grab</th>
                <th className="p-2">Reference</th>
                {canEdit && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {remittances.map((r) => {
                const gross = BigInt(r.coveredGrossCents);
                const ded = r.deductedCents === null ? null : BigInt(r.deductedCents);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{fmtDate(r.remittedOn)}</td>
                    <td className="p-2">
                      {fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}
                    </td>
                    {locations.length > 1 && <td className="p-2">{r.location}</td>}
                    <td className="p-2 text-right tabular-nums">{gross > 0n ? formatPeso(gross) : "—"}</td>
                    <td className="p-2 text-right font-semibold tabular-nums">{formatPeso(BigInt(r.amountCents))}</td>
                    <td className="p-2 text-right tabular-nums">
                      {ded === null ? "—" : `${formatPeso(ded)}${gross > 0n ? ` (${((Number(ded) / Number(gross)) * 100).toFixed(1)}%)` : ""}`}
                    </td>
                    <td className="p-2 text-muted-foreground">{r.reference ?? ""}</td>
                    {canEdit && (
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="icon" disabled={pending} onClick={() => remove(r.id)} aria-label="Remove remittance">
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

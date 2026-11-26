"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addGrabRemittanceAction, saveGrabDailySaleAction } from "@/domains/sales/actions";
import { formatPeso } from "@/lib/money";

type Remittance = { id: string; amountCents: string; periodFrom: string; periodTo: string };
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Grab for the day, beside the sales: gross Grab sales and any remittance
 * received today with the dates it covers. Never part of net sales or cash on hand.
 */
export function GrabDaily({ locationId, date, initial, remittances, canEdit }: { locationId: string; date: string; initial: string; remittances: Remittance[]; canEdit: boolean }) {
  const router = useRouter();
  const [gross, setGross] = useState(initial);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const dirty = gross !== initial || amount !== "";

  const save = () =>
    start(async () => {
      if (gross !== initial) {
        const res = await saveGrabDailySaleAction({ locationId, date, gross: gross || "0" });
        if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save Grab sales.");
      }
      if (amount) {
        if (!from || !to) return void toast.error("Enter the dates the remittance covers.");
        const res = await addGrabRemittanceAction({ locationId, remittedOn: date, periodFrom: from, periodTo: to, amount });
        if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save the remittance.");
        setAmount("");
        setFrom("");
        setTo("");
      }
      toast.success("Grab saved.");
      router.refresh();
    });

  return (
    <section aria-labelledby="grab-daily" className="w-full max-w-xl flex-1 rounded-lg border border-dashed p-4 lg:min-w-[22rem]">
      <h3 id="grab-daily" className="text-lg font-semibold">
        Grab <span className="text-xs font-normal text-muted-foreground">(separate: not in net sales or cash)</span>
      </h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          <span>Grab daily sales (gross) ₱</span>
          <Input inputMode="decimal" placeholder="0.00" value={gross} disabled={!canEdit || pending} onChange={(e) => setGross(e.target.value)} className="h-12 text-lg tabular-nums" aria-label="Grab daily sales (gross)" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Grab remittance received ₱</span>
          <Input inputMode="decimal" placeholder="0.00" value={amount} disabled={!canEdit || pending} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg tabular-nums" aria-label="Grab remittance received" />
        </label>
        <div className="space-y-1 text-sm font-medium">
          <span>Date covered</span>
          <div className="flex items-center gap-1">
            <Input type="date" max={date} value={from} disabled={!canEdit || pending} onChange={(e) => setFrom(e.target.value)} className="h-12 px-2" aria-label="Remittance covers from" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" max={date} value={to} disabled={!canEdit || pending} onChange={(e) => setTo(e.target.value)} className="h-12 px-2" aria-label="Remittance covers to" />
          </div>
        </div>
      </div>
      {remittances.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {remittances.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">
                Remittance received today · covers {fmt(r.periodFrom)} – {fmt(r.periodTo)}
              </span>
              <b>{formatPeso(BigInt(r.amountCents))}</b>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button type="button" variant="outline" className="mt-3 h-11" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save Grab"}
        </Button>
      )}
    </section>
  );
}

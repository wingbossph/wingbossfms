"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGrabDailySaleAction } from "@/domains/sales/actions";

/** Grab gross sales for the day: saved on its own, never part of net sales or cash on hand. */
export function GrabDaily({ locationId, date, initial, canEdit }: { locationId: string; date: string; initial: string; canEdit: boolean }) {
  const router = useRouter();
  const [gross, setGross] = useState(initial);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await saveGrabDailySaleAction({ locationId, date, gross: gross || "0" });
      if (res?.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res?.message ?? "Couldn't save.");
    });
  return (
    <section aria-labelledby="grab-daily" className="rounded-lg border border-dashed p-4">
      <h2 id="grab-daily" className="text-2xl">
        Grab daily sales
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Gross Grab sales for the day, before Grab&apos;s fees. Kept separate: not added to net sales or cash on hand.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input inputMode="decimal" placeholder="0.00" value={gross} disabled={!canEdit || pending} onChange={(e) => setGross(e.target.value)} className="h-11 w-40 text-right text-lg tabular-nums" aria-label="Grab daily sales (gross)" />
        {canEdit && (
          <Button type="button" variant="outline" className="h-11" disabled={pending || gross === initial} onClick={save}>
            {pending ? "Saving…" : "Save Grab sales"}
          </Button>
        )}
      </div>
    </section>
  );
}

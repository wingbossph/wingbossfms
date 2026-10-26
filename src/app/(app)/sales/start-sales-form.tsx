"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { openReportAction } from "@/domains/sales/actions";

export function StartSalesForm({
  locations,
  defaultLocationId,
  today,
}: {
  locations: { id: string; name: string; shifts: number }[];
  defaultLocationId: string;
  today: string;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState(1);
  const open = useAction(openReportAction);
  const shifts = locations.find((l) => l.id === locationId)?.shifts ?? 1;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        open.run({ locationId, businessDate: date, shiftNo: shift });
      }}
      className="no-print mb-6 flex flex-wrap items-end gap-3 rounded-lg border-2 border-foreground/10 p-4"
    >
      {locations.length > 1 && (
        <Field id="sl" label="Location">
          <select id="sl" className={`${selectClass} h-12`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="sd" label="Business date">
        <Input id="sd" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
      </Field>
      {shifts > 1 && (
        <Field id="ss" label="Shift">
          <select id="ss" className={`${selectClass} h-12`} value={shift} onChange={(e) => setShift(Number(e.target.value))}>
            {Array.from({ length: shifts }, (_, i) => (
              <option key={i} value={i + 1}>
                Shift {i + 1}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button type="submit" disabled={open.pending} className="h-12 px-6 text-base">
        {open.pending ? "Opening…" : date === today ? "Enter today's sales" : "Open sales for this day"}
      </Button>
    </form>
  );
}

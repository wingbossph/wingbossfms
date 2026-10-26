"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { createRunAction } from "@/domains/payroll/actions";

type Cutoff = { start: string; end: string; payDate: string };

export function NewRunForm({ cutoffs, year, serviceChargeToStaff }: { cutoffs: Cutoff[]; year: string; serviceChargeToStaff: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<"REGULAR" | "THIRTEENTH_MONTH">("REGULAR");
  const [idx, setIdx] = useState(0);
  const [start, setStart] = useState(cutoffs[0].start);
  const [end, setEnd] = useState(cutoffs[0].end);
  const [payDate, setPayDate] = useState(cutoffs[0].payDate);
  const [y, setY] = useState(year);
  const [service, setService] = useState(serviceChargeToStaff);
  const create = useAction(createRunAction, { onSuccess: (s) => s && "id" in s && s.id && router.push(`/payroll/runs/${s.id}`) });
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (type === "REGULAR") create.run({ type, periodStart: start, periodEnd: end, payDate, distributeServiceCharge: service });
        else create.run({ type, periodStart: `${y}-01-01`, periodEnd: `${y}-12-31`, payDate });
      }}
    >
      <Field id="rt" label="Type">
        <select id="rt" className={selectClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="REGULAR">Regular payroll</option>
          <option value="THIRTEENTH_MONTH">13th month pay</option>
        </select>
      </Field>
      {type === "REGULAR" ? (
        <>
          <Field id="rc" label="Cut-off">
            <select
              id="rc"
              className={selectClass}
              value={idx}
              onChange={(e) => {
                const i = Number(e.target.value);
                setIdx(i);
                if (i < cutoffs.length) {
                  setStart(cutoffs[i].start);
                  setEnd(cutoffs[i].end);
                  setPayDate(cutoffs[i].payDate);
                }
              }}
            >
              {cutoffs.map((c, i) => (
                <option key={c.start} value={i}>
                  {c.start} to {c.end}
                </option>
              ))}
              <option value={cutoffs.length}>Other dates…</option>
            </select>
          </Field>
          {idx === cutoffs.length && (
            <>
              <Field id="rs" label="From">
                <Input id="rs" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field id="re" label="To">
                <Input id="re" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </>
          )}
        </>
      ) : (
        <Field id="ry" label="Year">
          <Input id="ry" inputMode="numeric" value={y} onChange={(e) => setY(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-24" />
        </Field>
      )}
      <Field id="rp" label="Pay date">
        <Input id="rp" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
      </Field>
      {type === "REGULAR" && serviceChargeToStaff && (
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={service} onChange={(e) => setService(e.target.checked)} />
          Share out service charge
        </label>
      )}
      <Button type="submit" className="h-10" disabled={create.pending}>
        {create.pending ? "Computing…" : "Compute payroll"}
      </Button>
    </form>
  );
}

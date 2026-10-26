"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { addAssignmentAction, addCompensationAction } from "@/domains/payroll/actions";

export function AssignmentForm({ employeeId, locations, today }: { employeeId: string; locations: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [from, setFrom] = useState(today);
  const a = useAction(addAssignmentAction, { onSuccess: () => router.refresh() });
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field id="as-l" label="Move to">
        <select id="as-l" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="as-f" label="From">
        <Input id="as-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Button variant="outline" disabled={a.pending} onClick={() => a.run({ employeeId, locationId, effectiveFrom: from })}>
        Save move
      </Button>
    </div>
  );
}

type Allow = { name: string; amount: string; taxable: boolean };

export function CompensationForm({ employeeId, today, current }: { employeeId: string; today: string; current: { rateType: "DAILY" | "MONTHLY"; rate: string; daysPerYear: number; allowances: Allow[] } | null }) {
  const router = useRouter();
  const [rateType, setRateType] = useState(current?.rateType ?? "DAILY");
  const [rate, setRate] = useState(current?.rate ?? "");
  const [days, setDays] = useState(String(current?.daysPerYear ?? 313));
  const [from, setFrom] = useState(today);
  const [allowances, setAllowances] = useState<Allow[]>(current?.allowances ?? []);
  const a = useAction(addCompensationAction, { onSuccess: () => router.refresh() });
  return (
    <div className="mt-3 space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field id="cp-t" label="Paid">
          <select id="cp-t" className={selectClass} value={rateType} onChange={(e) => setRateType(e.target.value as "DAILY" | "MONTHLY")}>
            <option value="DAILY">Per day</option>
            <option value="MONTHLY">Per month</option>
          </select>
        </Field>
        <Field id="cp-r" label="Rate (₱)">
          <Input id="cp-r" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="w-32" />
        </Field>
        {rateType === "MONTHLY" && (
          <Field id="cp-d" label="Days/year" hint="313 = 6-day week">
            <Input id="cp-d" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
          </Field>
        )}
        <Field id="cp-f" label="From">
          <Input id="cp-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
      <p className="text-sm font-semibold">Allowances per cut-off</p>
      {allowances.map((x, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input value={x.name} onChange={(e) => setAllowances((l) => l.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Rice" className="w-40" aria-label="Allowance name" />
          <Input value={x.amount} onChange={(e) => setAllowances((l) => l.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} inputMode="decimal" className="w-28" aria-label="Allowance amount" />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={x.taxable} onChange={(e) => setAllowances((l) => l.map((y, j) => (j === i ? { ...y, taxable: e.target.checked } : y)))} /> taxable
          </label>
          <Button variant="ghost" size="sm" onClick={() => setAllowances((l) => l.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setAllowances((l) => [...l, { name: "", amount: "", taxable: false }])}>
          Add allowance
        </Button>
        <Button size="sm" disabled={a.pending || !rate} onClick={() => a.run({ employeeId, effectiveFrom: from, rateType, rate, daysPerYear: days, allowances: allowances.filter((x) => x.name && x.amount) })}>
          Save new rate
        </Button>
      </div>
    </div>
  );
}

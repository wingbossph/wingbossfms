"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { deleteHolidayAction, saveHolidayAction, saveTableAction } from "@/domains/payroll/actions";

export function HolidayForm({ locations, year }: { locations: { id: string; name: string }[]; year: string }) {
  const router = useRouter();
  const [v, setV] = useState({ date: `${year}-01-01`, name: "", type: "REGULAR", locationId: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const a = useAction(saveHolidayAction, { onSuccess: () => (setV((x) => ({ ...x, name: "" })), router.refresh()) });
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(v);
      }}
    >
      <Field id="hd" label="Date">
        <Input id="hd" type="date" value={v.date} onChange={set("date")} />
      </Field>
      <Field id="hn" label="Name">
        <Input id="hn" value={v.name} onChange={set("name")} placeholder="Eid'l Fitr" />
      </Field>
      <Field id="ht" label="Type">
        <select id="ht" className={selectClass} value={v.type} onChange={set("type")}>
          <option value="REGULAR">Regular holiday</option>
          <option value="SPECIAL_NON_WORKING">Special non-working</option>
          <option value="SPECIAL_WORKING">Special working</option>
        </select>
      </Field>
      <Field id="hl" label="Applies to">
        <select id="hl" className={selectClass} value={v.locationId} onChange={set("locationId")}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={a.pending || v.name.length < 2}>
        Add holiday
      </Button>
    </form>
  );
}

export function DeleteHolidayButton({ id }: { id: string }) {
  const router = useRouter();
  const a = useAction(deleteHolidayAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" variant="ghost" disabled={a.pending} onClick={() => confirm("Remove this holiday?") && a.run(id)}>
      Remove
    </Button>
  );
}

type Row = { min: string; max: string; excessOver: string; eeFixed: string; eeRateBp: string; erFixed: string; erRateBp: string; ecFixed: string };
const COLS: { key: keyof Row; label: string }[] = [
  { key: "min", label: "From ₱" },
  { key: "max", label: "To ₱ (blank = up)" },
  { key: "excessOver", label: "Excess over ₱" },
  { key: "eeFixed", label: "EE fixed ₱" },
  { key: "eeRateBp", label: "EE rate (bp)" },
  { key: "erFixed", label: "ER fixed ₱" },
  { key: "erRateBp", label: "ER rate (bp)" },
  { key: "ecFixed", label: "EC ₱" },
];

/** New version of a table from a date; past payrolls keep using the old one. */
export function TableEditor({ kind, basis, rows: initial, today }: { kind: string; basis: "MONTHLY" | "SEMI_MONTHLY"; rows: Row[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(today);
  const a = useAction(saveTableAction, { onSuccess: () => (setOpen(false), router.refresh()) });
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        New version of this table
      </Button>
    );
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-2">
        <Field id={`tn-${kind}`} label="Name">
          <Input id={`tn-${kind}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="SSS 2027 schedule" />
        </Field>
        <Field id={`tf-${kind}`} label="Effective from">
          <Input id={`tf-${kind}`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="text-xs">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className="p-1 text-left">
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {COLS.map((c) => (
                  <td key={c.key} className="p-0.5">
                    <Input value={r[c.key]} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))} className="h-8 w-24 text-xs" aria-label={`${c.label} row ${i + 1}`} />
                  </td>
                ))}
                <td>
                  <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { min: "", max: "", excessOver: "0", eeFixed: "0", eeRateBp: "0", erFixed: "0", erRateBp: "0", ecFixed: "0" }])}>
          Add row
        </Button>
        <Button size="sm" disabled={a.pending || name.length < 3} onClick={() => a.run({ kind, name, effectiveFrom: from, basis, brackets: rows })}>
          Save table
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

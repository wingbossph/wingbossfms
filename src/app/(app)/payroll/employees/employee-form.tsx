"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveEmployeeAction } from "@/domains/payroll/actions";

type Option = { id: string; name: string };
export type EmployeeValues = {
  id?: string;
  code: string;
  firstName: string;
  lastName: string;
  middleName: string;
  position: string;
  status: "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED";
  startDate: string;
  endDate: string;
  sssNo: string;
  philhealthNo: string;
  pagibigNo: string;
  tin: string;
  isMinimumWageEarner: boolean;
  payoutMethod: string;
  payoutRef: string;
};

export function EmployeeForm({ locations, today, initial }: { locations: Option[]; today: string; initial?: EmployeeValues }) {
  const router = useRouter();
  const [v, setV] = useState<EmployeeValues>(
    initial ?? { code: "", firstName: "", lastName: "", middleName: "", position: "", status: "ACTIVE", startDate: today, endDate: "", sssNo: "", philhealthNo: "", pagibigNo: "", tin: "", isMinimumWageEarner: true, payoutMethod: "Cash", payoutRef: "" },
  );
  const [home, setHome] = useState(locations[0]?.id ?? "");
  const [rateType, setRateType] = useState<"DAILY" | "MONTHLY">("DAILY");
  const [rate, setRate] = useState("");
  const save = useAction(saveEmployeeAction, {
    onSuccess: (s) => {
      if (!initial && s && "id" in s && s.id) router.push(`/payroll/employees/${s.id}`);
      else router.refresh();
    },
  });
  const set = (k: keyof EmployeeValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const text = (k: keyof EmployeeValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field id={`emp-${k}`} label={label} error={save.fieldError(k)}>
      <Input id={`emp-${k}`} value={String(v[k] ?? "")} onChange={set(k)} {...props} />
    </Field>
  );
  return (
    <form
      className="grid max-w-3xl gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ ...v, ...(initial ? {} : { homeLocationId: home, rateType, rate }), allowances: [] });
      }}
    >
      {text("firstName", "First name", { required: true })}
      {text("lastName", "Last name", { required: true })}
      {text("middleName", "Middle name")}
      {text("position", "Position", { required: true, placeholder: "Server, cook, cashier…" })}
      {text("startDate", "Start date", { type: "date", required: true })}
      <Field id="emp-status" label="Status">
        <select id="emp-status" className={selectClass} value={v.status} onChange={set("status")}>
          <option value="ACTIVE">Active</option>
          <option value="ON_LEAVE">On leave</option>
          <option value="RESIGNED">Resigned</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </Field>
      {!initial && (
        <>
          <Field id="emp-home" label="Location">
            <select id="emp-home" className={selectClass} value={home} onChange={(e) => setHome(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="emp-ratetype" label="Paid">
            <select id="emp-ratetype" className={selectClass} value={rateType} onChange={(e) => setRateType(e.target.value as "DAILY" | "MONTHLY")}>
              <option value="DAILY">Per day</option>
              <option value="MONTHLY">Per month</option>
            </select>
          </Field>
          <Field id="emp-rate" label={rateType === "DAILY" ? "Daily rate (₱)" : "Monthly rate (₱)"}>
            <Input id="emp-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </Field>
        </>
      )}
      {text("sssNo", "SSS no.")}
      {text("philhealthNo", "PhilHealth no.")}
      {text("pagibigNo", "Pag-IBIG no.")}
      {text("tin", "TIN")}
      <Field id="emp-payout" label="Paid through">
        <select id="emp-payout" className={selectClass} value={v.payoutMethod} onChange={set("payoutMethod")}>
          <option>Cash</option>
          <option>GCash</option>
          <option>Bank</option>
        </select>
      </Field>
      {text("payoutRef", "GCash / bank account")}
      {(v.status === "RESIGNED" || v.status === "TERMINATED") && text("endDate", "Last day", { type: "date" })}
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" className="size-4" checked={v.isMinimumWageEarner} onChange={(e) => setV((x) => ({ ...x, isMinimumWageEarner: e.target.checked }))} />
        Minimum wage earner (no withholding tax)
      </label>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={save.pending}>
          {save.pending ? "Saving…" : initial ? "Save changes" : "Add employee"}
        </Button>
      </div>
    </form>
  );
}

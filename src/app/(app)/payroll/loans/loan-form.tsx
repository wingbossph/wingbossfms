"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { createLoanAction, stopLoanAction } from "@/domains/payroll/actions";

type Option = { id: string; name: string };

export function LoanForm({ employees, accounts, today }: { employees: Option[]; accounts: Option[]; today: string }) {
  const router = useRouter();
  const [v, setV] = useState({ employeeId: employees[0]?.id ?? "", type: "CASH_ADVANCE", principal: "", perPayroll: "", startDate: today, moneyAccountId: accounts[0]?.id ?? "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = useAction(createLoanAction, { onSuccess: () => (setV((x) => ({ ...x, principal: "", perPayroll: "" })), router.refresh()) });
  const paysOut = v.type === "CASH_ADVANCE" || v.type === "COMPANY_LOAN";
  return (
    <form
      className="grid max-w-4xl gap-3 rounded-lg border p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ ...v, moneyAccountId: paysOut ? v.moneyAccountId : undefined });
      }}
    >
      <Field id="ln-e" label="Employee">
        <select id="ln-e" className={selectClass} value={v.employeeId} onChange={set("employeeId")}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="ln-t" label="Type">
        <select id="ln-t" className={selectClass} value={v.type} onChange={set("type")}>
          <option value="CASH_ADVANCE">Cash advance</option>
          <option value="COMPANY_LOAN">Company loan</option>
          <option value="SSS_LOAN">SSS loan (salary loan)</option>
          <option value="PAGIBIG_LOAN">Pag-IBIG loan</option>
        </select>
      </Field>
      <Field id="ln-d" label="Date">
        <Input id="ln-d" type="date" max={today} value={v.startDate} onChange={set("startDate")} />
      </Field>
      <Field id="ln-p" label={paysOut ? "Amount given (₱)" : "Loan balance to collect (₱)"}>
        <Input id="ln-p" inputMode="decimal" value={v.principal} onChange={set("principal")} required />
      </Field>
      <Field id="ln-pp" label="Deduct per payroll (₱)">
        <Input id="ln-pp" inputMode="decimal" value={v.perPayroll} onChange={set("perPayroll")} required />
      </Field>
      {paysOut && (
        <Field id="ln-m" label="Paid out from">
          <select id="ln-m" className={selectClass} value={v.moneyAccountId} onChange={set("moneyAccountId")}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={save.pending || !v.employeeId}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function StopLoanButton({ loanId, active }: { loanId: string; active: boolean }) {
  const router = useRouter();
  const a = useAction(stopLoanAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(loanId)}>
      {active ? "Pause" : "Resume"}
    </Button>
  );
}

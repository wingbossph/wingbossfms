"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { approveRunAction, payRunAction, recomputeRunAction, voidRunAction } from "@/domains/payroll/actions";

type Option = { id: string; name: string };

export function RunActions(props: { runId: string; status: string; paid: boolean; canRun: boolean; canApprove: boolean; canVoid: boolean; accounts: Option[]; today: string; payDate: string }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const recompute = useAction(recomputeRunAction, { onSuccess: refresh });
  const approve = useAction(approveRunAction, { onSuccess: refresh });
  const pay = useAction(payRunAction, { onSuccess: refresh });
  const del = useAction(voidRunAction, { onSuccess: () => (props.status === "DRAFT" ? router.push("/payroll") : refresh()) });
  const [accountId, setAccountId] = useState(props.accounts[0]?.id ?? "");
  const [date, setDate] = useState(props.payDate <= props.today ? props.payDate : props.today);
  const ask = () => prompt("Why? (kept in the audit log)")?.trim();

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-2">
      {props.status === "DRAFT" && props.canRun && (
        <>
          <Button variant="outline" disabled={recompute.pending} onClick={() => recompute.run(props.runId)}>
            Recompute
          </Button>
          <Button variant="outline" disabled={del.pending} onClick={() => confirm("Delete this draft?") && del.run({ runId: props.runId, reason: "Draft deleted" })}>
            Delete draft
          </Button>
        </>
      )}
      {props.status === "DRAFT" && props.canApprove && (
        <Button disabled={approve.pending} onClick={() => confirm("Approve and post this payroll to the books?") && approve.run(props.runId)}>
          {approve.pending ? "Posting…" : "Approve & post"}
        </Button>
      )}
      {props.status === "POSTED" && !props.paid && props.canApprove && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <span className="text-sm">Paid from</span>
          <select className={selectClass + " w-auto"} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Paid from">
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Input type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="Payment date" />
          <Button disabled={pay.pending || !accountId} onClick={() => pay.run({ runId: props.runId, moneyAccountId: accountId, date })}>
            Mark paid
          </Button>
        </div>
      )}
      {props.status === "POSTED" && props.canVoid && (
        <Button
          variant="outline"
          disabled={del.pending}
          onClick={() => {
            const reason = ask();
            if (reason && reason.length >= 3) del.run({ runId: props.runId, reason });
          }}
        >
          Void
        </Button>
      )}
    </div>
  );
}

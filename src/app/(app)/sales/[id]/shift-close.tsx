"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/forms/use-action";
import { closeShiftAction } from "@/domains/sales/actions";
import { cashCount, countDenominations, DENOMINATIONS } from "@/domains/sales/calc";
import { formatPeso, parsePeso } from "@/lib/money";

const BILLS = DENOMINATIONS.map((d) => String(d / 100n));

export function ShiftClose(props: {
  reportId: string;
  canCount: boolean;
  floatCents: string;
  cashSalesCents: string;
  cashExpensesCents: string;
  closed: { expected: string; counted: string; overShortCents: string; overShort: string; reason: string } | null;
}) {
  const router = useRouter();
  const [bills, setBills] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [otherIn, setOtherIn] = useState("");
  const [otherOut, setOtherOut] = useState("");
  const [reason, setReason] = useState("");
  const close = useAction(closeShiftAction, { onSuccess: () => router.refresh() });

  const calc = useMemo(() => {
    const counts = Object.fromEntries(BILLS.map((b) => [b, Number(bills[b] || 0)]));
    const counted = countDenominations(counts, parsePeso(coins || "0") ?? 0n);
    return {
      counted,
      ...cashCount({
        openingFloatCents: BigInt(props.floatCents),
        cashSalesCents: BigInt(props.cashSalesCents),
        cashExpensesCents: BigInt(props.cashExpensesCents),
        otherCashInCents: parsePeso(otherIn || "0") ?? 0n,
        otherCashOutCents: parsePeso(otherOut || "0") ?? 0n,
        countedCents: counted,
      }),
    };
  }, [bills, coins, otherIn, otherOut, props.floatCents, props.cashSalesCents, props.cashExpensesCents]);

  if (props.closed) {
    const os = BigInt(props.closed.overShortCents);
    return (
      <section className="mt-10 max-w-xl rounded-lg border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">Shift closed</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sales/${props.reportId}/receipt`} target="_blank">
              <Printer className="size-4" /> Print slip
            </Link>
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt>Expected cash</dt>
          <dd className="text-right tabular-nums">{props.closed.expected}</dd>
          <dt>Counted</dt>
          <dd className="text-right tabular-nums">{props.closed.counted}</dd>
          <dt>Over / short</dt>
          <dd className={`text-right font-semibold tabular-nums ${os < 0n ? "text-destructive" : os > 0n ? "text-warning" : "text-success"}`}>
            {os === 0n ? "Balanced" : props.closed.overShort}
          </dd>
        </dl>
        {props.closed.reason && <p className="mt-2 text-sm text-muted-foreground">Reason: {props.closed.reason}</p>}
      </section>
    );
  }

  if (!props.canCount) return null;
  const os = calc.overShortCents;

  return (
    <section className="mt-10 max-w-2xl rounded-lg border-2 border-foreground p-5">
      <h2 className="text-2xl">Close shift · cash count</h2>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        <dt>Opening float</dt>
        <dd className="text-right tabular-nums">{formatPeso(BigInt(props.floatCents))}</dd>
        <dt>+ Cash sales</dt>
        <dd className="text-right tabular-nums">{formatPeso(BigInt(props.cashSalesCents))}</dd>
        <dt>− Cash expenses from the drawer</dt>
        <dd className="text-right tabular-nums">{formatPeso(BigInt(props.cashExpensesCents))}</dd>
      </dl>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {BILLS.map((b) => (
          <label key={b} className="text-sm">
            <span className="mb-1 block font-semibold">₱{Number(b).toLocaleString()}</span>
            <Input inputMode="numeric" value={bills[b] ?? ""} placeholder="0" onChange={(e) => setBills((s) => ({ ...s, [b]: e.target.value.replace(/\D/g, "") }))} className="h-12 text-center text-lg" aria-label={`Number of ₱${b} bills`} />
          </label>
        ))}
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Coins (₱ total)</span>
          <Input inputMode="decimal" value={coins} placeholder="0.00" onChange={(e) => setCoins(e.target.value)} className="h-12 text-center text-lg" />
        </label>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Other cash in/out (e.g. change fund top-up)</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input inputMode="decimal" placeholder="Other cash in ₱" value={otherIn} onChange={(e) => setOtherIn(e.target.value)} aria-label="Other cash in" />
          <Input inputMode="decimal" placeholder="Other cash out ₱" value={otherOut} onChange={(e) => setOtherOut(e.target.value)} aria-label="Other cash out" />
        </div>
      </details>
      <dl className="mt-4 grid grid-cols-2 gap-y-1 text-base">
        <dt>Expected in drawer</dt>
        <dd className="text-right font-semibold tabular-nums">{formatPeso(calc.expectedCents)}</dd>
        <dt>Counted</dt>
        <dd className="text-right font-semibold tabular-nums">{formatPeso(calc.counted)}</dd>
        <dt>Over / short</dt>
        <dd className={`text-right font-bold tabular-nums ${os < 0n ? "text-destructive" : os > 0n ? "text-warning" : "text-success"}`}>
          {os === 0n ? "Balanced ✓" : formatPeso(os)}
        </dd>
      </dl>
      {os !== 0n && (
        <Textarea className="mt-3" placeholder="Reason for the over/short (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for over or short" />
      )}
      <Button
        className="mt-4 h-12 w-full text-base"
        disabled={close.pending}
        onClick={() => {
          if (confirm(`Close the shift with ${formatPeso(calc.counted)} counted?`)) {
            close.run({ reportId: props.reportId, bills: Object.fromEntries(BILLS.map((b) => [b, Number(bills[b] || 0)])), coins: coins || "0", otherCashIn: otherIn || "0", otherCashOut: otherOut || "0", reason });
          }
        }}
      >
        {close.pending ? "Closing…" : "Close shift"}
      </Button>
    </section>
  );
}

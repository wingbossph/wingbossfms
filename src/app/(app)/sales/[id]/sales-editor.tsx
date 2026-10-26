"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { useDraft } from "@/components/forms/use-draft";
import { saveDraftAction, submitReportAction } from "@/domains/sales/actions";
import { computeSalesTotals, lineGross, linePaxHundredths, scPwdDiscount } from "@/domains/sales/calc";
import { formatPeso, parsePeso } from "@/lib/money";

type Product = { id: string; name: string; type: string; priceCents: string; paxPerUnit: string };
type DiscountType = { id: string; name: string; rateBp: number | null; requiresIdentity: boolean };
type Channel = { id: string; name: string; kind: string };
type Discount = { discountTypeId: string; amount: string; customerName: string; idNumber: string; receiptNo: string; notes: string; imported?: boolean };
type Void = { amount: string; isRefund: boolean; reason: string; receiptNo: string };

type State = {
  manualLines: Record<string, string>;
  discounts: Discount[];
  voids: Void[];
  serviceCharge: string;
  payments: Record<string, { amount: string; reference: string }>;
  mismatchExplanation: string;
};

type Props = {
  editable: boolean;
  report: State & {
    id: string;
    updatedAt: string;
    importedLines: { name: string; qty: string; grossCents: string; paxHundredths: string }[];
  };
  products: Product[];
  discountTypes: DiscountType[];
  channels: Channel[];
};

const TYPE_LABEL: Record<string, string> = {
  PACKAGE: "Unlimited packages",
  ALA_CARTE: "À la carte",
  ADDON: "Add-ons",
  BEVERAGE: "Drinks",
  TAKEOUT: "Take-out",
  OTHER: "Other",
};

const cents = (v: string) => parsePeso(v || "0") ?? 0n;
const validQty = (q: string) => /^\d+(\.\d{1,2})?$/.test(q);

export function SalesEditor({ editable, report, products, discountTypes, channels }: Props) {
  const router = useRouter();
  const initial: State = {
    manualLines: report.manualLines,
    discounts: report.discounts,
    voids: report.voids,
    serviceCharge: report.serviceCharge,
    payments: report.payments,
    mismatchExplanation: report.mismatchExplanation,
  };
  const [st, setSt] = useState<State>(initial);
  const draft = useDraft(`sales-draft:${report.id}`, st, report.updatedAt, editable);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const onDone = () => {
    draft.clear();
    router.refresh();
  };
  const save = useAction(saveDraftAction, { onSuccess: onDone });
  const submit = useAction(submitReportAction, { onSuccess: onDone });

  const totals = useMemo(() => {
    const lines = [
      ...report.importedLines.map((l) => ({ grossCents: BigInt(l.grossCents), paxHundredths: BigInt(l.paxHundredths) })),
      ...Object.entries(st.manualLines)
        .filter(([id, q]) => validQty(q) && productById.has(id))
        .map(([id, q]) => {
          const p = productById.get(id)!;
          return { grossCents: lineGross(q, BigInt(p.priceCents)), paxHundredths: linePaxHundredths(q, p.paxPerUnit) };
        }),
    ];
    return computeSalesTotals({
      lines,
      discounts: st.discounts.map((d) => ({ amountCents: cents(d.amount) })),
      refunds: st.voids.filter((v) => v.isRefund).map((v) => ({ amountCents: cents(v.amount) })),
      serviceChargeCents: cents(st.serviceCharge),
      payments: Object.values(st.payments).map((p) => ({ amountCents: cents(p.amount) })),
    });
  }, [st, report.importedLines, productById]);

  const payload = () => ({
    reportId: report.id,
    lines: Object.entries(st.manualLines)
      .filter(([, q]) => validQty(q) && Number(q) > 0)
      .map(([productId, qty]) => ({ productId, qty })),
    discounts: st.discounts.map((d) => ({
      discountTypeId: d.discountTypeId,
      amount: d.amount,
      customerName: d.customerName,
      idNumber: d.idNumber,
      receiptNo: d.receiptNo,
      notes: d.notes,
    })),
    voids: st.voids,
    serviceCharge: st.serviceCharge || "0",
    payments: Object.entries(st.payments)
      .filter(([, p]) => cents(p.amount) !== 0n)
      .map(([channelId, p]) => ({ channelId, amount: p.amount, reference: p.reference })),
    mismatchExplanation: st.mismatchExplanation,
  });

  const setQty = (id: string, q: string) => setSt((s) => ({ ...s, manualLines: { ...s.manualLines, [id]: q } }));
  const bump = (id: string, d: number) => {
    const cur = Number(st.manualLines[id] || 0);
    setQty(id, String(Math.max(0, cur + d)));
  };
  const remaining = totals.netCents - totals.paymentsCents;
  const groups = Object.keys(TYPE_LABEL).filter((t) => products.some((p) => p.type === t));
  const ro = !editable;

  return (
    <div className="space-y-8 pb-40">
      {draft.restorable && editable && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          You have unsaved changes on this device.
          <Button size="sm" onClick={() => { setSt(draft.restorable!); draft.dismiss(); }}>
            Restore them
          </Button>
          <Button size="sm" variant="ghost" onClick={draft.dismiss}>
            Discard
          </Button>
        </div>
      )}

      {report.importedLines.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">From Loyverse</h2>
          <div className="rounded-lg border">
            {report.importedLines.map((l, i) => (
              <div key={i} className="flex justify-between border-b px-3 py-2 text-sm last:border-0">
                <span>
                  {l.name} <span className="text-muted-foreground">× {Number(l.qty)}</span>
                </span>
                <span className="tabular-nums">{formatPeso(BigInt(l.grossCents))}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Imported lines can&apos;t be edited here. Add anything not rung up in Loyverse below.</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-2xl">{report.importedLines.length ? "Not in Loyverse" : "Sales"}</h2>
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{TYPE_LABEL[g]}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {products
                  .filter((p) => p.type === g)
                  .map((p) => {
                    const q = st.manualLines[p.id] ?? "";
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-lg border p-2 ${Number(q) > 0 ? "border-foreground" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{p.name}</p>
                          <p className={`text-xs ${p.priceCents === "0" ? "text-destructive" : "text-muted-foreground"}`}>
                            {p.priceCents === "0" ? "No price set" : formatPeso(BigInt(p.priceCents))}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="icon" className="size-11" disabled={ro} onClick={() => bump(p.id, -1)} aria-label={`One less ${p.name}`}>
                          <Minus className="size-5" />
                        </Button>
                        <Input
                          inputMode="decimal"
                          value={q}
                          disabled={ro}
                          placeholder="0"
                          onChange={(e) => setQty(p.id, e.target.value.replace(/[^\d.]/g, ""))}
                          className="h-11 w-16 text-center text-lg tabular-nums"
                          aria-label={`${p.name} quantity`}
                        />
                        <Button type="button" variant="outline" size="icon" className="size-11" disabled={ro} onClick={() => bump(p.id, 1)} aria-label={`One more ${p.name}`}>
                          <Plus className="size-5" />
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl">Discounts</h2>
          {!ro && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSt((s) => ({ ...s, discounts: [...s.discounts, { discountTypeId: discountTypes[0]?.id ?? "", amount: "", customerName: "", idNumber: "", receiptNo: "", notes: "" }] }))
              }
            >
              <Plus className="size-4" /> Add discount
            </Button>
          )}
        </div>
        {st.discounts.length === 0 && <p className="text-sm text-muted-foreground">No discounts.</p>}
        <div className="space-y-3">
          {st.discounts.map((d, i) => {
            const type = discountTypes.find((t) => t.id === d.discountTypeId);
            const set = (patch: Partial<Discount>) => setSt((s) => ({ ...s, discounts: s.discounts.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
            return (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_auto]">
                <select className={selectClass} value={d.discountTypeId} disabled={ro} onChange={(e) => set({ discountTypeId: e.target.value })} aria-label="Discount type">
                  {discountTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Input inputMode="decimal" placeholder="Amount ₱" value={d.amount} disabled={ro} onChange={(e) => set({ amount: e.target.value })} aria-label="Discount amount" />
                {!ro && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove discount" onClick={() => setSt((s) => ({ ...s, discounts: s.discounts.filter((_, j) => j !== i) }))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
                {type?.requiresIdentity && (
                  <div className="grid gap-2 sm:col-span-3 sm:grid-cols-4">
                    <Input placeholder="Customer name" value={d.customerName} disabled={ro} onChange={(e) => set({ customerName: e.target.value })} aria-label="Customer name" />
                    <Input placeholder="SC / PWD ID no." value={d.idNumber} disabled={ro} onChange={(e) => set({ idNumber: e.target.value })} aria-label="ID number" />
                    <Input placeholder="Receipt no." value={d.receiptNo} disabled={ro} onChange={(e) => set({ receiptNo: e.target.value })} aria-label="Receipt number" />
                    {!ro && type.rateBp && <TwentyPercentHelper rateBp={type.rateBp} onApply={(amount) => set({ amount })} />}
                  </div>
                )}
                {d.imported && <p className="text-xs text-muted-foreground sm:col-span-3">Total of Loyverse discounts. Change the type, or split SC/PWD out with their details.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl">Voids &amp; refunds</h2>
          {!ro && (
            <Button type="button" variant="outline" onClick={() => setSt((s) => ({ ...s, voids: [...s.voids, { amount: "", isRefund: false, reason: "", receiptNo: "" }] }))}>
              <Plus className="size-4" /> Add
            </Button>
          )}
        </div>
        {st.voids.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
        <div className="space-y-2">
          {st.voids.map((v, i) => {
            const set = (patch: Partial<Void>) => setSt((s) => ({ ...s, voids: s.voids.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
            return (
              <div key={i} className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_8rem_auto_auto]">
                <Input inputMode="decimal" placeholder="Amount ₱" value={v.amount} disabled={ro} onChange={(e) => set({ amount: e.target.value })} aria-label="Amount" />
                <Input placeholder="Reason (required)" value={v.reason} disabled={ro} onChange={(e) => set({ reason: e.target.value })} aria-label="Reason" />
                <Input placeholder="Receipt no." value={v.receiptNo} disabled={ro} onChange={(e) => set({ receiptNo: e.target.value })} aria-label="Receipt number" />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={v.isRefund} disabled={ro} onCheckedChange={(c) => set({ isRefund: !!c })} /> Money refunded
                </label>
                {!ro && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setSt((s) => ({ ...s, voids: s.voids.filter((_, j) => j !== i) }))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">A void cancels items before payment (logged only). A refund returns money and reduces net sales.</p>
      </section>

      <section className="max-w-xs">
        <h2 className="mb-2 text-2xl">Service charge</h2>
        <Input inputMode="decimal" value={st.serviceCharge} disabled={ro} onChange={(e) => setSt((s) => ({ ...s, serviceCharge: e.target.value }))} aria-label="Service charge" placeholder="0.00" />
      </section>

      <section>
        <h2 className="mb-2 text-2xl">Payments</h2>
        <p className="mb-3 text-sm text-muted-foreground">Every peso of net sales must go to a payment channel.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {channels.map((c) => {
            const p = st.payments[c.id] ?? { amount: "", reference: "" };
            const set = (patch: Partial<{ amount: string; reference: string }>) => setSt((s) => ({ ...s, payments: { ...s.payments, [c.id]: { ...p, ...patch } } }));
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2">
                <span className="min-w-28 flex-1 font-semibold">{c.name}</span>
                <Input inputMode="decimal" placeholder="0.00" value={p.amount} disabled={ro} onChange={(e) => set({ amount: e.target.value })} className="h-11 w-32 text-right text-lg tabular-nums" aria-label={`${c.name} amount`} />
                {!ro && remaining > 0n && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ amount: formatPeso(cents(p.amount) + remaining, { symbol: false }) })} title="Put the remaining amount here">
                    + rest
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64 md:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
          <span>Gross <b>{formatPeso(totals.grossCents)}</b></span>
          <span>Discounts <b>−{formatPeso(totals.discountCents)}</b></span>
          {totals.refundCents > 0n && <span>Refunds <b>−{formatPeso(totals.refundCents)}</b></span>}
          {totals.serviceChargeCents > 0n && <span>Service <b>{formatPeso(totals.serviceChargeCents)}</b></span>}
          <span className="text-base">Net <b>{formatPeso(totals.netCents)}</b></span>
          <span>Paid <b>{formatPeso(totals.paymentsCents)}</b></span>
          <span>Pax <b>{(Number(totals.paxHundredths) / 100).toLocaleString()}</b></span>
          <span className={totals.differenceCents === 0n ? "text-success" : "font-semibold text-destructive"}>
            {totals.differenceCents === 0n ? "Payments match ✓" : `${totals.differenceCents < 0n ? "Unassigned" : "Over-assigned"} ${formatPeso(totals.differenceCents < 0n ? -totals.differenceCents : totals.differenceCents)}`}
          </span>
        </div>
        {editable && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {totals.differenceCents !== 0n && (
              <Textarea
                rows={1}
                placeholder="Why don't payments match? (required to submit)"
                value={st.mismatchExplanation}
                onChange={(e) => setSt((s) => ({ ...s, mismatchExplanation: e.target.value }))}
                className="min-h-10 flex-1"
                aria-label="Explanation for payment difference"
              />
            )}
            <Button type="button" variant="outline" className="h-11" disabled={save.pending || submit.pending} onClick={() => save.run(payload())}>
              {save.pending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              className="h-11 px-6"
              disabled={save.pending || submit.pending}
              onClick={() => {
                if (confirm("Submit these sales? You won't be able to edit them after this.")) submit.run(payload());
              }}
            >
              {submit.pending ? "Submitting…" : "Submit sales"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TwentyPercentHelper({ rateBp, onApply }: { rateBp: number; onApply: (amount: string) => void }) {
  const [share, setShare] = useState("");
  return (
    <div className="flex items-center gap-1">
      <Input inputMode="decimal" placeholder="Their bill ₱" value={share} onChange={(e) => setShare(e.target.value)} aria-label="Senior/PWD share of the bill" />
      <Button type="button" variant="outline" size="sm" onClick={() => onApply(formatPeso(scPwdDiscount(parsePeso(share || "0") ?? 0n, rateBp), { symbol: false }))}>
        {rateBp / 100}%
      </Button>
    </div>
  );
}

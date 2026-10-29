"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "@/components/forms/field";
import { CategoryPicker } from "@/components/forms/category-picker";
import { useAction } from "@/components/forms/use-action";
import { useDraft } from "@/components/forms/use-draft";
import { PhotoInput, type UploadedFile } from "@/components/forms/photo-input";
import { saveExpenseAction } from "@/domains/expenses/actions";
import type { ExpenseFormData } from "@/domains/expenses/form-data";
import { formatPeso, parsePeso } from "@/lib/money";

type Line = { kind: "category" | "item"; accountId: string; itemId: string; qty: string; unit: "BASE" | "PURCHASE"; description: string; amount: string };

export type ExpenseFormValues = {
  id?: string;
  locationId: string;
  date: string;
  supplierId: string;
  newSupplierName: string;
  terms: "PAID_NOW" | "ON_ACCOUNT";
  paidFromMoneyAccountId: string;
  dueDate: string;
  receiptNo: string;
  notes: string;
  lines: Line[];
};

const MONEY_LABEL: Record<string, string> = {
  CASH_DRAWER: "Cash drawer",
  PETTY_CASH: "Petty cash",
  BANK: "Bank",
  EWALLET: "E-wallet",
  OWNER_PERSONAL: "Owner's own money",
};

const emptyLine = (): Line => ({ kind: "category", accountId: "", itemId: "", qty: "", unit: "BASE", description: "", amount: "" });

export function ExpenseForm({
  data,
  initial,
  today,
  updatedAt = "1970-01-01T00:00:00.000Z",
}: {
  data: ExpenseFormData;
  initial?: ExpenseFormValues;
  today: string;
  updatedAt?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<ExpenseFormValues>(
    initial ?? {
      locationId: data.locations[0]?.id ?? "",
      date: today,
      supplierId: "",
      newSupplierName: "",
      terms: "PAID_NOW",
      paidFromMoneyAccountId: "",
      dueDate: "",
      receiptNo: "",
      notes: "",
      lines: [emptyLine()],
    },
  );
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const draft = useDraft(`expense-draft:${v.id ?? "new"}`, v, updatedAt);
  const save = useAction(saveExpenseAction, {
    onSuccess: (s) => {
      draft.clear();
      const id = (s as { id?: string } | null)?.id;
      router.push(id ? `/expenses/${id}` : "/expenses");
      router.refresh();
    },
  });

  const moneyOptions = data.moneyAccounts.filter((m) => !m.locationId || m.locationId === v.locationId);
  const items = data.items.filter((i) => i.locationIds.includes(v.locationId));
  const total = v.lines.reduce((a, l) => a + (parsePeso(l.amount || "0") ?? 0n), 0n);
  const set = (patch: Partial<ExpenseFormValues>) => setV((p) => ({ ...p, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) => setV((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const err = save.fieldError;

  function submit(submitNow: boolean) {
    save.run({
      id: v.id,
      locationId: v.locationId,
      date: v.date,
      supplierId: v.supplierId,
      newSupplierName: v.newSupplierName,
      terms: v.terms,
      paidFromMoneyAccountId: v.terms === "PAID_NOW" ? v.paidFromMoneyAccountId : "",
      dueDate: v.terms === "ON_ACCOUNT" ? v.dueDate : "",
      receiptNo: v.receiptNo,
      notes: v.notes,
      lines: v.lines.map((l) => ({
        accountId: l.kind === "category" ? l.accountId : "",
        itemId: l.kind === "item" ? l.itemId : "",
        qty: l.kind === "item" ? l.qty : "",
        unit: l.unit,
        description: l.description,
        amount: l.amount || "0",
      })),
      attachmentIds: files.map((f) => f.id),
      submit: submitNow,
    });
  }

  return (
    <form
      className="max-w-3xl space-y-6 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
    >
      {draft.restorable && !v.id && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          You have an unsaved expense on this device.
          <Button type="button" size="sm" onClick={() => { setV(draft.restorable!); draft.dismiss(); }}>
            Restore it
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={draft.dismiss}>
            Discard
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.locations.length > 1 && (
          <Field id="eloc" label="Location">
            <select id="eloc" className={`${selectClass} h-12`} value={v.locationId} disabled={!!v.id} onChange={(e) => set({ locationId: e.target.value, paidFromMoneyAccountId: "" })}>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="edate" label="Date" error={err("date")}>
          <Input id="edate" type="date" max={today} value={v.date} onChange={(e) => set({ date: e.target.value })} className="h-12" />
        </Field>
        <Field id="eterms" label="Paid?">
          <select id="eterms" className={`${selectClass} h-12`} value={v.terms} onChange={(e) => set({ terms: e.target.value as ExpenseFormValues["terms"] })}>
            <option value="PAID_NOW">Paid now</option>
            <option value="ON_ACCOUNT">Supplier bill, pay later</option>
          </select>
        </Field>
        {v.terms === "PAID_NOW" ? (
          <Field id="efrom" label="Paid from" error={err("paidFromMoneyAccountId")}>
            <select id="efrom" className={`${selectClass} h-12`} value={v.paidFromMoneyAccountId} onChange={(e) => set({ paidFromMoneyAccountId: e.target.value })}>
              <option value="">Choose…</option>
              {moneyOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.locationId ? MONEY_LABEL[m.kind] : m.name}
                  {m.kind === "OWNER_PERSONAL" ? " (owner advance)" : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field id="edue" label="Due date" hint="Blank = supplier's usual terms">
            <Input id="edue" type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-12" />
          </Field>
        )}
        <Field id="esup" label="Supplier" error={err("supplierId")}>
          <Input
            id="esup"
            list="suppliers"
            value={v.supplierId ? data.suppliers.find((s) => s.id === v.supplierId)?.name ?? "" : v.newSupplierName}
            placeholder="Type or pick (optional for small cash buys)"
            onChange={(e) => {
              const match = data.suppliers.find((s) => s.name.toLowerCase() === e.target.value.toLowerCase());
              if (match) {
                const firstLineEmpty = v.lines.length === 1 && !v.lines[0].accountId && v.lines[0].kind === "category";
                set({ supplierId: match.id, newSupplierName: "", ...(firstLineEmpty && match.defaultAccountId ? { lines: [{ ...v.lines[0], accountId: match.defaultAccountId }] } : {}) });
              } else set({ supplierId: "", newSupplierName: e.target.value });
            }}
            className="h-12"
          />
          <datalist id="suppliers">
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field id="eor" label="OR / receipt / invoice no.">
          <Input id="eor" value={v.receiptNo} onChange={(e) => set({ receiptNo: e.target.value })} className="h-12" />
        </Field>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">What was bought</h2>
        {v.lines.map((l, i) => {
          const item = items.find((it) => it.id === l.itemId);
          return (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2 text-sm" role="radiogroup" aria-label="Line type">
                {(["category", "item"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={l.kind === k}
                    onClick={() => setLine(i, { kind: k })}
                    className={`rounded-full border px-3 py-1 ${l.kind === k ? "border-foreground bg-foreground text-background" : ""}`}
                  >
                    {k === "category" ? "Expense category" : "Inventory item"}
                  </button>
                ))}
                {v.lines.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Remove line" onClick={() => set({ lines: v.lines.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                {l.kind === "category" ? (
                  <CategoryPicker className="h-12" value={l.accountId} onChange={(id) => setLine(i, { accountId: id })} groups={data.categories} />
                ) : (
                  <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                    <select className={`${selectClass} h-12`} value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value, unit: "BASE" })} aria-label="Item">
                      <option value="">Choose item…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    <Input inputMode="decimal" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="h-12" aria-label="Quantity" />
                    <select className={`${selectClass} h-12`} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as Line["unit"] })} aria-label="Unit">
                      <option value="BASE">{item?.baseUnit ?? "unit"}</option>
                      {item?.purchaseUnit && <option value="PURCHASE">{item.purchaseUnit} ({item.purchaseToBase} {item.baseUnit})</option>}
                    </select>
                  </div>
                )}
                <Input inputMode="decimal" placeholder="Amount ₱" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} className="h-12 text-right text-lg" aria-label="Amount" />
              </div>
              <Input placeholder="Description (optional)" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Description" />
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => set({ lines: [...v.lines, emptyLine()] })}>
            <Plus className="size-4" /> Add line
          </Button>
          <p className="text-lg">
            Total <b className="tabular-nums">{formatPeso(total)}</b>
          </p>
        </div>
        {err("lines") && <p className="text-sm text-destructive">{err("lines")}</p>}
      </section>

      <Field id="enotes" label="Notes">
        <Textarea id="enotes" value={v.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
      </Field>

      <PhotoInput locationId={v.locationId} value={files} onChange={setFiles} label="Photo of receipt" />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-12 px-6" disabled={save.pending}>
          {save.pending ? "Saving…" : "Submit"}
        </Button>
        <Button type="button" variant="outline" className="h-12" disabled={save.pending} onClick={() => submit(false)}>
          Save as draft
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Submitted expenses go to an approver (amounts of ₱5,000 and up need the Owner). After approval they can&apos;t be edited.
      </p>
    </form>
  );
}

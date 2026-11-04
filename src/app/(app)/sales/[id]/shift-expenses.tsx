"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { selectClass } from "@/components/forms/field";
import { CategoryPicker } from "@/components/forms/category-picker";
import {
  addShiftExpenseAction,
  removeShiftExpenseAction,
} from "@/domains/expenses/actions";
import { formatPeso } from "@/lib/money";

type Expense = {
  id: string;
  number: number;
  description: string;
  category: string;
  paidFrom: string;
  deducted: boolean;
  /** Part paid from the cash drawer (the rest is not deducted). */
  drawerCents: string;
  amountCents: string;
  status: string;
  removable: boolean;
};
type Option = { id: string; name: string };

/** The day's expenses, added right from the sales screen. Each one is a normal expense (it also shows on the Expenses page). */
export function ShiftExpenses({
  reportId,
  expenses,
  categories,
  sources,
  canAdd,
}: {
  reportId: string;
  expenses: Expense[];
  categories: { group: string; accounts: Option[] }[];
  /** Where it was paid from; the first (Cash Drawer) is deducted from the day's net. */
  sources: { key: string; label: string }[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = {
    accountId: "",
    description: "",
    amount: "",
    source: sources[0]?.key ?? "DRAWER",
    receiptNo: "",
  };
  const [form, setForm] = useState(blank);
  const drawer = expenses.reduce((a, e) => a + BigInt(e.drawerCents), 0n);
  const other = expenses.reduce((a, e) => a + BigInt(e.amountCents) - BigInt(e.drawerCents), 0n);

  function add() {
    start(async () => {
      const res = await addShiftExpenseAction({ reportId, ...form });
      if (!res?.ok)
        return void toast.error(res?.message ?? "Couldn't add the expense.");
      toast.success(res.message);
      setForm({ ...blank, source: form.source });
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Remove this expense?")) return;
    start(async () => {
      const res = await removeShiftExpenseAction(id);
      if (!res?.ok)
        return void toast.error(res?.message ?? "Couldn't remove it.");
      toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="day-expenses">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="day-expenses" className="text-2xl">
          Expenses today
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          Cash Drawer {formatPeso(drawer)}
          {other > 0n && <> · other sources {formatPeso(other)}</>}
        </span>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Paid out today (e.g. ice, LPG, delivery). Only <b>Cash Drawer</b>{" "}
        expenses are deducted from today&apos;s net; other sources are recorded
        as expenses only. All are listed on the Expenses page.
      </p>

      {expenses.length > 0 && (
        <ul className="mb-3 divide-y rounded-lg border">
          {expenses.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <Link
                href={`/expenses/${e.id}`}
                className="min-w-0 flex-1 truncate font-semibold hover:underline"
              >
                {e.description}
              </Link>
              <span className="text-muted-foreground">{e.category}</span>
              <span
                className={e.deducted ? "font-medium" : "text-muted-foreground"}
              >
                · Paid by {e.paidFrom}
              </span>
              {!e.deducted && <Badge variant="outline">not deducted</Badge>}
              {e.status !== "POSTED" && (
                <Badge variant="outline">
                  {e.status === "SUBMITTED"
                    ? "Needs approval"
                    : e.status.toLowerCase()}
                </Badge>
              )}
              <span className="w-28 text-right font-semibold tabular-nums">
                {formatPeso(BigInt(e.amountCents))}
              </span>
              {e.removable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  onClick={() => remove(e.id)}
                  aria-label={`Remove ${e.description}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_8rem] lg:grid-cols-[1.3fr_1fr_1fr_8rem_auto]">
          <Input
            placeholder="What was it for?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            aria-label="Expense description"
          />
          <CategoryPicker
            value={form.accountId}
            onChange={(id) => setForm({ ...form, accountId: id })}
            groups={categories}
            placeholder="Category…"
            ariaLabel="Expense category"
          />
          <select
            className={selectClass}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            aria-label="Paid by"
          >
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                Paid by {s.label}
              </option>
            ))}
          </select>
          <Input
            inputMode="decimal"
            placeholder="Amount ₱"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="text-right tabular-nums"
            aria-label="Expense amount"
          />
          <Button
            type="button"
            onClick={add}
            disabled={
              pending || !form.description || !form.accountId || !form.amount
            }
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}

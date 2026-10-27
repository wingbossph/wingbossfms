"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveSupplierAction } from "@/domains/expenses/actions";

type Supplier = {
  id: string;
  name: string;
  tin: string;
  contactName: string;
  phone: string;
  email: string;
  termsDays: number;
  defaultAccountId: string;
  isActive: boolean;
  spend: string;
};
type Categories = { group: string; groupId: string; accounts: { id: string; name: string }[] }[];

export function SuppliersEditor({ suppliers, categories }: { suppliers: Supplier[]; categories: Categories }) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const accountName = new Map(categories.flatMap((g) => g.accounts.map((a) => [a.id, a.name] as const)));
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing({ id: "", name: "", tin: "", contactName: "", phone: "", email: "", termsDays: 0, defaultAccountId: "", isActive: true, spend: "" })}>
          <Plus className="size-4" /> Add supplier
        </Button>
      </div>
      <SimpleTable
        head={["Supplier", "Contact", "Terms", "Usual category", "Posted spend", ""]}
        rows={suppliers.map((s) => [
          <span key="n" className="font-semibold">
            {s.name} {!s.isActive && <Badge variant="outline">Inactive</Badge>}
          </span>,
          [s.contactName, s.phone].filter(Boolean).join(" · "),
          s.termsDays ? `${s.termsDays} days` : "Cash",
          accountName.get(s.defaultAccountId) ?? "—",
          s.spend,
          <Button key="e" variant="ghost" size="sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
            <Pencil className="size-4" />
          </Button>,
        ])}
        empty="No suppliers yet. They're also added when you type a new name on an expense."
      />
      {editing && <SupplierDialog value={editing} categories={categories} onClose={() => setEditing(null)} />}
    </>
  );
}

function SupplierDialog({ value, categories, onClose }: { value: Supplier; categories: Categories; onClose: () => void }) {
  const router = useRouter();
  const [s, setS] = useState(value);
  const save = useAction(saveSupplierAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s.id ? `Edit ${value.name}` : "Add supplier"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...s, id: s.id || undefined });
          }}
        >
          <Field id="sname" label="Name" error={save.fieldError("name")}>
            <Input id="sname" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="stin" label="TIN">
              <Input id="stin" value={s.tin} onChange={(e) => setS({ ...s, tin: e.target.value })} />
            </Field>
            <Field id="sterms" label="Payment terms (days)">
              <Input id="sterms" type="number" min={0} value={s.termsDays} onChange={(e) => setS({ ...s, termsDays: Number(e.target.value) })} />
            </Field>
            <Field id="scontact" label="Contact person">
              <Input id="scontact" value={s.contactName} onChange={(e) => setS({ ...s, contactName: e.target.value })} />
            </Field>
            <Field id="sphone" label="Phone">
              <Input id="sphone" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
            </Field>
          </div>
          <Field id="semail" label="Email">
            <Input id="semail" type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} />
          </Field>
          <Field id="scat" label="Usual category">
            <select id="scat" className={selectClass} value={s.defaultAccountId} onChange={(e) => setS({ ...s, defaultAccountId: e.target.value })}>
              <option value="">None</option>
              {categories.map((g) => (
                <optgroup key={g.groupId} label={g.group}>
                  {g.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={s.isActive} onCheckedChange={(v) => setS({ ...s, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

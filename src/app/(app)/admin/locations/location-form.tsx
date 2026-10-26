"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { createLocationAction, updateLocationAction } from "@/domains/admin/actions";

type Option = { id: string; name: string };
type LocationType = "BRANCH" | "COMMISSARY" | "OFFICE";
type MoneyKind = "CASH_DRAWER" | "UNDEPOSITED_CASH" | "PETTY_CASH";

const MONEY_KINDS: { kind: MoneyKind; label: string; hint: string }[] = [
  { kind: "CASH_DRAWER", label: "Cash drawer", hint: "Holds the opening float" },
  { kind: "UNDEPOSITED_CASH", label: "Undeposited cash", hint: "Cash sales waiting for deposit" },
  { kind: "PETTY_CASH", label: "Petty cash fund", hint: "Small purchases with receipts" },
];

const DEFAULT_MONEY: Record<LocationType, MoneyKind[]> = {
  BRANCH: ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH"],
  COMMISSARY: ["PETTY_CASH"],
  OFFICE: [],
};

export type LocationFormValues = {
  id?: string;
  name: string;
  code: string;
  type: LocationType;
  address: string;
  openedOn: string;
  drawerFloat: string;
  sortOrder: number;
  isActive: boolean;
  channelIds: string[];
};

type Props = {
  initial?: LocationFormValues;
  channels: Option[];
  users: Option[];
  roles: Option[];
};

export function LocationForm({ initial, channels, users, roles }: Props) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [v, setV] = useState<LocationFormValues>(
    initial ?? {
      name: "",
      code: "",
      type: "BRANCH",
      address: "",
      openedOn: "",
      drawerFloat: "2,000.00",
      sortOrder: 50,
      isActive: true,
      channelIds: channels.map((c) => c.id),
    },
  );
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyKind[]>(DEFAULT_MONEY[v.type]);
  const [staff, setStaff] = useState<{ userId: string; roleId: string }[]>([]);

  const create = useAction(createLocationAction, { onSuccess: () => router.push("/admin/locations") });
  const update = useAction(updateLocationAction, { onSuccess: () => router.refresh() });
  const { pending, fieldError } = editing ? update : create;

  const set = <K extends keyof LocationFormValues>(k: K, value: LocationFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));

  function onTypeChange(type: LocationType) {
    set("type", type);
    if (!editing) {
      setMoneyAccounts(DEFAULT_MONEY[type]);
      set("channelIds", type === "BRANCH" ? channels.map((c) => c.id) : []);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      name: v.name,
      code: v.code,
      type: v.type,
      address: v.address,
      openedOn: v.openedOn,
      drawerFloat: v.drawerFloat,
      sortOrder: v.sortOrder,
      channelIds: v.channelIds,
    };
    if (editing) update.run({ ...base, id: v.id, isActive: v.isActive });
    else create.run({ ...base, moneyAccounts, staff: staff.filter((s) => s.userId && s.roleId) });
  }

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" error={fieldError("name")}>
          <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Wingboss Toril" required />
        </Field>
        <Field id="code" label="Short code" error={fieldError("code")} hint="2–6 letters, used in account codes and reports">
          <Input id="code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="TOR" required maxLength={6} />
        </Field>
        <Field id="type" label="Type" error={fieldError("type")}>
          <select id="type" className={selectClass} value={v.type} onChange={(e) => onTypeChange(e.target.value as LocationType)}>
            <option value="BRANCH">Branch (store)</option>
            <option value="COMMISSARY">Commissary / central kitchen</option>
            <option value="OFFICE">Head office (shared overhead)</option>
          </select>
        </Field>
        <Field id="openedOn" label="Opening date" error={fieldError("openedOn")}>
          <Input id="openedOn" type="date" value={v.openedOn} onChange={(e) => set("openedOn", e.target.value)} />
        </Field>
        <Field id="address" label="Address" error={fieldError("address")} className="sm:col-span-2">
          <Textarea id="address" value={v.address} onChange={(e) => set("address", e.target.value)} rows={2} />
        </Field>
        {v.type === "BRANCH" && (
          <Field id="drawerFloat" label="Cash drawer opening float (₱)" error={fieldError("drawerFloat")}>
            <Input id="drawerFloat" inputMode="decimal" value={v.drawerFloat} onChange={(e) => set("drawerFloat", e.target.value)} />
          </Field>
        )}
        <Field id="sortOrder" label="Display order" error={fieldError("sortOrder")}>
          <Input id="sortOrder" type="number" min={0} value={v.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
        </Field>
        {editing && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch id="isActive" checked={v.isActive} onCheckedChange={(c) => set("isActive", c)} />
            <label htmlFor="isActive" className="text-sm">
              Active. Inactive locations are hidden from entry screens; their history stays in reports.
            </label>
          </div>
        )}
      </section>

      {!editing && (
        <section>
          <h2 className="text-xl">Money accounts</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Each gets its own ledger sub-account. Shared accounts (BPI, GCash, Maya, Grab) already exist and are used by every location.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MONEY_KINDS.map((m) => (
              <label key={m.kind} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox checked={moneyAccounts.includes(m.kind)} onCheckedChange={() => setMoneyAccounts((l) => toggle(l, m.kind))} />
                <span>
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl">Payment channels accepted</h2>
        <p className="mb-3 text-sm text-muted-foreground">Shown on this location&apos;s sales entry screen.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {channels.map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <Checkbox checked={v.channelIds.includes(c.id)} onCheckedChange={() => set("channelIds", toggle(v.channelIds, c.id))} />
              {c.name}
            </label>
          ))}
        </div>
      </section>

      {!editing && (
        <section>
          <h2 className="text-xl">Staff</h2>
          <p className="mb-3 text-sm text-muted-foreground">Assign existing users. You can also do this later from Users.</p>
          <div className="space-y-2">
            {staff.map((s, i) => (
              <div key={i} className="flex gap-2">
                <select
                  aria-label="User"
                  className={selectClass}
                  value={s.userId}
                  onChange={(e) => setStaff((l) => l.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)))}
                >
                  <option value="">Choose user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Role"
                  className={selectClass}
                  value={s.roleId}
                  onChange={(e) => setStaff((l) => l.map((x, j) => (j === i ? { ...x, roleId: e.target.value } : x)))}
                >
                  <option value="">Role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setStaff((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setStaff((l) => [...l, { userId: "", roleId: "" }])}>
              <Plus className="size-4" /> Add staff
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            The price list is set per location in Sales settings (Phase 2). Reports include the new location automatically.
          </p>
        </section>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-11 px-6">
          {pending ? "Saving…" : editing ? "Save changes" : "Add location"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/locations")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

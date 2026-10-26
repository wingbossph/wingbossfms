"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { SimpleTable } from "@/components/data-table/simple-table";
import {
  deleteLoyverseMappingAction,
  saveChannelAction,
  saveDiscountTypeAction,
  saveMoneyAccountAction,
  saveSettingAction,
} from "@/domains/sales/setup-actions";

type Option = { id: string; name: string };
type Channel = {
  id: string;
  name: string;
  kind: string;
  moneyAccountId: string | null;
  moneyAccountName: string;
  isDeferred: boolean;
  feeRate: string;
  feeFixed: string;
  withholdingRate: string;
  settlementDelayDays: number;
  settlesToMoneyAccountId: string | null;
  isActive: boolean;
  sortOrder: number;
  locationIds: string[];
};
type MoneyAccount = {
  id: string;
  name: string;
  kind: string;
  locationId: string | null;
  locationName: string;
  isPersonal: boolean;
  institution: string;
  accountRef: string;
  isActive: boolean;
  glCode: string;
};
type DiscountType = {
  id: string;
  code: string;
  name: string;
  rate: string;
  requiresIdentity: boolean;
  contraAccountId: string;
  contraAccountName: string;
  isActive: boolean;
};
type BranchSettings = { locationId: string; name: string; storeName: string; requirePaymentsMatch: boolean; serviceChargeToStaff: boolean; shiftsPerDay: number };
type Mapping = { id: string; kind: string; externalName: string; target: string; scope: string; paxOverride: string };

const CHANNEL_KINDS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card terminal",
  QR: "QR",
  EWALLET: "E-wallet",
  BANK_TRANSFER: "Bank transfer",
  DELIVERY_PLATFORM: "Delivery platform",
  OTHER: "Other",
};
const MONEY_KINDS: Record<string, string> = {
  CASH_DRAWER: "Cash drawer",
  UNDEPOSITED_CASH: "Undeposited cash",
  PETTY_CASH: "Petty cash",
  BANK: "Bank account",
  EWALLET: "E-wallet",
  CARD_CLEARING: "Card/QR clearing",
  PLATFORM_RECEIVABLE: "Delivery platform receivable",
  OWNER_PERSONAL: "Owner's personal funds",
};

export function PaymentsEditor(props: {
  channels: Channel[];
  moneyAccounts: MoneyAccount[];
  discountTypes: DiscountType[];
  contraAccounts: Option[];
  locations: Option[];
  branchSettings: BranchSettings[];
  mappings: Mapping[];
  products: Option[];
}) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [money, setMoney] = useState<MoneyAccount | null>(null);
  const [discount, setDiscount] = useState<DiscountType | null>(null);
  const router = useRouter();
  const delMapping = useAction(deleteLoyverseMappingAction, { onSuccess: () => router.refresh() });

  return (
    <div className="space-y-12">
      <Section
        title="Payment channels"
        hint="Every peso of sales is assigned to one. Card, QR and delivery channels settle later, minus their fee."
        onAdd={() =>
          setChannel({
            id: "",
            name: "",
            kind: "EWALLET",
            moneyAccountId: null,
            moneyAccountName: "",
            isDeferred: false,
            feeRate: "0",
            feeFixed: "0.00",
            withholdingRate: "0",
            settlementDelayDays: 0,
            settlesToMoneyAccountId: null,
            isActive: true,
            sortOrder: props.channels.length,
            locationIds: props.locations.map((l) => l.id),
          })
        }
      >
        <SimpleTable
          head={["Channel", "Type", "Money lands in", "Fee", "Settles", "Locations", "Status", ""]}
          rows={props.channels.map((c) => [
            <b key="n">{c.name}</b>,
            CHANNEL_KINDS[c.kind],
            c.moneyAccountName,
            c.isDeferred ? `${c.feeRate}%${c.withholdingRate !== "0" ? ` + ${c.withholdingRate}% WHT` : ""}` : "—",
            c.isDeferred ? `T+${c.settlementDelayDays}` : "Immediately",
            c.locationIds.length,
            c.isActive ? <Badge key="s">Active</Badge> : <Badge key="s" variant="outline">Off</Badge>,
            <EditButton key="e" onClick={() => setChannel(c)} label={c.name} />,
          ])}
        />
      </Section>

      <Section
        title="Money accounts"
        hint="Every place money sits. Each has its own ledger account, so the system always knows its book balance."
        onAdd={() => setMoney({ id: "", name: "", kind: "EWALLET", locationId: null, locationName: "", isPersonal: false, institution: "", accountRef: "", isActive: true, glCode: "" })}
      >
        <SimpleTable
          head={["Account", "Kind", "Location", "Ledger code", "Flags", ""]}
          rows={props.moneyAccounts.map((m) => [
            <b key="n">{m.name}</b>,
            MONEY_KINDS[m.kind],
            m.locationName,
            <span key="c" className="font-mono text-xs">{m.glCode}</span>,
            <span key="f" className="flex gap-1">
              {m.isPersonal && <Badge variant="outline">Personal</Badge>}
              {!m.isActive && <Badge variant="outline">Inactive</Badge>}
            </span>,
            <EditButton key="e" onClick={() => setMoney(m)} label={m.name} />,
          ])}
        />
      </Section>

      <Section
        title="Discount types"
        hint="SC and PWD require the customer's name and ID number (BIR). Non-VAT business: no VAT exemption portion."
        onAdd={() => setDiscount({ id: "", code: "", name: "", rate: "", requiresIdentity: false, contraAccountId: props.contraAccounts[0]?.id ?? "", contraAccountName: "", isActive: true })}
      >
        <SimpleTable
          head={["Code", "Name", "Default rate", "Needs name + ID", "Account", ""]}
          rows={props.discountTypes.map((d) => [
            <span key="c" className="font-mono">{d.code}</span>,
            d.name,
            d.rate ? `${d.rate}%` : "Amount",
            d.requiresIdentity ? "Yes" : "No",
            d.contraAccountName,
            <EditButton key="e" onClick={() => setDiscount(d)} label={d.name} />,
          ])}
        />
      </Section>

      <section>
        <h2 className="text-2xl">Branch sales settings</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Loyverse store name: exactly as it appears in the &quot;Store&quot; column of Loyverse exports.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {props.branchSettings.map((b) => (
            <BranchSettingsCard key={b.locationId} settings={b} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl">Loyverse mappings</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Loyverse item and payment-type names matched to menu items and channels. New names are mapped on the import screen.
        </p>
        <SimpleTable
          head={["Type", "Loyverse name", "Maps to", "Pax override", "Store", ""]}
          rows={props.mappings.map((m) => [
            m.kind === "ITEM" ? "Item" : "Payment type",
            m.externalName,
            m.target,
            m.paxOverride || "—",
            m.scope,
            <Button key="d" variant="ghost" size="sm" aria-label={`Remove mapping ${m.externalName}`} onClick={() => delMapping.run(m.id)}>
              <Trash2 className="size-4" />
            </Button>,
          ])}
          empty="No mappings yet. Items and payment types with the same name as in this system match automatically."
        />
      </section>

      {channel && <ChannelDialog value={channel} moneyAccounts={props.moneyAccounts} locations={props.locations} onClose={() => setChannel(null)} />}
      {money && <MoneyDialog value={money} locations={props.locations} onClose={() => setMoney(null)} />}
      {discount && <DiscountDialog value={discount} contraAccounts={props.contraAccounts} onClose={() => setDiscount(null)} />}
    </div>
  );
}

function Section({ title, hint, onAdd, children }: { title: string; hint: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {children}
    </section>
  );
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={`Edit ${label}`}>
      <Pencil className="size-4" />
    </Button>
  );
}

function useSaved(onClose: () => void) {
  const router = useRouter();
  return () => {
    onClose();
    router.refresh();
  };
}

function ChannelDialog({ value, moneyAccounts, locations, onClose }: { value: Channel; moneyAccounts: MoneyAccount[]; locations: Option[]; onClose: () => void }) {
  const [c, setC] = useState(value);
  const save = useAction(saveChannelAction, { onSuccess: useSaved(onClose) });
  const destinations = moneyAccounts.filter((m) => !["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH", "OWNER_PERSONAL"].includes(m.kind));
  const banks = moneyAccounts.filter((m) => ["BANK", "EWALLET"].includes(m.kind));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c.id ? `Edit ${value.name}` : "Add payment channel"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...c, id: c.id || undefined });
          }}
        >
          <Field id="cname" label="Name" error={save.fieldError("name")}>
            <Input id="cname" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required />
          </Field>
          <Field id="ckind" label="Type">
            <select id="ckind" className={selectClass} value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}>
              {Object.entries(CHANNEL_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {c.kind !== "CASH" && (
            <Field id="cma" label="Money lands in">
              <select id="cma" className={selectClass} value={c.moneyAccountId ?? ""} onChange={(e) => setC({ ...c, moneyAccountId: e.target.value || null })}>
                <option value="">Choose…</option>
                {destinations.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={c.isDeferred} onCheckedChange={(v) => setC({ ...c, isDeferred: v })} /> Settles later minus a fee (card, QR, delivery app)
          </label>
          {c.isDeferred && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="cfee" label="Fee / commission %" error={save.fieldError("feeRate")}>
                <Input id="cfee" inputMode="decimal" value={c.feeRate} onChange={(e) => setC({ ...c, feeRate: e.target.value })} />
              </Field>
              <Field id="cfix" label="Fixed fee per day (₱)" error={save.fieldError("feeFixed")}>
                <Input id="cfix" inputMode="decimal" value={c.feeFixed} onChange={(e) => setC({ ...c, feeFixed: e.target.value })} />
              </Field>
              <Field id="cwht" label="Withholding %" error={save.fieldError("withholdingRate")}>
                <Input id="cwht" inputMode="decimal" value={c.withholdingRate} onChange={(e) => setC({ ...c, withholdingRate: e.target.value })} />
              </Field>
              <Field id="cdel" label="Settles after (days)">
                <Input id="cdel" type="number" min={0} value={c.settlementDelayDays} onChange={(e) => setC({ ...c, settlementDelayDays: Number(e.target.value) })} />
              </Field>
              <Field id="cto" label="Paid into" className="col-span-2">
                <select id="cto" className={selectClass} value={c.settlesToMoneyAccountId ?? ""} onChange={(e) => setC({ ...c, settlesToMoneyAccountId: e.target.value || null })}>
                  <option value="">Choose…</option>
                  {banks.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Accepted at</legend>
            <div className="grid grid-cols-2 gap-2">
              {locations.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={c.locationIds.includes(l.id)}
                    onCheckedChange={(v) => setC({ ...c, locationIds: v ? [...c.locationIds, l.id] : c.locationIds.filter((x) => x !== l.id) })}
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={c.isActive} onCheckedChange={(v) => setC({ ...c, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoneyDialog({ value, locations, onClose }: { value: MoneyAccount; locations: Option[]; onClose: () => void }) {
  const [m, setM] = useState(value);
  const save = useAction(saveMoneyAccountAction, { onSuccess: useSaved(onClose) });
  const editing = !!m.id;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${value.name}` : "Add money account"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...m, id: m.id || undefined });
          }}
        >
          <Field id="mname" label="Name" error={save.fieldError("name")}>
            <Input id="mname" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} required />
          </Field>
          <Field id="mkind" label="Kind" hint={editing ? "Kind and location can't change after creation." : undefined}>
            <select id="mkind" className={selectClass} value={m.kind} disabled={editing} onChange={(e) => setM({ ...m, kind: e.target.value })}>
              {Object.entries(MONEY_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field id="mloc" label="Belongs to">
            <select id="mloc" className={selectClass} value={m.locationId ?? ""} disabled={editing} onChange={(e) => setM({ ...m, locationId: e.target.value || null })}>
              <option value="">Shared (all locations)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="minst" label="Institution">
              <Input id="minst" value={m.institution} onChange={(e) => setM({ ...m, institution: e.target.value })} placeholder="BPI, GCash…" />
            </Field>
            <Field id="mref" label="Account / mobile no. (last digits)">
              <Input id="mref" value={m.accountRef} onChange={(e) => setM({ ...m, accountRef: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={m.isPersonal} onCheckedChange={(v) => setM({ ...m, isPersonal: v })} /> In a personal name (e.g. personal GCash)
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={m.isActive} onCheckedChange={(v) => setM({ ...m, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({ value, contraAccounts, onClose }: { value: DiscountType; contraAccounts: Option[]; onClose: () => void }) {
  const [d, setD] = useState(value);
  const save = useAction(saveDiscountTypeAction, { onSuccess: useSaved(onClose) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.id ? `Edit ${value.name}` : "Add discount type"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...d, id: d.id || undefined });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="dcode" label="Code" error={save.fieldError("code")}>
              <Input id="dcode" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} required />
            </Field>
            <Field id="drate" label="Default rate % (blank = amount)" error={save.fieldError("rate")}>
              <Input id="drate" inputMode="decimal" value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} />
            </Field>
          </div>
          <Field id="dname" label="Name">
            <Input id="dname" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
          </Field>
          <Field id="dacc" label="Account">
            <select id="dacc" className={selectClass} value={d.contraAccountId} onChange={(e) => setD({ ...d, contraAccountId: e.target.value })}>
              {contraAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={d.requiresIdentity} onCheckedChange={(v) => setD({ ...d, requiresIdentity: v })} /> Requires customer name and ID number
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={d.isActive} onCheckedChange={(v) => setD({ ...d, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BranchSettingsCard({ settings }: { settings: BranchSettings }) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(settings.storeName);
  const save = useAction(saveSettingAction, { onSuccess: () => router.refresh() });
  const set = (key: string, value: unknown) => save.run({ key, locationId: settings.locationId, value });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-display text-xl tracking-wide">{settings.name}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set("loyverse.storeName", storeName);
        }}
      >
        <Field id={`store-${settings.locationId}`} label="Loyverse store name" className="flex-1">
          <Input id={`store-${settings.locationId}`} value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" disabled={save.pending}>
          Save
        </Button>
      </form>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={settings.requirePaymentsMatch} onCheckedChange={(v) => set("sales.requirePaymentsMatch", v)} />
        Block submit when payments ≠ net sales (otherwise the cashier must explain)
      </label>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={settings.serviceChargeToStaff} onCheckedChange={(v) => set("sales.serviceChargeToStaff", v)} />
        Service charge is distributed to staff
      </label>
      <label className="flex items-center gap-3 text-sm">
        Shifts per day
        <select
          className={`${selectClass} w-20`}
          value={settings.shiftsPerDay}
          onChange={(e) => set("sales.shiftsPerDay", Number(e.target.value))}
          aria-label="Shifts per day"
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

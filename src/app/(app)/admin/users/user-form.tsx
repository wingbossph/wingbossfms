"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { createUserAction, updateUserAction } from "@/domains/admin/actions";

type Option = { id: string; name: string };
type PermissionOption = { key: string; module: string; description: string };
type RoleRow = { roleId: string; locationId: string | null };
type OverrideRow = { permissionKey: string; locationId: string | null; effect: "ALLOW" | "DENY" };

export type UserFormValues = {
  id?: string;
  name: string;
  email: string;
  isActive: boolean;
  isOwner: boolean;
  hasPassword: boolean;
  hasPin: boolean;
  roles: RoleRow[];
  overrides: OverrideRow[];
};

const ALL = "__all__";

export function UserForm({
  initial,
  roles,
  locations,
  permissions,
}: {
  initial?: UserFormValues;
  roles: Option[];
  locations: Option[];
  permissions: PermissionOption[];
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [v, setV] = useState<UserFormValues>(
    initial ?? {
      name: "",
      email: "",
      isActive: true,
      isOwner: false,
      hasPassword: false,
      hasPin: false,
      roles: [{ roleId: "", locationId: locations[0]?.id ?? null }],
      overrides: [],
    },
  );
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  const create = useAction(createUserAction, { onSuccess: () => router.push("/admin/users") });
  const update = useAction(updateUserAction, {
    onSuccess: () => {
      setPassword("");
      setPin("");
      router.refresh();
    },
  });
  const { pending, fieldError } = editing ? update : create;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: v.name,
      email: v.email,
      password,
      pin,
      isActive: v.isActive,
      roles: v.roles.filter((r) => r.roleId),
      overrides: v.overrides.filter((o) => o.permissionKey),
    };
    if (editing) update.run({ ...payload, id: v.id });
    else create.run(payload);
  }

  const setRole = (i: number, patch: Partial<RoleRow>) =>
    setV((p) => ({ ...p, roles: p.roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const setOverride = (i: number, patch: Partial<OverrideRow>) =>
    setV((p) => ({ ...p, overrides: p.overrides.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Full name" error={fieldError("name")}>
          <Input id="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </Field>
        <Field id="email" label="Email (for email login)" error={fieldError("email")} hint="Leave blank for PIN-only staff">
          <Input id="email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="off" />
        </Field>
        <Field
          id="password"
          label={v.hasPassword ? "New password" : "Password"}
          error={fieldError("password")}
          hint={v.hasPassword ? "Leave blank to keep the current password" : "At least 10 characters"}
        >
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field
          id="pin"
          label={v.hasPin ? "New PIN" : "PIN"}
          error={fieldError("pin")}
          hint={v.hasPin ? "Leave blank to keep the current PIN" : "4–6 digits, for branch devices"}
        >
          <Input id="pin" inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
        </Field>
        {editing && !v.isOwner && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch id="isActive" checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />
            <label htmlFor="isActive" className="text-sm">
              Active. Deactivating ends the user&apos;s sessions immediately.
            </label>
          </div>
        )}
      </section>

      {v.isOwner ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          This is the Owner account. It always has every permission at every location.
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-xl">Roles</h2>
            <p className="mb-3 text-sm text-muted-foreground">A role applies at one location, or at all locations.</p>
            <div className="space-y-2">
              {v.roles.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select aria-label="Role" className={selectClass} value={r.roleId} onChange={(e) => setRole(i, { roleId: e.target.value })}>
                    <option value="">Choose role…</option>
                    {roles.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Location"
                    className={selectClass}
                    value={r.locationId ?? ALL}
                    onChange={(e) => setRole(i, { locationId: e.target.value === ALL ? null : e.target.value })}
                  >
                    <option value={ALL}>All locations</option>
                    {locations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove role" onClick={() => setV({ ...v, roles: v.roles.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => setV({ ...v, roles: [...v.roles, { roleId: "", locationId: locations[0]?.id ?? null }] })}>
                <Plus className="size-4" /> Add role
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-xl">Permission overrides</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Grant or remove single permissions for this person only, e.g. let one admin approve expenses at Matina but not view payroll.
              A location-specific override wins over an all-locations one.
            </p>
            <div className="space-y-2">
              {v.overrides.map((o, i) => (
                <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <select aria-label="Effect" className={`${selectClass} sm:w-28`} value={o.effect} onChange={(e) => setOverride(i, { effect: e.target.value as "ALLOW" | "DENY" })}>
                    <option value="ALLOW">Allow</option>
                    <option value="DENY">Deny</option>
                  </select>
                  <select aria-label="Permission" className={selectClass} value={o.permissionKey} onChange={(e) => setOverride(i, { permissionKey: e.target.value })}>
                    <option value="">Choose permission…</option>
                    {modules.map((m) => (
                      <optgroup key={m} label={m}>
                        {permissions
                          .filter((p) => p.module === m)
                          .map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.description}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    aria-label="Location"
                    className={selectClass}
                    value={o.locationId ?? ALL}
                    onChange={(e) => setOverride(i, { locationId: e.target.value === ALL ? null : e.target.value })}
                  >
                    <option value={ALL}>All locations</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove override" onClick={() => setV({ ...v, overrides: v.overrides.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setV({ ...v, overrides: [...v.overrides, { permissionKey: "", locationId: null, effect: "ALLOW" }] })}
              >
                <Plus className="size-4" /> Add override
              </Button>
            </div>
          </section>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-11 px-6">
          {pending ? "Saving…" : editing ? "Save changes" : "Add user"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/users")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

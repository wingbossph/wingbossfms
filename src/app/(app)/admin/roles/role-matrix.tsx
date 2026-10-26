"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/field";
import { createRoleAction, saveRolePermissionsAction } from "@/domains/admin/actions";

type Role = { id: string; key: string; name: string; users: number; permissionKeys: string[] };
type Permission = { key: string; module: string; description: string; ownerOnly: boolean };

export function RoleMatrix({ roles, permissions }: { roles: Role[]; permissions: Permission[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissionKeys)])), [roles]);
  const [grants, setGrants] = useState<Record<string, Set<string>>>(initial);
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");

  const modules = [...new Set(permissions.map((p) => p.module))];
  const changedRoleIds = roles
    .filter((r) => r.key !== "owner")
    .filter((r) => {
      const a = [...initial[r.id]].sort().join();
      const b = [...grants[r.id]].sort().join();
      return a !== b;
    })
    .map((r) => r.id);

  function toggle(roleId: string, key: string) {
    setGrants((g) => {
      const next = new Set(g[roleId]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...g, [roleId]: next };
    });
  }

  function save() {
    startTransition(async () => {
      for (const roleId of changedRoleIds) {
        const result = await saveRolePermissionsAction({ roleId, permissionKeys: [...grants[roleId]] });
        if (!result?.ok) {
          toast.error(result?.message ?? "Could not save.");
          return;
        }
      }
      toast.success("Permissions saved.");
      router.refresh();
    });
  }

  function addRole(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createRoleAction({ name: newName, copyFromRoleId: copyFrom || undefined });
      if (result?.ok) {
        toast.success(result.message);
        setNewName("");
        router.refresh();
      } else toast.error(result?.message ?? "Could not create role.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wider">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="min-w-28 p-3 text-center text-xs font-semibold uppercase tracking-wider">
                  {r.name}
                  <span className="block font-normal normal-case tracking-normal text-muted-foreground">
                    {r.users} assigned
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <ModuleRows key={m} module={m}>
                {permissions
                  .filter((p) => p.module === m)
                  .map((p) => (
                    <tr key={p.key} className="border-t">
                      <th scope="row" className="p-3 text-left font-normal">
                        <span className="flex items-center gap-2">
                          {p.description}
                          {p.ownerOnly && <Lock className="size-3 text-muted-foreground" aria-label="Owner only" />}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                      </th>
                      {roles.map((r) => {
                        const isOwnerRole = r.key === "owner";
                        const locked = isOwnerRole || p.ownerOnly;
                        return (
                          <td key={r.id} className="p-3 text-center">
                            <Checkbox
                              aria-label={`${r.name}: ${p.description}`}
                              checked={isOwnerRole || (!p.ownerOnly && grants[r.id].has(p.key))}
                              disabled={locked}
                              onCheckedChange={() => toggle(r.id, p.key)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </ModuleRows>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Button onClick={save} disabled={pending || changedRoleIds.length === 0} className="h-11 px-6">
          {pending ? "Saving…" : `Save changes${changedRoleIds.length ? ` (${changedRoleIds.length} role${changedRoleIds.length > 1 ? "s" : ""})` : ""}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          <Lock className="inline size-3" /> Owner-only permissions can&apos;t be given to other roles.
        </p>
      </div>

      <form onSubmit={addRole} className="flex max-w-2xl flex-wrap items-end gap-2 rounded-lg border p-4">
        <div className="flex-1 space-y-1">
          <label htmlFor="newRole" className="text-sm font-medium">
            New role
          </label>
          <Input id="newRole" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Supervisor" required minLength={2} />
        </div>
        <div className="flex-1 space-y-1">
          <label htmlFor="copyFrom" className="text-sm font-medium">
            Start from
          </label>
          <select id="copyFrom" className={selectClass} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">No permissions</option>
            {roles
              .filter((r) => r.key !== "owner")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  Copy of {r.name}
                </option>
              ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus className="size-4" /> Create role
        </Button>
      </form>
    </div>
  );
}

function ModuleRows({ module, children }: { module: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t bg-muted/40">
        <th colSpan={99} scope="colgroup" className="px-3 py-2 text-left font-display text-base tracking-wider">
          {module}
        </th>
      </tr>
      {children}
    </>
  );
}

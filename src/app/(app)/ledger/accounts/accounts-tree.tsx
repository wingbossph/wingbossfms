"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveAccountAction } from "@/domains/ledger/actions";

type Account = { id: string; code: string; name: string; parentId: string | null; isPostable: boolean; isActive: boolean; isSystem: boolean; description: string; balance: string };
type Group = { id: string; name: string; section: string; accounts: Account[] };
type Editing = { id?: string; groupId: string; parentId?: string; name: string; isActive: boolean; description: string; title: string };

export function AccountsTree({ groups, canManage }: { groups: Group[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  let lastSection = "";
  return (
    <div className="max-w-4xl">
      {groups.map((g) => {
        const showSection = g.section !== lastSection;
        lastSection = g.section;
        return (
          <section key={g.id}>
            {showSection && <h2 className="mb-2 mt-8 text-2xl first:mt-0">{g.section}</h2>}
            <div className="mb-3 rounded-lg border">
              <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                <span className="font-semibold">{g.name}</span>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ groupId: g.id, name: "", isActive: true, description: "", title: `New account in ${g.name}` })}>
                    <Plus className="size-4" /> Account
                  </Button>
                )}
              </div>
              <ul>
                {g.accounts.map((a) => (
                  <li key={a.id} className={`flex items-center gap-3 border-t px-3 py-1.5 text-sm ${a.parentId ? "pl-8" : ""} ${a.isActive ? "" : "text-muted-foreground line-through"}`}>
                    <span className="w-20 font-mono text-xs">{a.code}</span>
                    {a.isPostable ? (
                      <Link href={`/ledger/accounts/${a.id}`} className="flex-1 underline-offset-4 hover:underline">
                        {a.name}
                      </Link>
                    ) : (
                      <span className="flex-1 font-semibold">{a.name}</span>
                    )}
                    {a.isSystem && <Badge variant="outline">system</Badge>}
                    <span className="w-32 text-right tabular-nums">{a.balance}</span>
                    {canManage && (
                      <span className="flex w-20 justify-end">
                        {!a.isPostable && (
                          <Button variant="ghost" size="icon" aria-label={`Add sub-account under ${a.name}`} onClick={() => setEditing({ groupId: g.id, parentId: a.id, name: "", isActive: true, description: "", title: `New sub-account of ${a.name}` })}>
                            <Plus className="size-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label={`Edit ${a.name}`} onClick={() => setEditing({ id: a.id, groupId: g.id, name: a.name, isActive: a.isActive, description: a.description, title: `Edit ${a.code}` })}>
                          <Pencil className="size-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
      {editing && <AccountDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountDialog({ value, onClose }: { value: Editing; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const save = useAction(saveAccountAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v.title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ id: v.id, groupId: v.groupId, parentId: v.parentId ?? "", name: v.name, isActive: v.isActive, description: v.description });
          }}
        >
          <Field id="aname" label="Name" error={save.fieldError("name")}>
            <Input id="aname" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
          </Field>
          <Field id="adesc" label="Description">
            <Input id="adesc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          {v.id && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} /> Active
            </label>
          )}
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

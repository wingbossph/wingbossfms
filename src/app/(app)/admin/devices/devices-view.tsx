"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table/data-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { registerThisDeviceAction, revokeDeviceAction } from "@/domains/admin/actions";

type DeviceRow = {
  id: string;
  name: string;
  location: string;
  idle: number;
  lastSeen: string;
  registered: string;
  revoked: string | null;
};

export function DevicesView({
  devices,
  locations,
  thisDeviceId,
  canRegister,
}: {
  devices: DeviceRow[];
  locations: { id: string; name: string }[];
  thisDeviceId: string | null;
  canRegister: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [idle, setIdle] = useState(15);
  const register = useAction(registerThisDeviceAction, { onSuccess: () => router.refresh() });
  const revoke = useAction(revokeDeviceAction, { onSuccess: () => router.refresh() });

  const columns: ColumnDef<DeviceRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Device",
      cell: ({ row }) => (
        <span className="font-semibold">
          {row.original.name} {row.original.id === thisDeviceId && <Badge variant="outline">This device</Badge>}
        </span>
      ),
    },
    { accessorKey: "location", header: "Location" },
    { accessorKey: "idle", header: "Idle logout (min)", meta: { align: "right" } },
    { accessorKey: "lastSeen", header: "Last PIN login" },
    { accessorKey: "registered", header: "Registered" },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => (r.revoked ? `Revoked ${r.revoked}` : "Active"),
      cell: ({ row }) => (row.original.revoked ? <Badge variant="outline">Revoked</Badge> : <Badge>Active</Badge>),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        !row.original.revoked && (
          <Button
            variant="ghost"
            size="sm"
            disabled={revoke.pending}
            onClick={() => {
              if (confirm(`Revoke ${row.original.name}? Staff on it are logged out.`)) revoke.run(row.original.id);
            }}
          >
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <section className="max-w-2xl rounded-lg border p-5">
        <h2 className="text-xl">Register this device</h2>
        {canRegister ? (
          <form
            className="mt-3 grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              register.run({ name, locationId, idleTimeoutMinutes: idle });
            }}
          >
            <Field id="dname" label="Name" error={register.fieldError("name")}>
              <Input id="dname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lanang counter tablet" required />
            </Field>
            <Field id="dloc" label="Location" error={register.fieldError("locationId")}>
              <select id="dloc" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="didle" label="Idle logout (minutes)" error={register.fieldError("idleTimeoutMinutes")}>
              <Input id="didle" type="number" min={1} max={240} value={idle} onChange={(e) => setIdle(Number(e.target.value))} />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={register.pending}>
                {thisDeviceId ? "Re-register this device" : "Register this device"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Do this on the tablet itself while logged in with email. Then log out: the tablet will show the PIN pad.
              </p>
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Log in with email (not PIN) to register a device.</p>
        )}
      </section>

      <DataTable columns={columns} data={devices} exportFileName="devices" emptyMessage="No devices registered yet." />
    </div>
  );
}

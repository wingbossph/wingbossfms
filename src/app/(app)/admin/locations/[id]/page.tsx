import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatPeso } from "@/lib/money";
import { LocationForm } from "../location-form";

export const metadata = { title: "Edit location" };

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("locations:manage");
  const { id } = await params;
  const location = await db.location.findUnique({
    where: { id },
    include: {
      channelLocations: true,
      moneyAccounts: { include: { glAccount: true }, orderBy: { name: "asc" } },
      roleAssignments: { include: { user: true, role: true } },
    },
  });
  if (!location) notFound();

  const channels = await db.paymentChannel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader title={location.name} description={`${location.code} · ${location.type.toLowerCase()}`} />
      <LocationForm
        channels={channels}
        users={[]}
        roles={[]}
        initial={{
          id: location.id,
          name: location.name,
          code: location.code,
          type: location.type,
          address: location.address ?? "",
          openedOn: location.openedOn?.toISOString().slice(0, 10) ?? "",
          drawerFloat: formatPeso(location.drawerFloatCents, { symbol: false }),
          sortOrder: location.sortOrder,
          isActive: location.isActive,
          channelIds: location.channelLocations.map((c) => c.channelId),
        }}
      />

      <div className="mt-10 grid max-w-3xl gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-xl">Money accounts</h2>
          <ul className="mt-2 divide-y rounded-md border">
            {location.moneyAccounts.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{m.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.glAccount.code}</span>
              </li>
            ))}
            {location.moneyAccounts.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">None</li>}
          </ul>
        </section>
        <section>
          <h2 className="text-xl">Staff</h2>
          <ul className="mt-2 divide-y rounded-md border">
            {location.roleAssignments.map((ra) => (
              <li key={ra.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/admin/users/${ra.userId}`} className="underline-offset-4 hover:underline">
                  {ra.user.name}
                </Link>
                <Badge variant="outline">{ra.role.name}</Badge>
              </li>
            ))}
            {location.roleAssignments.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No staff assigned</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

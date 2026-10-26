import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { currentDevice } from "@/server/auth/device";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/dates";
import { DevicesView } from "./devices-view";

export const metadata = { title: "Devices" };

export default async function DevicesPage() {
  const user = await requirePagePermission("devices:manage");
  const locationIds = user.access.locationsWith("devices:manage");
  const [devices, locations, thisDevice] = await Promise.all([
    db.device.findMany({
      where: { locationId: { in: locationIds } },
      include: { location: true },
      orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    }),
    db.location.findMany({ where: { id: { in: locationIds } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    currentDevice(),
  ]);

  return (
    <>
      <PageHeader
        title="Devices"
        description="Shared branch tablets and phones. Staff can only log in with a PIN on a registered device, and only for that device's location."
      />
      <DevicesView
        canRegister={user.method === "password"}
        locations={locations}
        thisDeviceId={thisDevice?.id ?? null}
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          location: d.location.name,
          idle: d.idleTimeoutMinutes,
          lastSeen: d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "Never",
          registered: formatDateTime(d.createdAt),
          revoked: d.revokedAt ? formatDateTime(d.revokedAt) : null,
        }))}
      />
    </>
  );
}

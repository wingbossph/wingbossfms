import type { Tx } from "@/server/db";
import { buildAccess } from "./rbac";

type Reader = Pick<Tx, "user" | "location">;

/** A user's effective permissions, loaded from the database. */
export async function loadAccess(db: Reader, userId: string, pinnedLocationId: string | null = null) {
  const [user, activeLocations] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleAssignments: { include: { role: { include: { permissions: true } } } }, permissions: true },
    }),
    db.location.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, type: true } }),
  ]);
  const access = buildAccess({
    userId: user.id,
    isOwner: user.isOwner,
    roles: user.roleAssignments.map((ra) => ({ locationId: ra.locationId, permissions: ra.role.permissions.map((p) => p.permissionKey) })),
    overrides: user.permissions.map((p) => ({ permissionKey: p.permissionKey, locationId: p.locationId, effect: p.effect })),
    allLocationIds: activeLocations.map((l) => l.id),
    pinnedLocationId,
  });
  return { user, access, activeLocations };
}

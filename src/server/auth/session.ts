import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { buildAccess, type Access } from "./rbac";

export class AuthorizationError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const LOCATION_COOKIE = "wb_loc";
export const ALL_LOCATIONS = "all";

export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  isOwner: boolean;
  method: "password" | "pin";
  deviceId: string | null;
  access: Access;
  roleNames: string[];
  /** Active locations the user can access, in display order. */
  locations: { id: string; code: string; name: string; type: string }[];
};

/**
 * The signed-in user with their effective permissions, or null.
 * Re-checked against the DB on every request: deactivated users,
 * changed passwords (sessionVersion) and revoked devices end the session.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      roleAssignments: { include: { role: { include: { permissions: true } } } },
      permissions: true,
    },
  });
  if (!user || !user.isActive || user.sessionVersion !== session.sv) return null;

  let pinnedLocationId: string | null = null;
  if (session.method === "pin") {
    const device = session.deviceId
      ? await db.device.findUnique({ where: { id: session.deviceId } })
      : null;
    if (!device || device.revokedAt || device.locationId !== session.locationId) return null;
    pinnedLocationId = device.locationId;
  }

  const activeLocations = await db.location.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  const access = buildAccess({
    userId: user.id,
    isOwner: user.isOwner,
    roles: user.roleAssignments.map((ra) => ({
      locationId: ra.locationId,
      permissions: ra.role.permissions.map((p) => p.permissionKey),
    })),
    overrides: user.permissions.map((p) => ({
      permissionKey: p.permissionKey,
      locationId: p.locationId,
      effect: p.effect,
    })),
    allLocationIds: activeLocations.map((l) => l.id),
    pinnedLocationId,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isOwner: access.isOwner,
    method: session.method,
    deviceId: session.deviceId,
    access,
    roleNames: user.isOwner
      ? ["Owner"]
      : [...new Set(user.roleAssignments.map((ra) => ra.role.name))],
    locations: activeLocations.filter((l) => access.locationIds.includes(l.id)),
  };
});

/** For pages: the current user, or a redirect to the login screen. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions: the current user, or an AuthorizationError. */
export async function requireActor(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Your session has ended. Please log in again.");
  return user;
}

/** Throws unless the user may do `permission` at `locationId`. */
export function assertCan(user: CurrentUser, permission: string, locationId: string) {
  if (!user.access.can(permission, locationId)) throw new AuthorizationError();
}

/** Throws unless the user may do `permission` somewhere (for global screens). */
export function assertCanAnywhere(user: CurrentUser, permission: string) {
  if (!user.access.canAnywhere(permission)) throw new AuthorizationError();
}

/** Owner-only actions (users, roles, locations, settings, voids, period close). */
export function assertOwner(user: CurrentUser) {
  if (!user.isOwner) throw new AuthorizationError("Only the Owner can do that.");
}

/** Page guard: shows the 403 page unless the user has any of the permissions somewhere. */
export async function requirePagePermission(...anyOf: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!anyOf.some((p) => user.access.canAnywhere(p))) redirect("/forbidden");
  return user;
}

/**
 * The location the user is working in (top-bar switcher), validated against
 * their access. "all" is only offered to users with more than one location.
 */
export async function getActiveLocationId(user: CurrentUser): Promise<string> {
  const wanted = (await cookies()).get(LOCATION_COOKIE)?.value;
  const ids = user.locations.map((l) => l.id);
  if (wanted === ALL_LOCATIONS && ids.length > 1) return ALL_LOCATIONS;
  if (wanted && ids.includes(wanted)) return wanted;
  return ids[0] ?? ALL_LOCATIONS;
}

/** Location ids where the user has any of the permissions. */
export function locationsWithAny(user: CurrentUser, ...permissions: string[]): string[] {
  const set = new Set(permissions.flatMap((p) => user.access.locationsWith(p)));
  return user.locations.map((l) => l.id).filter((id) => set.has(id));
}

/** Like scopeLocations, for screens that several permissions open. */
export function scopeLocationsAny(user: CurrentUser, permissions: string[], requested: string | null | undefined): string[] {
  const allowed = locationsWithAny(user, ...permissions);
  if (!requested || requested === ALL_LOCATIONS) return allowed;
  return allowed.includes(requested) ? [requested] : [];
}

/**
 * Resolves a location filter from the UI into the ids the user may see for
 * `permission`. Never trusts the client: unknown ids are dropped.
 */
export function scopeLocations(
  user: CurrentUser,
  permission: string,
  requested: string | null | undefined,
): string[] {
  const allowed = user.access.locationsWith(permission);
  if (!requested || requested === ALL_LOCATIONS) return allowed;
  return allowed.includes(requested) ? [requested] : [];
}

// Pure permission evaluation. No database or framework code here, so it can be
// unit-tested directly. `loadAccess` (access.ts) builds the input from the DB.

import { OWNER_ONLY } from "./permissions";

export type RoleGrant = {
  /** null = the role applies at every location */
  locationId: string | null;
  permissions: readonly string[];
};

export type PermissionOverride = {
  permissionKey: string;
  locationId: string | null;
  effect: "ALLOW" | "DENY";
};

export type AccessInput = {
  userId: string;
  isOwner: boolean;
  roles: readonly RoleGrant[];
  overrides: readonly PermissionOverride[];
  /** Every active location, used to expand "all locations" grants. */
  allLocationIds: readonly string[];
  /** Set for PIN sessions on a branch device: access is limited to this location. */
  pinnedLocationId?: string | null;
};

export type Access = {
  userId: string;
  isOwner: boolean;
  /** Can the user do `permission` at `locationId`? */
  can(permission: string, locationId: string): boolean;
  /** Can the user do `permission` at any location? */
  canAnywhere(permission: string): boolean;
  /** Location ids where the user may do `permission`. */
  locationsWith(permission: string): string[];
  /** Every location the user has any access to. */
  locationIds: string[];
};

/**
 * Precedence, most specific first:
 *   1. owner-only permissions: Owner only, never grantable
 *   2. a user override at this exact location
 *   3. a user override for all locations
 *   4. any role assigned at this location or at all locations
 */
export function evaluate(input: AccessInput, permission: string, locationId: string): boolean {
  if (input.pinnedLocationId && input.pinnedLocationId !== locationId) return false;
  if (!input.allLocationIds.includes(locationId)) return false;
  if (input.isOwner) return true;
  if (OWNER_ONLY.has(permission)) return false;

  const specific = input.overrides.find(
    (o) => o.permissionKey === permission && o.locationId === locationId,
  );
  if (specific) return specific.effect === "ALLOW";

  const global = input.overrides.find(
    (o) => o.permissionKey === permission && o.locationId === null,
  );
  if (global) return global.effect === "ALLOW";

  return input.roles.some(
    (r) =>
      (r.locationId === null || r.locationId === locationId) &&
      r.permissions.includes(permission),
  );
}

export function buildAccess(input: AccessInput): Access {
  const scopeIds = input.pinnedLocationId
    ? input.allLocationIds.filter((id) => id === input.pinnedLocationId)
    : input.allLocationIds;

  const locationsWith = (permission: string) =>
    scopeIds.filter((id) => evaluate(input, permission, id));

  const locationIds = input.isOwner
    ? [...scopeIds]
    : scopeIds.filter(
        (id) =>
          input.roles.some((r) => r.locationId === null || r.locationId === id) ||
          input.overrides.some(
            (o) => o.effect === "ALLOW" && (o.locationId === null || o.locationId === id),
          ),
      );

  return {
    userId: input.userId,
    isOwner: input.isOwner && !input.pinnedLocationId,
    can: (permission, locationId) => evaluate(input, permission, locationId),
    canAnywhere: (permission) => locationsWith(permission).length > 0,
    locationsWith,
    locationIds,
  };
}

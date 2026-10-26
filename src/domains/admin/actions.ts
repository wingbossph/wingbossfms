"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { writeAudit, diffFields } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, AuthorizationError, requireActor } from "@/server/auth/session";
import { hashDeviceToken, newDeviceToken, setDeviceCookie, clearDeviceCookie, currentDevice } from "@/server/auth/device";
import { isPermissionKey, OWNER_ONLY } from "@/server/auth/permissions";
import { toDbDate } from "@/lib/dates";
import { createLocation } from "./locations";
import {
  editLocationSchema,
  editUserSchema,
  newLocationSchema,
  newRoleSchema,
  newUserSchema,
  registerDeviceSchema,
  roleMatrixSchema,
} from "./schemas";

// ── Locations ────────────────────────────────────────────────────────────────

export async function createLocationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "locations:manage");
    const input = newLocationSchema.parse(raw);
    const location = await db.$transaction((tx) => createLocation(tx, input, actor.id));
    revalidatePath("/", "layout");
    return { ok: true, message: `${location.name} added.` };
  });
}

export async function updateLocationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "locations:manage");
    const input = editLocationSchema.parse(raw);

    await db.$transaction(async (tx) => {
      const before = await tx.location.findUniqueOrThrow({
        where: { id: input.id },
        include: { channelLocations: true },
      });
      const data = {
        name: input.name,
        code: input.code,
        type: input.type,
        address: input.address || null,
        openedOn: input.openedOn ? toDbDate(input.openedOn) : null,
        drawerFloatCents: input.drawerFloat,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      };
      await tx.location.update({ where: { id: input.id }, data });

      const beforeChannels = before.channelLocations.map((c) => c.channelId).sort();
      await tx.paymentChannelLocation.deleteMany({ where: { locationId: input.id } });
      if (input.channelIds.length) {
        await tx.paymentChannelLocation.createMany({
          data: input.channelIds.map((channelId) => ({ channelId, locationId: input.id })),
        });
      }

      const diff = diffFields(before, data);
      const afterChannels = [...input.channelIds].sort();
      const channelsChanged = JSON.stringify(beforeChannels) !== JSON.stringify(afterChannels);
      if (diff.changed || channelsChanged) {
        await writeAudit(tx, {
          actorId: actor.id,
          action: "UPDATE",
          entityType: "Location",
          entityId: input.id,
          locationId: input.id,
          before: channelsChanged ? { ...diff.before, channelIds: beforeChannels } : diff.before,
          after: channelsChanged ? { ...diff.after, channelIds: afterChannels } : diff.after,
        });
      }
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Location saved." };
  });
}

// ── Users ────────────────────────────────────────────────────────────────────

async function validateAccessRows(
  roles: { roleId: string; locationId: string | null }[],
  overrides: { permissionKey: string; locationId: string | null }[],
) {
  const locationIds = [...roles, ...overrides].map((r) => r.locationId).filter((x): x is string => !!x);
  const roleIds = roles.map((r) => r.roleId);
  const [locCount, roleRows] = await Promise.all([
    db.location.count({ where: { id: { in: [...new Set(locationIds)] } } }),
    db.role.findMany({ where: { id: { in: roleIds } } }),
  ]);
  if (locCount !== new Set(locationIds).size) throw new UserFacingError("Unknown location.");
  if (roleRows.length !== new Set(roleIds).size) throw new UserFacingError("Unknown role.");
  if (roleRows.some((r) => r.key === "owner")) {
    throw new UserFacingError("The Owner role can't be assigned. There is one Owner account.");
  }
  for (const o of overrides) {
    if (!isPermissionKey(o.permissionKey)) throw new UserFacingError(`Unknown permission ${o.permissionKey}.`);
    if (OWNER_ONLY.has(o.permissionKey)) throw new UserFacingError(`${o.permissionKey} is Owner-only.`);
  }
}

function dedupe<T>(rows: T[], key: (r: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

export async function createUserAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "users:manage");
    const input = newUserSchema.parse(raw);
    if (input.email && !input.password) {
      throw new UserFacingError("Set a password for email login, or leave the email blank for PIN-only staff.");
    }
    const roles = dedupe(input.roles, (r) => `${r.roleId}:${r.locationId}`);
    const overrides = dedupe(input.overrides, (o) => `${o.permissionKey}:${o.locationId}`);
    await validateAccessRows(roles, overrides);

    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email ?? null,
          passwordHash: input.password ? await bcrypt.hash(input.password, 12) : null,
          pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null,
          isActive: input.isActive,
          roleAssignments: { create: roles },
          permissions: { create: overrides },
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "CREATE",
        entityType: "User",
        entityId: user.id,
        after: { name: user.name, email: user.email, hasPin: !!input.pin, roles, overrides },
      });
    });
    revalidatePath("/admin/users");
    return { ok: true, message: `${input.name} added.` };
  });
}

export async function updateUserAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "users:manage");
    const input = editUserSchema.parse(raw);
    const roles = dedupe(input.roles, (r) => `${r.roleId}:${r.locationId}`);
    const overrides = dedupe(input.overrides, (o) => `${o.permissionKey}:${o.locationId}`);

    const existing = await db.user.findUniqueOrThrow({
      where: { id: input.id },
      include: { roleAssignments: true, permissions: true },
    });
    if (existing.isOwner) {
      // The Owner keeps all access; only name, email, password and PIN can change.
      if (!input.isActive) throw new UserFacingError("The Owner account can't be deactivated.");
    } else {
      await validateAccessRows(roles, overrides);
    }
    if (input.email && !input.password && !existing.passwordHash) {
      throw new UserFacingError("Set a password to enable email login.");
    }

    await db.$transaction(async (tx) => {
      const data = {
        name: input.name,
        email: input.email ?? null,
        isActive: input.isActive,
      };
      const credentialsChanged = !!input.password || !!input.pin || existing.isActive !== input.isActive;
      await tx.user.update({
        where: { id: input.id },
        data: {
          ...data,
          ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
          ...(input.pin ? { pinHash: await bcrypt.hash(input.pin, 10) } : {}),
          // Ends existing sessions after a password/PIN change or deactivation.
          ...(credentialsChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
      });

      const accessBefore = {
        roles: existing.roleAssignments.map((r) => ({ roleId: r.roleId, locationId: r.locationId })),
        overrides: existing.permissions.map((p) => ({
          permissionKey: p.permissionKey,
          locationId: p.locationId,
          effect: p.effect,
        })),
      };
      if (!existing.isOwner) {
        await tx.roleAssignment.deleteMany({ where: { userId: input.id } });
        await tx.userPermission.deleteMany({ where: { userId: input.id } });
        if (roles.length) await tx.roleAssignment.createMany({ data: roles.map((r) => ({ ...r, userId: input.id })) });
        if (overrides.length) await tx.userPermission.createMany({ data: overrides.map((o) => ({ ...o, userId: input.id })) });
      }

      const diff = diffFields(existing, data);
      const accessAfter = existing.isOwner ? accessBefore : { roles, overrides };
      const accessChanged = JSON.stringify(accessBefore) !== JSON.stringify(accessAfter);
      if (diff.changed || accessChanged || input.password || input.pin) {
        await writeAudit(tx, {
          actorId: actor.id,
          action: "UPDATE",
          entityType: "User",
          entityId: input.id,
          before: { ...diff.before, ...(accessChanged ? accessBefore : {}) },
          after: {
            ...diff.after,
            ...(accessChanged ? accessAfter : {}),
            ...(input.password ? { password: "changed" } : {}),
            ...(input.pin ? { pin: "changed" } : {}),
          },
        });
      }
    });
    revalidatePath("/admin/users");
    return { ok: true, message: "User saved." };
  });
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function saveRolePermissionsAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "roles:manage");
    const input = roleMatrixSchema.parse(raw);
    const role = await db.role.findUniqueOrThrow({ where: { id: input.roleId }, include: { permissions: true } });
    if (role.key === "owner") throw new UserFacingError("The Owner role always has every permission.");

    const keys = [...new Set(input.permissionKeys)];
    for (const k of keys) {
      if (!isPermissionKey(k)) throw new UserFacingError(`Unknown permission ${k}.`);
      if (OWNER_ONLY.has(k)) throw new UserFacingError(`${k} is Owner-only.`);
    }
    const before = role.permissions.map((p) => p.permissionKey).sort();
    const after = keys.sort();

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({ data: keys.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "Role",
        entityId: role.id,
        before: { name: role.name, removed: before.filter((k) => !after.includes(k)) },
        after: { name: role.name, added: after.filter((k) => !before.includes(k)) },
      });
    });
    revalidatePath("/admin/roles");
    return { ok: true, message: `${role.name} permissions saved.` };
  });
}

export async function createRoleAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    assertCanAnywhere(actor, "roles:manage");
    const input = newRoleSchema.parse(raw);
    const source = input.copyFromRoleId
      ? await db.role.findUnique({ where: { id: input.copyFromRoleId }, include: { permissions: true } })
      : null;
    const permissionKeys = (source?.permissions.map((p) => p.permissionKey) ?? []).filter((k) => !OWNER_ONLY.has(k));
    const key = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    await db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          key,
          name: input.name,
          description: input.description || null,
          permissions: { create: permissionKeys.map((permissionKey) => ({ permissionKey })) },
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "CREATE",
        entityType: "Role",
        entityId: role.id,
        after: { name: role.name, permissions: permissionKeys },
      });
    });
    revalidatePath("/admin/roles");
    return { ok: true, message: `${input.name} role created.` };
  });
}

// ── Devices ──────────────────────────────────────────────────────────────────

/** Registers the browser this is called from as a shared device at a location. */
export async function registerThisDeviceAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    if (actor.method === "pin") throw new AuthorizationError("Log in with email to register a device.");
    const input = registerDeviceSchema.parse(raw);
    assertCan(actor, "devices:manage", input.locationId);

    const existing = await currentDevice();
    const token = newDeviceToken();
    await db.$transaction(async (tx) => {
      if (existing) {
        await tx.device.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
      }
      const device = await tx.device.create({
        data: {
          name: input.name,
          locationId: input.locationId,
          idleTimeoutMinutes: input.idleTimeoutMinutes,
          tokenHash: hashDeviceToken(token),
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "CREATE",
        entityType: "Device",
        entityId: device.id,
        locationId: input.locationId,
        after: { name: device.name, idleTimeoutMinutes: device.idleTimeoutMinutes, replaced: existing?.id ?? null },
      });
    });
    await setDeviceCookie(token);
    revalidatePath("/admin/devices");
    return { ok: true, message: "This device is registered. Staff can now log in with their PIN." };
  });
}

export async function revokeDeviceAction(deviceId: string): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    const device = await db.device.findUniqueOrThrow({ where: { id: deviceId } });
    assertCan(actor, "devices:manage", device.locationId);
    if (device.revokedAt) return { ok: true };

    await db.$transaction(async (tx) => {
      await tx.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "VOID",
        entityType: "Device",
        entityId: deviceId,
        locationId: device.locationId,
        before: { name: device.name, revokedAt: null },
        after: { revokedAt: new Date() },
      });
    });
    const current = await currentDevice();
    if (!current) await clearDeviceCookie();
    revalidatePath("/admin/devices");
    return { ok: true, message: `${device.name} revoked. PIN sessions on it end immediately.` };
  });
}

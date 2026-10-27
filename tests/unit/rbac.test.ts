import { describe, expect, it } from "vitest";
import { buildAccess, type AccessInput } from "@/server/auth/rbac";

const LOCS = ["matina", "lanang", "commissary", "office"];

function access(partial: Partial<AccessInput>) {
  return buildAccess({
    userId: "u1",
    isOwner: false,
    roles: [],
    overrides: [],
    allLocationIds: LOCS,
    ...partial,
  });
}

describe("rbac", () => {
  it("owner can do everything everywhere, including owner-only permissions", () => {
    const a = access({ isOwner: true });
    expect(a.can("records:void", "lanang")).toBe(true);
    expect(a.locationIds).toEqual(LOCS);
  });

  it("cashier role is scoped to its branch", () => {
    const a = access({ roles: [{ locationId: "lanang", permissions: ["sales:create"] }] });
    expect(a.can("sales:create", "lanang")).toBe(true);
    expect(a.can("sales:create", "matina")).toBe(false);
    expect(a.can("reports:pnl:view", "lanang")).toBe(false);
    expect(a.locationIds).toEqual(["lanang"]);
  });

  it("a role assigned to all locations applies everywhere", () => {
    const a = access({ roles: [{ locationId: null, permissions: ["sales:view"] }] });
    expect(a.locationsWith("sales:view")).toEqual(LOCS);
  });

  it("owner-only permissions can't be granted by role or override", () => {
    const a = access({
      roles: [{ locationId: null, permissions: ["records:void"] }],
      overrides: [{ permissionKey: "users:manage", locationId: null, effect: "ALLOW" }],
    });
    expect(a.can("records:void", "matina")).toBe(false);
    expect(a.can("users:manage", "matina")).toBe(false);
  });

  it("a location-specific DENY beats a role grant", () => {
    const a = access({
      roles: [{ locationId: null, permissions: ["expenses:approve"] }],
      overrides: [{ permissionKey: "expenses:approve", locationId: "lanang", effect: "DENY" }],
    });
    expect(a.can("expenses:approve", "matina")).toBe(true);
    expect(a.can("expenses:approve", "lanang")).toBe(false);
  });

  it("a location-specific ALLOW beats a global DENY", () => {
    const a = access({
      roles: [{ locationId: null, permissions: ["payroll:run"] }],
      overrides: [
        { permissionKey: "payroll:run", locationId: null, effect: "DENY" },
        { permissionKey: "payroll:run", locationId: "matina", effect: "ALLOW" },
      ],
    });
    expect(a.locationsWith("payroll:run")).toEqual(["matina"]);
  });

  it("an ALLOW override grants a permission the role lacks and adds the location to scope", () => {
    const a = access({
      roles: [{ locationId: "matina", permissions: ["sales:view"] }],
      overrides: [{ permissionKey: "inventory:count", locationId: "lanang", effect: "ALLOW" }],
    });
    expect(a.can("inventory:count", "lanang")).toBe(true);
    expect(a.locationIds).toEqual(["matina", "lanang"]);
  });

  it("a PIN session is pinned to the device's location, even for the owner", () => {
    const a = access({ isOwner: true, pinnedLocationId: "lanang" });
    expect(a.can("sales:create", "lanang")).toBe(true);
    expect(a.can("sales:create", "matina")).toBe(false);
    expect(a.isOwner).toBe(false);
    expect(a.locationIds).toEqual(["lanang"]);
  });

  it("unknown or inactive locations are always denied", () => {
    const a = access({ isOwner: true });
    expect(a.can("sales:view", "closed-branch")).toBe(false);
  });
});

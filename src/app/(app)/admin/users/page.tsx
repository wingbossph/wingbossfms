import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { requirePagePermission, scopeLocations } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/dates";
import { UsersTable, type UserRow } from "./users-table";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; category?: string; status?: string }>;
}) {
  const user = await requirePagePermission("users:view");
  const { location, category, status } = await searchParams;
  const locationIds = scopeLocations(user, "users:view", location);

  const [users, roles, locations] = await Promise.all([
    db.user.findMany({
      where: {
        AND: [
          status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {},
          // Non-owners only see staff assigned to their locations.
          user.isOwner && !location ? {} : { roleAssignments: { some: { locationId: { in: locationIds } } } },
          category ? { roleAssignments: { some: { roleId: category } } } : {},
        ],
      },
      include: { roleAssignments: { include: { role: true, location: true } } },
      orderBy: { name: "asc" },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ where: { id: { in: user.access.locationsWith("users:view") } }, orderBy: { sortOrder: "asc" } }),
  ]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email ?? "",
    login: [u.passwordHash ? "Email" : null, u.pinHash ? "PIN" : null].filter(Boolean).join(" + ") || "None",
    access: u.isOwner
      ? "Owner · all locations"
      : u.roleAssignments.map((ra) => `${ra.role.name} @ ${ra.location?.code ?? "All"}`).join(", ") || "No access",
    lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never",
    isActive: u.isActive,
  }));

  const canManage = user.access.canAnywhere("users:manage");

  return (
    <>
      <PageHeader
        title="Users"
        description="Each person has their own login or PIN, so every entry is tied to someone."
        actions={
          canManage && (
            <Button asChild>
              <Link href="/admin/users/new">
                <Plus className="size-4" /> Add user
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        locations={locations.map((l) => ({ value: l.id, label: l.name }))}
        categoryLabel="Role"
        categories={roles.map((r) => ({ value: r.id, label: r.name }))}
        extra={[
          {
            param: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
        ]}
      />
      <UsersTable data={rows} canEdit={canManage} />
    </>
  );
}

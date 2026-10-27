import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { PERMISSIONS, OWNER_ONLY } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { UserForm } from "../user-form";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("users:manage");
  const { id } = await params;
  const [user, roles, locations] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { roleAssignments: true, permissions: true } }),
    db.role.findMany({ where: { key: { not: "owner" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!user) notFound();

  return (
    <>
      <PageHeader
        title={user.name}
        actions={
          <Link href={`/admin/audit?entityId=${user.id}`} className="text-sm underline underline-offset-4">
            View change history
          </Link>
        }
      />
      <UserForm
        roles={roles}
        locations={locations}
        permissions={PERMISSIONS.filter((p) => !OWNER_ONLY.has(p.key))}
        initial={{
          id: user.id,
          name: user.name,
          email: user.email ?? "",
          isActive: user.isActive,
          isOwner: user.isOwner,
          hasPassword: !!user.passwordHash,
          hasPin: !!user.pinHash,
          roles: user.roleAssignments.map((r) => ({ roleId: r.roleId, locationId: r.locationId })),
          overrides: user.permissions.map((p) => ({ permissionKey: p.permissionKey, locationId: p.locationId, effect: p.effect })),
        }}
      />
    </>
  );
}

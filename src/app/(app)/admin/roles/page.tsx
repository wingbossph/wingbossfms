import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { OWNER_ONLY, PERMISSIONS } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { RoleMatrix } from "./role-matrix";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requirePagePermission("roles:manage");
  const roles = await db.role.findMany({
    include: { permissions: true, _count: { select: { assignments: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Tick what each role can do. Roles are assigned per location on the Users page, where you can also override single permissions for one person."
      />
      <RoleMatrix
        roles={roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          users: r._count.assignments,
          permissionKeys: r.permissions.map((p) => p.permissionKey),
        }))}
        permissions={PERMISSIONS.map((p) => ({ ...p, ownerOnly: OWNER_ONLY.has(p.key) }))}
      />
    </>
  );
}

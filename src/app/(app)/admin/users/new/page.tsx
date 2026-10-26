import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { PERMISSIONS, OWNER_ONLY } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { UserForm } from "../user-form";

export const metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePagePermission("users:manage");
  const [roles, locations] = await Promise.all([
    db.role.findMany({ where: { key: { not: "owner" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Add user" />
      <UserForm roles={roles} locations={locations} permissions={PERMISSIONS.filter((p) => !OWNER_ONLY.has(p.key))} />
    </>
  );
}

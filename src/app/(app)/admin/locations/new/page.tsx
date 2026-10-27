import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { LocationForm } from "../location-form";

export const metadata = { title: "Add location" };

export default async function NewLocationPage() {
  await requirePagePermission("locations:manage");
  const [channels, users, roles] = await Promise.all([
    db.paymentChannel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { isActive: true, isOwner: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.role.findMany({ where: { key: { not: "owner" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Add location" description="One form: details, money accounts, payment channels and staff." />
      <LocationForm channels={channels} users={users} roles={roles} />
    </>
  );
}

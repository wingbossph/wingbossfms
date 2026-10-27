import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate } from "@/lib/dates";
import { LocationsTable, type LocationRow } from "./locations-table";

export const metadata = { title: "Locations" };

const TYPE_LABEL = { BRANCH: "Branch", COMMISSARY: "Commissary", OFFICE: "Head office" } as const;

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const user = await requirePagePermission("locations:view");
  const { category, status } = await searchParams;
  const visible = user.access.locationsWith("locations:view");

  const locations = await db.location.findMany({
    where: {
      // Owners also see inactive locations; others only the ones they can access.
      ...(user.isOwner ? {} : { id: { in: visible } }),
      ...(category && category in TYPE_LABEL ? { type: category as keyof typeof TYPE_LABEL } : {}),
      ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { moneyAccounts: true, roleAssignments: true, channelLocations: true } },
    },
  });

  const rows: LocationRow[] = locations.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    type: TYPE_LABEL[l.type],
    address: l.address ?? "",
    openedOn: l.openedOn ? formatBusinessDate(l.openedOn) : "",
    moneyAccounts: l._count.moneyAccounts,
    staff: l._count.roleAssignments,
    channels: l._count.channelLocations,
    isActive: l.isActive,
  }));

  return (
    <>
      <PageHeader
        title="Locations"
        description="Branches, the commissary and head office. Every record belongs to exactly one location."
        actions={
          user.access.canAnywhere("locations:manage") && (
            <Button asChild>
              <Link href="/admin/locations/new">
                <Plus className="size-4" /> Add location
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        categoryLabel="Type"
        categories={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
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
      <LocationsTable data={rows} canEdit={user.access.canAnywhere("locations:manage")} />
    </>
  );
}

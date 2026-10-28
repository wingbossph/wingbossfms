import { PageHeader } from "@/components/shell/page-header";
import { getActiveLocationId, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { SheetImport } from "./sheet-import";

export const metadata = { title: "Import inventory sheet" };

export default async function InventoryImportPage() {
  const user = await requirePagePermission("inventory:items:manage");
  const locations = await db.location.findMany({ where: { isActive: true, id: { in: user.locations.map((l) => l.id) } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const active = await getActiveLocationId(user);
  return (
    <>
      <PageHeader
        title="Import inventory sheet"
        description="Load a month from the branch's inventory workbook (START / IN / OUT / TRANSFER / END per day). Deliveries, transfers and end-of-day counts are posted day by day; usage is worked out from the counts."
      />
      <SheetImport locations={locations} defaultLocationId={active && locations.some((l) => l.id === active) ? active : (locations[0]?.id ?? "")} />
    </>
  );
}

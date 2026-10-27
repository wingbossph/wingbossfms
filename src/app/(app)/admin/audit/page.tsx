import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/dates";
import { AUDIT_ACTIONS, describeChange, queryAudit, type AuditFilters } from "@/domains/admin/audit-query";
import { AuditTable, type AuditRow } from "./audit-table";

export const metadata = { title: "Audit log" };

const PAGE_LIMIT = 500;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const user = await requirePagePermission("audit:view");
  const filters = await searchParams;

  const [entries, entityTypes, users, locations] = await Promise.all([
    queryAudit(user, filters, PAGE_LIMIT),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.location.findMany({
      where: { id: { in: user.access.locationsWith("audit:view") } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: AuditRow[] = entries.map((e) => ({
    id: e.id,
    at: formatDateTime(e.at),
    user: e.user?.name ?? "System",
    location: e.location?.code ?? "–",
    action: e.action,
    entity: e.entityType,
    entityId: e.entityId,
    change: describeChange(e.before, e.after),
    reason: e.reason ?? "",
  }));

  const exportParams = new URLSearchParams(
    Object.entries(filters).filter((kv): kv is [string, string] => typeof kv[1] === "string" && kv[1] !== ""),
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every create, update, approval, void and login: who, when, where, and the before/after values."
      />
      <ListFilters
        dateRange
        locations={locations.map((l) => ({ value: l.id, label: l.name }))}
        categoryLabel="Record type"
        categories={entityTypes.map((t) => ({ value: t.entityType, label: t.entityType }))}
        extra={[
          { param: "action", label: "Action", options: AUDIT_ACTIONS.map((a) => ({ value: a, label: a })) },
          { param: "user", label: "User", options: users.map((u) => ({ value: u.id, label: u.name })) },
        ]}
      />
      {rows.length === PAGE_LIMIT && (
        <p className="mb-2 text-sm text-muted-foreground">
          Showing the latest {PAGE_LIMIT}. Narrow the filters, or Export for every matching entry.
        </p>
      )}
      <AuditTable data={rows} exportHref={`/api/export/audit?${exportParams.toString()}`} />
    </>
  );
}

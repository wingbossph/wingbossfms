import { PageHeader } from "@/components/shell/page-header";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { attachmentsFor } from "@/server/attachments";
import { cutoffOf, datesBetween } from "@/domains/payroll/compute";
import { formatDtrCell } from "@/domains/payroll/dtr";
import { scheduleOf } from "@/domains/payroll/service";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { DtrGrid } from "./dtr-grid";

export const metadata = { title: "DTR" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ location?: string; start?: string }> }) {
  const user = await requirePagePermission("payroll:attendance", "payroll:run");
  const sp = await searchParams;
  const allowed = locationsWithAny(user, "payroll:attendance", "payroll:run");
  const locations = user.locations.filter((l) => allowed.includes(l.id));
  const location = locations.find((l) => l.id === sp.location) ?? locations[0];
  const cut = cutoffOf(sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : manilaDateString());
  const from = toDbDate(cut.start);
  const to = toDbDate(cut.end);
  const dates = datesBetween(cut.start, cut.end);

  const sheet = await db.attendanceSheet.findUnique({ where: { locationId_periodStart: { locationId: location.id, periodStart: from } } });
  const assigned = await db.employee.findMany({
    where: {
      OR: [
        { assignments: { some: { locationId: location.id, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] } }, status: { in: ["ACTIVE", "ON_LEAVE"] } },
        ...(sheet ? [{ attendance: { some: { sheetId: sheet.id } } }] : []),
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const others = await db.employee.findMany({ where: { status: "ACTIVE", id: { notIn: assigned.map((e) => e.id) } }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } });
  const entries = await db.attendanceEntry.findMany({ where: { employeeId: { in: [...assigned, ...others].map((e) => e.id) }, date: { gte: from, lte: to } }, include: { location: true, sheet: { include: { location: true } } } });
  const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: to }, OR: [{ locationId: null }, { locationId: location.id }] } });
  const files = sheet ? await attachmentsFor(db, "AttendanceSheet", sheet.id) : [];
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const row = (e: { id: string; firstName: string; lastName: string }) => ({
    employeeId: e.id,
    name: `${e.lastName}, ${e.firstName}`,
    cells: Object.fromEntries(entries.filter((x) => x.employeeId === e.id && x.sheetId === sheet?.id).map((x) => [ymd(x.date), formatDtrCell({ ...x, locationCode: x.location.code }, location.code)])),
    elsewhere: Object.fromEntries(entries.filter((x) => x.employeeId === e.id && x.sheetId !== sheet?.id).map((x) => [ymd(x.date), x.sheet.location.code])),
  });
  return (
    <>
      <PageHeader title="Daily time records" description="Type each day from the signed paper DTR. P present · A absent · R rest day · L paid leave · LU unpaid · H holiday off · RW worked on rest day. Add LT15 (late min), UT30, OT2 (hours), ND3, or @LAN if they worked at another branch. Or type times like 10:05-19:30." />
      <DtrGrid
        key={`${location.id}-${cut.start}`}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        locationId={location.id}
        start={cut.start}
        end={cut.end}
        dates={dates}
        holidays={Object.fromEntries(holidays.map((h) => [ymd(h.date), { name: h.name, type: h.type }]))}
        rows={assigned.map(row)}
        others={others.map((o) => ({ ...row(o), name: `${o.lastName}, ${o.firstName}` }))}
        status={sheet?.status ?? "DRAFT"}
        sheetId={sheet?.id ?? null}
        canEdit={user.access.can("payroll:attendance", location.id)}
        canApprove={user.access.can("payroll:run", location.id)}
        schedule={await scheduleOf(db, location.id)}
        files={files.map((f) => ({ id: f.id, name: f.fileName }))}
      />
    </>
  );
}

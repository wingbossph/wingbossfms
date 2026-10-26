import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { KINDS } from "@/domains/migration/kinds";
import { formatDateTime } from "@/lib/dates";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import data" };

export default async function ImportPage() {
  await requirePagePermission("settings:manage");
  const jobs = await db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const files = await db.attachment.findMany({ where: { id: { in: jobs.map((j) => j.attachmentId) } }, select: { id: true, fileName: true } });
  const people = await db.user.findMany({ where: { id: { in: jobs.map((j) => j.createdById) } }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Import data" description="Bring in the old Google Sheets: download the sheet as CSV or Excel, match its columns, check it (nothing is saved), then import." />
      <ImportWizard kinds={KINDS.map((k) => ({ kind: k.kind, title: k.title, description: k.description, fields: k.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required, help: f.help ?? "" })) }))} />
      <h2 className="mt-10 mb-2 text-2xl">Past imports</h2>
      <SimpleTable
        head={["When", "What", "File", "Rows", "Result", "By"]}
        rows={jobs.map((j) => [formatDateTime(j.createdAt), KINDS.find((k) => k.kind === j.kind)?.title ?? j.kind, <a key="f" href={`/api/files/${j.attachmentId}`} className="underline underline-offset-4">{files.find((f) => f.id === j.attachmentId)?.fileName ?? "file"}</a>, j.rowCount, j.status === "COMMITTED" ? "Imported" : `Failed (${j.errorCount} problems)`, people.find((p) => p.id === j.createdById)?.name ?? ""])}
        empty="Nothing imported yet."
      />
    </>
  );
}

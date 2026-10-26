import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { statementAccountsFor } from "@/domains/banking/queries";
import { ensureStatementFormats } from "@/domains/banking/service";
import type { StatementConfig } from "@/domains/banking/formats";
import { StatementImport } from "./statement-import";

export const metadata = { title: "Import statement" };

export default async function ImportStatementPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const user = await requirePagePermission("banking:reconcile");
  const { account } = await searchParams;
  await db.$transaction((tx) => ensureStatementFormats(tx));
  const [accounts, formats] = await Promise.all([statementAccountsFor(user, "banking:reconcile"), db.statementFormat.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] })]);
  return (
    <>
      <PageHeader title="Import statement" description="Upload the CSV or Excel file from online banking, GCash, Maya or Grab. Lines already imported are skipped." />
      <StatementImport
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, formatId: a.defaultStatementFormatId }))}
        defaultAccountId={accounts.find((a) => a.id === account)?.id ?? accounts[0]?.id ?? ""}
        formats={formats.map((f) => ({ id: f.id, name: f.name, config: f.config as StatementConfig }))}
      />
    </>
  );
}

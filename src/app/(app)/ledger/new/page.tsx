import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { JournalEditor } from "./journal-editor";

export const metadata = { title: "New journal entry" };

export default async function NewEntryPage() {
  const user = await requirePagePermission("ledger:journal:create");
  const accounts = await db.account.findMany({ where: { isPostable: true, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  return (
    <>
      <PageHeader title="New journal entry" description="For accruals, corrections and reclassifications. Day-to-day transactions post automatically from their screens." />
      <JournalEditor
        today={manilaDateString()}
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        locations={user.locations.filter((l) => user.access.can("ledger:journal:create", l.id)).map((l) => ({ id: l.id, name: l.name }))}
      />
    </>
  );
}

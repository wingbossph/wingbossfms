import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { requirePagePermission, scopeLocations } from "@/server/auth/session";
import { db } from "@/server/db";
import { SOURCE_LABEL } from "@/domains/reports/ledger-reports";
import { formatBusinessDate, manilaDateString, toDbDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import type { JournalSource } from "@/generated/prisma/enums";
import { JournalTable } from "./journal-table";

export const metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; location?: string; category?: string }> }) {
  const user = await requirePagePermission("ledger:view");
  const f = await searchParams;
  const locationIds = scopeLocations(user, "ledger:view", f.location);
  const to = f.to ?? manilaDateString();
  const from = f.from ?? `${to.slice(0, 7)}-01`;
  const entries = await db.journalEntry.findMany({
    where: {
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      lines: { some: { locationId: { in: locationIds } } },
      ...(f.category && f.category in SOURCE_LABEL ? { source: f.category as JournalSource } : {}),
    },
    include: { lines: { include: { location: { select: { code: true } } } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 1000,
  });

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every posting, created automatically by sales, expenses, transfers and payroll. Accountants can add manual entries."
        actions={
          user.access.canAnywhere("ledger:journal:create") && (
            <Button asChild>
              <Link href="/ledger/new">
                <Plus className="size-4" /> Journal entry
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        dateRange
        locations={user.locations.filter((l) => user.access.can("ledger:view", l.id)).map((l) => ({ value: l.id, label: l.name }))}
        categoryLabel="Source"
        categories={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
      />
      <JournalTable
        data={entries.map((e) => ({
          id: e.id,
          number: e.number,
          date: formatBusinessDate(e.date),
          ymd: e.date.toISOString().slice(0, 10),
          source: SOURCE_LABEL[e.source],
          memo: e.memo,
          locations: [...new Set(e.lines.map((l) => l.location.code))].join(", "),
          amount: formatPeso(e.lines.reduce((a, l) => a + l.debitCents, 0n)),
          amountCents: Number(e.lines.reduce((a, l) => a + l.debitCents, 0n)),
          status: e.status === "VOIDED" ? "Voided" : e.reversesId ? "Reversal" : "Posted",
        }))}
      />
    </>
  );
}

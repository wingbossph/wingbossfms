import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { OpeningForm } from "./opening-form";

export const metadata = { title: "Opening balances" };

export default async function OpeningPage() {
  const user = await requirePagePermission("ledger:journal:create");
  const [accounts, moneyAccounts] = await Promise.all([
    db.account.findMany({
      where: { isPostable: true, isActive: true, group: { section: { in: ["CURRENT_ASSET", "NONCURRENT_ASSET", "CURRENT_LIABILITY", "NONCURRENT_LIABILITY", "EQUITY"] } }, NOT: { systemKey: "OPENING_BALANCE_EQUITY" } },
      orderBy: { code: "asc" },
      include: { moneyAccount: true },
    }),
    db.moneyAccount.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const locations = user.locations.filter((l) => user.access.can("ledger:journal:create", l.id)).map((l) => ({ id: l.id, name: l.name }));
  return (
    <>
      <PageHeader
        title="Opening balances"
        description="On go-live, enter what each money account holds and any other balances (bills owed, deposits, loans). The difference goes to Opening balance equity. Inventory opening stock is entered from Inventory."
      />
      <OpeningForm
        today={manilaDateString()}
        locations={locations}
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}`, kind: a.type }))}
        suggestions={moneyAccounts.map((m) => ({ accountId: m.glAccountId, locationId: m.locationId ?? locations[0]?.id ?? "" }))}
      />
    </>
  );
}

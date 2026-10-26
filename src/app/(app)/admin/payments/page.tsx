import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/domains/admin/settings";
import { formatPeso } from "@/lib/money";
import { PaymentsEditor } from "./payments-editor";

export const metadata = { title: "Payments & settings" };

export default async function PaymentsPage() {
  await requirePagePermission("settings:manage");
  const [channels, moneyAccounts, discountTypes, contraAccounts, locations, mappings, products] = await Promise.all([
    db.paymentChannel.findMany({ include: { locations: true, moneyAccount: true }, orderBy: { sortOrder: "asc" } }),
    db.moneyAccount.findMany({ include: { location: true, glAccount: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.discountType.findMany({ include: { contraAccount: true }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { group: { section: "CONTRA_REVENUE" }, isPostable: true }, orderBy: { code: "asc" } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.loyverseMapping.findMany({ include: { product: true, channel: true, location: true }, orderBy: [{ kind: "asc" }, { externalName: "asc" }] }),
    db.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const branchSettings = await Promise.all(
    locations
      .filter((l) => l.type === "BRANCH")
      .map(async (l) => ({
        locationId: l.id,
        name: l.name,
        storeName: await getSetting(db, "loyverse.storeName", l.id),
        requirePaymentsMatch: await getSetting(db, "sales.requirePaymentsMatch", l.id),
        serviceChargeToStaff: await getSetting(db, "sales.serviceChargeToStaff", l.id),
        shiftsPerDay: await getSetting(db, "sales.shiftsPerDay", l.id),
      })),
  );

  return (
    <>
      <PageHeader title="Payments & settings" description="Where money goes, card/QR/Grab fees, discounts, and Loyverse matching." />
      <PaymentsEditor
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          moneyAccountId: c.moneyAccountId,
          moneyAccountName: c.moneyAccount?.name ?? (c.kind === "CASH" ? "Branch cash drawer" : "—"),
          isDeferred: c.isDeferred,
          feeRate: (c.feeRateBp / 100).toString(),
          feeFixed: formatPeso(c.feeFixedCents, { symbol: false }),
          withholdingRate: (c.withholdingRateBp / 100).toString(),
          settlementDelayDays: c.settlementDelayDays,
          settlesToMoneyAccountId: c.settlesToMoneyAccountId,
          isActive: c.isActive,
          sortOrder: c.sortOrder,
          locationIds: c.locations.map((l) => l.locationId),
        }))}
        moneyAccounts={moneyAccounts.map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind,
          locationId: m.locationId,
          locationName: m.location?.name ?? "Shared",
          isPersonal: m.isPersonal,
          institution: m.institution ?? "",
          accountRef: m.accountRef ?? "",
          isActive: m.isActive,
          glCode: m.glAccount.code,
        }))}
        discountTypes={discountTypes.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          rate: d.defaultRateBp === null ? "" : (d.defaultRateBp / 100).toString(),
          requiresIdentity: d.requiresIdentity,
          contraAccountId: d.contraAccountId,
          contraAccountName: `${d.contraAccount.code} ${d.contraAccount.name}`,
          isActive: d.isActive,
        }))}
        contraAccounts={contraAccounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        branchSettings={branchSettings}
        mappings={mappings.map((m) => ({
          id: m.id,
          kind: m.kind,
          externalName: m.externalName,
          target: m.product?.name ?? m.channel?.name ?? "—",
          scope: m.location?.name ?? "All stores",
          paxOverride: m.paxOverride?.toString() ?? "",
        }))}
        products={products}
      />
    </>
  );
}

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { locationsWithAny, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { DispatchForm } from "./dispatch-form";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const user = await requireUser();
  const fromIds = locationsWithAny(user, "transfers:create");
  if (fromIds.length === 0) {
    const can = (perm: string) => user.access.canAnywhere(perm);
    redirect(can("transfers:receive") || can("inventory:view") ? "/commissary/transfers" : can("production:create") ? "/commissary/production" : can("reports:inventory:view") ? "/commissary/statement" : "/forbidden");
  }
  const [locations, settings, balances, presets] = await Promise.all([
    db.location.findMany({ where: { isActive: true, type: { in: ["BRANCH", "COMMISSARY"] } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
    db.itemLocationSetting.findMany({ where: { locationId: { in: fromIds }, isStocked: true, item: { isActive: true } }, include: { item: true } }),
    db.stockBalance.findMany({ where: { locationId: { in: fromIds } } }),
    db.transferPreset.findMany({ where: { fromLocationId: { in: fromIds } }, include: { lines: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const onHand = new Map(balances.map((b) => [`${b.itemId}|${b.locationId}`, Number(b.qty)]));
  const from = locations.filter((l) => fromIds.includes(l.id));
  return (
    <>
      <PageHeader title="Dispatch" description="Send sauces and supplies to a branch. Tap a pick list, adjust, dispatch: the branch confirms on arrival." />
      <DispatchForm
        today={manilaDateString()}
        fromLocations={from.map((l) => ({ id: l.id, name: l.name }))}
        defaultFromId={(from.find((l) => l.type === "COMMISSARY") ?? from[0]).id}
        toLocations={locations.map((l) => ({ id: l.id, name: l.name }))}
        items={settings
          .sort((a, b) => Number(b.item.isProduced) - Number(a.item.isProduced) || a.item.name.localeCompare(b.item.name))
          .map((s) => ({ itemId: s.itemId, locationId: s.locationId, name: s.item.name, unit: s.item.baseUnit, onHand: onHand.get(`${s.itemId}|${s.locationId}`) ?? 0 }))}
        presets={presets.map((p) => ({ id: p.id, name: p.name, fromLocationId: p.fromLocationId, toLocationId: p.toLocationId, lines: p.lines.map((l) => ({ itemId: l.itemId, qty: l.defaultQty.toString() })) }))}
      />
    </>
  );
}

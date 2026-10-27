import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatPeso } from "@/lib/money";
import { manilaDateString } from "@/lib/dates";
import { RecipesEditor } from "./recipes-editor";

export const metadata = { title: "Recipes & standards" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ suggest?: string }> }) {
  await requirePagePermission("inventory:items:manage");
  const { suggest } = await searchParams;
  const [recipes, products, items] = await Promise.all([
    db.recipe.findMany({ where: { isActive: true }, include: { lines: { include: { item: true } }, product: true, outputItem: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
    db.item.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, baseUnit: true, isProduced: true, sku: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="Recipes & standards"
        description="Per-pax standards drive theoretical usage for unlimited packages. Production recipes turn ingredients into sauces at the commissary. À la carte recipes cover items sold by the piece."
      />
      <RecipesEditor
        today={manilaDateString()}
        suggestion={suggest && /^\d+(\.\d+)?$/.test(suggest) ? suggest : null}
        products={products}
        items={items.map((i) => ({ id: i.id, name: `${i.name} (${i.baseUnit})`, isProduced: i.isProduced, isWings: i.sku === "PRO-WING" }))}
        recipes={recipes.map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          productId: r.productId ?? "",
          productName: r.product?.name ?? "",
          outputItemId: r.outputItemId ?? "",
          outputName: r.outputItem ? `${r.outputQty ? Number(r.outputQty) : ""} ${r.outputItem.baseUnit} ${r.outputItem.name}` : "",
          outputQty: r.outputQty?.toString() ?? "",
          overheadPerUnit: formatPeso(r.overheadPerUnitCents, { symbol: false }),
          effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
          lines: r.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.toString(), label: `${Number(l.qty)} ${l.item.baseUnit} ${l.item.name}` })),
        }))}
      />
    </>
  );
}

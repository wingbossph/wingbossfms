import type { Tx } from "@/server/db";
import type { ProductType } from "@/generated/prisma/client";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { parseCsv, pickHeader } from "@/lib/csv-parse";
import { parsePeso } from "@/lib/money";
import { getSetting } from "@/domains/admin/settings";

// Imports the Loyverse back-office "Export items" CSV into the menu: name,
// category, default price and per-store prices. Re-importing updates items by
// SKU, so it is safe to run again after menu changes in Loyverse.

const REVENUE_KEY: Record<ProductType, string> = {
  PACKAGE: "REV_UNLIMITED",
  ALA_CARTE: "REV_ALA_CARTE",
  ADDON: "REV_ALA_CARTE",
  BEVERAGE: "REV_BEVERAGES",
  TAKEOUT: "REV_TAKEOUT",
  OTHER: "REV_ALA_CARTE",
};

/** Best guess of the item type from its Loyverse category and name; editable afterwards. */
export function guessType(name: string, category: string): ProductType {
  const n = name.toUpperCase();
  const c = category.toUpperCase();
  if (/\b(UNLI|VIP|PROMO|EXECUTIVE|SUPREME)\b/.test(n) && !/UPGRADE/.test(n))
    return "PACKAGE";
  if (/GRAB|PANDA|TO GO/.test(c) || /\bGRAB\b/.test(n)) return "TAKEOUT";
  if (/BEVERAGE|DRINK|FRAPPE/.test(c)) return "BEVERAGE";
  if (
    /FLAVOR/.test(c) ||
    /ADD ?ONS?|EXTRA|CHARGE|CORKAGE|UPGRADE|REFILL|LEFT - OVER|MAIN SIDE/.test(
      n,
    )
  )
    return "ADDON";
  return "ALA_CARTE";
}

/** "349.00" → cents; "variable" or blank → null (price entered at the till). */
function price(raw: string | undefined): bigint | null {
  const v = (raw ?? "").trim();
  if (!v || /variable/i.test(v)) return null;
  return parsePeso(v.replace(/[^\d.,-]/g, ""));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type Row = {
  sku: string | null;
  name: string;
  category: string;
  defaultPrice: bigint | null;
  storePrices: Map<string, bigint | null>;
};

export function parseItemsExport(text: string): {
  rows: Row[];
  stores: string[];
  errors: string[];
} {
  const { headers, rows, errors } = parseCsv(text);
  const hName = pickHeader(headers, "Name", "Item name");
  const hSku = pickHeader(headers, "SKU");
  const hCat = pickHeader(headers, "Category");
  const hPrice = pickHeader(headers, "Default price", "Price");
  if (!hName || !hPrice)
    throw new UserFacingError(
      "This doesn't look like a Loyverse items export (needs Name and Default price columns).",
    );
  const storeCols = headers.flatMap((h) => {
    const m = /^Price \[(.+)\]$/i.exec(h.trim());
    return m ? [{ header: h, store: m[1] }] : [];
  });
  const out: Row[] = [];
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const name = (r[hName] ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const row: Row = {
      sku: hSku ? (r[hSku] ?? "").trim() || null : null,
      name,
      category: hCat ? (r[hCat] ?? "").trim() : "",
      defaultPrice: price(r[hPrice]),
      storePrices: new Map(storeCols.map((c) => [c.store, price(r[c.header])])),
    };
    // Same name twice (e.g. one copy without a category): keep the categorised one.
    const dup = seen.get(norm(name));
    if (dup) {
      if (!dup.category && row.category) {
        out.splice(out.indexOf(dup), 1, row);
        seen.set(norm(name), row);
      }
      continue;
    }
    seen.set(norm(name), row);
    out.push(row);
  }
  return { rows: out, stores: storeCols.map((c) => c.store), errors };
}

async function openList(tx: Tx, locationId: string | null, name: string) {
  const found = await tx.priceList.findFirst({
    where: { locationId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });
  return (
    found ??
    tx.priceList.create({
      data: {
        name,
        locationId,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    })
  );
}

export async function importLoyverseItems(
  tx: Tx,
  text: string,
  actorId: string,
) {
  const { rows, stores, errors } = parseItemsExport(text);
  if (rows.length === 0)
    throw new UserFacingError("No items found in this file.");

  // Store columns ("Price [WINGBOSS MATINA]") → branches, by the Loyverse store name setting or the branch name.
  const branches = await tx.location.findMany({
    where: { type: "BRANCH", isActive: true },
  });
  const storeLocation = new Map<string, string>();
  for (const store of stores) {
    for (const b of branches) {
      const linked = (await getSetting(tx, "loyverse.storeName", b.id)).trim();
      if (
        norm(linked || b.name) === norm(store) ||
        norm(b.name) === norm(store)
      )
        storeLocation.set(store, b.id);
    }
  }

  const revenue = new Map<string, string>();
  for (const key of new Set(Object.values(REVENUE_KEY))) {
    revenue.set(
      key,
      (
        await tx.account.findFirstOrThrow({
          where: { systemKey: key },
          select: { id: true },
        })
      ).id,
    );
  }
  const defaultList = await openList(tx, null, "Standard prices");
  const storeLists = new Map<string, string>();
  for (const [store, locationId] of storeLocation)
    storeLists.set(
      store,
      (await openList(tx, locationId, `Loyverse prices – ${store}`)).id,
    );

  const existing = await tx.product.findMany();
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const byName = new Map(existing.map((p) => [norm(p.name), p]));

  let created = 0;
  let updated = 0;
  let prices = 0;
  for (const [i, r] of rows.entries()) {
    const type = guessType(r.name, r.category);
    const match = (r.sku && bySku.get(r.sku)) || byName.get(norm(r.name));
    const data = {
      name: r.name,
      category: r.category || null,
      sku: r.sku,
      sortOrder: 100 + i,
    };
    const product = match
      ? await tx.product.update({ where: { id: match.id }, data })
      : await tx.product.create({
          data: {
            ...data,
            type,
            paxPerUnit: type === "PACKAGE" ? 1 : 0,
            revenueAccountId: revenue.get(REVENUE_KEY[type])!,
          },
        });
    if (match) updated++;
    else created++;

    const setPrice = async (priceListId: string, cents: bigint) => {
      await tx.priceListItem.upsert({
        where: {
          priceListId_productId: { priceListId, productId: product.id },
        },
        create: { priceListId, productId: product.id, priceCents: cents },
        update: { priceCents: cents },
      });
      prices++;
    };
    // "variable" prices are typed in at the till: list them at ₱0.
    await setPrice(defaultList.id, r.defaultPrice ?? 0n);
    for (const [store, listId] of storeLists) {
      const p = r.storePrices.get(store);
      if (p !== undefined) await setPrice(listId, p ?? r.defaultPrice ?? 0n);
    }
  }

  await writeAudit(tx, {
    actorId,
    action: "IMPORT",
    entityType: "Product",
    entityId: "loyverse-items",
    after: { created, updated, prices, stores: [...storeLocation.keys()] },
  });
  return {
    created,
    updated,
    prices,
    stores: [...storeLocation.keys()],
    unmatchedStores: stores.filter((s) => !storeLocation.has(s)),
    errors,
  };
}

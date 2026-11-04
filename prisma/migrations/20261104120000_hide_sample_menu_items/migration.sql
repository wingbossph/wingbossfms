-- Once the real menu has been imported from Loyverse (items carry a SKU),
-- hide the placeholder menu items from the initial setup that were never sold.
-- Hidden, not deleted: they can be switched back on in Menu & prices.
UPDATE "Product" p
SET "isActive" = false
WHERE p."sku" IS NULL
  AND p."name" IN (
    'Unlimited Wings', 'Unlimited Wings + Drinks', 'Kids Unlimited Wings', 'Promo Package',
    'Wings 6 pcs (à la carte)', 'Wings 12 pcs (à la carte)', 'Extra rice', 'Fries', 'Extra sauce cup',
    'Bottomless iced tea', 'Softdrinks in can', 'Bottled water', 'Take-out Wings 12 pcs', 'Take-out Wings 24 pcs'
  )
  AND EXISTS (SELECT 1 FROM "Product" q WHERE q."sku" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "SalesLine" l WHERE l."productId" = p."id");

-- Menu category and Loyverse SKU on menu items (Loyverse items import).
ALTER TABLE "Product" ADD COLUMN "category" TEXT;
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

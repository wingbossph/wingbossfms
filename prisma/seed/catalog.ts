// Demo catalogue: inventory items and menu products. Prices are deliberately
// ₱0.00 placeholders. The Owner enters the real packages and prices.

import type { CostClass, CountFrequency, ProductType } from "@/generated/prisma/enums";

export const ITEM_CATEGORIES: { name: string; costClass: CostClass }[] = [
  { name: "Raw protein", costClass: "COGS" },
  { name: "Sauce", costClass: "COGS" },
  { name: "Sauce ingredient", costClass: "COGS" },
  { name: "Dry goods", costClass: "COGS" },
  { name: "Vegetables", costClass: "COGS" },
  { name: "Beverage", costClass: "COGS" },
  { name: "Packaging", costClass: "COGS" },
  { name: "Fuel", costClass: "COGS" },
  { name: "Cleaning", costClass: "OPERATING_SUPPLY" },
  { name: "Dining supplies", costClass: "OPERATING_SUPPLY" },
];

export type ItemSeed = {
  sku: string;
  name: string;
  category: string;
  baseUnit: string;
  purchaseUnit?: string;
  purchaseToBase?: number;
  count: CountFrequency;
  inventoryKey: string;
  consumptionKey: string;
  isProduced?: boolean;
  /** Which kinds of location stock it. */
  stockedAt: ("BRANCH" | "COMMISSARY")[];
  storageArea: string;
};

const BOTH: ItemSeed["stockedAt"] = ["BRANCH", "COMMISSARY"];
const BRANCH: ItemSeed["stockedAt"] = ["BRANCH"];
const COMMISSARY: ItemSeed["stockedAt"] = ["COMMISSARY"];

const SAUCES = [
  "Buffalo",
  "Garlic Parmesan",
  "Honey Garlic",
  "Salted Egg",
  "Teriyaki",
  "Korean Gochujang",
  "Spicy BBQ",
  "Sweet Chili",
  "Truffle",
];

export const ITEMS: ItemSeed[] = [
  { sku: "PRO-WING", name: "Chicken wings (raw)", category: "Raw protein", baseUnit: "kg", purchaseUnit: "box", purchaseToBase: 10, count: "DAILY", inventoryKey: "INV_PROTEIN", consumptionKey: "COGS_WINGS", stockedAt: BOTH, storageArea: "Freezer" },
  ...SAUCES.map(
    (s, i): ItemSeed => ({
      sku: `SAU-${String(i + 1).padStart(2, "0")}`,
      name: `${s} sauce`,
      category: "Sauce",
      baseUnit: "L",
      count: i < 4 ? "DAILY" : "WEEKLY",
      inventoryKey: "INV_SAUCES",
      consumptionKey: "COGS_SAUCES",
      isProduced: true,
      stockedAt: BOTH,
      storageArea: "Chiller",
    }),
  ),
  { sku: "SAU-10", name: "Lemon pepper dry rub", category: "Sauce", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", isProduced: true, stockedAt: BOTH, storageArea: "Dry storage" },
  { sku: "ING-BUTTER", name: "Butter", category: "Sauce ingredient", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Chiller" },
  { sku: "ING-GARLIC", name: "Garlic", category: "Sauce ingredient", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "ING-PARM", name: "Parmesan cheese", category: "Sauce ingredient", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Chiller" },
  { sku: "ING-HONEY", name: "Honey", category: "Sauce ingredient", baseUnit: "L", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "ING-HOT", name: "Hot sauce base", category: "Sauce ingredient", baseUnit: "L", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "ING-SOY", name: "Soy sauce", category: "Sauce ingredient", baseUnit: "L", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "ING-SUGAR", name: "Sugar", category: "Sauce ingredient", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "ING-EGG", name: "Salted egg yolk", category: "Sauce ingredient", baseUnit: "pc", count: "WEEKLY", inventoryKey: "INV_SAUCES", consumptionKey: "COGS_SAUCES", stockedAt: COMMISSARY, storageArea: "Chiller" },
  { sku: "DRY-OIL", name: "Cooking oil", category: "Dry goods", baseUnit: "L", purchaseUnit: "tin", purchaseToBase: 18, count: "DAILY", inventoryKey: "INV_DRY", consumptionKey: "COGS_OIL", stockedAt: BOTH, storageArea: "Dry storage" },
  { sku: "DRY-RICE", name: "Rice", category: "Dry goods", baseUnit: "kg", purchaseUnit: "sack", purchaseToBase: 25, count: "WEEKLY", inventoryKey: "INV_DRY", consumptionKey: "COGS_RICE", stockedAt: BRANCH, storageArea: "Dry storage" },
  { sku: "DRY-FLOUR", name: "Breading flour", category: "Dry goods", baseUnit: "kg", count: "WEEKLY", inventoryKey: "INV_DRY", consumptionKey: "COGS_RICE", stockedAt: BOTH, storageArea: "Dry storage" },
  { sku: "DRY-FRIES", name: "Frozen fries", category: "Dry goods", baseUnit: "kg", purchaseUnit: "pack", purchaseToBase: 2.5, count: "WEEKLY", inventoryKey: "INV_DRY", consumptionKey: "COGS_RICE", stockedAt: BRANCH, storageArea: "Freezer" },
  { sku: "VEG-STICKS", name: "Carrot and celery sticks", category: "Vegetables", baseUnit: "kg", count: "DAILY", inventoryKey: "INV_DRY", consumptionKey: "COGS_VEGETABLES", stockedAt: BRANCH, storageArea: "Chiller" },
  { sku: "BEV-ICEDTEA", name: "Iced tea (prepared)", category: "Beverage", baseUnit: "L", count: "WEEKLY", inventoryKey: "INV_BEVERAGES", consumptionKey: "COGS_BEVERAGES", stockedAt: BRANCH, storageArea: "Bar" },
  { sku: "BEV-WATER", name: "Bottled water 500ml", category: "Beverage", baseUnit: "pc", purchaseUnit: "case", purchaseToBase: 24, count: "WEEKLY", inventoryKey: "INV_BEVERAGES", consumptionKey: "COGS_BEVERAGES", stockedAt: BRANCH, storageArea: "Bar" },
  { sku: "BEV-SODA15", name: "Softdrinks 1.5L", category: "Beverage", baseUnit: "pc", purchaseUnit: "case", purchaseToBase: 12, count: "WEEKLY", inventoryKey: "INV_BEVERAGES", consumptionKey: "COGS_BEVERAGES", stockedAt: BRANCH, storageArea: "Bar" },
  { sku: "BEV-SODACAN", name: "Softdrinks in can", category: "Beverage", baseUnit: "pc", purchaseUnit: "case", purchaseToBase: 24, count: "WEEKLY", inventoryKey: "INV_BEVERAGES", consumptionKey: "COGS_BEVERAGES", stockedAt: BRANCH, storageArea: "Bar" },
  { sku: "PKG-BOX", name: "Take-out box", category: "Packaging", baseUnit: "pc", purchaseUnit: "pack", purchaseToBase: 50, count: "WEEKLY", inventoryKey: "INV_PACKAGING", consumptionKey: "COGS_PACKAGING", stockedAt: BRANCH, storageArea: "Dry storage" },
  { sku: "PKG-CUP", name: "Sauce cup 2oz", category: "Packaging", baseUnit: "pc", purchaseUnit: "pack", purchaseToBase: 100, count: "WEEKLY", inventoryKey: "INV_PACKAGING", consumptionKey: "COGS_PACKAGING", stockedAt: BOTH, storageArea: "Dry storage" },
  { sku: "PKG-BAG", name: "Paper bag", category: "Packaging", baseUnit: "pc", purchaseUnit: "pack", purchaseToBase: 100, count: "WEEKLY", inventoryKey: "INV_PACKAGING", consumptionKey: "COGS_PACKAGING", stockedAt: BRANCH, storageArea: "Dry storage" },
  { sku: "PKG-TUB", name: "Sauce tub 1L (for transfers)", category: "Packaging", baseUnit: "pc", count: "MONTHLY", inventoryKey: "INV_PACKAGING", consumptionKey: "COGS_PACKAGING", stockedAt: COMMISSARY, storageArea: "Dry storage" },
  { sku: "FUEL-LPG", name: "LPG 11kg tank", category: "Fuel", baseUnit: "pc", count: "WEEKLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "COGS_LPG", stockedAt: BOTH, storageArea: "Kitchen" },
  { sku: "CLN-DISH", name: "Dishwashing liquid", category: "Cleaning", baseUnit: "L", count: "MONTHLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "SUP_CLEANING", stockedAt: BOTH, storageArea: "Utility" },
  { sku: "CLN-SANI", name: "Sanitizer", category: "Cleaning", baseUnit: "L", count: "MONTHLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "SUP_CLEANING", stockedAt: BOTH, storageArea: "Utility" },
  { sku: "CLN-TRASH", name: "Trash bags", category: "Cleaning", baseUnit: "pack", count: "MONTHLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "SUP_CLEANING", stockedAt: BOTH, storageArea: "Utility" },
  { sku: "DIN-TISSUE", name: "Table tissue", category: "Dining supplies", baseUnit: "pack", count: "WEEKLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "SUP_TISSUE", stockedAt: BRANCH, storageArea: "Dining" },
  { sku: "DIN-GLOVES", name: "Disposable gloves", category: "Dining supplies", baseUnit: "box", count: "WEEKLY", inventoryKey: "INV_SUPPLIES", consumptionKey: "SUP_TISSUE", stockedAt: BRANCH, storageArea: "Dining" },
];

export type ProductSeed = {
  name: string;
  type: ProductType;
  paxPerUnit: number;
  revenueKey: string;
};

export const PRODUCTS: ProductSeed[] = [
  { name: "Unlimited Wings", type: "PACKAGE", paxPerUnit: 1, revenueKey: "REV_UNLIMITED" },
  { name: "Unlimited Wings + Drinks", type: "PACKAGE", paxPerUnit: 1, revenueKey: "REV_UNLIMITED" },
  { name: "Kids Unlimited Wings", type: "PACKAGE", paxPerUnit: 1, revenueKey: "REV_UNLIMITED" },
  { name: "Promo Package", type: "PACKAGE", paxPerUnit: 1, revenueKey: "REV_UNLIMITED" },
  { name: "Wings 6 pcs (à la carte)", type: "ALA_CARTE", paxPerUnit: 0, revenueKey: "REV_ALA_CARTE" },
  { name: "Wings 12 pcs (à la carte)", type: "ALA_CARTE", paxPerUnit: 0, revenueKey: "REV_ALA_CARTE" },
  { name: "Extra rice", type: "ADDON", paxPerUnit: 0, revenueKey: "REV_ALA_CARTE" },
  { name: "Fries", type: "ADDON", paxPerUnit: 0, revenueKey: "REV_ALA_CARTE" },
  { name: "Extra sauce cup", type: "ADDON", paxPerUnit: 0, revenueKey: "REV_ALA_CARTE" },
  { name: "Bottomless iced tea", type: "BEVERAGE", paxPerUnit: 0, revenueKey: "REV_BEVERAGES" },
  { name: "Softdrinks in can", type: "BEVERAGE", paxPerUnit: 0, revenueKey: "REV_BEVERAGES" },
  { name: "Bottled water", type: "BEVERAGE", paxPerUnit: 0, revenueKey: "REV_BEVERAGES" },
  { name: "Take-out Wings 12 pcs", type: "TAKEOUT", paxPerUnit: 0, revenueKey: "REV_TAKEOUT" },
  { name: "Take-out Wings 24 pcs", type: "TAKEOUT", paxPerUnit: 0, revenueKey: "REV_TAKEOUT" },
];

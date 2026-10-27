// The standard chart of accounts (spec 7.3). Seeded once; the Owner can edit
// names and add sub-accounts later. One chart serves every location because
// location is a dimension on each journal line.

import type { AccountType, KpiTag, MoneyAccountKind, StatementSection } from "@/generated/prisma/enums";

export type GroupDef = {
  code: string;
  name: string;
  section: StatementSection;
  kpiTag?: KpiTag;
  isVariable?: boolean;
};

export type AccountDef = {
  code: string;
  name: string;
  group: string;
  /** Header accounts group sub-accounts and can't be posted to. */
  header?: boolean;
  parent?: string;
  systemKey?: string;
  isIntercompany?: boolean;
};

export const ACCOUNT_GROUPS: GroupDef[] = [
  { code: "CASH", name: "Cash and cash equivalents", section: "CURRENT_ASSET" },
  { code: "RECEIVABLES", name: "Receivables", section: "CURRENT_ASSET" },
  { code: "INVENTORY", name: "Inventory", section: "CURRENT_ASSET" },
  { code: "OTHER_CURRENT_ASSETS", name: "Other current assets", section: "CURRENT_ASSET" },
  { code: "PPE", name: "Property and equipment", section: "NONCURRENT_ASSET" },
  { code: "OTHER_ASSETS", name: "Other non-current assets", section: "NONCURRENT_ASSET" },
  { code: "CURRENT_LIABILITIES", name: "Current liabilities", section: "CURRENT_LIABILITY" },
  { code: "NONCURRENT_LIABILITIES", name: "Non-current liabilities", section: "NONCURRENT_LIABILITY" },
  { code: "EQUITY", name: "Owner's equity", section: "EQUITY" },
  { code: "REVENUE", name: "Revenue", section: "REVENUE" },
  { code: "CONTRA_REVENUE", name: "Discounts and commissions", section: "CONTRA_REVENUE" },
  { code: "COGS", name: "Cost of goods sold", section: "COGS", kpiTag: "FOOD_COST", isVariable: true },
  { code: "PAYROLL", name: "Payroll and labor", section: "LABOR", kpiTag: "LABOR" },
  { code: "OCCUPANCY", name: "Occupancy", section: "OPERATING_EXPENSE", kpiTag: "OCCUPANCY" },
  { code: "UTILITIES", name: "Utilities", section: "OPERATING_EXPENSE" },
  { code: "SUPPLIES", name: "Operating supplies", section: "OPERATING_EXPENSE" },
  { code: "REPAIRS", name: "Repairs and maintenance", section: "OPERATING_EXPENSE" },
  { code: "MARKETING", name: "Marketing", section: "OPERATING_EXPENSE" },
  { code: "ADMIN", name: "Admin and professional", section: "OPERATING_EXPENSE" },
  { code: "TRANSPORT", name: "Transportation and delivery", section: "OPERATING_EXPENSE" },
  { code: "DEPRECIATION", name: "Depreciation", section: "OPERATING_EXPENSE", kpiTag: "DEPRECIATION" },
  { code: "INTEREST", name: "Interest and loan charges", section: "OTHER_INCOME_EXPENSE", kpiTag: "INTEREST" },
  { code: "INCOME_TAX", name: "Income tax", section: "INCOME_TAX", kpiTag: "INCOME_TAX" },
];

export const ACCOUNTS: AccountDef[] = [
  // ── Assets ───────────────────────────────────────────────────────────────
  { code: "1010", name: "Cash drawers", group: "CASH", header: true, systemKey: "HDR_CASH_DRAWER" },
  { code: "1020", name: "Undeposited cash", group: "CASH", header: true, systemKey: "HDR_UNDEPOSITED_CASH" },
  { code: "1030", name: "Petty cash funds", group: "CASH", header: true, systemKey: "HDR_PETTY_CASH" },
  { code: "1040", name: "Bank accounts", group: "CASH", header: true, systemKey: "HDR_BANK" },
  { code: "1050", name: "E-wallets", group: "CASH", header: true, systemKey: "HDR_EWALLET" },
  { code: "1110", name: "Card / QR clearing", group: "RECEIVABLES", header: true, systemKey: "HDR_CARD_CLEARING" },
  { code: "1120", name: "Delivery platform receivables", group: "RECEIVABLES", header: true, systemKey: "HDR_PLATFORM_RECEIVABLE" },
  { code: "1130", name: "Inter-location receivable", group: "RECEIVABLES", systemKey: "INTERCO_RECEIVABLE", isIntercompany: true },
  { code: "1140", name: "Employee advances and loans", group: "RECEIVABLES", systemKey: "EMPLOYEE_ADVANCES" },
  { code: "1150", name: "Creditable withholding tax", group: "OTHER_CURRENT_ASSETS", systemKey: "CREDITABLE_WHT" },
  { code: "1160", name: "Prepaid expenses", group: "OTHER_CURRENT_ASSETS" },
  { code: "1200", name: "Inventory", group: "INVENTORY", header: true },
  { code: "1210", name: "Inventory – Raw protein", group: "INVENTORY", parent: "1200", systemKey: "INV_PROTEIN" },
  { code: "1220", name: "Inventory – Sauces and seasonings", group: "INVENTORY", parent: "1200", systemKey: "INV_SAUCES" },
  { code: "1230", name: "Inventory – Dry goods and oil", group: "INVENTORY", parent: "1200", systemKey: "INV_DRY" },
  { code: "1240", name: "Inventory – Beverages", group: "INVENTORY", parent: "1200", systemKey: "INV_BEVERAGES" },
  { code: "1250", name: "Inventory – Packaging", group: "INVENTORY", parent: "1200", systemKey: "INV_PACKAGING" },
  { code: "1260", name: "Inventory – Supplies", group: "INVENTORY", parent: "1200", systemKey: "INV_SUPPLIES" },
  { code: "1500", name: "Property and equipment", group: "PPE", header: true },
  { code: "1510", name: "Kitchen equipment", group: "PPE", parent: "1500" },
  { code: "1520", name: "Furniture and fixtures", group: "PPE", parent: "1500" },
  { code: "1530", name: "Leasehold improvements", group: "PPE", parent: "1500" },
  { code: "1590", name: "Accumulated depreciation", group: "PPE", parent: "1500", systemKey: "ACCUM_DEPRECIATION" },
  { code: "1610", name: "Rental and utility deposits", group: "OTHER_ASSETS" },

  // ── Liabilities ──────────────────────────────────────────────────────────
  { code: "2010", name: "Accounts payable", group: "CURRENT_LIABILITIES", systemKey: "ACCOUNTS_PAYABLE" },
  { code: "2020", name: "Inter-location payable", group: "CURRENT_LIABILITIES", systemKey: "INTERCO_PAYABLE", isIntercompany: true },
  { code: "2030", name: "Salaries payable", group: "CURRENT_LIABILITIES", systemKey: "SALARIES_PAYABLE" },
  { code: "2040", name: "SSS payable", group: "CURRENT_LIABILITIES", systemKey: "SSS_PAYABLE" },
  { code: "2050", name: "PhilHealth payable", group: "CURRENT_LIABILITIES", systemKey: "PHIC_PAYABLE" },
  { code: "2060", name: "Pag-IBIG payable", group: "CURRENT_LIABILITIES", systemKey: "HDMF_PAYABLE" },
  { code: "2070", name: "Withholding tax payable – compensation", group: "CURRENT_LIABILITIES", systemKey: "WTAX_COMP_PAYABLE" },
  { code: "2080", name: "Withholding tax payable – expanded", group: "CURRENT_LIABILITIES", systemKey: "WTAX_EXP_PAYABLE" },
  { code: "2090", name: "Percentage tax payable", group: "CURRENT_LIABILITIES", systemKey: "PERCENTAGE_TAX_PAYABLE" },
  { code: "2100", name: "Service charge payable", group: "CURRENT_LIABILITIES", systemKey: "SERVICE_CHARGE_PAYABLE" },
  { code: "2110", name: "Accrued 13th month pay", group: "CURRENT_LIABILITIES", systemKey: "ACCRUED_13TH_MONTH" },
  { code: "2120", name: "Due to owner", group: "CURRENT_LIABILITIES", header: true, systemKey: "HDR_DUE_TO_OWNER" },
  { code: "2210", name: "Loans payable", group: "NONCURRENT_LIABILITIES", systemKey: "LOANS_PAYABLE" },

  // ── Equity ───────────────────────────────────────────────────────────────
  { code: "3010", name: "Owner's capital", group: "EQUITY", systemKey: "OWNER_CAPITAL" },
  { code: "3020", name: "Owner's drawings", group: "EQUITY", systemKey: "OWNER_DRAWINGS" },
  { code: "3030", name: "Retained earnings", group: "EQUITY", systemKey: "RETAINED_EARNINGS" },
  { code: "3040", name: "Opening balance equity", group: "EQUITY", systemKey: "OPENING_BALANCE_EQUITY" },

  // ── Revenue ──────────────────────────────────────────────────────────────
  { code: "4010", name: "Dine-in unlimited", group: "REVENUE", systemKey: "REV_UNLIMITED" },
  { code: "4020", name: "À la carte", group: "REVENUE", systemKey: "REV_ALA_CARTE" },
  { code: "4030", name: "Beverages", group: "REVENUE", systemKey: "REV_BEVERAGES" },
  { code: "4040", name: "Take-out and delivery", group: "REVENUE", systemKey: "REV_TAKEOUT" },
  { code: "4050", name: "Service charge income", group: "REVENUE", systemKey: "REV_SERVICE_CHARGE" },
  { code: "4090", name: "Other income", group: "REVENUE", systemKey: "REV_OTHER" },
  { code: "4100", name: "Inter-location markup income (eliminated)", group: "REVENUE", systemKey: "INTERCO_MARKUP_INCOME", isIntercompany: true },
  { code: "4510", name: "SC / PWD discounts", group: "CONTRA_REVENUE", systemKey: "DISC_SC_PWD" },
  { code: "4520", name: "Promo and voucher discounts", group: "CONTRA_REVENUE", systemKey: "DISC_PROMO" },
  { code: "4530", name: "Comps and employee meals", group: "CONTRA_REVENUE", systemKey: "DISC_COMPS" },
  { code: "4540", name: "Delivery platform commissions", group: "CONTRA_REVENUE", systemKey: "PLATFORM_COMMISSIONS" },
  { code: "4550", name: "Refunds", group: "CONTRA_REVENUE", systemKey: "DISC_REFUNDS" },

  // ── COGS ─────────────────────────────────────────────────────────────────
  { code: "5010", name: "Chicken wings", group: "COGS", systemKey: "COGS_WINGS" },
  { code: "5020", name: "Sauces and seasonings", group: "COGS", systemKey: "COGS_SAUCES" },
  { code: "5030", name: "Cooking oil", group: "COGS", systemKey: "COGS_OIL" },
  { code: "5040", name: "Rice and sides", group: "COGS", systemKey: "COGS_RICE" },
  { code: "5050", name: "Vegetables", group: "COGS", systemKey: "COGS_VEGETABLES" },
  { code: "5060", name: "Beverages", group: "COGS", systemKey: "COGS_BEVERAGES" },
  { code: "5070", name: "Packaging and take-out containers", group: "COGS", systemKey: "COGS_PACKAGING" },
  { code: "5080", name: "LPG and cooking fuel", group: "COGS", systemKey: "COGS_LPG" },
  { code: "5090", name: "Commissary transfers-in", group: "COGS", systemKey: "COGS_COMMISSARY" },
  { code: "5095", name: "Waste and spoilage", group: "COGS", systemKey: "COGS_WASTE" },
  { code: "5096", name: "Transfer losses", group: "COGS", systemKey: "COGS_TRANSFER_LOSS" },
  { code: "5099", name: "Inter-location markup charges (eliminated)", group: "COGS", systemKey: "INTERCO_MARKUP_CHARGES", isIntercompany: true },

  // ── Payroll ──────────────────────────────────────────────────────────────
  { code: "6010", name: "Basic salaries", group: "PAYROLL", systemKey: "PAY_BASIC" },
  { code: "6020", name: "Overtime", group: "PAYROLL", systemKey: "PAY_OVERTIME" },
  { code: "6030", name: "Holiday and premium pay", group: "PAYROLL", systemKey: "PAY_HOLIDAY" },
  { code: "6040", name: "Allowances", group: "PAYROLL", systemKey: "PAY_ALLOWANCES" },
  { code: "6050", name: "13th month pay", group: "PAYROLL", systemKey: "PAY_13TH_MONTH" },
  { code: "6060", name: "SSS / PhilHealth / Pag-IBIG employer share", group: "PAYROLL", systemKey: "PAY_GOV_ER" },
  { code: "6070", name: "Staff meals", group: "PAYROLL", systemKey: "PAY_STAFF_MEALS" },
  { code: "6080", name: "Agency and contractual", group: "PAYROLL", systemKey: "PAY_AGENCY" },

  // ── Operating expenses ───────────────────────────────────────────────────
  { code: "6110", name: "Rental", group: "OCCUPANCY" },
  { code: "6120", name: "Association dues", group: "OCCUPANCY" },
  { code: "6130", name: "Real property and business taxes", group: "OCCUPANCY" },
  { code: "6210", name: "Electricity", group: "UTILITIES" },
  { code: "6220", name: "Water", group: "UTILITIES" },
  { code: "6230", name: "Internet and phone", group: "UTILITIES" },
  { code: "6310", name: "Cleaning supplies", group: "SUPPLIES", systemKey: "SUP_CLEANING" },
  { code: "6320", name: "Kitchen tools and smallwares", group: "SUPPLIES", systemKey: "SUP_SMALLWARES" },
  { code: "6330", name: "Tissue and condiments", group: "SUPPLIES", systemKey: "SUP_TISSUE" },
  { code: "6410", name: "Repairs and maintenance", group: "REPAIRS" },
  { code: "6510", name: "Facebook / Meta ads", group: "MARKETING" },
  { code: "6520", name: "Influencers", group: "MARKETING" },
  { code: "6530", name: "Printing and signage", group: "MARKETING" },
  { code: "6540", name: "Promos", group: "MARKETING" },
  { code: "6610", name: "Accounting and bookkeeping", group: "ADMIN" },
  { code: "6620", name: "Permits and licenses", group: "ADMIN" },
  { code: "6630", name: "Bank charges", group: "ADMIN", systemKey: "BANK_CHARGES" },
  { code: "6640", name: "Card / QR MDR fees", group: "ADMIN", systemKey: "MDR_FEES" },
  { code: "6650", name: "Software subscriptions", group: "ADMIN" },
  { code: "6660", name: "Percentage tax", group: "ADMIN", systemKey: "PERCENTAGE_TAX" },
  { code: "6690", name: "Cash over / short", group: "ADMIN", systemKey: "CASH_OVER_SHORT" },
  { code: "6695", name: "Production overhead absorbed (commissary)", group: "ADMIN", systemKey: "OVERHEAD_ABSORBED" },
  { code: "6710", name: "Commissary to branch delivery", group: "TRANSPORT" },
  { code: "6720", name: "Fuel", group: "TRANSPORT" },
  { code: "6730", name: "Grab / Lalamove", group: "TRANSPORT" },
  { code: "6810", name: "Depreciation – equipment", group: "DEPRECIATION", systemKey: "DEP_EQUIPMENT" },
  { code: "6820", name: "Depreciation – renovation", group: "DEPRECIATION", systemKey: "DEP_RENOVATION" },
  { code: "7010", name: "Interest and loan charges", group: "INTEREST", systemKey: "INTEREST_EXPENSE" },
  { code: "8010", name: "Income tax", group: "INCOME_TAX", systemKey: "INCOME_TAX" },
];

/** Header account each kind of money account's GL sub-account sits under. */
export const MONEY_ACCOUNT_PARENT: Record<MoneyAccountKind, string> = {
  CASH_DRAWER: "HDR_CASH_DRAWER",
  UNDEPOSITED_CASH: "HDR_UNDEPOSITED_CASH",
  PETTY_CASH: "HDR_PETTY_CASH",
  BANK: "HDR_BANK",
  EWALLET: "HDR_EWALLET",
  CARD_CLEARING: "HDR_CARD_CLEARING",
  PLATFORM_RECEIVABLE: "HDR_PLATFORM_RECEIVABLE",
  OWNER_PERSONAL: "HDR_DUE_TO_OWNER",
};

export function accountTypeForGroup(groupCode: string): AccountType {
  const group = ACCOUNT_GROUPS.find((g) => g.code === groupCode);
  if (!group) throw new Error(`Unknown account group ${groupCode}`);
  switch (group.section) {
    case "CURRENT_ASSET":
    case "NONCURRENT_ASSET":
      return "ASSET";
    case "CURRENT_LIABILITY":
    case "NONCURRENT_LIABILITY":
      return "LIABILITY";
    case "EQUITY":
      return "EQUITY";
    case "REVENUE":
      return "REVENUE";
    case "CONTRA_REVENUE":
      // Revenue accounts with a debit balance; reports show them in their own section.
      return "REVENUE";
    default:
      return "EXPENSE";
  }
}

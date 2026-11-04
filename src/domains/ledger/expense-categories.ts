import type { StatementSection } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";

// The owner's expense categories: nine headings (account groups, one slice
// each in the dashboard's expense chart) and the categories under them, in
// the order the pickers show them. Existing accounts keep their codes and
// history and are renamed or moved; missing ones are created.

type Cat = { code: string; name: string };
export type ExpenseHeading = { group: string; name: string; section: StatementSection; sortOrder: number; accounts: Cat[] };

export const EXPENSE_HEADINGS: ExpenseHeading[] = [
  {
    group: "COGS",
    name: "Cost of goods sold (COGS)",
    section: "COGS",
    sortOrder: 110,
    accounts: [
      { code: "5010", name: "Chicken Wings" },
      { code: "5011", name: "Ice" },
      { code: "5040", name: "Rice" },
      { code: "5030", name: "Oil" },
      { code: "5031", name: "Flour" },
      { code: "5032", name: "Margarine" },
      { code: "5060", name: "Drinks" },
      { code: "5033", name: "Market - Bankerohan" },
      { code: "5085", name: "Market - Mall Grocery" },
      { code: "5086", name: "Raw Ingredients" },
      { code: "5020", name: "Sauces" },
      { code: "5080", name: "LPG Gas" },
      { code: "5034", name: "Magnesol" },
      { code: "5035", name: "Ice Cream" },
      { code: "5090", name: "Commissary Ingredients / Items" },
      { code: "5087", name: "Others" },
    ],
  },
  {
    group: "SUPPLIES",
    name: "Supplies and packaging",
    section: "OPERATING_EXPENSE",
    sortOrder: 150,
    accounts: [
      { code: "5070", name: "Packaging Supplies - Box" },
      { code: "6340", name: "Disposable Gloves" },
      { code: "6320", name: "Kitchen Supplies" },
      { code: "6330", name: "Dining Supplies" },
    ],
  },
  {
    group: "OPEX",
    name: "Operating expenses",
    section: "OPERATING_EXPENSE",
    sortOrder: 151,
    accounts: [
      { code: "6730", name: "Transportation" },
      { code: "6110", name: "Commercial Space Rental" },
      { code: "6210", name: "Utility - Davao Light" },
      { code: "6220", name: "Utility - Water District" },
      { code: "6150", name: "Penalty and Other Fees" },
      { code: "6230", name: "Internet Service Provider" },
      { code: "6190", name: "Others" },
    ],
  },
  {
    group: "REPAIRS",
    name: "Maintenance and equipment",
    section: "OPERATING_EXPENSE",
    sortOrder: 160,
    accounts: [
      { code: "6410", name: "Maintenance - Materials / Repair" },
      { code: "6420", name: "Equipment - Appliances Purchase" },
    ],
  },
  {
    group: "MARKETING",
    name: "Marketing and promotions",
    section: "OPERATING_EXPENSE",
    sortOrder: 170,
    accounts: [
      { code: "6540", name: "Discount / Promotionals" },
      { code: "6510", name: "Social Media and Online Subscription" },
      { code: "6530", name: "Marketing Materials / Others" },
    ],
  },
  {
    group: "PAYROLL",
    name: "Labor cost",
    section: "LABOR",
    sortOrder: 120,
    accounts: [
      { code: "6010", name: "Employee Salary" },
      { code: "6090", name: "Employee Cash Advance" },
      { code: "6060", name: "Employee Government Benefits" },
      { code: "6095", name: "Others" },
    ],
  },
  {
    group: "ADMIN",
    name: "Admin and fixed costs",
    section: "OPERATING_EXPENSE",
    sortOrder: 180,
    accounts: [
      { code: "6620", name: "Business Permit / Renewal" },
      { code: "6610", name: "Accounting and Bookkeeping" },
      { code: "6660", name: "BIR Quarterly Sales" },
      { code: "6670", name: "BIR Payment" },
      { code: "6680", name: "Others" },
    ],
  },
  {
    group: "TRAINING",
    name: "Training and engagement",
    section: "OPERATING_EXPENSE",
    sortOrder: 185,
    accounts: [
      { code: "6910", name: "Training / Team Building / Rewards" },
      { code: "6920", name: "Meeting / Meals / Milestones" },
    ],
  },
  {
    group: "MISC",
    name: "Others / Miscellaneous",
    section: "OPERATING_EXPENSE",
    sortOrder: 186,
    accounts: [
      { code: "6950", name: "Personal" },
      { code: "6990", name: "Others" },
    ],
  },
];

/** Codes the expense pickers offer, in display order. */
export const EXPENSE_CATEGORY_CODES = EXPENSE_HEADINGS.flatMap((h) => h.accounts.map((a) => a.code));

/** Old expense accounts with no system role; retired when unused (kept, but hidden, if they have history). */
const RETIRED_CODES = ["6120", "6130", "6520", "6650", "6710", "6720"];

/** Applies the headings and categories to the chart of accounts. Safe to run repeatedly. */
export async function applyExpenseCategories(tx: Tx) {
  let changed = 0;
  for (const h of EXPENSE_HEADINGS) {
    const existing = await tx.accountGroup.findUnique({ where: { code: h.group } });
    const group = existing
      ? existing.name === h.name && existing.sortOrder === h.sortOrder
        ? existing
        : await tx.accountGroup.update({ where: { id: existing.id }, data: { name: h.name, sortOrder: h.sortOrder } })
      : await tx.accountGroup.create({ data: { code: h.group, name: h.name, section: h.section, sortOrder: h.sortOrder } });
    if (group !== existing) changed++;
    const type = h.section === "REVENUE" ? "REVENUE" : "EXPENSE";
    for (const a of h.accounts) {
      const acct = await tx.account.findUnique({ where: { code: a.code } });
      if (!acct) {
        await tx.account.create({ data: { code: a.code, name: a.name, type, groupId: group.id, isPostable: true } });
        changed++;
      } else if (acct.name !== a.name || acct.groupId !== group.id || !acct.isActive) {
        await tx.account.update({ where: { id: acct.id }, data: { name: a.name, groupId: group.id, isActive: true } });
        changed++;
      }
    }
  }
  for (const code of RETIRED_CODES) {
    const acct = await tx.account.findUnique({ where: { code } });
    if (!acct || !acct.isActive || acct.systemKey) continue;
    const used =
      (await tx.journalLine.count({ where: { accountId: acct.id } })) +
      (await tx.expenseLine.count({ where: { accountId: acct.id } })) +
      (await tx.recurringExpense.count({ where: { accountId: acct.id } })) +
      (await tx.supplier.count({ where: { defaultAccountId: acct.id } }));
    if (used) continue;
    await tx.account.update({ where: { id: acct.id }, data: { isActive: false } });
    changed++;
  }
  return changed;
}

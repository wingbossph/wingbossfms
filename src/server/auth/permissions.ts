// The permission catalogue. Keys are `module:action` and are checked on the
// server for every action. Synced to the Permission table by the seed so the
// Owner can edit the role matrix in the UI.

export type PermissionDef = {
  key: string;
  module: string;
  description: string;
  /** Can never be granted to anyone but the Owner. */
  ownerOnly?: boolean;
};

export const PERMISSIONS = [
  // Dashboard & reports
  { key: "dashboard:view", module: "Dashboard", description: "View the owner dashboard" },
  { key: "reports:sales:view", module: "Reports", description: "View sales reports" },
  { key: "reports:pnl:view", module: "Reports", description: "View profit & loss" },
  { key: "reports:balance-sheet:view", module: "Reports", description: "View balance sheet and cash flow" },
  { key: "reports:inventory:view", module: "Reports", description: "View inventory reports and variance" },
  { key: "reports:payroll:view", module: "Reports", description: "View payroll reports" },

  // Sales & cash
  { key: "sales:view", module: "Sales", description: "View sales entries" },
  { key: "sales:create", module: "Sales", description: "Enter daily sales" },
  { key: "sales:import", module: "Sales", description: "Import Loyverse exports" },
  { key: "sales:approve", module: "Sales", description: "Approve submitted sales" },
  { key: "cash:count", module: "Cash", description: "Close shift and count cash" },
  { key: "cash:deposit", module: "Cash", description: "Record cash deposits" },
  { key: "money:view", module: "Cash", description: "View money account balances" },
  { key: "money:transfer", module: "Cash", description: "Transfer between money accounts" },

  // Expenses & AP
  { key: "expenses:view", module: "Expenses", description: "View expenses" },
  { key: "expenses:create", module: "Expenses", description: "Submit expenses" },
  { key: "expenses:approve", module: "Expenses", description: "Approve expenses up to the threshold" },
  { key: "expenses:approve:high", module: "Expenses", description: "Approve expenses above the threshold" },
  { key: "payables:manage", module: "Expenses", description: "Manage supplier bills and payments" },
  { key: "suppliers:manage", module: "Expenses", description: "Manage suppliers" },

  // Inventory & commissary
  { key: "inventory:view", module: "Inventory", description: "View stock and movements" },
  { key: "inventory:count", module: "Inventory", description: "Record inventory counts" },
  { key: "inventory:adjust", module: "Inventory", description: "Record waste, staff meals and adjustments" },
  { key: "inventory:items:manage", module: "Inventory", description: "Manage items, recipes and standards" },
  { key: "production:create", module: "Commissary", description: "Record production batches" },
  { key: "transfers:create", module: "Commissary", description: "Create and dispatch transfers" },
  { key: "transfers:receive", module: "Commissary", description: "Receive incoming transfers" },

  // Payroll
  { key: "employees:view", module: "Payroll", description: "View employee records" },
  { key: "employees:manage", module: "Payroll", description: "Manage employee records" },
  { key: "payroll:attendance", module: "Payroll", description: "Encode attendance (DTR)" },
  { key: "payroll:run", module: "Payroll", description: "Prepare payroll runs" },
  { key: "payroll:approve", module: "Payroll", description: "Approve payroll runs" },

  // Banking & ledger
  { key: "banking:view", module: "Banking", description: "View statements and reconciliations" },
  { key: "banking:reconcile", module: "Banking", description: "Import statements and reconcile" },
  { key: "ledger:view", module: "Ledger", description: "View journal and general ledger" },
  { key: "ledger:journal:create", module: "Ledger", description: "Create manual journal entries" },
  { key: "ledger:accounts:manage", module: "Ledger", description: "Edit the chart of accounts", ownerOnly: true },
  { key: "ledger:period:close", module: "Ledger", description: "Close and reopen accounting periods", ownerOnly: true },

  // Corrections
  { key: "adjustments:request", module: "Corrections", description: "Request a correction to a submitted record" },
  { key: "adjustments:approve", module: "Corrections", description: "Approve correction requests" },
  { key: "records:void", module: "Corrections", description: "Void posted records", ownerOnly: true },
  { key: "records:delete", module: "Corrections", description: "Delete records", ownerOnly: true },

  // Administration
  { key: "audit:view", module: "Administration", description: "View the audit log" },
  { key: "devices:manage", module: "Administration", description: "Register and revoke branch devices" },
  { key: "users:view", module: "Administration", description: "View users" },
  { key: "users:manage", module: "Administration", description: "Create and edit users, PINs and access", ownerOnly: true },
  { key: "roles:manage", module: "Administration", description: "Edit the role permission matrix", ownerOnly: true },
  { key: "locations:view", module: "Administration", description: "View locations" },
  { key: "locations:manage", module: "Administration", description: "Add and edit branches", ownerOnly: true },
  { key: "settings:manage", module: "Administration", description: "Edit system settings", ownerOnly: true },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const OWNER_ONLY: ReadonlySet<string> = new Set(
  PERMISSIONS.filter((p) => "ownerOnly" in p && p.ownerOnly).map((p) => p.key),
);

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(key: string): key is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(key);
}

/** Default role templates. The Owner can change these in Admin → Roles. */
export const DEFAULT_ROLES: {
  key: string;
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}[] = [
  {
    key: "owner",
    name: "Owner",
    description: "Everything, across all locations.",
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: "admin",
    name: "Admin / Manager",
    description: "Only what the Owner grants, at the assigned locations.",
    permissions: [
      "dashboard:view",
      "reports:sales:view",
      "sales:view",
      "sales:approve",
      "cash:deposit",
      "money:view",
      "expenses:view",
      "expenses:approve",
      "inventory:view",
      "inventory:count",
      "adjustments:approve",
      "users:view",
      "locations:view",
      "devices:manage",
    ],
  },
  {
    key: "cashier",
    name: "Cashier / Employee",
    description: "Own branch only: daily sales, cash count, petty-cash expenses.",
    permissions: [
      "sales:view",
      "sales:create",
      "sales:import",
      "cash:count",
      "expenses:view",
      "expenses:create",
      "transfers:receive",
      "adjustments:request",
    ],
  },
  {
    key: "commissary",
    name: "Commissary Staff",
    description: "Production batches, dispatches and commissary inventory.",
    permissions: [
      "inventory:view",
      "inventory:count",
      "inventory:adjust",
      "production:create",
      "transfers:create",
      "expenses:view",
      "expenses:create",
      "adjustments:request",
    ],
  },
];

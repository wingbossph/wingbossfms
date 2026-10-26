// Navigation, filtered per user by permission. `phase` marks modules that are
// not built yet; they show a "coming in Phase N" page.

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Shown if the user has any of these permissions somewhere. Empty = everyone. */
  anyOf: string[];
  phase?: number;
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: "home", anyOf: [] },
      { href: "/dashboard", label: "Dashboard", icon: "gauge", anyOf: ["dashboard:view"], phase: 8 },
    ],
  },
  {
    label: "Daily operations",
    items: [
      { href: "/sales", label: "Sales", icon: "receipt", anyOf: ["sales:view", "sales:create"] },
      { href: "/cash", label: "Cash & deposits", icon: "wallet", anyOf: ["cash:count", "cash:deposit", "money:view", "money:transfer"] },
      { href: "/expenses", label: "Expenses", icon: "banknote", anyOf: ["expenses:view", "expenses:create", "expenses:approve", "payables:manage"] },
      { href: "/inventory", label: "Inventory", icon: "boxes", anyOf: ["inventory:view", "inventory:count"], phase: 5 },
      { href: "/commissary", label: "Commissary", icon: "truck", anyOf: ["production:create", "transfers:create", "transfers:receive"], phase: 5 },
    ],
  },
  {
    label: "Back office",
    items: [
      { href: "/payroll", label: "Payroll", icon: "users", anyOf: ["employees:view", "payroll:attendance", "payroll:run"], phase: 7 },
      { href: "/banking", label: "Banking", icon: "landmark", anyOf: ["banking:view"], phase: 6 },
      { href: "/ledger", label: "Ledger", icon: "book", anyOf: ["ledger:view"] },
      { href: "/reports", label: "Reports", icon: "chart", anyOf: ["reports:sales:view", "reports:pnl:view", "reports:balance-sheet:view", "reports:inventory:view", "reports:payroll:view", "ledger:view"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/adjustments", label: "Correction requests", icon: "inbox", anyOf: ["adjustments:approve"] },
      { href: "/admin/menu", label: "Menu & prices", icon: "utensils", anyOf: ["settings:manage"] },
      { href: "/admin/payments", label: "Payments & settings", icon: "credit-card", anyOf: ["settings:manage"] },
      { href: "/admin/locations", label: "Locations", icon: "store", anyOf: ["locations:view"] },
      { href: "/admin/users", label: "Users", icon: "user-cog", anyOf: ["users:view"] },
      { href: "/admin/roles", label: "Roles & permissions", icon: "shield", anyOf: ["roles:manage"] },
      { href: "/admin/devices", label: "Devices", icon: "tablet", anyOf: ["devices:manage"] },
      { href: "/admin/audit", label: "Audit log", icon: "history", anyOf: ["audit:view"] },
    ],
  },
];

export function visibleNav(can: (permission: string) => boolean): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((i) => i.anyOf.length === 0 || i.anyOf.some(can)),
  })).filter((s) => s.items.length > 0);
}

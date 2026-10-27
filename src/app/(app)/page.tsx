import Link from "next/link";
import { Banknote, Boxes, Receipt, Truck, Wallet, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { getActiveLocationId, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDate } from "@/lib/dates";

type Tile = { href: string; label: string; hint: string; icon: LucideIcon; anyOf: string[] };

// Big touch targets for the cashier's daily jobs.
const TILES: Tile[] = [
  { href: "/sales", label: "Enter sales", hint: "Import Loyverse or enter manually", icon: Receipt, anyOf: ["sales:create"] },
  { href: "/cash", label: "Close shift", hint: "Cash count and over/short", icon: Wallet, anyOf: ["cash:count"] },
  { href: "/expenses", label: "Add expense", hint: "Petty cash with receipt photo", icon: Banknote, anyOf: ["expenses:create"] },
  { href: "/inventory", label: "Count stock", hint: "Daily count of key items", icon: Boxes, anyOf: ["inventory:count"] },
  { href: "/commissary", label: "Dispatch / receive", hint: "Sauces and supplies", icon: Truck, anyOf: ["transfers:create", "transfers:receive"] },
];

export default async function HomePage() {
  const user = await requireUser();
  const activeLocationId = await getActiveLocationId(user);
  const location = user.locations.find((l) => l.id === activeLocationId);
  const tiles = TILES.filter((t) => t.anyOf.some((p) => user.access.canAnywhere(p)));

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description={`${location?.name ?? "All locations"} · ${formatDate(new Date())}`}
      />

      {tiles.length > 0 && (
        <section aria-label="Daily tasks" className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href + t.label}
              href={t.href}
              className="flex items-center gap-4 rounded-lg border-2 border-foreground/10 bg-card p-5 transition hover:border-foreground"
            >
              <t.icon className="size-8 shrink-0" aria-hidden />
              <span>
                <span className="block font-display text-2xl leading-none tracking-wide">{t.label}</span>
                <span className="text-sm text-muted-foreground">{t.hint}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {user.isOwner && <SetupChecklist />}
    </>
  );
}

async function SetupChecklist() {
  const [branchCount, devices, usersWithoutAccess, zeroPrices, feesTouched, standards, openingGl, openingStock, employees, imported, statements] = await Promise.all([
    db.location.count({ where: { type: "BRANCH", isActive: true } }),
    db.device.count({ where: { revokedAt: null } }),
    db.user.count({ where: { isActive: true, isOwner: false, roleAssignments: { none: {} } } }),
    db.priceListItem.count({ where: { priceCents: 0n, product: { isActive: true } } }),
    db.auditLog.count({ where: { entityType: "PaymentChannel", action: "UPDATE" } }),
    db.recipeLine.count({ where: { recipe: { kind: "PACKAGE_PER_PAX" }, qty: { gt: 0 } } }),
    db.journalEntry.count({ where: { source: "OPENING_BALANCE", status: "POSTED" } }),
    db.stockMovement.count({ where: { type: "OPENING" } }),
    db.employee.count(),
    db.importJob.count({ where: { status: "COMMITTED" } }),
    db.bankStatement.count(),
  ]);

  const items: { done: boolean; label: string; href: string }[] = [
    { done: branchCount > 0, label: `Locations set up (${branchCount} branches)`, href: "/admin/locations" },
    { done: devices > 0, label: "Register each branch tablet for PIN login", href: "/admin/devices" },
    { done: usersWithoutAccess === 0, label: "Every user has a role at a location", href: "/admin/users" },
    { done: zeroPrices === 0, label: zeroPrices ? `Enter your real packages and prices (${zeroPrices} still ₱0.00)` : "Packages and prices entered", href: "/admin/menu" },
    { done: feesTouched > 0, label: "Set Maya / Grab fee rates and settlement days", href: "/admin/payments" },
    { done: standards > 0, label: "Set the standard kg of wings per pax", href: "/inventory/recipes" },
    { done: imported > 0, label: "Import the old Google Sheets (items, employees, history)", href: "/admin/import" },
    { done: openingGl > 0, label: "Enter opening balances (cash, banks, payables)", href: "/ledger/opening" },
    { done: openingStock > 0, label: "Enter opening inventory", href: "/inventory/adjustments" },
    { done: employees > 0, label: "Add employees and pay rates", href: "/payroll/employees" },
    { done: statements > 0, label: "Import the first bank statement and reconcile", href: "/banking/import" },
  ];

  return (
    <section aria-labelledby="setup" className="rounded-lg border p-5">
      <h2 id="setup" className="text-2xl">Owner setup checklist</h2>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={`flex size-5 items-center justify-center rounded-full border text-xs ${i.done ? "border-success bg-success text-white" : ""}`}
            >
              {i.done ? "✓" : ""}
            </span>
            <Link href={i.href} className="underline-offset-4 hover:underline">
              {i.label}
            </Link>
            <span className="sr-only">{i.done ? "done" : "to do"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

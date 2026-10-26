import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleAlert, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { loadChart } from "@/domains/reports/financials";
import { alerts, branchComparison, comparisonRange, expensesByGroup, inventoryPanel, kpis, moneyIn, presetRange, salesTrend, type Kpis } from "@/domains/dashboard/metrics";
import { datesBetween } from "@/domains/payroll/compute";
import { manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { cn } from "cn";
import { DashboardFilters } from "./dashboard-filters";

export const metadata = { title: "Dashboard" };

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

function Delta({ now, before, good = "up", kind = "rel" }: { now: number | null; before: number | null; good?: "up" | "down"; kind?: "rel" | "pts" }) {
  if (now === null || before === null) return <span className="text-xs text-muted-foreground">no comparison</span>;
  const diff = kind === "pts" ? now - before : before === 0 ? null : ((now - before) / Math.abs(before)) * 100;
  if (diff === null) return <span className="text-xs text-muted-foreground">new</span>;
  const up = diff >= 0;
  const better = (up && good === "up") || (!up && good === "down");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", Math.abs(diff) < 0.05 ? "text-muted-foreground" : better ? "text-success" : "text-destructive")}>
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {diff.toFixed(1)}
      {kind === "pts" ? " pts" : "%"}
    </span>
  );
}

function Card({ label, value, href, children }: { label: string; value: string; href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-lg border bg-card p-4 transition hover:border-foreground">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="mt-1 block font-display text-3xl leading-none tracking-wide tabular-nums">{value}</span>
      <span className="mt-1 block">{children}</span>
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("dashboard:view");
  const sp = await searchParams;
  const today = manilaDateString();
  const allowed = user.locations.filter((l) => user.access.can("dashboard:view", l.id));
  const location = sp.location && (sp.location === "all" || allowed.some((l) => l.id === sp.location)) ? sp.location : allowed.length > 1 ? "all" : allowed[0].id;
  const ids = location === "all" ? allowed.map((l) => l.id) : [location];
  const preset = ["today", "week", "month", "custom"].includes(sp.preset ?? "") ? sp.preset! : "month";
  const range = presetRange(preset, today, { from: sp.from, to: sp.to });
  const compare = sp.compare === "yoy" ? "yoy" : "prev";
  const prev = comparisonRange(range, compare);
  const q = (extra: Record<string, string> = {}) => `?${new URLSearchParams({ from: range.from, to: range.to, ...(location !== "all" ? { location } : {}), ...extra })}`;

  const chart = await loadChart(db);
  const [now, before, money, trend, exp, branches, inv, alertList] = await Promise.all([
    kpis(ids, range, chart),
    kpis(ids, prev, chart),
    moneyIn(ids, range),
    salesTrend(ids, range),
    expensesByGroup(ids, range, chart),
    branchComparison(ids, range, chart),
    inventoryPanel(ids, range),
    alerts(ids, range, today),
  ]);
  for (const v of inv.variances.slice(0, 3)) alertList.push({ severity: "warning", text: `${v.location}: ${v.item} usage ${v.variancePct! > 0 ? "+" : ""}${v.variancePct}% vs standard (${v.date})`, href: `/inventory/variance` });
  if (money.personalAlert) alertList.unshift({ severity: "serious", text: `Personal GCash is ${(money.personalShareBp / 100).toFixed(1)}% of money in (limit ${(money.personalThresholdBp / 100).toFixed(0)}%)`, href: `/reports/sales-by-channel${q()}` });
  for (const l of inv.low.slice(0, 3)) alertList.push({ severity: "warning", text: `Low stock: ${l.item} at ${l.location} (${l.qty} ${l.unit})`, href: "/inventory" });

  const n = (k: Kpis, key: keyof Kpis) => {
    const v = k[key];
    return v === null ? null : typeof v === "bigint" ? Number(v) : (v as number);
  };
  // Trend data: one row per day, one column per location (colors follow the location's fixed order).
  const trendLocs = allowed.filter((l) => ids.includes(l.id) && trend.some((t) => t.locationId === l.id));
  const days = datesBetween(range.from, range.to);
  const salesData = days.map((d) => Object.fromEntries([["date", d], ...trendLocs.map((l) => [l.id, Number(trend.find((t) => t.date === d && t.locationId === l.id)?.netCents ?? 0n) / 100])]));
  const paxData = days.map((d) => Object.fromEntries([["date", d], ...trendLocs.map((l) => [l.id, trend.find((t) => t.date === d && t.locationId === l.id)?.pax ?? 0])]));
  const series = trendLocs.map((l) => ({ key: l.id, label: l.name }));
  const icon = { critical: CircleAlert, serious: AlertTriangle, warning: Info };

  return (
    <>
      <PageHeader title="Dashboard" description={`${location === "all" ? "All locations" : allowed.find((l) => l.id === location)?.name} · ${range.from === range.to ? range.from : `${range.from} to ${range.to}`} · compared with ${prev.from} to ${prev.to}`} />
      <DashboardFilters preset={preset} from={range.from} to={range.to} location={location} compare={compare} locations={allowed.map((l) => ({ id: l.id, name: l.name }))} />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Net sales" value={formatPeso(now.netSales)} href={`/reports/daily-sales${q()}`}>
          <Delta now={n(now, "netSales")} before={n(before, "netSales")} />
        </Card>
        <Card label="Pax" value={now.pax.toLocaleString("en-PH")} href={`/reports/daily-sales${q()}`}>
          <Delta now={now.pax} before={before.pax} />
        </Card>
        <Card label="Average spend per pax" value={now.avgPerPax === null ? "—" : formatPeso(now.avgPerPax)} href={`/reports/sales-by-package${q()}`}>
          <Delta now={n(now, "avgPerPax")} before={n(before, "avgPerPax")} />
        </Card>
        <Card label="Total expenses" value={formatPeso(now.expenses)} href={`/reports/expenses-by-category${q()}`}>
          <Delta now={n(now, "expenses")} before={n(before, "expenses")} good="down" />
        </Card>
        <Card label={`Net profit · ${pct(now.marginPct)}`} value={formatPeso(now.netProfit)} href={`/reports/pnl${q()}`}>
          <Delta now={n(now, "netProfit")} before={n(before, "netProfit")} />
        </Card>
        <Card label="Food cost" value={pct(now.foodCostPct)} href={`/reports/pnl${q()}`}>
          <Delta now={now.foodCostPct} before={before.foodCostPct} good="down" kind="pts" />
        </Card>
        <Card label="Labor cost" value={pct(now.laborCostPct)} href={`/reports/pnl${q()}`}>
          <Delta now={now.laborCostPct} before={before.laborCostPct} good="down" kind="pts" />
        </Card>
        <Card label="Cash on hand + banks" value={formatPeso(now.cashAndBanks)} href="/cash">
          <span className="text-xs text-muted-foreground">as of {range.to}</span>
        </Card>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="money-in">
          <h2 id="money-in" className="mb-3 text-2xl">
            Money in by channel <span className="text-base text-muted-foreground">{formatPeso(money.total)}</span>
          </h2>
          <BarList ariaLabel="Money in by channel" total={money.total} items={money.buckets.map((b) => ({ label: b.name, cents: b.cents, href: `/reports/sales-by-channel${q()}` }))} />
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Cash deposited</dt>
              <dd className="font-semibold">{formatPeso(money.cashDeposits)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Undeposited cash</dt>
              <dd className="font-semibold">
                <Link href="/cash" className="underline underline-offset-4">
                  {formatPeso(money.undeposited)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Card/QR/Grab pending</dt>
              <dd className="font-semibold">
                <Link href="/banking/payouts" className="underline underline-offset-4">
                  {formatPeso(money.pendingSettlements)}
                </Link>
              </dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="alerts">
          <h2 id="alerts" className="mb-3 text-2xl">
            Alerts {alertList.length > 0 && <span className="text-base text-muted-foreground">({alertList.length})</span>}
          </h2>
          {alertList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {alertList.map((a, i) => {
                const Icon = icon[a.severity];
                return (
                  <li key={i}>
                    <Link href={a.href} className="flex items-start gap-2 p-3 text-sm hover:bg-muted">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", a.severity === "warning" ? "text-warning" : "text-destructive")} aria-hidden />
                      <span>
                        <span className="sr-only">{a.severity}: </span>
                        {a.text}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="trend" className="mt-8">
        <h2 id="trend" className="mb-3 text-2xl">
          Sales trend
        </h2>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales in this period yet.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-semibold">Net sales per day</h3>
              <TrendChart data={salesData} series={series} format="peso" ariaLabel="Net sales per day by location" />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Pax per day</h3>
              <TrendChart data={paxData} series={series} format="number" ariaLabel="Pax per day by location" />
            </div>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="exp">
          <h2 id="exp" className="mb-3 text-2xl">
            Expenses by category
          </h2>
          <BarList ariaLabel="Expenses by category" items={exp.groups.map((g) => ({ label: g.name, cents: g.cents, note: now.netSales > 0n ? `${(Number((g.cents * 1000n) / now.netSales) / 10).toFixed(1)}% of sales` : undefined, href: `/reports/expenses-by-category${q()}` }))} />
        </section>
        <section aria-labelledby="drivers">
          <h2 id="drivers" className="mb-3 text-2xl">
            Top cost drivers
          </h2>
          <SimpleTable head={["Account", "Amount", "% of sales"]} rows={exp.drivers.map((d) => [<Link key="a" href={`/ledger/accounts/${d.id}${q()}`} className="underline underline-offset-4">{d.name}</Link>, formatPeso(d.cents), now.netSales > 0n ? `${(Number((d.cents * 1000n) / now.netSales) / 10).toFixed(1)}%` : "—"])} empty="No expenses in this period." />
        </section>
      </div>

      {branches.length > 1 && (
        <section aria-labelledby="branches" className="mt-8">
          <h2 id="branches" className="mb-3 text-2xl">
            Branch comparison
          </h2>
          <SimpleTable
            head={["Location", "Net sales", "Pax", "Spend / pax", "Food cost", "Labor", "Net profit", "Margin"]}
            rows={branches.map((b) => [<Link key="l" href={`/dashboard?${new URLSearchParams({ preset, from: range.from, to: range.to, location: b.id, compare })}`} className="font-semibold underline underline-offset-4">{b.name}</Link>, formatPeso(b.netSales), b.pax.toLocaleString("en-PH"), b.avgPerPax === null ? "—" : formatPeso(b.avgPerPax), pct(b.foodCostPct), pct(b.laborCostPct), formatPeso(b.netProfit), pct(b.marginPct)])}
          />
        </section>
      )}

      <section aria-labelledby="inv" className="mt-8">
        <h2 id="inv" className="mb-3 text-2xl">
          Wings & stock
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SimpleTable
            head={["Branch", `Kg/pax ${range.to}`, "Kg/pax period", "Standard"]}
            rows={inv.perPax.map((p) => [p.name, p.todayKgPerPax ?? "—", p.periodKgPerPax ?? "—", p.standard ?? <Link key="s" href="/inventory/recipes" className="underline underline-offset-4">set it</Link>])}
            empty="No branches in view."
          />
          <SimpleTable head={["Top variances", "Date", "Variance"]} rows={inv.variances.map((v) => [`${v.item} · ${v.location}`, v.date, `${v.variancePct! > 0 ? "+" : ""}${v.variancePct}%`])} empty="No usage over tolerance." />
        </div>
      </section>
    </>
  );
}

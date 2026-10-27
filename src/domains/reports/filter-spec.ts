import "server-only";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/session";
import type { FilterSpec } from "@/components/reports/report-filters";
import { asOfOf, rangeOf, type ReportParams } from "./params";
import type { ReportDef } from "./registry";
import { SOURCE_LABEL } from "./ledger-reports";
import { statementAccountsFor } from "@/domains/banking/queries";

/** Builds the filter bar for a report from its declared filters. */
export async function filterSpecFor(def: ReportDef, user: CurrentUser, p: ReportParams): Promise<FilterSpec> {
  const spec: FilterSpec = {};
  const f = new Set(def.filters);
  if (f.has("range")) spec.range = rangeOf(p);
  if (f.has("asOf")) spec.asOf = asOfOf(p);
  if (f.has("location")) {
    const allowed = user.access.locationsWith(def.permission);
    spec.locations = user.locations.filter((l) => allowed.includes(l.id)).map((l) => ({ value: l.id, label: l.name }));
    spec.location = p.location ?? "all";
  }
  if (f.has("columns")) {
    spec.columns = {
      value: p.columns ?? (f.has("range") ? "locations" : "locations"),
      options: f.has("range")
        ? [
            { value: "locations", label: "By location" },
            { value: "months", label: "By month" },
          ]
        : [
            { value: "locations", label: "By location" },
            { value: "single", label: "Total only" },
          ],
    };
  }
  if (f.has("basis")) spec.basis = p.basis ?? "allocated";
  if (f.has("account")) {
    const accounts = await db.account.findMany({ where: { isPostable: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
    spec.accounts = accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
    spec.account = p.account;
  }
  if (f.has("source")) {
    spec.sources = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }));
    spec.source = p.source;
  }
  if (f.has("run")) {
    const runs = await db.payrollRun.findMany({ where: { status: { not: "VOIDED" } }, orderBy: { periodEnd: "desc" }, take: 48 });
    const label = (r: (typeof runs)[number]) => `${r.type === "THIRTEENTH_MONTH" ? "13th month " : ""}${r.periodStart.toISOString().slice(0, 10)} to ${r.periodEnd.toISOString().slice(0, 10)}${r.status === "DRAFT" ? " (draft)" : ""}`;
    spec.extra = [...(spec.extra ?? []), { param: "run", label: "Payroll", value: p.run ?? runs.find((r) => r.status === "POSTED")?.id ?? "", options: runs.map((r) => ({ value: r.id, label: label(r) })) }];
  }
  if (f.has("moneyAccount")) {
    const accounts = await statementAccountsFor(user, def.permission);
    spec.extra = [...(spec.extra ?? []), { param: "moneyAccount", label: "Account", value: p.moneyAccount ?? "", options: [{ value: "", label: "Choose…" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))] }];
  }
  return spec;
}

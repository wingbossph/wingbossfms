import "server-only";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/session";
import type { FilterSpec } from "@/components/reports/report-filters";
import { asOfOf, rangeOf, type ReportParams } from "./params";
import type { ReportDef } from "./registry";
import { SOURCE_LABEL } from "./ledger-reports";

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
  return spec;
}

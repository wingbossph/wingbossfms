import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import type { ReportDoc, ReportRow } from "./doc";
import { fmtDate, fmtRange } from "./params";

type Scope = { ids: string[]; label: string };

const GROUPS: [string, string, string[]][] = [
  ["basic", "Basic", ["BASIC", "LATE_UT", "ABSENCE"]],
  ["ot", "OT / ND", ["OT", "ND"]],
  ["premium", "Holiday / rest day", ["HOLIDAY", "RESTDAY"]],
  ["other", "Allowances & other", ["ALLOWANCE", "ALLOWANCE_TX", "SERVICE_CHARGE", "THIRTEENTH"]],
  ["gross", "Gross", []],
  ["sss", "SSS", ["SSS_EE"]],
  ["phic", "PhilHealth", ["PHIC_EE"]],
  ["hdmf", "Pag-IBIG", ["HDMF_EE"]],
  ["tax", "W/tax", ["WTAX"]],
  ["loans", "Loans", ["LOAN"]],
  ["net", "Net pay", []],
  ["er", "Employer share", ["SSS_ER", "SSS_EC", "PHIC_ER", "HDMF_ER"]],
];

/** Payroll register for one run, limited to the locations in scope. */
export async function payrollRegisterDoc(scope: Scope, runId: string): Promise<ReportDoc> {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { employee: true, items: true }, orderBy: [{ employee: { lastName: "asc" } }] } } });
  const rows: ReportRow[] = [];
  const totals: Record<string, bigint> = {};
  for (const l of run.lines) {
    const items = l.items.filter((i) => scope.ids.includes(i.locationId));
    if (!items.length) continue;
    const cells: Record<string, bigint | string | number> = { employee: `${l.employee.lastName}, ${l.employee.firstName}`, days: Number(l.daysWorked) };
    for (const [k, , codes] of GROUPS) if (codes.length) cells[k] = items.filter((i) => codes.includes(i.code)).reduce((a, i) => a + i.amountCents, 0n);
    cells.gross = items.filter((i) => i.kind === "EARNING").reduce((a, i) => a + i.amountCents, 0n);
    cells.net = (cells.gross as bigint) - items.filter((i) => i.kind === "DEDUCTION").reduce((a, i) => a + i.amountCents, 0n);
    for (const [k] of GROUPS) totals[k] = (totals[k] ?? 0n) + (cells[k] as bigint);
    rows.push({ cells });
  }
  rows.push({ cells: { employee: `Total (${rows.length})`, ...totals }, style: "total" });
  return {
    title: run.type === "THIRTEENTH_MONTH" ? "13th month register" : "Payroll register",
    subtitle: `${scope.label} · ${fmtRange(run.periodStart.toISOString().slice(0, 10), run.periodEnd.toISOString().slice(0, 10))} · pay date ${fmtDate(run.payDate.toISOString().slice(0, 10))}${run.status === "DRAFT" ? " · DRAFT" : run.status === "VOIDED" ? " · VOIDED" : ""}`,
    columns: [{ key: "employee", label: "Employee", kind: "text", width: 26 }, { key: "days", label: "Days", kind: "number" }, ...GROUPS.map(([key, label]) => ({ key, label, kind: "money" as const }))],
    rows,
  };
}

/** SSS / PhilHealth / Pag-IBIG / tax per employee for approved payrolls ending in the range. */
export async function remittancesDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const lines = await db.payrollLine.findMany({
    where: { run: { status: "POSTED", periodEnd: { gte: toDbDate(from), lte: toDbDate(to) } } },
    include: { employee: true, items: { where: { code: { in: ["SSS_EE", "SSS_ER", "SSS_EC", "PHIC_EE", "PHIC_ER", "HDMF_EE", "HDMF_ER", "WTAX"] }, locationId: { in: scope.ids } } } },
  });
  const byEmp = new Map<string, { name: string; ids: string; c: Record<string, bigint> }>();
  for (const l of lines) {
    if (!l.items.length) continue;
    const e = byEmp.get(l.employeeId) ?? { name: `${l.employee.lastName}, ${l.employee.firstName}`, ids: [l.employee.sssNo, l.employee.philhealthNo, l.employee.pagibigNo].map((x) => x ?? "—").join(" / "), c: {} };
    for (const i of l.items) e.c[i.code] = (e.c[i.code] ?? 0n) + i.amountCents;
    byEmp.set(l.employeeId, e);
  }
  const keys = ["SSS_EE", "SSS_ER", "SSS_EC", "PHIC_EE", "PHIC_ER", "HDMF_EE", "HDMF_ER", "WTAX"];
  const totals: Record<string, bigint> = {};
  const rows: ReportRow[] = [...byEmp.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      for (const k of keys) totals[k] = (totals[k] ?? 0n) + (e.c[k] ?? 0n);
      return { cells: { employee: e.name, ids: e.ids, ...Object.fromEntries(keys.map((k) => [k, e.c[k] ?? 0n])), sssTotal: (e.c.SSS_EE ?? 0n) + (e.c.SSS_ER ?? 0n) + (e.c.SSS_EC ?? 0n) } };
    });
  rows.push({ cells: { employee: "Total", ...totals, sssTotal: (totals.SSS_EE ?? 0n) + (totals.SSS_ER ?? 0n) + (totals.SSS_EC ?? 0n) }, style: "total" });
  return {
    title: "Government remittances",
    subtitle: `${scope.label} · payrolls ending ${fmtRange(from, to)}`,
    columns: [
      { key: "employee", label: "Employee", kind: "text", width: 24 },
      { key: "ids", label: "SSS / PhilHealth / Pag-IBIG no.", kind: "text", width: 30 },
      { key: "SSS_EE", label: "SSS EE", kind: "money" },
      { key: "SSS_ER", label: "SSS ER", kind: "money" },
      { key: "SSS_EC", label: "SSS EC", kind: "money" },
      { key: "sssTotal", label: "SSS total", kind: "money" },
      { key: "PHIC_EE", label: "PhilHealth EE", kind: "money" },
      { key: "PHIC_ER", label: "PhilHealth ER", kind: "money" },
      { key: "HDMF_EE", label: "Pag-IBIG EE", kind: "money" },
      { key: "HDMF_ER", label: "Pag-IBIG ER", kind: "money" },
      { key: "WTAX", label: "W/tax", kind: "money" },
    ],
    rows,
  };
}

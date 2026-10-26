import { manilaDateString } from "@/lib/dates";

export type ReportParams = Record<string, string | undefined>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function monthStart(ymd: string) {
  return `${ymd.slice(0, 7)}-01`;
}

export function monthEnd(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function dayBefore(ymd: string) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Date range from params, defaulting to this month to date. */
export function rangeOf(p: ReportParams) {
  const today = manilaDateString();
  const to = p.to && YMD.test(p.to) ? p.to : today;
  const from = p.from && YMD.test(p.from) ? p.from : monthStart(to);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function asOfOf(p: ReportParams) {
  return p.asOf && YMD.test(p.asOf) ? p.asOf : manilaDateString();
}

/** Calendar months covered by a range, at most 24. */
export function monthsIn(from: string, to: string): { key: string; label: string; from: string; to: string }[] {
  const out = [];
  let cur = monthStart(from);
  while (cur <= to && out.length < 24) {
    const end = monthEnd(cur);
    out.push({
      key: cur.slice(0, 7),
      label: new Date(`${cur}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      from: cur < from ? from : cur,
      to: end > to ? to : end,
    });
    cur = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return out;
}

export function fmtRange(from: string, to: string) {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
  return `${f(from)} – ${f(to)}`;
}

export function fmtDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

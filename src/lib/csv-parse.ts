import Papa from "papaparse";

/** Parses CSV text into header + row objects. Strips a UTF-8 BOM and blank lines. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.slice(0, 20).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

/** "Receipt number" → "receiptnumber" for tolerant header matching. */
export function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Finds the first header matching any of the normalized candidates. */
export function pickHeader(headers: readonly string[], ...candidates: string[]): string | undefined {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  for (const c of candidates) {
    const hit = byNorm.get(normHeader(c));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Parses a local date-time in common export formats as Asia/Manila time:
 * "2026-10-26 19:45", "2026-10-26T19:45:00", "10/26/2026 7:45 PM", "10/26/26 19:45", "26.10.2026 19:45".
 */
export function parseLocalDateTime(input: string, order: "MDY" | "DMY" = "MDY"): Date | null {
  const s = input.trim();
  let y: number, mo: number, d: number;
  let rest = "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ]?(.*)$/.exec(s);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    rest = m[4];
  } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})[ ,]*(.*)$/.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const dotted = s.includes(".");
    [mo, d] = order === "DMY" || dotted ? [b, a] : [a, b];
    rest = m[4];
  } else {
    return null;
  }
  let hh = 0;
  let mm = 0;
  let ss = 0;
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(rest.trim());
  if (t) {
    hh = Number(t[1]);
    mm = Number(t[2]);
    ss = Number(t[3] ?? 0);
    const ap = t[4]?.toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

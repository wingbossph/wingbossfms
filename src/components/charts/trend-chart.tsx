"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendSeries = { key: string; label: string };

const SERIES_VARS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One measure over time, one line per location (colors follow the location's
 * fixed slot, never its rank). Pesos and pax get separate charts: no dual axis.
 */
export function TrendChart({ data, series, format, height = 240, ariaLabel }: { data: Record<string, string | number>[]; series: TrendSeries[]; format: "peso" | "number"; height?: number; ariaLabel: string }) {
  const fmt = (v: number) => (format === "peso" ? `₱${v.toLocaleString("en-PH", { maximumFractionDigits: 0 })}` : v.toLocaleString("en-PH", { maximumFractionDigits: 1 }));
  const axis = (v: number) => (format === "peso" ? (Math.abs(v) >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`) : String(v));
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={axis} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--popover-foreground)", fontSize: 12 }}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v, name) => [fmt(Number(v)), name]}
          />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES_VARS[i % SERIES_VARS.length]} strokeWidth={2} dot={data.length <= 14 ? { r: 4, strokeWidth: 2, stroke: "var(--background)" } : false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

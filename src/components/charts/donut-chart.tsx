"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type DonutSlice = { label: string; value: number };

const SLICE_VARS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const OTHER = "var(--muted-foreground)";

const peso = (v: number) => `₱${v.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const compact = (v: number) => (Math.abs(v) >= 1_000_000 ? `₱${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `₱${(v / 1000).toFixed(1)}k` : peso(v));

/**
 * Share of a whole, at most five named slices plus "Other" (gray). The legend
 * beside it carries every amount and share as text, so nothing depends on color.
 */
export function DonutChart({ slices, ariaLabel, totalLabel = "Total" }: { slices: DonutSlice[]; ariaLabel: string; totalLabel?: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const color = (s: DonutSlice, i: number) => (s.label === "Other" ? OTHER : SLICE_VARS[i % SLICE_VARS.length]);
  return (
    <div className="grid gap-4">
      <div role="img" aria-label={ariaLabel} className="relative mx-auto size-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={slices.length > 1 ? 1.5 : 0} stroke="var(--background)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {slices.map((s, i) => (
                <Cell key={s.label} fill={color(s, i)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--popover-foreground)", fontSize: 12 }}
              formatter={(v, name) => [`${peso(Number(v))} · ${total > 0 ? ((Number(v) / total) * 100).toFixed(1) : "0"}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{totalLabel}</span>
          <span className="font-display text-2xl tabular-nums">{compact(total)}</span>
        </span>
      </div>
      <ul className="space-y-2 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color(s, i) }} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <strong>{peso(s.value)}</strong> <span className="text-muted-foreground">{total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

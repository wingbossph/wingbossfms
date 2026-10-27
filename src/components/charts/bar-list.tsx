import Link from "next/link";
import { formatPeso } from "@/lib/money";

export type BarItem = { label: string; cents: bigint; note?: string; href?: string };

/**
 * Horizontal magnitude bars, sorted by the caller, one hue. Every bar carries
 * its value and share as text, so nothing depends on color or hover.
 */
export function BarList({ items, total, ariaLabel }: { items: BarItem[]; total?: bigint; ariaLabel: string }) {
  const max = items.reduce((m, i) => (i.cents > m ? i.cents : m), 0n);
  const sum = total ?? items.reduce((a, i) => a + i.cents, 0n);
  return (
    <ul aria-label={ariaLabel} className="space-y-2">
      {items.map((i) => {
        const width = max > 0n && i.cents > 0n ? Math.max(1, Number((i.cents * 1000n) / max) / 10) : 0;
        const share = sum > 0n ? `${(Number((i.cents * 1000n) / sum) / 10).toFixed(1)}%` : "";
        const label = (
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums">
              <strong>{formatPeso(i.cents)}</strong> <span className="text-muted-foreground">{share}</span>
            </span>
          </span>
        );
        return (
          <li key={i.label} title={`${i.label}: ${formatPeso(i.cents)}${share ? ` (${share})` : ""}${i.note ? ` · ${i.note}` : ""}`}>
            {i.href ? (
              <Link href={i.href} className="block hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
            <span className="mt-1 block h-2 w-full rounded-sm bg-muted" aria-hidden>
              <span className="block h-2 rounded-sm" style={{ width: `${width}%`, background: "var(--chart-1)" }} />
            </span>
            {i.note && <span className="text-xs text-muted-foreground">{i.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

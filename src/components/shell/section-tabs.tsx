"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export type SectionTab = { href: string; label: string; count?: number };

/** Horizontal sub-navigation for a module (scrolls on phones). */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <nav aria-label="Section" className="no-print -mx-4 mb-6 overflow-x-auto border-b px-4 md:-mx-8 md:px-8">
      <ul className="flex gap-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active?.href === t.href ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground",
                active?.href === t.href && "border-foreground text-foreground",
              )}
            >
              {t.label}
              {!!t.count && <span className="rounded-full bg-destructive px-1.5 text-xs text-white">{t.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

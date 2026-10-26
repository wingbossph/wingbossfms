"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpen,
  Boxes,
  ChartColumn,
  Gauge,
  History,
  Home,
  Landmark,
  Receipt,
  Shield,
  Store,
  Tablet,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { NavSection } from "./nav-items";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  gauge: Gauge,
  receipt: Receipt,
  wallet: Wallet,
  banknote: Banknote,
  boxes: Boxes,
  truck: Truck,
  users: Users,
  landmark: Landmark,
  book: BookOpen,
  chart: ChartColumn,
  store: Store,
  "user-cog": UserCog,
  shield: Shield,
  tablet: Tablet,
  history: History,
};

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Home;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-sidebar-accent hover:text-white",
                      active && "bg-white text-black hover:bg-white hover:text-black",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.phase && (
                      <span className={cn("text-[10px] text-neutral-500", active && "text-neutral-600")}>
                        P{item.phase}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-6 py-5">
      <img src="/logo.svg" alt="" className="size-9" />
      <span className="font-display text-2xl tracking-wider text-white">WINGBOSS</span>
    </Link>
  );
}

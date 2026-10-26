"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { logout, setActiveLocation } from "@/domains/admin/auth-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brand, SidebarNav } from "./sidebar";
import type { NavSection } from "./nav-items";

type Props = {
  sections: NavSection[];
  userName: string;
  roleLabel: string;
  locations: { id: string; name: string }[];
  activeLocationId: string;
  pinned: boolean;
};

export function Topbar({ sections, userName, roleLabel, locations, activeLocationId, pinned }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-white hover:bg-sidebar-accent hover:text-white md:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <LocationSwitcher locations={locations} activeLocationId={activeLocationId} pinned={pinned} />

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2 text-white hover:bg-sidebar-accent hover:text-white">
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-sm sm:inline">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-semibold">{userName}</p>
              <p className="text-xs font-normal text-muted-foreground">{roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function LocationSwitcher({
  locations,
  activeLocationId,
  pinned,
}: {
  locations: { id: string; name: string }[];
  activeLocationId: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (pinned || locations.length <= 1) {
    return (
      <span className="truncate text-sm font-semibold uppercase tracking-wider">
        {locations[0]?.name ?? "No location"}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Location</span>
      <select
        value={activeLocationId}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await setActiveLocation(e.target.value);
            router.refresh();
          })
        }
        className="h-9 max-w-[60vw] rounded-md border border-sidebar-border bg-black px-2 font-semibold uppercase tracking-wider text-white"
      >
        <option value="all">All locations (consolidated)</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-white hover:bg-sidebar-accent hover:text-white"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

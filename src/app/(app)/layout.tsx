import { auth } from "@/auth";
import { Brand, SidebarNav } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { IdleLogout } from "@/components/shell/idle-logout";
import { visibleNav } from "@/components/shell/nav-items";
import { getActiveLocationId, requireUser } from "@/server/auth/session";
import { PASSWORD_IDLE_MINUTES } from "@/auth.config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const session = await auth();
  const sections = visibleNav((p) => user.access.canAnywhere(p));
  const activeLocationId = await getActiveLocationId(user);
  const idleMinutes =
    session?.idleUntil && session.method === "pin"
      ? Math.max(1, Math.round((session.idleUntil - Date.now()) / 60_000))
      : PASSWORD_IDLE_MINUTES;

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <Brand />
        <SidebarNav sections={sections} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          sections={sections}
          userName={user.name}
          roleLabel={user.roleNames.join(", ") || "No role"}
          locations={user.locations.map((l) => ({ id: l.id, name: l.name }))}
          activeLocationId={activeLocationId}
          pinned={user.method === "pin"}
        />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <IdleLogout minutes={idleMinutes} />
    </div>
  );
}

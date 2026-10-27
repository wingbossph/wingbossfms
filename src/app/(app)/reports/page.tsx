import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/server/auth/session";
import { REPORTS } from "@/domains/reports/registry";
import { redirect } from "next/navigation";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireUser();
  const visible = Object.entries(REPORTS).filter(([, d]) => user.access.canAnywhere(d.permission));
  if (visible.length === 0) redirect("/forbidden");
  const groups = [...new Set(visible.map(([, d]) => d.group))];
  return (
    <>
      <PageHeader title="Reports" description="Every report filters by location and period, compares side by side, and exports to Excel, PDF and CSV." />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-2xl">{g}</h2>
            {g === "Planning" && (
              <p className="mb-3 text-sm">
                <Link href="/reports/budget" className="underline underline-offset-4">
                  Set the monthly budget
                </Link>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible
                .filter(([, d]) => d.group === g)
                .map(([name, d]) => (
                  <Link key={name} href={`/reports/${name}`} className="rounded-lg border p-4 transition hover:border-foreground">
                    <p className="font-display text-xl tracking-wide">{d.title}</p>
                    <p className="text-sm text-muted-foreground">{d.description}</p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

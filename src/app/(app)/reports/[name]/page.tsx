import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { REPORTS, buildReport } from "@/domains/reports/registry";
import { filterSpecFor } from "@/domains/reports/filter-spec";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportView } from "@/components/reports/report-view";
import { UserFacingError } from "@/lib/errors";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: REPORTS[name]?.title ?? "Report" };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { name } = await params;
  const def = REPORTS[name];
  if (!def) notFound();
  if (!user.access.canAnywhere(def.permission)) redirect("/forbidden");
  const p = await searchParams;
  const [spec, result] = await Promise.all([
    filterSpecFor(def, user, p),
    buildReport(name, user, p).catch((e) => {
      if (e instanceof UserFacingError) return { error: e.message };
      throw e;
    }),
  ]);
  const query = new URLSearchParams(Object.entries(p).filter(([k]) => k !== "format")).toString();

  return (
    <>
      <p className="no-print mb-2 text-sm">
        <Link href="/reports" className="underline underline-offset-4">
          Reports
        </Link>{" "}
        / {def.group}
      </p>
      <ReportFilters spec={spec} />
      {"error" in result ? (
        <p className="rounded-md border border-warning p-4 text-sm">{result.error}</p>
      ) : (
        <ReportView doc={result.doc} exportBase={`/api/export/report/${name}${query ? `?${query}` : ""}`} />
      )}
    </>
  );
}

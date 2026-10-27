import { redirect } from "next/navigation";

/** An account's page is its general ledger report. */
export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = new URLSearchParams(await searchParams);
  sp.set("account", id);
  if (!sp.get("from")) {
    const to = sp.get("to") ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    sp.set("from", `${to.slice(0, 4)}-01-01`);
    sp.set("to", to);
  }
  redirect(`/reports/general-ledger?${sp.toString()}`);
}

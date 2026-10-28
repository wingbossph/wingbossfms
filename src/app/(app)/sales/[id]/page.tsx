import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate } from "@/lib/dates";
import { CONSOLIDATED_PRODUCT, drawerActivity, priceMap } from "@/domains/sales/service";
import { loyverseCheck, LOYVERSE_DISCOUNT_NOTE } from "@/domains/sales/loyverse/import";
import { SalesEditor } from "./sales-editor";
import { ShiftClose } from "./shift-close";
import { ReportActions } from "./report-actions";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Sales report" };

const s = (v: bigint) => v.toString();

export default async function SalesReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await db.salesReport.findUnique({
    where: { id },
    include: {
      location: true,
      lines: { include: { product: true }, orderBy: { product: { sortOrder: "asc" } } },
      discounts: true,
      voids: true,
      payments: true,
      cashCount: true,
    },
  });
  if (!report) notFound();
  const can = (p: string) => user.access.can(p, report.locationId);
  if (!can("sales:view") && !can("sales:create")) redirect("/forbidden");

  const ymd = report.businessDate.toISOString().slice(0, 10);
  const [products, prices, discountTypes, channels, activity, check, pendingRequest, cashier] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    priceMap(db, report.locationId, ymd),
    db.discountType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.paymentChannel.findMany({ where: { isActive: true, locations: { some: { locationId: report.locationId } } }, orderBy: { sortOrder: "asc" } }),
    drawerActivity(db, report.id),
    loyverseCheck(db, report.id),
    db.adjustmentRequest.findFirst({ where: { entityType: "SalesReport", entityId: report.id, status: "PENDING" } }),
    db.user.findUnique({ where: { id: report.cashierUserId }, select: { name: true } }),
  ]);

  const editable = report.status === "DRAFT" && can("sales:create");
  const statusLabel = report.status === "DRAFT" ? "Draft" : report.status === "POSTED" ? (report.approvedAt ? "Reviewed" : "Submitted") : report.status;

  return (
    <>
      <PageHeader
        title={`Sales · ${formatBusinessDate(report.businessDate)}`}
        description={`${report.location.name}${report.shiftNo > 1 ? ` · Shift ${report.shiftNo}` : ""} · Opened by ${cashier?.name ?? "—"}`}
        actions={
          <>
            <Badge variant={report.status === "DRAFT" ? "outline" : "default"} className="h-8 px-3 text-sm">
              {statusLabel}
            </Badge>
            <Link href="/sales" className="self-center text-sm underline underline-offset-4">
              All sales
            </Link>
          </>
        }
      />

      {check && (
        <div className={`mb-4 rounded-md border p-3 text-sm ${check.differenceCents === 0n ? "" : "border-warning bg-warning/10"}`}>
          Loyverse check: {check.receipts} receipts, net {formatPeso(check.loyverseNetCents)} · this report {formatPeso(check.reportNetCents)}
          {check.differenceCents === 0n ? " · matches ✓" : ` · difference ${formatPeso(check.differenceCents)}`}
        </div>
      )}
      {pendingRequest && (
        <div className="mb-4 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          Correction requested: “{pendingRequest.reason}”. Waiting for an admin to reopen this report.
        </div>
      )}

      <SalesEditor
        editable={editable}
        report={{
          id: report.id,
          updatedAt: report.updatedAt.toISOString(),
          serviceCharge: formatPeso(report.serviceChargeCents, { symbol: false }),
          mismatchExplanation: report.mismatchExplanation ?? "",
          importedLines: report.lines
            .filter((l) => l.source !== "MANUAL")
            .map((l) => ({ name: l.product.name, qty: l.qty.toString(), grossCents: s(l.grossCents), paxHundredths: s(BigInt(Math.round(Number(l.pax) * 100))) })),
          manualLines: Object.fromEntries(report.lines.filter((l) => l.source === "MANUAL" && l.product.name !== CONSOLIDATED_PRODUCT).map((l) => [l.productId, l.qty.toString()])),
          consolidated: (() => {
            const l = report.lines.find((x) => x.source === "MANUAL" && x.product.name === CONSOLIDATED_PRODUCT);
            return l ? { gross: formatPeso(l.grossCents, { symbol: false }), pax: Number(l.pax).toString() } : null;
          })(),
          discounts: report.discounts.map((d) => ({
            discountTypeId: d.discountTypeId,
            amount: formatPeso(d.amountCents, { symbol: false }),
            customerName: d.customerName ?? "",
            idNumber: d.idNumber ?? "",
            receiptNo: d.receiptNo ?? "",
            notes: d.notes ?? "",
            imported: d.notes === LOYVERSE_DISCOUNT_NOTE,
          })),
          voids: report.voids.map((v) => ({ amount: formatPeso(v.amountCents, { symbol: false }), isRefund: v.isRefund, reason: v.reason, receiptNo: v.receiptNo ?? "" })),
          payments: Object.fromEntries(report.payments.map((p) => [p.channelId, { amount: formatPeso(p.amountCents, { symbol: false }), reference: p.reference ?? "" }])),
        }}
        products={products.filter((p) => p.name !== CONSOLIDATED_PRODUCT).map((p) => ({ id: p.id, name: p.name, type: p.type, priceCents: s(prices.get(p.id) ?? 0n), paxPerUnit: p.paxPerUnit.toString() }))}
        discountTypes={discountTypes.map((d) => ({ id: d.id, name: d.name, rateBp: d.defaultRateBp, requiresIdentity: d.requiresIdentity }))}
        channels={channels.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
      />

      {report.status === "POSTED" && (
        <ShiftClose
          reportId={report.id}
          canCount={can("cash:count")}
          floatCents={s(report.location.drawerFloatCents)}
          cashSalesCents={s(activity.cashSalesCents)}
          cashExpensesCents={s(activity.cashExpensesCents)}
          closed={
            report.cashCount
              ? {
                  expected: formatPeso(report.cashCount.expectedCents),
                  counted: formatPeso(report.cashCount.countedCents),
                  overShortCents: s(report.cashCount.overShortCents),
                  overShort: formatPeso(report.cashCount.overShortCents),
                  reason: report.cashCount.reason ?? "",
                }
              : null
          }
        />
      )}

      <ReportActions
        reportId={report.id}
        status={report.status}
        reviewed={!!report.approvedAt}
        canReview={can("sales:approve")}
        canRequest={can("adjustments:request") && !pendingRequest}
        canReopen={can("adjustments:approve")}
        hasCashCount={!!report.cashCount}
      />
    </>
  );
}

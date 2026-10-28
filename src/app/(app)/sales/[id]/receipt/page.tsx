import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate, formatDateTime } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { PrintOnLoad } from "@/components/shell/print-on-load";

export const metadata = { title: "Shift close slip" };

/** 80 mm thermal slip for the shift close. */
export default async function ShiftSlip({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await db.salesReport.findUnique({
    where: { id },
    include: { location: true, cashCount: true, payments: { include: { channel: true } } },
  });
  if (!r || !r.cashCount) notFound();
  if (!user.access.can("sales:view", r.locationId) && !user.access.can("cash:count", r.locationId)) redirect("/forbidden");
  const cc = r.cashCount;
  const counter = await db.user.findUnique({ where: { id: cc.countedById }, select: { name: true } });
  const bills = cc.denominations as Record<string, number | string>;

  const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );

  return (
    <div className="thermal mx-auto w-[72mm] bg-white p-2 font-mono text-[11px] leading-tight text-black">
      <PrintOnLoad />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.png" alt="" className="mx-auto mb-1 h-14 w-auto" />
      <p className="text-center text-base font-bold">WINGBOSS</p>
      <p className="text-center">{r.location.name}</p>
      <p className="text-center">SHIFT CLOSE · {formatBusinessDate(r.businessDate)}{r.shiftNo > 1 ? ` · S${r.shiftNo}` : ""}</p>
      <hr className="my-1 border-dashed border-black" />
      <Row k="Net sales" v={formatPeso(r.netCents)} bold />
      <Row k="Pax" v={Number(r.pax).toString()} />
      {r.payments.map((p) => (
        <Row key={p.id} k={`  ${p.channel.name}`} v={formatPeso(p.amountCents)} />
      ))}
      <hr className="my-1 border-dashed border-black" />
      <Row k="Opening float" v={formatPeso(cc.openingFloatCents)} />
      <Row k="+ Cash sales" v={formatPeso(cc.cashSalesCents)} />
      <Row k="− Cash expenses" v={formatPeso(cc.cashExpensesCents)} />
      {cc.otherCashInCents > 0n && <Row k="+ Other in" v={formatPeso(cc.otherCashInCents)} />}
      {cc.otherCashOutCents > 0n && <Row k="− Other out" v={formatPeso(cc.otherCashOutCents)} />}
      <Row k="Expected" v={formatPeso(cc.expectedCents)} bold />
      <hr className="my-1 border-dashed border-black" />
      {Object.entries(bills)
        .filter(([k, v]) => k !== "coinsCents" && Number(v) > 0)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([k, v]) => (
          <Row key={k} k={`₱${k} × ${v}`} v={formatPeso(BigInt(Number(k) * Number(v) * 100))} />
        ))}
      {bills.coinsCents && BigInt(String(bills.coinsCents)) > 0n && <Row k="Coins" v={formatPeso(BigInt(String(bills.coinsCents)))} />}
      <Row k="Counted" v={formatPeso(cc.countedCents)} bold />
      <Row k={cc.overShortCents < 0n ? "SHORT" : cc.overShortCents > 0n ? "OVER" : "Over/short"} v={formatPeso(cc.overShortCents)} bold />
      {cc.reason && <p className="mt-1">Reason: {cc.reason}</p>}
      <hr className="my-1 border-dashed border-black" />
      <p>Counted by: {counter?.name}</p>
      <p>{formatDateTime(cc.countedAt)}</p>
      <p className="mt-6">Signature: ____________________</p>
    </div>
  );
}

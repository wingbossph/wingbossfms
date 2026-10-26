"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/forms/use-action";
import { receiveTransferAction } from "@/domains/inventory/actions";

type Line = { id: string; name: string; unit: string; sent: string };

export function ReceiveForm({ transferId, today, lines }: { transferId: string; today: string; lines: Line[] }) {
  const router = useRouter();
  const [got, setGot] = useState<Record<string, { qty: string; reason: string }>>(Object.fromEntries(lines.map((l) => [l.id, { qty: l.sent, reason: "" }])));
  const receive = useAction(receiveTransferAction, { onSuccess: () => router.refresh() });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        receive.run({ transferId, date: today, lines: lines.map((l) => ({ lineId: l.id, qty: got[l.id].qty || "0", reason: got[l.id].reason || undefined })) });
      }}
    >
      <h2 className="text-2xl">Confirm what arrived</h2>
      <div className="divide-y rounded-lg border">
        {lines.map((l) => {
          const v = got[l.id];
          const short = Number(v.qty || 0) !== Number(l.sent);
          return (
            <div key={l.id} className="space-y-2 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="flex-1">
                  <span className="block font-semibold">{l.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Sent {l.sent} {l.unit}
                  </span>
                </span>
                <Input inputMode="decimal" value={v.qty} onChange={(e) => setGot((g) => ({ ...g, [l.id]: { ...v, qty: e.target.value } }))} className="h-12 w-24 text-center text-lg" aria-label={`${l.name} received`} />
                <span className="w-8 text-sm text-muted-foreground">{l.unit}</span>
              </div>
              {short && (
                <Input placeholder="What happened? (required)" value={v.reason} onChange={(e) => setGot((g) => ({ ...g, [l.id]: { ...v, reason: e.target.value } }))} aria-label={`Reason for ${l.name} difference`} />
              )}
            </div>
          );
        })}
      </div>
      <Button type="submit" className="h-12 w-full text-base sm:w-auto sm:px-8" disabled={receive.pending}>
        {receive.pending ? "Saving…" : "Confirm received"}
      </Button>
    </form>
  );
}

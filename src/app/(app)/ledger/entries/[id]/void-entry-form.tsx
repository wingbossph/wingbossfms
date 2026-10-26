"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/forms/use-action";
import { voidEntryAction } from "@/domains/ledger/actions";

export function VoidEntryForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const v = useAction(voidEntryAction, { onSuccess: () => router.refresh() });
  return (
    <details className="max-w-md rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-destructive">Void this entry (Owner)</summary>
      <p className="my-2 text-xs text-muted-foreground">Posts an exact reversing entry. If the original month is closed, the reversal is dated today.</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason for voiding" />
      <Button variant="destructive" className="mt-2" disabled={v.pending} onClick={() => confirm("Void this entry?") && v.run({ entryId, reason })}>
        Void entry
      </Button>
    </details>
  );
}

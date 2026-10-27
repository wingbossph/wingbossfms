"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms/use-action";
import { syncLoyverseAction } from "@/domains/sales/actions";

export function SyncButton({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const sync = useAction(syncLoyverseAction, { onSuccess: () => router.refresh() });
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map((l) => (
        <Button key={l.id} variant="outline" disabled={sync.pending} onClick={() => sync.run(l.id)}>
          {sync.pending ? "Syncing…" : `Sync ${l.name} from Loyverse now`}
        </Button>
      ))}
    </div>
  );
}

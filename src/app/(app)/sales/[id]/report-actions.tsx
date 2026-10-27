"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/forms/use-action";
import { markReviewedAction, reopenReportAction, requestCorrectionAction } from "@/domains/sales/actions";

export function ReportActions(props: {
  reportId: string;
  status: string;
  reviewed: boolean;
  canReview: boolean;
  canRequest: boolean;
  canReopen: boolean;
  hasCashCount: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"request" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const done = () => {
    setMode(null);
    setReason("");
    router.refresh();
  };
  const review = useAction(markReviewedAction, { onSuccess: done });
  const request = useAction(requestCorrectionAction, { onSuccess: done });
  const reopen = useAction(reopenReportAction, { onSuccess: done });

  if (props.status !== "POSTED") return null;

  return (
    <section className="no-print mt-10 space-y-3 border-t pt-6">
      <div className="flex flex-wrap gap-2">
        {props.canReview && !props.reviewed && (
          <Button variant="outline" disabled={review.pending} onClick={() => review.run(props.reportId)}>
            Mark as reviewed
          </Button>
        )}
        {props.canReopen ? (
          <Button variant="outline" onClick={() => setMode("reopen")}>
            Reopen for correction
          </Button>
        ) : (
          props.canRequest && (
            <Button variant="outline" onClick={() => setMode("request")}>
              Request a correction
            </Button>
          )
        )}
      </div>
      {mode && (
        <form
          className="max-w-xl space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            (mode === "reopen" ? reopen : request).run({ reportId: props.reportId, reason });
          }}
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" aria-label="Reason" required minLength={5} />
          <p className="text-xs text-muted-foreground">
            {mode === "reopen"
              ? `Reopening reverses the sales posting${props.hasCashCount ? " and the shift close" : ""} and returns the report to draft. Everything is kept in the audit log.`
              : "An admin or the Owner will review the request and reopen the report."}
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={reopen.pending || request.pending}>
              {mode === "reopen" ? "Reopen report" : "Send request"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

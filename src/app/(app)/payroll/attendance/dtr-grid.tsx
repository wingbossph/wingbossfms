"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { PhotoInput, type UploadedFile } from "@/components/forms/photo-input";
import { useAction } from "@/components/forms/use-action";
import { saveAttendanceAction, setSheetStatusAction } from "@/domains/payroll/actions";
import { parseDtrCell, type Schedule } from "@/domains/payroll/dtr";
import { cn } from "cn";

type Row = { employeeId: string; name: string; cells: Record<string, string>; elsewhere: Record<string, string> };

const prevStart = (start: string) => {
  const d = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000);
  return d.getUTCDate() > 15 ? `${d.toISOString().slice(0, 8)}16` : `${d.toISOString().slice(0, 8)}01`;
};
const nextStart = (end: string) => new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DtrGrid(props: {
  locations: { id: string; name: string }[];
  locationId: string;
  start: string;
  end: string;
  dates: string[];
  holidays: Record<string, { name: string; type: string }>;
  rows: Row[];
  others: Row[];
  status: string;
  sheetId: string | null;
  canEdit: boolean;
  canApprove: boolean;
  schedule: Schedule;
  files: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState<Row[]>(props.rows);
  const [addId, setAddId] = useState("");
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [dirty, setDirty] = useState(false);
  const locked = props.status !== "DRAFT" || !props.canEdit;
  const save = useAction(saveAttendanceAction, {
    onSuccess: () => {
      setDirty(false);
      setPhotos([]);
      router.refresh();
    },
  });
  const status = useAction(setSheetStatusAction, { onSuccess: () => router.refresh() });
  const go = (q: Record<string, string>) => router.push(`${pathname}?${new URLSearchParams({ location: props.locationId, start: props.start, ...q })}`);

  const errors = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of rows) for (const [d, v] of Object.entries(r.cells)) {
      const p = parseDtrCell(v, props.schedule);
      if (p && "error" in p) out.set(`${r.employeeId}|${d}`, p.error);
    }
    return out;
  }, [rows, props.schedule]);

  const setCell = (employeeId: string, date: string, v: string) => {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.employeeId === employeeId ? { ...r, cells: { ...r.cells, [date]: v } } : r)));
  };
  const fill = (only?: string) => {
    setDirty(true);
    setRows((rs) =>
      rs.map((r) =>
        only && r.employeeId !== only
          ? r
          : { ...r, cells: Object.fromEntries(props.dates.map((d) => [d, r.cells[d] || (r.elsewhere[d] ? "" : props.holidays[d]?.type === "REGULAR" ? "H" : "P")])) },
      ),
    );
  };
  const present = (r: Row) => Object.values(r.cells).filter((v) => /^(P|RW|\d)/i.test(v.trim())).length;

  return (
    <div className="space-y-4 pb-24">
      <div className="no-print flex flex-wrap items-end gap-3">
        {props.locations.length > 1 && (
          <Field id="dl" label="Location">
            <select id="dl" className={selectClass} value={props.locationId} onChange={(e) => go({ location: e.target.value })}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => go({ start: prevStart(props.start) })} aria-label="Previous cut-off">
            ←
          </Button>
          <span className="font-semibold">
            {props.start} to {props.end}
          </span>
          <Button variant="outline" onClick={() => go({ start: nextStart(props.end) })} aria-label="Next cut-off">
            →
          </Button>
        </div>
        <span className={cn("rounded px-2 py-1 text-sm", props.status === "DRAFT" ? "bg-warning/30" : "bg-success/20")}>{props.status === "DRAFT" ? "Draft" : "Approved"}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="sticky left-0 z-10 min-w-44 bg-muted p-2 text-left">Employee</th>
              {props.dates.map((d) => {
                const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                const h = props.holidays[d];
                return (
                  <th key={d} className={cn("min-w-16 p-1 text-center font-medium", wd === 0 && "bg-muted", h && "bg-warning/30")} title={h ? `${h.name} (${h.type.replaceAll("_", " ").toLowerCase()})` : undefined}>
                    {WD[wd]}
                    <br />
                    {Number(d.slice(8))}
                    {h ? <span className="block text-[10px]">{h.type === "REGULAR" ? "Reg hol" : h.type === "SPECIAL_NON_WORKING" ? "Special" : "Sp work"}</span> : null}
                  </th>
                );
              })}
              <th className="p-2">Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t">
                <td className="sticky left-0 z-10 bg-background p-2">
                  <div className="font-medium">{r.name}</div>
                  {!locked && (
                    <button type="button" className="text-xs underline underline-offset-2" onClick={() => fill(r.employeeId)}>
                      Fill blanks with P
                    </button>
                  )}
                </td>
                {props.dates.map((d) => {
                  const err = errors.get(`${r.employeeId}|${d}`);
                  if (r.elsewhere[d]) return <td key={d} className="p-1 text-center text-xs text-muted-foreground">@{r.elsewhere[d]}</td>;
                  return (
                    <td key={d} className="p-0.5">
                      <Input
                        value={r.cells[d] ?? ""}
                        onChange={(e) => setCell(r.employeeId, d, e.target.value)}
                        disabled={locked}
                        title={err}
                        aria-label={`${r.name} ${d}`}
                        aria-invalid={!!err}
                        className={cn("h-9 w-16 px-1 text-center font-mono text-xs uppercase", err && "border-destructive")}
                      />
                    </td>
                  );
                })}
                <td className="p-2 text-center font-semibold">{present(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={props.dates.length + 2} className="p-6 text-center text-muted-foreground">
                  No employees assigned here. Add them in Employees, or add a floating employee below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {errors.size > 0 && <p className="text-sm text-destructive">{[...errors.values()][0]}</p>}

      {!locked && (
        <div className="no-print flex flex-wrap items-end gap-3">
          <Button variant="outline" onClick={() => fill()}>
            Fill all blanks with P
          </Button>
          {props.others.length > 0 && (
            <>
              <select className={selectClass + " w-auto"} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Add employee from another location">
                <option value="">Add someone who worked here…</option>
                {props.others.map((o) => (
                  <option key={o.employeeId} value={o.employeeId}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={!addId}
                onClick={() => {
                  const o = props.others.find((x) => x.employeeId === addId);
                  if (o) setRows((rs) => [...rs, o]);
                  setAddId("");
                }}
              >
                Add
              </Button>
            </>
          )}
        </div>
      )}

      <div className="no-print space-y-2">
        <p className="text-sm font-semibold">Signed DTR photo</p>
        {props.files.map((f) => (
          <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block text-sm underline underline-offset-4">
            {f.name}
          </a>
        ))}
        {!locked && <PhotoInput locationId={props.locationId} value={photos} onChange={(v) => (setPhotos(v), setDirty(true))} label="Add DTR photo" />}
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64 md:px-8">
        {!locked && (
          <Button
            className="h-11 px-8"
            disabled={save.pending || errors.size > 0}
            onClick={() => save.run({ locationId: props.locationId, periodStart: props.start, rows: rows.map((r) => ({ employeeId: r.employeeId, cells: Object.fromEntries(props.dates.filter((d) => !r.elsewhere[d]).map((d) => [d, r.cells[d] ?? ""])) })), attachmentIds: photos.map((p) => p.id) })}
          >
            {save.pending ? "Saving…" : "Save DTR"}
          </Button>
        )}
        {props.canApprove && props.sheetId && props.status === "DRAFT" && (
          <Button variant="outline" className="h-11" disabled={dirty || status.pending} onClick={() => status.run({ sheetId: props.sheetId!, status: "APPROVED" })} title={dirty ? "Save first" : undefined}>
            Approve DTR
          </Button>
        )}
        {props.canApprove && props.sheetId && props.status !== "DRAFT" && (
          <Button variant="outline" className="h-11" disabled={status.pending} onClick={() => status.run({ sheetId: props.sheetId!, status: "DRAFT" })}>
            Reopen for edits
          </Button>
        )}
        {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Delete } from "lucide-react";
import { pinLogin } from "@/domains/admin/auth-actions";
import { Button } from "@/components/ui/button";

type Staff = { id: string; name: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinPad({ staff, next }: { staff: Staff[]; next: string }) {
  const [selected, setSelected] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState(pinLogin, null);

  if (!selected) {
    return (
      <div className="space-y-3">
        <h1 className="text-center text-2xl">Who&apos;s working?</h1>
        <div className="grid grid-cols-2 gap-3">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="touch-target rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-5 text-lg font-semibold hover:border-white focus-visible:outline-2 focus-visible:outline-white"
            >
              {s.name}
            </button>
          ))}
        </div>
        {staff.length === 0 && (
          <p className="text-center text-sm text-neutral-400">No staff with a PIN are assigned to this location.</p>
        )}
      </div>
    );
  }

  const press = (k: string) => setPin((p) => (p.length < 6 ? p + k : p));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={selected.id} />
      <input type="hidden" name="pin" value={pin} />
      <input type="hidden" name="next" value={next} />
      <div className="text-center">
        <p className="text-lg font-semibold">{selected.name}</p>
        <div className="mt-3 flex justify-center gap-3" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`size-4 rounded-full border border-white ${i < pin.length ? "bg-white" : ""}`}
            />
          ))}
        </div>
      </div>
      {state?.message && (
        <p role="alert" className="text-center text-sm text-red-400">
          {state.message}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <PadKey key={k} onClick={() => press(k)}>
            {k}
          </PadKey>
        ))}
        <PadKey
          onClick={() => {
            setSelected(null);
            setPin("");
          }}
          className="text-sm"
        >
          Back
        </PadKey>
        <PadKey onClick={() => press("0")}>0</PadKey>
        <PadKey onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete digit">
          <Delete className="size-6" />
        </PadKey>
      </div>
      <Button
        type="submit"
        disabled={pin.length < 4 || pending}
        className="h-14 w-full bg-white text-lg text-black hover:bg-neutral-200"
      >
        {pending ? "Checking…" : "Enter"}
      </Button>
    </form>
  );
}

function PadKey({
  children,
  onClick,
  className = "",
  ...rest
}: { children: React.ReactNode; onClick: () => void; className?: string } & React.AriaAttributes) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-16 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 text-2xl font-semibold active:bg-neutral-800 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

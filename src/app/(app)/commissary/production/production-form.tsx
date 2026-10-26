"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { recordProductionAction } from "@/domains/inventory/actions";

type Option = { id: string; name: string };
type Recipe = { id: string; name: string; unit: string; yield: string; lines: { itemId: string; name: string; unit: string; qty: string }[] };

const round4 = (n: number) => String(Math.round(n * 10_000) / 10_000);

export function ProductionForm(props: { today: string; locations: Option[]; defaultLocationId: string; recipes: Recipe[] }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(props.defaultLocationId);
  const [recipeId, setRecipeId] = useState(props.recipes[0].id);
  const recipe = props.recipes.find((r) => r.id === recipeId)!;
  const [output, setOutput] = useState(recipe.yield);
  const [actual, setActual] = useState<Record<string, string>>({});
  const [date, setDate] = useState(props.today);
  const [lot, setLot] = useState("");
  const [expires, setExpires] = useState("");
  const factor = Number(output || 0) / Number(recipe.yield || 1);
  const record = useAction(recordProductionAction, {
    onSuccess: () => {
      setActual({});
      setLot("");
      router.refresh();
    },
  });

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        record.run({
          locationId,
          recipeId,
          date,
          outputQty: output,
          lotCode: lot,
          expiresOn: expires,
          inputs: Object.entries(actual)
            .filter(([, v]) => v !== "")
            .map(([itemId, qty]) => ({ itemId, qty })),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="pr" label="Recipe">
          <select
            id="pr"
            className={`${selectClass} h-12`}
            value={recipeId}
            onChange={(e) => {
              const r = props.recipes.find((x) => x.id === e.target.value)!;
              setRecipeId(r.id);
              setOutput(r.yield);
              setActual({});
            }}
          >
            {props.recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="po" label={`Made (${recipe.unit})`} hint={`One batch makes ${recipe.yield} ${recipe.unit}.`}>
          <Input id="po" inputMode="decimal" className="h-12 text-lg" value={output} onChange={(e) => setOutput(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        {props.locations.length > 1 && (
          <Field id="pl" label="Where">
            <select id="pl" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="pd" label="Date">
          <Input id="pd" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="plot" label="Lot code (optional)">
          <Input id="plot" value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <Field id="pexp" label="Use by (optional)">
          <Input id="pexp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
      </div>
      <div>
        <h2 className="mb-1 text-lg font-semibold">Ingredients used</h2>
        <p className="mb-2 text-xs text-muted-foreground">Standard amounts are filled in. Change one only if you used a different amount.</p>
        <div className="divide-y rounded-lg border">
          {recipe.lines.map((l) => (
            <div key={l.itemId} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 font-medium">{l.name}</span>
              <Input
                inputMode="decimal"
                className="h-10 w-28 text-center"
                placeholder={round4(Number(l.qty) * factor)}
                value={actual[l.itemId] ?? ""}
                onChange={(e) => setActual((a) => ({ ...a, [l.itemId]: e.target.value.replace(/[^\d.]/g, "") }))}
                aria-label={`${l.name} used in ${l.unit}`}
              />
              <span className="w-8 text-xs text-muted-foreground">{l.unit}</span>
            </div>
          ))}
        </div>
      </div>
      <Button type="submit" className="h-12 w-full text-base sm:w-auto sm:px-8" disabled={record.pending || !(Number(output) > 0)}>
        {record.pending ? "Saving…" : "Record batch"}
      </Button>
    </form>
  );
}

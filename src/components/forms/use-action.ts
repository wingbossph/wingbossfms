"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/server/action";

/**
 * Runs a server action that takes a plain object, toasts the result, and keeps
 * field errors for inline display.
 */
export function useAction<TInput>(
  action: (input: TInput) => Promise<ActionState>,
  opts: { onSuccess?: (state: ActionState) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>(null);

  function run(input: TInput) {
    startTransition(async () => {
      const result = await action(input);
      setState(result);
      if (result?.ok) {
        if (result.message) toast.success(result.message);
        opts.onSuccess?.(result);
      } else if (result?.message) {
        toast.error(result.message);
      }
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name]?.[0];

  return { run, pending, state, fieldError };
}

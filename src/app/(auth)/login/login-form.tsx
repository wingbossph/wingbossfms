"use client";

import { useActionState } from "react";
import { passwordLogin } from "@/domains/admin/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(passwordLogin, null);

  return (
    <form action={action} className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-6">
      <h1 className="text-2xl">Log in</h1>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">Email or username</Label>
        <Input
          id="email"
          name="email"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          required
          className="h-11 border-neutral-700 bg-black text-white"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 border-neutral-700 bg-black text-white"
        />
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-red-400">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full bg-white text-black hover:bg-neutral-200">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}

import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError } from "@/server/auth/session";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
} | null;

/** Turns thrown errors into a form-friendly result. Redirects still propagate. */
export async function handleAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: z.flattenError(e).fieldErrors };
    }
    if (e instanceof AuthorizationError) return { ok: false, message: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "value";
      return { ok: false, message: `That ${target} is already in use.` };
    }
    if (e instanceof UserFacingError) return { ok: false, message: e.message };
    // Let Next.js handle redirect()/notFound() control flow.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

/** An error whose message is safe to show the user as-is. */
export class UserFacingError extends Error {}

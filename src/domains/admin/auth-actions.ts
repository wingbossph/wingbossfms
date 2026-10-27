"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import type { ActionState } from "@/server/action";
import { ALL_LOCATIONS, getCurrentUser, LOCATION_COOKIE } from "@/server/auth/session";

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only same-site relative paths.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function messageFor(error: AuthError): string {
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  if (code === "too_many_attempts") return "Too many failed attempts. Wait 15 minutes and try again.";
  if (code === "device_not_registered") return "This device isn't registered for PIN login.";
  return "Incorrect login details.";
}

export async function passwordLogin(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("password", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeNext(formData.get("next")),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: messageFor(e) };
    throw e;
  }
}

export async function pinLogin(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("pin", {
      userId: formData.get("userId"),
      pin: formData.get("pin"),
      redirectTo: safeNext(formData.get("next")),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: messageFor(e) };
    throw e;
  }
}

export async function logout() {
  const session = await auth();
  await signOut({ redirectTo: session?.method === "pin" ? "/pin" : "/login" });
}

/** Top-bar location switcher. The value is re-validated on every read. */
export async function setActiveLocation(locationId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const valid = locationId === ALL_LOCATIONS || user.locations.some((l) => l.id === locationId);
  if (!valid) return;
  (await cookies()).set(LOCATION_COOKIE, locationId, { httpOnly: true, sameSite: "lax", path: "/" });
}

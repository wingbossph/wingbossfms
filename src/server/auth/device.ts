import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";

// A shared branch tablet/phone is registered once by an admin. It then carries
// a long-lived httpOnly cookie. PIN login is only accepted with a valid device
// cookie, and the session is pinned to the device's location.

export const DEVICE_COOKIE = "wb_device";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function setDeviceCookie(token: string) {
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
}

export async function clearDeviceCookie() {
  (await cookies()).delete(DEVICE_COOKIE);
}

/** The registered, non-revoked device for a raw cookie token, or null. */
export async function findDeviceByToken(token: string | undefined | null) {
  if (!token) return null;
  const device = await db.device.findUnique({
    where: { tokenHash: hashDeviceToken(token) },
    include: { location: true },
  });
  if (!device || device.revokedAt || !device.location.isActive) return null;
  return device;
}

/** The device this browser is registered as, if any. */
export async function currentDevice() {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return findDeviceByToken(token);
}

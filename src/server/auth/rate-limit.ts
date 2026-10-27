import "server-only";
import { db } from "@/server/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IDENTIFIER = 5;
const MAX_FAILURES_PER_IP = 30;

/** True when too many failed logins were recorded recently for this identifier or IP. */
export async function isLoginBlocked(identifier: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byIdentifier, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { identifier, success: false, at: { gte: since } } }),
    ip
      ? db.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } })
      : Promise.resolve(0),
  ]);
  return byIdentifier >= MAX_FAILURES_PER_IDENTIFIER || byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(args: {
  identifier: string;
  ip: string | null;
  userId: string | null;
  success: boolean;
}) {
  await db.loginAttempt.create({ data: args });
}

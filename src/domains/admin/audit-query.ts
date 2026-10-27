import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { scopeLocations, type CurrentUser } from "@/server/auth/session";
import { manilaDayEnd, manilaDayStart } from "@/lib/dates";

export type AuditFilters = {
  from?: string;
  to?: string;
  location?: string;
  category?: string; // entity type
  action?: string;
  user?: string;
  entityId?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const AUDIT_ACTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "VOID",
  "POST",
  "CLOSE_PERIOD",
  "REOPEN_PERIOD",
  "LOGIN",
  "LOGOUT",
  "EXPORT",
  "IMPORT",
];

/** Where-clause for the audit log, limited to what the user may see. */
export function auditWhere(user: CurrentUser, f: AuditFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (!user.isOwner || f.location) {
    // Non-owners only see entries for their locations, never global ones (users, roles).
    and.push({ locationId: { in: scopeLocations(user, "audit:view", f.location) } });
  }
  if (f.from && YMD.test(f.from)) and.push({ at: { gte: manilaDayStart(f.from) } });
  if (f.to && YMD.test(f.to)) and.push({ at: { lt: manilaDayEnd(f.to) } });
  if (f.category) and.push({ entityType: f.category });
  if (f.action && (AUDIT_ACTIONS as string[]).includes(f.action)) and.push({ action: f.action as AuditAction });
  if (f.user) and.push({ userId: f.user });
  if (f.entityId) and.push({ entityId: f.entityId });

  return { AND: and };
}

export async function queryAudit(user: CurrentUser, f: AuditFilters, take: number) {
  return db.auditLog.findMany({
    where: auditWhere(user, f),
    include: { user: { select: { name: true } }, location: { select: { code: true, name: true } } },
    orderBy: { at: "desc" },
    take,
  });
}

/** "amount: 1500 → 1800; status: DRAFT → APPROVED" */
export function describeChange(before: unknown, after: unknown): string {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const fmt = (v: unknown) => (v === undefined ? "–" : typeof v === "string" ? v : JSON.stringify(v));
  return keys
    .map((k) => (k in b ? `${k}: ${fmt(b[k])} → ${fmt(a[k])}` : `${k}: ${fmt(a[k])}`))
    .join("; ");
}

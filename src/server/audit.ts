import "server-only";
import { headers } from "next/headers";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";

/** Makes Prisma values JSON-safe (BigInt → string, Decimal → string, Date → ISO). */
export function toAuditJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toAuditJson);
  if (typeof value === "object") {
    // Prisma Decimal
    if ("toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") {
      return (value as { toString(): string }).toString();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.has(k)) continue;
      out[k] = toAuditJson(v);
    }
    return out;
  }
  return value;
}

const SECRET_FIELDS = new Set(["passwordHash", "pinHash", "tokenHash", "loyverseTokenEnc"]);

export type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  locationId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/**
 * Writes one audit row inside the caller's transaction, so the change and
 * its audit record commit or roll back together.
 */
export async function writeAudit(tx: Tx, entry: AuditEntry) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    userAgent = h.get("user-agent");
  } catch {
    // Outside a request (seed, cron): no headers.
  }
  await tx.auditLog.create({
    data: {
      userId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      locationId: entry.locationId ?? null,
      before: entry.before === undefined ? undefined : (toAuditJson(entry.before) as object),
      after: entry.after === undefined ? undefined : (toAuditJson(entry.after) as object),
      reason: entry.reason ?? null,
      ip,
      userAgent,
    },
  });
}

/** Only the fields that changed, for compact before/after records. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = toAuditJson(before[key]);
    const next = toAuditJson(after[key]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

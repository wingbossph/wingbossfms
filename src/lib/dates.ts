// All business dates are in Asia/Manila (UTC+8, no DST).

export const TIMEZONE = "Asia/Manila";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Oct 26, 2026" */
export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

/** "Oct 26, 2026, 3:05 PM" */
export function formatDateTime(d: Date): string {
  return dateTimeFmt.format(d);
}

/**
 * Formats a Postgres DATE column (which Prisma returns as UTC midnight)
 * without shifting it by the Manila offset.
 */
export function formatBusinessDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
}

/** The Manila calendar date of an instant, as "YYYY-MM-DD". */
export function manilaDateString(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** "YYYY-MM-DD" → Date at UTC midnight, the shape Prisma uses for @db.Date. */
export function toDbDate(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Invalid date: ${ymd}`);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Start of a Manila calendar day as a UTC instant (for timestamp range filters). */
export function manilaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000+08:00`);
}

/** End (exclusive) of a Manila calendar day as a UTC instant. */
export function manilaDayEnd(ymd: string): Date {
  return new Date(manilaDayStart(ymd).getTime() + 24 * 60 * 60 * 1000);
}

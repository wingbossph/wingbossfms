// Year/month pickers over a from–to date range (YYYY-MM-DD).

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The year and month (0 = whole year, -1 = neither) a range covers; a period still running may end today. */
export function yearMonthOf(from: string | undefined, to: string | undefined, today: string): { year: number; month: number } {
  if (!from || !to) return { year: Number(today.slice(0, 4)), month: -1 };
  const [y, m, d] = from.split("-").map(Number);
  if (d !== 1 || to.slice(0, 4) !== String(y)) return { year: y, month: -1 };
  const endOf = (end: string) => to === end || (to === today && today < end);
  if (m === 1 && endOf(`${y}-12-31`)) return { year: y, month: 0 };
  if (to.slice(5, 7) === pad(m) && endOf(`${y}-${pad(m)}-${pad(lastDay(y, m))}`)) return { year: y, month: m };
  return { year: y, month: -1 };
}

/** The range for a year (month 0) or a month, stopping at today if it hasn't ended. */
export function rangeOfYearMonth(year: number, month: number, today: string): { from: string; to: string } {
  const from = month === 0 ? `${year}-01-01` : `${year}-${pad(month)}-01`;
  const end = month === 0 ? `${year}-12-31` : `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  return { from, to: end > today ? today : end };
}

/** Selectable years: this year and the three before it. */
export const recentYears = (today: string) => Array.from({ length: 4 }, (_, i) => Number(today.slice(0, 4)) - 3 + i);

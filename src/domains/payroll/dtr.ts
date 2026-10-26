// The DTR grid: one short code per employee per day, typed from the paper
// DTR. Pure parsing and formatting, shared by the grid and the server.
//
//   P            present           A    absent           R   rest day
//   L            paid leave        LU   unpaid leave     H   holiday off
//   RW           worked on rest day
//   10:05-19:30  times in/out (late, undertime, OT and night diff computed)
// Modifiers after the status, in any order:
//   LT15 late minutes · UT30 undertime minutes · OT2 / OT1.5 OT hours
//   ND3 night-diff hours · @LAN worked at another location (location code)

export type DayStatus = "PRESENT" | "ABSENT" | "LEAVE_PAID" | "LEAVE_UNPAID" | "REST_DAY" | "HOLIDAY_OFF";

export type DtrDay = {
  status: DayStatus;
  isRestDayWork: boolean;
  timeIn: string | null;
  timeOut: string | null;
  lateMinutes: number;
  undertimeMinutes: number;
  otMinutes: number;
  nightDiffMinutes: number;
  locationCode: string | null;
};

export type Schedule = { start: string; end: string; graceMinutes: number; otMinimumMinutes: number };

const STATUS: Record<string, { status: DayStatus; rest?: boolean }> = {
  P: { status: "PRESENT" },
  A: { status: "ABSENT" },
  R: { status: "REST_DAY" },
  L: { status: "LEAVE_PAID" },
  LU: { status: "LEAVE_UNPAID" },
  H: { status: "HOLIDAY_OFF" },
  RW: { status: "PRESENT", rest: true },
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Minutes of [from, to) that fall between 22:00 and 06:00 (to may pass midnight). */
export function nightMinutes(from: number, to: number): number {
  let n = 0;
  for (let t = from; t < to; t++) {
    const m = ((t % 1440) + 1440) % 1440;
    if (m >= 22 * 60 || m < 6 * 60) n++;
  }
  return n;
}

/** Late, undertime, OT and night-diff from times in/out against the schedule. */
export function fromTimes(timeIn: string, timeOut: string, s: Schedule) {
  const tin = toMin(timeIn);
  let tout = toMin(timeOut);
  const start = toMin(s.start);
  let end = toMin(s.end);
  if (end <= start) end += 1440;
  if (tout <= tin) tout += 1440; // worked past midnight
  const lateRaw = Math.max(0, tin - start);
  const late = lateRaw > s.graceMinutes ? lateRaw : 0;
  const undertime = Math.max(0, end - tout);
  const otRaw = Math.max(0, tout - end);
  // OT counts in whole 30-minute blocks once it reaches the minimum.
  const ot = otRaw >= s.otMinimumMinutes ? Math.floor(otRaw / 30) * 30 : 0;
  return { lateMinutes: late, undertimeMinutes: undertime, otMinutes: ot, nightDiffMinutes: nightMinutes(Math.max(tin, start), Math.min(tout, end + ot)) };
}

/** Parses one grid cell. Returns null for an empty cell, or an error message. */
export function parseDtrCell(raw: string, s: Schedule): DtrDay | null | { error: string } {
  const text = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) return null;
  const day: DtrDay = { status: "PRESENT", isRestDayWork: false, timeIn: null, timeOut: null, lateMinutes: 0, undertimeMinutes: 0, otMinutes: 0, nightDiffMinutes: 0, locationCode: null };
  const parts = text.split(" ");
  let first = parts.shift()!;
  const times = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(first);
  if (times) {
    const [, tin, tout] = times;
    if (toMin(tin) >= 1440 || toMin(tout) >= 1440 || Number(tin.split(":")[1]) > 59 || Number(tout.split(":")[1]) > 59) return { error: `"${raw}": times must be like 10:05-19:30` };
    day.timeIn = fmt(toMin(tin));
    day.timeOut = fmt(toMin(tout));
    Object.assign(day, fromTimes(tin, tout, s));
  } else {
    if (first.startsWith("RW") && first !== "RW") {
      parts.unshift(first.slice(2));
      first = "RW";
    }
    const st = STATUS[first];
    if (!st) return { error: `"${raw}": start with P, A, R, L, LU, H, RW or times like 10:00-19:00` };
    day.status = st.status;
    day.isRestDayWork = !!st.rest;
  }
  for (const p of parts) {
    let m: RegExpExecArray | null;
    if ((m = /^LT(\d{1,3})$/.exec(p))) day.lateMinutes = Number(m[1]);
    else if ((m = /^UT(\d{1,3})$/.exec(p))) day.undertimeMinutes = Number(m[1]);
    else if ((m = /^OT(\d{1,2}(?:\.\d{1,2})?)$/.exec(p))) day.otMinutes = Math.round(Number(m[1]) * 60);
    else if ((m = /^ND(\d{1,2}(?:\.\d{1,2})?)$/.exec(p))) day.nightDiffMinutes = Math.round(Number(m[1]) * 60);
    else if ((m = /^@([A-Z0-9-]{2,12})$/.exec(p))) day.locationCode = m[1];
    else if (p === "RW" && day.status === "PRESENT") day.isRestDayWork = true;
    else return { error: `"${raw}": don't understand "${p}"` };
  }
  if (day.status !== "PRESENT" && (day.otMinutes || day.lateMinutes || day.undertimeMinutes || day.nightDiffMinutes)) {
    return { error: `"${raw}": late/OT only apply to days worked` };
  }
  return day;
}

/** The short code for a saved day (what the grid shows). */
export function formatDtrCell(d: Omit<DtrDay, "locationCode"> & { locationCode?: string | null }, homeCode?: string): string {
  const code = Object.entries(STATUS).find(([, v]) => v.status === d.status && !!v.rest === (d.status === "PRESENT" && d.isRestDayWork))?.[0] ?? "P";
  const parts = [d.timeIn && d.timeOut ? `${d.timeIn}-${d.timeOut}` : code];
  if (d.timeIn && d.timeOut && d.isRestDayWork) parts.push("RW");
  if (!(d.timeIn && d.timeOut)) {
    if (d.lateMinutes) parts.push(`LT${d.lateMinutes}`);
    if (d.undertimeMinutes) parts.push(`UT${d.undertimeMinutes}`);
    if (d.otMinutes) parts.push(`OT${+(d.otMinutes / 60).toFixed(2)}`);
    if (d.nightDiffMinutes) parts.push(`ND${+(d.nightDiffMinutes / 60).toFixed(2)}`);
  }
  if (d.locationCode && d.locationCode !== homeCode) parts.push(`@${d.locationCode}`);
  return parts.join(" ");
}

// Default government tables and holidays, loaded as data (editable in
// Payroll → Setup when rates change). Amounts in centavos.

export type Bracket = {
  minCents: bigint;
  maxCents: bigint | null;
  excessOverCents?: bigint;
  eeFixedCents?: bigint;
  eeRateBp?: number;
  erFixedCents?: bigint;
  erRateBp?: number;
  ecFixedCents?: bigint;
  meta?: Record<string, unknown>;
};

export type DefaultTable = { kind: "SSS" | "PHILHEALTH" | "PAGIBIG" | "WITHHOLDING_TAX"; name: string; effectiveFrom: string; basis: "MONTHLY" | "SEMI_MONTHLY"; brackets: Bracket[] };

const P = (pesos: number) => BigInt(Math.round(pesos * 100));

/**
 * SSS 2025 schedule: 15% of the monthly salary credit (MSC), employee 5% /
 * employer 10% (the part above ₱20,000 goes to the WISP/MPF fund, same
 * shares). MSC runs ₱5,000–₱35,000 in ₱500 steps; EC is ₱10 below a
 * ₱15,000 MSC and ₱30 from ₱15,000.
 */
function sss2025(): Bracket[] {
  const out: Bracket[] = [];
  for (let msc = 5000; msc <= 35000; msc += 500) {
    const min = msc === 5000 ? 0 : msc - 250;
    const max = msc === 35000 ? null : msc + 249.99;
    out.push({ minCents: P(min), maxCents: max === null ? null : P(max), eeFixedCents: P(msc * 0.05), erFixedCents: P(msc * 0.1), ecFixedCents: P(msc < 15000 ? 10 : 30), meta: { msc } });
  }
  return out;
}

export const DEFAULT_TABLES: DefaultTable[] = [
  { kind: "SSS", name: "SSS 2025 schedule (15%)", effectiveFrom: "2025-01-01", basis: "MONTHLY", brackets: sss2025() },
  {
    kind: "PHILHEALTH",
    name: "PhilHealth 2025 (5%, ₱10,000–₱100,000)",
    effectiveFrom: "2025-01-01",
    basis: "MONTHLY",
    brackets: [
      { minCents: 0n, maxCents: P(9999.99), eeFixedCents: P(250), erFixedCents: P(250) },
      { minCents: P(10000), maxCents: P(99999.99), eeRateBp: 250, erRateBp: 250 },
      { minCents: P(100000), maxCents: null, eeFixedCents: P(2500), erFixedCents: P(2500) },
    ],
  },
  {
    kind: "PAGIBIG",
    name: "Pag-IBIG 2024 (2%, max ₱10,000 base)",
    effectiveFrom: "2024-02-01",
    basis: "MONTHLY",
    brackets: [
      { minCents: 0n, maxCents: P(1500), eeRateBp: 100, erRateBp: 200 },
      { minCents: P(1500.01), maxCents: P(10000), eeRateBp: 200, erRateBp: 200 },
      { minCents: P(10000.01), maxCents: null, eeFixedCents: P(200), erFixedCents: P(200) },
    ],
  },
  {
    kind: "WITHHOLDING_TAX",
    name: "TRAIN 2023+ semi-monthly",
    effectiveFrom: "2023-01-01",
    basis: "SEMI_MONTHLY",
    brackets: [
      { minCents: 0n, maxCents: P(10417) },
      { minCents: P(10417.01), maxCents: P(16666.99), excessOverCents: P(10417), eeRateBp: 1500 },
      { minCents: P(16667), maxCents: P(33332.99), excessOverCents: P(16667), eeFixedCents: P(937.5), eeRateBp: 2000 },
      { minCents: P(33333), maxCents: P(83332.99), excessOverCents: P(33333), eeFixedCents: P(4270.7), eeRateBp: 2500 },
      { minCents: P(83333), maxCents: P(333332.99), excessOverCents: P(83333), eeFixedCents: P(16770.7), eeRateBp: 3000 },
      { minCents: P(333333), maxCents: null, excessOverCents: P(333333), eeFixedCents: P(91770.7), eeRateBp: 3500 },
    ],
  },
];

/**
 * 2026 holidays with fixed or announced dates. Islamic holidays (Eid'l Fitr,
 * Eid'l Adha) are proclaimed each year: add them in Payroll → Setup.
 */
export const DEFAULT_HOLIDAYS: { date: string; name: string; type: "REGULAR" | "SPECIAL_NON_WORKING" | "SPECIAL_WORKING"; davaoOnly?: boolean }[] = [
  { date: "2026-01-01", name: "New Year's Day", type: "REGULAR" },
  { date: "2026-02-17", name: "Chinese New Year", type: "SPECIAL_NON_WORKING" },
  { date: "2026-03-16", name: "Araw ng Dabaw", type: "SPECIAL_NON_WORKING", davaoOnly: true },
  { date: "2026-04-02", name: "Maundy Thursday", type: "REGULAR" },
  { date: "2026-04-03", name: "Good Friday", type: "REGULAR" },
  { date: "2026-04-04", name: "Black Saturday", type: "SPECIAL_NON_WORKING" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: "REGULAR" },
  { date: "2026-05-01", name: "Labor Day", type: "REGULAR" },
  { date: "2026-06-12", name: "Independence Day", type: "REGULAR" },
  { date: "2026-08-21", name: "Ninoy Aquino Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-08-31", name: "National Heroes Day", type: "REGULAR" },
  { date: "2026-11-01", name: "All Saints' Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-11-30", name: "Bonifacio Day", type: "REGULAR" },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception", type: "SPECIAL_NON_WORKING" },
  { date: "2026-12-24", name: "Christmas Eve", type: "SPECIAL_NON_WORKING" },
  { date: "2026-12-25", name: "Christmas Day", type: "REGULAR" },
  { date: "2026-12-30", name: "Rizal Day", type: "REGULAR" },
  { date: "2026-12-31", name: "Last day of the year", type: "SPECIAL_NON_WORKING" },
];

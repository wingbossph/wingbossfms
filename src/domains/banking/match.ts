// Auto-matching of statement lines to book (GL) lines and to expected
// channel settlements. Pure: the service loads candidates and saves results.

export type StmtLine = { id: string; date: string; amountCents: bigint; description: string; reference: string | null };
/** amountCents: debit − credit on the money account (+ money in). */
export type BookLine = { id: string; date: string; amountCents: bigint; text: string };
export type Proposal = { statementLineIds: string[]; journalLineIds: string[]; score: number };

export type SettlementCand = { id: string; channelId: string; institution: string | null; expectedOn: string; businessDate: string; grossCents: bigint; expectedNetCents: bigint };
export type SettlementProposal = { statementLineId: string; settlementIds: string[]; score: number; differenceCents: bigint };

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n);
const abs = (x: bigint) => (x < 0n ? -x : x);

function tokens(s: string) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && /\d/.test(t)));
}

/** Does a reference number on one side appear on the other? */
export function referenceHit(s: StmtLine, b: BookLine): boolean {
  const bookTokens = tokens(b.text);
  for (const t of tokens(`${s.reference ?? ""} ${s.description}`)) if (bookTokens.has(t)) return true;
  return false;
}

export function pairScore(s: StmtLine, b: BookLine): number {
  const d = Math.abs(daysBetween(b.date, s.date));
  return 60 + ([25, 20, 12, 5][d] ?? 0) + (referenceHit(s, b) ? 15 : 0);
}

/**
 * Proposes matches: (1) one-to-one on exact amount within ±windowDays, best
 * score first (closer date, shared reference); (2) several statement lines on
 * one day that add up to one book line (e.g. GCash receipts vs the day's
 * sales); (3) several book lines on one day that add up to one statement line
 * (e.g. both branches' cash in one deposit).
 */
export function autoMatch(stmt: readonly StmtLine[], book: readonly BookLine[], windowDays = 3): Proposal[] {
  const out: Proposal[] = [];
  const usedS = new Set<string>();
  const usedB = new Set<string>();

  const pairs: { s: StmtLine; b: BookLine; score: number; d: number }[] = [];
  const byAmount = new Map<bigint, BookLine[]>();
  for (const b of book) byAmount.set(b.amountCents, [...(byAmount.get(b.amountCents) ?? []), b]);
  for (const s of stmt) {
    for (const b of byAmount.get(s.amountCents) ?? []) {
      const d = Math.abs(daysBetween(b.date, s.date));
      if (d <= windowDays) pairs.push({ s, b, score: pairScore(s, b), d });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.d - y.d || x.s.date.localeCompare(y.s.date));
  for (const p of pairs) {
    if (usedS.has(p.s.id) || usedB.has(p.b.id)) continue;
    usedS.add(p.s.id);
    usedB.add(p.b.id);
    out.push({ statementLineIds: [p.s.id], journalLineIds: [p.b.id], score: p.score });
  }

  // Many statement lines → one book line (same sign, same day or the next).
  for (const b of book) {
    if (usedB.has(b.id)) continue;
    for (const lag of [0, 1]) {
      const group = stmt.filter((s) => !usedS.has(s.id) && s.date === addDays(b.date, lag) && s.amountCents > 0n === b.amountCents > 0n);
      if (group.length > 1 && sum(group.map((s) => s.amountCents)) === b.amountCents) {
        group.forEach((s) => usedS.add(s.id));
        usedB.add(b.id);
        out.push({ statementLineIds: group.map((s) => s.id), journalLineIds: [b.id], score: 70 - lag * 5 });
        break;
      }
    }
  }

  // Many book lines on one day → one statement line.
  for (const s of stmt) {
    if (usedS.has(s.id)) continue;
    for (let back = 0; back <= windowDays; back++) {
      const day = addDays(s.date, -back);
      const group = book.filter((b) => !usedB.has(b.id) && b.date === day && b.amountCents > 0n === s.amountCents > 0n);
      if (group.length > 1 && sum(group.map((b) => b.amountCents)) === s.amountCents) {
        group.forEach((b) => usedB.add(b.id));
        usedS.add(s.id);
        out.push({ statementLineIds: [s.id], journalLineIds: group.map((b) => b.id), score: 65 - back * 5 });
        break;
      }
    }
  }
  return out;
}

/**
 * Matches money-in statement lines to expected payouts from deferred
 * channels (Maya, Grab). A payout may cover one sale day, one channel's
 * expected day, or all of an institution's channels expected that day.
 * Accepts it when the amount is within `toleranceBp` of gross (the real MDR
 * usually differs a little from the configured rate).
 */
export function matchSettlements(stmt: readonly StmtLine[], cands: readonly SettlementCand[], toleranceBp = 100): SettlementProposal[] {
  const out: SettlementProposal[] = [];
  const used = new Set<string>();
  const inflows = [...stmt].filter((s) => s.amountCents > 0n).sort((a, b) => a.date.localeCompare(b.date));
  for (const s of inflows) {
    const open = cands.filter((c) => !used.has(c.id) && daysBetween(c.expectedOn, s.date) >= -2 && daysBetween(c.expectedOn, s.date) <= 5);
    if (!open.length) continue;
    const groups = new Map<string, SettlementCand[]>();
    const add = (k: string, c: SettlementCand) => groups.set(k, [...(groups.get(k) ?? []), c]);
    for (const c of open) {
      add(`one|${c.id}`, c);
      add(`chan-exp|${c.channelId}|${c.expectedOn}`, c);
      add(`chan-biz|${c.channelId}|${c.businessDate}`, c);
      add(`inst-exp|${c.institution ?? c.channelId}|${c.expectedOn}`, c);
      add(`inst-biz|${c.institution ?? c.channelId}|${c.businessDate}`, c);
    }
    const desc = s.description.toLowerCase();
    let best: SettlementProposal | null = null;
    let bestRank = -Infinity;
    for (const g of groups.values()) {
      const net = sum(g.map((c) => c.expectedNetCents));
      const gross = sum(g.map((c) => c.grossCents));
      const diff = s.amountCents - net;
      const tol = (gross * BigInt(toleranceBp)) / 10_000n;
      if (abs(diff) > (tol > 100n ? tol : 100n)) continue;
      const inst = g[0].institution?.toLowerCase();
      const named = inst ? desc.includes(inst) || (inst === "maya" && desc.includes("paymaya")) : false;
      const score = Math.max(50, (diff === 0n ? 95 : 85) - Math.abs(daysBetween(g[0].expectedOn, s.date)) * 3 + (named ? 5 : 0));
      // Rank: closest amount first, then the description naming the provider, then the date.
      const rank = -Number(abs(diff)) * 10 + (named ? 5 : 0) - Math.abs(daysBetween(g[0].expectedOn, s.date));
      if (rank > bestRank) {
        bestRank = rank;
        best = { statementLineId: s.id, settlementIds: g.map((c) => c.id), score: Math.min(score, 100), differenceCents: diff };
      }
    }
    if (best) {
      best.settlementIds.forEach((id) => used.add(id));
      out.push(best);
    }
  }
  return out;
}

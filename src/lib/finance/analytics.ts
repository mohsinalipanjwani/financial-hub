// Advanced analytics — pure functions on already-converted amounts/dates.
// Used by client detail and reporting. No Prisma, no I/O.

import { round2 } from "./calculations";

/** Collection rate = received / revenue as a percentage. 0 when revenue is 0. */
export function collectionRate(received: number, revenue: number): number {
  if (revenue === 0) return 0;
  return round2((received / revenue) * 100);
}

/** Whole days between two dates (b - a), or null if either is missing. */
export function daysBetween(a: Date | null | undefined, b: Date | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Average collection lag: mean days from expected date to received date across
 * settled items. Negative means paid early. Returns null when no settled items
 * have both dates.
 */
export function averageDaysToPay(
  items: { expectedDate: Date | null; receivedDate: Date | null }[],
): number | null {
  const lags: number[] = [];
  for (const it of items) {
    const d = daysBetween(it.expectedDate, it.receivedDate);
    if (d != null) lags.push(d);
  }
  if (lags.length === 0) return null;
  return round2(lags.reduce((s, d) => s + d, 0) / lags.length);
}

export interface AgingBuckets {
  current: number; // not yet due (expected in the future or no date)
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
}

/**
 * Bucket outstanding (pending) amounts by how overdue they are relative to
 * `asOf`, based on each item's expected date.
 */
export function agingBuckets(
  items: { pending: number; expectedDate: Date | null }[],
  asOf: Date = new Date(),
): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const it of items) {
    if (it.pending <= 0) continue;
    const overdue = it.expectedDate ? daysBetween(it.expectedDate, asOf) ?? -1 : -1;
    if (overdue <= 0) b.current += it.pending;
    else if (overdue <= 30) b.d1_30 += it.pending;
    else if (overdue <= 60) b.d31_60 += it.pending;
    else if (overdue <= 90) b.d61_90 += it.pending;
    else b.d90plus += it.pending;
  }
  (Object.keys(b) as (keyof AgingBuckets)[]).forEach((k) => (b[k] = round2(b[k])));
  return b;
}

/**
 * Month-over-month growth of the last point vs the previous, as a percentage.
 * Returns null when there are fewer than 2 points or the previous is 0.
 */
export function momGrowth(series: number[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  if (prev === 0) return null;
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

/**
 * Compound-ish average monthly growth across a series (mean of successive
 * period-over-period changes), ignoring transitions from zero. Null if <2 valid.
 */
export function averageMonthlyGrowth(series: number[]): number | null {
  const changes: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    if (prev === 0) continue;
    changes.push(((series[i] - prev) / Math.abs(prev)) * 100);
  }
  if (changes.length === 0) return null;
  return round2(changes.reduce((s, c) => s + c, 0) / changes.length);
}
